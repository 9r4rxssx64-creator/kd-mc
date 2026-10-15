-- Lot A (audit A2, 15.10.2026) — index du rattrapage des messages manqués (ConversationDO, trame
-- `history_since`). Rejouable sans effet (IF NOT EXISTS), aucune donnée modifiée.
-- A2-03 : pagination par curseur (ts, id) dans l'ordre croissant, bornée par conversation.
CREATE INDEX IF NOT EXISTS idx_msgs_conv_ts_id ON messages(conv_id, ts, id);
-- A2-16 : éditions / suppressions faites pendant l'absence d'un appareil (renvoyées au rattrapage).
CREATE INDEX IF NOT EXISTS idx_msgs_conv_edited ON messages(conv_id, edited_at) WHERE edited_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_msgs_conv_deleted ON messages(conv_id, deleted_at) WHERE deleted_at IS NOT NULL;
