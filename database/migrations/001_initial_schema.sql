-- Migration 001: Initial Schema
-- Up migration creates tables for models, decisions, safety validations, user approvals, and tracked transactions.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS agent_models (
    model_id VARCHAR(64) PRIMARY KEY,
    agent_type VARCHAR(16) NOT NULL CHECK (agent_type IN ('PPO', 'DQN')),
    version VARCHAR(32) NOT NULL,
    checkpoint_path VARCHAR(255) NOT NULL,
    action_space_size INT NOT NULL DEFAULT 4,
    observation_dim INT NOT NULL DEFAULT 8,
    trained_steps INT DEFAULT 0,
    is_active BOOLEAN DEFAULT FALSE,
    metrics JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agent_decisions (
    decision_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_type VARCHAR(16) NOT NULL CHECK (agent_type IN ('PPO', 'DQN')),
    model_version VARCHAR(64) NOT NULL,
    action_index INT NOT NULL,
    action_type VARCHAR(32) NOT NULL,
    proposed_recipient VARCHAR(42),
    proposed_amount_eth NUMERIC(18, 8) NOT NULL,
    confidence_score NUMERIC(5, 4) NOT NULL,
    rationale TEXT NOT NULL,
    q_values JSONB,
    policy_distribution JSONB,
    observed_state JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS safety_validations (
    validation_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    decision_id UUID NOT NULL REFERENCES agent_decisions(decision_id) ON DELETE CASCADE,
    passed BOOLEAN NOT NULL,
    violations JSONB DEFAULT '[]'::jsonb,
    daily_limit_remaining_eth NUMERIC(18, 8),
    gas_base_fee_gwei NUMERIC(10, 2),
    validated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_approvals (
    approval_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    decision_id UUID NOT NULL REFERENCES agent_decisions(decision_id) ON DELETE CASCADE,
    status VARCHAR(32) NOT NULL CHECK (status IN ('AWAITING_APPROVAL', 'APPROVED', 'REJECTED', 'EXPIRED', 'SKIPPED_HOLD')),
    signer_address VARCHAR(42),
    rejection_reason TEXT,
    ttl_seconds INT DEFAULT 180,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tracked_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tx_hash VARCHAR(66) UNIQUE,
    decision_id UUID REFERENCES agent_decisions(decision_id) ON DELETE SET NULL,
    chain_id INT NOT NULL,
    from_address VARCHAR(42) NOT NULL,
    to_address VARCHAR(42) NOT NULL,
    value_wei VARCHAR(78) NOT NULL,
    value_eth NUMERIC(18, 8) NOT NULL,
    calldata TEXT,
    status VARCHAR(32) NOT NULL CHECK (status IN ('AWAITING_USER_SIGNATURE', 'BROADCASTED', 'CONFIRMED', 'REVERTED', 'REJECTED_BY_USER')),
    block_number BIGINT,
    confirmations INT DEFAULT 0,
    gas_used BIGINT,
    effective_gas_price_gwei NUMERIC(10, 2),
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS system_events (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(64) NOT NULL,
    severity VARCHAR(16) NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'ERROR', 'CRITICAL')),
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_decisions_created_at ON agent_decisions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON user_approvals(status);
CREATE INDEX IF NOT EXISTS idx_tx_status ON tracked_transactions(status);
CREATE INDEX IF NOT EXISTS idx_tx_hash ON tracked_transactions(tx_hash);
