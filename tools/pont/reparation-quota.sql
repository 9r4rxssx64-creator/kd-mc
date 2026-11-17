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
-- (17.11, apex-cloud) une date écrite en secondes est remise en millisecondes, sinon le message est trié tout en bas.
CREATE TRIGGER IF NOT EXISTS ts_en_millisecondes AFTER INSERT ON messages WHEN NEW.ts < 100000000000
BEGIN UPDATE messages SET ts = NEW.ts*1000 WHERE id = NEW.id; END;
