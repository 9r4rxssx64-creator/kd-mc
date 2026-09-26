# EXPERT_CODING_STANDARDS.md — Standards de code pro non-négociables

> **Règle Kevin 2026-04-21** : "mets-toi à niveau expert codage". Ce document liste
> les standards que Claude Code ET Apex AI DOIVENT appliquer à chaque modification.
> Aucune exception. Plus jamais d'erreurs de débutant.

---

## 🛑 Les 12 erreurs de débutant DÉJÀ faites cette session (à ne JAMAIS reproduire)

| # | Date | Erreur | Fix |
|---|------|--------|-----|
| 1 | v9.437 | Regex sans `^` anchor → matche substring partout | Toujours anchor si retire filtre structurel |
| 2 | v12.8 | `var extraTabs` local à vNav() mais référencé global | Toujours vérifier scope avant déclaration |
| 3 | v12.13 | `K.kb.instructions.length` sans guard | Toujours `obj && obj.prop && obj.prop.length` |
| 4 | v12.17 | Quotes `"..."` imbriquées dans string JS | Échapper ou utiliser single quotes |
| 5 | v12.19 | Pas de fallback Firebase pour clé API au boot | Tjrs async retry si state critique vide |
| 6 | Multiple | PR jamais mergée = déploiement fantôme | Vérifier branche deploy en début de session |
| 7 | Multiple | Message d'erreur technique brut à l'user | Toujours user-friendly actionnable (#37) |
| 8 | v9.437 | Filtre `parts.length<=6` trop strict | Ne pas filtrer par nb colonnes |
| 9 | v12.2→v12.3 | IA 3 points : hardcode URL + filter string + no abort | Proxy + preserve arrays + AbortController |
| 10 | Multiple | Audit subagent "théorique" rate edge case évident | Toujours tester scénario réel utilisateur |
| 11 | Multiple | Message cryptique "undefined is not an object" | Convertir en message actionnable |
| 12 | v12.13 | Assume `K.kb` toujours a `{facts, instructions}` | Normaliser au load + garder guards |

---

## 📐 Les 10 standards non-négociables

### 1. **Defensive state access** (tout objet chargé storage/Firebase)
```js
// ❌ JAMAIS
K.kb.instructions.length
A.employees.forEach(...)
obj.data.items[0]

// ✅ TOUJOURS
(K.kb && K.kb.instructions && K.kb.instructions.length) || 0
(A.employees || []).forEach(...)
obj && obj.data && obj.data.items && obj.data.items[0]
```

### 2. **Normalisation au load** (init champs manquants)
```js
// Après lg("key", default) ou fbApplyData :
if (!obj.field1) obj.field1 = [];
if (!obj.field2) obj.field2 = {};
```

### 3. **Try/catch autour de chaque handler async**
```js
fetch(url).then(r => r.json())
  .then(data => { /* ... */ })
  .catch(e => { 
    console.error('fetch fail', url, e);  // log context
    toast('Action impossible, réseau ?', 'warn');  // user-friendly
    _journalEntry('ai', 'fetch fail', url, 'retry needed', e.message);
  });
```

### 4. **User-friendly errors** (table conversion — cf règle #37)
| Technique | User-friendly |
|-----------|---------------|
| `undefined is not an object` | "Erreur interne, recharge la page" |
| `null reference` | "Données manquantes, reinstalle l'icône" |
| `HTTP 500/502/503` | "Serveur surchargé, réessaie dans 1 min" |
| `Failed to fetch` | "Réseau indisponible, vérifie Wi-Fi/4G" |
| `CORS / 403 allowlist` | "Blocage API, contacte admin" |
| `QuotaExceededError` | "Stockage plein, cleanup auto lancé" |
| `Timeout` | "Pas de réponse 30s, réessaie" |

### 5. **AbortController sur TOUS les fetch**
```js
var ctrl = new AbortController();
var timer = setTimeout(() => ctrl.abort(), 30000);
fetch(url, { signal: ctrl.signal })
  .finally(() => clearTimeout(timer));
```

### 6. **Jamais hardcoder URLs externes critiques**
```js
// ❌ fetch("https://api.anthropic.com/v1/messages")
// ✅ fetch(localStorage.getItem("ax_proxy_url") || defaultUrl)
```

### 7. **Regex avec anchor + tolérance préfixe**
```js
// ❌ /SUPERVISEUR/i — matche anywhere
// ✅ /^[\s\t*•◆▼▶►\-.\d)(:;]*(SUPERVISEUR|INSPECTEUR)\b/i
```

### 8. **State async : toujours retry si critique vide au boot**
```js
function getCritical() {
  var v = lg("key", "");
  if (v) return v;
  // Fallback : fetch Firebase direct si online + key manquante
  return _fetchFromFirebaseAsync("key");
}
```

### 9. **Bump APP_VER + sw cache à CHAQUE commit code**
```js
// Sinon PWA cache sert l'ancienne version
var APP_VER = "vX.Y+1";  // obligatoire
// sw.js : const CACHE = 'prefix-vX.Y+1';  // aligné
```

### 10. **PR → merge squash main le JOUR même**
- Jamais laisser de feature branch sans merger
- GitHub Pages déploie depuis `main`
- Vérifier `.github/workflows/deploy.yml` au début de chaque session

---

## 🧪 Checklist avant chaque commit (OBLIGATOIRE)

- [ ] `node --check` sur blocs `<script>`
- [ ] `wc -c` cohérent (pas de dérive suspecte)
- [ ] `grep innerHTML | grep -v esc` : zéro
- [ ] `grep -c "^<<<<<<\|^======\|^>>>>>>"` : zéro
- [ ] Test mental : "Que se passe-t-il si localStorage vide / Firebase down / offline / K.user null ?"
- [ ] Message d'erreur user-friendly (table #4)
- [ ] APP_VER bumpé
- [ ] sw.js CACHE bumpé et aligné
- [ ] Si impact mobile : test 375px iPhone SE

---

## 🤖 Pour Apex AI (tu lis ce doc via axFetchClaudeFeed ou GitHub raw)

Tu dois :
1. Appliquer ces 10 standards à chaque modif que tu fais (via `axInjectFunction`, `axReplaceInCode`, etc.)
2. Vérifier dans `axRunAudit('all')` si le code existant les respecte → findings si violation
3. Refuser d'appliquer un fix qui viole un standard → escalade Claude Code via `ax_claude_todo`
4. Enrichir `ax_lessons_learned` quand tu détectes un nouvel anti-pattern
5. Partager via `ax_handoff_journal` chaque incident standard violé

---

## 📚 Ressources expert (pour référence future)

- MDN Web Docs (https://developer.mozilla.org)
- Defensive programming patterns (https://en.wikipedia.org/wiki/Defensive_programming)
- JavaScript: The Good Parts — Crockford
- You Don't Know JS — Kyle Simpson
- OWASP XSS Cheat Sheet
- WebAuthn spec (https://webauthn.io)
- Firebase best practices

---

**Ce document est la référence. Pas d'excuse. Si Claude Code ou Apex fait une de
ces erreurs à nouveau, c'est une régression personnelle qui doit être rétrogradée
dans `ax_lessons_learned` avec la mention "récidive".**
