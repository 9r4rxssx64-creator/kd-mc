# Chat Apex — Bases d'utilisation

Le chat est le cœur d'Apex AI. Voici tout ce que tu peux faire.

## Envoyer un message

### Texte
1. Tape ta question dans le champ de saisie en bas.
2. Touche **Envoyer** ou appuie **Entrée**.
3. Apex répond en temps réel (effet streaming).

### Voix (dictée)
1. Touche le bouton **🎙 micro** à droite du champ.
2. Parle clairement, Apex transcrit en temps réel.
3. Touche **Envoyer** quand tu as fini.

### Voix (wake word, après enrôlement)
- Dis : **"Dis Apex, [ta demande]"** depuis n'importe où dans l'app.

## Pièces jointes

Touche **+** à gauche du champ :
- 📷 **Photo** : prends une photo ou choisis depuis la galerie
- 📄 **Document** : PDF, DOCX, TXT, etc.
- 🎵 **Audio** : enregistrement ou fichier
- 📍 **Position GPS** : ta localisation actuelle

Apex analyse automatiquement (OCR pour images, lecture pour PDF).

## Conversations

### Sidebar gauche
- Toutes tes conversations sauvegardées.
- Nom auto-généré (3-5 mots du sujet).
- Date dernier message.
- Touche pour reprendre.

### Nouvelle conversation
- Bouton **+ Nouveau** en haut de la sidebar.
- Recommencer à zéro avec un nouveau contexte.

### Renommer
- Long-press sur la conversation → **Renommer**.

### Supprimer
- Long-press → **Supprimer** (confirmation requise).

### Exporter
- Long-press → **Exporter** (JSON ou Markdown).

## Outils contextuels

Apex détecte automatiquement ton intention et propose des outils :

| Tu dis | Apex ouvre |
|--------|-----------|
| "Mixe une musique" | 🎚 Studio Mix Pro |
| "Fais une vidéo" | 🎬 Studio Vidéo |
| "Plan de cuisine" | 🏗 Architecture |
| "Recette poulet" | 🍳 Cuisine Pro |
| "Calcule mon impôt" | 💰 Finance Pro |
| "Article 1240 Code civil" | 📒 Légal Pro |
| "Va sur YouTube" | 🌐 Navigateur intégré |
| "Traduire en italien : ..." | 🌐 Traducteur Pro |
| "Météo Monaco" | ☀ Météo 7j |

## Réponses IA

### Format
- **Markdown** rendu en temps réel
- **Code** avec coloration syntaxique
- **Tableaux**, listes, citations
- **Images**, vidéos générées (Studios)

### Actions sur une réponse
Long-press une réponse :
- 📋 Copier
- 🔁 Régénérer (Apex refait avec un autre angle)
- 📤 Partager
- 👍 / 👎 Feedback (améliore Apex)
- 🔊 Lire à voix haute (TTS)
- 📌 Épingler (favoris)

## Modèles IA disponibles

Apex utilise par défaut **Claude Sonnet 4.6** (Anthropic). Tu peux changer dans Réglages → IA :

- **Claude Sonnet 4.6** : équilibré (par défaut)
- **Claude Opus 4.7** : plus puissant, plus lent
- **Claude Haiku 4.5** : rapide, économique
- **GPT-4o** (OpenAI)
- **Gemini 2.5 Pro** (Google)
- **Llama 3.3 70B** (Groq, ultra-rapide)

Failover automatique si un modèle est indisponible.

## Multi-perspectives

Pour les questions complexes, Apex propose 3 angles :
1. **Réponse directe**
2. **Alternative** (autre approche)
3. **Pour aller plus loin** (anticipation)

Active dans Réglages → IA → Multi-angles.

## Recherche web

Apex peut chercher sur le web en temps réel :
- "Cherche [info récente]"
- "Quelles sont les actualités sur [sujet] ?"
- "Trouve-moi un restaurant à [lieu]"

## Limites du chat IA

- ⚠️ Apex peut faire des erreurs (hallucinations) → vérifie les infos critiques.
- ⚠️ Pas de conseils juridiques/médicaux/financiers définitifs (consulte un pro).
- ⚠️ Ne donne JAMAIS de mots de passe ou seed phrases à Apex.

## Quotas

| Plan | Messages IA/mois |
|------|------------------|
| Free | 50 |
| Personal | 1 000 |
| Pro | 10 000 |
| Business | Illimité |

Voir Réglages → Abonnement.

---

*Suite : [Coffre et clés API](vault-secrets.md)*
