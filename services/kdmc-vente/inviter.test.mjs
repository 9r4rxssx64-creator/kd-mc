/* Invitations gratuites (Kevin 10.10 : « je peux inviter gratuit qui je veux, n'importe où »).
   Un code offert = un vrai code d'accès (même fiche, même page), créé par l'admin VÉRIFIÉ seulement. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.js';

function fauxKV() { const m = new Map(); return { _m: m, async get(k) { return m.has(k) ? m.get(k) : null; }, async put(k, v) { m.set(k, v); }, async delete(k) { m.delete(k); }, async list({ prefix = '' } = {}) { return { keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }; } }; }
function sso(qui) {
  const vrai = globalThis.fetch;
  globalThis.fetch = async (u) => {
    if (String(u).includes('__sso/whoami')) return new Response(JSON.stringify(qui || { ok: false }), { status: 200 });
    throw new Error('appel imprévu ' + u);
  };
  return () => { globalThis.fetch = vrai; };
}
const appel = async (env, chemin, { methode = 'GET', corps, auth } = {}) => {
  const r = await worker.fetch(new Request('https://kdmc-vente.workers.dev' + chemin, { method: methode, headers: { 'content-type': 'application/json', ...(auth ? { Authorization: 'Bearer ' + auth } : {}) }, body: corps ? JSON.stringify(corps) : undefined }), env);
  return { status: r.status, j: await r.json() };
};

test('sans pass, ou pass non admin, ou admin sans Face ID → refusé, rien de créé', async () => {
  const env = { VENTES: fauxKV() };
  let rend = sso(null);
  try { assert.equal((await appel(env, '/admin/inviter', { methode: 'POST', corps: { produit: 'croupier-pro' } })).status, 401); } finally { rend(); }
  rend = sso({ ok: true, admin: false, verified: true, name: 'Quelqu’un' });
  try { assert.equal((await appel(env, '/admin/inviter', { methode: 'POST', corps: { produit: 'croupier-pro' }, auth: 'x' })).status, 403); } finally { rend(); }
  rend = sso({ ok: true, admin: true, verified: false, name: 'Kevin' });
  try { assert.equal((await appel(env, '/admin/inviter', { methode: 'POST', corps: { produit: 'croupier-pro' }, auth: 'x' })).status, 403); } finally { rend(); }
  assert.equal([...env.VENTES._m.keys()].filter((k) => k.startsWith('code:')).length, 0);
});

test('admin vérifié → un vrai code d\'accès, un lien prêt à envoyer, la page le reconnaît', async () => {
  const env = { VENTES: fauxKV() };
  const rend = sso({ ok: true, admin: true, verified: true, name: 'Kevin' });
  try {
    const r = await appel(env, '/admin/inviter', { methode: 'POST', corps: { produit: 'croupier-pro', pour: 'Julie <script>' }, auth: 'x' });
    assert.equal(r.status, 200); assert.ok(r.j.code);
    assert.equal(r.j.lien, 'https://croupier.kd-mc.com/entrainement.html?c=' + encodeURIComponent(r.j.code));
    assert.match(r.j.message, /^Bonjour Julie script ! Je t'offre l'accès complet/);
    assert.ok(r.j.message.includes(r.j.lien));
    const fiche = JSON.parse(await env.VENTES.get('code:' + r.j.code));
    assert.equal(fiche.produit, 'croupier-pro'); assert.match(fiche.source, /^invitation:Kevin → Julie script$/);
    const a = await appel(env, '/acces?c=' + encodeURIComponent(r.j.code));
    assert.equal(a.j.ok, true); assert.equal(a.j.produit, 'croupier-pro');
    const autre = await appel(env, '/admin/inviter', { methode: 'POST', corps: { produit: 'croupier-pro' }, auth: 'x' });
    assert.notEqual(autre.j.code, r.j.code, 'chaque invitation a son propre code');
    const inconnu = await appel(env, '/admin/inviter', { methode: 'POST', corps: { produit: 'nexiste-pas' }, auth: 'x' });
    assert.equal(inconnu.status, 400);
  } finally { rend(); }
});

test('tableau de bord Commerce : la section « Inviter » propose le croupier en premier, et les liens de partage sont encodés', async () => {
  const { createRequire } = await import('node:module');
  const C = createRequire(import.meta.url)('../../kdmc-home/admin/commerce.js');
  const html = C.sectionInviter({ produits: [{ id: 'bureau-ia', court: 'Kit IA au bureau' }] });
  assert.match(html, /id="inv-go"/);
  const ordre = [...html.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ordre.slice(0, 3), ['croupier-pro', 'croupier-entretien', 'bureau-ia']);
  const l = C.liensPartage('Bonjour & salut ! https://x.y/?c=AB');
  assert.equal(l.wa, 'https://wa.me/?text=' + encodeURIComponent('Bonjour & salut ! https://x.y/?c=AB'));
  assert.ok(l.sms.startsWith('sms:?&body='));
  assert.ok(!/<option value="[^"]*<|<script/.test(C.sectionInviter({ produits: [{ id: '"><script>', court: '<b>x' }] })), 'noms échappés');
});
