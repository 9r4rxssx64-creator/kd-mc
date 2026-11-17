-- RÉPARATION DE FOND du pont, À PASSER DÈS QUE D1 RÉPOND (après minuit UTC) — Kevin 25.10.2026.
-- Cause du blocage : quota GRATUIT de lecture de D1 (5 M lignes/jour pour tout le compte) dépassé ; chaque lecture du Tableau parcourait toute la table
-- (~1 700 lignes × 5 requêtes toutes les 30 s). Avec ces index, une lecture « mes messages depuis l'id N » coûte quelques lignes.
-- (29.10 : idx_messages_a_id / idx_messages_de_id de pc-config font le même travail que ix_messages_a_id / _de_id : UN seul jeu doit rester, sinon chaque écriture paie deux fois)
CREATE INDEX IF NOT EXISTS idx_messages_a_id ON messages(a, id);
CREATE INDEX IF NOT EXISTS idx_messages_de_id ON messages(de, id);
CREATE INDEX IF NOT EXISTS ix_messages_ts ON messages(ts);
CREATE INDEX IF NOT EXISTS ix_taches_qui ON taches(qui);
-- (29.10, mesuré : sans la borne `id BETWEEN NEW.id - 300 …` chaque écriture relisait la table entière, 1 168 lignes lues par message.)
-- 17.11 (pont 2580, Kevin : « des messages se perdent ») : l'ancien déclencheur lu_implicite marquait « lu » TOUT message adressé à une branche dès qu'elle écrivait
-- n'importe quoi, même sans l'avoir ouvert : le tableau disait « lu » et personne ne relançait. Remplacé par lu_par_citation :
-- un message adressé à X n'est « lu par X » que si X CITE son numéro (sujet « RE 2576 … » ou « (2578) » dans le texte, nombre entier, pas un morceau d'un autre nombre).
-- Les messages à « toutes » restent marqués vus dès que la branche écrit (ils n'attendent pas de réponse). Toujours borné aux 300 derniers numéros (quota D1).
DROP TRIGGER IF EXISTS lu_implicite;
CREATE TRIGGER IF NOT EXISTS lu_par_citation AFTER INSERT ON messages
WHEN NEW.de NOT IN ('kevin','kevin-tableau','veille-pont')
BEGIN
  UPDATE messages SET lu_par = COALESCE(lu_par,'') || NEW.de || ';'
  WHERE id BETWEEN NEW.id - 300 AND NEW.id - 1 AND de <> NEW.de
    AND instr(COALESCE(lu_par,''), NEW.de || ';') = 0
    AND ((a = 'toutes' AND ts < NEW.ts - 120000)
      OR (';' || a || ';' LIKE '%;' || NEW.de || ';%'
          AND (' ' || NEW.sujet || ' ' || NEW.corps || ' ') GLOB '*[^0-9]' || id || '[^0-9]*'));
END;
-- 17.11 : l'heure d'un message est celle du PONT. Trois messages portaient une heure fausse (un an plus tôt, six jours plus tard, ou en secondes) : triés ailleurs, donc « perdus ».
-- Toute heure qui s'écarte de plus de 10 minutes de l'heure réelle est remplacée par l'heure réelle (remplace ts_en_millisecondes d'apex-cloud, même idée, plus large).
DROP TRIGGER IF EXISTS ts_en_millisecondes;
CREATE TRIGGER IF NOT EXISTS ts_serveur AFTER INSERT ON messages
WHEN abs(NEW.ts - CAST(strftime('%s','now') AS INTEGER)*1000) > 600000
BEGIN UPDATE messages SET ts = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id = NEW.id; END;
-- 17.11 : même règle pour les prises (une prise datée du 23.11 restait en tête du tableau).
CREATE TRIGGER IF NOT EXISTS ts_serveur_prises AFTER INSERT ON prises
WHEN abs(NEW.ts - CAST(strftime('%s','now') AS INTEGER)*1000) > 600000
BEGIN UPDATE prises SET ts = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE cle = NEW.cle; END;
CREATE TRIGGER IF NOT EXISTS ts_serveur_prises_maj AFTER UPDATE OF ts ON prises
WHEN abs(NEW.ts - CAST(strftime('%s','now') AS INTEGER)*1000) > 600000
BEGIN UPDATE prises SET ts = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE cle = NEW.cle; END;
