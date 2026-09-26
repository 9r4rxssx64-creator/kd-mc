-- v1.1.179 — Fusion de comptes en double SANS verrouillage.
-- Quand on regroupe les comptes d'une même personne (ex: 3 comptes Laurence),
-- les doublons reçoivent merged_into = id du compte gardé. getAuthUser SUIT ce
-- pointeur : un JWT encore lié à un compte fusionné agit comme le compte
-- canonique (au lieu d'être rejeté → plus de "messages qui n'arrivent pas").
ALTER TABLE users ADD COLUMN merged_into TEXT;
CREATE INDEX IF NOT EXISTS idx_users_merged_into ON users(merged_into);
