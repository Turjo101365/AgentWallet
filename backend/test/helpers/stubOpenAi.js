import http from 'node:http';

/**
 * Test-only OpenAI-compatible /chat/completions server. It plays a well-behaved model for two
 * instructions, "Send <x> ETH to my approved recipient "<label>"" and "Schedule a one-time payment
 * of <x> ETH to … at <ISO time> …", by calling list_recipients, then record_plan plus the action tool,
 * then replying. The backend reaches it through its real openai-compatible provider, so tool schemas,
 * validation, the allowlist check, persistence and the evidence log are all exercised. It says nothing
 * about real model quality (see test/live/).
 */
export function startStubOpenAi() {
  let n = 0;
  const call = (name, args) => ({ id: `call_${++n}`, type: 'function', function: { name, arguments: JSON.stringify(args) } });
  const reply = (message, finish) => ({ id: `stub-${n}`, object: 'chat.completion', model: 'stub-model', choices: [{ index: 0, message: { role: 'assistant', ...message }, finish_reason: finish }], usage: { prompt_tokens: 10, completion_tokens: 5 } });

  function respond(messages) {
    const user = [...messages].reverse().find((m) => m.role === 'user')?.content || ''; // latest instruction
    const amount = /(\d+(?:\.\d+)?) ETH/.exec(user)?.[1];
    const label = /recipient "([^"]+)"/.exec(user)?.[1];
    const last = messages.at(-1);
    if (last.role === 'user') return reply({ content: null, tool_calls: [call('list_recipients', {})] }, 'tool_calls');
    const assistant = [...messages].reverse().find((m) => m.role === 'assistant');
    const names = (assistant.tool_calls || []).map((t) => t.function.name);
    if (names.includes('list_recipients')) {
      const list = JSON.parse(messages.find((m) => m.role === 'tool' && m.tool_call_id === assistant.tool_calls[0].id).content);
      const recipient = list.find((r) => r.label === label)?.address;
      if (!recipient) return reply({ content: `Which recipient is "${label}"?`, tool_calls: undefined }, 'stop');
      if (/^Schedule/i.test(user.split('\n').pop())) {
        const at = /at (\S+Z)/.exec(user)[1];
        return reply({ content: null, tool_calls: [
          call('record_plan', { goal: 'Schedule a one-time payment', steps: [{ description: 'Create the one-time task', tool: 'schedule_payment' }] }),
          call('schedule_payment', { token: 'ETH', recipient, amount, title: 'Evidence scheduled payment', schedule_type: 'once', at_iso: at, start_iso: null, every_seconds: null, weekday: null, hour_utc: null, minute_utc: null, max_runs: 1, max_total: null, valid_days: 1, execution_window_minutes: 0, use_rl_timing: false, condition_gas_below_gwei: null }),
        ] }, 'tool_calls');
      }
      return reply({ content: null, tool_calls: [
        call('record_plan', { goal: 'Pay the approved recipient', steps: [{ description: 'Create the transfer proposal', tool: 'propose_transfer' }] }),
        call('propose_transfer', { token: 'ETH', recipient, amount, memo: 'Proposed by the AI agent' }),
      ] }, 'tool_calls');
    }
    const result = messages.filter((m) => m.role === 'tool').at(-1)?.content || '';
    if (/POLICY_REJECTED/.test(result)) return reply({ content: 'The policy engine rejected this transfer (it exceeds the per-transaction cap), so nothing will be sent.' }, 'stop');
    return reply({ content: names.includes('schedule_payment') ? 'The payment is scheduled and waits for your signed grant.' : 'The proposal is ready and waits for your approval.' }, 'stop');
  }

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const out = respond(JSON.parse(body).messages);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(out));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    llmEnv: { LLM_PROVIDER: 'openai-compatible', LLM_BASE_URL: `http://127.0.0.1:${server.address().port}/v1`, LLM_MODEL: 'stub-model', LLM_API_KEY: '' },
    close: () => new Promise((r) => server.close(r)),
  })));
}
