-- ============================================================================
--  Migration 0015 — Lot B vie privée (audit A6-01 / A6-06, 15.10.2026). Rejouable sans effet.
--  1) Cache des résumés IA : chaque ligne appartient désormais à un compte (user_id renseigné par
--     /api/ai/summarize). Les anciennes lignes SANS propriétaire (texte en clair de résumés, partagées
--     entre comptes, impossibles à effacer avec un compte) sont supprimées.
--  2) Index pour les purges quotidiennes (cron 03:00) : user_activity par date (30 jours) et
--     ai_summary_cache par propriétaire (effacement du compte).
-- ============================================================================
DELETE FROM ai_summary_cache WHERE user_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_ai_cache_user ON ai_summary_cache(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_ts ON user_activity(ts);
