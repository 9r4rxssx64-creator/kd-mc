-- ============================================================================
--  Migration 0017 — Lot C1 (audit A2-06 / A6-18 / A6-20, v1.1.304). Rejouable sans effet
--  (IF NOT EXISTS), aucune donnée modifiée.
--  1) Quota d'envoi de fichiers PAR COMPTE sur 24 h glissantes (handleMediaUpload) :
--     COUNT/SUM sur media(owner_id, uploaded_at).
--  2) Effacement du compte (handleDeleteMe) : capsules temporelles (expéditeur ET destinataire)
--     et lettres différées de l'expéditeur, effacées sans balayer toute la table.
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_media_owner_uploaded ON media(owner_id, uploaded_at);
CREATE INDEX IF NOT EXISTS idx_capsules_sender ON time_capsules(sender_id);
CREATE INDEX IF NOT EXISTS idx_capsules_recipient ON time_capsules(recipient_id);
CREATE INDEX IF NOT EXISTS idx_letters_sender ON letters_queue(sender_id);
