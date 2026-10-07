/* GARDE — LE FIL D'ACTIVITÉ PAR PERSONNE (Kevin 4.10.2026 : « le même compte qui se connecte ne se multiplie pas, il s'ajoute dans sa fiche, remonte dans le fil…
 * Historique. Récupère infos+++, sites consultés, loc, modif, travail, questions, consultation »).
 * D1 simulée (SQLite de Node), vrai routeur, vraies sessions SSO. Prouve : pages / lieu / appareil / connexion / question / enregistrement / message rangés dans LA fiche,
 * sans doublon ; UNE carte par personne dans la boîte, qui remonte avec la dernière activité ; seules les alertes comptent en rouge ; plafond, effacement à 90 jours,
 * jamais d'adresse IP ; zéro écriture KV pour tout ça. node services/kdmc-router/activite.test.mjs */
import { DatabaseSync } from 'node:sqlite';
import mod, { enrich } from './worker.js';
import { noter, fil, actives, resume, LIM, TYPES, _resetPurge } from './activite.js';
import { lireBoite, handleBoite, _viderMemo } from './boite.js';
import { handleCercle, ADMIN, schema as schemaCercle } from './cercle.js';

let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d !== undefined ? '  → ' + JSON.stringify(d).slice(0, 260) : ''}`); };
function d1() {
  const s = new DatabaseSync(':memory:');
  const st = (sql, p = []) => ({ bind: (...x) => st(sql, x), first: async () => s.prepare(sql).get(...p) ?? null, all: async () => ({ results: s.prepare(sql).all(...p) }),
    run: async () => { const r = s.prepare(sql).run(...p); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }, _exec: () => s.prepare(sql).run(...p) });
  return { prepare: (q) => st(q), batch: async (l) => { for (const x of l) x._exec(); return []; }, _s: s };
}
const kvEcrit = []; const kv = new Map();
const mk = () => ({ CERCLE_DB: d1(), KDMC_SSO_SECRET: 'secret-test', ACCOUNTS: { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kvEcrit.push(k); kv.set(k, v); }, delete: async (k) => { kv.delete(k); } }, ASSETS: { fetch: async () => new Response('', { status: 404 }) } });
const b64url = (x) => Buffer.from(x, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function jeton(uid, nom) {
  const p = b64url(JSON.stringify({ u: uid, n: nom, c: 1, v: 0, iat: Date.now(), exp: Date.now() + 3600000 }));
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode('secret-test'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return p + '.' + Buffer.from(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(p))).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const NICE = { country: 'FR', city: 'Nice', region: 'Provence', asn: 3215, asOrganization: 'Orange S.A.' };
const MONACO = { country: 'MC', city: 'Monaco', region: 'Monaco', asn: 31122, asOrganization: 'Monaco Telecom' };
const rq = (cf, ua, chemin) => ({ cf, url: 'https://lingua.kd-mc.com' + chemin, headers: new Headers({ 'CF-Connecting-IP': '203.0.113.7', 'user-agent': ua || IPHONE, host: 'lingua.kd-mc.com' }) });
globalThis.fetch = async () => new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } });
const T0 = 1790000000000;

console.log('\nLe fil d\'activité par personne\n');
/* 1. le module : doublons, plafond, effacement */
let env = mk();
ok(await noter(env, { uid: 'u1', nom: 'Léa', type: 'visite', app: 'lingua.kd-mc.com', detail: '/lecon' }, T0) === 'ajoute', '1a. une page consultée s\'ajoute à la fiche');
ok(await noter(env, { uid: 'u1', nom: 'Léa', type: 'visite', app: 'lingua.kd-mc.com', detail: '/lecon' }, T0 + 60e3) === 'doublon', '1b. la même page 1 min plus tard : pas de doublon (le même compte ne se multiplie pas)');
ok(await noter(env, { uid: 'u1', nom: 'Léa', type: 'visite', app: 'lingua.kd-mc.com', detail: '/lecon' }, T0 + 11 * 60e3) === 'ajoute', '1c. 11 min plus tard : elle compte de nouveau (une vraie nouvelle consultation)');
ok(await noter(env, { uid: 'u1', nom: 'Léa', type: 'visite', app: 'lingua.kd-mc.com', detail: '/profil' }, T0 + 61e3) === 'ajoute', '1d. une AUTRE page s\'ajoute tout de suite');
ok(await noter(env, { uid: '', type: 'visite', app: 'x', detail: '/' }, T0) === 'ignore' && await noter(env, { uid: 'u1', type: 'inconnu', app: 'x', detail: '/' }, T0) === 'ignore' && await noter({}, { uid: 'u1', type: 'visite' }, T0) === 'ignore', '1e. sans compte, type inconnu ou sans base : ignoré, jamais d\'erreur');
for (let i = 0; i < LIM.jourParCompte + 20; i++) await noter(env, { uid: 'u2', type: 'message', app: 'a', detail: 'n' + i }, T0 + i);
ok(env.CERCLE_DB._s.prepare('SELECT COUNT(*) AS n FROM activite WHERE uid = ?').get('u2').n === LIM.jourParCompte, '1f. un plafond par compte et par jour (' + LIM.jourParCompte + ') : une boucle ou un robot ne remplit pas la base');
env.CERCLE_DB._s.prepare('INSERT INTO activite (uid, nom, ts, type, app, detail, lieu) VALUES (?, ?, ?, ?, ?, ?, ?)').run('vieux', 'V', T0 - 91 * 864e5, 'visite', 'a', '/', '');
_resetPurge(); await noter(env, { uid: 'u3', type: 'visite', app: 'a', detail: '/x' }, T0);
ok(env.CERCLE_DB._s.prepare('SELECT COUNT(*) AS n FROM activite WHERE uid = ?').get('vieux').n === 0, '1g. plus de 90 jours : effacé (conditions du domaine : durée limitée)');
await noter(env, { uid: 'u4', type: 'question', app: 'lingua', detail: 'x'.repeat(500) }, T0);
ok(env.CERCLE_DB._s.prepare("SELECT LENGTH(detail) AS n FROM activite WHERE uid = 'u4'").get().n === LIM.question, '1h. une question est gardée sur ' + LIM.question + ' caractères seulement');

/* 2. dans le vrai routeur : enrich() range pages, connexion, lieu, appareil dans LA fiche */
env = mk(); const uid = 'marie';
await enrich(env, rq(NICE, IPHONE, '/lecon?x=1&secret=2'), uid, 'Marie Dupont', true, undefined, { hote: 'lingua.kd-mc.com', page: true });
await enrich(env, rq(NICE, IPHONE, '/lecon'), uid, 'Marie Dupont', true, undefined, { hote: 'lingua.kd-mc.com', page: true });
await enrich(env, rq(NICE, IPHONE, '/profil'), uid, 'Marie Dupont', true, undefined, { hote: 'lingua.kd-mc.com', page: true });
await enrich(env, rq(NICE, IPHONE, '/__sso/whoami'), uid, 'Marie Dupont', true, undefined, { hote: 'lingua.kd-mc.com' });   // battement de présence : pas une consultation
let f = await fil(env.CERCLE_DB, uid, 50);
const types = f.map((e) => e.type + ':' + e.detail.split(' · ')[0]);
ok(f.filter((e) => e.type === 'visite').map((e) => e.detail).join() === '/lecon,/profil' && !f.some((e) => /secret|whoami/.test(e.detail)), '2a. pages consultées : « /lecon » UNE fois (3 chargements), « /profil », jamais les paramètres ni les battements de présence', types);
ok(f.filter((e) => e.type === 'connexion').length === 1, '2b. une seule « connexion » pour une session (pas une par page)', types);
await enrich(env, rq(MONACO, IPHONE, '/profil'), uid, 'Marie Dupont', true, undefined, { hote: 'lingua.kd-mc.com', page: true });
await enrich(env, rq(MONACO, PC, '/lecon'), uid, 'Marie Dupont', true, undefined, { hote: 'lingua.kd-mc.com', page: true });
f = await fil(env.CERCLE_DB, uid, 50);
ok(f.some((e) => e.type === 'lieu' && /Monaco/.test(e.detail) && /Monaco Telecom/.test(e.detail)) && f.some((e) => e.type === 'appareil'), '2c. un nouveau lieu (Monaco, opérateur) et un nouvel appareil entrent dans le fil', f.map((e) => e.type));
ok(!JSON.stringify(f).includes('203.0.113.7'), '2d. jamais l\'adresse IP dans le fil');
/* 3. sessions réelles : questions, enregistrements */
const tok = await jeton('lea-session', 'Léa Martin');
const pageReq = (chemin, corps) => new Request('https://lingua.kd-mc.com' + chemin, { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'kdmc_sso=' + tok, referer: 'https://lingua.kd-mc.com/', host: 'lingua.kd-mc.com', 'user-agent': IPHONE }, body: JSON.stringify(corps) });
const envS = mk();
await mod.fetch(pageReq('/__lingua/ai', { lang: 'en', langName: 'anglais', level: 'Debutant', levelIndex: 1, messages: [{ role: 'user', text: 'Comment dit-on « je voudrais un café » ? ' + 'a'.repeat(300) }] }), envS, { waitUntil() {} });
await mod.fetch(pageReq('/__lingua/save', { data: { xp: 5 } }), envS, { waitUntil() {} });
const fl = await fil(envS.CERCLE_DB, 'lea-session', 20);
const q = fl.find((e) => e.type === 'question'), mo = fl.find((e) => e.type === 'modif');
ok(q && q.app === 'lingua' && /^Comment dit-on « je voudrais un café »/.test(q.detail) && q.detail.length <= LIM.question, '3a. une question posée au coach de Lingua entre dans la fiche de la personne (160 caractères)', fl);
ok(mo && /progression/.test(mo.detail), '3b. un enregistrement de progression entre dans la fiche (modification)');
await mod.fetch(new Request('https://lingua.kd-mc.com/__lingua/ai', { method: 'POST', headers: { 'content-type': 'application/json', referer: 'https://lingua.kd-mc.com/', host: 'lingua.kd-mc.com' }, body: JSON.stringify({ messages: [{ role: 'user', text: 'anonyme' }] }) }), envS, { waitUntil() {} });
ok((await actives(envS.CERCLE_DB, 0, 20)).every((a) => a.uid === 'lea-session'), '3c. une question sans session ne crée AUCUNE fiche : on ne nomme pas un inconnu');
/* messages du cercle : le fait, jamais le texte */
await schemaCercle(envS.CERCLE_DB);
const outils = { qui: async () => ({ uid: 'lea-session', nom: 'Léa Martin', admin: false }), notifier: async () => {}, now: () => T0, noter: (ev) => noter(envS, ev, T0), appareilDe: () => 'iPhone · iOS 18.0 · Safari 18' };
const rc = await handleCercle(new Request('https://lingua.kd-mc.com/__cercle/message', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://lingua.kd-mc.com' }, body: JSON.stringify({ a: 'admin', type: 'texte', corps: 'Un message très privé' }) }), new URL('https://lingua.kd-mc.com/__cercle/message'), envS, outils);
const fm = (await fil(envS.CERCLE_DB, 'lea-session', 20)).find((e) => e.type === 'message');
ok((await rc.json()).ok && fm && fm.detail === 'à l\'admin' && !JSON.stringify(fm).includes('privé'), '3d. un message envoyé : « a écrit à l\'admin » dans le fil, JAMAIS son texte');

/* 4. la boîte : UNE carte par personne, qui remonte, avec résumé tiré de la fiche */
const envB = mk(); const sans = { fbToken: async () => '', fetch: async () => new Response('null'), now: () => T0 + 3600e3 };
const acc = { uid: 'marie', name: 'Marie Dupont', created: T0 - 20 * 864e5, hits: 12, last_seen: T0, apps: { 'lingua.kd-mc.com': { sessions: 9, ms: 5400e3 }, 'cmcteams.kd-mc.com': { sessions: 3, ms: 1200e3 } }, devices: ['mobile·iOS', 'desktop·Windows'], places: ['Nice, Provence, FR', 'Monaco, Monaco, MC'], last_isp: 'Monaco Telecom', last_net: { asn: 31122 }, last_lang: 'fr-FR', last_tz: 'Europe/Paris', portee: 'domaine', acces: [] };
kv.set('acc:marie', JSON.stringify(acc));
kv.set('aud:log', JSON.stringify([
  { ts: T0 + 3000e3, ev: 'new_device', uid: 'marie', name: 'Marie Dupont', app: 'lingua.kd-mc.com', device: 'iPhone', place: 'Monaco', isp: 'Monaco Telecom', asn: '31122', detail: 'desktop·Windows · Monaco' },
  { ts: T0 + 3100e3, ev: 'new_device', uid: 'marie', name: 'Marie Dupont', app: 'lingua.kd-mc.com', device: 'iPhone', place: 'Monaco', isp: 'Monaco Telecom', asn: '31122', detail: 'tablet·iOS · Monaco' },
  { ts: T0 + 3200e3, ev: 'nouvelle_connexion', name: 'Léo Roux', app: 'shops', text: 'première visite' },
  { ts: T0 + 3250e3, ev: 'nouvelle_connexion', name: 'Léo Roux', app: 'shops', text: 'deuxième app' } ]));
for (let i = 0; i < 6; i++) await noter(envB, { uid: 'marie', nom: 'Marie Dupont', type: 'visite', app: 'lingua.kd-mc.com', detail: '/page' + i, lieu: 'Monaco' }, T0 + 3000e3 + i * 11 * 60e3);
await noter(envB, { uid: 'marie', nom: 'Marie Dupont', type: 'question', app: 'lingua', detail: 'Comment dit-on bonjour ?' }, T0 + 3300e3);
await noter(envB, { uid: 'paul', nom: 'Paul Roy', type: 'visite', app: 'shops.kd-mc.com', detail: '/panier' }, T0 + 7000e3);
_viderMemo();
let b = await lireBoite(envB, sans, T0 + 3600e3);
let cartes = b.messages.filter((x) => x.source === 'alertes');
const marie = cartes.filter((x) => x.de === 'Marie Dupont');
ok(marie.length === 1, '4a. Marie : 2 alertes « nouvel appareil » + 6 pages + 1 question = UNE seule carte (le même compte ne se multiplie pas)', cartes.map((x) => x.de));
const cm = marie[0];
ok(cm.fil.length <= LIM.fil && cm.fil.every((e, i, a) => !i || a[i - 1].ts <= e.ts) && cm.fil.some((e) => /Comment dit-on bonjour/.test(e.texte)) && cm.fil.some((e) => /Nouvel appareil/.test(e.texte)), '4b. son fil mêle alertes, pages, questions, du plus ancien au plus récent (14 dernières lignes)', cm.fil.map((e) => e.texte));
ok(cm.nonLus === 1 && b.nonLusAlertes === cartes.reduce((s, x) => s + x.nonLus, 0), '4c. seules les ALERTES comptent en rouge (ses 2 alertes identiques rapprochées = UNE ligne « ×2 », depuis le 6.10), pas les pages ni les questions', [cm.nonLus, b.nonLusAlertes]);
const L = cm.infos.join('\n');
ok(/Marie Dupont \(marie\)/.test(L) && /12 session/.test(L) && /lingua 9× 1 h 30/.test(L) && /mobile·iOS, desktop·Windows/.test(L) && /Monaco, Monaco, MC/.test(L) && /Monaco Telecom \(AS31122\)/.test(L) && /fr-FR · Europe\/Paris/.test(L) && /6 page\(s\) consultée\(s\)/.test(L) && /1 question\(s\)/.test(L) && /Comment dit-on bonjour \?/.test(L), '4d. la carte résume la FICHE : sessions, temps par app, appareils, lieux, réseau, langue, + pages / questions des 7 jours + dernière question', L);
const leo = cartes.filter((x) => x.de === 'Léo Roux');
ok(leo.length === 1 && leo[0].fil.length === 1 && /×2/.test(leo[0].fil[0].texte), '4f. deux alertes du même nom sans compte : une seule carte aussi', leo);
const paul = cartes.find((x) => x.de === 'Paul Roy');
ok(paul.nonLus === 0 && paul.lu, '4g. une personne qui consulte seulement des pages n\'allume aucun rouge');
/* marquer lu : une carte entière */
const outilsB = { qui: async () => ({ uid: ADMIN, nom: 'Admin', admin: true }), now: () => T0 + 3600e3, ...sans };
const appelB = (chemin, corps) => handleBoite(new Request('https://kd-mc.com/__boite' + chemin, { method: corps ? 'POST' : 'GET', headers: { 'content-type': 'application/json', origin: 'https://kd-mc.com' }, body: corps ? JSON.stringify(corps) : undefined }), new URL('https://kd-mc.com/__boite' + chemin), envB, outilsB);
const rl = await (await appelB('/admin/lu', { cles: ['perso:u:marie'] })).json();
_viderMemo(); b = await lireBoite(envB, sans, T0 + 3600e3);
ok(rl.ok && rl.n === 1 && b.messages.find((x) => x.de === 'Marie Dupont').nonLus === 0, '4h. « marquer lu » sur la carte de Marie éteint ses 2 alertes d\'un coup');
const cartesLues = b.messages.filter((x) => x.source === 'alertes').map((x) => x.de);
ok(cartesLues.indexOf('Paul Roy') >= 0 && cartesLues.indexOf('Paul Roy') < cartesLues.indexOf('Marie Dupont') && cartesLues.indexOf('Léo Roux') < cartesLues.indexOf('Paul Roy'), '4i. les alertes non lues d\'abord (Léo), puis REMONTE en tête celui dont la dernière activité est la plus récente (Paul avant Marie)', cartesLues);
/* 5. l'historique complet d'une personne */
for (let i = 0; i < 30; i++) await noter(envB, { uid: 'marie', nom: 'Marie Dupont', type: 'modif', app: 'lingua', detail: 'enreg ' + i }, T0 + 4000e3 + i * 3700e3);
const ph = await (await appelB('/admin/personne?uid=marie')).json();
ok(ph.ok && ph.evenements.length > 30 && ph.evenements[0].ts >= ph.evenements[1].ts && ph.infos.some((x) => /Marie Dupont/.test(x)) && ph.evenements.some((e) => /Monaco/.test(e.lieu || '')), '5a. « Historique complet » : fiche + tous les événements (jusqu\'à 200), le plus récent d\'abord, avec le lieu', ph.evenements && ph.evenements.length);
const pn = await handleBoite(new Request('https://kd-mc.com/__boite/admin/personne?uid=marie', { headers: { origin: 'https://kd-mc.com' } }), new URL('https://kd-mc.com/__boite/admin/personne?uid=marie'), envB, { ...outilsB, qui: async () => ({ uid: 'x', nom: 'x', admin: false }) });
ok(pn.status === 401, '5b. réservé à l\'admin : un membre reçoit 401');

/* 8. L'APPAREIL (Kevin 4.10 : « appareil aussi ») : chaque événement porte l'appareil, la carte résume appareil par appareil */
const LIB_IPHONE = 'iPhone · iOS 18.0 · Safari 18', LIB_PC = 'PC Windows · Windows 10/11 · Chrome 130';
const fe = await fil(env.CERCLE_DB, 'marie', 50);
ok(fe.filter((e) => e.type === 'visite' && /lecon|profil/.test(e.detail)).every((e) => e.appareil === LIB_IPHONE || e.appareil === LIB_PC) && fe.some((e) => e.appareil === LIB_PC && e.type === 'appareil'), '8a. chaque page, lieu, appareil du fil porte l\'appareil exact (« ' + LIB_IPHONE + ' » / « ' + LIB_PC + ' »)', fe.map((e) => e.type + ':' + e.appareil));
ok(q.appareil === LIB_IPHONE && mo.appareil === LIB_IPHONE && fm.appareil === 'iPhone · iOS 18.0 · Safari 18', '8b. une question, un enregistrement et un message portent aussi l\'appareil d\'où ils viennent', [q.appareil, mo.appareil, fm.appareil]);
const envD = mk(); const kvD = new Map();
envD.ACCOUNTS = { get: async (k) => (k === 'acc:dev1' ? JSON.stringify({ uid: 'dev1', name: 'Dora Test', created: T0 - 9 * 864e5, hits: 12, last_seen: T0 + 100e3, apps: {}, devices: ['mobile·iOS', 'desktop·Windows'],
  history: [
    { ts: T0 - 5 * 864e5, end: T0 - 5 * 864e5 + 600e3, app: 'lingua.kd-mc.com', device: 'mobile·iOS', dev: LIB_IPHONE, place: 'Nice, Provence, FR', isp: 'Orange S.A.', vpn: 0 },
    { ts: T0 - 2 * 864e5, end: T0 - 2 * 864e5 + 900e3, app: 'lingua.kd-mc.com', device: 'mobile·iOS', dev: LIB_IPHONE, place: 'Monaco, Monaco, MC', isp: 'Monaco Telecom', vpn: 0 },
    { ts: T0 + 100e3, end: T0 + 100e3, app: 'cmcteams.kd-mc.com', device: 'desktop·Windows', dev: LIB_PC, place: 'Monaco, Monaco, MC', isp: 'M247 Europe (NordVPN)', vpn: 1 } ] }) : null), put: async () => {} };
await noter(envD, { uid: 'dev1', nom: 'Dora Test', type: 'visite', app: 'lingua.kd-mc.com', detail: '/lecon', appareil: LIB_IPHONE }, T0 + 50e3);
await noter(envD, { uid: 'dev1', nom: 'Dora Test', type: 'visite', app: 'cmcteams.kd-mc.com', detail: '/planning', appareil: LIB_PC }, T0 + 100e3);
await noter(envD, { uid: 'dev1', nom: 'Dora Test', type: 'visite', app: 'lingua.kd-mc.com', detail: '/profil', appareil: LIB_IPHONE }, T0 + 120e3);
_viderMemo();
const bD = await lireBoite(envD, { fbToken: async () => '', fetch: async () => new Response('null'), now: () => T0 + 200e3 }, T0 + 200e3);
const cD = bD.messages.find((x) => x.de === 'Dora Test');
const lignesApp = cD.infos.filter((x) => x.startsWith('📲'));
ok(lignesApp.length === 2 && lignesApp[0].includes(LIB_PC) && lignesApp[1].includes(LIB_IPHONE), '8c. la carte résume APPAREIL PAR APPAREIL, le plus récemment utilisé d\'abord (le PC, puis l\'iPhone)', lignesApp);
ok(/2 session\(s\)/.test(lignesApp[1]) && /Nice, Monaco/.test(lignesApp[1]) && /Orange S\.A\. \/ Monaco Telecom/.test(lignesApp[1]) && /2 événement\(s\) en 7 jours/.test(lignesApp[1]), '8d. par appareil : sessions, période, lieux, opérateurs, et ce qu\'il a fait ces 7 jours', lignesApp[1]);
ok(/1 session\(s\)/.test(lignesApp[0]) && /VPN\/hébergeur/.test(lignesApp[0]) && /1 événement\(s\) en 7 jours/.test(lignesApp[0]), '8e. un appareil passé par un VPN est signalé comme tel', lignesApp[0]);
ok(cD.fil.some((e) => /\/profil · 📲 iPhone · iOS 18\.0$/.test(e.texte)) && cD.fil.some((e) => /\/planning · 📲 PC Windows · Windows 10\/11$/.test(e.texte)), '8f. chaque ligne du fil dit sur quel appareil (« · 📲 iPhone · iOS 18.0 »)', cD.fil.map((e) => e.texte));
const outilsD = { qui: async () => ({ uid: ADMIN, nom: 'Admin', admin: true }), now: () => T0 + 200e3, fbToken: async () => '', fetch: async () => new Response('null') };
const phD = await (await handleBoite(new Request('https://kd-mc.com/__boite/admin/personne?uid=dev1', { headers: { origin: 'https://kd-mc.com' } }), new URL('https://kd-mc.com/__boite/admin/personne?uid=dev1'), envD, outilsD)).json();
ok(phD.evenements.length === 3 && phD.evenements.every((e) => e.appareil) && phD.evenements[0].appareil === LIB_IPHONE, '8g. l\'historique complet donne l\'appareil de chaque événement', phD.evenements);

/* 6. aucune écriture KV pour tout ça */
ok(!kvEcrit.some((k) => /activ|perso|fil:/.test(k)) && envB.CERCLE_DB._s.prepare('SELECT COUNT(*) AS n FROM activite').get().n > 30, '6. le fil d\'activité n\'écrit RIEN au KV : tout vit en D1 (' + envB.CERCLE_DB._s.prepare('SELECT COUNT(*) AS n FROM activite').get().n + ' lignes), les écritures KV restantes sont celles d\'avant (fiches, journal, limites)');
ok(Object.keys(TYPES).length === 8, '7. les 8 types d\'activité sont déclarés (visite, connexion, lieu, appareil, question, modif, message, contact)');
console.log(`\n${pass} OK · ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
