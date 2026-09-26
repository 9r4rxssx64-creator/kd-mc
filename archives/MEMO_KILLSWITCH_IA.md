# Kill-switch IA — Pattern à appliquer à tous les projets

> Document de référence : reproduire ce pattern sur tous les projets Kevin **sauf Apex AI**
> (Apex est l'app IA principale, désactiver n'a pas de sens).

## Objectif

Permettre à l'admin de **couper en 1 clic toute consommation de tokens** Anthropic/OpenAI,
sans avoir à supprimer la clé API ou désactiver la fonction côté backend.

## Principe

Un flag local `<projet>_ia_enabled` (string `"0"` = OFF, autre = ON) consulté par TOUS les
sites d'appel API IA via un helper centralisé `iaIsEnabled()`. Aucune autre source de vérité.

---

## Étapes d'implémentation (appliquées dans CMCteams v9.675)

### 1. Helper centralisé

À placer dans la zone d'initialisation IA du projet :

```javascript
// Source unique de vérité, relue à chaque appel (résiste aux divergences SSE/cross-device)
function iaIsEnabled(){
  try{return localStorage.getItem("cmc_ia_enabled")!=="0";}catch(_){return true;}
}
function iaBlockedToast(){
  try{toast("⏸ IA désactivée — tokens préservés. Réactivez dans Admin → IA.","err");}catch(_){}
}
```

Adapter la clé selon le projet :
- CMCteams : `cmc_ia_enabled`
- Apex bridge : ne PAS implémenter (exclu)
- Autres projets Kevin : `<prefix>_ia_enabled` (snake_case court)

### 2. Audit des sites d'appel

Lister TOUS les endroits qui contactent une API IA :

```bash
grep -nE "api\.anthropic\.com|api\.openai\.com|/v1/messages|/api/chat/proxy|/v1/chat/completions" <projet>/
```

Pour CMCteams v9.675 (référence), 6 sites ont été identifiés :
- Sentinelle de maintenance (silencieuse)
- Vision fallback import PDF (async, retourne objet d'erreur)
- Scanner OCR document caméra (toast + remove modal)
- Scanner badge employé (toast + remove modal)
- Camera studio multi-modes (toast)
- Chat IA principal (`iaSend`) — déjà gardé historiquement

### 3. Insérer le guard sur chaque site

Au TOUT DÉBUT de chaque fonction qui déclenche un appel, avant toute autre logique
(permission caméra, prompt user, etc.) :

```javascript
// Variante UI bouton/scan (visible) :
if(typeof iaIsEnabled==="function"&&!iaIsEnabled()){iaBlockedToast();return;}

// Variante async qui doit retourner un objet :
if(typeof iaIsEnabled==="function"&&!iaIsEnabled()){
  return {ok:false,reason:"IA désactivée (kill-switch)"};
}

// Variante silencieuse (sentinelle / polling) :
if(typeof iaIsEnabled==="function"&&!iaIsEnabled())return;
```

Le `typeof iaIsEnabled==="function"` évite la régression si le helper n'est pas encore
chargé au démarrage (hoisting / ordre de définition).

### 4. UI admin

Trois éléments visibles :

**a) Bouton dans le panneau admin** (tout en haut, première section visible) :

```javascript
{sep:"🤖 IA — Kill-switch tokens"+(iaIsEnabled()?"":" — ⏸ OFF")},
{ic:iaIsEnabled()?"⏸":"▶",lb:(iaIsEnabled()?"Désactiver IA":"Activer IA")+" (économie tokens)",fn:"iaToggle()"},
{ic:"🔑",lb:"Configurer clé API",fn:"iaSetApiKey()"},
```

**b) Badge topbar permanent** quand IA OFF (admin uniquement) :

```javascript
if(isAdm && !iaIsEnabled()){
  badge='<span onclick="iaToggle()" title="IA désactivée — cliquer pour réactiver" '
    +'style="cursor:pointer;padding:1px 6px;border-radius:9px;'
    +'background:rgba(192,120,48,.18);color:#c07830;border:1px solid rgba(192,120,48,.45);'
    +'font-size:10px;font-weight:800">⏸ IA OFF</span>';
}
```

**c) Toast au toggle** (mentionne explicitement les zones couvertes) :

```javascript
toast(iaEnabled
  ?"✓ IA activée (chat, OCR, scan, vision, sentinelle)"
  :"⏸ IA désactivée — aucun appel API, tokens préservés");
```

### 5. Audit log

Toujours auditer le changement d'état (qui, quand, ancien/nouveau état) :

```javascript
_audit("ia_"+(iaEnabled?"activee":"desactivee"),AID,"IA",
       !iaEnabled?"activée":"désactivée",
       iaEnabled?"activée":"désactivée");
```

---

## Vérification

Après implémentation, sur chaque projet :

```bash
# 1. Syntaxe JS
node --check <bundle>

# 2. Chaque site d'appel a un guard dans les 20 lignes au-dessus
grep -nE "api\.anthropic\.com|/v1/messages|/api/chat/proxy" <projet>/

# 3. Test fonctionnel admin :
#   - Toggle ON → tous les appels passent
#   - Toggle OFF → badge "⏸ IA OFF" topbar
#   - Toggle OFF → chaque bouton scan/IA affiche le toast d'erreur
#   - Toggle OFF → DevTools Network montre ZÉRO requête vers api.anthropic.com
```

---

## Projets concernés

| Projet               | Statut             | Clé localStorage         |
|----------------------|--------------------|--------------------------|
| CMCteams             | ✅ v9.675 (référence) | `cmc_ia_enabled`         |
| Apex AI              | ❌ Exclu (app IA)  | —                        |
| (autres projets Kevin) | À faire          | `<prefix>_ia_enabled`    |

---

## Notes

- **Pas de feature flag distant** : le kill-switch doit fonctionner offline et sans appeler
  Firebase. localStorage uniquement.
- **Persistant cross-session** : flag stocké dans `FB_LOCAL` (CMCteams) pour ne JAMAIS être
  écrasé par une sync.
- **Apex exclu volontairement** : pour ne pas désactiver l'IA dans l'app dont c'est la
  fonction principale.
- **Apex bridge dans CMCteams** : si CMCteams reçoit un planning depuis Apex via le bridge,
  le bridge n'utilise PAS l'API Anthropic (juste du transfert de données structurées),
  donc pas de guard nécessaire de ce côté.

---

Référence d'implémentation : `index.html` CMCteams v9.675, commit sur branche
`claude/add-disable-ai-button-tM6e8`.
