/* /__arbre/media/<sha256> — photos et scans de l'arbre dans R2 (Kevin 20.10.2026 : « solutions gratuites pour le stockage »).
   Hors ligne, KV et R2 simulés.  node services/kdmc-router/arbre-media.test.mjs */
import mod from './worker.js';
import { createHash } from 'crypto';
const store = new Map();
const ACCOUNTS = { get: async (k) => (store.has(k) ? store.get(k) : null), put: async (k, v) => { store.set(k, v); }, delete: async (k) => { store.delete(k); } };
const sha = (b) => createHash('sha256').update(b).digest('hex');
const r2 = new Map(); let puts = 0;
const ARBRE_MEDIA = {
  get: async (k) => { const o = r2.get(k); return o ? { body: o.buf, size: o.buf.byteLength, httpMetadata: o.md } : null; },
  head: async (k) => { const o = r2.get(k); return o ? { size: o.buf.byteLength, httpMetadata: o.md } : null; },
  put: async (k, buf, o) => { puts++; r2.set(k, { buf, md: (o && o.httpMetadata) || {} }); },
};
const H = sha('arbre::famille-test');
const env = { KDMC_SSO_SECRET: 'sec', KDMC_PORTE_TOTALE: '0', ACCOUNTS, ARBRE_MEDIA };
const REQ = (path, o = {}) => new Request('https://arbre.kd-mc.com' + path, { method: o.method || 'GET', headers: o.headers || {}, body: o.body });
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗ ' + m)); };
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]); const S = sha(jpeg);

/* publier le code famille (l'amorce passe par l'admin ; ici on pose directement l'empreinte comme le fait la publication) */
store.set('arbre:codehash', H);

let r = await mod.fetch(REQ('/__arbre/media/' + S, { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: jpeg }), env);
ok(r.status === 403, 'envoi sans le code famille → 403');
r = await mod.fetch(REQ('/__arbre/media/' + S, { method: 'PUT', headers: { 'content-type': 'image/jpeg', 'x-arbre-code': sha('mauvais') }, body: jpeg }), env);
ok(r.status === 403 && puts === 0, 'envoi avec un mauvais code → 403, rien écrit');
r = await mod.fetch(REQ('/__arbre/media/' + S, { method: 'PUT', headers: { 'content-type': 'image/jpeg', 'x-arbre-code': H }, body: jpeg }), env);
let j = await r.json();
ok(r.status === 200 && j.ok && j.ref === 'm:' + S && puts === 1, 'bon code + bonne empreinte → enregistré, référence m:<empreinte>');
r = await mod.fetch(REQ('/__arbre/media/' + sha('autre chose'), { method: 'PUT', headers: { 'content-type': 'image/jpeg', 'x-arbre-code': H }, body: jpeg }), env);
ok(r.status === 400 && puts === 1, "l'empreinte annoncée doit être celle des octets (le serveur recalcule) → 400");
r = await mod.fetch(REQ('/__arbre/media/' + S, { method: 'PUT', headers: { 'content-type': 'text/html', 'x-arbre-code': H }, body: jpeg }), env);
ok(r.status === 415, 'un type qui n’est pas une image ou un PDF est refusé (415)');
const gros = Buffer.alloc(9 * 1024 * 1024, 7);
r = await mod.fetch(REQ('/__arbre/media/' + sha(gros), { method: 'PUT', headers: { 'content-type': 'image/jpeg', 'x-arbre-code': H }, body: gros }), env);
ok(r.status === 413 && puts === 1, 'plus de 8 Mo → 413');

r = await mod.fetch(REQ('/__arbre/media/' + S), env);
ok(r.status === 403, 'lecture sans code → 403');
r = await mod.fetch(REQ('/__arbre/media/' + S + '?c=' + H), env);
ok(r.status === 200 && r.headers.get('content-type') === 'image/jpeg' && /immutable/.test(r.headers.get('cache-control')), 'lecture par ?c= (balise <img>) → image, cache longue durée');
ok(/private/.test(r.headers.get('cache-control')) && r.headers.get('x-content-type-options') === 'nosniff', 'cache privé, nosniff');
r = await mod.fetch(REQ('/__arbre/media/' + sha('inconnue') + '?c=' + H), env);
ok(r.status === 404, 'image inconnue → 404');
r = await mod.fetch(REQ('/__arbre/media/' + S, { method: 'HEAD', headers: { 'x-arbre-code': H } }), env);
ok(r.status === 200, 'HEAD (vérifier qu’une image est bien là) → 200');
r = await mod.fetch(REQ('/__arbre/media/' + S, { method: 'DELETE', headers: { 'x-arbre-code': H } }), env);
ok(r.status === 405 && r2.size === 1, 'AUCUN effacement possible par cette route (« rien ne se perd »)');
r = await mod.fetch(REQ('/__arbre/media/pas-une-empreinte?c=' + H), env);
ok(r.status !== 200, "une adresse qui n'est pas une empreinte n'est jamais servie");
r = await mod.fetch(REQ('/__arbre/media/' + S + '?c=' + H), { ...env, ARBRE_MEDIA: undefined });
ok(r.status === 503, 'sans R2 → 503 (l’app garde alors l’image en local)');

console.log(`${fail ? '❌' : '✅'} arbre-media : ${pass} ok, ${fail} échec(s)`); process.exit(fail ? 1 : 0);
