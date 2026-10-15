// @vitest-environment node
/**
 * Lot E2 (audit A5, F11) — l'E2E « deux clients » ne transforme plus une panne du login de test en vert.
 * Secret absent → sauté ET annoncé ; secret présent + login en panne → ÉCHEC. Le spec Playwright
 * passe obligatoirement par cette politique (contrôle du texte du spec ci-dessous).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { decisionLoginTest, exigerLoginTest } from '../../e2e/login-test-politique.js';

const OK = { ok: true, status: 200, body: { token: 't', user: { id: 'u' } } };
const KO = { ok: false, status: 401, body: { reason: 'bad_secret' } };

function fauxTest() {
  const annotations = [];
  return { annotations, info: () => ({ annotations }), skip: vi.fn((cond, why) => { if (cond) throw Object.assign(new Error('SKIP ' + why), { skipped: true }); }) };
}

describe('politique du login de test', () => {
  it('secret absent → sauter, avec une annotation lisible', () => {
    expect(decisionLoginTest({ secret: '', a: KO, b: KO }).action).toBe('sauter');
    const t = fauxTest();
    expect(() => exigerLoginTest(t, '', KO, KO)).toThrow(/SKIP E2E_TEST_SECRET absent/);
    expect(t.annotations).toEqual([{ type: 'saute', description: expect.stringMatching(/E2E_TEST_SECRET absent/) }]);
  });

  it('secret présent + login en panne (401, 500, pas de réponse) → ÉCHEC, jamais « sauté »', () => {
    for (const [a, b] of [[KO, OK], [OK, { ok: false, status: 500, body: {} }], [OK, null]]) {
      expect(decisionLoginTest({ secret: 's', a, b }).action).toBe('echouer');
      const t = fauxTest();
      expect(() => exigerLoginTest(t, 's', a, b)).toThrow(/login de test EN PANNE alors que le secret est fourni/);
      expect(t.skip).not.toHaveBeenCalled();
    }
    expect(decisionLoginTest({ secret: 's', a: KO, b: OK }).raison).toMatch(/A:401 bad_secret B:200/);
  });

  it('secret présent + login OK → on continue', () => {
    expect(exigerLoginTest(fauxTest(), 's', OK, OK)).toBe(true);
  });

  it('le spec deux clients passe par la politique : plus aucun « skip » sur login indisponible', () => {
    const spec = readFileSync(new URL('../../e2e/two-clients.spec.js', import.meta.url), 'utf8');
    expect(spec).not.toMatch(/test\.skip\(\s*true\s*,\s*`login de test indisponible/);
    expect(spec).not.toMatch(/if \(!aAuth\.ok \|\| !bAuth\.ok\)/);
    const appels = spec.match(/exigerLoginTest\(test, TEST_SECRET, aAuth, bAuth\)/g) || [];
    const logins = spec.match(/const aAuth = await auth\(request, A\)/g) || [];
    expect(appels.length).toBe(logins.length);
    expect(appels.length).toBeGreaterThanOrEqual(3);
  });
});
