# Apex Chat — sauvegarde, restauration, alertes (lot E2, 15.10.2026)

Ce document dit **où vit chaque chose** et **quoi faire le jour J**. Il ne contient aucun secret
et ne doit jamais en contenir.

## 1. La sauvegarde quotidienne

- **Quand** : chaque jour à 03:00 UTC, par le cron Cloudflare du worker `apex-chat-api`
  (aucun cron GitHub).
- **Comment** : une page de 100 lignes au plus par invocation, enchaînées par la file
  `apex-chat-letters-deliver` (message `backup-step`). Chaque page est chiffrée, puis un
  **manifeste** chiffré est écrit **en dernier**. Une sauvegarde sans manifeste est incomplète.
- **Où** : bucket R2 `apex-chat-media`, dossier `backups/d1-AAAA-MM-JJ/` (`manifest.enc`,
  `p00000.enc`, `p00001.enc`…). Conservation : 14 jours.
- **Résultat** : `system_config.backup_last_ok` / `backup_last_error` (visible dans
  `/api/admin/diag`). `/api/health` dit `"backup": "stale"` si la dernière réussite a plus de 26 h.
- **Code** : `messaging-app/workers/lib/backup.js`.

## 2. La clé : `BACKUP_ENCRYPTION_KEY`

La clé chiffre toutes les sauvegardes. **Sans elle, aucune sauvegarde ne se relit.**

Elle doit exister à **trois** endroits, et seulement là :

| Où | Pourquoi |
|---|---|
| Secret GitHub `BACKUP_ENCRYPTION_KEY` du **coffre** (CMCteams) | la bascule le recopie vers kd-mc ; le déploiement le pose dans le worker ; l'exercice de restauration s'en sert |
| Secret du worker `apex-chat-api` | posé par `deploy-apex-chat.yml` (étape « Generate + put secrets ») |
| **Hors ligne, chez Kevin** (gestionnaire de mots de passe) | le jour où GitHub ET Cloudflare sont perdus |

Jamais dans un document, un ticket, un message ou un fichier du dépôt.

Créer la clé (une seule fois) : `openssl rand -hex 32`. La changer rend illisibles les
sauvegardes déjà faites avec l'ancienne : garder l'ancienne 14 jours.

Sans le secret, le worker se replie sur `JWT_SIGN_KEY` (sauvegarde quand même, mais **personne
ne peut la relire hors du worker**) et le signale (`key_warning: "jwt-fallback"`, télémétrie).

## 3. Restaurer

### Exercice (recommandé une fois par mois)

GitHub → coffre CMCteams → Actions → « Apex Chat — Exercice de restauration (manuel) » →
Run workflow. Il télécharge la sauvegarde la plus récente, la déchiffre, reconstruit une base
SQLite complète et compte les lignes table par table. Il n'affiche aucune donnée et efface tout
à la fin.

### Pour de vrai

```sh
cd messaging-app/workers
J=2026-10-15; D=/tmp/bk; mkdir -p $D
npx wrangler r2 object get apex-chat-media/backups/d1-$J/manifest.enc --remote --file $D/manifest.enc
export BACKUP_ENCRYPTION_KEY=…            # depuis le gestionnaire de mots de passe
for p in $(node ../tools/backup-restore.mjs $D --list-parts); do
  npx wrangler r2 object get apex-chat-media/backups/d1-$J/$p --remote --file $D/$p
done
node ../tools/backup-restore.mjs $D --sqlite /tmp/apex.db     # vérifie table par table
node ../tools/backup-restore.mjs $D --sql /tmp/restore.sql     # fichier pour D1
npx wrangler d1 create apex-chat-restore-test                  # base JETABLE d'abord
npx wrangler d1 execute apex-chat-restore-test --remote --file /tmp/restore.sql
```

Remplacer la base de production ne se fait qu'après avoir vérifié la base jetable.
Alternative pour une erreur récente (moins de quelques jours) : D1 Time Travel —
`npx wrangler d1 time-travel restore apex-chat-main --bookmark=<signet>` ; le signet d'avant
chaque migration est écrit dans le résumé du déploiement.

Anciennes sauvegardes (fichier unique `d1-AAAA-MM-JJ.json.enc`, avant le lot E2) : elles sont
chiffrées avec `JWT_SIGN_KEY`, qu'on ne peut pas relire hors du worker. L'outil les lit si l'on
fournit `JWT_SIGN_KEY` ; elles disparaissent d'elles-mêmes en 14 jours.

## 4. Être prévenu d'une panne

- `/api/health` vérifie D1, un Durable Object et l'âge de la sauvegarde (503 si D1 ou DO tombe).
- La sonde `kdmc-uptime` (toutes les 2 h, cron de `kdmc-outlook`) l'interroge par service
  binding et notifie l'iPhone (push).
- **Hors Cloudflare** : à chaque passage, la sonde appelle un « battement » externe
  (`HEARTBEAT_URL`, secret GitHub `UPTIME_HEARTBEAT_URL`). Une panne envoie `/fail` (alerte
  immédiate). Si plus rien n'arrive (compte Cloudflare en panne ou quota dépassé), le service
  externe prévient par e-mail. Service conseillé : healthchecks.io (gratuit), contrôle
  « période 2 h, grâce 1 h ».

## 5. Migrations D1

Chaque fichier de `d1-migrations/` est appliqué **une seule fois**, noté dans la table
`_migrations` (nom + empreinte). Ne jamais modifier une migration déjà appliquée : en ajouter une
nouvelle. Moteur : `messaging-app/tools/d1-migrations-runner.mjs`.
