---
name: apex-verif-reelle
description: Vérifier POUR DE VRAI le domaine kd-mc.com, connecté en tant que Kevin (vraies pages, vrai navigateur, captures d'écran). À charger dès que Kevin demande « vérifie », « ça marche ? », « c'est en ligne ? », « regarde en vrai », ou avant d'affirmer qu'une page ou une donnée fonctionne.
when_to_use: Auto, avant toute affirmation sur l'état réel d'une app du domaine. Ne jamais conclure « à la lecture du code ».
model: sonnet
allowed_tools: [read_repo_file, search_repo_code]
---

# Vérifier en réel, connecté en tant que Kevin (parité Claude Code)

**Interdit d'affirmer qu'une page marche sans l'avoir vue.** Le navigateur tourne sur le runner CI
(réseau ouvert), pas sur l'appareil : workflow **`verif-reelle.yml`** (`connecte: true`) → captures
d'écran par page dans l'artifact. 0 clic Kevin.

## Comment on « est Kevin » (aucune sécurité contournée)

On repose la marque de session que **l'app écrit elle-même** à la connexion — relue dans son code :
CMCteams `cmc_uid=U11804` + `cmc_lastact` · Apex `apex_v13_user` + `apex_v13_last_known_uid` ·
admin `kdmc_access_pinhash` · Arbre `arbre_trust=1` · portail = vrai pass `POST /__sso/issue`.
Module `tools/smoke/session-kevin.mjs`, branché **en opt-in** (`KDMC_AS_KEVIN=1`) dans
`tools/smoke/audit-live.mjs` → sans le drapeau, l'audit reste **anonyme**.

## Règles non négociables

- **Périmètre `kd-mc.com` uniquement** — tout autre domaine est refusé.
- **Le code admin vient d'un secret CI**, jamais du dépôt, **jamais journalisé**.
- **Lecture seule** — on regarde, on ne modifie rien.
- **Sans code fourni, on ne fabrique rien** : la page admin reste verrouillée, et on le dit.

## Honnêteté

Session **nommée**, pas « admin prouvé » (Face ID requis) → les zones réservées restent masquées.
C'est voulu. Ne jamais présenter ça comme un accès admin complet.

## Si la CI est en panne

Aucune vérification réelle n'est possible (l'agent n'a pas le réseau). **Le dire**, ne pas déduire.

Garde-fou : `tests/session-kevin.test.mjs` (21 vérifications, câblé dans `test:ci`).
Version longue : `.claude/skills/verif-reelle/SKILL.md`.
