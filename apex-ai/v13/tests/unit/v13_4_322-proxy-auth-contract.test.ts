/**
 * v13.4.322 — CONTRAT D'AUTH PROXY (anti-récidive lesson #95).
 *
 * Bug vécu : le client (apex-secrets-proxy-client) envoie DÉJÀ sha256(PIN) dans
 * x-apex-pin ; le worker re-hashait → comparait sha256(sha256(PIN)) à
 * APEX_ADMIN_PIN_SHA256 (= sha256(PIN)) → 401 sur TOUS les providers → IA KO.
 * Le `/health` (sans auth) montrait « 22/22 actifs » → fausse impression que
 * tout marchait.
 *
 * Ce test extrait le VRAI `verifyPin` du worker (généré dans le workflow YAML)
 * et prouve qu'il accepte exactement ce que le client envoie. Il aurait échoué
 * sur l'ancien worker double-hash. Câblé dans l'audit (`npm test`).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const WORKFLOW = resolve(
  process.cwd(),
  '../../.github/workflows/sync-apex-secrets-to-cf-worker.yml',
);

/** sha256 hex — convention IDENTIQUE client (sha256Hex) et worker (verifyPin). */
async function sha256Hex(s: string): Promise<string> {
  const enc = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest('SHA-256', enc);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Extrait le corps réel de verifyPin du worker et le rend appelable. */
function loadWorkerVerifyPin(): (
  req: { headers: { get: (k: string) => string | null } },
  env: Record<string, string | undefined>,
) => Promise<boolean> {
  const yaml = readFileSync(WORKFLOW, 'utf8');
  const m = yaml.match(/async function verifyPin\(req, env\) \{\n([\s\S]*?)\n {10}\}/);
  if (!m) throw new Error('verifyPin introuvable dans le workflow worker');
  const body = m[1];
  /* eslint-disable-next-line no-new-func -- on exécute le VRAI verifyPin du worker (test de contrat). */
  const fn = new Function('req', 'env', `return (async () => {\n${body}\n})();`);
  return fn as ReturnType<typeof loadWorkerVerifyPin>;
}

describe('v13.4.322 — contrat auth proxy (client ⇄ worker)', () => {
  const PIN = '200807';

  it('le worker accepte le header tel que le client l’envoie (sha256(PIN))', async () => {
    const verifyPin = loadWorkerVerifyPin();
    const header = await sha256Hex(PIN); // ce que le client met dans x-apex-pin
    const secret = await sha256Hex(PIN); // APEX_ADMIN_PIN_SHA256 = sha256(PIN)
    const ok = await verifyPin(
      { headers: { get: () => header } },
      { APEX_ADMIN_PIN_SHA256: secret },
    );
    expect(ok).toBe(true); /* échouait sur l'ancien worker double-hash → 401 */
  });

  it('le worker accepte aussi un header en clair (PIN brut → sha256 côté worker)', async () => {
    const verifyPin = loadWorkerVerifyPin();
    const secret = await sha256Hex(PIN);
    const ok = await verifyPin(
      { headers: { get: () => PIN } }, // header = PIN clair
      { APEX_ADMIN_PIN_SHA256: secret },
    );
    expect(ok).toBe(true); /* tolérance : header clair OU pré-hashé */
  });

  it('le worker REFUSE un mauvais code', async () => {
    const verifyPin = loadWorkerVerifyPin();
    const secret = await sha256Hex(PIN);
    const bad = await sha256Hex('000000');
    const ok = await verifyPin(
      { headers: { get: () => bad } },
      { APEX_ADMIN_PIN_SHA256: secret },
    );
    expect(ok).toBe(false);
  });

  it('le worker REFUSE un header absent', async () => {
    const verifyPin = loadWorkerVerifyPin();
    const ok = await verifyPin(
      { headers: { get: () => null } },
      { APEX_ADMIN_PIN_SHA256: await sha256Hex(PIN) },
    );
    expect(ok).toBe(false);
  });

  it('le client envoie un SEUL hash et lit ax_pin_kdmc_admin (clé d’activation)', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'services/integrations/apex-secrets-proxy-client.ts'),
      'utf8',
    );
    /* La clé lue par le client == celle écrite par l'activation 1-tap. */
    expect(src).toContain("vault.readKey('ax_pin_kdmc_admin')");
    /* Le client hash UNE fois (sha256Hex(pinPlain)) — pas de double hash. */
    expect(src).toContain('return sha256Hex(pinPlain)');
    expect(src).not.toMatch(/sha256Hex\(\s*await\s+sha256Hex/);
    /* Le header envoyé est bien le hash, pas le PIN en clair. */
    expect(src).toContain("headers.set('x-apex-pin', pinHash)");
  });

  it('lesson #85/#95 : /health ne prouve RIEN sur l’auth (retourne avant verifyPin)', () => {
    const yaml = readFileSync(WORKFLOW, 'utf8');
    const healthIdx = yaml.indexOf("url.pathname === '/health'");
    const authIdx = yaml.indexOf('await verifyPin(req, env)');
    expect(healthIdx).toBeGreaterThan(-1);
    expect(authIdx).toBeGreaterThan(-1);
    /* /health est traité (et retourne) AVANT toute vérif d'auth. */
    expect(healthIdx).toBeLessThan(authIdx);
  });

  it('CORS : le worker répond au préflight OPTIONS AVANT l’auth (sinon "Pas de réseau")', () => {
    const yaml = readFileSync(WORKFLOW, 'utf8');
    /* Un POST avec header custom x-apex-pin déclenche un préflight OPTIONS sans ce
     * header → doit retourner 204 + CORS AVANT verifyPin (sinon 401 sans CORS →
     * le navigateur bloque le POST → "Failed to fetch"). */
    const optIdx = yaml.indexOf("req.method === 'OPTIONS'");
    const authIdx = yaml.indexOf('await verifyPin(req, env)');
    expect(optIdx).toBeGreaterThan(-1); /* préflight géré */
    expect(optIdx).toBeLessThan(authIdx); /* AVANT l'auth */
    expect(yaml).toContain("'Access-Control-Allow-Headers'");
    expect(yaml).toMatch(/Access-Control-Allow-Headers[^]*x-apex-pin/); /* header custom autorisé */
    /* Les réponses d'erreur portent CORS → l'app lit le vrai statut (401/503), pas un échec réseau opaque. */
    expect(yaml).toContain("status: 401, headers: CORS");
  });
});
