-- Application policy only. No deployed contract is changed.
CREATE TABLE treasury_execution_gate (id INTEGER PRIMARY KEY CHECK (id=1), proposal_id UUID);
INSERT INTO treasury_execution_gate(id) VALUES(1);
CREATE TABLE treasury_obligations (
  id UUID PRIMARY KEY, scope TEXT NOT NULL, recipient_label TEXT NOT NULL,
  recipient TEXT NOT NULL, amount_wei NUMERIC(78,0) NOT NULL CHECK(amount_wei>0),
  due_at TIMESTAMPTZ NOT NULL, priority TEXT NOT NULL CHECK(priority IN ('HIGH','NORMAL','LOW')),
  description TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT 'UPCOMING' CHECK(state IN ('UPCOMING','PLANNED','DEFERRED','CANCELLED')),
  proposal_id UUID UNIQUE REFERENCES proposals(id), version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX treasury_obligations_scope ON treasury_obligations(scope,due_at);
