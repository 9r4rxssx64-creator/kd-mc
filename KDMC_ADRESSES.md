# 🌐 KDMC_ADRESSES.md — Liste officielle des adresses (toujours à jour)

> Domaine principal : **kd-mc.com** (Cloudflare, compte principal `425377ca…`).
> Règle : **une belle adresse par projet** (un sous-domaine par app), servie par le worker unique
> `kdmc-router` (`services/kdmc-router/wrangler.toml` = la liste qui fait foi : 32 adresses).
> **Dernière mesure réelle : 22.10.2026** (HTTPS depuis une session, une requête par adresse).
> 🔒 401 = la porte demande un compte (normal : « aucune consultation sans compte »), pas une panne.

## 🧪 Staging (environnement de TEST) — mesuré le 23.10.2026

**Il n'existe qu'UN seul environnement de test : « staging ». Il n'y a PAS de « dev »** (dev.kd-mc.com, test.kd-mc.com, apex-chat-staging.kd-mc.com… : aucun DNS).

| Adresse | Rôle | Mesure |
|---|---|---|
| https://apex-chat-api-staging.9r4rxssx64.workers.dev/ | **Apex Chat de TEST (page + API)** — base `staging-apex-chat`, bandeau « STAGING », inscription par numéro de test + code `000000` (ne marche que là). **C'est ICI qu'on travaille.** | 200 · `/api/health` 200 (1.1.346) |
| https://staging.kd-mc.com | Porte d'entrée du test (admin seul, noindex) : une page avec le bouton vers l'adresse ci-dessus. Ne contient aucune appli. | 200 (la porte) |

- **Décision finale du 24.10.2026 (Kevin : « tu décides, workers.dev ou pas c'est pas grave, sécurisé et fonctionnel »)** : on garde ces DEUX adresses, rien d'autre. L'appli n'est PAS servie sous `staging.kd-mc.com` : cela exigerait de modifier le routeur central du domaine (une erreur coupe toutes les apps) pour un gain seulement visuel, et le test réel y demanderait la session admin de Kevin. L'appli de test ne contient aucune donnée réelle (base à part, ni SMS, ni push, ni cron, ni SSO). Annule `pont 624, 639, 723 (partie « servir sous kd-mc.com »), 743`. Message du pont n° 757.
- Autres apps (Arbre, Lingua, Bee, boutiques, CMCteams…) : **pas de version de test** — on les essaie sur leur adresse habituelle, en lecture seule.
- Pas de SSO du domaine / Face ID, pas de SMS, pas de push, pas de crons au staging ; appels en direct seulement.
- Remise à zéro + preuve « aucune trace » : robot public `staging-apex-chat-donnees.yml` (actions `reset`, `aucune-trace`, `cycle`). Redéployer : `deploy-apex-chat-staging.yml`.
- Ressources : D1 `staging-apex-chat` (655bac27-c95d-4fb5-8fb4-b5dc90328678), KV `staging-ACCOUNTS`, R2 `apex-chat-media-staging`.

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

## ⚙️ Tous les workers du compte principal (liste Cloudflare + mesure réelle, 23.10.2026) — 29

Adresse de chaque worker : `https://<nom>.9r4rxssx64.workers.dev` · racine `/` puis `/health` (401/403/404 à la racine = normal, la porte ou « route inconnue »).

| Worker | Rôle | Racine · /health |
|---|---|---|
| `apex-chat-api` | API d'Apex Chat (PRODUCTION) | 404 · 200 |
| `apex-chat-api-staging` | API + page d'Apex Chat de TEST | 200 · 200 |
| `apex-push-worker` | Notifications push | 401 · 200 |
| `apex-auth-worker` | Authentification d'Apex | 404 · 200 |
| `apex-secrets-proxy` | Proxy de secrets (racine ouverte : point 3 de l'audit 22.10 laissé exprès) | 200 · 200 |
| `apex-depot-relais` | Relais de lecture du dépôt public | 403 · 403 |
| `kdmc-router` | Le routeur : sert TOUTES les adresses `*.kd-mc.com` | 302 · 302 |
| `kdmc-access` | Accès / porte du domaine | 401 · 200 |
| `kdmc-apis` | APIs partagées | 401 · 200 |
| `kdmc-mail` | Mails de confirmation d'inscription | 404 · 200 |
| `kdmc-outlook` | Réglages / boîte Outlook | 200 · 200 |
| `kdmc-rag` | Mémoire intelligente (RAG) | 200 · 200 |
| `kdmc-vente` | Caisse des boutiques | 404 · 200 |
| `kdmc-social` | Réseaux sociaux | 401 · 200 |
| `kdmc-uptime` | Surveillance (racine sans réponse en 8 s, /health 200) | — · 200 |
| `kdmc-clone` | Clonage de sites (Apex) | 401 · 200 |
| `kdmc-monaco` · `kdmc-live` | Monaco / direct (rôle d'après le nom) | 200 · 200 / 404 · 200 |
| `kdmc-ais` · `kdmc-ais-proxy` | Suivi de bateaux (AIS) | 404 · 200 / 404 · 404 |
| `kdmc-crea-ai` · `kdmc-crea-famille` | Créa Studio / famille | 401 · 200 / 405 · 405 |
| `kdmc-balances` | Soldes | 404 · 200 |
| `coffre-r2` | Coffre-fort (R2) | 401 · 200 |
| `cmc-parser-proxy` | Lecture des PDF de planning | 401 · 401 |
| `ld-printify-order` · `ld-gemini-proxy` | La Détente (commandes, IA) | 200 · 404 / 200 · 200 |
| `wm-brief` · `wm-quotes` | World Monitor | 404 · 200 |

- `apex-v13-backend` et `apex-vault-svc` **n'existent pas** dans le compte (la liste Cloudflare ne les contient pas : « error code: 1042 » = jamais déployés). Ne pas les appeler.
- Plus aucun worker sur l'ancien compte Cloudflare (`*.desarzens-kevin.workers.dev` éteint).

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
