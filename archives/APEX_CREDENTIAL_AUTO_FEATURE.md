# 🎯 APEX FEATURE — Reconnaissance & Tri Auto Credentials (Kevin 2026-04-27)

> Spec à implémenter APRÈS la page partage v12.377.
> Cette feature est **majeure** et **structurante** pour l'autonomie d'Apex.

---

## Contexte

> Kevin 2026-04-27 : "Quand tu auras terminé tout ton travail là, je veux que dans apex, je puisse quand on me demande par exemple mon numéro d'API ou que je puisse dire dans le chat à Apex, que je vais lui scanner mon numéro d'API tel numéro d'API github, et qu'avec la caméra quand je scanne un texte une capture d'écran ou quelque chose comme ça, ils reconnaissent automatiquement le code et ils l'intègrent à l'endroit où je lui ai dit."

---

## Spec complète

### 1. Bibliothèque centrale de credentials (`ax_credential_library`)

Source unique pour TOUS les codes/clés/comptes que Kevin possède.
Stockée dans Firebase RTDB chiffrée AES-GCM (clé maître Kevin).

**Format** :
```js
{
  "lib_xxxx": {
    id: "lib_xxxx",
    service: "GitHub",            // nom du site/app détecté
    type: "api_key" | "password" | "token" | "username" | "secret",
    label: "GitHub PAT 2026-04",  // nom convivial éditable
    value_enc: "AES_encrypted",   // valeur chiffrée
    url: "https://github.com",     // lien associé si détecté
    detected_pattern: "ghp_...",  // pattern qui a matché
    target_field: "ax_github_token", // champ Coffre cible auto-suggéré
    notes: "...",                  // notes manuelles Kevin
    tags: ["dev","github"],
    source: "scan_camera"|"paste"|"manual"|"voice",
    created_at: ts,
    updated_at: ts,
    is_active: true,               // false = ancien code remplacé
    is_used: true,                 // appliqué dans le Coffre
    test_status: "ok"|"err"|"untested",
    test_msg: "...",
    test_ts: ts
  }
}
```

### 2. Détection auto par OCR + pattern matching

**Sources d'entrée** (toutes vers la même fonction `_axIngestCredentials(text|image)`) :
- 📷 Caméra : capture photo → OCR (Tesseract.js lazy CDN)
- 📋 Coller texte : Cmd+V dans zone dédiée
- 📁 Upload fichier : .txt, .md, .pdf, image
- 🎙 Voix : "Apex je vais te scanner ma clé GitHub" → ouvre caméra
- ✍️ Note manuelle dans chat : extraction patterns

**Patterns à détecter** (regex strictes) :
| Service | Pattern | target_field |
|---------|---------|--------------|
| Anthropic Claude | `^sk-ant-[A-Za-z0-9_-]{40,}` | `ax_api_key` |
| OpenAI | `^sk-[A-Za-z0-9]{40,}` (sans `ant-`) | `ax_openai_key` |
| Google Gemini | `^AIza[A-Za-z0-9_-]{35}` | `ax_gemini_key` |
| Groq | `^gsk_[A-Za-z0-9]{50,}` | `ax_groq_key` |
| OpenRouter | `^sk-or-[A-Za-z0-9-]{40,}` | `ax_openrouter_key` |
| GitHub PAT (fine) | `^github_pat_[A-Za-z0-9_]{82}` | `ax_github_token` |
| GitHub PAT classic | `^ghp_[A-Za-z0-9]{36}` | `ax_github_token` |
| Cloudflare API | `^[A-Za-z0-9_-]{40}` (avec contexte cloudflare) | `ax_cloudflare_token` |
| Vercel | `^[A-Za-z0-9]{24}` (avec contexte vercel) | `ax_vercel_token` |
| Telegram bot | `^\\d{8,10}:[A-Za-z0-9_-]{35}` | `ax_telegram_token` |
| Stripe pub | `^pk_(test|live)_[A-Za-z0-9]{24,}` | `ax_stripe_pub` |
| Stripe secret | `^sk_(test|live)_[A-Za-z0-9]{24,}` | `ax_stripe_secret` |
| PayPal.me | `paypal\\.me\\/[A-Za-z0-9_-]+` | `ax_paypal_me` |
| Revolut tag | `@?revolut.*[A-Za-z0-9_]+` | `ax_revolut_tag` |
| IBAN | `[A-Z]{2}\\d{2}\\s?[A-Z0-9\\s]{16,30}` | `ax_iban` |
| BTC | `^(bc1|[13])[a-km-zA-HJ-NP-Z0-9]{25,87}` | `ax_btc_address` |
| ETH | `^0x[a-fA-F0-9]{40}` | `ax_eth_address` |
| HuggingFace | `^hf_[A-Za-z0-9]{34}` | `ax_huggingface_key` |
| Replicate | `^r8_[A-Za-z0-9]{40}` | `ax_replicate_key` |
| ElevenLabs | `^sk_[a-f0-9]{40,}` (contexte elevenlabs) | `ax_elevenlabs_key` |
| Mistral | `[A-Za-z0-9]{32}` (contexte mistral.ai) | `ax_mistral_key` |
| Perplexity | `^pplx-[A-Za-z0-9]{40,}` | `ax_perplexity_key` |
| Sentry DSN | `^https?://[a-f0-9]+@[^/]+/\\d+` | `ax_sentry_dsn` |

### 3. Disambiguation contextuelle

Quand plusieurs codes apparaissent (cas typique des notes Kevin) :

**Règle 1 — Espace entre comptes** :
```
GitHub
ghp_xxxxOLDxxxx       ← ancien
ghp_xxxxNEWxxxx       ← actuel (dernier sous le label)

OpenAI
sk-xxxxOPENAIxxxx
```
→ Apex prend **toujours le dernier** sous chaque label, marque les précédents `is_active=false`.

**Règle 2 — Lien comme contexte** :
```
https://github.com/settings/tokens
ghp_xxxxxxxxxx
```
→ URL au-dessus indique le service même si pattern ambigu.

**Règle 3 — Espace + nom service** :
```
github
[ligne vide]
ghp_xxxxx
```
→ Espace = séparateur, label précédent = service.

**Règle 4 — Distinction note/code/lien** :
- Si ligne contient `://` → lien
- Si ligne match pattern token → code
- Si ligne contient `@` + domaine → email
- Si ligne contient `+33|+1|...` + chiffres → téléphone
- Sinon → note (à garder telle quelle, pas confondre avec code)

### 4. Auto-fill Coffre depuis bibliothèque

**Sentinelle `_axCoffreAutoFill`** tourne après chaque ajout/modif bibliothèque :
1. Pour chaque entry `ax_credential_library` actif (`is_active:true`)
2. Si `target_field` défini ET ce champ Coffre est vide ou différent
3. Auto-coller la valeur déchiffrée dans le champ Coffre
4. Tester live via `axCredTestLive(target_field)`
5. Si OK → bulle verte, log audit `auto_fill_ok`
6. Si KO → bulle rouge, alerte admin, log `auto_fill_failed` + raison

### 5. Workflow scan caméra

```
User dans chat : "Apex je te scanne ma clé GitHub"
  ↓
Apex détecte intent "scan credential" + service "github"
  ↓
Ouvre caméra plein écran (axCameraCapture existant)
  ↓
Photo prise → axOCRImage(blob) → texte extrait
  ↓
_axIngestCredentials(text, hint:"github") :
  - Disambiguation par contexte
  - Match patterns
  - Crée entry library
  - Marque ancien `is_active=false` si remplacement
  ↓
_axCoffreAutoFill() :
  - Colle valeur dans ax_github_token
  - Test live
  ↓
Toast : "✅ Clé GitHub scannée + intégrée + testée OK"
```

### 6. Vue admin "📚 Bibliothèque codes"

Vue dédiée `vCredLibrary` :
- Liste toutes entries triées par service
- Filtres : actif/inactif, testé/non testé, type
- Recherche fulltext
- Boutons par entry :
  - 👁 Voir (déchiffre + révèle 2s)
  - ✏️ Éditer label/notes/tags
  - 🔄 Re-tester live
  - 🗑 Supprimer (soft delete avec confirmation)
  - 🔁 Marquer ancien (is_active=false)
  - 📋 Copier valeur
- Bouton "📷 Scanner nouveau code" → ouvre caméra
- Bouton "📋 Coller batch" → zone texte multi-codes
- Bouton "🔍 Auto-fill Coffre maintenant" → force run sentinelle

### 7. Voix : "Apex je te scanne X"

Détection vocale via `axSttToggle` + `_checkVoiceCommand` :
- "scanne ma clé X"
- "je te scanne X"
- "voici ma clé X"
- "ajoute ma clé X"

→ Ouvre caméra avec hint=X + workflow point 5.

### 8. Détection liens vs codes vs notes (regex)

```js
function _axClassifyLine(line){
  if(/^https?:\/\//.test(line)) return "link";
  if(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}$/.test(line)) return "email";
  if(/^\+?[\d\s().-]{8,20}$/.test(line)) return "phone";
  // Patterns credentials
  for(var p of CRED_PATTERNS){
    if(p.regex.test(line)) return {type:"credential", service:p.service, target:p.target};
  }
  if(/^[A-Z][a-zA-Z\s]{2,30}$/.test(line)) return "label"; // nom service
  if(line.length<3) return "blank";
  return "note";
}
```

### 9. Mémo tâches Kevin

Si Apex détecte qu'un service N'A PAS de credential dans la bibliothèque :
- Ajoute entrée dans `KEVIN_ACTIONS_TODO.md` :
  - "📝 Créer compte X" 
  - "📝 Récupérer clé API Y"
  - "📝 Coller lien proxy Z"
- Visible dans Apex vMemoTodos
- Décochée auto si credential détecté plus tard

### 10. Self-healing en cas d'échec test live

Si auto-fill colle une clé mais test live KO :
1. Marker entry `test_status:"err"` + `test_msg`
2. Notification push Kevin "⚠ Clé X expirée/invalide — régénère sur [URL]"
3. Modal Apex avec :
   - Lien direct console du service
   - Bouton "✏️ Saisir nouvelle clé"
   - Bouton "📷 Scanner nouvelle clé"
4. Audit `cred_test_failed` avec détails

---

## Architecture technique

| Composant | Fichier / Fonction |
|-----------|-------------------|
| Patterns regex | constante `AX_CRED_PATTERNS` (étend l'existant `axCredBadge` regex) |
| OCR | `axOCRImage(blob)` lazy load Tesseract.js CDN |
| Ingest | `_axIngestCredentials(text, hint?)` core logic |
| Classify | `_axClassifyLine(line)` |
| Disambiguation | `_axDisambiguateBlock(lines)` traite blocks séparés par lignes vides |
| Library CRUD | `axCredLibAdd/Get/Update/Delete` Firebase chiffré |
| Auto-fill | `_axCoffreAutoFill()` sentinelle après chaque add lib |
| Voice intent | `_checkVoiceCommand` étendu |
| Camera | `axCameraCapture` existant + new flag `mode:"scan_credential"` |
| Vue UI | `vCredLibrary` admin |
| Audit | log via `_audit("cred_lib_add", ...)` |

---

## Implementation order (suite v12.378+)

1. **v12.378** : `AX_CRED_PATTERNS` étendu + `_axIngestCredentials` + UI base bibliothèque
2. **v12.379** : Tesseract.js OCR + caméra workflow scan_credential
3. **v12.380** : Disambiguation multi-blocs + classify lines
4. **v12.381** : Auto-fill Coffre + sentinelle
5. **v12.382** : Voice intent "scanne ma clé X"
6. **v12.383** : Self-healing échec test + notif Kevin
7. **v12.384** : KEVIN_ACTIONS_TODO auto-update sur services manquants

---

## Niveau pro attendu

> Kevin : "Plus besoin de l'admin pour rentrer ces ces comptes ou ces choses comme ça."

→ **Objectif** : zéro saisie manuelle. Kevin scanne / colle, Apex range, teste, applique.

---

## Sécurité

- Bibliothèque chiffrée AES-GCM avec passphrase Kevin
- OCR fait localement (Tesseract.js, pas de cloud)
- Pas d'envoi de credentials à l'IA Claude/OpenAI (extraction client-side uniquement)
- Audit complet de chaque opération (qui, quand, quoi)
- RGPD : Kevin peut révoquer/effacer toute la bibliothèque

---

## Test mental obligatoire avant release

> "Si Kevin pose son iPhone, prend une photo de ses notes papier où il y a 5 codes différents pour 5 services différents avec des espaces entre, est-ce qu'Apex extrait les 5 + range chacun au bon endroit Coffre + teste les 5 + bulles vertes ?"

Si non → reprendre.
