/* GARDE — la création de compte n'écrit chaque clé KV qu'UNE fois (17.10.2026, mesuré en réel : 7,2 s côté serveur)
   node services/kdmc-router/lot-kv.test.mjs

   Le KV de Cloudflare refuse (429) une 2ᵉ écriture sur la même clé dans la même seconde ; `accPut` avale l'erreur → donnée PERDUE.
   Ici un faux KV FIDÈLE à cette règle (il jette « KV PUT failed: 429 » comme le vrai) :
     1. briques : tampon (dernière valeur gagne), lecture du tampon (texte / json), suppression, écriture unique au vider ;
     1e. après vider : la fiche, le code et le nom sont relus une fois (le cache du lieu gardait « absent » ~60 s, mesuré en réel) ;
     2. après vider : une écriture en fond attend la fin de la seconde (jamais de 429) ;
     3. VRAI routeur, inscription complète (e-mail + téléphone, validation par mail) : aucun 429, chaque clé écrite une fois,
        et la fiche contient TOUT (nom, cgu, téléphone, attente, mail_confirmation, e-mail) ;
     5. fiche pas encore lisible juste après la création (KV en retard) : pass tout neuf FERMÉ dans les apps (avant : « sans fiche » = ouvert) ;
     6. KV qui refuse toute écriture (plafond du jour) : le pass d'un compte en attente porte w=1 → fermé à tout âge ;
     4. sabotage : sans le lot, le même parcours prend des 429 et la fiche perd des champs → la garde est discriminante. */
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { lotKV } from './lot-kv.js';
import { schema as schemaCercle } from './cercle.js';
import mod from './worker.js';

let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d !== undefined ? '  → ' + JSON.stringify(d).slice(0, 300) : ''}`); };
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1';
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
  {
    const G = kvFidele(); const lus = []; const get0 = G.kv.get; G.kv.get = async (k, t) => { lus.push(k); return get0(k, t); };
    const lot2 = lotKV({ ACCOUNTS: G.kv }); await lot2.env.ACCOUNTS.put('acc:z', '{}'); await lot2.env.ACCOUNTS.put('cred:z', '{}'); await lot2.env.ACCOUNTS.put('aud:log', '[]');
    await lot2.vider();
    ok(lus.includes('acc:z') && lus.includes('cred:z') && !lus.includes('aud:log'), '1e. après vider : relecture de la fiche et du code (rafraîchit le cache du lieu), pas du journal', lus);
  }
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
  const r = new Request('https://kd-mc.com/__sso/issue', { method: 'POST', headers: { host: 'kd-mc.com', 'content-type': 'application/json', origin: 'https://kd-mc.com', 'user-agent': UA, 'cf-connecting-ip': '203.0.113.9' },
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
console.log('\n== 5. Fiche pas encore lisible (KV en retard) juste après la création : FERMÉ dans les apps ==');
{
  const { F, j } = await inscrire(false);
  const db = d1(); await schemaCercle(db);
  const sansFiche = new Map([...F.m].filter(([k]) => !k.startsWith('acc:')));   // le lieu voit encore « introuvable »
  const kvRetard = { get: async (k) => (sansFiche.has(k) ? sansFiche.get(k) : null), put: async () => {}, delete: async () => {}, list: async () => ({ keys: [], list_complete: true }) };
  const envR = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: 'x', ACCOUNTS: kvRetard, CERCLE_DB: db };
  const who = async (host, tok) => { const r = new Request('https://' + host + '/__sso/whoami', { headers: { host, authorization: 'Bearer ' + tok, origin: 'https://' + host, 'user-agent': UA } }); return (await mod.fetch(r, envR, { waitUntil() {} })).json(); };
  const w = await who('cmcteams.kd-mc.com', j.token);
  ok(w.ok === false && w.reason === 'en_creation', '5. pass tout neuf, fiche introuvable : CMCteams fermé (en_creation)', w);
  const wp = await who('kd-mc.com', j.token);
  ok(wp.reason !== 'en_creation', '5b. le portail (réception) ne parle pas de création', wp);
  const page = await mod.fetch(new Request('https://cmcteams.kd-mc.com/', { headers: { host: 'cmcteams.kd-mc.com', authorization: 'Bearer ' + j.token, 'sec-fetch-dest': 'document', accept: 'text/html', 'user-agent': UA } }), envR, { waitUntil() {} });
  const html = await page.text();
  ok(/se crée/.test(html), '5c. la page de l\'app ne s\'ouvre pas (porte « se crée »)', { st: page.status, porte: page.headers.get('x-kdmc-porte'), debut: html.slice(0, 200) });
  const { ficheEnCreation } = await import('./worker.js');
  const payload = JSON.parse(Buffer.from(j.token.split('.')[0], 'base64url').toString());
  ok(ficheEnCreation(null, { uid: payload.u, iat: payload.iat }) === true && ficheEnCreation(null, { uid: payload.u, iat: payload.iat }, payload.iat + 3 * 60e3) === false, '5d. une session de plus de 2 min sans fiche garde le comportement d\'avant');
  const ecritsRetard = []; kvRetard.put = async (k) => { ecritsRetard.push(k); };
  await who('kd-mc.com', j.token);
  await mod.fetch(new Request('https://kd-mc.com/', { headers: { host: 'kd-mc.com', authorization: 'Bearer ' + j.token, 'sec-fetch-dest': 'document', accept: 'text/html', 'user-agent': UA } }), envR, { waitUntil() {} });
  ok(!ecritsRetard.some((k) => k.startsWith('acc:')), '5f. portail pendant le retard : AUCUNE fiche neuve écrite par-dessus la vraie (avant : fiche recréée sans attente → compte ouvert)', ecritsRetard);
  ok(ficheEnCreation(null, { uid: 'ci_smoke', iat: Date.now() }) === false && ficheEnCreation({ uid: 'x' }, { uid: 'x', iat: Date.now() }) === false, '5e. robot de contrôle et fiche lisible : non concernés');
}
console.log('\n== 6. KV qui refuse TOUTE écriture (plafond du jour) : le pass dit « en attente », fermé à tout âge ==');
{
  const db = d1(); await schemaCercle(db);
  const plein = { get: async () => null, put: async () => { throw new Error('KV PUT failed: free usage limit for this operation for today [code: 10048]'); }, delete: async () => {}, list: async () => ({ keys: [], list_complete: true }) };
  const envP = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: 'x', ACCOUNTS: plein, CERCLE_DB: db, KDMC_VALIDATION_MANUELLE: '1', EMAILJS_PRIVATE_KEY: 'cle', __kvSecours: true };   // le pire cas : KV ET secours D1 indisponibles (le secours a sa garde : kv-secours.test.mjs)
  globalThis.fetch = async () => new Response('OK', { status: 200 });
  const r = new Request('https://kd-mc.com/__sso/issue', { method: 'POST', headers: { host: 'kd-mc.com', 'content-type': 'application/json', origin: 'https://kd-mc.com', 'user-agent': UA, 'cf-connecting-ip': '203.0.113.9' },
    body: JSON.stringify({ uid: 'zed-test', name: 'Zed Test', cgu: true, cgu_clic: true, code: '24681357', telephone: '+377 06 12 34 99', email: 'zed@example.com' }) });
  Object.defineProperty(r, 'cf', { value: { asn: 6758, city: 'Monaco', country: 'MC' } });
  const pushs = []; envP.KDMC_PUSH_URL = 'https://push.x'; envP.KDMC_PUSH_TOKEN = 't'; const fond = [];
  globalThis.fetch = async (u, init) => { if (String(u).startsWith('https://push.x')) pushs.push(JSON.parse(init.body).payload); return new Response('OK', { status: 200 }); };
  const j = await (await mod.fetch(r, envP, { waitUntil(p) { fond.push(p); } })).json(); await Promise.all(fond);
  const pl = j.token ? JSON.parse(Buffer.from(j.token.split('.')[0], 'base64url').toString()) : {};
  ok(j.attente_admin === true && pl.w === 1, '6. inscription en attente : le pass porte w=1', { attente: j.attente_admin, w: pl.w });
  const w = await (await mod.fetch(new Request('https://cmcteams.kd-mc.com/__sso/whoami', { headers: { host: 'cmcteams.kd-mc.com', authorization: 'Bearer ' + j.token, 'user-agent': UA } }), envP, { waitUntil() {} })).json();
  ok(w.ok === false && w.reason === 'en_creation', '6b. fiche jamais écrite : CMCteams fermé', w);
  ok(pushs.some((x) => /stockage des comptes refusé/.test(x.title)), '6e. Kevin est prévenu que le stockage a refusé l\'inscription', pushs.map((x) => x.title));
  const { ficheEnCreation } = await import('./worker.js');
  ok(ficheEnCreation(null, { uid: pl.u, iat: pl.iat, attente: true }, pl.iat + 24 * 3600e3) === true, '6c. 24 h plus tard, toujours fermé (avant : ouvert après 2 min)');
  ok(ficheEnCreation(null, { uid: pl.u, iat: pl.iat, attente: false }, pl.iat + 24 * 3600e3) === false, '6d. un pass SANS marque garde le comportement d\'avant');
}
console.log(`\n${pass} ✅ / ${fail} ❌\n`);
process.exit(fail ? 1 : 0);
