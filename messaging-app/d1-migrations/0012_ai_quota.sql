-- Lot 2 (E) — Quota IA gratuit compté de façon ATOMIQUE.
-- Avant : lecture KV puis écriture KV après l'appel IA → N requêtes simultanées
-- passaient toutes sur « 0 utilisé » (coût IA non borné). Le compteur du jour est
-- réservé par UPDATE … SET used=used+1 WHERE used < limite (une ligne = un essai).
CREATE TABLE IF NOT EXISTS ai_quota (
  user_id  TEXT NOT NULL,
  feature  TEXT NOT NULL,
  day      TEXT NOT NULL,              -- YYYY-MM-DD (UTC)
  used     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, feature, day)
);
CREATE INDEX IF NOT EXISTS idx_ai_quota_day ON ai_quota(day);
