/* Test du gate ESPACE PRIVÉ ADMIN de autorisations.kd-mc.com (Coffre d'autorisations).
   - Sans session admin → page de verrouillage (200, code).
   - Session admin (grant Face ID/PIN) → app servie (upstream mocké).
   - PIN admin non déployé → fail-open (anti-lockout rollout — leçons #99/#100).
   - Le gate ne touche QUE ce host (cmcteams non gaté).
   node approvals-gate.test.mjs */
import mod from './worker.js';
import { createHash, createHmac } from 'crypto';

const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const signSso = (secret, uid, v) => { const p = b64u(JSON.stringify({ u: uid, n: uid, c: 1, v: v ? 1 : 0, iat: Date.now(), exp: Date.now() + 1e9 })); return p + '.' + b64u(createHmac('sha256', secret).update(p).digest()); };
const sha = (s) => createHash('sha256').update(s).digest('hex');
const env = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: sha('424242') };
const REQ = (path, headers) => new Request('https://autorisations.kd-mc.com' + path, { headers: headers || {} });

let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗ ' + m)); };

/* L'hébergeur des pages est mocké (aucun réseau réel). On reconnaît « une requête
   vers l'hébergeur » par la RÈGLE — tout ce qui ne va pas vers kd-mc.com — et non
   par un nom d'hôte écrit en dur : le 23.09.2026 ces tests continuaient de mocker
   github.io alors que le site avait déménagé sur Cloudflare Pages. */
const realFetch = globalThis.fetch;
globalThis.fetch = async (input) => { const u = typeof input === 'string' ? input : input.url; if (!/(^|\.)kd-mc\.com$/i.test(new URL(u).hostname)) return new Response('APP_APPROVALS_OK', { status: 200, headers: { 'content-type': 'text/html' } }); return realFetch(input); };

try {
  /* 1) pas de session → verrouillage (l'app n'est PAS servie) */
  const r1 = await mod.fetch(REQ('/'), env); const b1 = await r1.text();
  ok(r1.status === 200 && /espace priv/i.test(b1) && /autorisations/i.test(b1) && !/APP_APPROVALS_OK/.test(b1), 'sans admin → page de verrouillage');

  /* 2) grant admin valide → app servie */
  const grant = signSso('sec', '__kdmc_admin__', 1);
  const r2 = await mod.fetch(REQ('/', { 'x-kdmc-admin': grant }), env); const b2 = await r2.text();
  ok(/APP_APPROVALS_OK/.test(b2) && !/espace priv/i.test(b2), 'admin authentifié → app servie');

  /* 3) PIN admin non configuré → fail-open (pas de lockout) */
  const r3 = await mod.fetch(REQ('/'), { KDMC_SSO_SECRET: 'sec' }); const b3 = await r3.text();
  ok(/APP_APPROVALS_OK/.test(b3), 'PIN non déployé → fail-open (app servie)');

  /* 4) le gate ne touche QUE autorisations (cmcteams non gaté) */
  const r4 = await mod.fetch(new Request('https://cmcteams.kd-mc.com/'), env); const b4 = await r4.text();
  ok(/APP_APPROVALS_OK/.test(b4) && !/espace priv/i.test(b4), 'gate ne touche QUE autorisations (cmcteams non gaté)');
} finally { globalThis.fetch = realFetch; }

console.log(`Approvals private-admin gate test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
