/* Secours « Face ID perdue sur l'iPhone » (23.10) : un appareil où l'admin est prouvé fabrique un lien unique de 10 min.
   node lien-appareil.test.mjs */
import mod from './worker.js';
import { createHash } from 'node:crypto';
const store = new Map();
const ACCOUNTS = { get: async (k) => (store.has(k) ? store.get(k) : null), put: async (k, v) => { store.set(k, v); }, delete: async (k) => { store.delete(k); } };
const env = { KDMC_SSO_SECRET: 'sec', KDMC_CODE_OBLIGATOIRE: '0', KDMC_ADMIN_PIN_SHA256: createHash('sha256').update('424242').digest('hex'), ACCOUNTS };
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗ ' + m)); };
const REQ = (path, opt = {}) => new Request('https://kd-mc.com' + path, { method: opt.method || 'GET', headers: Object.assign({ origin: 'https://kd-mc.com', 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)' }, opt.headers || {}), body: opt.body });
const run = async () => {
  /* sans preuve admin → refus */
  let r = await mod.fetch(REQ('/__admin/lien-appareil', { method: 'POST' }), env);
  ok(r.status === 403 && (await r.json()).ok === false, 'sans admin prouvé : pas de lien');
  /* admin prouvé par le code (comme le Lenovo) */
  const g = ((await mod.fetch(REQ('/__admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: '424242' }) }), env)).headers.get('set-cookie') || '').match(/kdmc_admin=([^;]+)/);
  ok(!!g, 'grant admin obtenu (préparation)');
  r = await mod.fetch(REQ('/__admin/lien-appareil', { method: 'POST', headers: { cookie: 'kdmc_admin=' + g[1] } }), env);
  const j = await r.json();
  ok(j.ok && /^https:\/\/kd-mc\.com\/__admin\/lien-appareil\/ouvrir\?t=[A-Za-z0-9_-]{40,60}$/.test(j.url) && j.exp > Date.now(), 'admin prouvé : lien unique créé');
  const t = new URL(j.url).searchParams.get('t');
  ok(![...store.keys()].some((k) => k.includes(t)) && [...store.keys()].some((k) => k.startsWith('la:')), 'seule l\'empreinte du jeton est rangée');
  r = await mod.fetch(REQ('/__admin/lien-appareil/ouvrir?t=' + t), env);
  const sc = r.headers.get('set-cookie') || '';
  ok(r.status === 302 && /kdmc_admin=/.test(sc) && /kdmc_sso=/.test(sc) && /HttpOnly/.test(sc), '1er clic sur l\'iPhone : session admin vérifiée posée, retour au portail');
  r = await mod.fetch(REQ('/__admin/lien-appareil/ouvrir?t=' + t), env);
  ok(r.status === 200 && !/kdmc_admin=/.test(r.headers.get('set-cookie') || '') && /déjà utilisé/.test(await r.text()), '2e clic : refusé (usage unique)');
  r = await mod.fetch(REQ('/__admin/lien-appareil/ouvrir?t=' + 'A'.repeat(43)), env);
  ok(r.status === 200 && !/kdmc_admin=/.test(r.headers.get('set-cookie') || ''), 'jeton inventé : refusé');
  /* lien expiré */
  r = await mod.fetch(REQ('/__admin/lien-appareil', { method: 'POST', headers: { cookie: 'kdmc_admin=' + g[1] } }), env);
  const t2 = new URL((await r.json()).url).searchParams.get('t');
  const k2 = [...store.keys()].find((k) => k.startsWith('la:') && JSON.parse(store.get(k)).exp);
  const v = JSON.parse(store.get(k2)); v.exp = Date.now() - 1; store.set(k2, JSON.stringify(v));
  r = await mod.fetch(REQ('/__admin/lien-appareil/ouvrir?t=' + t2), env);
  ok(!/kdmc_admin=/.test(r.headers.get('set-cookie') || ''), 'lien de plus de 10 min : refusé');
  console.log(`Lien d'appareil : ${pass} OK / ${fail} échec(s)`);
  process.exit(fail ? 1 : 0);
};
run();
