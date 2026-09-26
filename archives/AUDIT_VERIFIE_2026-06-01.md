# AUDIT VÉRIFIÉ — 3 projets indépendants (2026-06-01)

> Audit atomique externe + SEO + ultra-review, scores **mesurés** (jamais estimés)
> via 3 subagents indépendants (un par projet), 8 axes + SEO chacun.
> Branche : `claude/verifie-Ypr17`. Méthode : architecture d'abord, fixes safe en
> autonomie, re-mesure post-fix, décisions produit validées par Kevin.

## Scores réels mesurés (avant → après fixes safe)

| Projet | Avant | Après | Suite de tests | Outils de mesure |
|---|---|---|---|---|
| **Apex v13** (`apex-ai/v13/`) | 86/100 | **~88** | **11868/11868** ✅ (était 11867) | tsc 0 err, eslint 0, build 10.1s, bundle 709KB gz, Lighthouse perf 99 / SEO 100 |
| **CMCteams** (`index.html`) | 72/100 | **~75** | **469/0** ✅ | test:ci, syntax-check combiné |
| **Apex Chat** (`messaging-app/`) | 64/100 | **~68** | **755/0** ✅ | vitest, node --check workers |

> Note honnêteté (règle JAMAIS ESTIMER) : « après » = re-mesure réelle là où j'ai
> changé du code (suites de tests re-lancées). Pas de re-audit global complet des 9
> axes par projet → les ~ reflètent l'impact mesuré des fixes, pas un nouveau score
> fabriqué. Le **100/100 réel n'est pas atteignable en autonomie pure** : voir
> « Blocages structurels » plus bas.

## Fixes safe livrés (mesurés, zéro régression)

### Apex v13 (lot 1)
- **P0-1** : `cloudflare-status.test.ts` alignée sur le texte bannière livré
  (`Cloudflare ralenti · pas ta clé`) → `npm test` repasse **100% vert** (11868/11868).
- Non touchés volontairement : `window.autoTestRunner` / `window.__APEX__` exposés en
  prod — consommés par la CI Playwright + un test e2e ; les gater casserait la boucle
  de test runtime (compromis assumé, documenté).

### Apex Chat (lot 1 + lot 3)
- Test e2e Playwright mal collecté par vitest exclu (`e2e/**`) → **755/0 propre**.
- `twitter:image:alt` corrigé (faute « logo or »).
- `preconnect`/`dns-prefetch` vers les 4 endpoints critiques (perf LCP).
- `llms.txt` créé (visibilité crawlers IA).
- **Claim « post-quantum / PQXDH » reformulé en exact** partout (index/cgu/privacy) :
  → « chiffrement de bout en bout (ECDH P-256 + AES-GCM 256) ». 0 occurrence restante.
  Supprime le risque légal de fausse allégation de sécurité.

### CMCteams (lot 2)
- **P0-SEC-2 (XSS)** : whitelist `e.id` (`[A-Za-z0-9_-]`) avant injection dans la
  string exécutée (`new Function`/`onClick`) — recherche globale + drill modal.
  Ids légitimes (`U#####`/`U_TMP_*`) inchangés. XSS DOM-stored neutralisé.
- `<meta robots>` dédupliqué. `dc()` reset `_dcRunning` dans `finally` (anti-freeze).

## Blocages structurels — pourquoi pas 100/100 en autonomie

### CMCteams — `cmc_pw` exposé (décision Kevin : durcir prudemment)
- **Constat** : `firebase-rules-apex.json` (Phase 4, actif) expose `/cmcteams` en
  `.read:true` → les hashs `cmc_pw` sont lisibles publiquement. Hash = DJB2 maison
  15k rounds (brutable offline), pas un KDF standard.
- **Pourquoi pas de fix règle** : l'app n'a **aucun Firebase Auth** ; le client **lit
  `cmc_pw` pour vérifier le login**. Mettre `.read:false` **casse le login** (exactement
  le « peut casser prod » du CLAUDE.md). Les règles actives sont déjà au **maximum sûr**
  (root deny, `$key` regex, `write:false` sur secrets, écriture du clair bloquée).
- **Vraie correction (staged, à valider sur device)** :
  1. **Mitigation immédiate sans backend** : remplacer `hashPwV2` (DJB2) par
     **PBKDF2 WebCrypto** (SHA-256, ≥100k iters, sel par user). Même exposé, le hash
     devient non-brutable. `verifyPw` garde la compat legacy (déjà en place) +
     `cmcMigratePw` re-hash au login → **zéro lockout**. ⚠ PBKDF2 est async →
     refactor du flux login (sync→async) = chemin critique, à tester sur iPhone réel
     AVANT prod (pas en aveugle, règle JAMAIS RÉGRESSER).
  2. **Correction architecturale (Phase 5, déjà planifiée)** : `apex-auth-worker`
     (Cloudflare) vérifie le password server-side + émet un custom token Firebase →
     règles deviennent `auth.uid` strict, `cmc_pw` jamais envoyé au client.
     Workflow `deploy-apex-auth-worker.yml` existe déjà.
- **AID en clair / hashs legacy DJB2** : inhérents au modèle client-side sans backend ;
  résolus par la Phase 5. Pas de fix isolé sûr.

### Apex Chat — E2E réel (décision Kevin : plan staged + tests d'abord)
- **Constat** : (a) clé privée ECDH stockée **en clair** dans localStorage
  (`index.html:5933`, `wrapWithPin` existe mais non branché) ; (b) prekeys jamais
  uploadées (`POST /api/keys/prekeys` TODO) → E2E inter-pairs **inopérant** (fallback
  texte). Le worker a déjà les routes `/api/keys/prekeys` et `/api/keys/:id/bundle`.
- **Plan staged (à exécuter avec validation iPhone réel, pas en aveugle)** :
  1. **Étape A — wrap clé privée** : au setup PIN, stocker uniquement
     `ApexCrypto.wrapWithPin(priv, pin)` (ciphertext+salt) ; déchiffrer en mémoire au
     login. Tests : roundtrip wrap/unwrap, échec PIN, migration des clés en clair
     existantes (best-effort, sans lockout). Garde-fou : si unwrap échoue, fallback
     re-génération clé + re-upload prekey (pas de perte d'accès).
  2. **Étape B — upload prekeys** : `POST /api/keys/prekeys` au login (pubkey + bundle).
     À l'ouverture d'une conv, `GET /api/keys/:id/bundle` → dériver la clé de session
     par conv. Tests : 2 users distincts échangent un message déchiffrable des 2 côtés.
  3. **Étape C — salt HKDF par conv** : `info: 'msg-enc:'+convId` (forward secrecy par
     session, fix `crypto-core.js:118` salt statique). Tests : 2 convs = 2 clés ≠.
  4. **Étape D — durcissement transport** : JWT en cookie `HttpOnly SameSite=Strict`
     au lieu de localStorage ; token WS en 1er message post-upgrade (pas en query) ;
     CORS worker restreint à l'origine github.io.
- **Non fait en aveugle** : changer le flux login/clé = risque de verrouiller Kevin/
  Laurence sans test device. À câbler étape par étape avec preuve E2E réelle.

### Apex v13 — chemin vers 100
- Hygiène : gater `window.*` exposés derrière un flag CI-only (sans casser la boucle
  de test). TTI mobile 4.4s : init `monitoring`/`sentinels` en `requestIdleCallback`.
  13 services orphelins à câbler ou supprimer. PWA : icône `maskable` + 2 screenshots.
  Aucun n'est bloquant ; ce sont des gains incrémentaux mesurables.

## Verdict honnête
Tous les fixes **safe, mesurés, sans régression** sont livrés et poussés. Les 3 plus
gros leviers restants (cmc_pw, E2E réel) sont des changements **auth/crypto à risque**
qui exigent une validation sur device réel — je les ai documentés en plans staged
plutôt que de les exécuter en aveugle (règle JAMAIS RÉGRESSER). Prochaine étape :
exécuter ces plans en sessions dédiées sécurité, étape par étape, avec preuve réelle.
