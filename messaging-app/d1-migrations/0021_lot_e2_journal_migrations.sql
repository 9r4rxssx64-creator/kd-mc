-- ============================================================================
--  Migration 0021 — Lot E2 (audit A5, F7, 15.10.2026) : journal des migrations appliquées.
--  Chaque fichier de d1-migrations/ n'est plus rejoué à chaque déploiement : il est exécuté UNE
--  fois puis noté ici (nom + empreinte SHA-256). Le moteur (tools/d1-migrations-runner.mjs)
--  crée lui-même cette table avant de la lire ; ce fichier la déclare pour que toute base
--  construite depuis les migrations (tests, restauration) ait la même forme. Rejouable sans effet.
-- ============================================================================
CREATE TABLE IF NOT EXISTS _migrations (filename TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL, mode TEXT);
