-- v1.1.165 — split en fichiers individuels pour qu'un échec idempotent
-- (colonne déjà créée) ne bloque pas les autres ALTER. Le workflow
-- deploy-apex-chat.yml capture l'échec par fichier via || ::warning.
ALTER TABLE users ADD COLUMN first_name TEXT;
