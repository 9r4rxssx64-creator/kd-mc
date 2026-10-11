/* GARDE — « Récupérer mes factures » ne renvoie plus tout l'arriéré d'un coup (11.10.2026)
   node services/kdmc-router/mail-arriere.test.mjs        (SABOTAGE=1 : ancien comportement, tout d'un coup → la garde doit rougir)

   Kevin : « Récupérer mes factures maintenant » → « Serveur : HTTP 503 ». Cause probable (mesurée par le code, pas par un journal) : le scan
   chargeait jusqu'à 120 pièces (15 Mo chacune) dans UNE réponse, bien au-delà de la mémoire d'un Worker → 503, et rien n'étant acquitté,
   l'arriéré ne pouvait que grossir.

   Ici : 40 pièces de ~1 Mo en attente (≈ 40 Mo, au-dessus de ce qu'un Worker encaisse en une réponse).
     1. un scan ne renvoie que ~8 Mo : `restant:true`, jamais les 40 d'un coup ;
     2. l'app boucle (scan → ack) et reçoit TOUT, sans doublon ni perte ;
     3. une pièce seule plus lourde que le plafond part quand même (elle ne bloque pas la file) ;
     4. une entrée illisible ne fait pas planter le scan et reste en place ;
     5. chaque pièce renvoyée porte son `id` (l'app en a besoin pour acquitter) ;
     6. file vide → `{ok:true, items:[]}` ; le message « budget du jour » (list qui lève) reste distinct. */
import mod from './worker.js';
import { createHash } from 'node:crypto';

const SAB = process.env.SABOTAGE === '1';
const store = new Map();
let listeLeve = null;
const ACCOUNTS = {
  get: async (k) => (store.has(k) ? store.get(k) : null),
  put: async (k, v) => { store.set(k, v); },
  delete: async (k) => { store.delete(k); },
  list: async ({ prefix } = {}) => { if (listeLeve) throw new Error(listeLeve); return { keys: [...store.keys()].filter((k) => !prefix || k.startsWith(prefix)).map((name) => ({ name })), list_complete: true, cursor: null }; },
};
const CODE = '424242';
const env = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: createHash('sha256').update(CODE).digest('hex'), ACCOUNTS };
const REQ = (o) => new Request('https://kd-mc.com' + o.path, { method: o.method || 'GET', headers: o.headers || {}, body: o.body });
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗ ' + m)); };

let r = await mod.fetch(REQ({ path: '/__admin/login', method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: CODE }) }), env);
const H = { 'x-kdmc-admin': (await r.json()).grant, 'content-type': 'application/json' };
const scan = async () => { const x = await mod.fetch(REQ({ path: '/__mail/scan', headers: H }), env); const txt = await x.text(); return { st: x.status, txt, j: JSON.parse(txt) }; };
const ack = (ids) => mod.fetch(REQ({ path: '/__mail/ack', method: 'POST', headers: H, body: JSON.stringify({ ids }) }), env).then((x) => x.json());
const pj = (n, o) => JSON.stringify(Object.assign({ from: 'f@x.fr', subject: 'Facture ' + n, filename: 'f' + n + '.pdf', mime: 'application/pdf', b64: 'A'.repeat(1024 * 1024), size: 1024 * 1024 }, o || {}));

/* version sabotée : l'ancien scan (tout d'un coup, JSON.parse) rejoué à côté, pour prouver que la garde le voit */
async function scanAncien() {
  const items = []; for (const k of [...store.keys()].filter((x) => x.startsWith('mail:p:'))) { if (items.length >= 120) break; const raw = store.get(k); try { const it = JSON.parse(raw); it.id = k.slice(7); items.push(it); } catch { /* */ } }
  const txt = JSON.stringify({ ok: true, items }); return { st: 200, txt, j: JSON.parse(txt) };
}
const lire = SAB ? scanAncien : scan;

console.log('\n== 1. Un arriéré de 40 pièces de ~1 Mo ==');
for (let i = 0; i < 40; i++) store.set('mail:p:p' + String(i).padStart(2, '0'), pj(i));
let s = await lire();
ok(s.st === 200 && s.j.ok === true, '1. le scan répond 200 ok (pas de 503)');
ok(s.txt.length < 12 * 1024 * 1024, `2. la réponse reste sous 12 Mo (${(s.txt.length / 1048576).toFixed(1)} Mo, ${s.j.items.length} pièces) — pas les 40 d'un coup`);
ok(!SAB ? s.j.restant === true : true, '3. `restant: true` : l\'app sait qu\'il y en a encore');
ok(s.j.items.every((x) => typeof x.id === 'string' && x.id.length > 0 && x.b64 && x.filename), '4. chaque pièce porte son id, son contenu et son nom');

console.log('\n== 2. L\'app boucle : scan → ack, jusqu\'à file vide ==');
const vus = new Set(); let tours = 0;
if (!SAB) { for (; tours < 30; tours++) { const x = await scan(); if (!x.j.items.length) break; for (const it of x.j.items) { if (vus.has(it.id)) vus.add('DOUBLON-' + it.id); vus.add(it.id); } await ack(x.j.items.map((i) => i.id)); } }
ok(SAB || (vus.size === 40 && ![...vus].some((v) => String(v).startsWith('DOUBLON'))), `5. les 40 pièces arrivent toutes, sans doublon ni perte (${vus.size}, ${tours} tours)`);
ok(SAB || [...store.keys()].filter((k) => k.startsWith('mail:p:')).length === 0, '6. après les acquittements, plus aucune pièce en attente dans le KV');
s = await scan(); ok(s.j.ok === true && Array.isArray(s.j.items) && s.j.items.length === 0 && s.j.restant === false, '7. file vide → { ok:true, items:[], restant:false }');

console.log('\n== 3. Cas limites ==');
store.set('mail:p:enorme', pj('E', { b64: 'B'.repeat(10 * 1024 * 1024) }));   /* plus lourde que le plafond de 8 Mo, seule */
s = await lire(); ok(s.j.items.length === 1 && s.j.items[0].id === 'enorme', '8. une pièce seule plus lourde que le plafond part quand même (elle ne bloque pas la file)');
await ack(['enorme']);
store.set('mail:p:cassee', '{pas du json'); store.set('mail:p:ok1', pj(1));
s = await lire(); ok(s.st === 200 && s.j.items.some((x) => x.id === 'ok1'), '9. une entrée illisible ne fait pas planter le scan');
ok(store.has('mail:p:cassee'), '10. … et elle reste en place (le scan ne détruit rien)');
store.clear(); listeLeve = 'KV list() limit exceeded for the day';
s = await scan(); ok(s.j.ok === false && s.j.reason === 'kv_quota_jour', '11. budget KV du jour atteint → cause exacte « kv_quota_jour » (pas un 503)');

console.log(`\n${fail ? '❌' : '✅'} mail-arriere : ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
