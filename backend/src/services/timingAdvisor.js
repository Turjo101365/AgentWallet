/**
 * Gas-aware execution timing advice from the RL service, using gas samples the backend recorded
 * from the chain. The advisor can only DEFER a run inside its authorized window; the deadline is
 * enforced deterministically by the scheduler, and policy checks run regardless of the advice.
 */
export function createTimingAdvisor({ config, repos, rl }) {
  async function advise({ deadlineAt, windowSeconds, now = Math.floor(Date.now() / 1000), agentType = config.scheduler.timingAgent }) {
    const interval = config.scheduler.gasSampleSeconds;
    const stepsRemaining = Math.max(0, Math.floor((deadlineAt - now) / interval));
    const windowSteps = Math.max(1, Math.floor(windowSeconds / interval));
    const samples = await repos.market.recentGas(config.chainId, 64);
    const base = { agentType, stepsRemaining, windowSteps, samples: samples.length, at: now };
    if (stepsRemaining <= 0) return { ...base, status: 'deadline', advice: 'EXECUTE_NOW', deferred: false, reason: 'execution window ends now; deadline is enforced without the model' };
    if (samples.length < 2) return { ...base, status: 'insufficient_data', advice: null, deferred: false, reason: 'fewer than 2 gas samples recorded; executing without timing advice' };
    let result;
    try {
      result = await rl.timing({
        gas_history: samples.map((s) => Number(s.gasPriceWei)).map((g) => (g > 0 ? g : 1)),
        steps_remaining: stepsRemaining,
        window_steps: windowSteps,
        hour_of_day: (new Date(now * 1000).getUTCHours() + new Date(now * 1000).getUTCMinutes() / 60) % 24,
        agent_type: agentType,
      });
    } catch (err) {
      return { ...base, status: 'unavailable', advice: null, deferred: false, reason: `RL service unavailable (${err.message}); executing without timing advice` };
    }
    if (result.status !== 'ok') {
      return { ...base, status: 'unavailable', advice: null, deferred: false, modelVersion: null, reason: `${agentType} policy unavailable (${result.reason}); executing without timing advice` };
    }
    const deferred = result.advice === 'WAIT';
    return {
      ...base,
      status: 'ok',
      advice: result.advice,
      deferred,
      modelVersion: result.modelVersion,
      actionProbabilities: result.actionProbabilities || null,
      qValues: result.qValues || null,
      observation: result.observation,
      reason: deferred ? `${result.agentType} ${result.modelVersion} advised waiting for a lower fee (${stepsRemaining} of ${windowSteps} steps left)` : `${result.agentType} ${result.modelVersion} advised executing now`,
    };
  }

  return { advise };
}
