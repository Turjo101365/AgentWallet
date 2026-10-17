-- A shared quota survives process restarts and prevents public AI spend exceeding its daily bound.
CREATE TABLE IF NOT EXISTS judge_ai_usage (
    day DATE PRIMARY KEY,
    requests INTEGER NOT NULL CHECK (requests > 0)
);
