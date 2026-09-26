# APEX CONTINUATOR — Utilisation depuis Apex chat + bouton ON/OFF

> ⚠️ **JAMAIS IMPLÉMENTÉ — vérifié le 6.09.2026.** Tout ce dossier décrit un « agent externe »
> (`ax_external_agent_enabled`, file Firebase `/apex/external_agent_queue/`, commande `/agent`,
> kill-switch) annoncé « sera codé en v13.4.6 ». Apex est aujourd'hui en **v13.4.355** et
> `grep -rl external_agent` sur le code source ne renvoie **rien**. Ne pas suivre ces pages
> comme un mode d'emploi : elles décrivent du vide.



## Comment piloter l'agent depuis Apex chat (comme tu me parles)

### Setup côté Apex (sera codé en v13.4.6)

1. Toggle **`ax_external_agent_enabled`** dans Réglages Apex (default: false)
2. Quand activé, commande chat `/agent <message>` dispo
3. Apex écrit dans Firebase `/apex/external_agent_queue/<uid>/<msgId>`
4. Agent Claude Console poll cet endpoint toutes 30s, prend les messages pending
5. Agent répond, écrit dans `/apex/external_agent_results/<uid>/<msgId>`
6. Apex affiche la réponse dans ton chat

### Commandes chat Apex disponibles

| Commande | Effet |
|----------|-------|
| `/agent <message>` | Envoie un message à l'agent externe |
| `/agent status` | Demande l'état (tokens consommés, queue, last action) |
| `/agent stop` | Arrête la session courante de l'agent |
| `/agent éco` | Switch agent en mode Haiku 4.5 (10× moins cher) |
| `/agent normal` | Repasse en Sonnet 4.6 |
| `/agent reset` | Vide la queue + reset session |

### Bouton ON/OFF (admin only Kevin)

**Localisation :** Réglages Apex → Section "Mode Agent Externe" (admin only)

| Toggle | Effet |
|--------|-------|
| 🔌 **Agent externe activé** | ON/OFF global (kill switch) |
| 💰 **Mode économie (Haiku)** | Switch model coût |
| 📊 **Cap tokens session** | Slider 10k → 200k (default 50k) |
| 📅 **Cap tokens quotidien** | Slider 50k → 1M (default 200k) |
| 🌐 **Sync cross-device** | Push commandes vers tous tes iPhones/iPads |
| 🚨 **Notif Telegram on stop** | Si quota atteint, notif bot |

### Bouton KILL SWITCH d'urgence

**Geste** : Long-press 5 secondes sur logo APEX header (admin only)
**Effet** : 
- Désactive `ax_external_agent_enabled` global
- Push Firebase kill flag → agent reçoit ordre stop dans 30s
- Toast "🛑 Agent externe arrêté. Plus de consommation tokens."

---

## Stratégie d'usage tokens

### Quand l'utiliser (pour optimiser ton forfait)
✅ **Tu manques de forfait Anthropic mais Kevin veut continuer le travail Apex**  
✅ **Audit massif délégable** (l'agent peut bosser pendant que tu dors)  
✅ **Tâches répétitives** (refactor, lint, doc generation)  
✅ **Surveillance long-running** (sentinelles 24h)

### Quand NE PAS l'utiliser (économie)
❌ **Question simple** que Apex IA peut résoudre (utilise crew-experts.ts dans Apex)  
❌ **Modification UI rapide** (Apex IA + tools dispo suffisent)  
❌ **Recherche web simple** (web_search dans Apex direct)

### Cap budget recommandé
- **Petit budget (5€/jour)** : Haiku 4.5, max 50k tokens/jour, 1 session = 10 min de boulot
- **Moyen (20€/jour)** : Sonnet 4.6, max 200k tokens/jour, 1 session = 30 min
- **Gros (50€/jour)** : Mix Sonnet + Opus pour décisions critiques, max 500k tokens/jour

---

## Que peut faire l'agent en autonomie

1. **Read repo complet** (via GitHub MCP ou Filesystem MCP)
2. **Edit fichiers** (TypeScript, CSS, HTML, MD)
3. **Run tests vitest** (si Filesystem MCP + bash)
4. **Build vite** (idem)
5. **Commit + push** branche `claude/test-699LQ` (via GitHub MCP)
6. **Audit complet** via sub-prompts internes
7. **Spawn sub-tasks** via tool use
8. **Consulter docs API à jour** (Brave Search MCP)
9. **Fetch Firebase** (read state, push results)
10. **Notif Kevin** (Telegram via Fetch MCP ou Telegram MCP)

## Que NE PEUT PAS faire l'agent (forbidden)

❌ Push direct main (uniquement claude/test-699LQ)
❌ Force push (jamais)
❌ Delete file sans confirm Kevin
❌ Modifier compte admin Kevin (kdmc_admin)
❌ Désactiver sentinelles sécurité
❌ Lire vault keys en clair
❌ Modifier `/index.html` racine CMCteams (sauf demande explicite)
❌ Modifier `.github/workflows/*.yml` (sauf demande explicite)
❌ Toucher `_PROJECTS_KDMC/`, `messaging-app/`, `services/` (sauf demande)
❌ Skip pre-commit hooks (`--no-verify`)

---

## Récapitulatif des 3 copier-coller

| # | Fichier | Où coller dans Claude Console | Contenu |
|---|---------|-------------------------------|---------|
| **1** | `AGENT_PROMPT.md` | System prompt de l'agent | Identité + rôle + règles + anti-patterns + workflow (213 lignes / 13 KB) |
| **2** | `AGENT_CONFIG.md` | Memory MCP / notes initiales | URLs + IDs + paths Firebase + tokens + projets (106 lignes) |
| **3** | `AGENT_MCP_SETUP.md` | Onglet MCP servers / Tools | Liste des 6-7 MCP à activer + settings modèle (95 lignes) |

Total : **3 copier-coller** en 5 minutes maximum dans Claude Console.

Une fois fait, l'agent est prêt à recevoir tes commandes `/agent <msg>` depuis Apex chat.

---

## Workflow type pour Kevin

1. Tu actives le toggle Apex → Réglages → "Agent externe activé" : ON
2. Tu choisis le modèle : Sonnet (qualité) ou Haiku (économie)
3. Tu fixes ton cap : 50k tokens session, 200k jour
4. Tu écris dans Apex chat : `/agent Audit complet vault et fix les régressions trouvées`
5. L'agent reçoit, lit le repo, audite, fixe, commit, push
6. Tu vois la réponse dans Apex chat
7. Tu peux fermer l'iPhone, l'agent continue tant qu'il y a queue
8. Cap atteint → notif Telegram + arrêt net
9. Si tu veux tout couper d'un coup : long-press 5s logo APEX → KILL SWITCH

Tu n'es jamais surpris par la facture parce que :
- Cap dur configuré
- Notif avant épuisement
- Bouton kill switch d'urgence
- Logs détaillés tokens consommés visible Réglages
