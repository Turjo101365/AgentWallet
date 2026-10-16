import React from 'react';
import { Card, CardHeader, CardContent } from '../ui/Card.jsx';
import { Badge } from '../ui/Badge.jsx';
import { truncateAddress, formatAmount, formatGas } from '../../utils/formatters.js';

function Row({ label, children }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-mono text-slate-800 text-right">{children}</span>
    </div>
  );
}

export function AgentHealthCard({ state, status }) {
  if (!state) return null;
  const offPaused = Boolean(state.agentPaused?.paused);
  return (
    <Card>
      <CardHeader title="Agent authority" subtitle="Who can move funds, and whether they currently can" />
      <CardContent className="text-xs">
        <Row label="Off-chain agent">{offPaused ? <Badge variant="error">Paused</Badge> : <Badge variant="success">Active</Badge>}</Row>
        <Row label="On-chain contract">{state.paused ? <Badge variant="error">Paused</Badge> : <Badge variant="success">Active</Badge>}</Row>
        <Row label="On-chain agent key">{truncateAddress(state.agent)}</Row>
        <Row label="Backend executor">
          {state.executorAddress ? truncateAddress(state.executorAddress) : 'not configured'}{' '}
          {state.executorIsOnChainAgent ? <Badge variant="success">authorized</Badge> : <Badge variant="error">not the agent</Badge>}
        </Row>
        <Row label="Executor gas balance">{state.executorBalanceEth === null ? '—' : `${formatAmount(state.executorBalanceEth, 6)} ETH`}</Row>
        <Row label="Gas price">{formatGas(state.gasPriceGwei)}</Row>
        <Row label="Owner (custodian)">{truncateAddress(state.owner)}</Row>
        {status && <Row label="Pending approvals">{status.pendingApprovals}</Row>}
        {status && <Row label="Automation">{status.automation?.paused ? <Badge variant="error">Paused</Badge> : <Badge variant="success">On</Badge>}</Row>}
        {status && <Row label="RL timing service">{status.rlEngine?.status === 'healthy' ? Object.entries(status.rlEngine.policies || {}).map(([k, v]) => `${k} ${v}`).join(' · ') : 'unavailable'}</Row>}
        {status && <Row label="Language model">{status.llm?.available ? `${status.llm.provider} · ${status.llm.model}` : 'not configured'}</Row>}
      </CardContent>
    </Card>
  );
}
