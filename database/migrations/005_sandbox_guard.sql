-- Durable gas reservations and a single shared relay gate; conservative charges survive failures/restarts.
CREATE TABLE IF NOT EXISTS sandbox_relay_usage (
  day DATE NOT NULL, subject TEXT NOT NULL, tx_count INTEGER NOT NULL DEFAULT 0,
  gas_wei NUMERIC(78,0) NOT NULL DEFAULT 0, PRIMARY KEY(day,subject)
);
CREATE TABLE IF NOT EXISTS sandbox_relay_claims (
  proposal_id UUID PRIMARY KEY, subject TEXT NOT NULL, contract_address TEXT NOT NULL,
  gas_wei NUMERIC(78,0) NOT NULL, tx_hash TEXT, finished BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS sandbox_relay_gate (id INTEGER PRIMARY KEY CHECK(id=1), proposal_id UUID);
INSERT INTO sandbox_relay_gate(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS personal_sandboxes (
  owner_address TEXT PRIMARY KEY, contract_address TEXT UNIQUE NOT NULL, approved_by TEXT NOT NULL,
  deploy_block BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), enabled BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS demo_grants (
  task_id UUID PRIMARY KEY, session_id UUID NOT NULL REFERENCES demo_sessions(id), confirmed_at TIMESTAMPTZ,
  digest TEXT, revoked BOOLEAN NOT NULL DEFAULT FALSE
);
ALTER TABLE demo_settings ADD COLUMN IF NOT EXISTS limits JSONB NOT NULL DEFAULT '{}';
