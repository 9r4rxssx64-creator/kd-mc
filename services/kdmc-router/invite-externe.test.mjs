/* COMPTE INVITÉ — Kevin 13.10.2026 : « créer un compte pour une personne qui ne fera peut-être pas partie du casino, mais à qui je donne accès au
   planning, aux départs, à MC Lite, à CMC Teams… tout le domaine public, sauf les admins. Nom, prénom, code ; la personne se connecte, accepte une
   seule fois, puis entre dans l'app de son choix. »
   Vrai routeur (worker.js) + KV simulé. Prouvé discriminant : sans la dispense `externe` de /__dep/membre → 8 échoue ; sans `externe` dans la fiche → 7 et 9 échouent ;
   sans la porte `tel_a_confirmer` de whoami → 17 échoue ; sans la barrière admin → 1 échoue ; sans le refus du nom admin → 5 échoue.
   node services/kdmc-router/invite-externe.test.mjs */
import { createHash } from 'crypto';
import { signePreuve } from './tel-inscription.js';
import fs from 'node:fs';

const SAB = process.env.SABOTAGE === '1';
/* SABOTAGE=1 : une copie du routeur SANS la dispense « invité » (/__dep/membre) ni le drapeau `externe` sur la fiche — les contrôles doivent rougir */
let mod;
if (SAB) {
  const tmp = new URL('./worker-sabotage.tmp.mjs', import.meta.url);
  fs.writeFileSync(tmp, fs.readFileSync(new URL('./worker.js', import.meta.url), 'utf8')
    .replace('fiche.externe === true && !revoked', 'false && !revoked').replace('if (!estAdmin && acc && acc.tel_requis && !acc.tel) {', 'if (false) {').replace('portee: \'domaine\', acces: [], bloque: [], externe: true,', 'portee: \'domaine\', acces: [], bloque: [],'));
  try { mod = (await import(tmp.href)).default; } finally { fs.unlinkSync(tmp); }
} else mod = (await import('./worker.js')).default;
const kv = new Map();
const ACCOUNTS = { get: async (k, t) => (t === 'arrayBuffer' ? null : (kv.has(k) ? kv.get(k) : null)), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } };
const env = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: createHash('sha256').update('424242').digest('hex'), ACCOUNTS };
globalThis.fetch = async () => new Response('CONTENU', { status: 200, headers: { 'content-type': 'text/html' } });
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };
const req = (host, path, o = {}) => new Request('https://' + host + path, { method: o.method || 'GET', headers: Object.assign({ host, origin: 'https://' + host, 'content-type': 'application/json' }, o.headers || {}), body: o.body });
const appel = async (host, path, o) => { const r = await mod.fetch(req(host, path, o), env, { waitUntil() {} }); return Object.assign(await r.json(), { _st: r.status }); };
const vu = (token, host) => appel(host, '/__sso/whoami', { headers: { authorization: 'Bearer ' + token } });

console.log('\nCompte invité : créé par Kevin, hors planning, tout le domaine public\n');
const creer = { prenom: 'Zoé', nom: 'Lambert', code: '135790', telephone: '+377 06 12 34 56' };
const sans = await appel('kd-mc.com', '/__admin/compte-invite', { method: 'POST', body: JSON.stringify(creer) });
ok(sans.ok !== true && !kv.has('nm:zoe lambert'), '1. sans preuve admin, personne ne crée un compte invité', JSON.stringify(sans).slice(0, 80));

const rl = await appel('kd-mc.com', '/__admin/login', { method: 'POST', body: JSON.stringify({ code: '424242' }) });
const H = { 'x-kdmc-admin': rl.grant };
let r = await appel('kd-mc.com', '/__admin/compte-invite', { method: 'POST', headers: H, body: JSON.stringify(creer) });
ok(r.ok === true && r.uid === 'zoe-lambert', '2. l\'admin crée le compte (prénom, nom, code)', JSON.stringify(r));
const fiche = JSON.parse(kv.get('acc:zoe-lambert') || 'null');
ok(!!fiche && fiche.externe === true, '2b. la fiche porte le drapeau « invité » (externe)');
ok(!/135790/.test(JSON.stringify([...kv.entries()])), '3. le code n\'est écrit nulle part en clair (ni fiche, ni journal) — seulement son empreinte salée');
ok(!!kv.get('cred:zoe-lambert'), '3b. l\'empreinte du code est rangée');

r = await appel('kd-mc.com', '/__admin/compte-invite', { method: 'POST', headers: H, body: JSON.stringify(creer) });
ok(r._st === 409 && r.reason === 'deja_existe', '4. un nom déjà pris est refusé (409), rien n\'est écrasé');
r = await appel('kd-mc.com', '/__admin/compte-invite', { method: 'POST', headers: H, body: JSON.stringify({ prenom: 'Kevin', nom: 'Desarzens', code: '135790' }) });
ok(r._st === 400 && r.reason === 'nom_reserve', '5. le nom de l\'admin est réservé : impossible d\'en faire un invité');
r = await appel('kd-mc.com', '/__admin/compte-invite', { method: 'POST', headers: H, body: JSON.stringify({ prenom: 'Zoé', nom: 'X', code: '123' }) });
ok(r._st === 400, '5b. un nom d\'une lettre ou un code trop court sont refusés', JSON.stringify(r));

/* première connexion : nom + code, sur un appareil neuf */
const lg = await appel('kd-mc.com', '/__sso/login', { method: 'POST', body: JSON.stringify({ name: 'Zoé Lambert', code: '135790' }) });
const tok = lg.token;
ok(lg.ok === true && !!tok, '6. la personne se connecte avec son nom et son code', JSON.stringify(lg).slice(0, 140));
const w = await vu(tok, 'cmcteams.kd-mc.com');
ok(w.ok === true && w.externe === true && w.cgu === false, '7. CMCteams la reconnaît comme invitée (externe) ; les conditions restent à accepter UNE fois', JSON.stringify(w).slice(0, 200));
ok((await vu(tok, 'cmcteams-light.kd-mc.com')).ok === true && (await vu(tok, 'lingua.kd-mc.com')).ok === true && (await vu(tok, 'chez-lolo.kd-mc.com')).ok === true,
  '7b. et aussi Light, Lingua, Chez Lolo… : tout le domaine public');
ok((await vu(tok, 'arbre.kd-mc.com')).ok === false && (await vu(tok, 'coffre.kd-mc.com')).ok === false && (await vu(tok, 'dashboard.kd-mc.com')).ok === false,
  '7c. mais jamais les apps personnelles de Kevin (arbre, coffre, tableau de bord)');

/* contrôle du planning : un invité n'a ni matricule ni nom dans le planning */
globalThis.fetch = async () => new Response('var PLANNING_SEED={};', { status: 200 });
const m = await appel('cmcteams.kd-mc.com', '/__dep/membre', { method: 'POST', headers: { authorization: 'Bearer ' + tok }, body: JSON.stringify({ matricule: 'U99999', nom: 'Lambert', prenom: 'Zoé' }) });
ok(m.ok === true && m.externe === true, '8. le domaine l\'admet sans matricule SBM ni nom dans le planning', JSON.stringify(m));
const inc = await appel('cmcteams.kd-mc.com', '/__dep/membre', { method: 'POST', body: JSON.stringify({ matricule: 'U99999', nom: 'Inconnu', prenom: 'Quelquun' }) });
ok(inc.ok !== true, '8b. un inconnu sans session reste refusé par le contrôle du planning', JSON.stringify(inc).slice(0, 100));

/* un employé ordinaire n'est pas dispensé */
const ins = await appel('kd-mc.com', '/__sso/issue', { method: 'POST', body: JSON.stringify({ uid: 'paul-durand', name: 'Paul Durand', cgu: true, code: '246810', telephone: '+377 06 12 34 56' }) });
const m2 = await appel('cmcteams.kd-mc.com', '/__dep/membre', { method: 'POST', headers: { authorization: 'Bearer ' + ins.token }, body: JSON.stringify({ matricule: 'U99999', nom: 'Durand', prenom: 'Paul' }) });
ok(m2.ok !== true && m2.externe !== true, '9. un compte ordinaire (non invité) n\'est PAS dispensé : le planning décide', JSON.stringify(m2).slice(0, 100));

/* l'invité ne devient jamais admin et peut être fermé */
ok(w.admin !== true && w.verified !== true, '10. un invité n\'est jamais admin ni « vérifié »');
await appel('kd-mc.com', '/__admin/acces', { method: 'POST', headers: H, body: JSON.stringify({ uid: 'zoe-lambert', portee: 'domaine', bloque: ['lingua'] }) });
ok((await vu(tok, 'lingua.kd-mc.com')).reason === 'bloque_ici', '11. l\'admin peut fermer une app à l\'invité comme à n\'importe qui');


/* ── TÉLÉPHONE OBLIGATOIRE, 2 OPTIONS (Kevin 13.10 : « Tel obligatoire, 2 options possibles ») ── */
console.log('\nTéléphone obligatoire : saisi par Kevin, ou confirmé par la personne (WhatsApp)\n');
r = await appel('kd-mc.com', '/__admin/compte-invite', { method: 'POST', headers: H, body: JSON.stringify({ prenom: 'Hugo', nom: 'Moreau', code: '135790' }) });
ok(r._st === 400 && r.reason === 'telephone_requis', '12. option 1 (saisi) sans numéro : refusé — le téléphone est obligatoire', JSON.stringify(r));
r = await appel('kd-mc.com', '/__admin/compte-invite', { method: 'POST', headers: H, body: JSON.stringify({ prenom: 'Hugo', nom: 'Moreau', code: '135790', telephone: 'abc' }) });
ok(r._st === 400 && r.reason === 'telephone_invalide', '12b. un numéro mal écrit est refusé');
ok(JSON.parse(kv.get('acc:zoe-lambert')).fiche.telephone === '+377 06 12 34 56', '13. option 1 : le numéro saisi par Kevin est rangé sur la fiche du domaine');
r = await appel('kd-mc.com', '/__admin/compte-invite', { method: 'POST', headers: H, body: JSON.stringify({ prenom: 'Hugo', nom: 'Moreau', code: '135790', tel_mode: 'whatsapp' }) });
ok(r._st === 400 && r.reason === 'whatsapp_pas_pret', '14. option 2 (WhatsApp) tant que WhatsApp n\'est pas branché : refusée clairement, aucun compte à moitié créé', JSON.stringify(r));
ok(!kv.has('acc:hugo-moreau'), '14b. … et rien n\'est créé');
/* WhatsApp branché (secrets simulés) */
Object.assign(env, { WA_ACCESS_TOKEN: 'x', WA_PHONE_NUMBER_ID: '1', WA_APP_SECRET: 'y', WA_NUMERO_PUBLIC: '+37700000000' });
r = await appel('kd-mc.com', '/__admin/compte-invite', { method: 'POST', headers: H, body: JSON.stringify({ prenom: 'Hugo', nom: 'Moreau', code: '135790', tel_mode: 'whatsapp' }) });
ok(r.ok === true && JSON.parse(kv.get('acc:hugo-moreau')).tel_requis === true && !JSON.parse(kv.get('acc:hugo-moreau')).fiche, '15. option 2 : compte créé SANS numéro, marqué « à confirmer par WhatsApp »', JSON.stringify(r));
const lg2 = await appel('kd-mc.com', '/__sso/login', { method: 'POST', body: JSON.stringify({ name: 'Hugo Moreau', code: '135790' }) });
const tok2 = lg2.token;
ok(lg2.ok === true && !!tok2, '16. la personne se connecte avec son nom et son code');
const w2 = await vu(tok2, 'cmcteams.kd-mc.com');
ok(w2.ok === false && w2.reason === 'tel_a_confirmer' && w2.tel_a_confirmer === true, '17. mais RIEN ne s\'ouvre : le domaine répond « confirme ton téléphone »', JSON.stringify(w2).slice(0, 160));
ok((await vu(tok2, 'lingua.kd-mc.com')).reason === 'tel_a_confirmer', '17b. dans aucune app (Lingua non plus)');
globalThis.fetch = async () => new Response('var PLANNING_SEED={};', { status: 200 });
const m3 = await appel('cmcteams.kd-mc.com', '/__dep/membre', { method: 'POST', headers: { authorization: 'Bearer ' + tok2 }, body: JSON.stringify({ matricule: 'U99999', nom: 'Moreau', prenom: 'Hugo' }) });
ok(m3.ok !== true, '17c. et la dispense du planning ne joue pas tant que le téléphone n\'est pas confirmé', JSON.stringify(m3).slice(0, 90));
const lierAvec = (token, preuve) => appel('kd-mc.com', '/__sso/tel/lier', { method: 'POST', headers: { authorization: 'Bearer ' + token }, body: JSON.stringify({ preuve }) });
r = await lierAvec(tok2, 'faux.preuve');
ok(r.ok !== true && r.reason === 'preuve_invalide', '18. une fausse preuve est refusée', JSON.stringify(r));
const preuve = await signePreuve('sec', { empreinte: 'emp-test-1', masque: '+377 ••• •• 56' });
r = await lierAvec(tok, preuve);
ok(r.ok !== true && r.reason === 'rien_a_confirmer', '19. la preuve ne sert qu\'au compte qui l\'attend (un autre compte est refusé)', JSON.stringify(r));
r = await lierAvec(tok2, preuve);
ok(r.ok === true && r.tel_masque, '20. la bonne preuve lie le numéro au compte', JSON.stringify(r));
const w3 = await vu(tok2, 'cmcteams.kd-mc.com');
ok(w3.ok === true && w3.externe === true, '21. aussitôt après, le compte s\'ouvre (invité reconnu par le domaine)', JSON.stringify(w3).slice(0, 140));
const m4 = await appel('cmcteams.kd-mc.com', '/__dep/membre', { method: 'POST', headers: { authorization: 'Bearer ' + tok2 }, body: JSON.stringify({ matricule: 'U99999', nom: 'Moreau', prenom: 'Hugo' }) });
ok(m4.ok === true && m4.externe === true, '21b. et la dispense du planning joue alors');
const acc2 = JSON.parse(kv.get('acc:hugo-moreau'));
ok(!acc2.tel_requis && acc2.tel && acc2.tel.empreinte === 'emp-test-1' && !JSON.stringify(acc2).includes('+377 06'), '22. la fiche garde l\'empreinte du téléphone (jamais le numéro en clair)');
r = await lierAvec(tok2, preuve);
ok(r.ok !== true, '23. la même preuve ne sert pas deux fois', JSON.stringify(r));

console.log(`\n${fail ? '❌' : '✅'} invite-externe : ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
