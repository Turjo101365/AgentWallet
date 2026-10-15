-- AgentWallet schema v1 (Phase 1).
-- No private keys, seed phrases or session tokens are stored. Session tokens are stored as SHA-256 hashes.
-- Monetary amounts are integer base units (wei / token units) in NUMERIC(78,0) (fits uint256).

CREATE TABLE IF NOT EXISTS auth_nonces (
    nonce        TEXT PRIMARY KEY,
    address      TEXT NOT NULL,
    message      TEXT NOT NULL,
    expires_at   TIMESTAMPTZ NOT NULL,
    used_at      TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash   TEXT NOT NULL UNIQUE,
    address      TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at   TIMESTAMPTZ NOT NULL,
    revoked_at   TIMESTAMPTZ,
    last_seen_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sessions_address ON sessions(address);

CREATE TABLE IF NOT EXISTS agent_decisions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_type      TEXT NOT NULL CHECK (agent_type IN ('PPO', 'DQN')),
    model_version   TEXT NOT NULL,
    policy_source   TEXT NOT NULL CHECK (policy_source IN ('checkpoint', 'heuristic_fallback')),
    action_index    INT NOT NULL,
    action_type     TEXT NOT NULL,
    suggested_amount_wei NUMERIC(78, 0) NOT NULL DEFAULT 0,
    confidence      DOUBLE PRECISION,
    rationale       TEXT NOT NULL,
    observation     JSONB NOT NULL,
    raw_response    JSONB NOT NULL,
    proposal_id     UUID,
    outcome         TEXT NOT NULL,
    requested_by    TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS proposals (
    id                 UUID PRIMARY KEY,
    intent_id          TEXT NOT NULL UNIQUE,
    source             TEXT NOT NULL CHECK (source IN ('MANUAL', 'RL')),
    decision_id        UUID REFERENCES agent_decisions(id),
    created_by         TEXT NOT NULL,
    chain_id           INT NOT NULL,
    contract_address   TEXT NOT NULL,
    token_address      TEXT NOT NULL,
    token_symbol       TEXT NOT NULL,
    token_decimals     INT NOT NULL,
    recipient          TEXT NOT NULL,
    amount_wei         NUMERIC(78, 0) NOT NULL CHECK (amount_wei > 0),
    memo               TEXT,
    status             TEXT NOT NULL CHECK (status IN (
                           'POLICY_REJECTED', 'AWAITING_APPROVAL', 'APPROVED', 'SUBMITTED',
                           'CONFIRMED', 'FAILED', 'REJECTED', 'EXPIRED')),
    policy_result      JSONB NOT NULL,
    simulation         JSONB,
    expires_at         TIMESTAMPTZ NOT NULL,
    approved_by        TEXT,
    approval_signature TEXT,
    approved_at        TIMESTAMPTZ,
    resolved_by        TEXT,
    resolution_reason  TEXT,
    resolved_at        TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposals_created ON proposals(created_at DESC);

CREATE TABLE IF NOT EXISTS executions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id         UUID NOT NULL UNIQUE REFERENCES proposals(id),
    intent_id           TEXT NOT NULL UNIQUE,
    executor_address    TEXT NOT NULL,
    status              TEXT NOT NULL CHECK (status IN ('PREPARING', 'SUBMITTED', 'CONFIRMED', 'FAILED')),
    nonce               BIGINT,
    tx_hash             TEXT UNIQUE,
    gas_limit           NUMERIC(78, 0),
    max_fee_per_gas     NUMERIC(78, 0),
    gas_used            NUMERIC(78, 0),
    effective_gas_price NUMERIC(78, 0),
    block_number        BIGINT,
    block_hash          TEXT,
    error_code          TEXT,
    error_message       TEXT,
    submitted_at        TIMESTAMPTZ,
    confirmed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chain_events (
    id               BIGSERIAL PRIMARY KEY,
    chain_id         INT NOT NULL,
    contract_address TEXT NOT NULL,
    block_number     BIGINT NOT NULL,
    block_hash       TEXT NOT NULL,
    block_timestamp  BIGINT,
    tx_hash          TEXT NOT NULL,
    log_index        INT NOT NULL,
    event_name       TEXT NOT NULL,
    args             JSONB NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (chain_id, tx_hash, log_index)
);
CREATE INDEX IF NOT EXISTS idx_chain_events_block ON chain_events(block_number DESC);

CREATE TABLE IF NOT EXISTS indexer_state (
    id               TEXT PRIMARY KEY,
    chain_id         INT NOT NULL,
    contract_address TEXT NOT NULL,
    last_block       BIGINT NOT NULL,
    last_block_hash  TEXT,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      JSONB NOT NULL,
    updated_by TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recipient_labels (
    address    TEXT PRIMARY KEY,
    label      TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
    key          TEXT PRIMARY KEY,
    scope        TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    status_code  INT,
    response     JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

-- Append-only, hash-chained audit trail. UPDATE and DELETE are rejected by trigger.
CREATE TABLE IF NOT EXISTS audit_log (
    id          BIGSERIAL PRIMARY KEY,
    occurred_at TIMESTAMPTZ NOT NULL,
    actor       TEXT NOT NULL,
    action      TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id   TEXT,
    details     JSONB NOT NULL,
    prev_hash   TEXT NOT NULL,
    hash        TEXT NOT NULL UNIQUE
);

CREATE OR REPLACE FUNCTION audit_log_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_no_mutation ON audit_log;
CREATE TRIGGER audit_log_no_mutation
    BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
