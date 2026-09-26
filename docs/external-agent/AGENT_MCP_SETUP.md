# APEX CONTINUATOR — Setup MCP servers

> ⚠️ **JAMAIS IMPLÉMENTÉ — vérifié le 6.09.2026.** Tout ce dossier décrit un « agent externe »
> (`ax_external_agent_enabled`, file Firebase `/apex/external_agent_queue/`, commande `/agent`,
> kill-switch) annoncé « sera codé en v13.4.6 ». Apex est aujourd'hui en **v13.4.355** et
> `grep -rl external_agent` sur le code source ne renvoie **rien**. Ne pas suivre ces pages
> comme un mode d'emploi : elles décrivent du vide.



## 3e copier-coller : Liste MCP servers à activer dans Claude Console

Dans Claude Console, onglet "MCP servers" ou "Tools" de l'agent, attache ces serveurs :

---

### 1. GitHub MCP (essentiel)
- **Repo** : `9r4rxssx64-creator/cmcteams` (whitelist scope)
- **Permissions** : read/write code, create PR, comment, push commits
- **Token** : ton GitHub PAT fine-grained (ax_github_token chez Kevin)
- **URL** : `https://github.com/anthropics/mcp-server-github`

### 2. Filesystem MCP (essentiel)
- **Path** : `/home/user/cmcteams` (clone local du repo)
- **Permissions** : read/write
- **URL** : `https://github.com/anthropics/mcp-server-filesystem`

### 3. Memory MCP (essentiel)
- **Storage** : Anthropic-managed
- **Initial memory** : copier-coller le contenu de `AGENT_CONFIG.md` ci-dessus
- **URL** : `https://github.com/anthropics/mcp-server-memory`

### 4. Fetch MCP (essentiel)
- **Whitelist hosts** :
  - `raw.githubusercontent.com`
  - `api.github.com`
  - `cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app`
  - `api.anthropic.com`
  - `api.telegram.org`
  - `api.brevo.com`
- **URL** : `https://github.com/anthropics/mcp-server-fetch`

### 5. Brave Search MCP (recommandé)
- **API key** : `ax_brave_key` (Kevin a une clé)
- **Use case** : web search docs API à jour, vérification specs externes
- **URL** : `https://github.com/anthropics/mcp-server-brave-search`

### 6. Sequential Thinking MCP (recommandé)
- **Use case** : raisonnement multi-étapes pour tâches complexes (audit, refactor)
- **URL** : `https://github.com/anthropics/mcp-server-sequential-thinking`

### 7. (Optionnel) Telegram MCP — community
- **Bot token** : `ax_telegram_token` (depuis Firebase)
- **Chat ID Kevin** : à trouver via `axTelegramListChats()`
- **URL** : `https://github.com/community-mcp/telegram` (variable selon community)
- **Alternative** : utiliser Fetch MCP direct vers `https://api.telegram.org/bot<TOKEN>/sendMessage`

---

## Configuration agent dans Claude Console

### Modèle
- **Standard** : `claude-sonnet-4-6` (équilibre coût/qualité)
- **Économie** (si Kevin demande) : `claude-haiku-4-5-20251001` (~10× moins cher)
- **Reasoning critique** : `claude-opus-4-7` (cher, décisions architecturales seulement)

### Settings recommandés
- **Max tokens output** : 4000 (réponses complètes mais cap)
- **Temperature** : 0.3 (déterministe pour code)
- **Top P** : 0.95
- **Tool use** : enabled
- **Extended thinking** : enabled (pour audit / refactor critique)

### System prompt
Copier-coller le contenu de `AGENT_PROMPT.md` (1er copier-coller).

### Memory initial
Copier-coller le contenu de `AGENT_CONFIG.md` (2e copier-coller).

### Paramètres budget
- **Max budget par session** : 5€ (équivalent ~50k tokens Sonnet)
- **Max budget quotidien** : 20€ (équivalent ~200k tokens Sonnet)
- **Auto-stop** si error 429/402

---

## Test après création de l'agent

Premier message à envoyer pour valider le setup :
```
Identifie-toi et liste les MCP que tu as à disposition.
Confirme que tu as accès aux 8 docs racine du repo (CLAUDE.md, NOTES_USER, etc.).
Indique le score honnête de ton readiness sur 100, en distinguant ce qui marche
maintenant vs ce qui nécessite encore configuration.
```

L'agent doit répondre :
- "Apex Continuator Senior prêt"
- Liste MCPs effectivement attachés (s'il manque l'un dis "non attaché")
- Confirmation accès docs (ou échec)
- Score honnête /100

Si score < 80 → corriger config avant utilisation prod.
