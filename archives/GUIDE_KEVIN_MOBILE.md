# 🚀 Guide Kevin — Actions 2 & 3 (vue iPhone / Android)

> 5 min total · étape par étape · captures d'écran à faire pour chaque étape

---

## ✅ ACTION 2 — Configurer GitHub PAT dans Apex Vault (60 sec)

**Pourquoi** : débloque l'auto-patch Apex (elle peut modifier son propre code via GitHub API et créer des PR automatiquement).

### 📱 Sur iPhone (Safari)

**Étape 1/5 — Aller sur GitHub Tokens**
- Ouvre Safari
- Va sur : `https://github.com/settings/personal-access-tokens/new`
- (si demandé, connecte-toi avec ton compte `9r4rxssx64-creator`)

**Étape 2/5 — Remplir le formulaire**
- **Token name** : `APEX_AUTO_PATCH`
- **Expiration** : 90 days (ou "No expiration" si tu veux)
- **Resource owner** : `9r4rxssx64-creator` (par défaut)
- **Repository access** : tape sur "Only select repositories" → coche uniquement `cmcteams`

**Étape 3/5 — Permissions**
Scroll vers le bas jusqu'à "Repository permissions", tape sur les menus :
- **Contents** : change "No access" → **Read and write**
- **Pull requests** : change "No access" → **Read and write**
- **Metadata** : laisser sur Read-only (auto-coché)
- Laisse tout le reste sur "No access"

**Étape 4/5 — Générer**
- Scroll en bas, tape **"Generate token"**
- GitHub affiche un token qui commence par `github_pat_11...`
- **TAPE sur le bouton "Copy"** à côté du token (NE FERME PAS LA PAGE avant de coller)

**Étape 5/5 — Coller dans Apex**
- Ouvre Apex AI (autre onglet Safari ou icône écran d'accueil)
- Barre de nav du bas → tape **"+ Plus"**
- Dans la liste, tape **"🔐 Coffre"** (ou "Vault")
- Scroll jusqu'à la catégorie **"🔗 GitHub"** (ou cherche `ax_github_pat`)
- Tape sur le champ `ax_github_pat` → **colle** le token (appui long → Coller)
- Tape **"Sauvegarder"** ou **"✓"** à droite du champ
- Retour sur Safari → fermer la page GitHub (ne garde pas le token en cache)

**Vérif** : dans le chat Apex, tape : `Lis mon fichier README.md`. Si elle affiche le contenu → OK, tout marche.

### 📱 Sur Android (Chrome)

Même étapes que iPhone (Safari = Chrome côté GitHub). Chrome Android supporte aussi "copier/coller" avec appui long.

---

## ✅ ACTION 3 — Firebase Rules (2 min)

**Pourquoi** : sécuriser la clé API Anthropic (`ax_shared_api_key`) pour qu'un utilisateur non-admin ne puisse pas la lire directement.

### 📱 Sur iPhone (Safari) ou Android (Chrome)

**Étape 1/4 — Ouvrir Firebase Console**
- Va sur : `https://console.firebase.google.com/project/cmcteams-c16ab/database/cmcteams-c16ab-default-rtdb/rules`
- Connecte-toi avec ton compte Google qui possède le projet

**Étape 2/4 — Onglet Rules**
- Tu es normalement sur l'onglet **"Règles"** / **"Rules"** directement
- Sinon : menu → "Realtime Database" → onglet "Rules"

**Étape 3/4 — Remplacer le contenu**
Tu vois un éditeur JSON. Copie-colle ce texte **intégralement** à la place :

```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null",
    "apex": {
      "ax_shared_api_key": {
        ".read": "auth != null && auth.token.admin === true",
        ".write": "auth != null && auth.token.admin === true"
      },
      "ax_kevin_profile": {
        ".read": "auth != null && auth.token.admin === true",
        ".write": "auth != null && auth.token.admin === true"
      },
      "ax_github_pat": {
        ".read": "auth != null && auth.token.admin === true",
        ".write": "auth != null && auth.token.admin === true"
      },
      "ax_telemetry_in": {
        ".read": "auth != null",
        ".write": "auth != null"
      },
      "ax_claude_todo": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    }
  }
}
```

**Étape 4/4 — Publier**
- Tape **"Publier"** (bouton bleu en haut à droite)
- Confirme si Firebase demande "Êtes-vous sûr ?"
- Attendre le toast vert "Règles publiées"

⚠️ **IMPORTANT** : actuellement ton app utilise Firebase **sans authentification**. Ces rules vont **casser** les users non-admin si tu ne mets pas en place Firebase Auth.

### 🟡 Option B (plus simple pour l'instant)

Si tu ne veux pas installer Firebase Auth maintenant, garde temporairement :

```json
{
  "rules": {
    ".read": "true",
    ".write": "true"
  }
}
```

Et reviens plus tard pour Action 3 une fois qu'on aura mis en place Firebase Auth. Dis-moi "installe Firebase Auth" et je le ferai en 30 min.

---

## ✅ Vérification finale

Une fois Actions 2 + 3 faites :

1. Ouvre Apex → onglet **🎭 Crew IA** (admin menu Plus)
2. Tu dois voir les 9 agents listés avec leur nombre d'appels
3. Tape une question longue dans le chat → toast "Concertation 2 experts" s'affiche

Si tu vois ça → **TOUT est opérationnel**. Les 2 apps sont au max.

---

## 🆘 En cas de problème

- **Token GitHub refusé dans Apex** : vérifie qu'il commence par `github_pat_11` et que tu as bien coché `Contents: Read and write` + `Pull requests: Read and write`
- **Firebase "Invalid rules"** : copie-colle exactement le JSON ci-dessus, pas de caractères bizarres
- **Firebase rules cassent l'app** : retourne sur Option B (`".read":"true", ".write":"true"`) et contacte-moi

Dis-moi "étape X faite" et je passe à la suivante.
