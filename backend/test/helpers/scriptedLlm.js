/**
 * Test double for the LLM provider: replays a scripted list of model responses and records every
 * request. It lets tests verify everything AROUND the model (tool validation, policy, approval,
 * memory, failure handling) deterministically. It says nothing about real model quality; that is
 * only measurable with a configured provider (see agent.live.test.js).
 */
export function scriptedProvider(script, { name = 'scripted', model = 'scripted-test-model' } = {}) {
  const requests = [];
  let i = 0;
  return {
    name,
    model,
    available: true,
    reason: null,
    requests,
    remaining: () => script.length - i,
    async chat(req) {
      requests.push(JSON.parse(JSON.stringify(req)));
      if (i >= script.length) throw new Error('scripted provider ran out of responses');
      const step = script[i++];
      const r = typeof step === 'function' ? step(req) : step;
      const toolCalls = (r.toolCalls || []).map((t, k) => ({ id: t.id || `call_${i}_${k}`, name: t.name, input: t.input }));
      return {
        stopReason: r.stopReason || (toolCalls.length ? 'tool_use' : 'end'),
        rawStopReason: r.stopReason || null,
        text: r.text || '',
        toolCalls,
        raw: { provider: name, content: { scripted: i } },
        usage: { input_tokens: 100, output_tokens: 20 },
        model,
      };
    },
  };
}

export const call = (name, input) => ({ name, input });
