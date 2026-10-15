import Anthropic from '@anthropic-ai/sdk';

/**
 * LLM provider abstraction. The agent works with a neutral message format:
 *   { role: 'user', text }
 *   { role: 'assistant', text, toolCalls: [{ id, name, input }], raw: { provider, content } }
 *   { role: 'tool', results: [{ toolCallId, name, content, isError }] }
 * Providers translate it to their wire format. Assistant turns keep the provider's raw content
 * (including thinking blocks) so history is replayed append-only and unmodified.
 *
 * chat() returns { stopReason: 'tool_use'|'end'|'refusal'|'max_tokens'|'other', text, toolCalls, raw, usage, model }.
 */

export class LlmError extends Error {
  constructor(code, message, { retryable = false } = {}) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

export function createLlmProvider(config, { fetch: fetchImpl } = {}) {
  const c = config.llm;
  if (c.provider === 'anthropic') {
    if (!c.apiKey) return unavailableProvider('anthropic', 'ANTHROPIC_API_KEY is not set');
    return createAnthropicProvider(c, fetchImpl);
  }
  if (c.provider === 'openai-compatible') return createOpenAiCompatibleProvider(c, fetchImpl);
  return unavailableProvider('none', 'No LLM provider configured (set ANTHROPIC_API_KEY, or LLM_PROVIDER=openai-compatible with LLM_BASE_URL and LLM_MODEL)');
}

function unavailableProvider(name, reason) {
  return {
    name,
    model: null,
    available: false,
    reason,
    async chat() {
      throw new LlmError('LLM_UNAVAILABLE', reason);
    },
  };
}

function malformedResponse() {
  return new LlmError('LLM_MALFORMED_RESPONSE', 'The LLM returned an invalid response; no tools were run.');
}

function validateToolCalls(calls) {
  const ids = new Set();
  for (const call of calls) {
    if (!call || typeof call.id !== 'string' || !call.id || ids.has(call.id) ||
        typeof call.name !== 'string' || !call.name || !call.input ||
        typeof call.input !== 'object' || Array.isArray(call.input)) throw malformedResponse();
    ids.add(call.id);
  }
  return calls;
}

/** Merge consecutive same-role items so user tool results and a following user message share one turn. */
function mergeConsecutive(messages) {
  const out = [];
  for (const m of messages) {
    const last = out[out.length - 1];
    if (last && last.role === m.role && Array.isArray(last.content) && Array.isArray(m.content)) last.content.push(...m.content);
    else out.push(m);
  }
  return out;
}

function createAnthropicProvider(c, fetchImpl) {
  const client = new Anthropic({ apiKey: c.apiKey, timeout: c.timeoutMs, maxRetries: 2, ...(fetchImpl ? { fetch: fetchImpl } : {}) });

  function toWire(messages) {
    return mergeConsecutive(
      messages.map((m) => {
        if (m.role === 'user') return { role: 'user', content: [{ type: 'text', text: m.text }] };
        if (m.role === 'tool') {
          return {
            role: 'user',
            content: m.results.map((r) => ({ type: 'tool_result', tool_use_id: r.toolCallId, content: r.content, ...(r.isError ? { is_error: true } : {}) })),
          };
        }
        if (m.raw?.provider === 'anthropic') return { role: 'assistant', content: m.raw.content };
        const content = [];
        if (m.text) content.push({ type: 'text', text: m.text });
        for (const t of m.toolCalls || []) content.push({ type: 'tool_use', id: t.id, name: t.name, input: t.input });
        return { role: 'assistant', content };
      }),
    );
  }

  return {
    name: 'anthropic',
    model: c.model,
    available: true,
    reason: null,
    async chat({ system, messages, tools }) {
      let response;
      try {
        response = await client.beta.messages.create({
          model: c.model,
          max_tokens: 16000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort: 'medium' },
          system,
          tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema, strict: true })),
          messages: toWire(messages),
        });
      } catch (err) {
        if (err instanceof Anthropic.APIConnectionTimeoutError) throw new LlmError('LLM_TIMEOUT', 'Anthropic request timed out', { retryable: true });
        if (err instanceof Anthropic.AuthenticationError) throw new LlmError('LLM_AUTH', 'Anthropic API key was rejected');
        if (err instanceof Anthropic.RateLimitError) throw new LlmError('LLM_RATE_LIMITED', 'Anthropic API rate limit reached', { retryable: true });
        if (err instanceof Anthropic.BadRequestError) throw new LlmError('LLM_BAD_REQUEST', 'Anthropic rejected the request');
        if (err instanceof Anthropic.APIError) throw new LlmError('LLM_ERROR', `Anthropic API error HTTP ${err.status ?? 'unknown'}`, { retryable: (err.status ?? 500) >= 500 });
        throw new LlmError('LLM_UNREACHABLE', 'Anthropic API unreachable', { retryable: true });
      }
      if (!Array.isArray(response?.content) || response.content.some((b) => !b || typeof b.type !== 'string' || (b.type === 'text' && typeof b.text !== 'string'))) throw malformedResponse();
      const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      const toolCalls = validateToolCalls(response.content.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name, input: b.input })));
      const stop = response.stop_reason;
      if (!['tool_use', 'end_turn', 'stop_sequence', 'refusal', 'max_tokens'].includes(stop) || (stop === 'tool_use' && !toolCalls.length)) throw malformedResponse();
      return {
        stopReason: stop === 'tool_use' ? 'tool_use' : stop === 'end_turn' || stop === 'stop_sequence' ? 'end' : stop === 'refusal' ? 'refusal' : stop === 'max_tokens' ? 'max_tokens' : 'other',
        rawStopReason: stop,
        text,
        toolCalls,
        raw: { provider: 'anthropic', content: response.content },
        usage: response.usage ? { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens } : null,
        model: response.model,
      };
    },
  };
}

/** Any OpenAI-compatible /chat/completions endpoint (e.g. a local Ollama or vLLM server). */
function createOpenAiCompatibleProvider(c, fetchImpl = fetch) {
  const url = `${c.baseUrl.replace(/\/$/, '')}/chat/completions`;

  function toWire(system, messages) {
    const out = [{ role: 'system', content: system }];
    for (const m of messages) {
      if (m.role === 'user') out.push({ role: 'user', content: m.text });
      else if (m.role === 'tool') for (const r of m.results) out.push({ role: 'tool', tool_call_id: r.toolCallId, content: r.content });
      else {
        out.push({
          role: 'assistant',
          content: m.text || '',
          ...(m.toolCalls?.length ? { tool_calls: m.toolCalls.map((t) => ({ id: t.id, type: 'function', function: { name: t.name, arguments: JSON.stringify(t.input) } })) } : {}),
        });
      }
    }
    return out;
  }

  return {
    name: 'openai-compatible',
    model: c.model,
    available: true,
    reason: null,
    async chat({ system, messages, tools }) {
      let res;
      try {
        res = await fetchImpl(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {}) },
          body: JSON.stringify({
            model: c.model,
            messages: toWire(system, messages),
            tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } })),
            tool_choice: 'auto',
          }),
          signal: AbortSignal.timeout(c.timeoutMs),
        });
      } catch (err) {
        if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new LlmError('LLM_TIMEOUT', 'LLM request timed out', { retryable: true });
        throw new LlmError('LLM_UNREACHABLE', 'LLM endpoint unreachable', { retryable: true });
      }
      if (!res.ok) {
        const code = res.status === 401 || res.status === 403 ? 'LLM_AUTH' : res.status === 429 ? 'LLM_RATE_LIMITED' : 'LLM_ERROR';
        throw new LlmError(code, `LLM endpoint error HTTP ${res.status}`, { retryable: res.status === 429 || res.status >= 500 });
      }
      const body = await res.json().catch(() => null);
      if (!Array.isArray(body?.choices) || body.choices.length !== 1) throw malformedResponse();
      const choice = body.choices[0];
      if (!choice?.message || (choice.message.content != null && typeof choice.message.content !== 'string') ||
          (choice.message.tool_calls != null && !Array.isArray(choice.message.tool_calls))) throw malformedResponse();
      const toolCalls = [];
      for (const tc of choice.message?.tool_calls || []) {
        if (!tc?.function || tc.type !== 'function') throw malformedResponse();
        let input;
        try {
          input = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments;
        } catch {
          throw malformedResponse();
        }
        toolCalls.push({ id: tc.id, name: tc.function.name, input });
      }
      validateToolCalls(toolCalls);
      const fr = choice.finish_reason;
      if (!['stop', 'tool_calls', 'length', 'content_filter'].includes(fr) || (fr === 'tool_calls' && !toolCalls.length) ||
          (fr === 'stop' && toolCalls.length)) throw malformedResponse();
      return {
        stopReason: fr === 'length' ? 'max_tokens' : fr === 'content_filter' || choice.message.refusal ? 'refusal' : fr === 'tool_calls' ? 'tool_use' : 'end',
        rawStopReason: fr,
        text: (choice.message?.content || '').trim(),
        toolCalls,
        raw: null,
        usage: body.usage || null,
        model: body.model || c.model,
      };
    },
  };
}
