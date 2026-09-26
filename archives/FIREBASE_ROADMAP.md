# 🔥 FIREBASE ROADMAP — Inventaire & étapes pas-à-pas (Kevin novice)

> **Mission** : voir ce qu'on a déjà sur Firebase + faire ensemble ce qui manque, étape par étape.
> **Date** : 2026-05-01 (Apex v12.559)
> **Pour Kevin** : tu cliques. Je code. Pas de jargon.

---

## 📦 INVENTAIRE — Ce qu'on a déjà confirmé

### ✅ 2 projets Firebase actifs

| # | Projet | URL RTDB | Usage |
|---|--------|----------|-------|
| 1 | **`cmcteams-c16ab`** | `cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app` | App CMCteams casino Monaco (planning 258 employés) |
| 2 | **`kdmc-clients`** | `kdmc-clients-default-rtdb.europe-west1.firebasedatabase.app` | App Apex AI (chat IA + Coffre + clients) |

### ✅ Données stockées (selon `NOTES_USER.md`)

#### Sur `cmcteams-c16ab` (CMCteams)
- `cmc_employes` : 258 employés casino
- `cmc_planning` : planning shifts par mois
- `cmc_motd` : message du jour
- `cmc_chat_messages` : chat employés
- Rules : `cmcteams` read/write autorisés (publiées par Kevin)

#### Sur `kdmc-clients` (Apex AI)
- `apex/ax_shared_api_key` : ✅ **clé Anthropic master** (sync cross-device admin)
- `apex/ax_user_chat_<uid>` : chat per-user
- `apex/ax_settings_<uid>` : settings per-user
- `apex/ax_audit` : audit trail global admin
- `apex/ax_telemetry_in` : remontées erreurs auto
- `apex/ax_claude_todo` : todos Claude Code (escalade autonomie)
- `apex/ax_lessons_learned_struct` : mémoire cross-session
- Rules : `apex` read/write (à durcir Phase 5 — voir étape 4 ci-dessous)

### ✅ Helpers existants
- `firebase-rules.json` : rules CMCteams (publiées)
- `firebase-rules-apex.json` : rules Apex AI (créé v12.554, **Phase 5 ready** — 12 patterns blocklist + auth.uid gate)

---

## ❓ ÉTAT INCONNU À CONFIRMER

### Q1 — As-tu **2 projets Firebase distincts** créés ?
- 🟢 **OUI les 2** → étape 1 SKIP
- 🟡 **Seulement cmcteams-c16ab** → étape 1 ci-dessous (créer kdmc-clients)
- 🔴 **NON aucun** → étape 1 (créer les 2)

### Q2 — Le **plan Firebase** : Spark (gratuit) ou Blaze (pay-as-you-go) ?
- 🟢 **Spark gratuit** → suffisant pour Apex perso + max ~10 utilisateurs Apex Chat
- 🟡 **Blaze** → nécessaire pour Apex Chat grand public (Cloud Functions + workers > free tier)

### Q3 — Phase 5 Firebase Auth (custom tokens via apex-auth-worker) déployée ?
- 🟢 **OUI** → rules `auth.uid` gate active
- 🔴 **NON** → étape 4 (suivre PHASE5_DEPLOY.md)

### Q4 — Service Account JSON pour `kdmc-clients` récupéré ?
- 🟢 **OUI** → stocké en sécurité
- 🔴 **NON** → étape 3 (5 min, Console Firebase)

---

## 🚀 PLAN D'ACTION PAS À PAS

### Étape 1 — Créer projet Firebase manquant (5 min, GRATUIT)

Si projet `kdmc-clients` n'existe pas encore :
1. Va sur **https://console.firebase.google.com/**
2. Clique **"Ajouter un projet"**
3. Nom : `kdmc-clients` (exact, sinon les rules ne match pas)
4. Active Google Analytics si tu veux (optionnel, gratuit)
5. Région : **Europe (europe-west1)**

✅ **Fait** : Firebase t'affiche le dashboard du projet.

---

### Étape 2 — Activer Realtime Database (3 min)

Pour CHAQUE projet (`cmcteams-c16ab` ET `kdmc-clients`) :

1. Menu gauche → **Build** → **Realtime Database**
2. Clique **"Créer une base de données"**
3. Région : **europe-west1** (Belgique, RGPD-compliant)
4. Mode : **"Mode test"** (à durcir après avec rules)
5. Clique **"Activer"**

✅ **Fait** : URL RTDB visible (genre `https://kdmc-clients-default-rtdb.europe-west1.firebasedatabase.app`)

---

### Étape 3 — Récupérer Service Account JSON (5 min)

**Pour Phase 5 Firebase Auth uniquement** (apex-auth-worker).
Si tu ne veux pas Phase 5 maintenant, **skip** cette étape.

1. Console Firebase → projet `kdmc-clients` → **⚙️ Paramètres du projet**
2. Onglet **"Comptes de service"**
3. Clique **"Générer une nouvelle clé privée"** → confirme
4. Un fichier JSON se télécharge — **STOCKE-LE EN SÉCURITÉ** (équivalent code carte bleue)
5. Plus tard, étape 4 utilisera 2 valeurs de ce JSON :
   - `private_key` → Cloudflare secret `FIREBASE_PRIVATE_KEY`
   - `client_email` → Cloudflare secret `FIREBASE_CLIENT_EMAIL`

⚠️ **Important** : ne push JAMAIS ce JSON sur GitHub. Garde-le local + dans le Coffre Apex chiffré (`ax_firebase_service_account_json`).

---

### Étape 4 — Publier les rules Phase 5 (5 min)

#### Pour `cmcteams-c16ab` (CMCteams)
1. Console Firebase → projet `cmcteams-c16ab` → Realtime Database → onglet **Rules**
2. Copie le contenu de **`firebase-rules.json`** (existant repo)
3. Colle dans l'éditeur Firebase, clique **"Publier"**

#### Pour `kdmc-clients` (Apex AI Phase 5)
1. Console Firebase → projet `kdmc-clients` → Realtime Database → onglet **Rules**
2. Copie le contenu de **`firebase-rules-apex.json`** (créé v12.554)
3. Colle dans l'éditeur Firebase
4. ⚠️ **Important** : ces rules utilisent `auth.uid` (Phase 5). Si apex-auth-worker n'est PAS déployé, utilise les rules Phase 4 fallback (en bas du fichier `firebase-rules-apex.json`)
5. Clique **"Publier"**

✅ **Fait** : tes données per-user sont protégées au niveau Firebase.

---

### Étape 5 — Connecter Apex AI à `kdmc-clients` (1 min)

Si pas déjà fait :
1. Sur ton iPhone, ouvre Apex AI → Coffre
2. Clé `ax_firebase_url` → valeur : `https://kdmc-clients-default-rtdb.europe-west1.firebasedatabase.app`
3. Clé `ax_firebase_url_cmcteams` → valeur : `https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app`

(Apex AI sait déjà ces URLs via constantes hard-coded, mais avoir dans Coffre permet override admin.)

---

### Étape 6 — Backup quotidien Firebase (OPTIONNEL, 2 min)

Pour ne JAMAIS perdre tes données :

1. Console Firebase → projet → Realtime Database → **Backups**
2. Plan Spark gratuit : exports manuels seulement
3. Plan Blaze : backups auto quotidiens (~0.10€/mois pour 1 Go)

OU alternative gratuite : sentinelle Apex `axBackupAllProjects()` (à coder v12.560+) qui dump RTDB → JSON → IndexedDB local quotidien.

---

## 📊 ÉTAT FINAL ATTENDU

Après tout fait (~20 min cumulé) :

| Item | Statut |
|------|--------|
| Projet `cmcteams-c16ab` actif | ✅ |
| Projet `kdmc-clients` actif | ✅ |
| Realtime Database activé sur les 2 | ✅ |
| Rules CMCteams publiées | ✅ |
| Rules Apex publiées (Phase 4 ou 5) | ✅ |
| Service Account JSON sauvegardé | ✅ (uniquement si Phase 5) |
| Apex AI connecté + sync auto | ✅ |
| Backup quotidien | ⏳ optionnel |

**Score Apex AI estimé après Firebase complet** : Sécurité 91 → 95 (avec Phase 5 rules deployées).

---

## 🤖 Apex IA AUTO-CHECK statut Firebase

Apex IA peut maintenant (via helper futur v12.560) lire ton statut Firebase :

```
Sur ton iPhone, dans le chat Apex, tape :
> Audit Firebase
```

Apex te dira :
- ✅ Quel projet RTDB est connecté
- ❌ Si le projet `kdmc-clients` ne répond pas
- ⚠️ Si les rules sont en mode test (= ouvertes à tous, INSECURE)
- ⚠️ Si Phase 5 Auth pas déployée

---

## ⚠️ Sécurité — Erreurs courantes à éviter

1. **JAMAIS publier le Service Account JSON sur GitHub** (équivalent code CB)
2. **JAMAIS laisser les rules en "Mode test"** plus de 30 jours en prod (publié auto par Firebase si tu cliques mode test)
3. **JAMAIS partager l'URL RTDB** + `?print=pretty` à n'importe qui (en mode test, expose toutes les données)
4. **TOUJOURS** activer 2FA sur ton compte Google qui possède Firebase

---

## 📞 Si tu coinces

Tape dans Apex chat :
> Aide Firebase étape X

Apex IA guide pas-à-pas + propose action 1-clic via Apex Code Companion.

---

**Document** : Claude Code session_01BnrRgT9QTJtmaRzBFsoiRq
**Date** : 2026-05-01
**Version** : Apex v12.559
