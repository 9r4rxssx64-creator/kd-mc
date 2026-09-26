# 01 — FONCTIONS du domaine (F01…F32) et leur couverture

> Une ligne par cible surveillée. « Sonde » = kdmc-uptime (toutes les 2 h). « LIVE » = audit-live.yml (vrai navigateur, anonyme). « Verif » = vérification connectée (verif-reelle / verif-live-rapport). ✅ couvert · 🟡 partiel · 🔴 aucune.

| ID | Surface | Ce qu'elle fait | Sonde | LIVE | Verif connectée |
|---|---|---|---|---|---|
| F01 | kd-mc.com / www | portail du domaine | ✅ | ✅ | 🔴 |
| F02 | cmcteams.kd-mc.com | app planning casino (258 employés) | ✅ | ✅ | 🟡 (session Départs) |
| F03 | cmcteams-light.kd-mc.com | version allégée | ✅ | ✅ | 🔴 |
| F04 | departs.kd-mc.com | ordres de départ | ✅ | ✅ | ✅ `verif-live-rapport` (autre session) |
| F05 | apex-ai.kd-mc.com | assistant Apex v13 | ✅ | ✅ | 🔴 |
| F06 | apex-chat.kd-mc.com | messagerie chiffrée | ✅ | ✅ | 🔴 (e2e `apex-chat-e2e.yml` = dispatch) |
| F07 | dashboard.kd-mc.com | tableau de bord boutiques | ✅ | ✅ | 🔴 |
| F08 | sourcing.kd-mc.com | sourcing fournisseurs | ✅ | ✅ | 🔴 |
| F09 | coffre.kd-mc.com | coffre-fort | ✅ | ✅ | 🔴 |
| F10 | la-detente.kd-mc.com | boutique | ✅ | ✅ | 🔴 (`la-detente-e2e.yml` = dispatch) |
| F11 | chez-lolo.kd-mc.com | boutique | ✅ | ✅ | 🔴 |
| F12 | bot.kd-mc.com | tableau crypto | ✅ | ✅ ajouté ce jour | 🔴 |
| F13 | beatbot.kd-mc.com | robot piscine (admin, 401/403 = OK) | ✅ | ✅ ajouté | 🔴 |
| F14 | autorisations.kd-mc.com | admin (401/403 = OK) | ✅ | ✅ ajouté | 🔴 |
| F15 | arbre.kd-mc.com | arbre généalogique (111 pages) | ✅ | ✅ (déverrouillage + cartes) | 🟡 `verify-domaine` (session arbre) |
| F16 | lingua.kd-mc.com | langues | ✅ | ✅ | 🟡 `test:lingua-connexion` (local, Chromium) |
| F17 | studio.kd-mc.com | Créa Studio | ✅ | ✅ | 🔴 |
| F18 | worldmonitor.kd-mc.com | veille mondiale | ✅ | ✅ | 🔴 |
| F19 | osint.kd-mc.com | OSINT | ✅ | ✅ | 🔴 |
| F20 | ia.kd-mc.com | IA | ✅ | ✅ | 🔴 |
| F21 | outils.kd-mc.com | outils | ✅ | ✅ | 🔴 |
| F22 | shops.kd-mc.com | portail boutiques (22 pages) | ✅ | ✅ | 🔴 |
| F23 | cuisine / cocina / cujina | livre de cuisine (3 langues) | ✅ | ✅ | 🔴 |
| F24 | apex-secrets-proxy (worker) | proxy secrets Apex | ✅ /health | — | 🔴 (« en panne » au 1er relevé) |
| F25 | kdmc-ais (worker) | AIS navires | ✅ | — | 🔴 (« en panne ») |
| F26 | kdmc-live (worker) | données live | ✅ | — | 🔴 (« en panne ») |
| F27 | kdmc-rag (worker) | mémoire Apex | ✅ | — | 🔴 en ligne = code du 08/07, /health 404, déploiement bloqué (Vectorize, action Kevin) |
| F28 | ~~apex-v13-backend (worker)~~ | backend Apex | ⛔ | — | 🔴 **n'existe pas** sur le compte → **retiré de la sonde le 6.09.2026** |
| F29 | apex-auth-worker (worker) | auth Apex | ✅ | — | 🔴 (« en panne ») |
| F30 | kdmc-router (worker) | le routeur | — (c'est lui qui sert F01-F23) | — | ✅ `arbre.test` 34/34 + `admin.test` 41/41 avant déploiement |
| F31 | kdmc-outlook (worker) | factures Outlook + **réveil de la sonde** | — | — | ✅ `worker.test.mjs` 6/6 |
| F32 | kdmc-uptime (worker) | la sonde | — | — | ✅ smoke à chaque déploiement (401/405/run/push/état) |

**Non listé = non testé** : les 13 autres workers en ligne (kdmc-apis, kdmc-crea-ai, kdmc-crea-famille, kdmc-access, kdmc-monaco, kdmc-mail, kdmc-ais-proxy, kdmc-clone, wm-brief, wm-quotes, kdmc-balances, coffre-r2, ld-printify-order, ld-gemini-proxy, cmc-parser-proxy, apex-push-worker, apex-chat-api) ne sont **pas** sondés. À ajouter à `WORKERS` de la sonde ceux qui ont un `/health` (P2, `03-FINDINGS`).
