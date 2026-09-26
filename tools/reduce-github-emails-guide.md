# 📧 Réduire les emails GitHub qui saturent ta boîte Outlook

**Kevin 2026-05-16** : "Arrête les mail creator GitHub pour moi, il sature ma boîte" + "je les reçois sur Outlook pas sur Gmail".

## ✅ Ce que j'ai fait côté workflows (v13.4.184)

Réduction fréquence des cron jobs qui créent des notifications :

| Workflow | Avant | Après |
|----------|-------|-------|
| `apex-autonomous-watcher.yml` | toutes les 5 min | toutes les 6h |
| `handoff-sync.yml` | toutes les 15 min | toutes les 6h |
| `branch-deployment-watch.yml` | toutes les 2h | lundi 08h UTC (1×/semaine) |

Impact côté CI : ~95% des notifications crons éliminées.

## 🔧 Côté GitHub — désactiver les emails À LA SOURCE (le mieux)

### Étape 1 — Couper TOUS les emails du compte `9r4rxssx64-creator`

Le bot creator envoie les emails via TON compte GitHub lié. Tu dois te connecter au compte `9r4rxssx64-creator` :

1. Ouvre https://github.com/settings/notifications (en étant connecté avec `9r4rxssx64-creator`)
2. Section **"Email notification preferences"** :
   - **Email** : ton adresse Outlook
   - **Subscriptions** : décoche **"Comments on Issues and Pull Requests"**
   - **Subscriptions** : décoche **"Pull Request reviews"**
   - **Subscriptions** : décoche **"Pull Request pushes"**
   - **Subscriptions** : décoche **"Include your own updates"**
3. Section **"Actions"** :
   - **Send notifications for failed workflows only** → laisse coché si tu veux les fails
   - **Send notifications for workflows you initiated** → **DÉCOCHE** (tu n'as plus de notifs pour TES déclenchements bot)
4. Section **"Dependabot alerts"** : décoche tout sauf "Security alerts" (vraiment important)
5. **Save**

### Étape 2 — Limiter les notifs du repo CMCteams

1. https://github.com/9r4rxssx64-creator/CMCteams
2. Bouton **Watch** (haut droite) → clique
3. Sélectionne **"Custom"**
4. Coche UNIQUEMENT :
   - ✅ **Issues** (tu veux savoir si Claude Code escalade un bug critique)
   - ✅ **Pull requests** (si tu veux suivre les PR)
5. Décoche TOUT le reste (Releases · Discussions · Security · Workflow runs)
6. Apply

### Étape 3 — Bonus si tu veux ZÉRO email du bot

Sur https://github.com/settings/notifications :
- **"Watching"** : sélectionne **"Only notify me about explicit @mentions"**
- Tu n'auras d'email QUE si quelqu'un te @mention explicitement

## 📨 Côté Outlook — Règle automatique (filet de sécurité)

Si après étapes 1-3 quelques emails passent encore :

### Outlook.com (web)
1. Ouvre Outlook → ⚙ Paramètres → **Afficher tous les paramètres Outlook**
2. **Courrier** → **Règles** → **Ajouter une nouvelle règle**
3. Nom : `GitHub bot creator`
4. Condition : **De** contient `notifications@github.com`
5. Condition : **Objet** contient `9r4rxssx64-creator/cmcteams`
6. Action : **Déplacer vers** → choisis un dossier "GitHub-bot" (créer s'il n'existe pas)
7. Action additionnelle : **Marquer comme lu**
8. **Enregistrer**

### Outlook Desktop (Windows/Mac)
1. **Accueil** → **Règles** → **Créer une règle**
2. Cocher **De** : `notifications@github.com`
3. Cocher **Objet contient** : `9r4rxssx64-creator/cmcteams`
4. **Déplacer l'élément vers le dossier** → choisir "GitHub-bot"
5. **OK** → confirmer "Exécuter sur les messages déjà reçus"

### Outlook iOS/Android
1. Ouvre l'app → ⚙ Paramètres
2. **Compte** sélectionné → **Filtre/Règles** (pas dispo sur tous comptes mobiles, sinon utilise web)

## 🎯 Recommandation Kevin

**Le combo qui marche** :
1. Étape 1 (GitHub Notifications) = **bloque la source** = -90% emails immédiat
2. Étape 2 (Watch Custom) = -5% supplémentaires
3. Règle Outlook = filet de sécurité pour les 5% restants

**Si tu veux vraiment zéro email du bot** : étape 1 + sélectionne "Only notify me about explicit @mentions" dans Watching.

**Si ça sature encore après ces étapes** : envoie-moi un screenshot d'un email qui revient, je vois lequel workflow envoie et je le coupe à la source.
