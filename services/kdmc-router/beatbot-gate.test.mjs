/* Test du gate ESPACE PRIVÉ ADMIN de beatbot.kd-mc.com (app PoolPilot).
   - Sans session admin → page de verrouillage (200, PIN).
   - Session admin (grant Face ID/PIN) → app servie (upstream mocké).
   - PIN admin non déployé → fail-open (anti-lockout rollout).
   - /__beatbot/health sans grant → 403 need_admin_code (relais gardé).
   node beatbot-gate.test.mjs */
import mod from './worker.js';
import { createHash, createHmac } from 'crypto';

const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const signSso = (secret, uid, v) => { const p = b64u(JSON.stringify({ u: uid, n: uid, c: 1, v: v ? 1 : 0, iat: Date.now(), exp: Date.now() + 1e9 })); return p + '.' + b64u(createHmac('sha256', secret).update(p).digest()); };
const sha = (s) => createHash('sha256').update(s).digest('hex');
const env = { KDMC_SSO_SECRET: 'sec', KDMC_PORTE_TOTALE: '0', /* ce test prouve AUTRE chose que la porte totale (voir compte-obligatoire.test.mjs) */ KDMC_ADMIN_PIN_SHA256: sha('424242') };
const REQ = (path, headers) => new Request('https://beatbot.kd-mc.com' + path, { headers: headers || {} });

let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗ ' + m)); };

/* L'hébergeur des pages est mocké (aucun réseau réel). On reconnaît « une requête
   vers l'hébergeur » par la RÈGLE — tout ce qui ne va pas vers kd-mc.com — et non
   par un nom d'hôte écrit en dur : le 23.09.2026 ces tests continuaient de mocker
   github.io alors que le site avait déménagé sur Cloudflare Pages. */
const realFetch = globalThis.fetch;
globalThis.fetch = async (input) => { const u = typeof input === 'string' ? input : input.url; if (!/(^|\.)kd-mc\.com$/i.test(new URL(u).hostname)) return new Response('APP_POOLPILOT_OK', { status: 200, headers: { 'content-type': 'text/html' } }); return realFetch(input); };

try {
  /* 1) pas de session → verrouillage */
  const r1 = await mod.fetch(REQ('/'), env); const b1 = await r1.text();
  ok(r1.status === 200 && /espace priv/i.test(b1) && /PoolPilot/.test(b1) && !/APP_POOLPILOT_OK/.test(b1), 'sans admin → page de verrouillage');

  /* 2) grant admin valide → app servie */
  const grant = signSso('sec', '__kdmc_admin__', 1);
  const r2 = await mod.fetch(REQ('/', { 'x-kdmc-admin': grant }), env); const b2 = await r2.text();
  ok(/APP_POOLPILOT_OK/.test(b2) && !/espace priv/i.test(b2), 'admin authentifié → app servie');

  /* 3) PIN admin non configuré → fail-open (pas de lockout) */
  const r3 = await mod.fetch(REQ('/'), { KDMC_SSO_SECRET: 'sec' }); const b3 = await r3.text();
  ok(/APP_POOLPILOT_OK/.test(b3), 'PIN non déployé → fail-open (app servie)');

  /* 4) relais /__beatbot/health sans grant → 403 need_admin_code */
  const r4 = await mod.fetch(REQ('/__beatbot/health'), env); const j4 = await r4.json();
  ok(r4.status === 403 && j4.reason === 'need_admin_code', 'relais /__beatbot gardé (403 need_admin_code)');

  /* 5) autre app NON gatée (cmcteams) → sert normalement */
  const r5 = await mod.fetch(new Request('https://cmcteams.kd-mc.com/'), env); const b5 = await r5.text();
  ok(/APP_POOLPILOT_OK/.test(b5) && !/espace priv/i.test(b5), 'gate ne touche QUE beatbot (cmcteams non gaté)');
} finally { globalThis.fetch = realFetch; }

console.log(`Beatbot private-admin gate test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
