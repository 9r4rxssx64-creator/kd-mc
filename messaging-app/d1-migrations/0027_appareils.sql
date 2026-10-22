-- 22.10.2026 (Kevin : « une clé par appareil pour tous »).
-- Avant : UNE clé publique par compte (users.identity_key_pub = celle du dernier appareil ouvert) → un message
-- n'était lisible que sur cet appareil. Désormais chaque appareil publie SA clé ; un message privé est emballé
-- pour chaque appareil actif du destinataire et de l'émetteur (enveloppe « E2EM1: », voir lib/crypto-core.js).
CREATE TABLE IF NOT EXISTS user_devices (
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  identity_key_pub TEXT NOT NULL,
  crypto_caps TEXT,
  label TEXT,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  revoked_at INTEGER,
  PRIMARY KEY (user_id, device_id)
);
CREATE INDEX IF NOT EXISTS ix_user_devices_actifs ON user_devices(user_id, revoked_at, last_seen);
