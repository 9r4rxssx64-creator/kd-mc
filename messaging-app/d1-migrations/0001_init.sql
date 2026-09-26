-- ============================================================================
--  Apex Chat — Schéma D1 initial
--  Migration 0001 — créé 2026-04-27
--
--  Architecture prête pour bascule A→B→C (cf docs/PIVOT_PLAN_B_C.md) :
--  - Colonne `kevin_invisible` dans conversation_members (flag bascule)
--  - Colonne `shard_id` virtuelle dans users (sharding préparé Day 1)
--  - Table `system_config` pour flags MODE_CONFIG runtime
-- ============================================================================

-- Users — identité unifiée (cross-app Apex/Apex Chat)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,                          -- uuid v7 ou apex_uid si SSO
  pseudo TEXT NOT NULL UNIQUE COLLATE NOCASE,   -- visible publiquement (3-20 chars)
  real_name TEXT NOT NULL,                      -- visible Kevin admin uniquement
  phone TEXT NOT NULL UNIQUE,                   -- E.164 vérifié SMS
  phone_hash TEXT NOT NULL,                     -- SHA256 pour lookup invitations sans révéler tel
  email TEXT,
  avatar_url TEXT,                              -- R2 key ou URL Cloudflare Images
  bio TEXT,
  created_at INTEGER NOT NULL,
  last_seen INTEGER,
  is_admin TINYINT DEFAULT 0,                   -- 1 = Kevin (alias reconnu)
  is_kevin_alias TINYINT DEFAULT 0,             -- 1 = Kevin via tous aliases (CLAUDE.md règle)
  premium_until INTEGER,                        -- timestamp expiration premium
  shard_id INTEGER GENERATED ALWAYS AS (abs(unicode(substr(id,1,1)))%16) VIRTUAL,
  language TEXT DEFAULT 'fr',
  timezone TEXT DEFAULT 'Europe/Monaco',
  identity_key_pub TEXT NOT NULL,               -- Ed25519 base64
  pq_key_pub TEXT NOT NULL,                     -- Kyber-768 base64 (post-quantum)
  prekey_signed TEXT NOT NULL,                  -- Signed prekey (Signal Protocol)
  fcm_topic TEXT,                               -- topic push notif user
  apex_uid TEXT UNIQUE,                         -- lien cross-app vers compte Apex (SSO)
  source TEXT DEFAULT 'apex-chat-direct',       -- apex-chat-direct | apex-sso | invitation
  invited_by TEXT,                              -- user_id de l'inviteur
  status TEXT DEFAULT 'active'                  -- active | suspended | deleted
);
CREATE INDEX IF NOT EXISTS idx_users_phone_hash ON users(phone_hash);
CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_users_apex_uid ON users(apex_uid);
CREATE INDEX IF NOT EXISTS idx_users_invited_by ON users(invited_by);

-- Contacts — relations user-to-user
CREATE TABLE IF NOT EXISTS contacts (
  user_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  mutual_at INTEGER,
  blocked_at INTEGER,
  nickname TEXT,                                -- nom personnalisé donné par user_id
  privacy_flags TEXT DEFAULT '{}',              -- JSON {last_seen,read_receipts,stories,online}
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, contact_id)
);

-- Conversations
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('dm','group','community','channel')),
  name TEXT,
  description TEXT,
  avatar_url TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  sharded_to_do TEXT NOT NULL,                  -- ConversationDO instance id
  member_count INTEGER DEFAULT 0,
  last_msg_id TEXT,
  last_msg_ts INTEGER,
  disappearing_seconds INTEGER DEFAULT 0,       -- 0 = jamais, sinon délai auto-effacement
  e2e_version INTEGER DEFAULT 1,
  archived_at INTEGER,
  pinned_for TEXT DEFAULT '[]'                  -- JSON array user_ids
);
CREATE INDEX IF NOT EXISTS idx_convs_last_ts ON conversations(last_msg_ts DESC);

-- Conversation members — un user peut être membre de N convs
CREATE TABLE IF NOT EXISTS conversation_members (
  conv_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT DEFAULT 'member',                   -- owner | admin | member | readonly
  joined_at INTEGER NOT NULL,
  last_read_msg_id TEXT,
  last_delivered_msg_id TEXT,
  notif_level TEXT DEFAULT 'all',               -- all | mentions | none
  kevin_invisible TINYINT DEFAULT 0,            -- *** Flag bascule A→B (Kevin admin invisible) ***
  PRIMARY KEY (conv_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_conv_members_user ON conversation_members(user_id);

-- Messages — ciphertext uniquement (serveur aveugle)
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conv_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  ciphertext BLOB NOT NULL,                     -- chiffré E2E par client
  mime TEXT,                                    -- text/plain | image/r2-key | etc.
  ts INTEGER NOT NULL,
  edited_at INTEGER,
  deleted_at INTEGER,
  view_once TINYINT DEFAULT 0,
  expires_at INTEGER,                           -- disappearing
  scheduled_for INTEGER,                        -- envoi programmé
  time_capsule_open_at INTEGER,                 -- Time Capsule deferred
  letters_delay_until INTEGER,                  -- Letters mode 24h delay
  reply_to TEXT,                                -- message_id parent
  thread_root TEXT,                             -- racine du thread
  reactions TEXT DEFAULT '{}'                   -- JSON {emoji: [user_ids]}
);
CREATE INDEX IF NOT EXISTS idx_msgs_conv_ts ON messages(conv_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_msgs_thread ON messages(thread_root);
CREATE INDEX IF NOT EXISTS idx_msgs_scheduled ON messages(scheduled_for) WHERE scheduled_for IS NOT NULL;

-- Médias — métadonnées seulement (contenu chiffré sur R2)
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  size INTEGER NOT NULL,
  mime TEXT NOT NULL,
  uploaded_at INTEGER NOT NULL,
  expires_at INTEGER,                           -- lifecycle 30j free / 90j premium
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER,
  thumbnail_r2_key TEXT
);
CREATE INDEX IF NOT EXISTS idx_media_owner ON media(owner_id);
CREATE INDEX IF NOT EXISTS idx_media_expires ON media(expires_at) WHERE expires_at IS NOT NULL;

-- Invitations virales SMS
CREATE TABLE IF NOT EXISTS invitations (
  code TEXT PRIMARY KEY,                        -- code unique 6 chars alphanum
  inviter_id TEXT NOT NULL,
  invitee_phone_hash TEXT,
  sent_via TEXT,                                -- sms-native | sms-vonage | whatsapp | other
  accepted_at INTEGER,
  reward_credit INTEGER DEFAULT 0,              -- crédit accordé à l'inviteur
  created_at INTEGER NOT NULL,
  expires_at INTEGER                            -- TTL 7 jours
);
CREATE INDEX IF NOT EXISTS idx_inv_inviter ON invitations(inviter_id);
CREATE INDEX IF NOT EXISTS idx_inv_phone ON invitations(invitee_phone_hash);

-- Audit log — chaque action admin tracée
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,                         -- view_user_card | kick_user | ban_user | etc.
  target_type TEXT,                             -- user | conv | message
  target_id TEXT,
  details TEXT,                                 -- JSON
  ts INTEGER NOT NULL,
  ip_hash TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_actor_ts ON audit_log(actor_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_log(target_type, target_id);

-- Signalements user→user
CREATE TABLE IF NOT EXISTS signalements (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL,
  target_user_id TEXT NOT NULL,
  conv_id TEXT,
  msg_id TEXT,
  reason TEXT NOT NULL,                         -- spam | harassment | scam | illegal | other
  description TEXT,
  status TEXT DEFAULT 'pending',                -- pending | reviewing | resolved | dismissed
  resolution TEXT,
  ts INTEGER NOT NULL,
  resolved_at INTEGER,
  resolved_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_signal_status ON signalements(status, ts DESC);
CREATE INDEX IF NOT EXISTS idx_signal_target ON signalements(target_user_id);

-- Push subscriptions — multi-device par user
CREATE TABLE IF NOT EXISTS push_subscriptions (
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  endpoint TEXT,
  vapid_p256dh TEXT,
  vapid_auth TEXT,
  fcm_token TEXT,
  apns_token TEXT,
  user_agent TEXT,
  device_name TEXT,                             -- "iPhone Kevin", "MacBook Pro", etc.
  last_seen INTEGER,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, device_id)
);

-- Time Capsules — messages programmés long terme
CREATE TABLE IF NOT EXISTS time_capsules (
  id TEXT PRIMARY KEY,
  sender_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  conv_id TEXT,
  ciphertext BLOB NOT NULL,
  mime TEXT DEFAULT 'text/plain',
  open_at INTEGER NOT NULL,
  opened_at INTEGER,
  created_at INTEGER NOT NULL,
  preview TEXT                                  -- texte aperçu non chiffré (optionnel)
);
CREATE INDEX IF NOT EXISTS idx_capsules_open_at ON time_capsules(open_at) WHERE opened_at IS NULL;

-- Letters Queue — messages avec délai 24h obligatoire
CREATE TABLE IF NOT EXISTS letters_queue (
  id TEXT PRIMARY KEY,
  sender_id TEXT NOT NULL,
  conv_id TEXT NOT NULL,
  ciphertext BLOB NOT NULL,
  deliver_at INTEGER NOT NULL,                  -- now() + 24h en général
  delivered TINYINT DEFAULT 0,
  cancelled TINYINT DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_letters_deliver ON letters_queue(deliver_at) WHERE delivered=0 AND cancelled=0;

-- Voiceprints — pour identification vocale (Apex feature)
CREATE TABLE IF NOT EXISTS voice_prints (
  user_id TEXT PRIMARY KEY,
  mfcc_avg_enc BLOB NOT NULL,                   -- chiffré avec PQ key user
  last_updated INTEGER NOT NULL,
  enrollment_count INTEGER DEFAULT 0
);

-- Streaks (opt-in only — décisions Kevin: gardé léger, pas core feature)
CREATE TABLE IF NOT EXISTS streaks (
  user_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  days INTEGER DEFAULT 0,
  last_day INTEGER,
  opt_in TINYINT DEFAULT 0,                     -- défaut OFF (audit UX)
  PRIMARY KEY (user_id, contact_id)
);

-- Memory Lane — index "il y a 1 an"
CREATE TABLE IF NOT EXISTS memory_lane_index (
  user_id TEXT NOT NULL,
  date_key TEXT NOT NULL,                       -- format YYYY-MM-DD
  msg_ids TEXT NOT NULL,                        -- JSON array message_ids
  summary_enc BLOB,                             -- résumé IA chiffré
  generated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, date_key)
);

-- Stories 24h
CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL,
  ciphertext BLOB NOT NULL,
  mime TEXT,
  ts INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,                  -- ts + 24h
  views TEXT DEFAULT '[]'                       -- JSON array {user_id, viewed_at}
);
CREATE INDEX IF NOT EXISTS idx_stories_author ON stories(author_id);
CREATE INDEX IF NOT EXISTS idx_stories_expires ON stories(expires_at);

-- Polls
CREATE TABLE IF NOT EXISTS polls (
  id TEXT PRIMARY KEY,
  conv_id TEXT NOT NULL,
  msg_id TEXT NOT NULL,
  question TEXT NOT NULL,
  options TEXT NOT NULL,                        -- JSON array strings
  multi_choice TINYINT DEFAULT 0,
  anonymous TINYINT DEFAULT 0,
  closes_at INTEGER,
  votes TEXT DEFAULT '{}',                      -- JSON {option_idx: [user_ids]}
  created_at INTEGER NOT NULL
);

-- Rate limiting OTP (anti-spam SMS)
CREATE TABLE IF NOT EXISTS ratelimit_otp (
  ip_hash TEXT NOT NULL,
  hour_key TEXT NOT NULL,                       -- format YYYY-MM-DD-HH
  count INTEGER DEFAULT 0,
  PRIMARY KEY (ip_hash, hour_key)
);

-- Device trust — détection SIM swap
CREATE TABLE IF NOT EXISTS device_trust (
  user_id TEXT NOT NULL,
  device_fingerprint TEXT NOT NULL,             -- hash IMEI + UA + IP region
  trusted_at INTEGER,
  last_seen INTEGER,
  PRIMARY KEY (user_id, device_fingerprint)
);

-- Telemetry buffer — pour pipeline self-healing local avant push CF Queues
CREATE TABLE IF NOT EXISTS telemetry_buffer (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sentinel_id TEXT NOT NULL,
  severity TEXT NOT NULL,                       -- info | warn | err | critical
  payload TEXT NOT NULL,                        -- JSON
  ts INTEGER NOT NULL,
  processed TINYINT DEFAULT 0,
  escalated_to_apex TINYINT DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_telemetry_pending ON telemetry_buffer(processed, ts) WHERE processed=0;

-- System config — flags MODE_CONFIG runtime (bascule A→B→C)
CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
);

-- ============================================================================
-- Initialisation des flags système (MODE_CONFIG par défaut = Option B)
--
-- BASCULE B activée Day 1 (décision Kevin 2026-04-27) :
--   - Kevin admin NE LIT PLUS le contenu des messages (vrai E2E mathématique)
--   - Kevin voit METADATA only (qui→qui, quand, taille, signalements, géoloc, devices)
--   - Marketing 100% honnête : "Ultra-sécurisé E2E, serveur ET admin aveugles"
--   - ZÉRO risque pénal (E2E mathématique strict)
--   - Modération via signalements + IA pattern detection
-- ============================================================================

INSERT OR IGNORE INTO system_config (key, value, updated_at, updated_by) VALUES
  ('ADMIN_MODE', 'B', strftime('%s','now')*1000, 'system'),                    -- A | B | C (B = vrai E2E grand public)
  ('KEVIN_INVISIBLE_ADMIN', 'false', strftime('%s','now')*1000, 'system'),     -- false = pas de clé maître Kevin (vrai E2E)
  ('AUTH_PROVIDER', 'firebase', strftime('%s','now')*1000, 'system'),          -- firebase | vonage
  ('TURN_PROVIDER', 'p2p-only', strftime('%s','now')*1000, 'system'),          -- p2p-only | local-coturn | cloudflare-calls
  ('IA_PROVIDER_PRIMARY', 'anthropic', strftime('%s','now')*1000, 'system'),
  ('PUSH_PROVIDER', 'cloudflare-worker', strftime('%s','now')*1000, 'system'),
  ('MEDIA_LIFECYCLE_FREE_DAYS', '30', strftime('%s','now')*1000, 'system'),
  ('MEDIA_LIFECYCLE_PREMIUM_DAYS', '90', strftime('%s','now')*1000, 'system'),
  ('MAX_GROUP_SIZE', '1024', strftime('%s','now')*1000, 'system'),
  ('MAX_INVITATIONS_PER_DAY', '50', strftime('%s','now')*1000, 'system'),
  ('OTP_RATE_LIMIT_PER_HOUR', '5', strftime('%s','now')*1000, 'system'),
  ('PREMIUM_PRICE_EUR', '6.99', strftime('%s','now')*1000, 'system'),
  ('LIFETIME_PRICE_EUR', '199', strftime('%s','now')*1000, 'system');

-- ============================================================================
-- Comptes pré-configurés Kevin (admin) + Laurence (premium user)
-- Validés et opérationnels Day 1 (cohérence cross-app Apex)
-- ============================================================================

-- Note : les clés crypto réelles seront générées au premier login depuis l'app
-- Ces enregistrements préparent les fiches, l'app les active au signup SMS

INSERT OR IGNORE INTO users (
  id, pseudo, real_name, phone, phone_hash, email, is_admin, is_kevin_alias,
  premium_until, language, timezone, identity_key_pub, pq_key_pub, prekey_signed,
  apex_uid, source, created_at, status
) VALUES
  (
    'kdmc_admin',
    'kevin',
    'Kevin DESARZENS',
    'PENDING_KEVIN',                            -- Kevin saisit son tel au 1er signup SMS
    'PENDING_HASH',
    'kevind@monaco.mc',                         -- email Monaco principal (source: NOTES_USER)
    1, 1,
    9999999999000,                              -- premium illimité (admin)
    'fr', 'Europe/Monaco',
    'PENDING_KEY_GEN',
    'PENDING_KEY_GEN',
    'PENDING_KEY_GEN',
    'kdmc_admin',                               -- même UID qu'Apex (SSO cross-app)
    'apex-sso',
    strftime('%s','now')*1000,
    'active'
  ),
  (
    'user_laurence',
    'laurence',
    'Laurence SAINT-POLIT',                     -- nom complet (épouse Kevin, source: NOTES_USER)
    'PENDING_LAURENCE',                         -- Laurence saisit son tel au 1er signup SMS
    'PENDING_HASH',
    NULL,                                       -- email à confirmer
    0, 0,
    9999999999000,                              -- premium illimité (cadeau Kevin, role=family)
    'fr', 'Europe/Monaco',
    'PENDING_KEY_GEN',
    'PENDING_KEY_GEN',
    'PENDING_KEY_GEN',
    'user_laurence',                            -- même UID qu'Apex (SSO cross-app)
    'apex-sso',
    strftime('%s','now')*1000,
    'active'
  ),
  -- Clients test pré-configurés (compte gratuit, PIN 2026 à changer 1er login)
  (
    'user_tardieu_sandrine',
    'sandrine',
    'Sandrine TARDIEU',
    'PENDING_SANDRINE',
    'PENDING_HASH',
    NULL,
    0, 0,
    NULL,                                       -- pas premium (compte gratuit)
    'fr', 'Europe/Monaco',
    'PENDING_KEY_GEN',
    'PENDING_KEY_GEN',
    'PENDING_KEY_GEN',
    'user_tardieu_sandrine',
    'apex-sso',
    strftime('%s','now')*1000,
    'active'
  ),
  (
    'user_tardieu_christophe',
    'christophe',
    'Christophe TARDIEU',
    'PENDING_CHRISTOPHE',
    'PENDING_HASH',
    NULL,
    0, 0,
    NULL,
    'fr', 'Europe/Monaco',
    'PENDING_KEY_GEN',
    'PENDING_KEY_GEN',
    'PENDING_KEY_GEN',
    'user_tardieu_christophe',
    'apex-sso',
    strftime('%s','now')*1000,
    'active'
  );

-- Contact mutuel Kevin ↔ Laurence (ils sont déjà amis)
INSERT OR IGNORE INTO contacts (user_id, contact_id, mutual_at, created_at) VALUES
  ('kdmc_admin', 'user_laurence', strftime('%s','now')*1000, strftime('%s','now')*1000),
  ('user_laurence', 'kdmc_admin', strftime('%s','now')*1000, strftime('%s','now')*1000);

-- Conversation DM Kevin ↔ Laurence pré-créée
INSERT OR IGNORE INTO conversations (
  id, type, name, created_by, created_at, sharded_to_do, member_count, last_msg_ts, e2e_version
) VALUES (
  'conv_kevin_laurence',
  'dm',
  NULL,                                         -- DM = pas de nom
  'kdmc_admin',
  strftime('%s','now')*1000,
  'do_conv_kevin_laurence',
  2,
  strftime('%s','now')*1000,
  1
);

INSERT OR IGNORE INTO conversation_members (conv_id, user_id, role, joined_at, kevin_invisible) VALUES
  ('conv_kevin_laurence', 'kdmc_admin', 'owner', strftime('%s','now')*1000, 0),     -- Kevin visible (c'est sa conv)
  ('conv_kevin_laurence', 'user_laurence', 'member', strftime('%s','now')*1000, 0); -- Laurence visible

-- ============================================================================
-- FIN migration 0001
-- ============================================================================
