-- Phase 2: autonomous tasks, permission grants, agent memory, market/gas data.

-- Proposals can now originate from tasks and the LLM agent, and be approved by a signed task grant.
ALTER TABLE proposals DROP CONSTRAINT IF EXISTS proposals_source_check;
ALTER TABLE proposals ADD CONSTRAINT proposals_source_check CHECK (source IN ('MANUAL', 'RL', 'TASK', 'AGENT'));
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS task_run_id UUID;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS approval_kind TEXT CHECK (approval_kind IN ('OWNER_SIGNATURE', 'TASK_GRANT'));
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS explanation JSONB;

ALTER TABLE recipient_labels ADD COLUMN IF NOT EXISTS category TEXT;

-- A task is a standing, owner-signed permission grant to pay one allowlisted recipient a fixed amount
-- on a schedule or condition, within explicit run/total/expiry bounds.
CREATE TABLE IF NOT EXISTS tasks (
    id                       UUID PRIMARY KEY,
    created_by               TEXT NOT NULL,
    source                   TEXT NOT NULL CHECK (source IN ('MANUAL', 'AGENT')),
    conversation_id          UUID,
    kind                     TEXT NOT NULL CHECK (kind IN ('ONE_TIME', 'RECURRING', 'CONDITIONAL')),
    status                   TEXT NOT NULL CHECK (status IN ('PENDING_AUTHORIZATION', 'ACTIVE', 'PAUSED', 'CANCELLED', 'COMPLETED', 'EXPIRED', 'FAILED')),
    title                    TEXT NOT NULL,
    chain_id                 INT NOT NULL,
    contract_address         TEXT NOT NULL,
    token_address            TEXT NOT NULL,
    token_symbol             TEXT NOT NULL,
    token_decimals           INT NOT NULL,
    recipient                TEXT NOT NULL,
    amount_wei               NUMERIC(78, 0) NOT NULL CHECK (amount_wei > 0),
    schedule                 JSONB NOT NULL,
    condition                JSONB,
    execution_window_seconds INT NOT NULL DEFAULT 0 CHECK (execution_window_seconds >= 0),
    use_rl_timing            BOOLEAN NOT NULL DEFAULT FALSE,
    max_runs                 INT CHECK (max_runs IS NULL OR max_runs > 0),
    max_total_wei            NUMERIC(78, 0) CHECK (max_total_wei IS NULL OR max_total_wei > 0),
    valid_until              TIMESTAMPTZ NOT NULL,
    retry_max_attempts       INT NOT NULL DEFAULT 3 CHECK (retry_max_attempts BETWEEN 1 AND 10),
    retry_backoff_seconds    INT NOT NULL DEFAULT 60 CHECK (retry_backoff_seconds >= 1),
    grant_typed_data         JSONB NOT NULL,
    grant_signature          TEXT,
    authorized_by            TEXT,
    authorized_at            TIMESTAMPTZ,
    runs_count               INT NOT NULL DEFAULT 0,
    committed_wei            NUMERIC(78, 0) NOT NULL DEFAULT 0,
    consecutive_failures     INT NOT NULL DEFAULT 0,
    next_run_at              TIMESTAMPTZ,
    lease_owner              TEXT,
    lease_until              TIMESTAMPTZ,
    last_error               TEXT,
    status_reason            TEXT,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(status, next_run_at);

-- One row per scheduled occurrence. run_key = task id + occurrence time makes runs idempotent.
CREATE TABLE IF NOT EXISTS task_runs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id         UUID NOT NULL REFERENCES tasks(id),
    run_key         TEXT NOT NULL UNIQUE,
    scheduled_for   TIMESTAMPTZ NOT NULL,
    deadline_at     TIMESTAMPTZ NOT NULL,
    status          TEXT NOT NULL CHECK (status IN ('PENDING', 'DEFERRED', 'CLAIMED', 'ESCALATED', 'EXECUTING', 'CONFIRMED', 'FAILED', 'SKIPPED', 'RETRY_WAIT')),
    attempt         INT NOT NULL DEFAULT 0,
    proposal_id     UUID,
    decision        JSONB,
    timing_advice   JSONB,
    error_code      TEXT,
    error_message   TEXT,
    next_attempt_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_runs_task ON task_runs(task_id, scheduled_for DESC);
CREATE INDEX IF NOT EXISTS idx_task_runs_open ON task_runs(status);

CREATE TABLE IF NOT EXISTS gas_samples (
    id            BIGSERIAL PRIMARY KEY,
    chain_id      INT NOT NULL,
    block_number  BIGINT NOT NULL,
    gas_price_wei NUMERIC(78, 0) NOT NULL,
    base_fee_wei  NUMERIC(78, 0),
    sampled_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gas_samples_time ON gas_samples(sampled_at DESC);

CREATE TABLE IF NOT EXISTS balance_snapshots (
    id            BIGSERIAL PRIMARY KEY,
    chain_id      INT NOT NULL,
    block_number  BIGINT NOT NULL,
    token_address TEXT NOT NULL,
    balance       NUMERIC(78, 0) NOT NULL,
    price_usd     NUMERIC(38, 18),
    price_source  TEXT,
    taken_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_balance_snapshots_time ON balance_snapshots(token_address, taken_at DESC);

-- Agent memory: conversations, turns, provider messages (append-only replay), tool invocations.
CREATE TABLE IF NOT EXISTS conversations (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner      TEXT NOT NULL,
    title      TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_turns (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id),
    user_message    TEXT NOT NULL,
    status          TEXT NOT NULL CHECK (status IN ('RUNNING', 'COMPLETED', 'NEEDS_CLARIFICATION', 'FAILED', 'REFUSED', 'UNAVAILABLE')),
    provider        TEXT,
    model           TEXT,
    plan            JSONB,
    final_text      TEXT,
    actions         JSONB NOT NULL DEFAULT '[]'::jsonb,
    error           TEXT,
    usage           JSONB,
    model_calls     INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS conversation_messages (
    id              BIGSERIAL PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES conversations(id),
    turn_id         UUID REFERENCES agent_turns(id),
    role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
    content         JSONB NOT NULL,
    provider        TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conversation_messages ON conversation_messages(conversation_id, id);

CREATE TABLE IF NOT EXISTS tool_invocations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    turn_id         UUID NOT NULL REFERENCES agent_turns(id),
    conversation_id UUID NOT NULL REFERENCES conversations(id),
    tool_name       TEXT NOT NULL,
    input           JSONB NOT NULL,
    output          JSONB,
    status          TEXT NOT NULL CHECK (status IN ('OK', 'ERROR', 'REJECTED')),
    error           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tool_invocations_turn ON tool_invocations(turn_id);
