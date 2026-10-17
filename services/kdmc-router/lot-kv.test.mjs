/* GARDE — la création de compte n'écrit chaque clé KV qu'UNE fois (17.10.2026, mesuré en réel : 7,2 s côté serveur)
   node services/kdmc-router/lot-kv.test.mjs

   Le KV de Cloudflare refuse (429) une 2ᵉ écriture sur la même clé dans la même seconde ; `accPut` avale l'erreur → donnée PERDUE.
   Ici un faux KV FIDÈLE à cette règle (il jette « KV PUT failed: 429 » comme le vrai) :
     1. briques : tampon (dernière valeur gagne), lecture du tampon (texte / json), suppression, écriture unique au vider ;
     2. après vider : une écriture en fond attend la fin de la seconde (jamais de 429) ;
     3. VRAI routeur, inscription complète (e-mail + téléphone, validation par mail) : aucun 429, chaque clé écrite une fois,
        et la fiche contient TOUT (nom, cgu, téléphone, attente, mail_confirmation, e-mail) ;
     4. sabotage : sans le lot, le même parcours prend des 429 et la fiche perd des champs → la garde est discriminante. */
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { lotKV } from './lot-kv.js';
import { schema as schemaCercle } from './cercle.js';
import mod from './worker.js';

let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d !== undefined ? '  → ' + JSON.stringify(d).slice(0, 300) : ''}`); };
function kvFidele() {
  const m = new Map(), derniere = new Map(), ecritures = [], refus = [];
  const kv = {
    get: async (k, t) => { const v = m.has(k) ? m.get(k) : null; return t === 'json' || (t && t.type === 'json') ? (v == null ? null : JSON.parse(v)) : v; },
    put: async (k, v) => { const t = Date.now(); if (derniere.has(k) && t - derniere.get(k) < 1000) { refus.push(k); throw new Error('KV PUT failed: 429 Too Many Requests'); } derniere.set(k, t); ecritures.push(k); m.set(k, v); },
    delete: async (k) => { m.delete(k); }, list: async () => ({ keys: [], list_complete: true }),
  };
  return { kv, m, ecritures, refus };
}
function d1() {
  const s = new DatabaseSync(':memory:');
  const stmt = (sql, p = []) => ({ bind: (...x) => stmt(sql, x), first: async () => s.prepare(sql).get(...p) ?? null, all: async () => ({ results: s.prepare(sql).all(...p) }),
    run: async () => { const r = s.prepare(sql).run(...p); return { meta: { changes: Number(r.changes) } }; }, _exec: () => s.prepare(sql).run(...p) });
  return { prepare: (sql) => stmt(sql), batch: async (l) => { for (const x of l) x._exec(); return []; } };
}

console.log('\n== 1. Les briques ==');
{
  const F = kvFidele(); const lot = lotKV({ ACCOUNTS: F.kv, X: 1 });
  ok(lot.env.X === 1 && lot.env.ACCOUNTS !== F.kv, '1. env du lot : mêmes liaisons, KV remplacé');
  await lot.env.ACCOUNTS.put('a', '1'); await lot.env.ACCOUNTS.put('a', JSON.stringify({ n: 2 })); await lot.env.ACCOUNTS.put('b', 'x'); await lot.env.ACCOUNTS.delete('b');
  ok(F.ecritures.length === 0, '1b. rien n\'est écrit pendant la requête');
  ok((await lot.env.ACCOUNTS.get('a', 'json')).n === 2 && (await lot.env.ACCOUNTS.get('a')) === '{"n":2}' && (await lot.env.ACCOUNTS.get('b')) === null, '1c. les lectures voient le tampon (dernière valeur, json, suppression)');
  await lot.vider();
  ok(F.ecritures.join() === 'a' && F.m.get('a') === '{"n":2}' && !F.m.has('b') && F.refus.length === 0, '1d. vider : une seule écriture de « a », la dernière valeur', F.ecritures);
  console.log('\n== 2. Après vider : une écriture en fond attend la seconde ==');
  const t0 = Date.now(); await lot.env.ACCOUNTS.put('a', '3');
  ok(F.refus.length === 0 && F.m.get('a') === '3' && Date.now() - t0 >= 900, '2. écrite après la fin de la seconde, sans 429 (' + (Date.now() - t0) + ' ms)');
}

console.log('\n== 3. Vrai routeur : inscription complète, chaque clé écrite une fois, fiche complète ==');
const inscrire = async (sansLot) => {
  const F = kvFidele(); const db = d1(); await schemaCercle(db);
  const env = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: createHash('sha256').update('424242').digest('hex'), ACCOUNTS: F.kv, CERCLE_DB: db,
    KDMC_VALIDATION_MANUELLE: '1', EMAILJS_PRIVATE_KEY: 'cle' };
  if (sansLot) env.__lotKV = true;   // sabotage : le routeur croit déjà être dans un lot → pas de lot
  globalThis.fetch = async () => new Response('OK', { status: 200 });
  const r = new Request('https://kd-mc.com/__sso/issue', { method: 'POST', headers: { host: 'kd-mc.com', 'content-type': 'application/json', origin: 'https://kd-mc.com', 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1', 'cf-connecting-ip': '203.0.113.9' },
    body: JSON.stringify({ uid: 'lou-test', name: 'Lou Test', cgu: true, cgu_clic: true, code: '24681357', telephone: '+377 06 12 34 56', email: 'lou@example.com' }) });
  Object.defineProperty(r, 'cf', { value: { asn: 6758, city: 'Monaco', country: 'MC' } });
  const fond = []; const res = await mod.fetch(r, env, { waitUntil(p) { fond.push(p); } }); const j = await res.json(); await Promise.all(fond);
  return { F, j, fiche: JSON.parse(F.m.get('acc:lou-test') || 'null') };
};
{
  const { F, j, fiche } = await inscrire(false);
  const dbl = F.ecritures.filter((k, i) => F.ecritures.indexOf(k) !== i);
  ok(j.ok === true && j.attente_admin === true && j.mail_envoye, '3. inscription acceptée, fermée, mail parti', j);
  ok(F.refus.length === 0, '3b. aucun 429 (aucune écriture refusée)', F.refus);
  ok(dbl.length === 0, '3c. chaque clé écrite une seule fois (' + F.ecritures.length + ' écritures)', F.ecritures);
  ok(fiche && fiche.name === 'Lou Test' && fiche.cgu_at > 0 && fiche.attente_admin === true, '3d. fiche : nom, conditions, attente', fiche);
  ok(fiche && fiche.mail_confirmation && fiche.mail_confirmation.envoye_at > 0 && fiche.fiche && fiche.fiche.email === 'lou@example.com', '3e. fiche : mail_confirmation + e-mail', fiche && { mc: fiche.mail_confirmation, f: fiche.fiche });
  ok(fiche && fiche.fiche && fiche.fiche.telephone === '+377 06 12 34 56', '3f. fiche : téléphone', fiche && fiche.fiche);
  ok(F.m.has('cred:lou-test') && JSON.parse(F.m.get('aud:log') || '[]').length >= 1, '3g. code posé, journal écrit');
}
console.log('\n== 4. Sabotage : sans le lot, le même parcours perd des données ==');
{
  const { F, fiche } = await inscrire(true);
  const complet = fiche && fiche.mail_confirmation && fiche.fiche && fiche.fiche.telephone && fiche.attente_admin === true; console.log('     (fiche sans lot : attente_admin=' + (fiche && fiche.attente_admin) + ', mail_confirmation=' + !!(fiche && fiche.mail_confirmation) + ', téléphone=' + !!(fiche && fiche.fiche && fiche.fiche.telephone) + ')');
  ok(F.refus.length > 0 && !complet, '4. sans lot : ' + F.refus.length + ' écriture(s) refusée(s) (429) et fiche incomplète → la garde 3 est discriminante', { refus: F.refus, complet: !!complet });
}
console.log(`\n${pass} ✅ / ${fail} ❌\n`);
process.exit(fail ? 1 : 0);
