import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createLlmProvider } from '../src/llm/providers.js';

const request = { system: 'test', messages: [{ role: 'user', text: 'check balance' }], tools: [] };
const tool = { id: 'call_1', type: 'function', function: { name: 'pause_automation', arguments: '{"reason":"test"}' } };
const response = (finish_reason = 'tool_calls', message = { content: null, tool_calls: [tool] }) =>
  ({ model: 'test-model', choices: [{ finish_reason, message }] });
const provider = (fetchImpl) => createLlmProvider({ llm: { provider: 'openai-compatible', model: 'test-model', baseUrl: 'http://localhost:1/v1', timeoutMs: 20 } }, { fetch: fetchImpl });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('OpenAI-compatible provider response safety (injected transport, not a live model)', () => {
  test('valid tools are normalized and tool results replay with matching ids', async () => {
    let sent;
    const p = provider(async (_url, init) => { sent = JSON.parse(init.body); return json(response()); });
    const out = await p.chat({ ...request, messages: [...request.messages, { role: 'assistant', text: '', toolCalls: [{ id: 'prior', name: 'get_portfolio', input: {} }] }, { role: 'tool', results: [{ toolCallId: 'prior', content: '{}' }] }] });
    assert.equal(out.stopReason, 'tool_use');
    assert.deepEqual(out.toolCalls, [{ id: 'call_1', name: 'pause_automation', input: { reason: 'test' } }]);
    assert.equal(sent.messages.at(-1).tool_call_id, 'prior');
  });

  test('truncation and refusal take precedence over tool calls', async () => {
    for (const [finish, expected] of [['length', 'max_tokens'], ['content_filter', 'refusal']]) {
      assert.equal((await provider(async () => json(response(finish))).chat(request)).stopReason, expected);
    }
    assert.equal((await provider(async () => json(response('tool_calls', { content: null, refusal: 'No', tool_calls: [tool] }))).chat(request)).stopReason, 'refusal');
  });

  test('malformed, duplicate and contradictory tool responses fail closed', async () => {
    const cases = [
      {}, { choices: [] }, response('stop'), response('unknown'),
      response('tool_calls', { content: {}, tool_calls: [] }),
      response('tool_calls', { tool_calls: [tool, tool] }),
      response('tool_calls', { tool_calls: [{ ...tool, function: { ...tool.function, arguments: '{bad' } }] }),
      response('tool_calls', { tool_calls: [{ ...tool, id: null }] }),
      response('tool_calls', { tool_calls: [{ ...tool, function: { ...tool.function, arguments: '[]' } }] }),
      response('tool_calls', { tool_calls: [] }),
    ];
    for (const body of cases) {
      await assert.rejects(provider(async () => json(body)).chat(request), { code: 'LLM_MALFORMED_RESPONSE' });
    }
  });

  test('HTTP errors are classified without exposing provider response bodies', async () => {
    for (const [status, code, retryable] of [[401, 'LLM_AUTH', false], [429, 'LLM_RATE_LIMITED', true], [503, 'LLM_ERROR', true]]) {
      await assert.rejects(provider(async () => json({ secret: 'never-log-this' }, status)).chat(request), (e) => {
        assert.equal(e.code, code);
        assert.equal(e.retryable, retryable);
        assert.ok(!e.message.includes('never-log-this'));
        return true;
      });
    }
  });

  test('timeout is bounded and a later request can recover', async () => {
    let count = 0;
    const p = provider(async (_url, { signal }) => {
      if (++count > 1) return json(response('stop', { content: 'Recovered' }));
      return new Promise((_resolve, reject) => {
        // Keep the test loop alive while AbortSignal.timeout's unref timer fires.
        const keepAlive = setTimeout(() => reject(new Error('timeout did not abort')), 500);
        signal.addEventListener('abort', () => { clearTimeout(keepAlive); reject(signal.reason); }, { once: true });
      });
    });
    await assert.rejects(p.chat(request), { code: 'LLM_TIMEOUT', retryable: true });
    assert.equal((await p.chat(request)).text, 'Recovered');
  });

  test('invalid JSON is a malformed response, and transport errors do not expose credentials', async () => {
    await assert.rejects(provider(async () => new Response('not json')).chat(request), { code: 'LLM_MALFORMED_RESPONSE' });
    await assert.rejects(provider(async () => { throw new Error('https://user:secret@example.invalid'); }).chat(request), (e) => e.code === 'LLM_UNREACHABLE' && !e.message.includes('secret'));
  });
});
