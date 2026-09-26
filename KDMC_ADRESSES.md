# 🌐 KDMC_ADRESSES.md — Liste officielle des adresses (toujours à jour)

> Domaine principal : **kd-mc.com** (acheté sur Cloudflare Registrar le 2026-06-06,
> titulaire Kevin DESARZENS, auto-renew activé, expire 2027-06-06).
> Structure : **une belle adresse par projet** (sous-domaine par app).
> Dernière mise à jour : **2026-06-06** — branche `claude/kdmc-custom-domain-7hNn9`.
>
> **Statut global : DÉPLOYÉ ✅ (2026-06-06 21:41 UTC)** — worker `kdmc-router` en ligne,
> les 7 belles adresses attachées (custom domains Cloudflare créés sans erreur).
> DNS + certificat SSL : propagation ~1-2 min. Les anciennes adresses restent valides.

---

## 🖥️ Sites (les belles adresses des projets)

| Projet | 🌟 Nouvelle adresse | Ancienne adresse (toujours valide) | Statut |
|---|---|---|---|
| **Accueil KDMC** | https://kd-mc.com | — (nouvelle page portfolio) | ✅ en ligne |
| **CMCteams** | https://cmcteams.kd-mc.com | https://9r4rxssx64-creator.github.io/CMCteams/ | ✅ en ligne |
| **Apex-ai** | https://apex-ai.kd-mc.com | https://9r4rxssx64-creator.github.io/CMCteams/apex-ai-v13/ | ✅ en ligne |
| **Apex-chat** | https://apex-chat.kd-mc.com | https://9r4rxssx64-creator.github.io/CMCteams/messaging-app/ | ✅ en ligne |
| **La détente** | https://la-detente.kd-mc.com | https://9r4rxssx64-creator.github.io/CMCteams/la-detente/ | ✅ en ligne |
| **Chez-lolo** | https://chez-lolo.kd-mc.com | https://9r4rxssx64-creator.github.io/CMCteams/shops/chez-lolo/ | ✅ en ligne |

> `www.kd-mc.com` pointe aussi sur la page d'accueil.
> Comment ça marche : 1 worker Cloudflare unique (`services/kdmc-router`) reçoit la
> belle adresse et sert le bon site GitHub Pages (reverse-proxy, même origine → PWA OK).

## ⚙️ Serveurs / API (coulisses)

| Belle adresse (à activer) | Worker Cloudflare | Adresse actuelle (toujours valide) |
|---|---|---|
| https://api.kd-mc.com | apex-v13-backend | https://apex-v13-backend.9r4rxssx64.workers.dev |
| https://chat-api.kd-mc.com | apex-chat-api | https://apex-chat-api.9r4rxssx64.workers.dev |
| https://push.kd-mc.com | apex-push-worker | https://apex-push-worker.9r4rxssx64.workers.dev |
| https://auth.kd-mc.com | apex-auth-worker | https://apex-auth-worker.9r4rxssx64.workers.dev |
| https://secrets.kd-mc.com | apex-secrets-proxy | https://apex-secrets-proxy.9r4rxssx64.workers.dev |
| https://vault.kd-mc.com | apex-vault-svc | https://apex-vault-svc.9r4rxssx64.workers.dev |

> Les belles adresses serveurs sont **optionnelles** (les apps appellent encore les
> `*.workers.dev`, qui ne changent pas). À brancher dans une étape ultérieure.
> Côté autorisation : `kd-mc.com` (+ sous-domaines) est autorisé sur les 3 workers qui
> filtraient par origine (apex-v13-backend, cmc-parser-proxy, ld-gemini-proxy) ; les
> autres sont en CORS `*`. → les apps fonctionnent, **IA comprise**, dès la mise en ligne.

---

## ✅ Ce qui est fait / ⏳ ce qu'il reste

**Fait (branche `claude/kdmc-custom-domain-7hNn9`)**
- `services/kdmc-router/` (worker + wrangler routes custom_domain) + workflow de déploiement.
- `kdmc-home/index.html` (page d'accueil portfolio des 5 projets).
- Autorisation `kd-mc.com` dans les 3 workers qui filtraient par origine.

**Reste**
1. **Fusionner sur `main`** → le workflow déploie le routeur + provisionne DNS/SSL.
2. ⚠️ La clé `CLOUDFLARE_API_TOKEN` doit avoir **Zone DNS Edit + Workers Routes Edit**
   sur `kd-mc.com` pour la création auto des belles adresses (sinon : 1 case à cocher).
3. (Optionnel) belles adresses serveurs `api/push/auth/...kd-mc.com`.
4. (Cosmétique) canonical/OG des pages → `kd-mc.com` une fois validé en live.

---
*Ce fichier est la source de vérité des adresses KDMC. À tenir à jour à chaque
changement (règle « DOCS TEMPS RÉEL TOUJOURS À JOUR »).*

---

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
