-- Audit quota 16.10.2026 : la requête « clés de groupe » relisait toute la conversation à
-- chaque connexion (un DM n'en a aucune). Index partiel = lecture de 0 ligne.
CREATE INDEX IF NOT EXISTS idx_msgs_grpkey ON messages(conv_id, ts DESC) WHERE mime='application/x-apex-grpkey';
