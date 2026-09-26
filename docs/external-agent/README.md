# 🤖 APEX CONTINUATOR — Agent externe Claude Console

> ⚠️ **JAMAIS IMPLÉMENTÉ — vérifié le 6.09.2026.** Tout ce dossier décrit un « agent externe »
> (`ax_external_agent_enabled`, file Firebase `/apex/external_agent_queue/`, commande `/agent`,
> kill-switch) annoncé « sera codé en v13.4.6 ». Apex est aujourd'hui en **v13.4.355** et
> `grep -rl external_agent` sur le code source ne renvoie **rien**. Ne pas suivre ces pages
> comme un mode d'emploi : elles décrivent du vide.



**But :** Quand ton forfait Anthropic Claude Code (moi) est épuisé, cet agent prend le relais et continue le travail Apex en autonomie.

## 🚀 Setup en 3 copier-coller (5 min)

### 1. Va sur https://console.anthropic.com → Crée un nouvel Agent

### 2. Copier-coller dans cet ordre :

| Étape | Fichier source | Où coller dans Claude Console |
|-------|----------------|-------------------------------|
| **A** | `AGENT_PROMPT.md` | Champ **System prompt** |
| **B** | `AGENT_CONFIG.md` | **Memory MCP** initial OU **Notes** |
| **C** | `AGENT_MCP_SETUP.md` | Onglet **MCP servers / Tools** (config) |

### 3. Test l'agent avec ce prompt :
```
Identifie-toi et liste les MCP que tu as à disposition.
Confirme accès aux 8 docs racine du repo.
Score honnête de readiness sur 100.
```

L'agent doit répondre :
- "Apex Continuator Senior prêt"
- Liste MCPs effectifs (avec ⚠️ si manquants)
- Score honnête /100

Si score < 80 → corrige config avant utilisation prod.

---

## 📞 Comment piloter l'agent depuis ton iPhone (Apex chat)

Une fois v13.4.6 déployé (ajout slash command `/agent`) :

```
/agent <ton message>
```

L'agent reçoit via Firebase queue, exécute, répond dans Apex chat.

Voir `AGENT_USAGE.md` pour détails complets.

---

## 💰 Optimisation budget (recharge auto activée)

- Cap session : **50k tokens** (≈ 1€ Sonnet)
- Cap quotidien : **200k tokens** (≈ 4€ Sonnet)
- Mode économie : Haiku 4.5 (10× moins cher)
- Bouton KILL SWITCH (long-press 5s logo APEX)
- Notif Telegram avant épuisement

---

## 📋 Fichiers de cette doc

- `README.md` (ce fichier)
- `AGENT_PROMPT.md` — 1er copier-coller (System prompt, 13 KB / 213 lignes)
- `AGENT_CONFIG.md` — 2e copier-coller (Memory MCP / notes, 106 lignes)
- `AGENT_MCP_SETUP.md` — 3e copier-coller (MCP servers config, 95 lignes)
- `AGENT_USAGE.md` — Documentation utilisation (126 lignes)

---

## 🛡️ Sécurité

L'agent NE PEUT PAS :
- Push direct main, force-push, delete fichier
- Modifier compte admin Kevin (kdmc_admin)
- Lire vault keys en clair
- Toucher CMCteams `/index.html` sans demande
- Skip pre-commit hooks
- Modifier workflows GitHub Actions sans demande

L'agent EST OBLIGÉ DE :
- Push uniquement sur `claude/test-699LQ`
- Run tests + build avant chaque commit
- Bump version cohérence triple (anti-Erreur #54)
- Notif Telegram si quota épuisé
- Audit honnête, score mesuré pas inventé
