# 🗺️ Carte du code Apex AI — v13.4.336

> Générée à la main (lecture directe du code, aucun outil externe). Chiffres mesurés, pas estimés.
> Total ≈ **411 fichiers TypeScript** (hors node_modules/tests) + 1 `index.html` d'entrée.

---

## Vue en couches (du bas vers le haut)

```
┌──────────────────────────────────────────────────────────────┐
│  index.html  →  core/bootstrap.ts  (point de démarrage)         │
└──────────────────────────────────────────────────────────────┘
                              │ safeInit(...) au boot
                              ▼
┌──────────────────────────────────────────────────────────────┐
│  CORE  (15 fichiers) — le moteur                                │
│  router · store · memory · di / service-locator · events        │
│  logger · errors · escape-html / html-safe · apex-identity      │
│  bootstrap · agent-watches-runner · listener-cleanup            │
└──────────────────────────────────────────────────────────────┘
                              │ le router dispatche (86 routes)
                              ▼
┌──────────────────────────────────────────────────────────────┐
│  FEATURES  (117 fichiers, ~44 écrans) — ce que l'utilisateur voit │
│  chat · landing · vault · settings · admin · studios · voice    │
│  knowledge · legal · pro · browser · crypto · domotique · iot    │
│  geo · calendar · notes · billing · dashboard · onboarding …    │
└──────────────────────────────────────────────────────────────┘
                              │ appellent les
                              ▼
┌──────────────────────────────────────────────────────────────┐
│  SERVICES  (262 fichiers, 15 domaines) — la logique métier      │
│  ai · integrations · core-svc · admin · vault · sentinels       │
│  auth · observability · storage · skills · tools · connectors   │
└──────────────────────────────────────────────────────────────┘
                              │ s'appuient sur
                              ▼
┌──────────────────────────────────────────────────────────────┐
│  UI (15) · workers · data · locales · assets · migrations       │
└──────────────────────────────────────────────────────────────┘
```

---

## CORE — le moteur (15 fichiers)

| Fichier | Rôle (simple) |
|---|---|
| `bootstrap.ts` | Démarre l'app, lance les modules un par un (`safeInit`) |
| `router.ts` | Aiguille vers le bon écran selon l'URL (`#chat`, `#vault`…) — **86 routes** |
| `store.ts` | La mémoire vive de l'app (l'état courant) |
| `memory.ts` | Mémoire long terme (faits, contexte injecté à l'IA) |
| `di.ts` / `service-locator.ts` | Branche les services entre eux |
| `events.ts` | Le système de signaux internes |
| `apex-identity.ts` | Sait QUI est connecté (toi, Laurence, clients…) |
| `escape-html.ts` / `html-safe.ts` | Sécurité anti-injection (XSS) |
| `logger.ts` · `errors.ts` · `agent-watches-runner.ts` · `listener-cleanup.ts` · `view-utils.ts` | Plomberie (logs, erreurs, sentinelles, nettoyage) |

---

## FEATURES — les écrans (117 fichiers, ~44 zones)

Les plus gros blocs :

- **Cœur usage** : `chat`, `landing`, `vault` (coffre), `settings`, `onboarding`, `signup`
- **Studios & Pro** : `studios`, `pro`, `calculators`, `legal`, `knowledge`/`knowledge-bank`
- **Admin** : `admin`, `admin-backup`, `admin-toggles`, `self-diag`, `sentinels`, `signup-approval`
- **Connecté / objets** : `domotique`, `iot-providers`, `broadlink-setup`, `remote`, `device-capabilities`
- **Autres** : `browser`, `crypto`, `geo`, `calendar`, `notes`, `billing`, `dashboard`, `voice-bio`, `laurence`, `meta-marketplace`, `workflow`, `plugins`, `credentials-registry`, `innovation`

---

## SERVICES — la logique (262 fichiers, 15 domaines)

| Domaine | Fichiers | À quoi ça sert |
|---|---:|---|
| `integrations` | 44 | Branchements externes (Cloudflare proxy, providers…) |
| `ai` | 42 | Le cerveau : routeur IA, failover providers, streaming |
| `core-svc` | 35 | Services de base partagés |
| `admin` | 29 | Outils admin (commandes, toggles, custom-commands) |
| `vault` | 19 | Coffre chiffré (AES-GCM, multi-clés, backup Firebase) |
| `sentinels` | 18 | Les gardiens auto (auto-test, auto-fix, surveillance) |
| `auth` | 16 | Connexion, PIN, Face ID, trust device |
| `observability` | 15 | Diagnostic, santé, statut Cloudflare |
| `storage` | 12 | Sauvegarde locale + IDB + compression |
| `apex-tools-*` | 20 | Outils que l'IA peut déclencher (registry/dispatch/handlers) |
| `skills` | 6 | Générateurs (docx, pptx, xlsx, pdf…) |
| `connectors` · `apex-meta-marketplace` | 6 | Connecteurs & marketplace |

---

## Au démarrage, l'app lance (extrait `bootstrap.ts`)

`ux-theme-mode` → `version-badge` → `layout-inspector` → `functional-tester` →
`runtime-tests-expose-window` → `cloudflare-status` → `ios-resilience` →
`voice-overlay-preload-deferred` → `auto-test-on-first-boot`

---

## Repères chiffrés

- **411** fichiers `.ts` (core 15 · features 117 · services 262 · ui 15 · scripts/migrations 3)
- **86** routes (écrans) enregistrées
- **15** domaines de services
- Version : **v13.4.336**
