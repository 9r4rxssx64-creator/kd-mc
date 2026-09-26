-- Migration 0003 — CGU tracking + timeline pagination indexes + finalisations v1.1.2
-- Apex Chat v1.1.2

-- Acceptation CGU (RGPD trace immutable)
CREATE TABLE IF NOT EXISTS cgu_acceptances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,                              -- nullable (acceptation pre-signup)
  phone_hash TEXT,                           -- pour retrouver post-signup
  version TEXT NOT NULL,                     -- ex: 'v1.1.2'
  accepted_at INTEGER NOT NULL,
  implicit TINYINT DEFAULT 1,                -- 1 = accepté par remplissage champs
  user_agent TEXT,
  ip_hash TEXT
);
CREATE INDEX IF NOT EXISTS idx_cgu_user ON cgu_acceptances(user_id);
CREATE INDEX IF NOT EXISTS idx_cgu_phone ON cgu_acceptances(phone_hash);

-- Index user_activity pour pagination par user/ts
CREATE INDEX IF NOT EXISTS idx_activity_user_ts2 ON user_activity(user_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor_ts2 ON audit_log(actor_id, ts DESC);
