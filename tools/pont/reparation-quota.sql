-- RÉPARATION DE FOND du pont, À PASSER DÈS QUE D1 RÉPOND (après minuit UTC) — Kevin 25.10.2026.
-- Cause du blocage : quota GRATUIT de lecture de D1 (5 M lignes/jour pour tout le compte) dépassé ; chaque lecture du Tableau parcourait toute la table
-- (~1 700 lignes × 5 requêtes toutes les 30 s). Avec ces index, une lecture « mes messages depuis l'id N » coûte quelques lignes.
CREATE INDEX IF NOT EXISTS ix_messages_a_id ON messages(a, id);
CREATE INDEX IF NOT EXISTS ix_messages_de_id ON messages(de, id);
CREATE INDEX IF NOT EXISTS ix_messages_ts ON messages(ts);
CREATE INDEX IF NOT EXISTS ix_taches_qui ON taches(qui);
-- Une branche qui RÉPOND a lu ce qui lui était adressé (plus vieux de 2 min) : fin des « non lu » éternels (pc-config en avait un depuis le n° 911).
CREATE TRIGGER IF NOT EXISTS lu_implicite AFTER INSERT ON messages
WHEN NEW.de NOT IN ('kevin','kevin-tableau','veille-pont')
BEGIN
  UPDATE messages SET lu_par = COALESCE(lu_par,'') || NEW.de || ';'
  WHERE id < NEW.id AND ts < NEW.ts - 120000
    AND (a = 'toutes' OR ';' || a || ';' LIKE '%;' || NEW.de || ';%')
    AND instr(COALESCE(lu_par,''), NEW.de || ';') = 0;
END;
