/* GARDE — le secours D1 du stockage des comptes (Kevin 17.10.2026 : « Trouve des solutions, crée »)
   node services/kdmc-router/kv-secours.test.mjs

   Le KV ACCOUNTS a un plafond gratuit (1 000 écritures/jour, atteint plusieurs fois) : au-delà il refuse, et l'inscription ne
   s'enregistrait plus. kv-secours.js fait prendre le relais par D1 (CERCLE_DB, 100 000 écritures/jour gratuites) :
     1. KV en bonne santé : tout va au KV, AUCUNE lecture D1 en plus sur une clé absente (une fois le « secours vide » vu) ;
     2. KV qui refuse : l'écriture texte part dans D1, la lecture la retrouve (texte, json), Kevin est prévenu ;
     3. expiration respectée ; suppression des deux côtés ;
     4. le KV revient : la valeur lue est recopiée dans le KV et la ligne D1 disparaît ;
     5. VRAI routeur, KV plein : une inscription complète est enregistrée (fiche lisible, attente du mail vue, CMCteams « en attente ») ;
     6. sabotage : sans le secours, le même parcours ne laisse aucune fiche → la garde 5 est discriminante. */
import { DatabaseSync } from 'node:sqlite';
import { kvAvecSecours, envAvecSecours } from './kv-secours.js';
import { schema as schemaCercle } from './cercle.js';
import mod, { ssoSign } from './worker.js';

let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d !== undefined ? '  → ' + JSON.stringify(d).slice(0, 300) : ''}`); };
function d1() {
  const s = new DatabaseSync(':memory:'); const q = [];
  const stmt = (sql, p = []) => ({ bind: (...x) => stmt(sql, x), first: async () => { q.push(sql); return s.prepare(sql).get(...p) ?? null; }, all: async () => { q.push(sql); return { results: s.prepare(sql).all(...p) }; },
    run: async () => { q.push(sql); const r = s.prepare(sql).run(...p); return { meta: { changes: Number(r.changes) } }; }, _exec: () => s.prepare(sql).run(...p) });
  return { prepare: (sql) => stmt(sql), batch: async (l) => { for (const x of l) x._exec(); return []; }, q, _s: s };
}
function kvFaux() {
  const m = new Map(); let refuse = false;
  return { m, refuser(v) { refuse = v; },
    get: async (k, t) => { const v = m.has(k) ? m.get(k) : null; return v !== null && (t === 'json' || (t && t.type === 'json')) ? JSON.parse(v) : v; },
    put: async (k, v) => { if (refuse) throw new Error('KV PUT failed: 429 Too Many Requests (free usage limit for this operation for today)'); m.set(k, v); },
    delete: async (k) => { if (refuse) throw new Error('KV DELETE failed: limit'); m.delete(k); }, list: async () => ({ keys: [...m.keys()].map((name) => ({ name })), list_complete: true }) };
}
const attendre = () => new Promise((r) => setTimeout(r, 20));

console.log('\n== 1. KV en bonne santé ==');
{
  const kv = kvFaux(), db = d1(); const S = kvAvecSecours(kv, db);
  ok(kvAvecSecours(kv, db) === S, '1. un seul enrobage par KV (le mémo des fiches reste valable)');
  await S.put('acc:a', '{"x":1}');
  ok(kv.m.get('acc:a') === '{"x":1}', '1b. l\'écriture va au KV');
  await S.get('rien:1'); const avant = db.q.length; await S.get('rien:2'); await S.get('rien:3');
  ok(db.q.length === avant, '1c. clé absente : aucune lecture D1 de plus une fois le secours vu vide (' + (db.q.length - avant) + ')');
}
console.log('\n== 2. KV qui refuse : D1 prend le relais ==');
const kv2 = kvFaux(), db2 = d1(); const vus = []; const S2 = kvAvecSecours(kv2, db2, (k) => vus.push(k));
kv2.refuser(true);
await S2.put('acc:b', JSON.stringify({ uid: 'b', attente_admin: true }));
await S2.put('cred:b', 'empreinte');
ok(!kv2.m.has('acc:b') && db2._s.prepare('SELECT COUNT(*) AS n FROM kv_secours').get().n === 2, '2. KV refuse → les 2 écritures sont dans D1');
ok((await S2.get('acc:b', 'json')).attente_admin === true && (await S2.get('cred:b')) === 'empreinte', '2b. relues (json et texte)');
ok(vus.includes('acc:b'), '2c. Kevin est prévenu (journal appelé)', vus);
await S2.put('rl:x', '1', { expirationTtl: 60 });
db2._s.prepare("UPDATE kv_secours SET exp = ? WHERE k = 'rl:x'").run(Date.now() - 1000);
ok((await S2.get('rl:x')) === null, '3. expiration respectée');
await S2.delete('cred:b');
ok((await S2.get('cred:b')) === null, '3b. suppression : partie aussi du secours');
console.log('\n== 4. Le KV revient ==');
kv2.refuser(false);
const v = await S2.get('acc:b'); await attendre();
ok(v && kv2.m.get('acc:b') === v && !db2._s.prepare("SELECT 1 FROM kv_secours WHERE k = 'acc:b'").get(), '4. la fiche est recopiée dans le KV et quitte D1');
await S2.put('acc:c', 'neuf');
ok(kv2.m.get('acc:c') === 'neuf', '4b. les nouvelles écritures retournent au KV');

console.log('\n== 5. Vrai routeur, KV plein : l\'inscription est enregistrée ==');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1';
async function parcours(sansSecours) {
  const kv = kvFaux(); kv.refuser(true); const db = d1(); await schemaCercle(db);
  const env = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: 'x', ACCOUNTS: kv, CERCLE_DB: db, KDMC_VALIDATION_MANUELLE: '1', EMAILJS_PRIVATE_KEY: 'cle' };
  if (sansSecours) env.__kvSecours = true;
  globalThis.fetch = async () => new Response('OK', { status: 200 });
  const r = new Request('https://kd-mc.com/__sso/issue', { method: 'POST', headers: { host: 'kd-mc.com', 'content-type': 'application/json', origin: 'https://kd-mc.com', 'user-agent': UA, 'cf-connecting-ip': '203.0.113.9' },
    body: JSON.stringify({ uid: 'eve-test', name: 'Eve Test', cgu: true, cgu_clic: true, code: '24681357', telephone: '+377 06 12 34 77', email: 'eve@example.com' }) });
  Object.defineProperty(r, 'cf', { value: { asn: 6758, city: 'Monaco', country: 'MC' } });
  const fond = []; const ctx = { waitUntil(p) { fond.push(p); } };
  const j = await (await mod.fetch(r, env, ctx)).json(); await Promise.all(fond);
  const who = async (host) => (await mod.fetch(new Request('https://' + host + '/__sso/whoami', { headers: { host, authorization: 'Bearer ' + j.token, 'user-agent': UA } }), env, { waitUntil() {} })).json();
  const lu = await kvAvecSecours(kv, db).get('acc:eve-test', 'json');
  const pg = await mod.fetch(new Request('https://cmcteams.kd-mc.com/', { headers: { host: 'cmcteams.kd-mc.com', authorization: 'Bearer ' + j.token, 'sec-fetch-dest': 'document', accept: 'text/html', 'user-agent': UA } }), env, { waitUntil() {} });
  return { j, fiche: lu, portail: await who('kd-mc.com'), app: await who('cmcteams.kd-mc.com'), page: await pg.text() };
}
{
  const { j, fiche, portail, app, page } = await parcours(false);
  ok(j.ok === true && j.attente_admin === true && j.mail_envoye, '5. inscription acceptée, mail parti', j);
  ok(fiche && fiche.attente_admin === true && fiche.mail_confirmation && fiche.name === 'Eve Test', '5b. la fiche EST enregistrée (dans le secours), avec l\'attente du mail', fiche && { a: fiche.attente_admin, mc: !!fiche.mail_confirmation });
  ok(portail.ok === true && portail.mail_attente, '5c. le portail voit le compte et l\'attente du mail', portail);
  ok(app.ok === false && app.reason === 'attente_admin', '5d. CMCteams : « confirme ton mail » (et plus « se crée »)', app);
  ok(/touche le lien du mail/.test(page) && !/Demande à l.administrateur/.test(page), '5e. la PAGE CMCteams dit de toucher le lien du mail (avant : « demande à l\'administrateur »)', page.slice(0, 200));
}
console.log('\n== 6. Sabotage : sans secours, rien n\'est enregistré ==');
{
  const { fiche, app } = await parcours(true);
  ok(!fiche && app.reason !== 'attente_admin', '6. sans le secours : aucune fiche, CMCteams ne sait pas pourquoi → la garde 5 est discriminante', { fiche: !!fiche, raison: app.reason });
}
console.log('\n== 7. Le KV garde une ANCIENNE valeur : le secours (plus récent) l\'emporte ==');
{
  const kv = kvFaux(), db = d1(); const S = kvAvecSecours(kv, db);
  kv.m.set('aud:log', JSON.stringify([{ ts: 1, ev: 'vieux' }]));        /* copie d'avant le plafond, restée dans le KV */
  kv.refuser(true);
  await S.put('aud:log', JSON.stringify([{ ts: 2, ev: 'neuf' }, { ts: 1, ev: 'vieux' }]));
  const lu = await S.get('aud:log', 'json');
  ok(Array.isArray(lu) && lu[0].ev === 'neuf' && lu.length === 2, '7. KV refuse, vieille copie dans le KV : la lecture rend la valeur du SECOURS, pas la vieille', lu);
  kv.refuser(false); await S.get('aud:log'); await attendre();
  ok(JSON.parse(kv.m.get('aud:log'))[0].ev === 'neuf' && !db._s.prepare("SELECT 1 FROM kv_secours WHERE k = 'aud:log'").get(), '7b. le KV revenu reçoit la valeur récente et la ligne D1 part');
}
console.log('\n== 8. VRAI routeur, KV plein + vieux journal : chaque alerte s\'ajoute (Kevin 17.10 « Adelli m\'a envoyé un message, je ne reçois rien ») ==');
{
  const kv = kvFaux(), db = d1(); await schemaCercle(db);
  kv.m.set('aud:log', JSON.stringify([{ ts: 1, ev: 'vieux_evenement' }]));
  kv.refuser(true);
  const env = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: 'x', ACCOUNTS: kv, CERCLE_DB: db, KDMC_VALIDATION_MANUELLE: '1', EMAILJS_PRIVATE_KEY: 'cle' };
  globalThis.fetch = async () => new Response('OK', { status: 200 });
  const ctx = () => ({ waitUntil() {} });
  const sess = await ssoSign(env.KDMC_SSO_SECRET, 'adelli-test', 'Test Adelli', true, true, true);
  for (const [nom, texte] of [['Alice T', 'demande 1'], ['Bruno T', 'demande 2'], ['Chloé T', 'demande 3']]) {
    const r = await mod.fetch(new Request('https://cmcteams-light.kd-mc.com/__notify-kevin', { method: 'POST', headers: { host: 'cmcteams-light.kd-mc.com', 'content-type': 'application/json', authorization: 'Bearer ' + sess }, body: JSON.stringify({ kind: 'demande_chef', name: nom, text: texte }) }), env, ctx());
    ok(r.status === 200, '8. demande de chef de ' + nom + ' acceptée (' + r.status + ')');
  }
  const log = await kvAvecSecours(kv, db).get('aud:log', 'json');
  const noms = (log || []).filter((e) => e.type === 'demande_chef').map((e) => e.name).sort();
  ok(noms.join() === 'Alice T,Bruno T,Chloé T' && log.some((e) => e.ev === 'vieux_evenement'), '8b. les TROIS demandes sont dans le journal (avant : seule la dernière survivait), l\'ancien événement aussi', log);
}
console.log(`\n${pass} ✅ / ${fail} ❌\n`);
process.exit(fail ? 1 : 0);
