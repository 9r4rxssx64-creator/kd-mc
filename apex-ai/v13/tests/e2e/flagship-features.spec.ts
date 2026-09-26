/**
 * APEX v13 — E2E parité flagship (login RÉEL → routes authentifiées).
 *
 * Vérifie END-TO-END, dans un vrai navigateur, que les features de parité 2026
 * ajoutées (v351/v352) rendent après un VRAI login (pas un bypass) :
 *  - Assistants personnalisés (Gems) : route rend + création via le vrai formulaire
 *  - Canvas / Artifacts : route rend l'éditeur + aperçu live (srcdoc)
 *
 * Golden path admin Kevin (nom + PIN). Tourne en CI (apex-v13-e2e.yml) ; skip
 * en sandbox (playwright.config grep __never__ — pas de réseau ouvert).
 */
import { test, expect } from '@playwright/test';

async function loginAdmin(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#login-name')).toBeVisible({ timeout: 15000 });
  await page.fill('#login-name', 'Kevin DESARZENS');
  await page.fill('#login-pin', '200807');
  const submitBtn = page.locator('button[type="submit"]').first();
  if (await submitBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await submitBtn.click();
  } else {
    await page.locator('#login-pin').press('Enter');
  }
  /* Post-login : le formulaire disparaît (chat rendu). */
  await expect(page.locator('#login-name')).toBeHidden({ timeout: 8000 });
}

test.describe('Apex v13 — parité flagship (routes authentifiées réelles)', () => {
  test('Assistants (Gems) : route rend + création via le vrai formulaire', async ({ page }) => {
    await loginAdmin(page);

    await page.evaluate(() => { location.hash = '#assistants'; });
    await expect(page.locator('#ax-asst-form')).toBeVisible({ timeout: 6000 });
    await expect(page.locator('#apex-root')).toContainText('Mes assistants');

    /* Création réelle via le formulaire. */
    await page.fill('#ax-asst-name', 'ProbeBot E2E');
    await page.fill('#ax-asst-instr', 'Assistant de test end-to-end.');
    await page.locator('#ax-asst-form button[type="submit"]').first().click();
    await expect(page.locator('#apex-root')).toContainText('ProbeBot E2E', { timeout: 4000 });
  });

  test('Canvas / Artifacts : éditeur + aperçu live rendus', async ({ page }) => {
    await loginAdmin(page);

    /* Dépose un artifact HTML puis ouvre le Canvas. */
    await page.evaluate(() => {
      const art = {
        id: 'art_e2e',
        kind: 'html',
        lang: 'html',
        code: '<!doctype html><html><body><h1 id="probe">Bonjour Canvas</h1></body></html>',
        previewable: true,
      };
      sessionStorage.setItem('apex_v13_canvas_artifact', JSON.stringify(art));
      location.hash = '#canvas';
    });

    await expect(page.locator('#ax-canvas-code')).toBeVisible({ timeout: 6000 });
    const iframe = page.locator('#ax-canvas-preview');
    await expect(iframe).toBeVisible();
    /* L'aperçu injecte le code de l'artifact dans le srcdoc. */
    const srcdoc = await iframe.getAttribute('srcdoc');
    expect(srcdoc ?? '').toContain('Bonjour Canvas');
  });

  test('Projects : route rend + création via le vrai formulaire', async ({ page }) => {
    await loginAdmin(page);
    await page.evaluate(() => { location.hash = '#projects'; });
    await expect(page.locator('#ax-proj-form')).toBeVisible({ timeout: 6000 });
    await expect(page.locator('#apex-root')).toContainText('Mes projets');
    await page.fill('#ax-proj-name', 'Projet E2E');
    await page.fill('#ax-proj-instr', 'Instructions de test.');
    await page.locator('#ax-proj-form button[type="submit"]').first().click();
    await expect(page.locator('#apex-root')).toContainText('Projet E2E', { timeout: 4000 });
  });

  test('Tâches programmées : route rend + création', async ({ page }) => {
    await loginAdmin(page);
    await page.evaluate(() => { location.hash = '#scheduled'; });
    await expect(page.locator('#ax-sched-form')).toBeVisible({ timeout: 6000 });
    await expect(page.locator('#apex-root')).toContainText('Tâches programmées');
    await page.fill('#ax-sched-prompt', 'Résume l\'actu du jour');
    await page.locator('#ax-sched-form button[type="submit"]').first().click();
    await expect(page.locator('#apex-root')).toContainText('Résume', { timeout: 4000 });
  });
});
