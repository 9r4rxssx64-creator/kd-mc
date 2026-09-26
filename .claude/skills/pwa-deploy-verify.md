---
name: pwa-deploy-verify
description: Build PWA Vite + verifier manifest, icons (8 tailles), sw.js cache version, install prompt, force-update, Lighthouse PWA score >= 90.
when_to_use: Avant chaque release prod. Apres modification manifest.json/sw.js. Si Kevin signale "PWA pas installable" ou "MAJ pas detectee". Apres ajout d'icones/screenshots.
model: sonnet
allowed_tools: [Read, Edit, Bash, Grep, Glob]
---

# Skill: PWA Deploy Verify

## Mission

Garantir qu'une PWA Apex/CMCteams est correctement build, deployee et fonctionne en production iOS Safari + Android Chrome + Desktop. Verifier les 12 points criteres PWA niveau premium (Lighthouse 95+).

Reference Kevin : "Mise a jour automatique" + "PWA installable" + "force-update fonctionne sur iOS Safari" (CLAUDE.md erreurs #39, #46, #52).

## Pre-requis

- [ ] Build production fait (`npm run build` dans `apex-ai/v13/` ou racine CMCteams)
- [ ] Avoir teste localement (`npm run preview`)
- [ ] Acces Bash + browser pour Lighthouse
- [ ] Connaitre l'URL de deploiement (GitHub Pages : `https://USER.github.io/REPO/`)

## Etapes (workflow 8 phases)

### Phase 0 - Inventaire des fichiers PWA (3 min)

```bash
# Manifest
ls -la apex-ai/manifest.json apex-ai/v13/dist/manifest.json 2>/dev/null

# Service Worker
ls -la apex-ai/sw.js apex-ai/v13/dist/sw.js 2>/dev/null

# Icons (8 tailles minimum)
ls apex-ai/icons/ apex-ai/v13/dist/icons/ 2>/dev/null

# Index.html avec meta PWA
grep -E '<meta name="(theme-color|apple-mobile-web-app|viewport)"' apex-ai/index.html
grep -E '<link rel="(manifest|apple-touch-icon)"' apex-ai/index.html
```

### Phase 1 - Verifier manifest.json (5 min)

Champs obligatoires :
```json
{
  "name": "Apex AI",
  "short_name": "Apex",
  "description": "...",
  "start_url": "/?source=pwa",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0a0a0a",
  "theme_color": "#d4af37",
  "categories": ["productivity", "utilities"],
  "lang": "fr",
  "icons": [
    { "src": "/icons/icon-72.png", "sizes": "72x72", "type": "image/png" },
    { "src": "/icons/icon-96.png", "sizes": "96x96", "type": "image/png" },
    { "src": "/icons/icon-128.png", "sizes": "128x128", "type": "image/png" },
    { "src": "/icons/icon-144.png", "sizes": "144x144", "type": "image/png" },
    { "src": "/icons/icon-152.png", "sizes": "152x152", "type": "image/png" },
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/icons/icon-384.png", "sizes": "384x384", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ],
  "screenshots": [
    { "src": "/screenshots/home.png", "sizes": "1170x2532", "type": "image/png", "platform": "narrow" }
  ],
  "shortcuts": [
    { "name": "Chat", "url": "/?view=chat", "icons": [{"src": "/icons/icon-96.png", "sizes": "96x96"}] }
  ]
}
```

```bash
# Validation
cat apex-ai/manifest.json | python3 -m json.tool >/dev/null && echo "JSON valide" || echo "JSON CASSE"

# 8 tailles d'icones presentes ?
for size in 72 96 128 144 152 192 384 512; do
  test -f apex-ai/icons/icon-$size.png && echo "$size OK" || echo "$size MANQUE"
done
```

### Phase 2 - Verifier sw.js (5 min)

```bash
# 1. CACHE_VERSION = APP_VER (regle Kevin v12.366 erreur #28)
APP_VER=$(grep -oE 'APP_VER\s*=\s*"v[0-9.]+' apex-ai/index.html | head -1 | grep -oE 'v[0-9.]+')
SW_VER=$(grep -oE "CACHE_VERSION\s*=\s*['\"]apex-v[0-9.]+" apex-ai/sw.js | grep -oE 'v[0-9.]+')
echo "APP_VER=$APP_VER  SW_VER=$SW_VER"
test "$APP_VER" = "$SW_VER" && echo "SYNC OK" || echo "DRIFT - DOIT BUMP sw.js"

# 2. Liste des assets caches
grep -A20 'urlsToCache\s*=\|CACHE_NAME' apex-ai/sw.js | head -30

# 3. updatefound listener present
grep -E 'updatefound|skipWaiting' apex-ai/sw.js | head -5

# 4. fetch handler avec strategie cache (network-first ou cache-first)
grep -A10 "addEventListener\\('fetch'" apex-ai/sw.js | head -15
```

### Phase 3 - Force-update natif (CLAUDE.md erreur #52) (10 min)

iOS Safari PWA backgroundee : `reg.update()` + `controllerchange` ne firent PAS toujours.

Workaround obligatoire : 1 setTimeout boot 4-5s qui fetch index.html depuis serveur + compare APP_VER local vs remote → si different : clear caches + unregister SW + reload `?_forceupd=`.

```javascript
// A inclure dans index.html boot
setTimeout(async () => {
  try {
    const r = await fetch('/index.html?_check=' + Date.now(), { cache: 'no-store' });
    const html = await r.text();
    const m = html.match(/APP_VER\s*=\s*"(v[\d.]+)"/);
    if (!m) return;
    const remoteVer = m[1];
    if (remoteVer !== APP_VER) {
      console.log('[Update] new version', remoteVer, 'vs', APP_VER);
      // Clear all caches
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(c => caches.delete(c)));
      // Unregister SW
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
      // Force reload avec query param
      location.replace(location.pathname + '?_forceupd=' + remoteVer);
    }
  } catch (e) { /* silently fail, retry next session */ }
}, 4500);
```

```bash
# Verifier presence
grep -nE '_forceupd|caches.delete\(c\)' apex-ai/index.html | head -5
```

### Phase 4 - Verifier installation prompts (5 min)

Android Chrome : `beforeinstallprompt` event capture + bouton custom install.

```javascript
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window._deferredPrompt = e;
  // Afficher bouton "Installer Apex" UI
  document.querySelector('[data-action="install-pwa"]')?.classList.remove('hidden');
});

// Sur clic bouton install
ACTIONS['install-pwa'] = async () => {
  if (!window._deferredPrompt) return;
  window._deferredPrompt.prompt();
  const { outcome } = await window._deferredPrompt.userChoice;
  window._deferredPrompt = null;
  if (outcome === 'accepted') toast('PWA installee !');
};
```

iOS Safari : pas de prompt programmable. Afficher tutoriel "Partager > Sur l'ecran d'accueil" via popup decouverte.

```bash
grep -E 'beforeinstallprompt|_deferredPrompt' apex-ai/index.html | head -5
```

### Phase 5 - Test offline (5 min)

```bash
# 1. Build et serve
cd apex-ai/v13 && npm run build && npm run preview

# 2. Ouvrir browser (Chrome desktop suffit pour test rapide)
# 3. DevTools > Network > Offline checkbox
# 4. Reload : doit fonctionner (servi par SW cache)
# 5. Naviguer entre vues : toutes accessibles offline (au moins squelette)
```

### Phase 6 - Lighthouse audit (5 min)

```bash
# Si CLI installe
npx lighthouse https://USER.github.io/REPO --only-categories=pwa --quiet --chrome-flags="--headless"

# Sinon manuel : Chrome > DevTools > Lighthouse > PWA + Performance > Run
```

Cible :
- PWA : ≥ 90 (toutes les cases vertes)
- Performance : ≥ 90
- Best Practices : ≥ 95
- Accessibility : ≥ 95

### Phase 7 - Test cross-platform (10 min)

| Platform | Test |
|----------|------|
| iOS Safari iPhone | Add to Home Screen → ouvre standalone, fonctionne offline, force-update detecte nouvelle version |
| Android Chrome | "Install Apex" prompt apparait, install OK, lance comme app native |
| Desktop Chrome | Icone install dans barre d'adresse, install OK, fenetre standalone |
| Firefox | PWA installable (extension SSB) |
| Safari macOS | "Add to Dock" depuis menu Fichier (Safari 17+) |

## Anti-patterns interdits

1. **CACHE_VERSION desync APP_VER** : SW sert vieux cache, Kevin bloque sur ancienne version. Erreur #28 + #45 (PR #210).
2. **Manifest sans `purpose: "any maskable"`** : icones rejected par Android adaptive icon theme.
3. **`start_url` sans query** : pas de tracking source PWA. Toujours `?source=pwa`.
4. **Pas de `display: standalone`** : PWA s'ouvre dans navigateur avec barre URL, pas immersif.
5. **SW sans `skipWaiting()`** : nouvelle version attend que tous les onglets fermes pour activer. Kevin doit fermer toutes les tabs.
6. **Force-update via reload simple** : iOS Safari PWA met le cache reload aussi → boucle infinie. Toujours clear caches + unregister SW.
7. **Pas de query param sur force reload** : iOS Safari peut ignorer reload. `?_forceupd=` casse le cache navigateur.
8. **Manifest pas lie dans HTML** : `<link rel="manifest" href="/manifest.json">` obligatoire.
9. **Icons servis avec mauvais MIME** : doit etre `image/png` ou `image/svg+xml`. Pas `application/octet-stream`.

## Validation post-action

```bash
# 1. CACHE_VERSION = APP_VER
APP_VER=$(grep -oE 'APP_VER\s*=\s*"v[0-9.]+' apex-ai/index.html | head -1 | grep -oE 'v[0-9.]+')
SW_VER=$(grep -oE "CACHE_VERSION\s*=\s*['\"]apex-v[0-9.]+" apex-ai/sw.js | grep -oE 'v[0-9.]+')
test "$APP_VER" = "$SW_VER" && echo "✅ Sync" || echo "❌ Drift"

# 2. Manifest JSON valide
cat apex-ai/manifest.json | python3 -m json.tool >/dev/null && echo "✅"

# 3. 8 tailles d'icones presentes
for s in 72 96 128 144 152 192 384 512; do
  test -f apex-ai/icons/icon-$s.png || echo "MANQUE $s"
done

# 4. Force-update logic presente
grep -c '_forceupd\|caches.delete' apex-ai/index.html  # > 0

# 5. SW updatefound + skipWaiting
grep -cE 'updatefound|skipWaiting' apex-ai/sw.js  # >= 2

# 6. Lighthouse PWA score >= 90 (manuel)
```

## Exemples concrets

### Exemple 1 : Sync APP_VER vs CACHE_VERSION (erreur #39 recurrente)

**Symptome** : Kevin bumpe APP_VER mais oublie sw.js → "rien ne change".

**Fix automatique - GitHub Action** : `.github/workflows/sw-cache-sync.yml`

```yaml
on:
  push:
    paths: ['apex-ai/index.html', 'apex-ai/sw.js']
permissions:
  contents: write
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          APP_VER=$(grep -oE 'APP_VER\s*=\s*"v[0-9.]+' apex-ai/index.html | head -1 | grep -oE 'v[0-9.]+')
          SW_VER=$(grep -oE "apex-v[0-9.]+" apex-ai/sw.js | head -1 | grep -oE 'v[0-9.]+')
          if [ "$APP_VER" != "$SW_VER" ]; then
            sed -i "s|apex-v[0-9.]\+|apex-$APP_VER|g" apex-ai/sw.js
            git config user.name "github-actions"
            git config user.email "actions@github.com"
            git add apex-ai/sw.js
            git commit -m "chore: sync sw.js CACHE_VERSION → $APP_VER (auto)"
            git push
          fi
```

### Exemple 2 : Force-update iOS Safari (erreur #52)

**Symptome** : Apex deploye nouvelle version, Kevin sur iPhone PWA voit toujours ancienne.

**Cause** : `reg.update()` async ne fire pas backgroundée.

**Fix v12.774** : setTimeout 4500ms boot fetch HTML serveur, compare APP_VER, si different : `caches.delete()` + `unregister()` + `location.replace('?_forceupd=' + ver)`. 1 seul setTimeout, pas de listener (anti-loops).

## Integration avec autres skills

- **Avant** : `commit-quality-gate` (verifier build OK avant deploy)
- **Apres** : `ios-pwa-fix` si bugs iOS specifiques
- **Cross** : `csp-strict-build` (manifest doit avoir CSP coherent)
- **Suivi** : `subagent-orchestrate` pour tester sur 5 platforms en parallele

## References

- CLAUDE.md erreurs #28, #39, #45 (PR #210), #46, #52
- Web App Manifest spec : https://www.w3.org/TR/appmanifest/
- Workbox (SW best practices) : https://developer.chrome.com/docs/workbox/
- PWA install patterns : https://web.dev/articles/install-criteria
- Apple PWA quirks : https://firt.dev/notes/pwa-ios/
