-- 22.10.2026 (Apex Chat v1.1.345) — une clé par appareil, GROUPES : chaque appareil signe ses messages de groupe
-- avec SA clé de signature (ECDSA P-256, préfixe « GSIG1: »). Avant : une seule clé de signature par compte
-- (la dernière publiée gagne) → les messages de groupe d'un autre appareil du même compte devenaient
-- « ⚠️ message non authentifié » chez les autres membres.
ALTER TABLE user_devices ADD COLUMN signing_key_pub TEXT;
