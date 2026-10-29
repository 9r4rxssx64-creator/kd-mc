-- RÉPARATION DE FOND du pont, À PASSER DÈS QUE D1 RÉPOND (après minuit UTC) — Kevin 25.10.2026.
-- Cause du blocage : quota GRATUIT de lecture de D1 (5 M lignes/jour pour tout le compte) dépassé ; chaque lecture du Tableau parcourait toute la table
-- (~1 700 lignes × 5 requêtes toutes les 30 s). Avec ces index, une lecture « mes messages depuis l'id N » coûte quelques lignes.
-- (29.10 : idx_messages_a_id / idx_messages_de_id de pc-config font le même travail que ix_messages_a_id / _de_id : UN seul jeu doit rester, sinon chaque écriture paie deux fois)
CREATE INDEX IF NOT EXISTS idx_messages_a_id ON messages(a, id);
CREATE INDEX IF NOT EXISTS idx_messages_de_id ON messages(de, id);
CREATE INDEX IF NOT EXISTS ix_messages_ts ON messages(ts);
CREATE INDEX IF NOT EXISTS ix_taches_qui ON taches(qui);
-- (29.10, mesuré : sans la borne `id BETWEEN NEW.id - 300 …` chaque écriture relisait la table entière, 1 168 lignes lues par message.)
-- Une branche qui RÉPOND a lu ce qui lui était adressé (plus vieux de 2 min) : fin des « non lu » éternels (pc-config en avait un depuis le n° 911).
CREATE TRIGGER IF NOT EXISTS lu_implicite AFTER INSERT ON messages
WHEN NEW.de NOT IN ('kevin','kevin-tableau','veille-pont')
BEGIN
  UPDATE messages SET lu_par = COALESCE(lu_par,'') || NEW.de || ';'
  WHERE id BETWEEN NEW.id - 300 AND NEW.id - 1 AND ts < NEW.ts - 120000
    AND (a = 'toutes' OR ';' || a || ';' LIKE '%;' || NEW.de || ';%')
    AND instr(COALESCE(lu_par,''), NEW.de || ';') = 0;
END;
