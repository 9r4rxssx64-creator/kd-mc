-- 08.10.2026 (revue de code) — kdmc_uid (lien compte domaine kd-mc.com) n'était
-- créée qu'« à la volée » par handleSsoFromKdmc. Toute requête qui la touchait
-- échouait sur une base où personne ne s'était encore connecté par le domaine
-- (ex. l'anonymisation RGPD de DELETE /api/users/me). Déjà présente → ignoré
-- par le déploiement (« duplicate column » toléré).
ALTER TABLE users ADD COLUMN kdmc_uid TEXT;
