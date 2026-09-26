import { defineConfig, devices } from '@playwright/test';

/**
 * v13.4.163 — Sandbox detection : si downloads externes bloqués
 * (Claude Code sandbox, Docker isolé), skip browser tests gracefully.
 * CI GitHub Actions = downloads OK → tests run normalement.
 */
const isSandbox = process.env['CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST'] === '1'
  || process.env['SANDBOX_NO_DOWNLOAD'] === '1';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 2 : undefined,
  /* v13.4.163 : skip global si sandbox (browsers indispos) */
  ...(isSandbox && { grep: /__never__/ }),
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
    process.env['CI'] ? ['github'] : ['line'],
  ],
  use: {
    baseURL: process.env['APEX_E2E_URL'] || 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'fr-FR',
    timezoneId: 'Europe/Monaco',
  },
  projects: [
    /* iPhone PWA test priority — Kevin's primary device */
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 14 Pro'] },
    },
    /* v13.4.196 (audit gap mobile 375px) : iPhone SE coverage
     * pour garantir voice-overlay + chat + admin lisibles sur 375px. */
    {
      name: 'mobile-safari-se',
      use: { ...devices['iPhone SE'] },
    },
    /* v13.4.206 (audit Top 10 gap E2E matrix élargie) : iPad coverage
     * pour vérifier que les studios + dashboards admin fonctionnent sur
     * tablet (UI Apex doit s'adapter au format paysage 1024px+). */
    {
      name: 'tablet-safari',
      use: { ...devices['iPad (gen 7)'] },
    },
    /* v13.4.218 (audit gap UX iPad Air 768px breakpoint) : couverture
     * tablet portrait. iPad (gen 7) couvre paysage 1024px+, iPad Air
     * couvre portrait 820px (proche breakpoint critique 768px). */
    {
      name: 'tablet-air-portrait',
      use: { ...devices['iPad Air'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
    },
    /* Desktop minimal coverage */
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: process.env['CI']
    ? undefined
    : {
        command: 'npm run preview',
        url: 'http://localhost:4173',
        reuseExistingServer: true,
        timeout: 30_000,
      },
});
