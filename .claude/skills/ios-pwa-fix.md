---
name: ios-pwa-fix
description: Fix Safari iOS PWA quirks - cache aggressif, SW updatefound unreliable, addToHomeScreen, safe-area-insets, viewport zoom, audio context.
when_to_use: Si Kevin sur iPhone signale "ne marche pas" mais OK sur Android/desktop. Apres ajout feature qui utilise getUserMedia/Notification/IndexedDB. Pour optimiser experience PWA installee.
model: sonnet
allowed_tools: [Read, Edit, Bash, Grep]
---

# Skill: iOS PWA Fix (Safari quirks)

## Mission

Resoudre les bugs specifiques iOS Safari PWA (mode standalone vs navigateur) qui cassent l'experience Kevin sur iPhone : cache trop aggressif, SW updatefound non fiable, FaceID/biometrique, audio context user gesture, viewport zoom auto sur input, safe-area-inset.

Reference Kevin : "rappel toi tjs que je travail sur iPhone" (CLAUDE.md regle PERMANENTE iPhone). Tout doit fonctionner Safari iOS PWA en priorite.

## Pre-requis

- [ ] Avoir lu CLAUDE.md regle "KEVIN TRAVAILLE SUR iPHONE"
- [ ] Connaitre les erreurs #15, #28, #43, #52 (toutes iOS Safari)
- [ ] Acces a un iPhone reel (simulateur Xcode OK pour tests basiques)
- [ ] Web Inspector active (Settings > Safari > Avance > Inspecteur web)

## Etapes (workflow 8 phases)

### Phase 0 - Identifier le mode (3 min)

```javascript
function detectIOSContext() {
  const isiOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone === true 
    || window.matchMedia('(display-mode: standalone)').matches;
  const isPWA = isStandalone;
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  return { isiOS, isStandalone, isPWA, isSafari };
}
```

Differents bugs selon le mode :
- iOS Safari navigateur : pas de Notification API, audio context bloque sans gesture
- iOS PWA standalone : SW reset frequent, localStorage parfois purge, getUserMedia OK

### Phase 1 - Fix viewport zoom auto sur input (5 min)

Bug iOS : input avec font-size < 16px → Safari zoom automatique a la focus = casse l'UX.

```css
/* Tous les inputs minimum 16px */
input, textarea, select {
  font-size: 16px !important;  /* Anti-zoom iOS */
}

/* Ou viewport fixe */
```
```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
```

`viewport-fit=cover` obligatoire pour safe-area-insets.

### Phase 2 - Fix safe-area-insets (5 min)

iPhone X+ a notch + home indicator. Sans gestion : header sous notch, bouton sous home indicator.

```css
:root {
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left: env(safe-area-inset-left, 0px);
  --safe-right: env(safe-area-inset-right, 0px);
}

.topbar {
  padding-top: max(8px, var(--safe-top));
}

.bottom-nav {
  padding-bottom: max(8px, var(--safe-bottom));
}

body {
  padding-left: var(--safe-left);
  padding-right: var(--safe-right);
}
```

### Phase 3 - Fix SW updatefound + force-update (10 min)

iOS Safari PWA backgroundée : `reg.update()` ne firent pas. Cf skill `pwa-deploy-verify` Phase 3.

```javascript
// Boot : verifier remote APP_VER toutes les sessions
setTimeout(async () => {
  const isiOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  if (!isiOS || !isStandalone) return;  // Skip non-iOS
  
  try {
    const r = await fetch('/index.html?_v=' + Date.now(), { cache: 'no-store' });
    const html = await r.text();
    const m = html.match(/APP_VER\s*=\s*"(v[\d.]+)"/);
    if (!m || m[1] === APP_VER) return;
    
    // Force update
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(names.map(n => caches.delete(n)));
    }
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    location.replace(location.pathname + '?_forceupd=' + m[1]);
  } catch (e) { console.warn('[iOS update]', e); }
}, 4500);
```

### Phase 4 - Fix audio context (Web Audio API) (5 min)

iOS bloque AudioContext tant que pas de user gesture (tap, click).

```javascript
let _audioCtx = null;

function getAudioContext() {
  if (_audioCtx) return _audioCtx;
  _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _audioCtx;
}

// Resume au premier user gesture
['click', 'touchstart'].forEach(ev => {
  document.addEventListener(ev, () => {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();
  }, { once: true });
});
```

### Phase 5 - Fix Notification API (PWA only) (3 min)

iOS Safari navigateur : `typeof Notification === 'undefined'` (toujours).
iOS PWA installee (16.4+) : Notification API disponible.

```javascript
function canNotify() {
  return typeof Notification !== 'undefined' 
    && Notification.permission !== 'denied';
}

async function requestNotifPermission() {
  if (typeof Notification === 'undefined') {
    toast('Notifications disponibles uniquement en PWA installee');
    return false;
  }
  const r = await Notification.requestPermission();
  return r === 'granted';
}
```

### Phase 6 - Fix getUserMedia / camera (5 min)

iOS PWA : OK depuis 16+. Mais permissions reset a chaque update PWA.

```javascript
async function getCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }, // arriere prefere
      audio: false
    });
    return stream;
  } catch (e) {
    if (e.name === 'NotAllowedError') {
      toast('Camera refusee. Autorise dans Reglages > Safari > Camera');
    } else if (e.name === 'NotFoundError') {
      toast('Pas de camera detectee');
    }
    throw e;
  }
}
```

### Phase 7 - Fix SpeechRecognition (continuous) (5 min)

iOS Safari : `recognition.continuous = true` se coupe apres 15-30s silence. Erreur #43.

```javascript
const isiOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
recognition.continuous = !isiOS;  // false sur iOS
recognition.interimResults = true;
recognition.lang = 'fr-FR';

let noSpeechCount = 0;
const MAX_NO_SPEECH = 20;

recognition.onerror = (e) => {
  if (e.error === 'no-speech') {
    noSpeechCount++;
    if (noSpeechCount > MAX_NO_SPEECH) {
      console.log('[Speech] Max no-speech reached, stopping');
      recognition.stop();
      return;
    }
  }
};

recognition.onend = () => {
  // Sur iOS : restart auto pour simuler continuous
  if (isiOS && _wakeWordActive) {
    setTimeout(() => recognition.start(), 500);
  }
};
```

### Phase 8 - Fix localStorage purge (3 min)

iOS Safari peut purger localStorage si :
- Pas d'usage pendant 7 jours
- Mode prive (nav privee)
- Storage pressure (rare)

Strategie : double persistance IDB shadow.

```javascript
async function setIdbShadow(key, value) {
  // Double-write : localStorage + IndexedDB
  localStorage.setItem(key, JSON.stringify(value));
  const db = await openIdb();
  const tx = db.transaction('shadow', 'readwrite');
  await tx.objectStore('shadow').put(value, key);
}

async function getIdbShadow(key) {
  // Try localStorage first, IDB fallback
  const ls = localStorage.getItem(key);
  if (ls) return JSON.parse(ls);
  const db = await openIdb();
  return db.transaction('shadow').objectStore('shadow').get(key);
}
```

## Anti-patterns interdits

1. **font-size < 16px sur input** : iOS zoom auto = UX cassee. Erreur classique. Toujours min 16px.
2. **Pas de viewport-fit=cover** : safe-area-insets ne marchent pas. Notch coupe le contenu.
3. **AudioContext sans user gesture** : reste suspendu, pas de son. Toujours wrapper user click.
4. **`continuous: true` sur iOS** : se coupe silencieusement. Erreur #43. Toujours detecter iOS et adapter.
5. **`reg.update()` seul pour force-update** : ne fire pas iOS Safari PWA backgrounded. Erreur #52. Toujours setTimeout fetch + clear caches + unregister.
6. **`typeof Notification` non check** : crash sur Safari iOS navigateur (non-PWA). Erreur #15.
7. **Hover-only UI** : iOS pas de hover. Tout doit etre tactile + tap.
8. **Listener `touchstart` sans `passive: true`** : warning Chrome + perf degraded sur scroll iOS.
9. **CSS `position: fixed` avec input focus** : iOS scroll comportement bizarre. Tester avec keyboard ouvert.

## Validation post-action

```bash
# 1. Tous les inputs ont font-size >= 16px
grep -nE 'input\s*\{[^}]*font-size:\s*1[0-5]px' apex-ai/index.html
# Doit etre vide

# 2. viewport-fit=cover present
grep 'viewport-fit=cover' apex-ai/index.html

# 3. safe-area-inset utilise
grep -c 'safe-area-inset' apex-ai/index.html  # > 0

# 4. AudioContext resume sur user gesture
grep -B2 -A5 'AudioContext\|audioCtx' apex-ai/index.html | grep -A3 'resume'

# 5. Detection iOS pour speechRecognition
grep -B2 -A5 'continuous' apex-ai/index.html | grep 'iOS\|iPhone'

# 6. Force-update logic _forceupd presente
grep -c '_forceupd' apex-ai/index.html  # > 0

# 7. Test reel iPhone
# (manuel) Add to Home Screen, ouvrir, naviguer, fermer/rouvrir, verifier MAJ
```

## Exemples concrets

### Exemple 1 : Erreur #43 - SpeechRecognition boucle infinie iOS

**Symptome** : Wake word "Dis Apex" sur iPhone : 200x retry no-speech, drain batterie.

**Cause** : `continuous = true` se coupe sur iOS apres 30s, `onerror no-speech` relance, boucle.

**Fix v12.269** :
```javascript
const isiOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
recognition.continuous = !isiOS;  // false sur iOS

let noSpeechCount = 0;
recognition.onerror = (e) => {
  if (e.error === 'no-speech' && ++noSpeechCount > 20) {
    recognition.stop();
    return;
  }
};

recognition.onend = () => {
  if (isiOS && _wakeWordActive) setTimeout(() => recognition.start(), 500);
};
```

### Exemple 2 : Erreur #52 - Force-update PWA iOS backgrounded

**Symptome** : Apex push v12.774, Kevin sur iPhone PWA voit v12.773.

**Cause** : `reg.update()` async ne fire pas en arriere-plan.

**Fix** : setTimeout boot 4500ms qui fetch index.html serveur, compare APP_VER, force `caches.delete()` + `unregister()` + `location.replace('?_forceupd=ver')`. 1 seul setTimeout, pas de listener (anti-boucle Kevin v12.770).

## Integration avec autres skills

- **Avant** : `pwa-deploy-verify` (build PWA correct)
- **Apres** : `commit-quality-gate` (validation finale)
- **Cross** : `csp-fix-inline` (CSP doit etre coherent avec inline iOS)
- **Suivi** : `firebase-sync-debug` si bugs sync iOS specifiques

## References

- CLAUDE.md regle "KEVIN TRAVAILLE SUR iPHONE"
- Erreurs #15, #28, #43, #52 (toutes iOS-related)
- Apple PWA notes : https://firt.dev/notes/pwa-ios/
- WebKit blog : https://webkit.org/blog/
- iOS Safari changelog : https://developer.apple.com/documentation/safari-release-notes
