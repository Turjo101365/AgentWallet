import { toUnix } from '../lib/time.js';

const str = (v) => (v === null || v === undefined ? null : String(v));
const num = (v) => (v === null || v === undefined ? null : Number(v));

export function mapProposal(r) {
  if (!r) return null;
  return {
    id: r.id,
    intentId: r.intent_id,
    source: r.source,
    decisionId: r.decision_id,
    createdBy: r.created_by,
    chainId: Number(r.chain_id),
    contractAddress: r.contract_address,
    token: { address: r.token_address, symbol: r.token_symbol, decimals: Number(r.token_decimals) },
    recipient: r.recipient,
    amountWei: str(r.amount_wei),
    memo: r.memo,
    status: r.status,
    policyResult: r.policy_result,
    simulation: r.simulation,
    expiresAt: toUnix(r.expires_at),
    taskRunId: r.task_run_id || null,
    approvalKind: r.approval_kind || null,
    explanation: r.explanation || null,
    approvedBy: r.approved_by,
    approvalSignature: r.approval_signature,
    approvedAt: toUnix(r.approved_at),
    resolvedBy: r.resolved_by,
    resolutionReason: r.resolution_reason,
    resolvedAt: toUnix(r.resolved_at),
    createdAt: toUnix(r.created_at),
    updatedAt: toUnix(r.updated_at),
  };
}

export function mapExecution(r) {
  if (!r) return null;
  return {
    id: r.id,
    proposalId: r.proposal_id,
    intentId: r.intent_id,
    executorAddress: r.executor_address,
    status: r.status,
    nonce: num(r.nonce),
    txHash: r.tx_hash,
    gasLimit: str(r.gas_limit),
    maxFeePerGas: str(r.max_fee_per_gas),
    gasUsed: str(r.gas_used),
    effectiveGasPrice: str(r.effective_gas_price),
    blockNumber: num(r.block_number),
    blockHash: r.block_hash,
    errorCode: r.error_code,
    errorMessage: r.error_message,
    submittedAt: toUnix(r.submitted_at),
    confirmedAt: toUnix(r.confirmed_at),
    createdAt: toUnix(r.created_at),
    updatedAt: toUnix(r.updated_at),
  };
}

export function mapChainEvent(r) {
  if (!r) return null;
  return {
    id: num(r.id),
    chainId: Number(r.chain_id),
    contractAddress: r.contract_address,
    blockNumber: num(r.block_number),
    blockHash: r.block_hash,
    blockTimestamp: num(r.block_timestamp),
    txHash: r.tx_hash,
    logIndex: Number(r.log_index),
    eventName: r.event_name,
    args: r.args,
  };
}

export function mapDecision(r) {
  if (!r) return null;
  return {
    id: r.id,
    agentType: r.agent_type,
    modelVersion: r.model_version,
    policySource: r.policy_source,
    actionIndex: Number(r.action_index),
    actionType: r.action_type,
    suggestedAmountWei: str(r.suggested_amount_wei),
    confidence: r.confidence === null ? null : Number(r.confidence),
    rationale: r.rationale,
    observation: r.observation,
    proposalId: r.proposal_id,
    outcome: r.outcome,
    requestedBy: r.requested_by,
    createdAt: toUnix(r.created_at),
  };
}

export function mapAudit(r) {
  if (!r) return null;
  return {
    id: num(r.id),
    occurredAt: r.occurred_at instanceof Date ? r.occurred_at.toISOString() : new Date(r.occurred_at).toISOString(),
    actor: r.actor,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id,
    details: r.details,
    prevHash: r.prev_hash,
    hash: r.hash,
  };
}
