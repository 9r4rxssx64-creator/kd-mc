---
name: strix
description: >
  Pentest IA autonome (Strix, github.com/usestrix/strix, Apache-2.0) — des agents
  IA qui trouvent ET valident (preuve de concept) les failles de sécurité d'une app,
  sans faux positifs. Installé le 2026-07-07 (« install ce qu'il y a sur la photo »).
  Utiliser pour un audit de sécurité offensif à la demande sur une app/URL de Kevin.
---

# Strix — hackers IA autonomes (sécurité offensive)

Strix (`pip install strix-agent`, CLI `strix`) lance des agents IA en sandbox Docker
qui explorent une cible, exécutent du code, et **valident chaque faille par un PoC**
(pas de faux positif). Complète les scans statiques (semgrep/gitleaks/trivy) par une
approche **dynamique/offensive**.

## ⚠️ Où ça tourne + coût

- **Pas dans le sandbox Claude Code** (Docker + egress + boucles LLM) → sur le **runner CI**.
- **Coût réel** : agents IA en boucle = beaucoup d'appels LLM. Donc **workflow_dispatch
  UNIQUEMENT** (à la demande), jamais on:push/cron. Timeout 26 min.

## 🚀 Lancer un scan

```
mcp__github__actions_run_trigger
  workflow_id: strix-scan.yml   ref: main
  inputs: { target: "<chemin repo ou URL kd-mc.com>", model: "openai/gpt-5.4" }
```
- `target` = un dossier du repo (`kdmc-home/worldmonitor`) OU une URL **du périmètre
  Kevin** (`*.kd-mc.com` / github.io — les URL tierces sont refusées, anti-abus).
- `model` = format litellm (`openai/gpt-5.4` par défaut, **ajuste si l'id n'existe pas**).
- Clé LLM = secret GitHub `OPEN_AI_API_KEY` (Kevin l'a déjà). `PERPLEXITI_API_KEY`
  active la recherche web de Strix (optionnel).

Résultat : rapport en **artifact** `strix-report-*` + résumé Firebase
**`/apex/ax_strix_last`** (Apex peut le lire). Le Step Summary montre le log.

## 🤖 Depuis Apex

`repository_dispatch` `event_type: "strix-scan"`, `client_payload: {target, model, exec_id}`
(même canal qu'apex-execute / agent-reach) → réponse dans `ax_strix_last`.

## 🛡 Sécurité (règles CLAUDE.md)

- `permissions: contents: read` ; la clé LLM montée QUE sur le step de scan ;
  secrets Firebase QUE sur le step de push.
- **Périmètre borné** : refuse toute URL hors `kd-mc.com` (ne jamais scanner un tiers
  sans autorisation — c'est de la sécurité offensive).
- Rapports privés (artifact 14 j + Firebase `/apex` durci).

## 📌 Action Kevin (1×, optionnelle)

Le modèle par défaut `openai/gpt-5.4` vient de la doc Strix — si le run échoue sur
« model not found », relance en passant un `model` valide (ex `openai/gpt-4.1`).
