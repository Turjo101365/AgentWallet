-- Judge demo sandbox: invite-gated, server-held demo keys, strict per-session and global limits.
-- Applied in every schema like all migrations; only the demo sandbox schema uses these tables.

CREATE TABLE IF NOT EXISTS demo_invites (
    id UUID PRIMARY KEY,
    code_hash TEXT NOT NULL UNIQUE,          -- SHA-256 of the invite code; the code itself is never stored
    label TEXT NOT NULL,
    max_sessions INTEGER NOT NULL CHECK (max_sessions >= 0),
    sessions_used INTEGER NOT NULL DEFAULT 0 CHECK (sessions_used >= 0),
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS demo_sessions (
    id UUID PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,         -- SHA-256 of the bearer token
    invite_id UUID REFERENCES demo_invites(id),
    execution_allowed BOOLEAN NOT NULL,
    tx_count INTEGER NOT NULL DEFAULT 0 CHECK (tx_count >= 0),
    ai_count INTEGER NOT NULL DEFAULT 0 CHECK (ai_count >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ
);

-- Which demo session drafted which sandbox proposal; only that session may confirm it.
CREATE TABLE IF NOT EXISTS demo_actions (
    proposal_id UUID PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES demo_sessions(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at TIMESTAMPTZ,
    confirmation TEXT
);

-- Global daily execution budget (UTC day), shared by all demo sessions and persisted across restarts.
CREATE TABLE IF NOT EXISTS demo_daily_usage (
    day DATE PRIMARY KEY,
    tx_count INTEGER NOT NULL DEFAULT 0 CHECK (tx_count >= 0),
    amount_wei NUMERIC(78, 0) NOT NULL DEFAULT 0 CHECK (amount_wei >= 0)
);

-- Admin kill switch for live demo execution (single row).
CREATE TABLE IF NOT EXISTS demo_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    execution_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_by TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO demo_settings (id, execution_enabled) VALUES (1, TRUE) ON CONFLICT (id) DO NOTHING;
