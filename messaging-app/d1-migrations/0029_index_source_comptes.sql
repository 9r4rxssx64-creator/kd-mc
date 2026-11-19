-- 19.11.2026 (cloud-installer 2813, quotas gratuits D1 : 5 M de lignes lues par jour pour TOUT le compte).
-- Le nettoyage des comptes de test (robots) cherchait « source = 'e2e-test' » sans index : toute la table users lue à chaque appel (522 lignes, 856 appels en 7 jours).
CREATE INDEX IF NOT EXISTS idx_users_source ON users(source);
