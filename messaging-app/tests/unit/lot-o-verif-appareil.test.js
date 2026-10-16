// @vitest-environment node
/**
 * « Connecte-toi comme moi et vérifie à ma place » (Kevin 16.10.2026) : le parcours d'un appareil réel est joué
 * par le robot avec des COMPTES DE TEST (jamais Kevin), et son résultat se lit sans ouvrir les journaux.
 * Cette garde exécute le vrai texte de l'étape « Résumé lisible » sur un faux results.json.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const Y = readFileSync(join(ROOT, '..', '.github/workflows/apex-chat-e2e.yml'), 'utf8');
const SPEC = readFileSync(join(ROOT, 'e2e/parcours-appareil.spec.js'), 'utf8');
const i = Y.indexOf("          [ -f results.json ]");
const j = Y.indexOf('\n\n', i);
const bloc = Y.slice(i, j).split('\n').map((l) => l.replace(/^ {10}/, '')).join('\n');

function joue(results) {
  const d = mkdtempSync(join(tmpdir(), 'e2e-')); writeFileSync(join(d, 'results.json'), JSON.stringify(results));
  try { return execFileSync('bash', ['-c', bloc], { cwd: d, encoding: 'utf8', stdio: 'pipe' }); } catch (e) { return String(e.stdout || '') + String(e.stderr || ''); }
}
const t = (projectName, title, status, message) => ({ title, tests: [{ projectName, results: [{ status, ...(message ? { error: { message } } : {}) }] }] });

describe('résumé lisible du passage', () => {
  it('une annotation par test : ✅ réussi, ⏭ sauté, ❌ échec AVEC la raison exacte (couleurs retirées)', () => {
    const r = { suites: [{ suites: [{ specs: [
      t('chromium-desktop', 'A. version', 'passed'),
      t('webkit-iphone', 'D. hors ligne', 'skipped'),
      t('chromium-desktop', 'C. déconnexion', 'failed', '\u001b[31mExpected\u001b[0m 401\nReceived 200'),
    ] }] }] };
    const s = joue(r);
    expect(s).toContain('::notice title=E2E chromium-desktop::✅ A. version');
    expect(s).toContain('(sauté)');
    expect(s).toContain('::error title=E2E chromium-desktop::❌ C. déconnexion — Expected 401 Received 200');
    expect(s).not.toContain('\u001b');
  });
  it('results.json absent → avertissement, jamais un faux vert silencieux', () => {
    const d = mkdtempSync(join(tmpdir(), 'e2e-'));
    const s = execFileSync('bash', ['-c', bloc], { cwd: d, encoding: 'utf8' });
    expect(s).toContain('::warning title=E2E::results.json absent');
  });
});

describe('le parcours d\'appareil', () => {
  it('rejoue les 4 gestes (version, mode clair mesuré, déconnexion serveur, hors ligne 🕓→✓) avec des comptes de test', () => {
    for (const x of ['A. la version affichée', 'B1. téléphone en mode clair', 'B2. téléphone en mode clair', 'C. « Te déconnecter »', 'D. message écrit hors ligne']) expect(SPEC, x).toContain(x);
    expect(SPEC).toContain('/api/test/login');
    expect(SPEC).toContain("toContainText('🕓'");
    expect(SPEC).toContain("toContainText('✓'");
    expect(SPEC).not.toMatch(/ADMIN_CODE|code_admin|KEVIN_PHONE/);   // jamais le code ni le numéro de Kevin
  });
  it('le workflow lance toute la suite et publie le résumé même en cas d\'échec (if: always())', () => {
    const k = Y.indexOf('Résumé lisible du passage');
    expect(k).toBeGreaterThan(0);
    expect(Y.slice(k, k + 200)).toContain('if: always()');
  });
});
