-- Migration 0002 — Admin bypass invitation + live users tracking + per-user feature toggles
-- Apex Chat v1.0.7

-- Colonnes users pour bypass admin (invitation magic link sans OTP)
ALTER TABLE users ADD COLUMN admin_authorized TINYINT DEFAULT 0;
ALTER TABLE users ADD COLUMN admin_authorized_by TEXT;
ALTER TABLE users ADD COLUMN display_name TEXT;
ALTER TABLE users ADD COLUMN updated_at INTEGER;
ALTER TABLE users ADD COLUMN is_banned TINYINT DEFAULT 0;

-- Tracking live (avec consentement RGPD via toggle track_geoloc/track_devices)
ALTER TABLE users ADD COLUMN last_ip_hash TEXT;
ALTER TABLE users ADD COLUMN last_user_agent TEXT;
ALTER TABLE users ADD COLUMN last_lat REAL;
ALTER TABLE users ADD COLUMN last_lng REAL;
ALTER TABLE users ADD COLUMN last_geo_label TEXT;
ALTER TABLE users ADD COLUMN last_device_label TEXT;
ALTER TABLE users ADD COLUMN last_force_logout_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_users_admin_auth ON users(admin_authorized);

-- Magic token stocké dans invitations (pour révocation possible)
ALTER TABLE invitations ADD COLUMN magic_token TEXT;
CREATE INDEX IF NOT EXISTS idx_inv_magic ON invitations(magic_token);

-- System config (key-value) pour feature toggles globaux
CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);

-- Per-user feature overrides (priorité sur global)
CREATE TABLE IF NOT EXISTS user_feature_overrides (
  user_id TEXT NOT NULL,
  feature TEXT NOT NULL,
  enabled TINYINT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT,
  PRIMARY KEY (user_id, feature)
);

CREATE INDEX IF NOT EXISTS idx_overrides_user ON user_feature_overrides(user_id);

-- Geoloc/device history (pour admin live users — TTL 30j)
CREATE TABLE IF NOT EXISTS user_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  ip_hash TEXT,
  user_agent TEXT,
  lat REAL,
  lng REAL,
  geo_label TEXT,
  action TEXT
);
CREATE INDEX IF NOT EXISTS idx_activity_user_ts ON user_activity(user_id, ts DESC);
