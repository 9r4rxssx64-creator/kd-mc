-- v1.1.299 (09.10.2026, Kevin « Personne n'est connecté, libère ») — prekey_signed est rendu au futur échange PQXDH.
-- Rattrapage : une clé de signature « GSIG1: » publiée en v1.1.297/298 dans prekey_signed passe dans signing_key_pub
-- (si la colonne est encore vide), puis prekey_signed retrouve sa valeur d'attente 'PENDING_PQXDH'. Rejouable sans effet.
UPDATE users SET signing_key_pub = prekey_signed
  WHERE prekey_signed LIKE 'GSIG1:%' AND (signing_key_pub IS NULL OR signing_key_pub = '');
UPDATE users SET prekey_signed = 'PENDING_PQXDH' WHERE prekey_signed LIKE 'GSIG1:%';
