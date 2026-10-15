-- ============================================================================
--  Migration 0018 — Lot C2 (audit A4 P1-2, 15.10.2026). Rejouable sans effet (IF NOT EXISTS).
--  « Mettre en muet » n'existait que sur le téléphone : le serveur envoyait quand même chaque
--  notification, app fermée. Le muet de chaque membre est désormais gardé ici, et le temps réel
--  (ConversationDO) ne pousse plus de notification de MESSAGE à un membre qui a coupé la conversation.
--  muted_until : NULL = muet sans fin ; sinon horodatage (ms) de fin du muet.
--  A6-16 : index de purge des statuts 24 h expirés (cron horaire).
-- ============================================================================
CREATE TABLE IF NOT EXISTS conv_mutes (
  conv_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  muted_until INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (conv_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_conv_mutes_user ON conv_mutes(user_id);
CREATE INDEX IF NOT EXISTS idx_stories_expires ON stories(expires_at);
