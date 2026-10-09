-- 08.10.2026 (revue de code, A1) — claimed_at : date de la PREMIÈRE connexion
-- prouvée (OTP SMS ou SSO) d'un compte pré-créé par une invitation
-- (source 'user-invitation' / 'invitation'). À ce moment, le worker pose aussi
-- last_force_logout_at : toute session ouverte AVANT (ex. l'inviteur qui a
-- ouvert lui-même le lien magique) est refusée. Posée une seule fois.
-- Déjà présente → ignoré par le déploiement (« duplicate column » toléré).
ALTER TABLE users ADD COLUMN claimed_at INTEGER;
