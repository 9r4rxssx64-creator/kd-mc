#!/usr/bin/env node
/* ============================================================================
 * PÉRIMÈTRE DES APPS — « chaque app distincte, toutes liées dans le domaine »
 * ----------------------------------------------------------------------------
 * Kevin 2026-09-15 : « quelqu'un d'extérieur peut s'enregistrer et être seulement
 * dans une app, et d'autres feront partie du domaine entier (sauf partie admin)
 * […] admin possibilité de bloquer dans une app ».
 *
 * Cette garde EXÉCUTE le routeur (faux KV en mémoire) au lieu de chercher des
 * chaînes de caractères dedans. Un contrôle qui lit du texte ment dans les deux
 * sens : il passe au vert sur un commentaire, et au rouge sur du code correct
 * (leçon #103, et le garde G de la copie de secours qui s'était fait avoir).
 *
 * Ce qu'elle refuse de laisser passer :
 *   A. une adresse servie (ROUTES) sans clé d'app → elle échapperait au
 *      périmètre EN SILENCE, ce qui est pire que pas de périmètre du tout ;
 *   B. la décision elle-même (portée, blocage, alias, fail-open) ;
 *   C. le comportement réel de /__sso/whoami et /__sso/issue ;
 *   D. l'admin jamais enfermé dehors, et le réglage réservé à l'admin.
 *
 * Lancer : node tests/verify-perimetre-apps.mjs
 * ========================================================================== */
import mod, { APPS, ROUTES, appDe, perimetre, ssoSign } from '../services/kdmc-router/worker.js';
import { createHash } from 'node:crypto';

let ko = 0;
const ok = (c, m, d) => {
  if (c) { console.log('  ✅ ' + m); return; }
  console.log('  ❌ ' + m + (d ? ' — ' + d : '')); ko++;
};

/* Faux KV : un Map suffit, et ça garde la garde hors ligne (< 1 s, 0 réseau). */
function faireEnv(fiches) {
  const kv = new Map();
  for (const [uid, acc] of Object.entries(fiches || {})) kv.set('acc:' + uid, JSON.stringify(acc));
  return {
    KDMC_SSO_SECRET: 'secret-de-test-perimetre',
    ACCOUNTS: {
      get: async (k, t) => (t === 'arrayBuffer' ? null : (kv.has(k) ? kv.get(k) : null)),
      put: async (k, v) => { kv.set(k, v); },
      delete: async (k) => { kv.delete(k); },
    },
    _kv: kv,
  };
}
const req = (host, path, opts = {}) => new Request('https://' + host + path, {
  method: opts.method || 'GET',
  headers: Object.assign({ host }, opts.headers || {}),
  body: opts.body,
});

/* ── A. Chaque adresse servie a une app — sinon elle échappe au périmètre ──── */
console.log('\nA. Parité ROUTES ⇄ APPS');
const sansApp = Object.keys(ROUTES).filter((h) => !APPS[h]);
ok(sansApp.length === 0,
  `les ${Object.keys(ROUTES).length} adresses servies ont toutes une clé d'app`,
  sansApp.join(', '));
const fantomes = Object.keys(APPS).filter((h) => !ROUTES[h]);
ok(fantomes.length === 0, 'aucune app déclarée sur une adresse qui n\'est plus servie', fantomes.join(', '));
ok(appDe('cuisine.kd-mc.com') === appDe('cocina.kd-mc.com')
  && appDe('cuisine.kd-mc.com') === appDe('cujina.kd-mc.com'),
  'les 3 adresses du livre de cuisine = UNE app (sinon on bloque sur l\'alias)');
ok(appDe('departs.kd-mc.com') === appDe('cmcteams-light.kd-mc.com'),
  'departs et cmcteams-light = UNE app');
ok(appDe('CMCTEAMS.KD-MC.COM') === 'cmcteams' && appDe('cmcteams.kd-mc.com:443') === 'cmcteams',
  'la casse et le port ne changent pas l\'app (un en-tête Host bizarre ne contourne rien)');
ok(appDe('inconnu.example.com') === '' && appDe('') === '' && appDe(null) === '',
  'une adresse hors domaine n\'a pas d\'app');

/* ── B. La décision, cas par cas ───────────────────────────────────────────── */
console.log('\nB. La règle elle-même');
ok(perimetre(null, 'arbre').ok === true, 'sans fiche → reconnu (fail-open : on ne casse personne)');
ok(perimetre({ portee: 'app', acces: [] }, '').ok === true, 'adresse hors domaine → on ne juge pas');
ok(perimetre({}, 'arbre').ok === true, 'fiche SANS portée → domaine entier (les ~191 comptes existants gardent tout)');
ok(perimetre({ portee: 'domaine' }, 'coffre').ok === true, 'portée domaine → toutes les apps');
ok(perimetre({ portee: 'app', acces: ['chez-lolo'] }, 'chez-lolo').ok === true, 'portée app → son app : oui');
const hors = perimetre({ portee: 'app', acces: ['chez-lolo'] }, 'arbre');
ok(hors.ok === false && hors.raison === 'hors_perimetre', 'portée app → une autre app : non');
const bl = perimetre({ portee: 'domaine', bloque: ['arbre'] }, 'arbre');
ok(bl.ok === false && bl.raison === 'bloque_ici', 'blocage admin → ferme une app MÊME en portée domaine');
ok(perimetre({ portee: 'domaine', bloque: ['arbre'] }, 'coffre').ok === true, 'le blocage ne ferme QUE l\'app visée');
ok(perimetre({ portee: 'app', acces: ['cuisine'], bloque: ['cuisine'] }, 'cuisine').ok === false,
  'le blocage l\'emporte sur l\'autorisation (l\'admin a le dernier mot)');
ok(perimetre({ portee: 'app', acces: 'chez-lolo' }, 'chez-lolo').ok === false,
  'une liste d\'accès corrompue (texte au lieu de liste) ferme, elle n\'ouvre pas');
ok(perimetre({ portee: 'app', acces: ['chez-lolo'] }, 'portail').ok === true
  && perimetre({ portee: 'domaine', bloque: ['portail'] }, 'portail').ok === true,
  'le PORTAIL est la réception : toujours ouvert, même « une app », même « bloqué » (sinon plus personne ne peut se connecter nulle part)');

/* ── B ter. CMCteams et CMCteams light = UN SEUL OUTIL ────────────────────────
 * Kevin, 22.09.2026, choix explicite : « les deux comptent comme une seule app ».
 * Ce sont les mêmes 260 personnes et le même planning — la light s'appelle
 * littéralement « CMCteams light ». Sans ça, un employé déclaré par l'une reste
 * ANONYME sur l'autre : Kevin ne le voit qu'une visite sur deux.
 * ⚠️ Ce qui compte autant : cette porte n'ouvre QUE celle-là. Si elle en ouvrait
 * d'autres, s'inscrire sur une app ouvrirait le domaine — exactement ce que le
 * périmètre existe pour empêcher. Les deux sens sont vérifiés, et le contraire
 * aussi. */
console.log('\nB ter. CMCteams et sa light : le même outil, et rien de plus');
ok(perimetre({ portee: 'app', acces: ['cmcteams'] }, 'departs').ok === true,
  'déclaré sur CMCteams → reconnu sur la light');
ok(perimetre({ portee: 'app', acces: ['departs'] }, 'cmcteams').ok === true,
  'déclaré sur la light → reconnu sur CMCteams');
for (const ailleurs of ['lingua', 'coffre', 'chez-lolo', 'arbre', 'bot', 'dossiers']) {
  ok(perimetre({ portee: 'app', acces: ['cmcteams'] }, ailleurs).ok === false,
    'un employé CMCteams n\'est PAS ouvert à ' + ailleurs + ' pour autant');
}
ok(perimetre({ portee: 'app', acces: ['lingua'] }, 'cmcteams').ok === false,
  'et l\'inverse : quelqu\'un de Lingua n\'entre pas dans le planning');
ok(perimetre({ portee: 'app', acces: ['cmcteams'], bloque: ['departs'] }, 'departs').ok === false,
  'un blocage explicite de l\'admin l\'emporte quand même (dernier mot à Kevin)');

/* ── B bis. LE VRAI PARCOURS D'UN NOUVEL INSCRIT passe par le portail ─────────
 * Une app sans session renvoie sur kd-mc.com/?return=<app>. Le compte se crée
 * DONC sur le portail, pas sur l'app. Première version de ce code : le nouveau
 * naissait fermé à « portail » → de retour sur sa boutique, pas reconnu. Aucun
 * nouveau client n'aurait jamais pu entrer nulle part. Trouvé en suivant le
 * parcours réel, pas par ces tests — qui inscrivaient chacun sur son app. */
console.log('\nB bis. Inscription via le portail (le vrai parcours)');
{
  const envP = faireEnv({});
  const inscrire = (uid, name, pour) => mod.fetch(req('kd-mc.com', '/__sso/issue', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ uid, name, cgu: true, pour }),
  }), envP).then((r) => r.json());
  const voir = (tok, host) => mod.fetch(req(host, '/__sso/whoami', { headers: { authorization: 'Bearer ' + tok } }), envP).then((r) => r.json());

  let jp = await inscrire('cliente_via_portail', 'Nadia Roux', 'https://chez-lolo.kd-mc.com/produits?x=1');
  ok(jp.ok === true, 'inscription sur le portail, en venant de Chez Lolo → acceptée');
  let f = JSON.parse(envP._kv.get('acc:cliente_via_portail') || 'null');
  ok(f && f.portee === 'app' && JSON.stringify(f.acces) === '["chez-lolo"]',
    'son compte est ouvert à CHEZ LOLO (l\'app d\'où elle vient), pas au portail', f && JSON.stringify(f.acces));
  ok((await voir(jp.token, 'chez-lolo.kd-mc.com')).ok === true, 'de retour sur la boutique avec son pass : reconnue');
  ok((await voir(jp.token, 'kd-mc.com')).ok === true, 'et le portail la reconnaît aussi (réception)');
  ok((await voir(jp.token, 'arbre.kd-mc.com')).ok === false, 'mais pas l\'arbre familial');

  jp = await inscrire('curieux', 'Marc Petit', '');
  f = JSON.parse(envP._kv.get('acc:curieux') || 'null');
  ok(f && f.portee === 'app' && Array.isArray(f.acces) && f.acces.length === 0,
    'inscrit directement sur le portail sans venir d\'une app → aucune app ouverte (Kevin décide)', f && JSON.stringify(f.acces));
  ok((await voir(jp.token, 'kd-mc.com')).ok === true && (await voir(jp.token, 'cuisine.kd-mc.com')).ok === false,
    'il a le portail, et rien d\'autre');

  jp = await inscrire('malin', 'Jean Malin', 'https://evil.example.com/');
  f = JSON.parse(envP._kv.get('acc:malin') || 'null');
  ok(f && f.acces.length === 0, 'une origine hors domaine est ignorée (jamais d\'app inventée par le client)', f && JSON.stringify(f.acces));

  const journal = [...envP._kv.values()].some((v) => typeof v === 'string' && v.includes('"nouvel_inscrit"'));
  ok(journal, 'chaque nouvel inscrit limité à une app laisse une trace « nouvel_inscrit » dans le journal admin (Kevin sait qu\'il a une décision à prendre)');
}

/* ── C. Le comportement réel du SSO ────────────────────────────────────────── */
console.log('\nC. /__sso/whoami et /__sso/issue en vrai');
const FICHES = {
  cliente_lolo: { uid: 'cliente_lolo', name: 'Marie Dupont', portee: 'app', acces: ['chez-lolo'] },
  ami_domaine: { uid: 'ami_domaine', name: 'Paul Martin', portee: 'domaine' },
  ancien: { uid: 'ancien', name: 'Ancien Compte' },
  banni: { uid: 'banni', name: 'Jean Bloque', portee: 'domaine', bloque: ['arbre'] },
};
const env = faireEnv(FICHES);

async function jeton(uid, name, host) {
  const r = await mod.fetch(req(host, '/__sso/issue', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ uid, name, cgu: true }),
  }), env);
  return r.json();
}
async function vu(token, host) {
  const r = await mod.fetch(req(host, '/__sso/whoami', { headers: { authorization: 'Bearer ' + token } }), env);
  return r.json();
}

let j = await jeton('cliente_lolo', 'Marie Dupont', 'chez-lolo.kd-mc.com');
ok(j.ok === true, 'la cliente obtient une session sur SA boutique');
const tokLolo = j.token;
let w = await vu(tokLolo, 'chez-lolo.kd-mc.com');
ok(w.ok === true && w.uid === 'cliente_lolo' && w.portee === 'app', 'elle est reconnue sur sa boutique');
w = await vu(tokLolo, 'arbre.kd-mc.com');
ok(w.ok === false && w.hors_perimetre === true && w.reason === 'hors_perimetre',
  'le MÊME jeton ne la reconnaît PAS sur l\'arbre familial');
ok(typeof w.message === 'string' && w.message.length > 10 && !/perimetre|scope|denied/i.test(w.message),
  'le refus est expliqué en français simple, pas en jargon', w.message);

const jRefus = await jeton('cliente_lolo', 'Marie Dupont', 'coffre.kd-mc.com');
ok(jRefus.ok === false && jRefus.hors_perimetre === true,
  'elle ne peut pas non plus se FABRIQUER une session sur une autre app (sinon la porte ne sert à rien)');

j = await jeton('ami_domaine', 'Paul Martin', 'lingua.kd-mc.com');
const tokAmi = j.token;
const partout = ['lingua.kd-mc.com', 'cuisine.kd-mc.com', 'cocina.kd-mc.com', 'studio.kd-mc.com', 'cmcteams.kd-mc.com'];
let nb = 0;
for (const h of partout) { const r = await vu(tokAmi, h); if (r.ok) nb++; }
ok(nb === partout.length, `portée domaine → reconnu sur les ${partout.length} apps testées`, `${nb}/${partout.length}`);

j = await jeton('ancien', 'Ancien Compte', 'cmcteams.kd-mc.com');
ok(j.ok === true && (await vu(j.token, 'arbre.kd-mc.com')).ok === true,
  'un compte SANS portée (comme les existants) circule partout — aucune régression au déploiement');

j = await jeton('banni', 'Jean Bloque', 'lingua.kd-mc.com');
ok(j.ok === true, 'la personne bloquée sur UNE app garde les autres');
w = await vu(j.token, 'arbre.kd-mc.com');
ok(w.ok === false && w.reason === 'bloque_ici', 'et elle est refusée sur l\'app fermée par l\'admin');

/* Nouvelle inscription : fermée à son app, et RIEN d'autre. */
const envNeuf = faireEnv({});
const rN = await mod.fetch(req('chez-lolo.kd-mc.com', '/__sso/issue', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ uid: 'inconnu_1', name: 'Nouveau Venu', cgu: true }),
}), envNeuf);
const jN = await rN.json();
const fiche = JSON.parse(envNeuf._kv.get('acc:inconnu_1') || 'null');
ok(fiche && fiche.portee === 'app' && JSON.stringify(fiche.acces) === '["chez-lolo"]',
  'un NOUVEL inscrit naît fermé à l\'app où il s\'inscrit',
  fiche ? `portee=${fiche.portee} acces=${JSON.stringify(fiche.acces)}` : 'aucune fiche');
const wN = await mod.fetch(req('coffre.kd-mc.com', '/__sso/whoami', { headers: { authorization: 'Bearer ' + jN.token } }), envNeuf);
ok((await wN.json()).ok === false, 'et il n\'est reconnu nulle part ailleurs');

/* ── D. L'admin : jamais enfermé dehors, et seul à pouvoir ranger ──────────── */
console.log('\nD. L\'admin');
const envAdmin = faireEnv({ kdmc_admin: { uid: 'kdmc_admin', name: 'Kevin Desarzens', portee: 'app', acces: ['cmcteams'] } });
const rAdm = await mod.fetch(req('arbre.kd-mc.com', '/__sso/issue', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ uid: 'kdmc_admin', name: 'Kevin Desarzens', cgu: true }),
}), envAdmin);
const jAdm = await rAdm.json();
ok(jAdm.ok === false,
  'un uid admin AUTO-DÉCLARÉ (sans Face ID) est soumis au périmètre comme tout le monde');

/* LE CAS QUI COMPTE LE PLUS : Kevin rangé PAR ERREUR dans une seule app ne doit
   pas se retrouver enfermé dehors de son propre domaine. Sa session Face ID
   (verified) passe outre le périmètre, partout. On fabrique ici une vraie
   session vérifiée avec le secret du test — impossible à forger sans lui. */
const tokVerif = await ssoSign(envAdmin.KDMC_SSO_SECRET, 'kdmc_admin', 'Kevin Desarzens', true, true);
let passe = 0;
const toutes = ['arbre.kd-mc.com', 'coffre.kd-mc.com', 'chez-lolo.kd-mc.com', 'bot.kd-mc.com'];
for (const h of toutes) {
  const r = await mod.fetch(req(h, '/__sso/whoami', { headers: { authorization: 'Bearer ' + tokVerif } }), envAdmin);
  const b = await r.json();
  if (b.ok === true && b.admin === true) passe++;
}
ok(passe === toutes.length,
  'Kevin (Face ID prouvé) reste admin PARTOUT même si sa fiche est rangée « une seule app » — jamais enfermé dehors',
  `${passe}/${toutes.length}`);

for (const m of ['GET', 'POST']) {
  const r = await mod.fetch(req('kd-mc.com', '/__admin/acces?uid=cliente_lolo', {
    method: m, headers: { 'content-type': 'application/json' }, body: m === 'POST' ? '{"uid":"cliente_lolo","portee":"domaine"}' : undefined,
  }), env);
  const b = await r.json().catch(() => ({}));
  ok(b.ok !== true, `/__admin/acces en ${m} sans preuve admin → refusé`, JSON.stringify(b).slice(0, 80));
}
const apres = JSON.parse(env._kv.get('acc:cliente_lolo'));
ok(apres.portee === 'app', 'la tentative non authentifiée n\'a RIEN changé sur la fiche');

/* Et AVEC la preuve du code admin, le réglage marche vraiment — un bouton qui
   refuse tout le monde, admin compris, n'est pas une sécurité, c'est une panne. */
const CODE = '424242';
const HASH = createHash('sha256').update(CODE).digest('hex');
env.KDMC_ADMIN_PIN_SHA256 = HASH;
let rl = await mod.fetch(req('kd-mc.com', '/__admin/login', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: CODE }),
}), env);
const grant = (await rl.json()).grant || (rl.headers.get('set-cookie') || '').match(/kdmc_admin=([^;]+)/)?.[1];
ok(!!grant, 'le code admin donne bien un laissez-passer');

const H = { 'content-type': 'application/json', 'x-kdmc-admin': grant };
let rr = await mod.fetch(req('kd-mc.com', '/__admin/acces', {
  method: 'POST', headers: H, body: JSON.stringify({ uid: 'cliente_lolo', portee: 'domaine' }),
}), env);
let jr = await rr.json();
ok(jr.ok === true && jr.portee === 'domaine', 'l\'admin ouvre la cliente au domaine entier', JSON.stringify(jr).slice(0, 90));
ok((await vu(tokLolo, 'arbre.kd-mc.com')).ok === true,
  'et elle circule IMMÉDIATEMENT partout, sans se reconnecter (son jeton d\'origine suffit)');

rr = await mod.fetch(req('kd-mc.com', '/__admin/acces', {
  method: 'POST', headers: H, body: JSON.stringify({ uid: 'cliente_lolo', bloque: ['arbre'] }),
}), env);
ok((await rr.json()).ok === true, 'l\'admin ferme UNE app à quelqu\'un qui a le domaine');
const wb = await vu(tokLolo, 'arbre.kd-mc.com');
ok(wb.ok === false && wb.reason === 'bloque_ici', 'la fermeture prend effet tout de suite');
ok((await vu(tokLolo, 'chez-lolo.kd-mc.com')).ok === true, 'et ses autres apps restent ouvertes');

rr = await mod.fetch(req('kd-mc.com', '/__admin/acces', {
  method: 'POST', headers: H, body: JSON.stringify({ uid: 'cliente_lolo', portee: 'app', acces: [] }),
}), env);
ok((await rr.json()).ok === false, '« une seule app » sans app choisie est REFUSÉ (sinon la personne n\'a plus rien, sans comprendre)');

rr = await mod.fetch(req('kd-mc.com', '/__admin/acces', {
  method: 'POST', headers: H, body: JSON.stringify({ uid: 'cliente_lolo', portee: 'app', acces: ['chez-lolo', 'app-qui-nexiste-pas'] }),
}), env);
jr = await rr.json();
ok(jr.ok === true && JSON.stringify(jr.acces) === '["chez-lolo"]',
  'une app inventée est ignorée (sinon on croirait avoir ouvert une porte qui n\'existe pas)', JSON.stringify(jr.acces));

rr = await mod.fetch(req('kd-mc.com', '/__admin/acces?uid=cliente_lolo', { headers: { 'x-kdmc-admin': grant } }), env);
jr = await rr.json();
ok(jr.ok === true && Array.isArray(jr.apps) && jr.apps.length >= 20 && jr.portee === 'app',
  `la page admin reçoit la liste des ${(jr.apps || []).length} apps + l'état de la personne`);

console.log('');
if (ko) { console.log(`${ko} problème(s). Le périmètre des apps n'est pas tenu.`); process.exit(1); }
console.log('Périmètre des apps : chaque app distincte, toutes liées, l\'admin décide. ✅');
