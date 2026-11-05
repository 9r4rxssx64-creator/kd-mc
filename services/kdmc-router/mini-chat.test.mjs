/* GARDE — LE MINI-CHAT DIRECT KEVIN ⇄ CHAQUE PERSONNE (Kevin 5.11.2026).
 * D1 simulée par le SQLite de Node. Prouve : un fil par personne et SEULEMENT avec Kevin ; une personne ne lit jamais le fil d'une autre ;
 * un nom déclaré sans code n'ouvre rien ; la clé ne dépend ni de l'ordre ni des accents ni du matricule ; lu / non lu / badge ;
 * réponse ; vider (chacun sa vue) ; retirer ; réactions ; limites ; origine du domaine exigée ; notification au premier message seulement ;
 * coût D1 borné (aucune lecture hors du fil).   SABOTAGE=cle → la clé ignore le nom (le garde doit rougir).
 * node services/kdmc-router/mini-chat.test.mjs */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/* SABOTAGE : on importe une COPIE volontairement cassée du module ; le garde doit rougir (preuve qu'il discrimine).
 *   cle    → tous les fils se mélangent (la clé ne dépend plus du nom)
 *   prouve → un nom déclaré sans code ouvre le fil
 *   admin  → n'importe quelle personne passe pour Kevin
 *   lien   → le fil n'est plus lié à un compte (un homonyme dans l'autre ordre le lit : le BLOQUANT de la revue sécurité du 5.11) */
const SAB = process.env.SABOTAGE || '';
let chemin = new URL('./mini-chat.js', import.meta.url);
if (SAB) {
  let code = readFileSync(chemin, 'utf8');
  const avant = code;
  if (SAB === 'cle') code = code.replace("const cle = mots.sort().join('-');", "const cle = 'tous-pareil';");
  if (SAB === 'prouve') code = code.replace('if (!qui.prouve) return', 'if (false) return');
  if (SAB === 'lien') code = code.replace('if (f && f.uid && f.uid !== qui.uid) return', 'if (false) return');
  if (SAB === 'admin') code = code.replace('if (!qui.admin) return J({ ok: false, reason: \'admin_requis\' }, 401);', '');
  if (code === avant) { console.log('SABOTAGE inconnu ou sans effet : ' + SAB); process.exit(2); }
  const f = join(mkdtempSync(join(tmpdir(), 'dm-sab-')), 'mini-chat.js'); writeFileSync(f, code); chemin = pathToFileURL(f);
}
const { handleDm, cleDe, nettoyer, LIMITES, REACTIONS } = await import(chemin.href);

let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d !== undefined ? '  → ' + JSON.stringify(d).slice(0, 300) : ''}`); };

function d1() {
  const s = new DatabaseSync(':memory:'); const lu = []; let nbLignes = 0;
  const stmt = (sql, p = []) => ({
    bind: (...x) => stmt(sql, x),
    first: async () => { const r = s.prepare(sql).get(...p) ?? null; if (r) nbLignes++; return r; },
    all: async () => { const rs = s.prepare(sql).all(...p); nbLignes += rs.length; lu.push(sql); return { results: rs }; },
    run: async () => { const r = s.prepare(sql).run(...p); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
  });
  return { prepare: (sql) => stmt(sql), _s: s, _lu: lu, get _n() { return nbLignes; } };
}
const db = d1();
const env = { CERCLE_DB: db };
let T = Date.parse('2026-11-05T09:00:00Z');
const notes = [];
const gens = {
  kev: { uid: 'kdmc_admin', nom: 'Admin KDMC', admin: true, prouve: true },
  lea: { uid: 'lea-martin', nom: 'MARTIN Léa', admin: false, prouve: true },
  leo: { uid: 'leo-roux', nom: 'Léo ROUX', admin: false, prouve: true },
  fauxlea: { uid: 'x', nom: 'Léa Martin', admin: false, prouve: false },     /* nom déclaré, code NON prouvé */
  seul: { uid: 'y', nom: 'Léa', admin: false, prouve: true },
  menteur: { uid: 'm', nom: 'Max MENTEUR', admin: false, prouve: true },
  attente: { uid: 'att', nom: 'Zoé ATTENTE', admin: false, prouve: true, attente: true },   /* compte pas encore validé */
};
const outils = {
  qui: async (r) => gens[r.headers.get('x-test')] || null,
  notifier: async (t, x) => { notes.push(t + ' | ' + x); },
  now: () => T,
  connu: async (nom) => /martin/i.test(nom),
  /* registre des comptes simulé : l'uid canonique du compte qui porte ce nom complet, tous ordres confondus */
  uidDe: async (nom) => (/martin/i.test(nom) ? 'lea-martin' : /roux/i.test(nom) ? 'leo-roux' : ''),
};
const appel = async (qui, chemin, corps, extra) => {
  const h = Object.assign({ 'x-test': qui || '', 'content-type': 'application/json', origin: 'https://cmcteams.kd-mc.com' }, extra || {});
  const url = new URL('https://kd-mc.com/__dm' + chemin);
  const r = await handleDm(new Request(url, { method: corps === undefined ? 'GET' : 'POST', headers: h, body: corps === undefined ? undefined : JSON.stringify(corps) }), url, env, outils);
  return Object.assign(await r.json(), { _st: r.status });
};

console.log('\nLe mini-chat direct Kevin ⇄ chaque personne\n');

/* 1. la clé du fil */
const cle1 = cleDe('MARTIN Léa');
ok(cle1 === 'lea-martin' && cleDe('Léa Martin') === cle1 && cleDe('martin-LÉA') === cle1 && cleDe('  Martin   Lea ') === cle1, '1a. même fil quel que soit l\'ordre, l\'accent, la casse ou le tiret', cle1);
ok(cleDe('Léa') === '' && cleDe('') === '' && cleDe(null) === '', '1b. un prénom seul n\'identifie personne : pas de fil');
ok(cleDe('Jean Pierre Dupont') === 'dupont-jean-pierre' && cleDe('A B C D E F G H I') === '', '1c. prénoms composés gardés, noms démesurés refusés');
ok(cleDe('Léa Martin') !== cleDe('Léo Roux'), '1d. deux personnes, deux fils');
ok(nettoyer('  bonjour\u0000‮  \n\n\n\nsalut ') === 'bonjour\n\nsalut' && nettoyer('x'.repeat(900)).length === LIMITES.texteMax, '1e. texte nettoyé (contrôles, inversion de sens, lignes vides) et plafonné');

/* 2. qui a le droit */
ok((await appel('', '/mon'))._st === 401, '2a. sans compte : 401');
ok((await appel('fauxlea', '/mon'))._st === 401 && (await appel('fauxlea', '/mon')).reason === 'code_requis', '2b. un nom déclaré SANS code prouvé n\'ouvre rien');
ok((await appel('seul', '/mon'))._st === 403, '2c. un compte à prénom seul : refusé (pas de fil sans nom complet)');
ok((await appel('lea', '/admin/liste'))._st === 401 && (await appel('lea', '/admin/fil?nom=Léo Roux'))._st === 401 && (await appel('lea', '/admin/ecrire', { nom: 'Léo Roux', texte: 'x' }))._st === 401, '2d. une personne ne peut ni lister, ni lire, ni écrire à la place de Kevin');
ok((await appel('kev', '/admin/ecrire', { nom: 'Léa Martin', texte: 'x' }, { origin: 'https://site-pirate.example' }))._st === 403 && (await appel('lea', '/envoyer', { texte: 'x' }, { origin: '' }))._st === 403, '2e. écrire depuis un site tiers (ou sans origine) : 403');
ok((await appel('kev', '/mon')).admin === true, '2f. Kevin n\'a pas de fil avec lui-même');

/* 3. Kevin écrit, la personne le lit à sa prochaine connexion, puis répond */
const e1 = await appel('kev', '/admin/ecrire', { nom: 'MARTIN Léa', texte: 'Salut Léa, peux-tu passer me voir lundi ?' });
ok(e1.ok && e1.messages.length === 1 && e1.messages[0].moi === true && e1.messages[0].lu === false, '3a. Kevin écrit : message envoyé, pas encore lu', e1);
const badge = await appel('lea', '/badge');
ok(badge.ok && badge.nonLus === 1, '3b. à son ouverture, le badge de Léa dit 1 message non lu', badge);
const mon = await appel('lea', '/mon');
ok(mon.ok && mon.messages.length === 1 && mon.messages[0].moi === false && mon.messages[0].texte.startsWith('Salut Léa'), '3c. Léa voit le message de Kevin', mon);
await appel('lea', '/lu', {});
ok((await appel('lea', '/badge')).nonLus === 0, '3d. une fois lu, le badge retombe à 0');
const vuK = await appel('kev', '/admin/fil?nom=Léa Martin');
ok(vuK.messages[0].lu === true && vuK.messages[0].lu_at === T && vuK.compte === true, '3e. Kevin voit « lu » (avec l\'heure) et que le compte de Léa existe', vuK);
T += 60000;
const r1 = await appel('lea', '/envoyer', { texte: 'Oui, pas de souci !' });
ok(r1.ok && r1.messages.length === 2 && r1.messages[1].moi === true, '3f. Léa répond', r1);
ok(notes.length === 1 && /Léa|MARTIN/i.test(notes[0]) && notes[0].includes('Oui, pas de souci'), '3g. Kevin est prévenu (notification) au 1er message', notes);
T += 1000; await appel('lea', '/envoyer', { texte: 'Et à quelle heure ?' });
ok(notes.length === 1, '3h. pas de 2e notification tant que Kevin n\'a pas lu (pas de pluie de notifications)', notes);
const liste = await appel('kev', '/admin/liste');
ok(liste.ok && liste.nonLus === 2 && liste.fils.length === 1 && liste.fils[0].nom === 'MARTIN Léa' && liste.fils[0].dernier === 'Et à quelle heure ?' && liste.fils[0].dernier_de === 'm', '3i. la liste de Kevin montre la personne, le dernier message et 2 non lus', liste);
await appel('kev', '/admin/lu', { nom: 'Léa Martin' });
ok((await appel('kev', '/admin/liste')).nonLus === 0, '3j. Kevin lit : plus aucun non lu');

/* 4. confidentialité : un fil n'est lisible que par SA personne et Kevin */
await appel('kev', '/admin/ecrire', { nom: 'Léo Roux', texte: 'Message pour Léo seulement' });
const leo = await appel('leo', '/mon');
ok(leo.messages.length === 1 && leo.messages[0].texte === 'Message pour Léo seulement', '4a. Léo ne voit que SON fil');
ok(!JSON.stringify(leo).includes('Salut Léa') && !JSON.stringify(await appel('lea', '/mon')).includes('Léo seulement'), '4b. rien d\'un fil ne passe dans l\'autre');
const bad = await appel('lea', '/retirer', { id: leo.messages[0].id });
ok((await appel('leo', '/mon')).messages[0].retire === false, '4c. Léa ne peut pas retirer un message du fil de Léo (même en connaissant son numéro)', bad);
const reac = await appel('lea', '/reagir', { id: leo.messages[0].id, emoji: '👍' });
ok(reac._st === 404 && (await appel('leo', '/mon')).messages[0].reac.autre === '', '4d. Léa ne peut pas réagir dans le fil de Léo', reac);
ok((await appel('menteur', '/mon')).messages.length === 0, '4e. une 3ᵉ personne n\'a que son propre fil (vide)');
/* REVUE SÉCURITÉ 5.11 : le fil est LIÉ au compte. Un homonyme inscrit dans l'autre ordre des mots (autre uid, même clé) n'y entre pas. */
gens.lea2 = { uid: 'autre-uid', nom: 'Martin LÉA', admin: false, prouve: true };
const intrus = await appel('lea2', '/mon');
ok(intrus._st === 403 && intrus.reason === 'autre_compte' && !JSON.stringify(intrus).includes('Salut'), '4f. un homonyme (autre compte, nom dans l\'autre ordre) ne lit PAS le fil de Léa', intrus);
const intrusEnvoi = await appel('lea2', '/envoyer', { texte: 'Je suis Léa' });
ok(intrusEnvoi._st === 403 && (await appel('kev', '/admin/fil?nom=Léa Martin')).messages.every((x) => x.texte !== 'Je suis Léa'), '4g. ni écrire à Kevin « en tant que Léa » (le fil de Léa reste propre)', intrusEnvoi);
ok((await appel('lea2', '/badge'))._st === 403 && (await appel('lea2', '/lu', {}))._st === 403 && (await appel('lea2', '/vider', {}))._st === 403, '4h. ni badge, ni « lu », ni « vider » depuis un autre compte');
ok((await appel('lea', '/mon')).messages.length === 3, '4i. Léa (son vrai compte) retrouve son fil intact');
ok((await appel('kev', '/admin/fil?nom=Léa Martin')).lie === true, '4j. Kevin voit que le fil est lié à un compte');
/* un compte en attente de validation n'ouvre rien */
ok((await appel('attente', '/mon'))._st === 403 && (await appel('attente', '/envoyer', { texte: 'coucou' }))._st === 403, '4k. un compte en attente de validation ne lit ni n\'écrit');
/* fil écrit AVANT que le compte existe : le premier compte vérifié qui l'ouvre le prend, le suivant est refusé ; Kevin peut délier */
await appel('kev', '/admin/ecrire', { nom: 'Noé Inconnu', texte: 'Bienvenue Noé' });
gens.noe = { uid: 'noe-1', nom: 'Noé INCONNU', admin: false, prouve: true }; gens.noe2 = { uid: 'noe-2', nom: 'Inconnu Noé', admin: false, prouve: true };
ok((await appel('noe', '/mon')).messages.length === 1 && (await appel('noe2', '/mon'))._st === 403, '4l. fil sans compte au départ : le premier compte vérifié le prend, l\'homonyme est refusé');
await appel('kev', '/admin/delier', { nom: 'Noé Inconnu' });
ok((await appel('noe2', '/mon')).messages.length === 1 && (await appel('noe', '/mon'))._st === 403, '4m. Kevin délie : le fil passe au prochain compte vérifié qui l\'ouvre');
ok((await appel('noe', '/admin/delier', { nom: 'Noé Inconnu' }))._st === 401, '4n. seul Kevin peut délier');
/* écrire à un nom qui a déjà un compte : le fil est lié tout de suite à CE compte (un homonyme arrivé avant la vraie personne ne le prend pas) */
await appel('kev', '/admin/ecrire', { nom: 'Roux Léo', texte: 'Pour le vrai Léo' });
gens.faux = { uid: 'faux-leo', nom: 'Roux LÉO', admin: false, prouve: true };
ok((await appel('faux', '/mon'))._st === 403, '4o. Kevin écrit à un nom qui a un compte : le fil est lié à ce compte, un homonyme arrivé le premier ne le prend pas');
/* un message trop gros est refusé avant lecture */
ok((await appel('lea', '/envoyer', { texte: 'x'.repeat(5000) }, { 'content-length': '5000' }))._st === 413, '4p. corps de plus de 4 Ko : refusé');

/* 5. historique : vider (chacun sa vue), retirer, réactions */
const rr = await appel('lea', '/reagir', { id: mon.messages[0].id, emoji: '❤️' });
ok(rr.ok && rr.messages[0].reac.moi === '❤️', '5a. Léa réagit ❤️ au message de Kevin');
ok((await appel('kev', '/admin/fil?nom=Léa Martin')).messages[0].reac.autre === '❤️', '5b. Kevin voit la réaction de Léa');
ok((await appel('lea', '/reagir', { id: mon.messages[0].id, emoji: '❤️' })).messages[0].reac.moi === '', '5c. même réaction = on l\'enlève');
ok((await appel('lea', '/reagir', { id: mon.messages[0].id, emoji: '💣' })).messages[0].reac.moi === '', '5d. une réaction hors liste est ignorée');
const ret = await appel('lea', '/retirer', { id: r1.messages[1].id });
const apresRetrait = await appel('kev', '/admin/fil?nom=Léa Martin');
ok(ret.ok && apresRetrait.messages.find((x) => x.id === r1.messages[1].id).retire === true && apresRetrait.messages.find((x) => x.id === r1.messages[1].id).texte === '', '5e. Léa retire son message : effacé des DEUX côtés (le texte n\'existe plus)');
ok(db._s.prepare('SELECT texte FROM dm WHERE id = ?').get(r1.messages[1].id).texte === '', '5f. et il est vraiment effacé de la base, pas seulement caché');
await appel('lea', '/vider', {});
ok((await appel('lea', '/mon')).messages.length === 0 && (await appel('kev', '/admin/fil?nom=Léa Martin')).messages.length === 3, '5g. Léa vide SA vue : Kevin garde la sienne');
await appel('kev', '/admin/ecrire', { nom: 'Léa Martin', texte: 'Merci Léa' });
ok((await appel('lea', '/mon')).messages.length === 1 && (await appel('lea', '/badge')).nonLus === 1, '5h. un nouveau message réapparaît chez Léa après son « vider »');
await appel('kev', '/admin/vider', { nom: 'Léa Martin' });
ok((await appel('kev', '/admin/fil?nom=Léa Martin')).messages.length === 0 && (await appel('lea', '/mon')).messages.length === 1, '5i. Kevin vide SA vue : Léa garde la sienne');
await appel('lea', '/vider', {});
ok(db._s.prepare('SELECT COUNT(*) n FROM dm WHERE cle = ?').get('lea-martin').n === 0 && !(await appel('kev', '/admin/liste')).fils.some((f) => f.cle === 'lea-martin'), '5j. quand les deux ont vidé, plus rien ne reste en base (ni message ni ligne de liste)');

/* 6. limites */
let dernier;
for (let i = 0; i < LIMITES.parJour + 3; i++) { T += 1000; dernier = await appel('leo', '/envoyer', { texte: 'msg ' + i }); }
ok(dernier._st === 429 && dernier.reason === 'trop_de_messages', '6a. plus de 40 messages par jour : 429', dernier);
T += 86400000 + 5000;
ok((await appel('leo', '/envoyer', { texte: 'le lendemain' })).ok, '6b. le lendemain, ça repart');
ok((await appel('leo', '/envoyer', { texte: '   ' }))._st === 400 && (await appel('kev', '/admin/ecrire', { nom: 'Léo Roux', texte: '' }))._st === 400, '6c. un message vide est refusé');
for (let i = 0; i < 160; i++) { T += 1000; await appel('kev', '/admin/ecrire', { nom: 'Léo Roux', texte: 'K' + i }); }
const nbLeo = db._s.prepare('SELECT COUNT(*) n FROM dm WHERE cle = ?').get('leo-roux').n;
ok(nbLeo <= LIMITES.historique + 1 && (await appel('leo', '/mon')).messages.length === LIMITES.vue, '6d. l\'historique reste petit (' + nbLeo + ' gardés) et la vue montre les ' + LIMITES.vue + ' derniers', nbLeo);
ok((await appel('kev', '/admin/ecrire', { nom: 'Léa', texte: 'x' }))._st === 400, '6e. écrire à un prénom seul : refusé (il faut nom ET prénom)');

/* 7. coût D1 borné : une ouverture de l'app = 1 ligne ; une lecture de fil ne sort jamais d'une seule clé */
const avant = db._n; await appel('menteur', '/badge');
ok(db._n - avant <= 1, '7a. le badge d\'une personne lit au plus 1 ligne', db._n - avant);
const balayages = db._lu.filter((s) => /FROM dm\b(?! WHERE cle)/i.test(s) && !/WHERE/i.test(s));
ok(balayages.length === 0, '7b. aucune requête ne parcourt la table entière des messages', balayages);
const src = readFileSync(new URL('./mini-chat.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
ok(!/COUNT\(\*\)/.test(src) && !/ACCOUNTS|\.put\(/.test(src) && !/firebase/i.test(src), '7c. jamais de COUNT(*), jamais le KV, jamais Firebase dans le module');
ok(REACTIONS.length === 5, '7d. cinq réactions');

console.log(`\n${fail ? '✗' : '✓'} mini-chat : ${pass} vérifications vertes, ${fail} rouges`);
process.exit(fail ? 1 : 0);
