-- ============================================================================
--  Migration 0005 — Table otp_pending
--
--  Cause racine bug v1.1.134 (HTTP 500 verify-otp) :
--  api-worker.js fait SELECT FROM otp_pending dans handleVerifyOtp, mais la
--  table n'etait creee qu'en runtime par send-otp (CREATE IF NOT EXISTS).
--  Si verify-otp est appele avant tout send-otp sur une D1 fraiche →
--  "no such table: otp_pending" → exception → 500.
--
--  Cette migration cree la table de facon deterministe au deploiement.
-- ============================================================================

CREATE TABLE IF NOT EXISTS otp_pending (
  phone_hash  TEXT PRIMARY KEY,        -- SHA256 du numero E.164
  otp_hash    TEXT NOT NULL,           -- SHA256(otp + ':' + phone)
  attempts    INTEGER DEFAULT 0,       -- compteur tentatives (max 5)
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL         -- TTL 5 min
);

CREATE INDEX IF NOT EXISTS idx_otp_pending_expires ON otp_pending(expires_at);
