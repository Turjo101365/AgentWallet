import { evaluatePolicy } from './policyService.js';
import { reservedWei } from './reservations.js';
import { serializeSnapshot } from './chainService.js';

/**
 * Single entry point for transfer risk assessment. Proposal creation, owner approval, task grant
 * approval and executor pre-flight all call this, so every path runs the same checks on the same
 * kind of fresh, block-pinned state. Nothing here accepts client- or LLM-supplied state.
 */
export function createRiskEngine({ chain, repos, agentControl, policySettings, prices }) {
  async function usdContext(snapshot, token, amountWei, excludeId, settings) {
    if (!settings.dailyUsdLimit) return null;
    const priceMap = await prices.prices(snapshot.blockNumber);
    let spent = 0;
    let reserved = 0;
    for (const t of snapshot.tokens) {
      const p = priceMap[t.address];
      const committed = await reservedWei({ repos, chain }, t.address, excludeId, snapshot.blockNumber);
      if (t.spentToday > 0n || committed > 0n || t.address === token.address) {
        if (!p?.available) return { available: false, reason: `${t.symbol}: ${p?.reason || 'no price'}` };
        if (p.stale) return { available: false, reason: `${t.symbol} price is stale (${p.ageSeconds}s old)` };
      }
      if (t.spentToday > 0n) spent += Number(prices.valueUsd(t.spentToday, t, p));
      if (committed > 0n) reserved += Number(prices.valueUsd(committed, t, p));
    }
    const p = priceMap[token.address];
    return {
      available: true,
      spentTodayUsd: spent.toFixed(2),
      reservedUsd: reserved.toFixed(2),
      amountUsd: prices.valueUsd(amountWei, token, p),
      source: p.source,
    };
  }

  /** @returns {{ policy, snapshot }} */
  async function assessTransfer({ tokenAddress, recipient, amountWei, excludeId = null, source = 'MANUAL' }) {
    const snapshot = await chain.getSnapshot();
    const token = snapshot.tokens.find((t) => t.address.toLowerCase() === tokenAddress.toLowerCase());
    const [recipientAllowed, reserved, agentPaused, settings, code, automation] = await Promise.all([
      chain.isRecipientAllowed(recipient, snapshot.blockNumber),
      token ? reservedWei({ repos, chain }, token.address, excludeId, snapshot.blockNumber) : 0n,
      agentControl.isPaused(),
      policySettings.get(),
      chain.provider.getCode(recipient, snapshot.blockNumber),
      policySettings.automationState(),
    ]);
    const usd = token ? await usdContext(snapshot, token, BigInt(amountWei), excludeId, settings) : null;
    const policy = evaluatePolicy(
      { tokenAddress, recipient, amountWei: BigInt(amountWei) },
      snapshot,
      {
        agentPaused,
        recipientAllowed,
        reservedWei: reserved,
        recipientIsContract: Boolean(code && code !== '0x'),
        policySettings: settings,
        usd,
        config: chain.config,
      },
    );
    if (source === 'TASK') {
      const ok = !automation.paused;
      policy.checks.unshift({ id: 'AUTOMATION_ACTIVE', passed: ok, message: ok ? 'Automated payments are enabled' : `Automated payments are paused${automation.reason ? `: ${automation.reason}` : ''}` });
      if (!ok) {
        policy.passed = false;
        policy.violations.unshift({ id: 'AUTOMATION_ACTIVE', message: 'Automated payments are paused' });
      }
    }
    policy.snapshot = serializeSnapshot({ blockNumber: snapshot.blockNumber, paused: snapshot.paused, agent: snapshot.agent, day: snapshot.day });
    return { policy, snapshot, settings };
  }

  return { assessTransfer };
}
