-- Lot 2 (V) — Accès aux médias par conversation.
-- Un média n'était lisible qu'en vérifiant « le demandeur partage UNE conversation
-- avec l'auteur » : une photo d'un DM privé devenait lisible par les membres de
-- n'importe quel groupe commun. Le média retient désormais SA conversation
-- (NULL pour les anciens médias, qui gardent l'ancienne règle).
-- Rejouable : le déploiement tolère « duplicate column ».
ALTER TABLE media ADD COLUMN conv_id TEXT;
CREATE INDEX IF NOT EXISTS idx_media_conv ON media(conv_id) WHERE conv_id IS NOT NULL;
