# 📋 MÉMO — Actions à faire (Kevin)

> **Fichier maintenu à jour par Claude à chaque session.**
> Date création : 2026-04-16 (session `claude/automate-social-media-videos-RvjYq`)
> Dernière mise à jour : 2026-04-16 soirée

---

## ⚡ TL;DR — Si tu as 40 minutes ce soir

Fais dans cet ordre **strict** :
1. **Google AI Studio** (5 min) → clé Gemma 4 gratuite
2. **YouTube API** (15 min) → OAuth credentials
3. **Assets musique** (5 min) → 5 MP3 royalty-free sur Pixabay
4. **Test end-to-end** (15 min) → générer + publier une vidéo en `private`

C'est tout. Le reste peut attendre plus tard.

---

## ✅ Ce qui est DÉJÀ fait (livré + pushé sur GitHub)

Branche : `claude/automate-social-media-videos-RvjYq`

### Pipeline vidéo (`tools/social/`)
- ✅ **Moteur TTS** multi-backend (Edge + espeak-ng fallback)
- ✅ **Subtitles karaoke** synchronisés
- ✅ **Rendering** frames 1080x1920 et 1920x1080
- ✅ **Compilation FFmpeg** H.264 + audio mix
- ✅ **Template narrative storytelling** (faceless stories)
- ✅ **Script generator Gemma 4** — génération unique d'histoires
- ✅ **Shorts extractor** — extrait 3 shorts 9:16 d'un long-form 16:9
- ✅ **Publisher YouTube** (googleapis, long-form + Shorts)
- ✅ **Publisher Facebook** (vidéos + Reels)
- ✅ **Publisher Instagram** (Reels via Graph API)
- ✅ **CLI complet** (12 commandes)
- ✅ **Content library** (10 histoires de démarrage)
- ✅ **Test end-to-end validé** : vidéo 32s, 1.56 MB, 1080x1920 générée sans erreur

### Automatisation
- ✅ **GitHub Actions cron** quotidien à 10h UTC (`.github/workflows/social-publish.yml`)
- ✅ **Telegram notifications** intégrées
- ✅ **Auto-commit state** après publication

### Méta / config globale
- ✅ **14 skills** créés dans `~/.claude/skills/` :
  - `security`, `frontend-design`, `humanizer`, `know-me`, `create-skill`
  - `n8n`, `self-improving-agent`, `instagram-growth`, `design`, `word-docs`
  - `gemma-integration`, `kairos`, `ultraplan`, `coordinator`
- ✅ **`~/.claude/CLAUDE.md`** — méthodologie globale (tous projets)
- ✅ **`~/.claude/settings.json`** — permissions + hooks mis à jour
- ✅ **`~/.claude/session-start.sh`** — hook qui affiche MEMO.md/NOTES_USER.md
- ✅ **`NOTES_USER.md`** — tes préférences chargées automatiquement
- ✅ **3 guides API détaillés** (YouTube, TikTok, X/Twitter)

### Limites honnêtes (non-fait parce qu'impossible)
- ❌ **KAIROS/ULTRAPLAN/Coordinator Mode** : features Anthropic leakées mais **pas shippées** (planif mai 2026). J'ai créé des **simulations** utilisables.
- ❌ **Créer des comptes sociaux pour toi** : impossible (vérif SMS/CAPTCHA/ID)
- ❌ **Publier sans tes clés API** : besoin que tu les fournisses
- ❌ **Me rappeler ce soir activement** : je n'existe pas entre sessions. Ce MEMO EST le rappel.

---

## 🎯 ACTIONS POUR TOI CE SOIR (ordre priorité)

### ⭐ ÉTAPE 1 — Clé Google AI Studio (5 min) — **OBLIGATOIRE**

**Pourquoi** : Gemma 4 génère des scripts uniques. YouTube démonétise les chaînes qui reposent sur des templates IA génériques depuis juillet 2025.

```bash
# 1. Aller sur https://aistudio.google.com/apikey
# 2. Clic "Créer une clé API" (utilise ton compte Google)
# 3. Copier la clé (format AIzaSy...)

# 4. Créer le fichier secrets (local, jamais commité)
mkdir -p ~/.claude/secrets
chmod 700 ~/.claude/secrets
cat > ~/.claude/secrets/cmcteams.env <<'EOF'
export GOOGLE_AI_API_KEY="COLLE_TA_CLE_ICI"
EOF
chmod 600 ~/.claude/secrets/cmcteams.env

# 5. Charger dans la session
source ~/.claude/secrets/cmcteams.env

# 6. Tester
cd /home/user/CMCteams/tools/social
node cli.js generate-script --niche betrayal-revenge --length medium
```

Si ça fonctionne, tu vois un nouveau script ajouté à `config/content-library.json`.

---

### ⭐ ÉTAPE 2 — YouTube API (15 min) — **PRIORITÉ #1 MONÉTISATION**

**Pourquoi** : YouTube long-form = RPM $12.82 (100x plus que Shorts).

**Guide complet** : `tools/social/docs/setup-youtube.md`

**Résumé rapide** :
1. https://console.cloud.google.com/ → **Nouveau projet** `KDMC-Social-Video`
2. API et services → **Bibliothèque** → activer **YouTube Data API v3**
3. API et services → **Écran de consentement OAuth** → Externe → remplir → ajouter ton email comme testeur
4. API et services → **Identifiants** → créer **ID client OAuth** type **Application de bureau**
5. Télécharger le JSON, garder Client ID + Client Secret
6. Pour obtenir le refresh token (le plus compliqué) :
   - Pour l'instant, utilise [OAuth Playground Google](https://developers.google.com/oauthplayground/)
   - Sélectionne YouTube Data API v3 → `https://www.googleapis.com/auth/youtube.upload`
   - Autorise → échange code pour refresh token
7. Ajouter les 3 valeurs :
   ```bash
   cat >> ~/.claude/secrets/cmcteams.env <<'EOF'
   export YOUTUBE_CLIENT_ID="..."
   export YOUTUBE_CLIENT_SECRET="..."
   export YOUTUBE_REFRESH_TOKEN="..."
   EOF
   source ~/.claude/secrets/cmcteams.env
   ```

**Ajouter aussi dans GitHub Secrets du repo** (pour le cron auto) :
- Repo → Settings → Secrets and variables → Actions → New repository secret
- Crée : `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`, `GOOGLE_AI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`

---

### ⭐ ÉTAPE 3 — Assets musique (5-10 min)

Télécharger **5-10 fichiers MP3 royalty-free** et les mettre dans `tools/social/assets/music/`.

**Sources recommandées** :
- 🎵 **Pixabay Music** : https://pixabay.com/music/ (cherche "cinematic dark", "epic", "piano emotional", "lo-fi")
- 🎵 **Uppbeat** : https://uppbeat.io/ (compte gratuit, requiert attribution)
- 🎵 **YouTube Audio Library** : https://studio.youtube.com/ → Bibliothèque audio

**Styles recommandés pour narrative storytelling** :
- `dark-cinematic.mp3` (épique, mystérieux)
- `piano-emotional.mp3` (drame, intime)
- `tension-build.mp3` (suspense)
- `lo-fi-chill.mp3` (fact/finance)
- `epic-reveal.mp3` (twist endings)

Le système les détecte automatiquement, pas besoin de renommer spécifiquement.

---

### ⭐ ÉTAPE 4 — Test end-to-end (15 min)

Une fois étapes 1-3 faites :

```bash
cd /home/user/CMCteams/tools/social
source ~/.claude/secrets/cmcteams.env

# Test 1 : Vidéo avec script IA généré
node cli.js generate --ai-script --niche betrayal-revenge --format long

# Test 2 : Vidéo avec script existant
node cli.js generate --story betrayal-001 --format long

# Test 3 : Extract 3 Shorts depuis le long-form
LATEST=$(ls -t output/*/*_long.mp4 | head -1)
node cli.js extract-shorts --video "$LATEST" --count 3

# Test 4 : Publication YouTube en PRIVATE (pour validation manuelle)
node cli.js publish --platform youtube --video "$LATEST" --privacy private

# Test 5 : Publication YouTube d'un Short
SHORT=$(ls -t output/*/shorts/*.mp4 | head -1)
node cli.js publish --platform youtube --video "$SHORT" --privacy private --short
```

**Vérifier sur YouTube Studio** : https://studio.youtube.com/
→ Vidéos en `Privé` — tu les valides manuellement avant publication publique.

---

## 🟡 ACTIONS OPTIONNELLES (après les étapes 1-4)

### Instagram / Facebook
Les tokens sont probablement déjà dans tes intégrations CMCteams. Vérifier :
```bash
grep -l "FB_PAGE_TOKEN\|IG_ACCESS_TOKEN" ~/.claude/secrets/*.env 2>/dev/null
```
Si absent, voir `tools/integrations/facebook/setup.md`.

### TikTok
**Temps** : 15 min setup + 2-4 semaines review.
**Guide** : `tools/social/docs/setup-tiktok.md`

**Alternative rapide sans API** : tu reçois la vidéo sur Telegram, tu l'uploades manuellement sur TikTok (10 sec par vidéo).

### X / Twitter
**Skip.** Tier Basic = $100/mois. Pas rentable tant qu'audience pas validée.

---

## 🔴 ACTIONS À ÉVITER

- ❌ Ne paie **PAS** pour InVideo, Fliki, Pictory ($78-120/mois). On a tout gratuit.
- ❌ Ne **pas** poster des vidéos générées sans validation humaine au début (démonétisation).
- ❌ Ne **pas** générer 10 vidéos/jour d'un coup. Mieux vaut 2-3 vidéos qualité/semaine.
- ❌ Ne **pas** publier les Shorts avant le long-form (perte de stratégie).

---

## 📊 Récapitulatif commandes disponibles

```bash
# Dans /home/user/CMCteams/tools/social/

node cli.js list-stories                    # Liste histoires
node cli.js list-voices                     # Liste voix TTS
node cli.js test-tts --text "hello"         # Test TTS

node cli.js generate-script --niche betrayal-revenge --count 5
  # Génère 5 scripts IA et ajoute à la library

node cli.js generate --story betrayal-001 --format long
  # Génère vidéo depuis un script existant

node cli.js generate --ai-script --niche mystery --format short
  # Génère script ET vidéo d'un coup

node cli.js extract-shorts --video output/X/X_long.mp4 --count 3
  # Extrait 3 Shorts 9:16 d'un long-form

node cli.js publish --platform youtube --video X.mp4 --privacy private
node cli.js publish --platform youtube --video X.mp4 --privacy private --short

node cli.js publish --platform facebook --video X.mp4
node cli.js publish --platform instagram --video X.mp4   # Reel

node cli.js status                          # Liste vidéos générées
```

---

## 🎓 Skills installés — comment les utiliser

Les skills sont automatiques. Pour les invoquer explicitement :
- `/security` — audit sécurité
- `/frontend-design` — conseil UI moderne
- `/humanizer` — rendre un texte plus humain
- `/n8n` — créer un workflow automation
- `/design` — logo, branding
- `/word-docs` — générer un .docx
- `/gemma-integration` — utiliser Gemma 4
- `/kairos` — mode autonome (simulé)
- `/ultraplan` — planning profond (simulé)
- `/coordinator` — multi-agent parallèle (simulé)

Ou laisse-les s'activer automatiquement selon tes demandes.

---

## 🚨 Timeline honnête des revenus

| Période | Revenus | Ce qui se passe |
|---------|---------|-----------------|
| Mois 1-3 | **$0** | Construction library, 10-20 vidéos publiées |
| Mois 4-6 | **$0-100** | Premiers abonnés, test formats |
| Mois 6-12 | **$100-500/mois** | Seuil YouTube atteint (1K abo + 4000h) |
| Mois 12-18 | **$500-3000/mois** | Anciennes vidéos génèrent passif |
| Mois 18-24+ | **$2500-10000/mois** | Si constant et niche validée |

**Ce n'est PAS un quick-win.** Les chaînes faceless qui réussissent sont sur **6-12 mois de travail constant**.

---

## 🔄 Quand tu reprends la session

Tape simplement :
```
reprend MEMO.md
```

Je relirai ce fichier + NOTES_USER.md + check où on en est.

---

## 📞 Je ne peux pas te rappeler activement

Je n'ai **aucune mémoire entre les sessions**. Ce MEMO est le rappel.

Pour un vrai rappel actif, mets ça dans ton crontab :
```bash
# Rappel tous les jours à 20h
0 20 * * * notify-send "KDMC MEMO" "Lire /home/user/CMCteams/MEMO.md"
```

Ou utilise un app de rappel sur ton téléphone (Google Keep, etc.) avec le lien vers ce fichier.

---

## 📈 Maintenance du MEMO

Ce fichier est mis à jour par Claude à la **fin de chaque session** si quelque chose change :
- Actions faites → déplacées de "à faire" vers "fait"
- Nouvelles actions → ajoutées à la liste "à faire"
- Blocages → notés explicitement avec raison

Si tu veux forcer une mise à jour : `mets à jour MEMO.md`.
