# 📦 EXPORT COMPLET KEVIN — Tout ce qu'on a fait ensemble

**Généré le 2026-04-26 — Kevin DESARZENS (kevind@monaco.mc)**

---

## 🗂 1. Sauvegardes ACTIVES (rien à faire)

### Repo GitHub principal
```
https://github.com/9r4rxssx64-creator/cmcteams
```
- Branche stable : `main`
- Branche dev : `claude/fix-apex-ai-bugs-adHfF`
- 100% du code + docs + workflows

### Mémoire IA cross-session
| Fichier | Contenu |
|---------|---------|
| `CLAUDE.md` | 13 règles permanentes Kevin (relues chaque session) |
| `CLAUDE_HANDOFF.json` | Communication bidirectionnelle Apex ↔ Claude Code |
| `CLAUDE_ACTIVITY.json` | Historique 385+ commits récents |
| `NOTES_USER.md` | Infos métier (couleurs PDF SBM, codes, etc.) |
| `MEMO_RESUME.md` | État courant entre sessions |
| `KEVIN_INVENTORY.md` | Liste fichiers + liens directs |
| `KEVIN_ACTIONS_TODO.md` | Tâches Kevin en attente |
| `IPHONE_SETUP_PASSERELLE.md` | Guide passerelle iPhone-only |
| `FEEDBACK_ANTHROPIC.md` | Email type pour Anthropic support |

### Données Apex/CMCteams
| Système | URL | Contenu |
|---------|-----|---------|
| Firebase Realtime DB | `https://kdmc-clients-default-rtdb.firebaseio.com` | localStorage sync cross-device |
| GitHub Pages | `https://9r4rxssx64-creator.github.io/CMCteams/` | App déployée |
| Cloudflare Worker | `https://apex-push-worker.desarzens-kevin.workers.dev` | Push notifications iOS |

---

## 💬 2. Conversations claude.ai

Pour exporter toutes nos discussions avec Claude (moi) :

1. Va sur **https://claude.ai**
2. Login `kevind@monaco.mc`
3. Settings ⚙ → **Privacy** → **"Export your data"**
4. Tu reçois un email avec un ZIP de toutes tes conversations en JSON
5. Conserve le ZIP dans tes archives

---

## 🔑 3. Comptes et accès importants

(Sans les valeurs secrètes - juste la liste pour mémoire)

| Service | URL | Ce que tu y as |
|---------|-----|----------------|
| Anthropic Console | console.anthropic.com | Clé Kdmc + crédit (50€ rechargé) |
| Anthropic claude.ai | claude.ai | Abonnement Max 20x + chat avec moi |
| GitHub | github.com/9r4rxssx64-creator | Repo cmcteams + token PAT |
| Cloudflare | cloudflare.com | Worker push notifs |
| Firebase | console.firebase.google.com | Realtime DB |
| Stripe | dashboard.stripe.com | Abonnements clients (si configuré) |
| OpenRouter | openrouter.ai | Failover IA (si configuré) |

---

## 🎓 4. Leçons apprises (CLAUDE.md erreurs #1-#43)

Toutes documentées dans `CLAUDE.md` section "Erreurs connues à NE PAS reproduire" :
1. table-layout fixed dans scrollable
2. overflow:hidden sur parent scrollable
...
43. iOS Safari SpeechRecognition continuous=true non fiable

→ Lues automatiquement à chaque session Claude Code (système de mémoire).

---

## 🔄 5. Pour repartir à zéro (si jamais nécessaire)

Si tu changes de compte / Mac / etc. :

```bash
# Cloner le repo
git clone https://github.com/9r4rxssx64-creator/cmcteams.git
cd cmcteams

# Installer Claude Code (si Mac/Linux/Windows)
npm install -g @anthropic-ai/claude-code

# Configurer ANTHROPIC_API_KEY (clé Kdmc)
export ANTHROPIC_API_KEY="sk-ant-api03-..."

# Lancer Claude Code dans le repo
claude
```

Au premier lancement, je lirai automatiquement `CLAUDE.md` + tes 13 règles permanentes → je sais tout ce qu'on a fait.

---

## 🧠 6. Mémoire dans Apex (Firebase)

Stockée automatiquement, accessible depuis Apex `vRGPD` :
- `ax_persistent_memory` : faits accumulés sur toi
- `ax_kb` : connaissance custom
- `ax_lessons_learned_struct` : leçons cross-app
- `ax_handoff_journal` : log communication Apex ↔ Claude Code
- `ax_audit_log` : actions admin tracées

**Export** : Apex → tape `rgpd` ou `mes donnees` → bouton "📥 Télécharger mon export" → JSON complet.

---

## ✅ Conclusion

**Tu n'as rien à transférer.** Tout est :
- Sauvegardé dans GitHub (le code + docs)
- Sauvegardé dans claude.ai (les conversations)
- Sauvegardé dans Firebase (les données Apex)
- Backup quotidien automatique via GitHub Actions

Si tu veux UN fichier ZIP complet à conserver hors-ligne :
1. Apex → tape `rgpd` → "📥 Télécharger mon export" (Apex data)
2. claude.ai → Settings → "Export your data" (conversations)
3. GitHub → "Code" → "Download ZIP" (tout le code)

3 fichiers ZIP = tout sauvegardé de manière permanente.
