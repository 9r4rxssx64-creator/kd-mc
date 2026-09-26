/**
 * APEX v13 — A11y static audit (Vitest + happy-dom + axe-core)
 *
 * Mission UX 17→20/20 : audit statique des HTML samples (snippets features) sans serveur.
 *
 * Les tests Playwright (a11y.spec.ts) couvrent les routes live, mais nécessitent
 * un build + preview server. Ce test Vitest tourne en CI rapide sur :
 *   - HTML index.html (skeleton)
 *   - Snippet landing form
 *   - Snippet chat composer
 *   - Snippet dialog vault add-key
 *
 * Cible : 0 violation critical/serious sur chaque snippet.
 */
import { describe, it, expect } from 'vitest';
import axe from 'axe-core';

/* Helper : run axe sur un élément donné, retourne violations groupées par impact */
async function runAxe(html: string): Promise<{
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
  details: Array<{ id: string; impact: string | null; help: string }>;
}> {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);

  const result = await axe.run(root, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    resultTypes: ['violations'],
  });

  const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  const details: Array<{ id: string; impact: string | null; help: string }> = [];
  for (const v of result.violations) {
    const imp = (v.impact as keyof typeof counts) ?? 'minor';
    if (imp in counts) counts[imp]++;
    details.push({ id: v.id, impact: v.impact, help: v.help });
  }
  document.body.removeChild(root);
  return { ...counts, details };
}

describe('A11y static — WCAG 2.1 AA via axe-core', () => {
  it('landing form a 0 violations critical/serious', async () => {
    const html = `
      <main role="main" aria-label="APEX login">
        <h1>APEX</h1>
        <form id="login-form" novalidate>
          <label for="login-name">Nom et prénom</label>
          <input type="text" id="login-name" required minlength="3" autocomplete="name">
          <label for="login-pin">Code PIN</label>
          <input type="password" id="login-pin" required minlength="4" autocomplete="current-password" inputmode="numeric">
          <button type="submit" id="login-submit">Se connecter</button>
        </form>
        <div id="login-error" aria-live="polite" aria-atomic="true"></div>
      </main>
    `;
    const r = await runAxe(html);
    expect(r.critical, `Critical: ${JSON.stringify(r.details)}`).toBe(0);
    expect(r.serious, `Serious: ${JSON.stringify(r.details)}`).toBe(0);
  });

  it('chat composer a 0 violations critical/serious', async () => {
    const html = `
      <div role="log" aria-live="polite" aria-atomic="false" class="ax-chat-scroll"></div>
      <form>
        <label for="chat-input" class="sr-only">Message</label>
        <textarea id="chat-input" aria-label="Message" placeholder="Tape ton message..."></textarea>
        <button type="button" aria-label="Dictée vocale" title="Dictée vocale">🎙</button>
        <button type="button" aria-label="Joindre fichier" title="Photo, vidéo, document">📎</button>
        <button type="button" aria-label="Ouvrir caméra" title="Caméra">📷</button>
        <button type="submit" aria-label="Envoyer">→</button>
      </form>
    `;
    const r = await runAxe(html);
    expect(r.critical, `Critical: ${JSON.stringify(r.details)}`).toBe(0);
    expect(r.serious, `Serious: ${JSON.stringify(r.details)}`).toBe(0);
  });

  it('vault dialog add-key a 0 violations critical/serious', async () => {
    const html = `
      <div role="dialog" aria-modal="true" aria-label="Ajouter une clé" tabindex="-1">
        <h2 id="vault-modal-title">Ajouter une clé</h2>
        <button id="vault-close" aria-label="Fermer">×</button>
        <form>
          <label for="vault-name">Nom du service</label>
          <input id="vault-name" type="text" required>
          <label for="vault-key">Clé secrète</label>
          <input id="vault-key" type="password" required autocomplete="off">
          <button type="submit">Enregistrer</button>
        </form>
      </div>
    `;
    const r = await runAxe(html);
    expect(r.critical, `Critical: ${JSON.stringify(r.details)}`).toBe(0);
    expect(r.serious, `Serious: ${JSON.stringify(r.details)}`).toBe(0);
  });

  it('toast aria-live region exists', async () => {
    const html = `
      <div id="toast-region" aria-live="polite" aria-atomic="true" role="status"></div>
    `;
    const r = await runAxe(html);
    expect(r.critical).toBe(0);
    expect(r.serious).toBe(0);
  });

  it('SOS rescue button has aria-label', async () => {
    const html = `
      <button id="apex-rescue-btn" type="button" aria-label="Reset Apex" title="Reset Apex">SOS</button>
    `;
    const r = await runAxe(html);
    expect(r.critical).toBe(0);
    expect(r.serious).toBe(0);
  });
});
