-- Plafond de nouvelles conversations par jour et par compte (audit 16.10.2026) : lecture par créateur + date, sans balayer la table.
CREATE INDEX IF NOT EXISTS idx_conv_createur_ts ON conversations(created_by, created_at);
