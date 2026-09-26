# Apex Refactor Roadmap — 4-6 mois

> **But** : passer de score réel **52/100** (audit externe Big4) à **100/100 RÉEL chaque axe** (règle Kevin permanente CLAUDE.md).
> 
> **Méthode** : refactor obligatoire — pas de patches Security Theater.

## Score actuel par axe (audit externe v12.533)

| Axe | Score brut | Pondération | Pondéré |
|---|---|---|---|
| Sécurité | 59/100 | 25% | 14.75 |
| Performance | 32/100 | 20% | 6.40 |
| Compliance | 68/100 | 20% | 13.60 |
| Architecture | 47/100 | 15% | 7.05 |
| Code Quality | 34/100 | 10% | 3.40 |
| AI Safety | 70/100 | 10% | 7.00 |
| **TOTAL** | | 100% | **52.20/100** |

**Verdict** : NON production-ready (seuil 65). Refactor obligatoire.

---

## Phase 1 — Semaine 1-2 : Code splitting

**But** : passer de monolith 2.9 MB (29K lignes inline) à 3 chunks lazy-loaded.

### Étapes
- [x] Créer `/apex-ai/modules/` dossier
- [x] Premier extract : `ax-quiet-mode.js` (helpers v12.499 master quiet mode)
- [ ] Extraire `ax-broadlink.js` (v12.501-502 + 53 types LAN)
- [ ] Extraire `ax-discovery.js` (v12.507 Smart Discovery + dispatcher)
- [ ] Extraire `ax-macros.js` (v12.513 macros + per-room)
- [ ] Extraire `ax-audio.js` (v12.515-518 voix + audio messages + TTS)
- [ ] Extraire `ax-sound-recog.js` (v12.526 YAMNet)
- [ ] Loader dynamique via `<script type="module">` + `import()`
- [ ] SW cache strategy : chunk hashing + cache invalidation
- [ ] Bundle size cible : main < 500 KB, chunks lazy < 200 KB chacun

### Impact attendu
- TTI 5.5s → 2-3s
- Score Performance 32 → 60+
- Score Architecture 47 → 70+

---

## Phase 2 — Semaine 3-4 : State machines + AbortController + cleanup listeners

**But** : éliminer memory leaks + global state K explosif.

### Étapes
- [ ] Installer XState (lib state machines)
- [ ] Convertir `K.chat` en machine Chat (idle, sending, streaming, error)
- [ ] Convertir `K.vault` en machine Vault (locked, unlocking, unlocked)
- [ ] Convertir `K.settings` en machine Settings
- [ ] Remplacer 94 `setInterval` par RxJS Subscriptions ou Web Locks
- [ ] AbortController sur **tous** fetch (audit dit 0/100 actuel)
- [ ] Refactor `addEventListener` en `axTrackedAddListener` (99 sites)
- [ ] Cleanup batch dans `dc()` re-render

### Impact attendu
- Heap stable 40 MB (vs 150 MB après 20min)
- Score Performance 60 → 85+
- Memory leak listeners : 99→0 sites non-cleanés
- Score Architecture 70 → 85+

---

## Phase 3 — Semaine 5-6 : Sécu hardening (DOMPurify + CSP + LS encrypt activé)

**But** : passer Sécurité de 59 → 90+.

### Étapes
- [ ] DOMPurify wrapper **obligatoire** sur tous innerHTML (137 sites)
- [ ] Helper `axSafeHTML()` qui REMPLACE `el.innerHTML = html`
- [ ] grep + replace systématique : `innerHTML\s*=` → `axSafeHTML(el, ...)`
- [ ] CSP tightening : retirer `unsafe-inline`, ajouter nonces script-src
- [ ] **Activer LS encrypt par défaut** (v12.529 opt-in actuellement)
- [ ] Migration auto avec backup avant chiffrement
- [ ] Master key salt random (v12.529 actuellement déterministe)
- [ ] Firebase SSE HMAC signature (audit P1)
- [ ] PIN rate-limit explicite (cooldown progressif)
- [ ] axIsAdmin double-check RAM/LS (v12.530 → activer partout)

### Impact attendu
- Sécurité 59 → 90+
- Plus de XSS factory ouverte

---

## Phase 4 — Semaine 7-8 : Firebase audit + IDB migration + Cross-user leak FIX DÉFINITIF

**But** : éliminer les leaks cross-user (Kevin/Laurence reproduits v12.272 + v12.298 + audit AI Safety).

### Étapes
- [ ] **Retirer `ax_user_chat`, `ax_user_locations` de FB_FIX** (P0 audit AI Safety)
- [ ] Audit COMPLET FB_FIX vs FB_LOCAL (140 keys actuellement)
- [ ] Tout user-specific → FB_LOCAL strict
- [ ] Tout shared → FB_FIX validé
- [ ] Migration localStorage > 3 MB → IndexedDB auto
- [ ] Firebase rules strictes (auth required + path whitelist)
- [ ] Quota IDB cap 50 MB (vs LS 5 MB iOS)

### Impact attendu
- Cross-user leak : 0 surface (vs 2 keys actives)
- Storage iOS 127% → < 60%
- Sécurité 90 → 95+
- AI Safety 70 → 90+

---

## Mois 3 : Tests coverage 1.95% → 50%

**But** : Code Quality 34 → 75+ (testing dimension).

### Étapes
- [ ] Setup Vitest ou Jest (vs node tests basiques actuels)
- [ ] Tests par module (chunks Phase 1) :
  - [ ] ax-quiet-mode.test.js (10 tests)
  - [ ] ax-broadlink.test.js (15 tests)
  - [ ] ax-discovery.test.js (20 tests)
  - [ ] ax-macros.test.js (10 tests)
  - [ ] ax-audio.test.js (25 tests)
- [ ] Tests E2E Playwright (chat flow, vault flow, settings flow)
- [ ] Tests cross-user (Kevin → Laurence isolation)
- [ ] Coverage cible : 50% par module
- [ ] CI : tests obligatoires avant push

### Impact attendu
- Code Quality 34 → 75+
- Confidence régression 0 → 80+

---

## Mois 4 : Compliance complète (DPA + DPIA + EU AI Act)

**But** : Compliance 68 → 100.

### Étapes
- [ ] `/docs/DPA-Anthropic.md` signé
- [ ] `/docs/DPA-Firebase.md` signé
- [ ] `/docs/DPA-Stripe.md` signé
- [ ] `/docs/DPIA-v1.md` complet (Art. 35 GDPR high-risk AI)
- [ ] Badge "🤖 AI-generated" sur chaque réponse Claude (EU AI Act)
- [ ] Consent banner first login (Art. 7 GDPR granular)
- [ ] Retention policy détaillée par data category
- [ ] Breach notification webhook CNIL/APDP (72h)
- [ ] Privacy.html v2 (toutes mises à jour)

### Impact attendu
- Compliance 68 → 100
- Production-ready B2C EU

---

## Méthode obligatoire (CLAUDE.md règles permanentes)

1. **Audit POST-FIX systématique** après chaque batch de patches
2. **Honnêteté radicale** : score audit externe (subagent), pas wrappers Math.max
3. **Pre-commit OK** + 26 tests Apex pass à chaque commit
4. **Pas de Security Theater** : helpers wired = >2 refs réelles
5. **Test mental** : "Si Kevin commercialise demain, est-ce niveau Big4 ?"

---

## Score cible final (4-6 mois)

| Axe | Aujourd'hui | Cible 6 mois |
|---|---|---|
| Sécurité | 59 | **100** |
| Performance | 32 | **100** |
| Compliance | 68 | **100** |
| Architecture | 47 | **100** |
| Code Quality | 34 | **100** |
| AI Safety | 70 | **100** |
| **GLOBAL** | **52** | **100** |

---

## Status sessions Claude Code

- Session courante (2026-04-30) : 43 versions livrées (v12.495 → v12.533 + CMC v9.572 → v9.579), audit externe 6 axes complet, début Phase 1.
- Sessions futures : continuer phase par phase, audit POST-FIX entre chaque, ne pas reprendre les patches Security Theater déjà rollback.
