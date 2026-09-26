---
name: firebase-sync-debug
description: Debug Firebase Realtime Database sync - FB_FIX vs FB_LOCAL, queue offline, SSE listener, conflits, donnees ecrasees par null.
when_to_use: Si Kevin signale "donnees perdues", "PIN ecrase entre devices", "ne sync pas", "voit pas l'autre user". Apres ajout d'une cle synchronisee. Apres modification fbApplyData ou ls().
model: sonnet
allowed_tools: [Read, Edit, Bash, Grep, Glob]
---

# Skill: Firebase Sync Debug

## Mission

Diagnostiquer et resoudre les bugs de synchronisation Firebase Realtime Database dans Apex/CMCteams. Bugs typiques : donnees ecrasees par null (erreur #41), `ax_user` dans FB_FIX (erreur #40), cles non syncees (erreur #27), queue offline pas flush.

Reference : CLAUDE.md erreurs #27, #28, #29, #40, #41 - tous dus a une mauvaise comprehension de FB_FIX vs FB_LOCAL et des subtilites SSE.

## Pre-requis

- [ ] Avoir lu CLAUDE.md erreurs #27-#42 (toutes liees Firebase)
- [ ] Connaitre FB_FIX (synced cross-device) vs FB_LOCAL (per-device)
- [ ] Acces Bash + browser DevTools (Network tab pour SSE)
- [ ] Token Firebase admin (si lecture directe Firebase)

## Etapes (workflow 6 phases)

### Phase 0 - Reproduire le bug (5 min)

1. Identifier la cle suspecte (ex: `ax_user`, `cmc_pin`, `ax_streak_<uid>`)
2. Reproduire scenario : 2 devices A et B, action sur A, verifier B
3. Note ce qui est attendu vs ce qui arrive

```bash
# Lister les FB_FIX (synced) et FB_LOCAL (per-device)
grep -A30 'FB_FIX\s*=' apex-ai/index.html | head -50
grep -A30 'FB_LOCAL\s*=' apex-ai/index.html | head -50
```

### Phase 1 - Verifier la classification de la cle (5 min)

Question clef : cette cle DOIT-ELLE etre synced ?

| Type | Synced (FB_FIX) | Local (FB_LOCAL) | Pourquoi |
|------|-----------------|------------------|----------|
| `ax_user` (identite session) | ❌ | ✅ | Erreur #40 : si FB_FIX → contamine cross-device |
| `ax_uid` | ❌ | ✅ | Idem |
| `ax_pin` (admin global) | ✅ | - | Mais ATTENTION : ne pas mettre `ax_pin_<uid>` user-scope ici |
| `ax_voice_print_<uid>` | ❌ | ✅ | Biometric, jamais cloud |
| `ax_settings` | ✅ | - | Multi-device sync ok |
| `K.kb` (knowledge) | ✅ | - | Memoire partagee user |
| `ax_audit` | ✅ | - | Admin trail sync |
| `ax_admin_pin` | ❌ | ✅ | Local seul (CMCteams equiv `cmc_admin_pin`) |
| `ax_persistent_memory` | ✅ | - | Cross-session |
| Tokens API (`ax_*_key`) | ✅ | - | Cross-device admin (mais chiffres si possible) |

```bash
# Verifier la classification de la cle suspecte
grep -nE '"ax_VOTRE_CLE"' apex-ai/index.html | head -5
```

Si dans FB_FIX mais devrait etre LOCAL → **P0 Critical** (regression potentielle erreur #40).

### Phase 2 - Verifier `ls()` ecrit dans la bonne couche (5 min)

```bash
# Voir l'implementation de ls() (notre wrapper localStorage)
grep -A20 'function ls\b' apex-ai/index.html | head -25

# Verifier que ls() :
# 1. Ecrit localStorage immediat (toujours)
# 2. Si cle dans FB_FIX → push Firebase
# 3. Si fail Firebase → push queue offline
# 4. Pas d'autre comportement cache (oublie volontaire = bug)
```

Erreur #27 : `localStorage.setItem` au lieu de `ls()` = bypass FB_FIX = pas sync.

```bash
# Detecter les usages directs localStorage.setItem (bypass dangereux)
grep -nE 'localStorage\.setItem\(["\']ax_' apex-ai/index.html | head -10
# Devrait etre tres rare (ls() prefere)
```

### Phase 3 - Verifier `fbApplyData` (handler SSE)

Erreur #41 critique : Firebase ecrase localStorage avec `null`.

```javascript
// CORRECT (post-fix v12.269)
function fbApplyData(key, value) {
  if (value === null) {
    const local = localStorage.getItem(key);
    if (local && local !== 'null') {
      // Firebase a perdu la cle, mais on l'a localement → garder + pousser repair
      fbWrite(key, JSON.parse(local));
      return;
    }
  }
  localStorage.setItem(key, JSON.stringify(value));
  // ... clone profond pour eviter references partagees
}

// INCORRECT (avant v12.269)
function fbApplyData(key, value) {
  localStorage.setItem(key, JSON.stringify(value));  // Ecrase avec null !
}
```

```bash
# Verifier la presence du guard null
grep -A10 'function fbApplyData' apex-ai/index.html | head -15
```

### Phase 4 - Verifier la queue offline (5 min)

```bash
# Lister les fonctions queue
grep -nE '_syncQueue|flushSyncQueue|_syncQueueAdd' apex-ai/index.html | head -10

# Verifier que la queue est :
# 1. Persistee (cmc_sync_queue / ax_sync_queue)
# 2. Flush au retour online (window.online listener)
# 3. Flush au visibility change focus
# 4. Affiche un badge UI quand non-vide
```

Test :
1. Ouvrir DevTools > Network > Offline
2. Modifier une donnee (ex: settings)
3. Voir badge ⏳ apparait
4. Repasser online → la queue se vide → check Firebase Console que valeur arrivee

### Phase 5 - Verifier les regles Firebase (5 min)

Verifier que les regles Firebase ne laissent pas n'importe qui ecrire :

```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null",
    "ax_user_<uid>": {
      ".write": "auth.uid === $uid"
    }
  }
}
```

Erreur frequente : regles `".read": true, ".write": true` (universal access) = n'importe qui peut effacer toutes les donnees Kevin.

```bash
# Si admin SDK accessible
firebase database:get / --shallow

# Sinon DevTools : Network > XHR > filter "firebaseio" > inspect requests
```

### Phase 6 - Tests reels cross-device (10 min)

Scenarios obligatoires :
1. **Device A modifie, B recoit** : connecter A et B (browser tabs differents avec session different), modifier sur A, attendre 2s, verifier B
2. **Offline A, online A re-sync** : DevTools offline, modifier, online, verifier que B recoit
3. **Conflit simultane** : modifier sur A et B en meme temps (pas de timestamp), verifier qui gagne (logiquement le dernier write)
4. **Effacement involontaire** : sur A, supprimer la cle Firebase via Console, verifier que B ne perd PAS la valeur (guard null erreur #41)

## Anti-patterns interdits

1. **Mettre `ax_user`/`cmc_user`/`ax_uid` dans FB_FIX** : contamine cross-device. Erreur #40 critique secu (Kevin reconnu Laurence).
2. **`localStorage.setItem` direct** au lieu de `ls()` : bypass FB_FIX = pas sync. Erreur #27.
3. **fbApplyData sans guard `value === null`** : Firebase efface accidentellement → tout localStorage perdu. Erreur #41.
4. **Pas de queue offline** : Kevin perd ses modifs si reseau coupe.
5. **Cles non chiffrees pour secrets** : tokens API sync en clair via Firebase = visible dans Network tab.
6. **Regles Firebase trop permissives** : `.write": true` = anyone peut effacer. Toujours `auth.uid` gate.
7. **Pas de clone profond dans fbApplyData** : references partagees → mutation cote A pollue cote B.
8. **Ignorer SSE reconnect** : si connexion coupe, listener ne reconnecte pas → desyncs silencieux. Toujours `EventSource.onerror` + retry exponential backoff.

## Validation post-action

```bash
# 1. Cles user/session NE sont PAS dans FB_FIX
grep -E '"(ax_user|ax_uid|cmc_user|cmc_uid|ax_voice_print)"' apex-ai/index.html | head -5
# Si dans FB_FIX → P0 critical

# 2. fbApplyData a le guard null
grep -A5 'function fbApplyData' apex-ai/index.html | grep 'value === null\|value==null'
# Doit matcher

# 3. ls() ecrit dans la bonne couche (FB_FIX ou local seulement)
grep -A15 'function ls\b' apex-ai/index.html | grep -E 'fbWrite|fbShouldSync'

# 4. Queue offline existe
grep -c '_syncQueue\b' apex-ai/index.html  # > 5

# 5. Test reel : 2 devices, modifier sur A, B recoit < 5s
# (Manuel)

# 6. Test offline → online : queue se vide
# (Manuel)
```

## Exemples concrets

### Exemple 1 : Erreur #40 - `ax_user` contamination cross-device

**Symptome** : Kevin se connecte sur son iPhone → reconnu comme Laurence.

**Diagnostic** :
```bash
grep -E '"ax_user"' apex-ai/index.html
# Si presente dans FB_FIX → bug confirme
```

**Fix** :
1. Retirer `ax_user`, `ax_uid` de FB_FIX
2. Au boot, valider strict : `K.user.id === ls('ax_uid')` sinon force logout
3. `axSecurityLog("user_id_mismatch")` pour audit
4. Test : 2 devices, login different, verifier pas de contamination

### Exemple 2 : Erreur #41 - Firebase null overwrite

**Symptome** : Kevin perd ses cles API a chaque session.

**Diagnostic** :
```bash
# Reproduire :
# 1. Ouvrir Apex sur 2 devices
# 2. Sur device A, supprimer une cle Firebase via Console (ou attendre cleanup auto)
# 3. SSE notifie tous les devices avec value=null
# 4. fbApplyData sans guard ecrase localStorage → cle perdue partout
```

**Fix** :
```javascript
function fbApplyData(key, value) {
  if (value === null && FB_FIX.indexOf(key) >= 0) {
    const local = localStorage.getItem(key);
    if (local && local !== 'null' && local !== '""') {
      // Repair : Firebase a perdu, on a, on pousse
      console.warn('[FB] null received but local has value, repairing:', key);
      fbWrite(key, JSON.parse(local));
      return;
    }
  }
  localStorage.setItem(key, JSON.stringify(value));
  // Update K cache si applicable
}
```

## Integration avec autres skills

- **Avant** : `commit-quality-gate` (verifier syntaxe avant tester)
- **Pendant** : `security-audit-owasp` chapitre V8 (Data Protection) si bug touche secrets
- **Apres** : `migration-data` si la cle doit changer de nom/structure
- **Cross** : `subagent-orchestrate` pour tester sur 5 scenarios cross-device en parallele

## References

- CLAUDE.md erreurs #27, #28, #29, #40, #41 (toutes Firebase-related)
- Firebase Realtime Database docs : https://firebase.google.com/docs/database
- Firebase rules : https://firebase.google.com/docs/database/security
- SSE EventSource MDN : https://developer.mozilla.org/en-US/docs/Web/API/EventSource
