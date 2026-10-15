-- ============================================================================
--  Migration 0022 — tickets WebSocket à usage unique (v1.1.286), table déclarée une fois.
--  Avant : chaque connexion au chat lançait `CREATE TABLE IF NOT EXISTS ws_tickets` puis un ménage
--  (3 requêtes D1 par connexion, sur le quota gratuit du compte entier). Maintenant la table existe
--  par migration ; le code ne la recrée que si elle manque vraiment (« no such table »). Rejouable.
-- ============================================================================
CREATE TABLE IF NOT EXISTS ws_tickets (jti TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
