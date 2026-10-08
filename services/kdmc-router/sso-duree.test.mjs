/* LE LAISSEZ-PASSER ADMIN VIT 24 H — Kevin 30.09.2026 : « B » (« 24 heures, puis Face ID une fois par jour »).
   Audit complet Bee : le laissez-passer VÉRIFIÉ de l'admin valait 30 jours et est rangé dans chaque app
   installée ; une faille dans une seule app = l'admin du domaine pendant 30 jours. Ce test passe par le
   VRAI routeur : le laissez-passer admin émis dure 24 h (et son cookie aussi), il est refusé passé 24 h ;
   un compte ordinaire garde 30 jours (reconnu auto après la 1re connexion). Sans réseau.
   node sso-duree.test.mjs */
import mod from './worker.js';
import { createHash, createHmac } from 'node:crypto';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const lit = (t) => JSON.parse(Buffer.from(String(t).split('.')[0].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
const kv = new Map();
const env = { KDMC_SSO_SECRET: 'sec', KDMC_CODE_OBLIGATOIRE: '0' /* ce test crée des comptes par le nom ; le code obligatoire est prouvé par code-attente.test.mjs */, KDMC_ADMIN_PIN_SHA256: sha('424242'),
  ACCOUNTS: { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); }, list: async () => ({ keys: [], list_complete: true }) } };
const ctx = { waitUntil() {} };
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const H = 3600e3;

/* 1. Kevin prouve le code admin → laissez-passer VÉRIFIÉ de 24 h, cookie de 24 h */
{ const r = await mod.fetch(new Request('https://kd-mc.com/__admin/login', { method: 'POST', headers: { 'content-type': 'application/json', Origin: 'https://kd-mc.com' }, body: JSON.stringify({ code: '424242' }) }), env, ctx);
  const j = await r.json();
  const d = j.token ? lit(j.token) : {};
  const duree = (d.exp - d.iat) / H;
  ok(j.ok && d.v === 1 && Math.abs(duree - 24) < 0.01, `laissez-passer admin vérifié : ${duree.toFixed(2)} h (attendu 24 h, avant 720 h)`);
  const cookies = r.headers.get('set-cookie') || '';
  const m = cookies.match(/kdmc_sso=[^;]+;[^,]*?Max-Age=(\d+)/);
  ok(m && Math.abs(+m[1] - 86400) <= 5, `son cookie dure ${m ? m[1] : '?'} s (≈ 86 400)`);
  /* il ouvre aujourd'hui… */
  const w = await (await mod.fetch(new Request('https://kd-mc.com/__sso/whoami', { headers: { Authorization: 'Bearer ' + j.token } }), env, ctx)).json();
  ok(w.ok && w.admin && w.verified, 'aujourd\'hui : reconnu admin, Face ID prouvé'); }

/* 2. … et plus demain : un laissez-passer admin de 25 h est refusé (c'est Face ID, une fois par jour) */
{ const vieux = (() => { const iat = Date.now() - 25 * H; const p = b64u(JSON.stringify({ u: 'kdmc_admin', n: 'Kevin', c: 1, v: 1, k: 0, iat, exp: iat + 24 * H }));
    return p + '.' + b64u(createHmac('sha256', 'sec').update(p).digest()); })();
  const w = await (await mod.fetch(new Request('https://kd-mc.com/__sso/whoami', { headers: { Authorization: 'Bearer ' + vieux } }), env, ctx)).json();
  ok(!w.ok || !w.admin, 'un laissez-passer admin de 25 h n\'ouvre plus rien  ' + JSON.stringify(w).slice(0, 80)); }

/* 3. un compte ordinaire garde 30 jours (reconnu auto après la 1re connexion) */
{ const r = await mod.fetch(new Request('https://kd-mc.com/__sso/issue', { method: 'POST', headers: { 'content-type': 'application/json', Origin: 'https://kd-mc.com' }, body: JSON.stringify({ uid: 'marie-dupont', name: 'Marie Dupont', cgu: true }) }), env, ctx);
  const j = await r.json(); const t = j.token || ((r.headers.get('set-cookie') || '').match(/kdmc_sso=([^;]+)/) || [])[1];
  const d = t ? lit(t) : {};
  ok(t && Math.abs((d.exp - d.iat) / (24 * H) - 30) < 0.01, `compte ordinaire : ${t ? ((d.exp - d.iat) / (24 * H)).toFixed(1) : '?'} jours (inchangé : 30)`); }

console.log(`\n=== Laissez-passer admin 24 h : ${pass} contrôles OK, ${fail} échec(s) ===`);
process.exit(fail ? 1 : 0);
