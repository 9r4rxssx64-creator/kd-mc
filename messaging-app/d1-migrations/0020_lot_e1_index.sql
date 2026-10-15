-- Migration 0020 — Lot E1 (audit A5 F9/F11, 15.10.2026) : coûts du plan gratuit. IDEMPOTENTE (rejouée à chaque
-- déploiement : uniquement IF EXISTS / IF NOT EXISTS, aucun ALTER).
--
-- 1) Index en DOUBLE : chaque index ajoute une ligne écrite à chaque INSERT (quota D1 gratuit : 100 000/jour).
--    idx_activity_user_ts2 = idx_activity_user_ts (0002) : user_activity(user_id, ts DESC) → +1 écriture par battement.
--    idx_audit_actor_ts2   = idx_audit_actor_ts   (0001) : audit_log(actor_id, ts DESC)    → +1 écriture par audit.
--    Leurs CREATE ont aussi été retirés de 0003 (sinon chaque déploiement les reconstruisait, ligne par ligne).
DROP INDEX IF EXISTS idx_activity_user_ts2;
DROP INDEX IF EXISTS idx_audit_actor_ts2;

-- 2) Parcours complets de `messages` signalés : par expéditeur (export RGPD, effacement de compte, fusion de
--    doublons, comptages admin, résumé IA) et purge des messages éphémères (cron). L'index sur expires_at est
--    PARTIEL : un message sans expiration (le cas courant) ne coûte aucune écriture de plus.
CREATE INDEX IF NOT EXISTS idx_msgs_sender_ts ON messages(sender_id, ts);
CREATE INDEX IF NOT EXISTS idx_msgs_expires ON messages(expires_at) WHERE expires_at IS NOT NULL;

-- 3) Verrou des « soins » de la liste de conversations (au plus 1 fois / 10 min, global et par personne).
--    Avant : KV (1 000 écritures/jour pour TOUT le compte kd-mc) — 2 écritures toutes les 10 min par personne
--    active ; et KV en panne = soins à CHAQUE appel. Ici : une ligne par clé, écrite seulement quand le verrou
--    est pris (UPSERT conditionnel : un verrou encore valide ne coûte aucune écriture).
CREATE TABLE IF NOT EXISTS heal_locks (
  key TEXT PRIMARY KEY,
  ts  INTEGER NOT NULL
) WITHOUT ROWID;
