-- ============================================================================
--  Migration 0004 — Apex Chat v1.1.24
--  Stripe Premium + AI summarize cache (futur)
-- ============================================================================

-- 1) Plan premium tracking (monthly/yearly/lifetime)
ALTER TABLE users ADD COLUMN premium_plan TEXT;

-- 1b) v1.1.26 : Stripe customer_id (pour Customer Portal "gérer abo")
ALTER TABLE users ADD COLUMN stripe_customer_id TEXT;

-- 2) Cache résumés IA (clé = SHA-256 du prompt + max_tokens)
--    TTL : 7 jours (purge via cron sentinel)
CREATE TABLE IF NOT EXISTS ai_summary_cache (
  cache_key   TEXT PRIMARY KEY,         -- hash hex 64 chars
  text        TEXT NOT NULL,            -- résumé généré
  provider    TEXT,                     -- 'anthropic' | 'groq' | 'gemini'
  ts          INTEGER NOT NULL,         -- created ts ms
  user_id     TEXT                      -- optionnel : tracking par user
);

CREATE INDEX IF NOT EXISTS idx_ai_cache_ts ON ai_summary_cache(ts);

-- 3) Index premium_until (queries fréquentes premium status)
CREATE INDEX IF NOT EXISTS idx_users_premium_until ON users(premium_until);

-- 4) Audit log si pas encore là (safe re-create)
CREATE TABLE IF NOT EXISTS audit_log (
  id        TEXT PRIMARY KEY,
  actor_id  TEXT,
  action    TEXT NOT NULL,
  details   TEXT,                       -- JSON
  ts        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
