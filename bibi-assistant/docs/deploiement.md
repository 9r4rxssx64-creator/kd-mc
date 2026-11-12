# Mettre Bibi sur Internet

Bibi est **un seul programme Node.js** (le serveur sert aussi l'application). Il lui faut :

- un endroit où **un programme Node 22.5+ tourne en continu** ;
- un **dossier qui survit aux redémarrages** (la base SQLite : `DATA_DIR`), sinon la synchronisation, les clés enregistrées dans l'application et les comptes disparaissent à chaque redémarrage ;
- une adresse **https://** (obligatoire pour le micro, l'installation comme appli et le mode hors ligne).

> Les prix et les limites ci-dessous changent souvent. Ils sont donnés **à titre d'ordre de grandeur, à vérifier sur la page de tarifs du service avant de t'engager**. Aucun n'a été mesuré pour ce document.

## Avant n'importe quel hébergeur : les 4 réglages obligatoires

Mets-les dans les « variables d'environnement » de l'hébergeur (jamais dans un fichier envoyé sur GitHub) :

```
NODE_ENV=production
SESSION_SECRET=<une phrase aléatoire de 32 caractères ou plus>
BIBI_ACCESS_CODE=<ton code>      # ou ENABLE_CLOUD_SYNC=true pour des comptes
GEMINI_API_KEY=<ta clé>          # ou GROQ_API_KEY / OPENROUTER_API_KEY
```

Commandes de construction et de lancement :

```
Installer :  npm ci
Construire : npm run build
Lancer :     npm start
```

Bibi lit la variable `PORT` fournie par l'hébergeur.

---

## Comparatif

| Option | Convient à Bibi ? | Disque durable | Coût (ordre de grandeur) | À savoir |
|---|---|---|---|---|
| **Un PC / mini-PC chez toi** + tunnel (Cloudflare Tunnel, Tailscale) | ✅ le plus simple | ✅ ton disque | 0 € (+ électricité) | Le PC doit rester allumé. Le tunnel donne le https. |
| **VPS** (Hetzner, OVH, Scaleway, DigitalOcean…) | ✅ le plus solide | ✅ | quelques € par mois | Tu gères le serveur (voir plus bas). |
| **Render** (Web Service) | ✅ | ✅ seulement avec un « disque persistant » (option payante) | offre gratuite sans disque : s'endort, données perdues ; avec disque : payant | Sans disque, ne l'utilise que pour tester. |
| **Railway** (service + volume) | ✅ | ✅ avec un « volume » | crédit d'essai puis facturation à l'usage | Ajoute un volume monté sur le dossier `data`. |
| **Vercel** | ❌ pas tel quel | ❌ | — | Fonctions sans état et sans disque durable : le serveur SQLite de Bibi n'y tient pas. Possible uniquement pour l'interface seule, avec le serveur ailleurs (`CORS_ORIGIN`), ce qui complique tout. Non testé. |
| **Supabase** | ❌ non pris en charge | — | — | Voir ci-dessous. |

### Supabase / PostgreSQL : pas implémenté

Le cahier des charges prévoyait SQLite **ou** Supabase/PostgreSQL. **Seul SQLite est implémenté.** La variable `DATABASE_URL` ne sait lire qu'un chemin `sqlite:/…`. Si tu mets une adresse `postgres://…`, Bibi **refuse de démarrer** avec un message clair plutôt que de l'ignorer (vérifié par un test automatique). Ajouter PostgreSQL demande d'écrire une 2ᵉ couche de stockage (le code est séparé dans `server/` pour que ce soit faisable) : ce n'est pas fait.

---

## Pas à pas : PC à la maison + Cloudflare Tunnel (gratuit)

1. Installe Node 22.5+, récupère le dossier, `npm ci`, `cp .env.example .env`, remplis `.env` (les 4 réglages ci-dessus).
2. `npm run build` puis `npm start` (laisse la fenêtre ouverte, ou utilise `pm2`/`systemd`).
3. Installe `cloudflared` (<https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/>) et crée un tunnel vers `http://localhost:3000`. Cloudflare te donne une adresse `https://…`.
4. Ouvre cette adresse sur ton téléphone, entre ton code d'accès, installe l'appli.

Limites : si le PC s'éteint ou perd Internet, Bibi est indisponible (le mode hors ligne de l'appli garde tes notes lisibles).

## Pas à pas : VPS

1. Crée un serveur Ubuntu LTS, connecte-toi en SSH, installe Node 22 (<https://nodejs.org>), `git`, et un proxy https (Caddy est le plus simple : il obtient le certificat tout seul).
2. Copie le projet, `npm ci`, `npm run build`, crée `.env`.
3. Lance Bibi avec `systemd` (redémarre tout seul) :
   ```
   [Service]
   WorkingDirectory=/opt/bibi-assistant
   EnvironmentFile=/opt/bibi-assistant/.env
   ExecStart=/usr/bin/node dist-server/server/index.js
   Restart=always
   ```
   (c'est exactement ce que fait `npm start`, après `npm run build`.)
4. Caddy : `bibi.exemple.fr { reverse_proxy localhost:3000 }`.
5. **Sauvegarde** le dossier `DATA_DIR` chaque nuit (`cp`, `rsync`, snapshot de l'hébergeur).
6. Pare-feu : n'ouvre que 80 et 443.

## Render

1. *New → Web Service*, relie le dépôt, *Root Directory* : `bibi-assistant`.
2. Build : `npm ci && npm run build` ; Start : `npm start`.
3. Variables d'environnement : les 4 réglages + `DATA_DIR=/var/data`.
4. **Ajoute un disque persistant** monté sur `/var/data`. Sans lui, le fichier SQLite est effacé à chaque redéploiement.

## Railway

1. *New Project → Deploy from GitHub*, dossier racine `bibi-assistant`.
2. Variables : les 4 réglages + `DATA_DIR=/data`.
3. Ajoute un **Volume** monté sur `/data`.

---

## Avant d'ouvrir Bibi à d'autres personnes

- Garde `ALLOW_REGISTRATION=false` : le premier compte est permis, les suivants non.
- Ne mets jamais `BIBI_ALLOW_OPEN=true` sur Internet : toute personne qui trouve l'adresse utiliserait **tes** clés d'IA (et épuiserait tes quotas).
- Chaque personne a sa propre mémoire et ses propres données (compte) ; mais **les clés d'IA du serveur sont partagées** entre tous les comptes.
- Surveille les quotas gratuits : plusieurs utilisateurs les épuisent plus vite.
