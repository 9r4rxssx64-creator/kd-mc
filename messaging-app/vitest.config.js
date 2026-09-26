import { defineConfig } from 'vitest/config';

/**
 * vitest config — Apex Chat messaging-app
 *
 * Coverage 100% RÉEL via v8 sur les modules ESM testables (lib/*) et les
 * Cloudflare Workers backend (workers/*). Les fichiers loaders/shims à la
 * racine (`crypto.js`, `sw.js`) délèguent leur logique à `lib/` — testés
 * indirectement.
 *
 * Les tests E2E Playwright sont dans tests/e2e/ et exclus de vitest.
 */
export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    // v1.1.278 — retry:1 absorbe la flakiness de CONTENTION (leçon #88) : sous
    // --coverage, l'instrumentation ralentit les tests DB-mock lourds
    // (api-worker-success-deep ~16s) et un test devient parfois victime de la
    // charge parallèle (victime NON déterministe : 0/1/3 échecs selon le run,
    // toujours vert en isolation). Un re-essai suffit ; une VRAIE régression
    // échoue les DEUX essais → jamais masquée.
    retry: 1,
    exclude: ['tests/e2e/**', 'e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['lib/**/*.js', 'workers/**/*.js'],
      exclude: [
        'tests/**',
        'node_modules/**',
        '**/*.test.js',
        '**/*.spec.js',
      ],
      // api-worker.js (~5800 lignes : OTP, admin, JWT, premium) n'est PLUS caché
      // (audit 2026-07-07). Il est MESURÉ avec un plancher dédié anti-régression
      // au lieu d'être exclu du gate (règle "jamais estimer, toujours mesurer" +
      // "le filet ne doit pas mentir sur le fichier le plus critique"). Couverture
      // RÉELLE mesurée ce jour : 82.49% stmts / 76.29% branches / 88.27% funcs.
      // Plancher = quelques points sous l'actuel (marge anti-flaky), à remonter.
      thresholds: {
        // 10/09/2026 — SEUILS PAR FICHIER = CLIQUET SUR LA MESURE (vitest 5).
        // Deux faits mesurés ce jour, avec les MÊMES tests :
        //  1. vitest ≥ 4 compte TOUS les fichiers (api-worker inclus) dans les seuils
        //     globaux (« différent de Jest », doc officielle) → un global 100 % échoue
        //     toujours. vitest 1 excluait les fichiers à seuil dédié — plus maintenant.
        //  2. vitest ≥ 4 remappe la couverture par l'AST (`ast-v8-to-istanbul`, l'ancien
        //     `v8-to-istanbul` est retiré) : les branches et rappels jamais exécutés
        //     sont désormais comptés. Ce que l'ancien outil appelait « 100 % » vaut
        //     83-98 % de branches sur 11 fichiers de lib/, et api-worker passe de
        //     83.42/76.88/89.40/83.42 à 75.71/68.48/64.47/79.20 (stmts/branches/funcs/lines).
        // Politique : chaque fichier a son seuil = sa valeur MESURÉE (arrondie au dixième
        // inférieur ; api-worker : 1 point de marge). Le gate échoue si un fichier BAISSE,
        // jamais parce que l'outil a changé. Remonter un seuil = ajouter des tests, pas
        // l'inverse. messaging-app-tests.yml LIT cette table (source unique).
        'lib/crypto-core.js': { statements: 100, branches: 100, functions: 100, lines: 100, perFile: true },
        'lib/gesture-core.js': { statements: 100, branches: 97.1, functions: 100, lines: 100, perFile: true },
        'lib/gif.js': { statements: 100, branches: 97.2, functions: 100, lines: 100, perFile: true },
        'lib/key-vault.js': { statements: 100, branches: 97.2, functions: 100, lines: 100, perFile: true },
        'lib/media-gallery.js': { statements: 100, branches: 98.4, functions: 100, lines: 100, perFile: true },
        'lib/message-grouping.js': { statements: 100, branches: 96.6, functions: 100, lines: 100, perFile: true },
        'lib/message-search.js': { statements: 100, branches: 97.2, functions: 100, lines: 100, perFile: true },
        'lib/privacy-reciprocity.js': { statements: 100, branches: 83.3, functions: 100, lines: 100, perFile: true },
        'lib/push-key.js': { statements: 100, branches: 91.6, functions: 100, lines: 100, perFile: true },
        'lib/sw-handlers.js': { statements: 100, branches: 98.3, functions: 94.7, lines: 100, perFile: true },
        'lib/visio-mesh.js': { statements: 100, branches: 95.5, functions: 100, lines: 100, perFile: true },
        // 11/09/2026 : 118 tests ajoutés (tests/unit/api-worker-fonctions-non-appelees.test.js —
        // les 108 fonctions jamais exécutées, chacune par le routeur avec chemin nominal + branche
        // d'erreur). Mesuré vitest 5 : 91.98 % instructions / 81.92 % branches / 100 % fonctions /
        // 94.25 % lignes (avant : 75.71 / 68.48 / 64.47 / 79.20). Plancher = mesure moins ~1 point.
        'workers/api-worker.js': { statements: 91, branches: 81, functions: 99, lines: 93.5, perFile: true },
        'workers/ia-worker.js': { statements: 100, branches: 100, functions: 100, lines: 100, perFile: true },
        'workers/push-worker.js': { statements: 100, branches: 100, functions: 100, lines: 100, perFile: true },
        'workers/sms-worker.js': { statements: 100, branches: 100, functions: 100, lines: 100, perFile: true },
        // BroadcastDO.js / PresenceDO.js : purs réexports (0 instruction mesurable → json-summary
        // écrit pct 0, vitest considère le seuil satisfait). Le contrat est prouvé par
        // tests/unit/durable-objects-shims.test.js ; le check CI ignore une métrique de total 0.
        'workers/durable-objects/BroadcastDO.js': { statements: 100, branches: 100, functions: 100, lines: 100, perFile: true },
        // 17/09/2026 : 6 rappels d'erreur best-effort enfin exercés (tests/unit/conversation-do-rappels-erreur.test.js)
        // → mesuré 100 / 98.18 / 100 / 100. Le cliquet avait rougi en CI (99.02 / 96.36 / 88.09 / 99.13)
        // après l'ajout de l'alarme de flush et du mode E2E strict : du code neuf couvert, mais des
        // `.catch(() => {})` anciens jamais déclenchés pesaient plus lourd dans le dénominateur.
        'workers/durable-objects/ConversationDO.js': { statements: 100, branches: 98.1, functions: 100, lines: 100, perFile: true },
        'workers/durable-objects/PresenceDO.js': { statements: 100, branches: 100, functions: 100, lines: 100, perFile: true },
        'workers/lib/cors.js': { statements: 100, branches: 100, functions: 100, lines: 100, perFile: true },
        'workers/lib/push-send.js': { statements: 100, branches: 100, functions: 100, lines: 100, perFile: true },
      },
    },
  },
});
