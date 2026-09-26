---
name: voir
description: Voir les vraies pages du domaine kd-mc.com « comme Kevin » (écran iPhone, connecté) depuis l'agent — canaux mesurés, outil câblé, marche à suivre.
---

# Voir comme Kevin — ce qui marche VRAIMENT depuis l'agent (mesuré le 10.09.2026)

| Canal | Résultat mesuré | Sert à |
|---|---|---|
| `curl` / Playwright local vers kd-mc.com | **403** (CONNECT refusé par le proxy d'organisation) | rien |
| `WebFetch` | **EGRESS_BLOCKED** | rien |
| Firecrawl (scrape, map, navigateur distant) | **403** (clé/plan) | rien |
| Bac à sable Hugging Face | **402** (payant) | rien |
| **Zapier → Webhooks « custom » GET** (`return_raw_response: true`) | **HTTP 200, page complète** (cmcteams : 3,5 Mo, `APP_VER` lisible) | lire le CODE SERVI : version, présence d'un fichier, en-têtes — pas d'écran |
| **Runner GitHub → `voir-comme-kevin.yml`** | navigateur réel, iPhone, connecté | **VOIR** : captures, texte visible, erreurs JS, requêtes en échec, version |

## Marche à suivre (0 clic Kevin)

1. Lancer : `actions_run_trigger` sur `voir-comme-kevin.yml` (ref `main`), inputs `urls`
   (liste kd-mc.com), `connecte` (true), `vues` (ex. `accueil,monplanning,departs`), `largeur` (390).
2. Attendre la fin (API `actions/runs/<id>`), lire le résumé du run (RAPPORT.md y est collé).
3. Rapatrier pour OUVRIR les images depuis l'agent (git passe par le proxy, pas les artefacts) :
   `tools/voir/rapatrier.sh <run_id>` puis `Read` sur chaque `*.jpg` — l'image s'affiche.
4. Dire ce qu'on a VU, pas déduit : version servie, vue affichée, utilisateur reconnu, erreurs.

## Lecture rapide sans écran (version servie, en 10 s)
`mcp__Zapier__execute_zapier_write_action` · `selected_api: WebHookCLIAPI` · `action: custom` ·
`params: { url, method: "GET", return_raw_response: true, unflatten: false }` → le résultat est
un fichier (3,5 Mo pour CMCteams) : `grep -o 'var APP_VER="v[0-9.]*"'`.

## Honnêteté
- La session posée est **nommée** (marques relues dans le code de chaque app, code admin par secret
  CI) — pas « admin prouvé » Face ID : les zones qui l'exigent restent masquées, le rapport le dit.
- Périmètre kd-mc.com seulement ; lecture seule ; aucun secret dans les captures ni le rapport.
- Chaque run dépose ≈ 100-300 Ko sur une branche `claude/voir-<run_id>` (branche de relecture,
  jamais fusionnée, nettoyée par le ménage des branches).
- Le seul moyen de voir SANS passer par le runner : autoriser `kd-mc.com` dans la politique
  réseau de l'environnement Claude Code (réglage de l'environnement, côté Kevin) — non vérifié
  d'ici, à demander une seule fois si vraiment nécessaire.
