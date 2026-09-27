/* PORTES PAR DOSSIER — « le domaine comme chaque app doit être bien sécurisé. Personne ne peut
   entrer ou modifier. Renseignements obligatoires partout pour les nouveaux » (Kevin 27.09.2026).
   Mesuré avant ce correctif : kd-mc.com/CMCteams/tools/poolrobot/ servait PoolPilot SANS code (le
   verrou ne regardait que l'ADRESSE beatbot.kd-mc.com ; toute adresse du domaine peut demander un
   dossier par /CMCteams/…). Idem pour le coffre d'autorisations.
   Ce test passe par le VRAI routeur (worker.js), hébergeur simulé, et prouve :
     · admin : aucun chemin (adresse, /CMCteams, casse, %-encodage, barres doublées) n'ouvre PoolPilot
       ni Autorisations sans le code ; avec le code, ça s'ouvre ;
     · fiche : un inconnu est envoyé au portail (fiche ou Face ID) puis revient ; une personne connue
       entre ; une session révoquée non ; une personne connue mais pas ouverte ICI voit une page
       claire (pas une boucle) ; l'installation (manifest, icône, sw.js) reste possible ;
     · boutiques et pages de vente restent visibles (Kevin : la fiche se remplit à la commande).
   node portes.test.mjs */
import mod from './worker.js';
import { createHash, createHmac } from 'crypto';

const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const signe = (uid, v, iat) => { const p = b64u(JSON.stringify({ u: uid, n: uid, c: 1, v: v ? 1 : 0, iat: iat || Date.now(), exp: Date.now() + 1e9 })); return p + '.' + b64u(createHmac('sha256', 'sec').update(p).digest()); };
const sha = (s) => createHash('sha256').update(s).digest('hex');
const kv = new Map();
const ACCOUNTS = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } };
const env = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: sha('424242'), ACCOUNTS };

let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const realFetch = globalThis.fetch;
globalThis.fetch = async (input) => { const u = typeof input === 'string' ? input : input.url;
  if (!/(^|\.)kd-mc\.com$/i.test(new URL(u).hostname)) return new Response('CONTENU ' + new URL(u).pathname, { status: 200, headers: { 'content-type': 'text/html' } });
  return realFetch(input); };
const NAV = { 'sec-fetch-dest': 'document', accept: 'text/html' };
const va = async (url, extra) => { const r = await mod.fetch(new Request(url, { headers: Object.assign({}, NAV, extra || {}) }), env, { waitUntil() {} });
  const t = r.status === 302 ? '' : await r.text(); return { st: r.status, loc: r.headers.get('location') || '', servi: /^CONTENU /.test(t), t }; };

/* ---- 1. ADMIN : PoolPilot et Autorisations, par TOUS les chemins ---- */
const CHEMINS_ADMIN = [
  'https://beatbot.kd-mc.com/', 'https://kd-mc.com/CMCteams/tools/poolrobot/', 'https://cmcteams.kd-mc.com/tools/poolrobot/',
  'https://shops.kd-mc.com/CMCteams/tools/poolrobot/index.html', 'https://kd-mc.com/CMCteams/tools/pool%72obot/',
  'https://kd-mc.com/CMCteams/tools/POOLROBOT/', 'https://kd-mc.com/CMCteams//tools/poolrobot/', 'https://kd-mc.com/CMCteams/tools/cuisine/%2e%2e/poolrobot/',
  'https://autorisations.kd-mc.com/', 'https://kd-mc.com/CMCteams/tools/approvals/', 'https://cmcteams.kd-mc.com/tools/approvals/app.js',
];
for (const u of CHEMINS_ADMIN) { const r = await va(u); ok(!r.servi, 'SANS code admin, ' + u + ' ne sert PAS l\'app privée  [' + r.st + ']'); }
const grant = signe('__kdmc_admin__', 1);
for (const u of ['https://beatbot.kd-mc.com/', 'https://kd-mc.com/CMCteams/tools/approvals/']) {
  const r = await va(u, { 'x-kdmc-admin': grant }); ok(r.servi, 'AVEC le code admin, ' + u + ' s\'ouvre');
}

/* ---- 2. FICHE : les 7 sites d'information ---- */
const INFOS = ['https://cuisine.kd-mc.com/', 'https://cujina.kd-mc.com/', 'https://kd-mc.com/cujina/', 'https://worldmonitor.kd-mc.com/',
  'https://osint.kd-mc.com/', 'https://kd-mc.com/osint/', 'https://kd-mc.com/CMCteams/kdmc-home/osint/', 'https://ia.kd-mc.com/',
  'https://outils.kd-mc.com/', 'https://tor.kd-mc.com/', 'https://dossiers.kd-mc.com/', 'https://kd-mc.com/CMCteams/tools/tor/'];
for (const u of INFOS) {
  const r = await va(u);
  ok(r.st === 302 && r.loc === 'https://kd-mc.com/?return=' + encodeURIComponent(u), 'inconnu sur ' + u + ' → envoyé remplir sa fiche puis RETOUR ici  [' + r.st + ' ' + r.loc.slice(0, 60) + ']');
}
{ const r = await mod.fetch(new Request('https://osint.kd-mc.com/index.html', { headers: { accept: '*/*' } }), env, { waitUntil() {} });
  ok(r.status === 401 && !/^CONTENU/.test(await r.text()), 'inconnu qui lit la page SANS navigateur (script, robot) → 401, rien servi'); }
{ const r = await mod.fetch(new Request('https://cuisine.kd-mc.com/livre.pdf', { headers: { accept: '*/*' } }), env, { waitUntil() {} });
  ok(r.status === 401, 'le livre PDF de la cuisine n\'est pas téléchargeable sans fiche'); }
for (const u of ['https://osint.kd-mc.com/manifest.json', 'https://tor.kd-mc.com/sw.js', 'https://cuisine.kd-mc.com/icon-192.png']) {
  const r = await mod.fetch(new Request(u), env, { waitUntil() {} }); ok(/^CONTENU/.test(await r.text()), 'installation sur l\'écran d\'accueil possible (' + u.split('/').pop() + ' libre, sans contenu)');
}
/* connu du domaine (ancienne fiche sans périmètre = tout le domaine) → entre */
kv.set('acc:anne-martin', JSON.stringify({ uid: 'anne-martin', name: 'Anne Martin' }));
const anne = signe('anne-martin', 0);
for (const u of ['https://osint.kd-mc.com/', 'https://kd-mc.com/cujina/', 'https://tor.kd-mc.com/']) {
  const r = await va(u, { cookie: 'kdmc_sso=' + anne }); ok(r.servi, 'personne CONNUE (fiche remplie) → ' + u + ' s\'ouvre');
}
{ const r = await va('https://osint.kd-mc.com/', { authorization: 'Bearer ' + anne }); ok(r.servi, 'reconnue aussi par laissez-passer (app iPhone installée)'); }
/* session révoquée (« déconnecter mes autres appareils ») → retour à la fiche */
kv.set('acc:paul-roche', JSON.stringify({ uid: 'paul-roche', name: 'Paul Roche', revoked_at: Date.now() }));
{ const r = await va('https://osint.kd-mc.com/', { cookie: 'kdmc_sso=' + signe('paul-roche', 0, Date.now() - 60000) });
  ok(r.st === 302 && !r.servi, 'session RÉVOQUÉE → n\'entre pas'); }
/* connue, mais ouverte seulement sur une AUTRE app → page claire, pas de boucle vers le portail */
kv.set('acc:lea-noir', JSON.stringify({ uid: 'lea-noir', name: 'Léa Noir', portee: 'app', acces: ['tor'] }));
{ const r = await va('https://osint.kd-mc.com/', { cookie: 'kdmc_sso=' + signe('lea-noir', 0) });
  ok(r.st === 403 && !r.servi && /pas encore ouvert/.test(r.t), 'connue mais PAS ouverte sur cette app → page « pas encore ouvert », sans boucle  [' + r.st + ']'); }
{ const r = await va('https://tor.kd-mc.com/', { cookie: 'kdmc_sso=' + signe('lea-noir', 0) }); ok(r.servi, '… et sur l\'app qui lui est ouverte, elle entre'); }
/* Kevin (admin prouvé Face ID) n'est jamais enfermé dehors */
kv.set('acc:kevin-desarzens', JSON.stringify({ uid: 'kevin-desarzens', name: 'Kevin Desarzens', portee: 'app', acces: [] }));
{ const r = await va('https://dossiers.kd-mc.com/', { cookie: 'kdmc_sso=' + signe('kevin-desarzens', 1) }); ok(r.servi, 'Kevin (admin + Face ID) entre partout'); }
{ const r = await va('https://osint.kd-mc.com/', { cookie: 'kdmc_sso=' + 'faux.' + anne.split('.')[1] }); ok(!r.servi, 'jeton FALSIFIÉ → n\'entre pas'); }

/* ---- 3. Boutiques et pages de vente : visibles (fiche à la commande, choix de Kevin) ---- */
for (const u of ['https://shops.kd-mc.com/', 'https://la-detente.kd-mc.com/', 'https://chez-lolo.kd-mc.com/', 'https://rotaplan.kd-mc.com/',
  'https://kit.kd-mc.com/', 'https://croupier.kd-mc.com/', 'https://kd-mc.com/']) {
  const r = await va(u); ok(r.servi, 'page de vente / portail visible sans fiche : ' + u);
}

/* ---- 4. Renseignements obligatoires pour un NOUVEAU compte (vérifiés par le DOMAINE) ---- */
const inscrit = async (corps) => { const r = await mod.fetch(new Request('https://kd-mc.com/__sso/issue', { method: 'POST',
  headers: { 'content-type': 'application/json', origin: 'https://kd-mc.com' }, body: JSON.stringify(corps) }), env, { waitUntil() {} });
  return { st: r.status, j: await r.json().catch(() => ({})) }; };
{ const r = await inscrit({ uid: 'x1', name: 'Zorro', cgu: true }); ok(r.st === 400 && r.j.reason === 'renseignements_requis', 'nouveau avec UN seul mot (sans nom de famille) → refusé'); }
{ const r = await inscrit({ uid: 'x2', name: 'Marc Dupont' }); ok(r.st === 400 && r.j.reason === 'renseignements_requis', 'nouveau SANS accepter les conditions → refusé'); }
{ const r = await inscrit({ uid: 'x3', name: 'Marc D', cgu: true }); ok(r.st === 400, 'nouveau avec un « nom » d\'une seule lettre → refusé'); }
{ const r = await inscrit({ uid: 'x4', name: '12 34', cgu: true }); ok(r.st === 400, 'nouveau avec des chiffres au lieu d\'un nom → refusé'); }
{ const r = await inscrit({ uid: 'marc-dupont', name: 'Marc Dupont', cgu: true }); ok(r.st === 200 && r.j.ok === true, 'nouveau COMPLET (prénom + nom + conditions) → compte créé'); }
{ const r = await inscrit({ uid: 'anne-sophie-saint-polit', name: 'Anne-Sophie SAINT-POLIT', cgu: true }); ok(r.j.ok === true, 'noms composés et accents acceptés'); }
{ const r = await inscrit({ uid: 'anne-martin', name: 'Anne', cgu: false }); ok(r.j.ok === true, 'quelqu\'un de DÉJÀ inscrit n\'est jamais bloqué par ce contrôle'); }

console.log(`Portes par dossier : ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
