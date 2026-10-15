import { z } from 'zod';
import { unavailable } from '../lib/errors.js';

const timingResponse = z.object({
  agentType: z.enum(['PPO', 'DQN']),
  status: z.enum(['ok', 'unavailable']),
  advice: z.enum(['WAIT', 'EXECUTE_NOW']).nullable(),
  modelVersion: z.string().nullable(),
  reason: z.string().nullable().optional(),
  observation: z.array(z.number()).length(8),
  actionProbabilities: z.array(z.number()).length(2).nullable().optional(),
  qValues: z.array(z.number()).length(2).nullable().optional(),
});

/**
 * Client for the RL execution-timing service. Transport and schema failures surface as
 * RL_UNAVAILABLE; a policy without a trained checkpoint is reported as status 'unavailable'.
 * The backend never fabricates advice in either case.
 */
export function createRlClient(config) {
  const base = config.rlServiceUrl;

  async function call(path, { method = 'GET', body, timeoutMs = config.rlTimeoutMs } = {}) {
    let res;
    try {
      res = await fetch(`${base}${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw unavailable('RL_UNAVAILABLE', `RL engine unreachable at ${base}: ${err.name === 'TimeoutError' ? 'timeout' : err.message}`);
    }
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw unavailable('RL_UNAVAILABLE', `RL engine returned non-JSON (HTTP ${res.status})`);
    }
    if (!res.ok) throw unavailable('RL_UNAVAILABLE', `RL engine error HTTP ${res.status}: ${typeof data?.detail === 'string' ? data.detail : 'request rejected'}`);
    return data;
  }

  return {
    async health() {
      try {
        return await call('/health');
      } catch (err) {
        return { status: 'unavailable', error: err.message };
      }
    },
    models: () => call('/models'),
    reload: () => call('/models/reload', { method: 'POST' }),
    select: (agentType) => call(`/models/select?agent_type=${encodeURIComponent(agentType)}`, { method: 'POST' }),
    evaluate: (episodes) => call('/evaluate', { method: 'POST', body: { episodes }, timeoutMs: Math.max(config.rlTimeoutMs, 120000) }),
    async timing(request) {
      const data = await call('/timing', { method: 'POST', body: request });
      const parsed = timingResponse.safeParse(data);
      if (!parsed.success) throw unavailable('RL_UNAVAILABLE', `RL timing response failed schema validation: ${parsed.error.issues[0]?.message}`);
      return parsed.data;
    },
  };
}
