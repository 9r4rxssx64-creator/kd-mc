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

-- Index user_activity pour pagination par user/ts : déjà couvert par idx_activity_user_ts (0002) et
-- idx_audit_actor_ts (0001). Lot E1 (15.10.2026) : les doublons « …_ts2 » sont supprimés par 0020 et ne sont
-- plus créés ici (ce fichier est rejoué à chaque déploiement : il les aurait reconstruits à chaque fois).
