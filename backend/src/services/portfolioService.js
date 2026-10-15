import { ethers } from 'ethers';
import { formatAmount } from '../lib/units.js';
import { nextOccurrence, firstOccurrence } from '../lib/schedule.js';
import { nowSeconds } from '../lib/time.js';
import { badRequest } from '../lib/errors.js';

const TARGETS_KEY = 'portfolio.targets';
const CATEGORY_BY_EVENT = {
  TransferExecuted: 'AGENT_TRANSFER',
  Deposited: 'DEPOSIT',
  Withdrawn: 'OWNER_WITHDRAWAL',
  EmergencyWithdrawal: 'EMERGENCY_WITHDRAWAL',
};

/**
 * Portfolio and asset intelligence for the wallet contract.
 * - Balances and token metadata come from the chain; USD values only from configured price feeds
 *   (each value carries its source and freshness; no price -> no value, never an estimate).
 * - Spending analytics come from indexed TransferExecuted events.
 * - History comes from periodic balance snapshots (reliable from the first snapshot onward).
 * - Suggestions are advisory. AgentWallet has no swap integration, so allocation drift produces a
 *   note that rebalancing needs a swap the system does not perform; nothing pretends to rebalance.
 */
export function createPortfolioService({ config, repos, chain, prices }) {
  async function targets() {
    return repos.settings.get(TARGETS_KEY, {});
  }

  async function setTargets(input, actor) {
    const out = {};
    let total = 0;
    for (const [token, pct] of Object.entries(input || {})) {
      const t = chain.findToken(token);
      if (!t) throw badRequest('UNSUPPORTED_TOKEN', `Unknown token ${token}`);
      const v = Number(pct);
      if (!Number.isFinite(v) || v < 0 || v > 100) throw badRequest('INVALID_TARGET', 'Targets are percentages between 0 and 100');
      out[t.address] = v;
      total += v;
    }
    if (Object.keys(out).length && Math.abs(total - 100) > 0.01) throw badRequest('INVALID_TARGET', `Targets must sum to 100 (got ${total})`);
    await repos.settings.set(TARGETS_KEY, out, actor);
    await repos.audit.append({ actor, action: 'PORTFOLIO_TARGETS_SET', entityType: 'settings', entityId: TARGETS_KEY, details: out });
    return out;
  }

  /** Projected outflows from active and pending tasks over the next `horizon` seconds, per token. */
  async function projectedOutflows(horizon = 7 * 86400) {
    const now = nowSeconds();
    const until = now + horizon;
    const per = {};
    for (const t of await repos.tasks.committedOutflows()) {
      let count = 0;
      if (t.kind === 'RECURRING') {
        let at = t.nextRunAt ?? firstOccurrence(t.schedule, now);
        while (at !== null && at <= until && at <= t.validUntil) {
          count += 1;
          at = nextOccurrence(t.schedule, at);
          if (count > 1000) break;
        }
        if (t.maxRuns !== null) count = Math.min(count, Math.max(0, t.maxRuns - t.runsCount));
      } else {
        count = (t.nextRunAt ?? now) <= until && t.runsCount === 0 ? 1 : 0;
      }
      let amount = BigInt(t.amountWei) * BigInt(count);
      if (t.maxTotalWei !== null) {
        const left = BigInt(t.maxTotalWei) - BigInt(t.committedWei);
        if (amount > left) amount = left > 0n ? left : 0n;
      }
      per[t.token.address] = (per[t.token.address] || 0n) + amount;
    }
    return per;
  }

  async function overview() {
    const snapshot = await chain.getSnapshot();
    const [priceMap, goal, outflows, executorGas] = await Promise.all([
      prices.prices(snapshot.blockNumber),
      targets(),
      projectedOutflows(),
      repos.executions.listRecent(20),
    ]);
    let totalUsd = 0;
    let fullyValued = true;
    const assets = snapshot.tokens.map((t) => {
      const p = priceMap[t.address];
      const valueUsd = prices.valueUsd(t.balance, t, p);
      if (valueUsd === null) fullyValued = false;
      else totalUsd += Number(valueUsd);
      const projected = outflows[t.address] || 0n;
      return {
        symbol: t.symbol,
        address: t.address,
        decimals: t.decimals,
        testOnly: t.testOnly,
        balance: t.balance.toString(),
        balanceFormatted: formatAmount(t.balance, t.decimals),
        price: p?.available ? { usd: p.priceUsd, source: p.source, feed: p.feed, updatedAt: p.updatedAt, ageSeconds: p.ageSeconds, stale: p.stale } : { usd: null, reason: p?.reason || 'no price feed configured' },
        valueUsd,
        limits: {
          enabled: t.enabled,
          perTx: formatAmount(t.perTxLimit, t.decimals),
          daily: formatAmount(t.dailyLimit, t.decimals),
          spentToday: formatAmount(t.spentToday, t.decimals),
          remainingToday: formatAmount(t.remainingToday, t.decimals),
        },
        projectedOutflow7d: formatAmount(projected, t.decimals),
        coverage7d: projected === 0n ? null : Number((t.balance * 10000n) / projected) / 10000,
        target: goal[t.address] ?? null,
      };
    });
    for (const a of assets) {
      a.allocationPct = fullyValued && totalUsd > 0 && a.valueUsd !== null ? Number(((Number(a.valueUsd) / totalUsd) * 100).toFixed(2)) : null;
      a.driftPct = a.allocationPct !== null && a.target !== null ? Number((a.allocationPct - a.target).toFixed(2)) : null;
    }

    const gasUsed = executorGas.filter((e) => e.gasUsed).map((e) => BigInt(e.gasUsed));
    const avgGas = gasUsed.length ? gasUsed.reduce((x, y) => x + y, 0n) / BigInt(gasUsed.length) : null;
    const gasPrice = snapshot.gasPrice ?? snapshot.maxFeePerGas;
    const txRunway = avgGas && gasPrice && snapshot.executorBalance !== null ? Number(snapshot.executorBalance / (avgGas * gasPrice)) : null;

    const dailyCapacityUsd = snapshot.tokens.reduce((sum, t) => {
      const v = prices.valueUsd(t.enabled ? t.dailyLimit : 0n, t, priceMap[t.address]);
      return v === null ? sum : sum + Number(v);
    }, 0);
    const maxWeight = fullyValued ? Math.max(0, ...assets.map((a) => a.allocationPct || 0)) : null;

    return {
      blockNumber: snapshot.blockNumber,
      totalUsd: fullyValued ? totalUsd.toFixed(2) : null,
      valuationComplete: fullyValued,
      valuationNote: fullyValued ? 'All assets valued from configured price feeds' : 'One or more assets have no usable price; total value is not shown',
      assets,
      exposure: {
        largestAllocationPct: maxWeight,
        agentDailyCapacityUsd: dailyCapacityUsd.toFixed(2),
        agentDailyCapacityPctOfPortfolio: fullyValued && totalUsd > 0 ? Number(((dailyCapacityUsd / totalUsd) * 100).toFixed(2)) : null,
        executorGasEth: snapshot.executorBalance === null ? null : ethers.formatEther(snapshot.executorBalance),
        executorTxRunway: txRunway,
        stalePrices: assets.filter((a) => a.price.stale).map((a) => a.symbol),
      },
      suggestions: suggestions(assets, snapshot, txRunway),
    };
  }

  function suggestions(assets, snapshot, txRunway) {
    const out = [];
    if (txRunway !== null && txRunway < 20) {
      out.push({ kind: 'FUND_EXECUTOR', severity: 'warning', actionable: 'manual', message: `The executor key has gas for about ${txRunway} more transfers; send it a little ETH directly (it is not a wallet recipient).` });
    }
    for (const a of assets) {
      if (a.coverage7d !== null && a.coverage7d < 1) {
        out.push({ kind: 'DEPOSIT_NEEDED', severity: 'warning', actionable: 'deposit', token: a.address, message: `Scheduled ${a.symbol} outflows over 7 days (${a.projectedOutflow7d}) exceed the balance (${a.balanceFormatted}). Deposit before runs start failing.` });
      }
      if (a.driftPct !== null && Math.abs(a.driftPct) >= 10) {
        out.push({ kind: 'ALLOCATION_DRIFT', severity: 'info', actionable: 'not_supported', token: a.address, message: `${a.symbol} is ${a.allocationPct}% of the portfolio vs a ${a.target}% target. Rebalancing requires a swap; AgentWallet does not execute swaps, so this needs manual action.` });
      }
      if (!a.limits.enabled && Number(a.balanceFormatted.replace(/,/g, '')) > 0) {
        out.push({ kind: 'ASSET_DISABLED', severity: 'info', actionable: 'manual', token: a.address, message: `${a.symbol} is held but disabled for agent transfers.` });
      }
      if (a.price.stale) out.push({ kind: 'STALE_PRICE', severity: 'warning', actionable: 'none', token: a.address, message: `${a.symbol} price is ${a.price.ageSeconds}s old; USD limits fail closed until it updates.` });
    }
    if (snapshot.paused) out.push({ kind: 'CONTRACT_PAUSED', severity: 'warning', actionable: 'manual', message: 'The contract is paused; no agent transfer can execute.' });
    return out;
  }

  async function spending({ days = 30 } = {}) {
    const since = nowSeconds() - days * 86400;
    const events = (await repos.chainEvents.list({ limit: 5000 })).filter((e) => (e.blockTimestamp ?? 0) >= since);
    const labels = await repos.recipientLabels.allDetailed();
    const demo = new Map(config.demoRecipients.map((r) => [r.address, r]));
    const byDay = {};
    const byToken = {};
    const byRecipient = {};
    const byCategory = {};
    const categorized = [];
    for (const e of events) {
      const kind = CATEGORY_BY_EVENT[e.eventName] || 'CONFIGURATION';
      const tokenAddr = e.args.token || ethers.ZeroAddress;
      const token = chain.findToken(tokenAddr);
      const amount = e.args.amount !== undefined ? BigInt(e.args.amount) : null;
      const entry = { txHash: e.txHash, blockNumber: e.blockNumber, at: e.blockTimestamp, event: e.eventName, category: kind, token: token?.symbol || tokenAddr, amount: amount === null || !token ? null : formatAmount(amount, token.decimals) };
      if (e.eventName === 'TransferExecuted' && token) {
        const r = e.args.recipient;
        const meta = labels.get(r) || demo.get(r) || {};
        const cat = meta.category || 'uncategorized';
        entry.recipient = r;
        entry.recipientLabel = meta.label || null;
        entry.spendCategory = cat;
        const day = new Date(e.blockTimestamp * 1000).toISOString().slice(0, 10);
        const k = token.symbol;
        byDay[day] = byDay[day] || {};
        byDay[day][k] = (byDay[day][k] || 0n) + amount;
        byToken[k] = (byToken[k] || 0n) + amount;
        byRecipient[r] = byRecipient[r] || { label: meta.label || null, category: cat, totals: {} };
        byRecipient[r].totals[k] = (byRecipient[r].totals[k] || 0n) + amount;
        byCategory[cat] = byCategory[cat] || {};
        byCategory[cat][k] = (byCategory[cat][k] || 0n) + amount;
      }
      categorized.push(entry);
    }
    const fmt = (m) => Object.fromEntries(Object.entries(m).map(([sym, v]) => [sym, formatAmount(v, chain.config.tokens.find((t) => t.symbol === sym)?.decimals ?? 18)]));
    return {
      days,
      source: 'indexed TransferExecuted / Deposited / Withdrawn events',
      totals: fmt(byToken),
      byDay: Object.fromEntries(Object.entries(byDay).sort().map(([d, m]) => [d, fmt(m)])),
      byRecipient: Object.fromEntries(Object.entries(byRecipient).map(([r, v]) => [r, { ...v, totals: fmt(v.totals) }])),
      byCategory: Object.fromEntries(Object.entries(byCategory).map(([c, m]) => [c, fmt(m)])),
      events: categorized,
    };
  }

  async function takeSnapshotIfDue() {
    const last = await repos.market.lastSnapshotAt(config.chainId);
    if (last && nowSeconds() - last < config.scheduler.snapshotSeconds) return false;
    const snapshot = await chain.getSnapshot();
    const priceMap = await prices.prices(snapshot.blockNumber);
    for (const t of snapshot.tokens) {
      const p = priceMap[t.address];
      await repos.market.addBalanceSnapshot({
        chainId: config.chainId,
        blockNumber: snapshot.blockNumber,
        tokenAddress: t.address,
        balance: t.balance.toString(),
        priceUsd: p?.available && !p.stale ? p.priceUsd : null,
        priceSource: p?.available ? p.source : null,
      });
    }
    return true;
  }

  async function history() {
    const out = {};
    for (const t of config.tokens) {
      out[t.symbol] = (await repos.market.balanceHistory(t.address)).map((h) => ({ ...h, balanceFormatted: formatAmount(h.balance, t.decimals) }));
    }
    return { source: 'periodic on-chain balance snapshots taken by the backend', points: out };
  }

  return { overview, spending, history, targets, setTargets, takeSnapshotIfDue, projectedOutflows };
}
