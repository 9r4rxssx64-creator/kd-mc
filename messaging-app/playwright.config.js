import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config — Apex Chat E2E tests
 *
 * Profils principaux : iPhone Safari WebKit (cible Kevin), Chromium desktop.
 * Tests dans tests/e2e/. Serveur dev statique HTTP sur 4173.
 */
/** Drapeau CHROMIUM SEULEMENT (voir la note dans `use`) : le SW doit accepter le certificat local. */
const CHROMIUM_ARGS = { args: ['--ignore-certificate-errors'] };

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  expect: { timeout: 8_000 },

  use: {
    // HTTPS en test = parité prod (apex-chat.kd-mc.com est HTTPS) → la CSP
    // `upgrade-insecure-requests` n'a rien à upgrader. En HTTP, WebKit upgrade
    // même localhost → tous les <script type="module"> échouent (voir
    // tests/serve-https.sh). Certificat auto-signé → ignoreHTTPSErrors.
    baseURL: 'https://localhost:4173',
    ignoreHTTPSErrors: true,
    // Audit 17/09/2026 : `ignoreHTTPSErrors` ne couvre que les requêtes de la PAGE. Le
    // script d'un Service Worker est chargé par le processus navigateur, qui refusait le
    // certificat auto-signé (« SecurityError … An unknown error occurred when fetching the
    // script ») → aucun SW n'a jamais tourné dans ces tests. Chromium a besoin du drapeau
    // `--ignore-certificate-errors` : il est posé PAR PROJET Chromium ci-dessous (CHROMIUM_ARGS).
    // ⚠️ Mesuré en CI (run 35256174034) : posé ICI, dans le `use` global, il est transmis tel
    // quel à WebKit (`pw_run.sh … --ignore-certificate-errors`), qui ne démarre plus →
    // « browserType.launch: Target page, context or browser has been closed », 52 tests
    // rouges sur les DEUX voies iPhone. Un drapeau de navigateur n'a rien à faire en global.
    // Les tests mockent l'API avec page.route() ; un Service Worker actif fait ses propres
    // fetch, que page.route() n'intercepte pas (6 tests cassés dès que le SW a marché).
    // Par défaut le SW est donc bloqué ; seul le test qui le vérifie l'autorise (test.use).
    serviceWorkers: 'block',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 5000,
    navigationTimeout: 15000,
  },

  projects: [
    {
      name: 'iphone-safari',
      use: { ...devices['iPhone 14 Pro'] },
    },
    {
      name: 'iphone-se',
      use: { ...devices['iPhone SE'] },
    },
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], launchOptions: CHROMIUM_ARGS },
    },
    {
      name: 'pixel-android',
      use: { ...devices['Pixel 7'], launchOptions: CHROMIUM_ARGS },
    },
  ],

  webServer: {
    command: 'bash tests/serve-https.sh',
    url: 'https://localhost:4173',
    ignoreHTTPSErrors: true,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
