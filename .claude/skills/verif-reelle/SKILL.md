---
name: verif-reelle
description: >
  Vérifier POUR DE VRAI le domaine kd-mc.com, connecté en tant que Kevin — vraies pages, vrai
  navigateur, vraies données, captures d'écran. À utiliser dès que Kevin demande « vérifie »,
  « ça marche ? », « regarde en vrai », « c'est en ligne ? », ou avant d'affirmer qu'une page /
  un bouton / une donnée fonctionne. Remplace toute déduction « à la lecture du code ».
---

# Vérifier en réel, connecté en tant que Kevin

## Le problème que ça résout

Depuis l'agent, **kd-mc.com est injoignable** (egress bloqué : seuls anthropic.com et les
registres de paquets passent — vérifiable via `curl -sS "$HTTPS_PROXY/__agentproxy/status"`).
Et même depuis la CI, les pages utiles sont **derrière une connexion** → on ne voyait que des
écrans de login. Résultat : je déduisais « à la lecture » au lieu de constater (leçons #131/#135).

## La commande

```
mcp__github__actions_run_trigger  workflow_id: verif-reelle.yml  ref: main
   inputs: { connecte: true, base: "https://kd-mc.com" }
```

Puis lire le **résumé du run** + l'**artifact** (`verif-reelle-<id>`) : une **capture d'écran par
page**. C'est ça, « voir » le domaine. 0 clic Kevin.

## Comment on « est Kevin » (aucune sécurité contournée)

On repose la marque de session que **l'app elle-même écrit** quand Kevin se connecte pour de vrai
— relue dans son code, jamais devinée — appliquée **avant** le chargement (`addInitScript`) :

| Surface | Marque | Source |
|---|---|---|
| CMCteams | `cmc_uid=U11804` + `cmc_lastact` | `index.html` (sans `lastact`, la session est jugée expirée) |
| Apex v13 | `apex_v13_user` + `apex_v13_last_known_uid` | `apex-ai/v13/services/auth/auth.ts` |
| admin.kd-mc.com | `kdmc_access_pinhash` | `services/kdmc-access/page.js` (`KEY`) |
| Arbre | `arbre_trust=1` | règle « reconnu auto après 1re connexion » |
| Portail | vrai pass via `POST /__sso/issue` → `#kdmc_sso=` | API publique du routeur |

Code : `tools/smoke/session-kevin.mjs` · branché dans `tools/smoke/audit-live.mjs` **en opt-in**
(`KDMC_AS_KEVIN=1`) → **sans le drapeau, l'audit reste strictement anonyme** (aucune régression).

## Règles non négociables

- **Périmètre** : `kd-mc.com` uniquement — le module **refuse** (throw) tout autre domaine.
- **Secrets** : le code admin vient d'un **secret CI** (`APEX_ADMIN_PIN_SHA256`), jamais du dépôt,
  **jamais journalisé** (`masque()`).
- **Lecture seule** : on regarde, on ne modifie rien dans les apps.
- **Sans code fourni, on ne fabrique rien** : la page admin reste verrouillée, et on le dit.

## Honnêteté (à répéter dans le rapport)

`/__sso/issue` rend une session **nommée**, pas « admin prouvé » — l'admin prouvé exige une clé
d'accès **Face ID**. Les zones réservées à l'admin prouvé **restent donc masquées** : c'est le
comportement voulu, pas un bug. Ne jamais présenter cette session comme un accès admin complet.

## Le garde-fou

`tests/session-kevin.test.mjs` (**câblé dans `test:ci`**, 21 vérifications) : périmètre verrouillé,
aucun secret en dur, hash jamais en clair, et surtout **les marques correspondent au code réel des
apps** — si une app change sa clé de session, le test le dit **ici**, au lieu de nous laisser croire
qu'on est connecté alors qu'on regarde un écran de login. Prouvé qu'il rougit (marque faussée → échec).

## Quand la CI est en panne

Le 2026-08-06, GitHub Actions est tombé 6 h → **aucune vérification réelle possible** (l'agent n'a
pas le réseau, la CI ne tourne pas). Le dire franchement plutôt que déduire. Cf. `LESSONS #169`.
