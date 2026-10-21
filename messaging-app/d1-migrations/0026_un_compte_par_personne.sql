-- 21.10.2026 (Kevin : « Un seul compte possible par personne »).
-- Une personne du domaine kd-mc.com = UN seul compte Apex Chat actif : la base elle-même refuse un 2e compte actif pour le même uid du domaine
-- (deux premières connexions simultanées, rejeu, bug : l'une des deux échoue proprement et reprend le compte existant — voir handleSsoFromKdmc).
-- Les comptes supprimés (RGPD) ne comptent pas.
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_kdmc_uid_actif ON users(kdmc_uid) WHERE kdmc_uid IS NOT NULL AND status != 'deleted';
