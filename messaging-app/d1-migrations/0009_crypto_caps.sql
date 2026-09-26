-- v1.1.261 — Négociation de capacités crypto.
-- Chaque client publie ce qu'il sait DÉCHIFFRER (ex "e2e2,media") en même temps
-- que sa clé publique. L'expéditeur active alors automatiquement le plus haut
-- niveau que les DEUX pairs supportent → forward secrecy / média chiffrés ON par
-- défaut entre clients à jour, SANS casser un contact sur une ancienne version
-- (qui ne publie pas la capacité → l'expéditeur reste sur E2E1 lisible par lui).
ALTER TABLE users ADD COLUMN crypto_caps TEXT;
