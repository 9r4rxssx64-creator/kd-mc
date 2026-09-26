# audit/00 — INVENTAIRE (Passe 1)

> Toutes les lignes sont taguées : ✅ VÉRIFIÉ (commande exécutée, sortie réelle) · 🟡 DÉDUIT (lecture code) · 🔴 SUPPOSÉ.
> Branche : `claude/audit-passe-1`. Date : 2026-07-14.

## 0. Correction d'hypothèse (Loi 2 — ne rien supposer)

Le brief de mission décrit une app **React/JSX** avec `src/auth/Login.jsx`, `GalerieCasino.jsx`, `src/api/claude.js`. **C'est faux pour ce dépôt.** ✅ VÉRIFIÉ :

- `find … -name '*.jsx' -o -name '*.tsx'` → **0 fichier**. Pas de `src/`. `react` **ABSENT** de `package.json`.
- L'app est une **SPA vanilla JS mono-fichier** : `index.html` = **3 330 064 octets, 49 630 lignes** (HTML + CSS + JS inline), + `sw.js` (service worker).
- Hébergement : **GitHub Pages** (`.github/workflows/`), `vercel.json` = passthrough statique (install/build no-op, cf. leçon #74), `CNAME`→ domaine **kd-mc.com** (routeur Cloudflare `services/kdmc-router`).
- « Galerie ~75 photos » → vue `vGalerie` (fonction dans `index.html`), pas un composant React.

Conséquence : les Phases 3/8 du brief (« installer vitest + RTL + Playwright + Error Boundary React ») sont **inapplicables telles quelles** — ce dépôt possède déjà son propre harnais de test (voir §5) et n'est pas React. Installer une stack React aurait violé la Loi 4 (ne rien casser). L'audit est donc **adapté à la stack réelle**.

## 1. Stack réelle ✅ VÉRIFIÉ

| Élément | Valeur |
|---|---|
| Type | SPA vanilla JS, mono-fichier `index.html` (pas de framework, pas de bundler applicatif) |
| Rendu | fonctions `vXxx()` → `innerHTML` de `#content`, routeur maison `sv('route')` |
| Vues | **102** fonctions `v*` · **~60** routes `sv(...)` (liste exhaustive → `01-FONCTIONS.md`) |
| Persistance | `localStorage` (**377** accès) + **Firebase RTDB** `cmcteams-c16ab` (sync temps réel SSE) + shadow IndexedDB |
| Auth | PIN admin (`AID="U11804"`) hashé (`hashPwStrong` s1: / `hashPwV2` v2:) + WebAuthn Face ID ; **399** gardes `A.user.id===AID`/`isAdmin` |
| IA | front → **proxy Cloudflare** (`cmc_ia_proxy`) si configuré, sinon appel direct `api.anthropic.com` avec la **clé de l'admin** lue en `localStorage` (`cmc_ia_key`→`ax_shared_api_key`→`ax_api_key`) |
| Dépendances runtime | aucune côté app. `devDeps` = outillage : `playwright`, `pdfjs-dist`, `terser`, `@vitest/coverage-v8`, `puppeteer`, `sharp`, `canvas`, `ffmpeg` (scripts/tests uniquement) |
| Métier | Planning SBM Black Jack : salons CMC (Europe/Blanche/Amériques/Médecin/Touzet/Privés) + CDP ; import PDF SBM ; détection équipes/miroirs ; ordres de départ ; galerie |

## 2. État du build & santé ✅ VÉRIFIÉ

- **Build/syntaxe** (`npm run test:check-syntax` = combine tous les `<script>` **sans séparateur** puis `node --check`, méthode pre-commit leçon #29) → **exit 0**. Le mono-fichier est syntaxiquement valide.
- **Gate complet** `npm run test:ci` (~45 scripts Playwright/node) → résultat consigné dans `02-RESULTATS.md` (exécuté cette passe).

## 3. Secrets — P0 ABSOLU : **CLAIR** ✅ VÉRIFIÉ

- `grep -rnE "sk-ant-api[0-9]" --include=*.{js,html,mjs}` hors `tests/` → **0 occurrence**. Aucune clé Anthropic en dur.
- Aucun `AIza…`, `ghp_…`, `xkeysib-`, `re_…`, `-----BEGIN … PRIVATE KEY-----` en dur (hors tests/exemples).
- Modèle de clé IA (l.13194, 44446) : la clé est **fournie par l'admin** et stockée **device-local** en `localStorage`, OU un **proxy** garde la clé côté serveur. **Rien n'est committé.**
- ⚠️ **Nuance (→ finding P2, `03-FINDINGS.md` F-C1)** : sans proxy, l'appel direct pose `x-api-key` + `anthropic-dangerous-direct-browser-access:true` → la clé de l'admin vit en **clair dans le `localStorage`** de son navigateur (exfiltrable si XSS). Recommandation : proxy par défaut. Ce n'est **pas** un secret fuité dans le dépôt.

## 4. Dette & danger (grep réel) ✅ VÉRIFIÉ

| Métrique (`index.html`) | Valeur | Lecture |
|---|---|---|
| `TODO/FIXME/HACK` | 18 | faible pour 49 k lignes |
| `console.log` | 46 | à réduire (P3) — pas de fuite de secret détectée |
| `catch` | 1477 | gestion d'erreur **très** présente |
| `innerHTML` | 145 | surface XSS ; `esc()` défini (l.4931) et largement utilisé ; 16 `innerHTML=` en concat sans `esc()` = markup **statique/contrôlé app** (échantillon vérifié → 🟡 DÉDUIT faible risque, F-C2) |
| `localStorage/sessionStorage` | 377 | clés scopées `cmc_*` / `ax_*` |
| `npm audit` | non ré-exécuté cette passe (deps = outillage dev, pas servies au client) — 🟡 |

## 5. Prévention DÉJÀ en place ✅ VÉRIFIÉ (la Phase 8 du brief existe déjà)

- **121 workflows** GitHub Actions. Sécurité : **`gitleaks.yml`** (secret scan), **`semgrep.yml`** (SAST), **`strix-scan.yml`** (pentest IA), `security-suite` (skill : OSV/Trivy/zizmor).
- **`cmc-runtime-audit.yml`** = exécute le gate `test:ci` en CI (le harnais de test maison, ~45 scripts).
- **`audit-live.yml`** = charge les vraies pages kd-mc.com dans un Chromium réel (passe live).
- `sw-cache-sync.yml` = garantit `CACHE_VERSION` sw.js == APP_VER.
- **`CLAUDE.md`** racine = règles permanentes du projet (esc(), guards AID, FB_LOCAL, mobile 44px, etc.) + 143 leçons anti-régression.
- Garde erreur runtime : `window.onerror` / try-catch autour de `render()` (17 occurrences) — pas d'écran blanc silencieux.

**Verdict inventaire :** app **mature, très testée, déjà durcie** — pas un greenfield. L'audit se concentre donc sur la **vérification** (le gate passe-t-il vraiment ?) et les **findings résiduels réels**, pas sur la (re)construction d'une prévention déjà présente.
