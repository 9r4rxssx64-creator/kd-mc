-- ============================================================================
--  Apex Chat — Migration 0007 — Connexion-tracking
--  Kevin "être au courant de chaque connexion + capturer max de données :
--  personnes, devices, lieux". Capture COMPLÈTE à chaque login réussi ;
--  push iPhone admin SEULEMENT sur NOUVEAU device OU NOUVEAU lieu.
--
--  Une ligne = une signature unique (user_id, sig) où sig = os|browser|country|city.
--  Réapparition d'une signature connue → UPDATE last_seen + hits ; nouvelle → INSERT
--  (+ push admin). Idempotent (CREATE TABLE IF NOT EXISTS), comme les autres migrations.
-- ============================================================================

CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY,             -- uuid de la signature
  user_id TEXT,                    -- id du user connecté
  sig TEXT,                        -- os|browser|country|city (signature device+lieu)
  device TEXT,                     -- mobile / desktop
  os TEXT,                         -- iOS / Android / Windows / macOS / Linux / ''
  browser TEXT,                    -- Safari / Chrome / Firefox / Edge / ''
  country TEXT,                    -- code pays Cloudflare (request.cf.country)
  city TEXT,                       -- ville Cloudflare (request.cf.city)
  region TEXT,                     -- région Cloudflare (request.cf.region)
  ip_hash TEXT,                    -- sha256(CF-Connecting-IP) — jamais l'IP en clair
  first_seen INTEGER,             -- premier vu (ms epoch)
  last_seen INTEGER,              -- dernier vu (ms epoch)
  hits INTEGER DEFAULT 1           -- nombre de connexions avec cette signature
);

CREATE INDEX IF NOT EXISTS idx_connections_user ON connections(user_id);
