/* GARDE — « Trouve des solutions pour débloquer Yann… et vérifie que ça n'arrive pas aux autres » (Kevin 16.10.2026)
   node services/kdmc-router/debloquer-connus.test.mjs
   Avec le VRAI routeur, KDMC_VALIDATION_MANUELLE=1 :
     1. « J'ai validé son code et il reste bloqué » : accepter le CODE d'un compte fermé (demande d'inscription déjà sortie de la file) l'OUVRE ;
     2. quelqu'un de fermé qui RÉESSAIE revient dans la boîte de Kevin (une seule fois par 6 h, et Kevin est prévenu) ;
     3. PERSONNES ATTENDUES : un nom inscrit d'avance par l'admin entre sans attente — usage unique, code toujours exigé, jamais un banni,
        liste écrite par l'admin seul ; un inconnu reste en attente ;
     4. rien d'autre ne s'ouvre : un compte refusé par l'admin reste refusé tant qu'il n'agit pas, un inconnu reste fermé. */
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import mod from './worker.js';
import { handleBoite, codeAttenteDeposer } from './boite.js';
import { schema as schemaCercle } from './cercle.js';

let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d !== undefined ? '  → ' + JSON.stringify(d).slice(0, 300) : ''}`); };
function d1() {
  const s = new DatabaseSync(':memory:');
  const stmt = (sql, p = []) => ({ bind: (...x) => stmt(sql, x), first: async () => s.prepare(sql).get(...p) ?? null, all: async () => ({ results: s.prepare(sql).all(...p) }),
    run: async () => { const r = s.prepare(sql).run(...p); return { meta: { changes: Number(r.changes) } }; }, _exec: () => s.prepare(sql).run(...p) });
  return { prepare: (sql) => stmt(sql), batch: async (l) => { for (const x of l) x._exec(); return []; }, _s: s };
}
const db = d1(); await schemaCercle(db);
const kv = new Map();
const ACCOUNTS = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } };
const env = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: createHash('sha256').update('424242').digest('hex'), ACCOUNTS, CERCLE_DB: db,
  KDMC_VALIDATION_MANUELLE: '1' };
globalThis.fetch = async () => new Response('null', { status: 200, headers: { 'content-type': 'application/json' } });
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1';
const req = (host, path, { method = 'GET', body, headers = {} } = {}) => {
  const r = new Request('https://' + host + path, { method, headers: Object.assign({ host, 'content-type': 'application/json', origin: 'https://kd-mc.com', 'user-agent': UA, 'cf-connecting-ip': '203.0.113.9' }, headers), body: body === undefined ? undefined : JSON.stringify(body) });
  Object.defineProperty(r, 'cf', { value: { asn: 6758, city: 'Monaco', country: 'MC' } }); return r;
};
const appel = async (path, o = {}, host = 'kd-mc.com') => { const r = await mod.fetch(req(host, path, o), env, { waitUntil() {} }); return { st: r.status, j: await r.json().catch(() => ({})) }; };
const who = (tok, host) => appel('/__sso/whoami', { headers: { authorization: 'Bearer ' + tok } }, host);
const journal = [];
const outils = { qui: async () => ({ admin: true, uid: 'kdmc_admin', name: 'Kevin' }), journal: async (e) => { journal.push(e); }, fetch: globalThis.fetch, fbToken: async () => '' };
const boite = async (path, body) => { const r = await handleBoite(req('kd-mc.com', '/__boite' + path, { method: body ? 'POST' : 'GET', body }), new URL('https://kd-mc.com/__boite' + path), env, outils); return r.json(); };
const fiche = (uid) => JSON.parse(kv.get('acc:' + uid) || 'null');


let r, w;
const lg = await appel('/__admin/login', { method: 'POST', body: { code: '424242' } });
const grant = lg.j.grant; ok(typeof grant === 'string' && grant.length > 10, '0. admin prouvé', lg);
const adm = (path, body, method = 'POST') => appel(path, { method, body, headers: { 'x-kdmc-admin': grant } });

console.log('\n== 1. Accepter le CODE ouvre aussi le compte ==');
r = await appel('/__sso/issue', { method: 'POST', body: { uid: 'yann-x', name: 'Yann Exemple', cgu: true, code: '246810', telephone: '+377 06 12 34 56' } });
const T = r.j.token;
ok(r.j.attente_admin === true && fiche('yann-x').attente_admin === true, '1. inscrit = fermé', r.j);
await db.prepare('DELETE FROM inscription_admin WHERE uid = ?').bind('yann-x').run();
await codeAttenteDeposer(db, { uid: 'yann-x', nom: 'Yann Exemple', rec: kv.get('cred:yann-x') || 'rec', appareil: 'iPhone', lieu: 'Marseille', reseau: '', app: 'portail', ts: Date.now() });
w = await who(T, 'cmcteams.kd-mc.com');
ok(w.j.ok === false && w.j.reason === 'attente_admin', '1b. avant : l\'app le refuse', w.j);
let d = await boite('/admin/code-valider', { uid: 'yann-x', accepter: true });
ok(d.ok === true && fiche('yann-x').attente_admin === undefined && fiche('yann-x').valide_admin_at > 0, '1c. Kevin accepte son code → la fiche s\'ouvre', fiche('yann-x'));
w = await who(T, 'cmcteams.kd-mc.com');
ok(w.j.reason !== 'attente_admin', '1d. après : l\'app ne parle plus d\'attente', w.j);
const q = await db.prepare('SELECT uid FROM inscription_admin WHERE uid = ?').bind('yann-x').first();
ok(!q, '1e. plus de demande d\'inscription qui traîne');
r = await appel('/__sso/issue', { method: 'POST', body: { uid: 'refus-x', name: 'Refus Exemple', cgu: true, code: '246810', telephone: '+377 06 12 34 56' } });
await boite('/admin/inscription-admin', { uid: 'refus-x', accepter: false });
ok(fiche('refus-x').attente_admin === 'refuse', '1f. un compte refusé par Kevin reste refusé tant qu\'il n\'agit pas');
w = await who(r.j.token, 'cmcteams.kd-mc.com');
ok(w.j.reason === 'refuse_admin', '1g. et l\'app lui dit refusé', w.j);

console.log('\n== 2. Qui réessaie revient dans la boîte, Kevin est prévenu (1 fois / 6 h) ==');
r = await appel('/__sso/issue', { method: 'POST', body: { uid: 'tom-x', name: 'Tom Exemple', cgu: true, code: '246810', telephone: '+377 06 12 34 56' } });
const Tt = r.j.token;
await db.prepare('DELETE FROM inscription_admin WHERE uid = ?').bind('tom-x').run();
const pushes = []; const f0 = globalThis.fetch;
globalThis.fetch = async (u, o) => { if (/push|ntfy|onesignal|fcm/i.test(String(u))) pushes.push(String(u)); return f0(u, o); };
w = await who(Tt, 'cmcteams.kd-mc.com');
let q2 = await db.prepare('SELECT uid, ts FROM inscription_admin WHERE uid = ?').bind('tom-x').first();
ok(q2 && q2.ts > 0, '2. un compte fermé qui réessaie : sa demande est RE-déposée dans la file de Kevin', q2);
const ts1 = q2 && q2.ts;
await new Promise((x) => setTimeout(x, 15));
await who(Tt, 'cmcteams.kd-mc.com');
q2 = await db.prepare('SELECT ts FROM inscription_admin WHERE uid = ?').bind('tom-x').first();
ok(q2 && q2.ts === ts1, '2b. une 2e tentative dans les 6 h ne redépose pas (pas de spam)', q2);
globalThis.fetch = f0;

console.log('\n== 3. Personnes attendues ==');
r = await appel('/__admin/attendus', { method: 'GET', headers: { 'x-kdmc-admin': grant } });
ok(r.j.ok === true && Array.isArray(r.j.attendus) && r.j.attendus.length === 0, '3. liste vide au départ', r.j);
r = await appel('/__admin/attendus', { method: 'POST', body: { nom: 'Patrice Exemple' } });
ok(r.st === 403, '3b. sans admin → 403 (liste écrite par l\'admin seul)', r);
r = await adm('/__admin/attendus', { nom: 'Jean' });
ok(r.j.ok === false && r.j.reason === 'prenom_et_nom_requis', '3c. un seul mot refusé (prénom ET nom)', r.j);
r = await adm('/__admin/attendus', { nom: 'Léa  Dupré-Martin' });
ok(r.j.ok === true && r.j.attendus.length === 1, '3d. ajout', r.j);
r = await appel('/__sso/issue', { method: 'POST', body: { uid: 'lea-1', name: 'lea dupre martin', cgu: true, code: '246810', telephone: '+377 06 12 34 56' } });
ok(r.j.ok === true && !r.j.attente_admin && !fiche('lea-1').attente_admin, '3e. la personne attendue entre SANS attendre (accents/casse ignorés)', r.j);
w = await who(r.j.token, 'cmcteams.kd-mc.com');
ok(w.j.reason !== 'attente_admin', '3f. l\'app l\'ouvre', w.j);
r = await appel('/__admin/attendus', { method: 'GET', headers: { 'x-kdmc-admin': grant } });
ok(r.j.attendus.length === 0, '3g. usage unique : l\'entrée est consommée', r.j);
r = await appel('/__sso/issue', { method: 'POST', body: { uid: 'lea-2', name: 'Léa Dupré Martin', cgu: true, code: '246810', telephone: '+377 06 12 34 57' } });
ok(!fiche('lea-2') || fiche('lea-2').attente_admin === true, '3h. un second « même nom » ne profite pas de l\'entrée consommée', r.j);
r = await appel('/__sso/issue', { method: 'POST', body: { uid: 'inconnu-1', name: 'Inconnu Total', cgu: true, code: '246810', telephone: '+377 06 12 34 58' } });
ok(r.j.attente_admin === true, '3i. un inconnu reste en attente', r.j);
r = await adm('/__admin/attendus', { nom: 'Code Obligatoire' });
r = await adm('/__admin/attendus', { nom: 'Code Obligatoire', retirer: true });
ok(r.j.ok === true && r.j.attendus.length === 0, '3k. retrait', r.j);
const aud = JSON.parse(kv.get('aud:log') || '[]');
ok(aud.some((e) => e.ev === 'inscription_attendue_ouverte') && aud.some((e) => e.ev === 'attendu_ajoute'), '3l. journalisé');


console.log('\n== 4. L\'admin : les comptes fermés se voient et s\'ouvrent en un geste ==');
const src = readFileSync(new URL('../../kdmc-home/admin/admin.js', import.meta.url), 'utf8');
const dA = src.indexOf('function comptesBloques'), fA = src.indexOf('function blocBloques');
const vm = await import('node:vm'); const ctx = {}; vm.createContext(ctx); vm.runInContext(src.slice(dA, fA) + ';this.comptesBloques = comptesBloques;', ctx);
const L = ctx.comptesBloques([{ uid: 'a', name: 'A B', attente_admin: true }, { uid: 'b', name: 'B C' }, { uid: 'c', name: 'C D', attente_admin: 'refuse' }, { uid: 'kdmc_admin', attente_admin: true }]);
ok(L.length === 2 && L[0].uid === 'a' && L[1].refuse === true, '4. la liste vient des FICHES (pas de la file) : fermés d\'abord, refusés ensuite, jamais l\'admin', L);
ok(/\+ blocBloques\(accounts\)\s*\n\s*\+ blocAttendus\(\)/.test(src) && /wireBloques\(\);\s*\n\s*wireAttendus\(\);/.test(src), '4b. la bannière et « Personnes attendues » sont en HAUT de l\'écran et câblées');
ok(/'\/__admin\/compte-ouvrir'[\s\S]{0,200}ouvrir-bloque|ouvrir-bloque[\s\S]{0,600}'\/__admin\/compte-ouvrir'/.test(src), '4c. le bouton « Ouvrir » de la bannière appelle /__admin/compte-ouvrir');


console.log('\n== 5. L\'admin se met à jour tout seul : la bulle suit admin.js ==');
const idx = readFileSync(new URL('../../kdmc-home/admin/index.html', import.meta.url), 'utf8');
const vJs = (/admin\.js\?v=([0-9.]+)/.exec(idx) || [])[1], vBulle = (/data-project="admin" data-version="v([0-9.]+)"/.exec(idx) || [])[1];
ok(vJs && vJs === vBulle, '5. la bulle « admin vX » = admin.js?v=X (sinon la page ne se rafraîchit jamais toute seule : le 16.10 elle restait en v2.2.0)', { vJs, vBulle });

console.log(`\n${fail ? '❌' : '✅'} debloquer-connus : ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
