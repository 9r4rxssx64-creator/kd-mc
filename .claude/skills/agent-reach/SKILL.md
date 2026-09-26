---
name: agent-reach
description: >
  Accès internet étendu pour les agents (Claude Code + Apex) via Agent-Reach
  (github.com/Panniantong/Agent-Reach, MIT) : lecture web (Jina Reader),
  transcripts YouTube (yt-dlp), recherche web (s.jina.ai/Exa), RSS (feedparser),
  GitHub (gh). Utiliser quand une tâche demande de lire une page web complète,
  un transcript de vidéo YouTube, un flux RSS, ou une recherche web approfondie.
  Installé le 2026-07-07 à la demande de Kevin (« Instal pour toi et apex »).
---

# Agent-Reach — accès internet (Claude Code + Apex)

Agent-Reach n'est **pas un wrapper** : c'est un installateur + un routeur de
commandes natives. L'agent appelle directement les outils sous-jacents.

## ⚠️ Vérité d'environnement (leçons #93/#96/#126)

| Environnement | r.jina.ai / yt-dlp / s.jina.ai | Quoi utiliser |
|---|---|---|
| **Sandbox Claude Code web** (CCR) | ❌ bloqués (« Host not in allowlist », seuls les registres npm/pypi + raw.githubusercontent passent) | `WebFetch`/`WebSearch` intégrés, OU le **workflow CI** ci-dessous |
| ~~**Runner GitHub Actions**~~ | ⛔ **HORS SERVICE** | `agent-reach.yml` a été rangé dans `.github/workflows-desactives/` (son travail est d'appeler des sites tiers → destination `gitlab`), et **le job GitLab de remplacement n'existe pas encore** (`job_gitlab: null` dans `DESTINATIONS.json`). En attendant : `WebSearch` / `WebFetch`, ou un autre workflow CI. |
| **Machine locale / env réseau ouvert** | ✅ | commandes directes (§ Commandes) |

## 🚀 Depuis le sandbox : déclencher le workflow CI

```
mcp__github__actions_run_trigger
  workflow_id: agent-reach.yml   ref: main
  inputs: { channel: web|search|youtube|rss|github|doctor, target: "<url ou requête>" }
```
Résultat : Step Summary du run (extrait 3000c) + artifact `agent-reach-*`
(complet, 200 Ko max) + Firebase `/apex/ax_agent_reach_last` (extrait 6000c).
Lire le run via `actions_list` (method list_workflow_runs puis get_job_logs).

## 🤖 Depuis Apex

Apex déclenche par `repository_dispatch` `event_type: "agent-reach"`,
`client_payload: {channel, target, exec_id}` (même canal que apex-execute),
puis lit la réponse dans sa base : clé **`ax_agent_reach_last`**
(`{exec_id, channel, target, ok, ts, excerpt}`) — path autorisé par la regex
`/apex/$key` (`ax_[a-z0-9_-]+`), écrit par le runner en service account.

## 🔧 Commandes (réseau ouvert uniquement)

```bash
pip install "https://github.com/Panniantong/agent-reach/archive/main.zip"
agent-reach doctor --json                      # état des canaux

curl -s "https://r.jina.ai/URL"                # lire une page web (markdown)
curl -s -G "https://s.jina.ai/" --data-urlencode "q=requête"   # recherche web
yt-dlp --write-auto-sub --sub-lang "fr,en" --skip-download -o "/tmp/%(id)s" "URL"  # transcript YouTube
gh search repos "requête" --sort stars --limit 10
python3 -c "import feedparser; ..."            # RSS
```

Le SKILL.md amont complet (15 plateformes, dont Twitter/Reddit/Instagram avec
cookies) : `https://raw.githubusercontent.com/Panniantong/agent-reach/main/agent_reach/skill/SKILL.md`

## 🛡 Règles de sécurité (non-négociables)

- **Lecture seule** — jamais de posting/like/comment automatique.
- **Jamais de cookies/logins sociaux dans le CI** (les canaux Twitter/Reddit/
  Instagram à session restent HORS runner ; l'avertissement amont dit
  « comptes jetables » — donc jamais les comptes de Kevin).
- Workflow : `permissions: contents: read` ; les secrets Firebase ne sont
  montés QUE sur le step de push (qui exécute notre `gauth.cjs`, pas le code tiers).
- Audit fait le 2026-07-07 : deps mainstream (requests/feedparser/yt-dlp/rich),
  MIT, config confinée `~/.agent-reach/`, pas de télémétrie documentée.
