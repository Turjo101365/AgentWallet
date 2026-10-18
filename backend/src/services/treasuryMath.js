// Exact ETH-only arithmetic. No model output, prices or hypothetical deposits.
const positive = (n) => n > 0n ? n : 0n;
export function treasuryPosition({ balance, reserve, committed, upcoming }) {
  for (const n of [balance, reserve, committed, upcoming]) if (typeof n !== 'bigint' || n < 0n) throw new Error('Invalid treasury amount');
  const afterCommitments = balance - committed;
  const available = positive(afterCommitments - reserve);
  const health = committed > balance ? 'Insufficient funds' : afterCommitments < reserve ? 'Reserve at risk' : upcoming > available ? 'Limited funds' : 'Healthy';
  return { balanceWei:balance.toString(), reserveWei:reserve.toString(), committedWei:committed.toString(), availableWei:available.toString(), upcomingWei:upcoming.toString(), health };
}

// Overdue first; then HIGH/NORMAL/LOW; then earliest due date; UUID breaks ties.
export function prioritize(obligations, now = Date.now()) {
  const rank = { HIGH:0, NORMAL:1, LOW:2 };
  return [...obligations].sort((a,b) => Number(Date.parse(a.dueAt)>=now)-Number(Date.parse(b.dueAt)>=now) || rank[a.priority]-rank[b.priority] || Date.parse(a.dueAt)-Date.parse(b.dueAt) || a.id.localeCompare(b.id));
}

export function planPayments({ obligations, balance, reserve, committed, dailyRemaining, perTxLimit, now }) {
  let available = positive(balance-reserve-committed), daily = positive(dailyRemaining-committed), total=0n;
  const payments=prioritize(obligations,now).map(o=>{
    const amount=BigInt(o.amountWei);
    const reasons=[...(o.blockedBy||[])];
    if(amount>perTxLimit)reasons.push('Payment exceeds the per-payment cap');
    if(amount>daily)reasons.push('Payment exceeds remaining daily capacity');
    if(amount>available)reasons.push('Payment blocked to protect your reserve or existing commitments');
    const included=reasons.length===0;
    if(included){available-=amount;daily-=amount;total+=amount;}
    return {...o,recommendation:included?'PAY':'DEFER',reasons:included?['Fits funds, protected reserve and current contract caps; still needs authorization and final checks']:reasons};
  });
  const projected=balance-committed-total;
  return {payments,plannedOutflowWei:total.toString(),projectedBalanceWei:projected.toString(),aboveReserveWei:(projected-reserve).toString(),authorization:false,forecast:'Known ETH obligations only; no assumed deposits. A plan is not permission to pay.'};
}
