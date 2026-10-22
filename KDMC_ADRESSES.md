# 🌐 KDMC_ADRESSES.md — Liste officielle des adresses (toujours à jour)

> Domaine principal : **kd-mc.com** (Cloudflare, compte principal `425377ca…`).
> Règle : **une belle adresse par projet** (un sous-domaine par app), servie par le worker unique
> `kdmc-router` (`services/kdmc-router/wrangler.toml` = la liste qui fait foi : 32 adresses).
> **Dernière mesure réelle : 22.10.2026** (HTTPS depuis une session, une requête par adresse).
> 🔒 401 = la porte demande un compte (normal : « aucune consultation sans compte »), pas une panne.

## 🖥️ Les apps du domaine (mesuré le 22.10.2026)

| Adresse | Ce que c'est | Mesure |
|---|---|---|
| https://kd-mc.com · https://www.kd-mc.com | Portail du domaine | 200 · 200 |
| https://cmcteams.kd-mc.com | CMCteams (planning du casino) | 200 |
| https://cmcteams-light.kd-mc.com · https://departs.kd-mc.com | CMCteams light (départs) — même app, deux adresses | 200 · 200 |
| https://apex-ai.kd-mc.com | Apex AI | 200 |
| https://apex-chat.kd-mc.com | Apex Chat (messagerie) | 200 |
| https://javis.kd-mc.com | Javis / Bee (assistant de Kevin) | 200 |
| https://arbre.kd-mc.com | Arbre généalogique (code famille) | 200 |
| https://lingua.kd-mc.com | Lingua (langues) | 200 |
| https://studio.kd-mc.com | Créa Studio (vidéo, photo, dessin animé) | 200 |
| https://la-detente.kd-mc.com | La Détente | 200 |
| https://chez-lolo.kd-mc.com | Chez Lolo | 200 |
| https://shops.kd-mc.com | Portail boutiques | 200 |
| https://dashboard.kd-mc.com | Tableau de bord des boutiques | 200 |
| https://sourcing.kd-mc.com | Sourcing des boutiques | 200 |
| https://rotaplan.kd-mc.com | Rotaplan (planning en rotation, offre B2B) | 200 |
| https://kit.kd-mc.com | Kit IA de l'indépendant | 200 |
| https://croupier.kd-mc.com | Devenir croupier (guide) | 200 |
| https://coffre.kd-mc.com | Coffre-fort | 200 |
| https://autorisations.kd-mc.com | Coffre d'autorisations (admin) | 200 |
| https://bot.kd-mc.com | Tableau de bord crypto-bot (admin) | 200 |
| https://beatbot.kd-mc.com | PoolPilot (robot piscine) | 200 |
| https://worldmonitor.kd-mc.com | World Monitor | 🔒 401 |
| https://osint.kd-mc.com | OSINT | 🔒 401 |
| https://ia.kd-mc.com | Outils IA | 🔒 401 |
| https://outils.kd-mc.com | Mes outils gratuits | 🔒 401 |
| https://dossiers.kd-mc.com | Index de sources officielles | 🔒 401 |
| https://tor.kd-mc.com | « Tor en clair » (guide) | 🔒 401 |
| https://cuisine.kd-mc.com · https://cocina.kd-mc.com · https://cujina.kd-mc.com | Livre de cuisine de la Riviera — un livre, trois adresses | 🔒 401 ×3 |

## ⚙️ Serveurs (coulisses)

**Il n'existe AUCUNE belle adresse serveur.** `api`, `chat-api`, `push`, `auth`, `secrets` et `vault.kd-mc.com`,
annoncées « à activer » le 06.06, n'ont jamais été créées : le DNS répond « n'existe pas » (NXDOMAIN, mesuré le 22.10).
Les apps appellent les workers par leur adresse `*.9r4rxssx64.workers.dev` (compte principal) ou par les chemins
`/__…` du routeur, sur l'adresse de l'app elle-même. Ne pas écrire ces six adresses dans du code.

| Worker | Mesure de la racine `/` (22.10) |
|---|---|
| `apex-chat-api` | répond (404 « Route inconnue » à la racine : normal) |
| `apex-auth-worker` | répond (404 `not_found` à la racine : normal) |
| `apex-push-worker` | répond (401 : normal) |
| `apex-secrets-proxy` | répond 200 à la racine (signalé par l'audit du 22.10, point 3 : à fermer) |
| `apex-v13-backend` · `apex-vault-svc` | `error code: 1042` (Cloudflare n'exécute pas le worker à cette adresse) — à vérifier par la session qui a la clé Cloudflare, sans conclure ici |

> Ajouter une app = l'ajouter dans `services/kdmc-router/wrangler.toml` ET dans ce tableau, dans le même commit
> (garde `tests/portail-adresses.test.mjs` pour le portail). Remesurer : `curl -s -o /dev/null -w '%{http_code}' https://<adresse>/`.

---

## 📜 Historique (gardé tel quel)

> Le 06.06.2026, ce fichier listait 7 adresses (portail, cmcteams, apex-ai, apex-chat, la-detente, chez-lolo, www)
> et 6 adresses serveurs « à activer » qui ne l'ont jamais été (voir ci-dessus).

## 🔧 Mise à jour 2026-08-13 — « pourquoi les adresses ne sont pas pareilles ? » (Kevin)

**Ce qui n'allait pas (mesuré sur le portail en ligne, 32 cartes) : 6 adresses fausses.**

| Carte | Ce qui était affiché | Où le clic menait VRAIMENT |
|---|---|---|
| Portail boutiques | `kd-mc.com → shops` | ❌ `9r4rxssx64-creator.github.io/CMCteams/shops/` |
| Tech Hub | `kd-mc.com → tech-hub` | ❌ github.io |
| EcoCraft | `kd-mc.com → ecocraft` | ❌ github.io |
| Digital Vault | `kd-mc.com → digital-vault` | ❌ github.io |
| Pawsome | `kd-mc.com → pawsome` | ❌ github.io |
| CMCteams light | `cmcteams-light.kd-mc.com` | ❌ `departs.kd-mc.com` |

Deux problèmes réels, pas cosmétiques : l'adresse affichée **mentait**, et cinq clics
**sortaient du domaine** (adresse technique exposée, session du domaine perdue).

**Correctif — retour à la règle de ce document : UNE belle adresse par projet.**

5 belles adresses ajoutées (les anciens chemins restent valides, rien ne casse) :

| Projet | Belle adresse | Sert |
|---|---|---|
| World Monitor | https://worldmonitor.kd-mc.com | `kdmc-home/worldmonitor` |
| OSINT | https://osint.kd-mc.com | `kdmc-home/osint` |
| Outils IA | https://ia.kd-mc.com | `kdmc-home/ia` |
| Mes outils gratuits | https://outils.kd-mc.com | `kdmc-home/outils` |
| Portail boutiques | https://shops.kd-mc.com | `shops/` (ne vivait QUE sur github.io) |

Les 4 boutiques en construction deviennent `shops.kd-mc.com/tech-hub/`, `/ecocraft/`,
`/digital-vault/`, `/pawsome/` — des pages **du** portail boutiques, comme « Messages »
est une page de CMCteams. Elles prendront leur propre belle adresse une fois construites
(comme `chez-lolo` et `la-detente`).

**Garde-fou** : `tests/portail-adresses.test.mjs` (câblé dans `test:ci`, 110 vérifications)
interdit désormais qu'une carte sorte du domaine, exige que **l'adresse affichée SOIT la
destination**, et vérifie que chaque belle adresse citée existe vraiment dans le routeur
ET dans `wrangler.toml` (sinon : ni DNS ni certificat = page morte). Prouvé qu'il rougit.
Les 5 nouvelles adresses sont aussi ouvertes pour de vrai par `verif-reelle.yml`.
