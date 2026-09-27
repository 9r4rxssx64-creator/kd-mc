/* CODE DU COMPTE VÉRIFIÉ PAR LE DOMAINE — « un compte + un code, partout, reconnu auto »
   Kevin 27.09.2026 : « Lorsqu'une personne crée son compte et code dans le domaine ou une app,
   il peut se connecter aux autres apps du domaine avec les mêmes. Reconnu auto. »
   Mesuré avant (lecture du code, inventaire des 20 apps) : le code n'existait que dans le
   téléphone ; sur un appareil neuf, taper un NOM suffisait pour recevoir la session de cette
   personne, et le même nom + code ne marchait nulle part ailleurs.
   Ce test passe par le VRAI routeur (worker.js) et un registre KV simulé.
   Prouvé discriminant : sans le contrôle `code_requis` → contrôle 3 échoue ; sans /__sso/login
   → 5 à 8 échouent ; en posant le code d'un compte existant depuis un appareil inconnu → 11 échoue.
   node services/kdmc-router/code-compte.test.mjs */
import mod from './worker.js';
import { createHash, createHmac } from 'crypto';

const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const signe = (uid, v) => { const p = b64u(JSON.stringify({ u: uid, n: uid, c: 1, v: v ? 1 : 0, iat: Date.now(), exp: Date.now() + 1e9 })); return p + '.' + b64u(createHmac('sha256', 'sec').update(p).digest()); };
const kv = new Map();
const ACCOUNTS = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } };
const env = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: createHash('sha256').update('424242').digest('hex'), ACCOUNTS };
globalThis.fetch = async () => new Response('CONTENU', { status: 200, headers: { 'content-type': 'text/html' } });

let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };
const post = (host, path, body, headers) => mod.fetch(new Request('https://' + host + path, {
  method: 'POST', headers: Object.assign({ 'content-type': 'application/json', origin: 'https://' + host }, headers || {}), body: JSON.stringify(body),
}), env, { waitUntil() {} });
const whoami = async (host, token) => (await mod.fetch(new Request('https://' + host + '/__sso/whoami', { headers: { authorization: 'Bearer ' + token } }), env, { waitUntil() {} })).json();
const issue = async (body, headers) => { const r = await post('kd-mc.com', '/__sso/issue', body, headers); return { st: r.status, j: await r.json() }; };
const login = async (body, host) => { const r = await post(host || 'kd-mc.com', '/__sso/login', body); return { st: r.status, j: await r.json() }; };

console.log('\nCompte unique : un nom + un code, vérifiés par le domaine, reconnus partout\n');

/* 1-2. Création d'un compte avec son code */
let r = await issue({ uid: 'marie-curie', name: 'Marie Curie', cgu: true, code: '314159' });
ok(r.j.ok === true && r.j.code === true, '1. création d\'un compte avec son code → session + code enregistré au domaine', JSON.stringify(r.j));
const cred = kv.get('cred:marie-curie') || '';
ok(cred && !cred.includes('314159') && /"h":"[0-9a-f]{64}"/.test(cred), '2. le domaine garde une EMPREINTE (PBKDF2), jamais le code', cred.slice(0, 80));

/* 3-4. Usurpation par le nom : fermée */
r = await issue({ uid: 'marie-curie', name: 'Marie Curie', cgu: true });
ok(r.st === 401 && r.j.reason === 'code_requis', '3. un inconnu qui tape juste « Marie Curie » ne reçoit PLUS sa session', `${r.st} ${r.j.reason}`);
r = await issue({ uid: 'marie-curie', name: 'Marie Curie', cgu: true, code: '000000' });
ok(r.st === 401 && r.j.reason === 'code_incorrect', '4. avec un mauvais code → refusé', `${r.st} ${r.j.reason}`);

/* 5-8. Appareil neuf / autre app : nom + code */
r = await login({ name: 'Marie Curie', code: '314159' });
ok(r.j.ok === true && r.j.uid === 'marie-curie' && !!r.j.token, '5. appareil NEUF : nom + code → la session de son compte', JSON.stringify(r.j).slice(0, 120));
const tok = r.j.token;
{ const w = await whoami('cuisine.kd-mc.com', tok);
  ok(w.ok === true && (await whoami('lingua.kd-mc.com', tok)).ok === true && w.code === true && w.admin === false && w.verified === false,
    '6. reconnue AUTOMATIQUEMENT dans les autres apps (cuisine, Lingua) ; elles voient « code prouvé » (jamais admin)', JSON.stringify(w)); }
{ const w = await whoami('cuisine.kd-mc.com', signe('marie-curie', 0));
  ok(w.ok === true && w.code === false, '6 bis. une session SANS code prouvé est marquée comme telle (les apps peuvent faire la différence)', JSON.stringify(w)); }
r = await login({ name: 'curie marie', code: '314159' }, 'cuisine.kd-mc.com');
ok(r.j.ok === true && r.j.uid === 'marie-curie', '7. nom dans l\'autre sens, depuis une autre app → même compte', JSON.stringify(r.j).slice(0, 100));
const faux = await login({ name: 'Marie Curie', code: '999999' });
const inconnu = await login({ name: 'Personne Inconnue', code: '314159' });
ok(faux.st === 401 && inconnu.st === 401 && faux.j.message === inconnu.j.message,
  '8. mauvais code et nom inconnu → même refus (on ne confirme pas qu\'un nom existe)');

/* 9-10. Essais limités, fermé en cas de doute */
for (let i = 0; i < 5; i++) await login({ name: 'Marie Curie', code: '11111' + i });
r = await login({ name: 'Marie Curie', code: '314159' });
ok(r.st === 429 && r.j.reason === 'trop_essais', '9. après 5 mauvais codes, même le BON est refusé un moment (anti-devinette)', `${r.st} ${r.j.reason}`);
{
  const casse = { ...env, ACCOUNTS: { ...ACCOUNTS, get: async (k) => { if (String(k).startsWith('rlc:')) throw new Error('KV'); return ACCOUNTS.get(k); } } };
  const rr = await mod.fetch(new Request('https://kd-mc.com/__sso/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://kd-mc.com' }, body: JSON.stringify({ name: 'Marie Curie', code: '314159' }) }), casse, { waitUntil() {} });
  ok(rr.status === 429, '10. registre des essais illisible → on REFUSE d\'essayer (fermé, pas ouvert)', String(rr.status));
}

/* 11-12. Comptes d'avant le 27.09 (code seulement dans le téléphone) */
kv.set('acc:paul-ancien', JSON.stringify({ uid: 'paul-ancien', name: 'Paul Ancien' }));
kv.set('nm:paul ancien', 'paul-ancien');
r = await issue({ uid: 'paul-ancien', name: 'Paul Ancien', cgu: true, code: '222222' });
ok(r.j.ok === true && r.j.code === false && !kv.has('cred:paul-ancien'),
  '11. compte ancien, appareil INCONNU → session comme avant, mais le code n\'est PAS enregistré (sinon un inconnu enfermerait le vrai propriétaire dehors)', JSON.stringify(r.j).slice(0, 100));
r = await issue({ uid: 'paul-ancien', name: 'Paul Ancien', cgu: true, code: '222222' }, { authorization: 'Bearer ' + signe('paul-ancien', 0) });
ok(r.j.code === true && kv.has('cred:paul-ancien'), '12. le même, depuis SON appareil (sa session) → son code est enregistré au domaine (migration douce)');

/* 13. Identité admin : jamais de code ici (Face ID + code admin) */
r = await issue({ uid: 'kevin-desarzens', name: 'Kevin Desarzens', cgu: true, code: '123456' });
ok(![...kv.keys()].some((k) => k === 'cred:kdmc_admin'), '13. l\'identité admin n\'a JAMAIS de code enregistré ici (le code admin ne s\'écrit nulle part)');

/* 14-15. Code oublié : seul l'admin efface */
r = { st: (await post('kd-mc.com', '/__admin/code', { uid: 'marie-curie' })).status };
ok(r.st === 403 && kv.has('cred:marie-curie'), '14. sans le code admin, personne ne peut effacer le code d\'un autre', String(r.st));
const rr = await post('kd-mc.com', '/__admin/code', { uid: 'marie-curie' }, { 'x-kdmc-admin': signe('__kdmc_admin__', 1) });
ok((await rr.json()).ok === true && !kv.has('cred:marie-curie'), '15. l\'admin efface le code oublié → la personne en choisit un nouveau');

console.log(`\n${pass} OK / ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
