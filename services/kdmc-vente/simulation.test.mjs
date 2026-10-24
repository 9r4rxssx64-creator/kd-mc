/* Achats SIMULÉS en vue membre (Kevin 23.10.2026 : « pas connecté admin, tu simules que je suis abonné avec les meilleurs abonnements,
   je peux acheter etc. si je veux, comme ça on simule »). Seul l'admin prouvé en vue membre (whoami simulation:true + apercu:"membre",
   champs que le routeur ne donne qu'à lui) obtient un accès simulé : rien de payé, jamais compté comme vente, aucun e-mail, 24 h. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.js';

function fauxKV() { const m = new Map(); const ttl = new Map(); return { _m: m, _ttl: ttl, async get(k) { return m.has(k) ? m.get(k) : null; }, async put(k, v, o) { m.set(k, v); ttl.set(k, o && o.expirationTtl); }, async delete(k) { m.delete(k); }, async list({ prefix = '' } = {}) { return { keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }; } }; }
function sso(qui) {
  const vrai = globalThis.fetch; const appels = [];
  globalThis.fetch = async (u) => { appels.push(String(u)); if (String(u).includes('__sso/whoami')) return new Response(JSON.stringify(qui || { ok: false }), { status: 200 }); throw new Error('appel imprévu ' + u); };
  const rend = () => { globalThis.fetch = vrai; }; rend.appels = appels; return rend;
}
const appel = async (env, chemin, { methode = 'POST', corps, auth } = {}) => {
  const r = await worker.fetch(new Request('https://kdmc-vente.workers.dev' + chemin, { method: methode, headers: { 'content-type': 'application/json', origin: 'https://kit.kd-mc.com', ...(auth ? { Authorization: 'Bearer ' + auth } : {}) }, body: corps ? JSON.stringify(corps) : undefined }), env);
  return { status: r.status, j: await r.json() };
};
const codes = (env) => [...env.VENTES._m.keys()].filter((k) => k.startsWith('code:'));
const PRODUIT = 'kit-ia';

test('refusé : sans pass, membre ordinaire, admin en vue admin, faux cookie (apercu sans simulation)', async () => {
  const env = { VENTES: fauxKV() };
  for (const [qui, auth, attendu] of [
    [null, '', 401],
    [{ ok: true, admin: false, verified: true, name: 'Client' }, 'x', 403],
    [{ ok: true, admin: true, verified: true, name: 'Kevin' }, 'x', 403],
    [{ ok: true, admin: false, verified: true, apercu: 'membre', name: 'Malin' }, 'x', 403],
  ]) {
    const rend = sso(qui);
    try { assert.equal((await appel(env, '/caisse/simulation', { corps: { produit: PRODUIT }, auth })).status, attendu, JSON.stringify(qui)); } finally { rend(); }
  }
  assert.equal(codes(env).length, 0, 'aucun accès créé');
});

test('admin en vue membre : accès simulé réel, 0 €, 24 h, aucun e-mail, jamais compté comme vente', async () => {
  const env = { VENTES: fauxKV(), EMAILJS_PRIVATE_KEY: 'x' };
  const rend = sso({ ok: true, admin: false, verified: true, apercu: 'membre', abonnement: 'max', simulation: true, name: 'Kevin' });
  let r; try { r = await appel(env, '/caisse/simulation', { corps: { produit: PRODUIT }, auth: 'pass' }); } finally { rend(); }
  assert.equal(r.status, 200, JSON.stringify(r.j));
  assert.equal(r.j.simulation, true); assert.equal(r.j.montant, 0); assert.ok(r.j.code);
  assert.equal(rend.appels.filter((u) => /emailjs/.test(u)).length, 0, 'aucun e-mail');
  const k = 'code:' + r.j.code;
  assert.ok(env.VENTES._m.has(k)); assert.equal(env.VENTES._ttl.get(k), 86400);
  assert.equal(JSON.parse(env.VENTES._m.get(k)).simulation, true);
  const src = (await import('node:fs')).readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
  assert.match(src, /if \(!\(f && f\.simulation\)\) fiches\.push\(f\)/, 'le tableau des ventes écarte les achats simulés');
});

test('produit inconnu → 400, rien créé', async () => {
  const env = { VENTES: fauxKV() };
  const rend = sso({ ok: true, apercu: 'membre', simulation: true });
  try { assert.equal((await appel(env, '/caisse/simulation', { corps: { produit: 'nexiste-pas' }, auth: 'p' })).status, 400); } finally { rend(); }
  assert.equal(codes(env).length, 0);
});
