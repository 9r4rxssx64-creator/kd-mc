# Phase 2 — XState State Machines (3 semaines)

> Audit honest : 1769 refs K.xxx (vs 359 estimées) — 5x sous-évalué. Vrais chiffres ci-dessous.

## Distribution K (ligne 1656 index.html)

| Prop | Refs | Cible machine | Priorité |
|---|---|---|---|
| K.user | **711** | userMachine | P0 fondation |
| K.settings | 288 | settingsMachine | P1 |
| K.messages | 256 | chatMachine | P0 |
| K.conversations | 112 | chatMachine | P0 |
| K.kb | 105 | kbMachine (bonus) | P3 |
| K.view | 103 | uiMachine (router) | P3 |
| K.isStreaming | 99 | chatMachine | P0 |
| K.fin | 41 | finMachine | hors scope |
| K.activeConvId | 36 | chatMachine | P0 |
| K.gemmaReady | 8 | networkMachine | P2 |
| K.lastProvider | 5 | networkMachine | P2 |

## 5 machines recommandées (ordre d'extraction)

| # | Machine | Effort | Refs touchées |
|---|---|---|---|
| 1 | **vaultMachine** | 8h | 0 K.xxx (encapsule LS direct) — quick win |
| 2 | **settingsMachine** | 12h | 288 |
| 3 | **networkMachine** | 10h | 13 (lastProvider + gemmaReady + globales) |
| 4 | **userMachine** | 24h | 711 (foundation, autres dépendent) |
| 5 | **chatMachine** | 28h | 503 (messages + convs + streaming) |

**Total : 82h dev + 20h E2E + 12h Proxy/audit = 114h ≈ 3 semaines** (ajuster REFACTOR_PLAN.md, pas 2 semaines).

## Architecture migration (zéro breaking change)

### Étape A — Bootstrap (1j)
```html
<script src="https://cdn.jsdelivr.net/npm/xstate@5/dist/xstate.min.js"></script>
<script src="modules/state/index.js"></script>
```

```js
window._machines = {
  vault: createActor(vaultMachine).start(),
  settings: createActor(settingsMachine).start(),
  user: createActor(userMachine).start(),
  chat: createActor(chatMachine).start(),
  network: createActor(networkMachine).start()
};
```

### Étape B — K Proxy compat (2j)
```js
const K_legacy = K;
window.K = new Proxy(K_legacy, {
  get(target, prop) {
    if (prop === 'user' && window._machines?.user) return window._machines.user.getSnapshot().context.user;
    if (prop === 'messages' && window._machines?.chat) return window._machines.chat.getSnapshot().context.messages;
    if (prop === 'isStreaming' && window._machines?.chat) {
      const s = window._machines.chat.getSnapshot();
      return s.matches('streaming') || s.matches('sending');
    }
    return target[prop];
  },
  set(target, prop, value) {
    if (prop === 'isStreaming' && window._machines?.chat) {
      window._machines.chat.send({ type: value ? 'MSG_SEND' : 'STOP' });
    }
    target[prop] = value;
    return true;
  }
});
```

### Étape C — Migration vue par vue (2 semaines)
Ordre validé : vault → settings → network → user → chat.

À chaque vue migrée : retirer refs `K.xxx` directes → remplacer par `send()` events + `getSnapshot().context`.

### Étape D — Suppression K (post Phase 2)
Une fois toutes vues migrées + 26 tests + 5 E2E verts : retirer `var K = {...}` ligne 1656.

## chatMachine (P0)

```js
import { setup, assign, fromPromise } from 'xstate';

export const chatMachine = setup({
  types: { context: {}, events: {} },
  actions: {
    pushUserMsg: assign(/* ... */),
    saveMsgs: ({ context }) => _saveMsgs(),
    abortStream: ({ context }) => context.currentAbort?.abort()
  },
  actors: {
    callClaudeAPI: fromPromise(async ({ input }) => { /* _callClaudeAPI */ })
  }
}).createMachine({
  id: 'chat',
  initial: 'idle',
  states: {
    idle: { on: { MSG_SEND: { target: 'sending', actions: 'pushUserMsg' }, CONV_SWITCH: { actions: 'switchConv' }, CONV_NEW: { actions: 'createConv' } } },
    sending: { invoke: { src: 'callClaudeAPI', onDone: 'streaming', onError: 'error' } },
    streaming: {
      on: {
        STREAM_CHUNK: { actions: 'appendChunk' },
        STREAM_DONE: 'idle',
        STREAM_ERROR: 'error',
        STOP: { target: 'idle', actions: 'abortStream' }
      },
      after: { 200000: { target: 'error', actions: assign({ error: 'watchdog timeout' }) } }
    },
    error: {
      on: {
        RETRY: { target: 'retry', guard: ({ context }) => context.retryCount < 3 },
        MSG_SEND: 'sending'
      }
    },
    retry: { after: { 2000: 'sending' }, entry: assign({ retryCount: ({ context }) => context.retryCount + 1 }) }
  }
});
```

## Risques majeurs

1. **CDN XState fail** → précharger sync au boot (pas import() lazy)
2. **`K.user.id` accédé sans null check 200+ fois** → Proxy retourne `{id:null, name:''}` placeholder
3. **`K.messages.push()` mutation directe** → phase C remplace par `send({type:'MSG_PUSH'})`
4. **`K.settings._routedModel = ...` mutation imbriquée** → assignation via UPDATE event
5. **Race condition `_loadState`** → userMachine envoie `USER_LOADED` event que les autres écoutent

## Tests E2E (Playwright recommandé) — 20h

| Machine | Tests obligatoires |
|---|---|
| vault | Login PIN OK/KO 5× cooldown / unlock api_key / auto-lock 10min / encrypt-decrypt round-trip |
| settings | Theme switch persiste / per-user settings / crewMode / model routing |
| user | Login Kevin/Laurence/preconf / cross-user isolation (audit AI Safety P0) / view-as / session expire / logout wipe |
| chat | Send msg / streaming / abort / retry / watchdog 200s / conv switch / cap 5000 msg |
| network | Offline banner / reconnect FB SSE / circuit breaker / sync queue flush / failover Anthropic→OpenRouter |

**Test cross-cutting obligatoire** : `tests/k-proxy-compat.test.js` vérifie `K.user === readContext('user').user` pour tous props après chaque event simulé.

## Métriques succès Phase 2

- Heap stable < 60 MB après 30 min (vs 150 MB actuel)
- Score Architecture 47 → 85+ (audit subagent post-FIX)
- 0 mutation directe `K.xxx =` hors machines (grep returns 0)
- 26 tests Apex pass + 5 suites E2E vertes

## Status

- [ ] Étape A : Bootstrap CDN XState + index.js (1j)
- [ ] Étape B : K Proxy compat (2j)
- [ ] Étape C.1 : vaultMachine + tests E2E (1j)
- [ ] Étape C.2 : settingsMachine (2j)
- [ ] Étape C.3 : networkMachine (1.5j)
- [ ] Étape C.4 : userMachine (3j)
- [ ] Étape C.5 : chatMachine (3.5j)
- [ ] Étape D : Suppression K + cleanup final
