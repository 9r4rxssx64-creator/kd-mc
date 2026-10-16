-- Déconnexion côté serveur (audit 16.10.2026) : un jeton de session de 30 jours ne se révoquait que pour
-- TOUS les appareils à la fois. « Te déconnecter » enregistre maintenant l'empreinte de CE jeton ; le serveur
-- le refuse jusqu'à son expiration naturelle, puis la ligne est purgée (cron 03:00).
CREATE TABLE IF NOT EXISTS revoked_tokens (
  token_hash TEXT PRIMARY KEY,
  exp INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_exp ON revoked_tokens(exp);
