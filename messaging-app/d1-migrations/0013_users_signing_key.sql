-- v1.1.298 (09.10.2026) — Clé publique de SIGNATURE des messages de groupe (« GSIG1:… », ECDSA P-256).
-- v1.1.297 la rangeait dans prekey_signed, champ réservé au futur échange PQXDH : collision assurée le jour
-- où PQXDH s'active. Elle a maintenant sa propre colonne ; prekey_signed reste écrit pendant la transition
-- (les téléphones en v1.1.297 le lisent), puis sera rendu à PQXDH.
ALTER TABLE users ADD COLUMN signing_key_pub TEXT;
