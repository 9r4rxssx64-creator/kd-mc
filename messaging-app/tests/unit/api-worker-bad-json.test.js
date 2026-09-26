// Garde « JSON invalide = 400, pas 500 » (audit 17/09/2026, P1).
//
// 18 handlers faisaient `await request.json()` sans garde : un corps mal formé (client
// bogué, proxy qui tronque) levait une SyntaxError attrapée par le catch GLOBAL → réponse
// 500 « erreur interne » + une entrée dans la file de télémétrie, pour une faute du client.
// Désormais readJson() → 400 `bad_json`, sans télémétrie. Ce test envoie littéralement `{`
// sur chacune de ces routes et exige 400 + code exact + file de télémétrie vide.
import { describe, it, expect } from 'vitest';
import worker from '../../workers/api-worker.js';
import { ENV, makeJWT } from './api-worker-helpers.js';

const IAT = () => Math.floor(Date.now() / 1000);
const routes = [
  ['/api/auth/send-otp', false],
  ['/api/auth/sso-from-apex', false],
  ['/api/auth/magic-login', false],
  ['/api/conversations', true],
  ['/api/invitations', true],
  ['/api/admin/commands', 'admin'],
  ['/api/admin/whitelist-bulk', 'admin'],
  ['/api/admin/invite-magic', 'admin'],
  ['/api/admin/toggles', 'admin'],
  ['/api/polls', true],
  ['/api/time-capsules', true],
  ['/api/letters', true],
  ['/api/ia/chat', true],
  ['/api/signalements', true],
];

describe('Corps JSON invalide → 400 bad_json, jamais 500 ni télémétrie', () => {
  it.each(routes)('POST %s avec « { »', async (path, auth) => {
    const env = ENV();
    const headers = { 'Content-Type': 'application/json' };
    if (auth === 'admin') headers.Authorization = 'Bearer ' + (await makeJWT({ sub: 'kdmc_admin', is_admin: true, iat: IAT() }));
    else if (auth) headers.Authorization = 'Bearer ' + (await makeJWT({ sub: 'u_test_1', pseudo: 'testeur', iat: IAT() }));
    const req = new Request('https://api.apex' + path, { method: 'POST', headers, body: '{' });
    const r = await worker.fetch(req, env, { waitUntil() {} });
    const body = await r.json();
    // 404 = la route n'existe pas sous ce nom (le test doit alors être corrigé, pas contourné)
    expect(r.status, `${path} → ${r.status} ${JSON.stringify(body)}`).not.toBe(500);
    expect(r.status).not.toBe(404);
    if (r.status === 400) expect(body.error).toBe('bad_json');
    expect(env.TELEMETRY_QUEUE.send).not.toHaveBeenCalled();
  });
});
