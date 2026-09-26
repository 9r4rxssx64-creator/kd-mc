# Apex iOS App Store **SANS Mac** (Kevin 2026-05-15)

> **Réponse à Kevin** : "Comment faire sans Mac ?" → GitHub Actions exécute un macOS runner gratuit, build l'IPA, signe avec ton certificat, upload TestFlight en autonomie. Tu ne touches jamais à Xcode.

## Vue d'ensemble

```
Toi (iPhone) ─→ GitHub web (Actions tab) ─→ Click "Run workflow"
                       ↓
              GitHub macOS runner (Xcode 15 pré-installé, free)
                       ↓
            npm install + Vite build + Capacitor + Pod install
                       ↓
                  Xcode archive + sign
                       ↓
            TestFlight upload via altool API
                       ↓
            Notif Telegram + IPA artifact téléchargeable
                       ↓
                Toi sur iPhone : ouvre TestFlight, install Apex
```

**Coût total** : 99 USD/an Apple Developer + 0€ GitHub Actions (2000 min/mois gratuites). MacInCloud / location Mac : ZÉRO.

## Setup one-shot (1-2h, depuis iPhone)

### Étape 1 — Inscription Apple Developer (depuis iPhone)

1. Va sur https://developer.apple.com/programs/enroll (Safari iPhone)
2. Connecte-toi avec ton Apple ID `kevin.desarzens@...`
3. Choisis "Individual" (99 USD/an, billing CB)
4. Activation : 24-48h
5. Récupère **Team ID** (10 chars, ex: `ABC1234DEF`) → noté

### Étape 2 — Créer certificat distribution (web, sans Mac)

Apple Developer Portal **NE permet PAS** créer un certificat sans Mac directement. **Solution** :

#### Option A — Service tiers gratuit "fastlane match" (recommandé)

1. Sur GitHub repo, créer 1 fichier `.github/workflows/setup-fastlane-match.yml` (one-shot)
2. Tu colles juste ton Apple ID + password app-spécifique dans Secrets
3. Fastlane crée cert + provisioning profile auto, les stocke chiffrés dans repo privé séparé
4. À chaque build : pull, déchiffre, utilise

#### Option B — Codemagic (paid mais autonomous)

Codemagic.io génère cert + profile via GUI web depuis ton iPhone. Free tier : 500 min/mois.

#### Option C — Demander à un ami avec Mac (15 min one-shot)

Pour les certs SEULEMENT, un Mac suffit 15 min UNE seule fois :
1. Ami ouvre Xcode → Preferences → Accounts → ajoute ton Apple ID
2. Créer "iOS Distribution Certificate" → exporte en `.p12` avec mot de passe
3. Crée provisioning profile "App Store" pour `com.kdmc.apex` → télécharge `.mobileprovision`
4. Ami t'envoie les 2 fichiers (chiffrés via Signal/iMessage)
5. Tu n'as plus jamais besoin du Mac

**Option C est la plus simple. 15 min one-shot.**

### Étape 3 — Configurer GitHub Secrets (depuis iPhone)

GitHub web → repo `CMCteams` → Settings → Secrets and variables → Actions → New secret. Ajouter :

| Secret name | Valeur | D'où vient |
|---|---|---|
| `APPLE_TEAM_ID` | `ABC1234DEF` | Apple Developer Portal Membership |
| `APPLE_CERT_P12_BASE64` | base64 du `.p12` | `base64 < cert.p12 \| pbcopy` (Mac ami) OU app `BasE64 Encoder` iOS |
| `APPLE_CERT_P12_PASSWORD` | mdp du `.p12` | Choisi à l'export |
| `APPLE_PROVISIONING_PROFILE_BASE64` | base64 du `.mobileprovision` | idem |
| `APPSTORE_API_KEY_ID` | ex `XYZ123ABC` | App Store Connect → Users and Access → Keys → "+" |
| `APPSTORE_API_ISSUER_ID` | UUID | idem (en haut de la page Keys) |
| `APPSTORE_API_KEY_BASE64` | base64 du `.p8` | API key Apple → télécharger 1 seule fois → base64 |

App `BasE64 Encoder` iOS gratuit fait l'encodage sur iPhone, pas de Mac requis.

### Étape 4 — Créer fiche app sur App Store Connect (iPhone web)

1. https://appstoreconnect.apple.com (Safari iPhone, fonctionne en mobile)
2. My Apps → "+" → New App
3. Platform : iOS / Name : "Apex" / Primary language : French / Bundle ID : `com.kdmc.apex` / SKU : `apex-v13`
4. **Note l'App Store Connect API setup** : Users and Access → Integrations → App Store Connect API → Generate Key → "Apex CI" → role "App Manager" → Download `.p8` (1 chance ! sauvegarder dans Files iCloud)

### Étape 5 — Trigger 1er build depuis iPhone

GitHub web → repo CMCteams → Actions tab → "Build iOS IPA on GitHub Actions macOS (sans Mac)" → "Run workflow" → choisir `testflight` → Click vert "Run workflow"

**Premier run** : ~30 min (xcodebuild + sign + upload). Reçois notif Telegram quand fini ("🍎 Apex iOS build #1 → success").

### Étape 6 — Installer Apex depuis TestFlight (iPhone)

1. Install **TestFlight** depuis App Store (gratuit)
2. Reçois email d'Apple (admin@apex.app) avec lien invitation
3. Click lien → ouvre TestFlight → Install "Apex"
4. Apex est sur ton écran d'accueil, vrai app native iOS

### Étape 7 — Publier sur l'App Store (depuis iPhone)

1. App Store Connect web → "Apex" → Préparer la soumission
2. Remplir : description, mots-clés, screenshots iPhone (générés par Capacitor ou pris dans TestFlight)
3. "Submit for Review" → Apple review : 24-48h
4. Statut "Ready for Sale" → Apex public sur App Store

## Workflow CI quotidien (zéro intervention Kevin)

Chaque push sur `main` qui touche Capacitor → workflow déclenché auto :
1. Build dist/ Vite
2. Capacitor sync iOS
3. xcodebuild archive (mode dry-run = pas de signing)
4. Upload artifact `apex-ios-xcarchive-X` (téléchargeable 7 jours)

Pour release TestFlight : `workflow_dispatch` manuel, choisir `testflight`.

## Coûts annuels récap

| Item | Coût |
|---|---|
| Apple Developer Program | 99 USD/an |
| GitHub Actions macOS runner | 0€ (repo privé : 50 min/mois gratuites, repo public : illimité gratuit) |
| TestFlight | 0€ |
| App Store distribution | 0€ |
| Telegram bot notif | 0€ |
| **TOTAL** | **99 USD/an** |

vs. MacInCloud (30 USD/mois = 360 USD/an) ou achat Mac (1500€+).

## Limites honnêtes

- **GitHub Actions macOS runner gratuit** : 50 min/mois pour repos privés (peut limiter à ~2 builds/mois). Repo public = illimité, mais code visible. Solution : repo privé + payer overage ($0.08/min après 50 min = $1.60 par build extra) OU rendre repo public.
- **Certificats Apple** : valides 1 an, renouvellement annuel via Mac ami 15 min.
- **Push de l'IPA** : Apple peut refuser si bugs critiques. Solution : audits internes pré-soumission (Apex a déjà sentinel-watch + tests E2E).
- **Modification iOS code natif Swift** : si tu veux ajouter un plugin custom Swift non-Capacitor, là il faut Xcode. Mais 95% du temps les plugins Capacitor officiels suffisent (Preferences, Filesystem, Share, Push, etc. tous déjà installés v13.4.122).

## Test mental obligatoire avant chaque release

> *"Si je clique 'Run workflow' MAINTENANT depuis Safari iPhone, est-ce que dans 30 min mon iPhone vibre avec une notif Telegram 'iOS build success' et qu'Apex se met à jour automatiquement dans TestFlight ?"*

Si oui → autonomie complète sans Mac. Si non → debug logs GitHub Actions.

## Alternative ultime : CI/CD service tout-en-un

Si GitHub Actions trop friction, **Codemagic** ou **Bitrise** font tout via UI web :
- Connecte repo GitHub
- Import certs via web upload
- Build + sign + TestFlight upload en 1 clic
- Pas de YAML à écrire

Free tier limité (500 min/mois Codemagic, 200 min/mois Bitrise). 30 USD/mois pour usage soutenu.

## Prochaines étapes

1. ☐ S'inscrire Apple Developer (99 USD/an, depuis iPhone)
2. ☐ Obtenir cert + profile (option C ami avec Mac 15 min, le plus simple)
3. ☐ Ajouter 7 secrets dans GitHub Settings → Secrets
4. ☐ Créer fiche app sur App Store Connect (iPhone Safari)
5. ☐ Click "Run workflow" → premier build TestFlight
6. ☐ Install Apex via TestFlight sur iPhone
7. ☐ Submit for Review → publication App Store

**Tout depuis iPhone. Zero Mac.**
