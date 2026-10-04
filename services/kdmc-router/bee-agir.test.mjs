/* GARDE — LES MAINS DE BEE : PROPOSER, KEVIN CONFIRME, LE DOMAINE EXÉCUTE — et SEUL Kevin peut le déclencher (Kevin 4.10).
 * Hors ligne : D1 sur SQLite, secret de test, services simulés.
 *   1. signature : valide, falsifiée (corps OU signature), expirée, autre secret, mauvais préfixe, sans secret → rien ;
 *   2. proposer : chaque action contrôle ses champs (date passée / mal écrite / trop lointaine, texte vide, lien javascript:, clé de message
 *      invalide), le RÉSUMÉ est fabriqué par le serveur, une action inconnue est refusée ;
 *   3. POST /__javis/agir — les portes, dans l'ordre : méthode, JSON, origine du domaine OBLIGATOIRE, session admin (un inconnu ne déclenche
 *      RIEN : l'exécution n'est jamais appelée), plafond de débit, bouton (confirme:true), signature, une seule fois (rejouée → 409) ;
 *   4. les actions font vraiment leur travail : rappel (heure de Monaco, été ET hiver) → D1 → l'horloge est armée → sonne UNE fois, noté AVANT
 *      l'envoi ; mémoire (retenir / oublier / plafond) ; répondre / marquer lu / arrêter le robot passent par les portes admin existantes,
 *      AVEC la session de Kevin, et seulement celles de la liste blanche ;
 *   5. les outils de l'IA : proposer_action ne fait QUE préparer (rien n'est exécuté), la boîte est résumée, l'IA ne peut pas sortir de la liste ;
 *   6. 0 écriture KV.
 *   SABOTAGES prouvés à la main : retirer `if (b.confirme !== true)` → (3) rougit ; retirer `premiereFois` → le rejeu passe (3) ; retirer le
 *   préfixe 'bee-agir-v1.' → (1) accepte un jeton d'un autre usage.
 * node services/kdmc-router/bee-agir.test.mjs */
import { DatabaseSync } from 'node:sqlite';
import { signer, verifier, proposer, handleAgir, CATALOGUE, ACTIONS, VALIDITE_MS, monacoVersMs, libelleMonaco, tickRappels, outilsAdmin, memoireBee, resumeBoite, RE_AGIR, REGLES_AGIR } from './bee-agir.js';

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m + (d !== undefined ? ' → ' + String(d).slice(0, 300) : '')); } };
function d1() {
  const s = new DatabaseSync(':memory:');
  const st = (sql, p = []) => ({ bind: (...x) => st(sql, x), first: async () => s.prepare(sql).get(...p) ?? null,
    all: async () => ({ results: s.prepare(sql).all(...p) }), run: async () => { const r = s.prepare(sql).run(...p); return { meta: { changes: Number(r.changes) } }; } });
  return { prepare: (q) => st(q), _s: s };
}
const SECRET = 'secret-de-test-du-domaine';
const kvEcrit = []; const poussees = []; const armees = [];
const nouvelEnv = () => ({ KDMC_SSO_SECRET: SECRET, CERCLE_DB: d1(), KDMC_PUSH_URL: 'https://push.test', KDMC_PUSH_TOKEN: 'jeton-push',
  ACCOUNTS: { get: async () => null, put: async (...a) => { kvEcrit.push(a); } } });
globalThis.fetch = async (u, init) => { u = String(u); if (u.startsWith('https://push.test/send-all')) { poussees.push({ auth: init.headers.authorization, corps: JSON.parse(init.body) }); return new Response('{}', { status: 200 }); } return new Response('inattendu', { status: 599 }); };
const NOW = Date.UTC(2026, 9, 4, 8, 0, 0);   // 4 octobre 2026, 10 h à Monaco (heure d'été)

/* ───────── 1. la signature ───────── */
const env = nouvelEnv();
const champsOk = { texte: 'Appeler Laurence', quand: monacoVersMs('2026-10-05 09:30') };
const jeton = await signer(env, 'rappel', champsOk, NOW);
ok(/^v1\.[A-Za-z0-9_-]+\.[0-9a-f]{64}$/.test(jeton), '1. un jeton a la forme v1.<corps>.<signature>', jeton);
const v = await verifier(env, jeton, NOW);
ok(v && v.a === 'rappel' && v.c.texte === 'Appeler Laurence' && /^[0-9a-f]{24}$/.test(v.n), '1b. un jeton valide se relit', JSON.stringify(v));
const [, corps, sig] = jeton.split('.');
const autreCorps = Buffer.from(JSON.stringify({ a: 'bot_arret', c: {}, exp: NOW + 60e3, n: v.n })).toString('base64url');
ok(await verifier(env, 'v1.' + autreCorps + '.' + sig, NOW) === null, '1c. FALSIFIÉ : on change l\'action en gardant la signature → refusé');
ok(await verifier(env, 'v1.' + corps + '.' + sig.replace(/.$/, sig.endsWith('0') ? '1' : '0'), NOW) === null, '1d. FALSIFIÉ : un chiffre de la signature → refusé');
ok(await verifier(env, jeton, NOW + VALIDITE_MS + 1000) === null, '1e. EXPIRÉ (5 min) → refusé');
ok(await verifier(Object.assign(nouvelEnv(), { KDMC_SSO_SECRET: 'un-autre-secret' }), jeton, NOW) === null, '1f. signé avec un autre secret → refusé');
ok(await verifier(Object.assign(nouvelEnv(), { KDMC_SSO_SECRET: '' }), jeton, NOW) === null && await signer(Object.assign(nouvelEnv(), { KDMC_SSO_SECRET: '' }), 'rappel', {}, NOW) === '', '1g. sans secret : on ne signe rien, on ne valide rien (fail-closed)');
ok(await verifier(env, 'n.importe.quoi', NOW) === null && await verifier(env, '', NOW) === null && await verifier(env, undefined, NOW) === null, '1h. des ordures → refusées sans erreur');
/* séparation d'usage : un jeton signé SANS le préfixe « bee-agir-v1. » (p. ex. un jeton SSO du même secret) ne passe pas */
{ const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const c2 = Buffer.from(JSON.stringify({ a: 'bot_arret', c: {}, exp: NOW + 60e3, n: 'a'.repeat(24) })).toString('base64url');
  const s2 = Buffer.from(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(c2))).toString('hex');
  ok(await verifier(env, 'v1.' + c2 + '.' + s2, NOW) === null, '1i. un jeton signé pour un AUTRE usage (sans le préfixe bee-agir-v1) est refusé'); }

/* ───────── 2. proposer : champs contrôlés, résumé fabriqué par le serveur ───────── */
let p = await proposer(env, 'rappel', { texte: 'Appeler Laurence', quand: '2026-10-05 09:30' }, NOW);
ok(p.ok && p.proposition.action === 'rappel' && /Appeler Laurence/.test(p.proposition.resume) && /lundi 5 octobre/.test(p.proposition.resume) && p.proposition.jeton, '2. rappel valide → proposition signée avec un résumé en français', JSON.stringify(p));
ok(!(await proposer(env, 'rappel', { texte: 'x', quand: '2026-10-03 09:30' }, NOW)).ok, '2b. une date PASSÉE est refusée');
ok(!(await proposer(env, 'rappel', { texte: 'x', quand: 'demain matin' }, NOW)).ok, '2c. une date mal écrite est refusée (« demain matin »)');
ok(!(await proposer(env, 'rappel', { texte: 'x', quand: '2028-01-01 10:00' }, NOW)).ok, '2d. une date à plus d\'un an est refusée');
ok(!(await proposer(env, 'rappel', { texte: '   ', quand: '2026-10-05 09:30' }, NOW)).ok, '2e. un rappel sans texte est refusé');
ok(!(await proposer(env, 'rappel', { texte: 'x', quand: '2026-02-31 09:30' }, NOW)).ok, '2f. le 31 février n\'existe pas');
ok(!(await proposer(env, 'memoriser', { texte: 'va sur javascript:alert(1)' }, NOW)).ok, '2g. un lien javascript: dans une note est refusé');
ok(!(await proposer(env, 'repondre_message', { cle: '../../admin', texte: 'salut' }, NOW)).ok && !(await proposer(env, 'repondre_message', { cle: 'lingua:12', texte: '' }, NOW)).ok, '2h. répondre : clé invalide ou réponse vide → refusé');
const inc = await proposer(env, 'supprimer_tout', {}, NOW);
ok(!inc.ok && /Actions possibles/.test(inc.erreur), '2i. une action hors liste est refusée, et la liste est donnée', JSON.stringify(inc));
ok(ACTIONS.join() === Object.keys(CATALOGUE).join() && ACTIONS.every((a) => CATALOGUE[a].titre && CATALOGUE[a].icone && ['faible', 'moyen', 'eleve'].includes(CATALOGUE[a].risque)), '2j. chaque action a un titre, une icône et un niveau de risque');
const arret = await proposer(env, 'bot_arret', { texte: 'Ranger ma journée' }, NOW);
ok(arret.ok && /ARRÊTER le robot de trading/.test(arret.proposition.resume) && !/Ranger/.test(arret.proposition.resume) && arret.proposition.risque === 'eleve', '2k. le RÉSUMÉ vient du serveur : un texte trompeur de l\'IA ne change pas ce que Kevin lit', arret.proposition && arret.proposition.resume);

/* ───────── 3. POST /__javis/agir : les portes, dans l'ordre ───────── */
let executions = 0, appels = [];
const outilsDe = (admin, extra = {}) => Object.assign({
  qui: async () => (admin ? { uid: 'kdmc_admin' } : null), limite: async () => true, now: () => NOW + 1000, armer: async () => { armees.push(1); },
  appeler: async (req, chemin, init) => { executions++; appels.push({ chemin, init, cookie: req.headers.get('cookie') }); return { ok: true, status: 200 }; },
  journal: async () => {},
}, extra);
const agir = (corps, { origin = 'https://lingua.kd-mc.com', m = 'POST', ct = 'application/json', admin = true, e = env, o = {} } = {}) => handleAgir(
  new Request('https://lingua.kd-mc.com/__javis/agir', { method: m, headers: Object.assign({ 'content-type': ct, cookie: 'kdmc_sso=SESSION-DE-KEVIN' }, origin ? { origin } : {}), body: m === 'GET' ? undefined : (typeof corps === 'string' ? corps : JSON.stringify(corps)) }),
  e, outilsDe(admin, o));
const prop = async (a, c) => (await proposer(env, a, c, NOW)).proposition;
let pr = await prop('bot_arret', {});
let r = await agir({ jeton: pr.jeton, confirme: true }, { m: 'GET' }); ok(r.status === 405, '3. GET → 405');
r = await agir('pas du json', { ct: 'text/plain' }); ok(r.status === 415, '3b. pas du JSON → 415');
r = await agir({ jeton: pr.jeton, confirme: true }, { origin: null }); ok(r.status === 403 && (await r.json()).reason === 'hors_domaine', '3c. SANS Origin → 403 (une écriture exige l\'origine du domaine)');
r = await agir({ jeton: pr.jeton, confirme: true }, { origin: 'https://pirate.example' }); ok(r.status === 403, '3d. Origin d\'un autre site → 403');
r = await agir({ jeton: pr.jeton, confirme: true }, { origin: 'https://kd-mc.com.pirate.example' }); ok(r.status === 403, '3e. Origin « kd-mc.com.pirate.example » → 403 (ancrage de l\'expression)');
r = await agir({ jeton: pr.jeton, confirme: true }, { admin: false });
ok(r.status === 403 && (await r.json()).reason === 'kevin_seulement' && executions === 0, '3f. QUELQU\'UN D\'AUTRE que Kevin (même avec un jeton valide) → 403, et RIEN n\'est exécuté', executions);
r = await agir({ jeton: pr.jeton, confirme: true }, { o: { limite: async () => false } }); ok(r.status === 429 && executions === 0, '3g. trop vite → 429, rien d\'exécuté');
r = await agir({ jeton: pr.jeton }); ok(r.status === 400 && (await r.json()).reason === 'confirmation_requise' && executions === 0, '3h. SANS le bouton (confirme absent) → 400, rien d\'exécuté');
r = await agir({ jeton: pr.jeton, confirme: 'true' }); ok(r.status === 400 && executions === 0, '3i. « confirme » doit être exactement true (pas la chaîne « true »)');
r = await agir({ jeton: 'v1.truc.' + 'a'.repeat(64), confirme: true }); ok(r.status === 400 && executions === 0, '3j. jeton inventé → 400, rien d\'exécuté');
r = await agir({ jeton: pr.jeton.replace(/.$/, pr.jeton.endsWith('0') ? '1' : '0'), confirme: true }); ok(r.status === 400 && executions === 0, '3k. signature touchée → 400');
r = await agir({ jeton: pr.jeton, confirme: true }, { o: { now: () => NOW + VALIDITE_MS + 5000 } }); ok(r.status === 400 && executions === 0, '3l. proposition périmée (> 5 min) → 400');
r = await agir({ jeton: pr.jeton, confirme: true });
let jr = await r.json();
ok(r.status === 200 && jr.ok && executions === 1 && appels[0].chemin === '/__bot/kill' && appels[0].cookie === 'kdmc_sso=SESSION-DE-KEVIN', '3m. le bouton + signature + Kevin → exécuté UNE fois, par la porte admin du robot, AVEC la session de Kevin', JSON.stringify([r.status, jr, appels]));
r = await agir({ jeton: pr.jeton, confirme: true }); jr = await r.json();
ok(r.status === 409 && jr.reason === 'deja_utilisee' && executions === 1, '3n. REJOUER la même proposition → 409, pas de 2ᵉ exécution', JSON.stringify([r.status, jr, executions]));
/* le registre « déjà utilisé » vit dans D1 : une 2ᵉ instance (même base) refuse aussi */
ok(env.CERCLE_DB._s.prepare('SELECT COUNT(*) AS n FROM bee_agir_vus').get().n === 1, '3o. le jeton utilisé est inscrit dans D1 (partagé entre les instances du Worker)');
/* une porte qui échoue → l'échec est dit, pas un faux « fait » */
pr = await prop('marquer_lu', { cle: 'lingua:12' });
r = await agir({ jeton: pr.jeton, confirme: true }, { o: { appeler: async () => ({ ok: false, status: 403, reason: 'admin_requis' }) } }); jr = await r.json();
ok(r.status === 502 && jr.ok === false && /pas pu/.test(jr.texte), '3p. la porte admin refuse → Bee le dit honnêtement (pas de faux « fait »)', JSON.stringify(jr));

/* ───────── 4. les actions font vraiment leur travail ───────── */
ok(monacoVersMs('2026-10-05 09:30') === Date.UTC(2026, 9, 5, 7, 30), '4. 9 h 30 à Monaco en octobre (été, UTC+2) = 7 h 30 UTC');
ok(monacoVersMs('2026-12-24 20:00') === Date.UTC(2026, 11, 24, 19, 0), '4b. 20 h à Monaco en décembre (hiver, UTC+1) = 19 h UTC');
ok(monacoVersMs('2026-03-29 02:30') !== null && monacoVersMs('2026-10-25 02:30') !== null, '4c. les nuits de changement d\'heure ne plantent pas');
ok(/lundi 5 octobre/.test(libelleMonaco(Date.UTC(2026, 9, 5, 7, 30))) && /9/.test(libelleMonaco(Date.UTC(2026, 9, 5, 7, 30))), '4d. le libellé est lu en heure de Monaco', libelleMonaco(Date.UTC(2026, 9, 5, 7, 30)));
/* rappel de bout en bout */
const e2 = nouvelEnv(); armees.length = 0;
pr = (await proposer(e2, 'rappel', { texte: 'Appeler Laurence', quand: '2026-10-04 10:30' }, NOW)).proposition;
r = await handleAgir(new Request('https://x.kd-mc.com/__javis/agir', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://x.kd-mc.com' }, body: JSON.stringify({ jeton: pr.jeton, confirme: true }) }), e2, outilsDe(true));
jr = await r.json();
ok(r.status === 200 && jr.ok && /C'est noté/.test(jr.texte) && armees.length === 1, '4e. rappel confirmé → écrit en D1 et l\'horloge est ARMÉE', JSON.stringify(jr));
ok(e2.CERCLE_DB._s.prepare('SELECT COUNT(*) AS n FROM bee_rappels WHERE fait = 0').get().n === 1, '4f. le rappel attend en D1');
poussees.length = 0;
let restants = await tickRappels(e2, Date.UTC(2026, 9, 4, 8, 29));   // 10 h 29 : pas encore
ok(poussees.length === 0 && restants === 1, '4g. avant l\'heure : rien ne sonne, l\'horloge continue', JSON.stringify([poussees.length, restants]));
restants = await tickRappels(e2, Date.UTC(2026, 9, 4, 8, 31));      // 10 h 31 : sonne
ok(poussees.length === 1 && poussees[0].corps.payload.body === 'Appeler Laurence' && /Rappel/.test(poussees[0].corps.payload.title) && poussees[0].auth === 'Bearer jeton-push' && restants === 0, '4h. à l\'heure : la notification part vers Kevin, il n\'en reste plus', JSON.stringify(poussees[0]));
await tickRappels(e2, Date.UTC(2026, 9, 4, 8, 40));
ok(poussees.length === 1, '4i. UNE seule fois (noté avant l\'envoi, pas de double sonnerie)');
/* mémoire */
const e3 = nouvelEnv();
const run = async (a, c, e = e3, o) => { const x = (await proposer(e, a, c, NOW)).proposition; const rr = await handleAgir(new Request('https://x.kd-mc.com/__javis/agir', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://x.kd-mc.com' }, body: JSON.stringify({ jeton: x.jeton, confirme: true }) }), e, outilsDe(true, o)); return rr.json(); };
await run('memoriser', { texte: 'Kevin préfère les réunions le matin' });
await run('memoriser', { texte: 'La boulangerie de Laurence ferme le lundi' });
const mem = await memoireBee(e3);
ok(/réunions le matin/.test(mem) && /boulangerie/.test(mem), '4j. les faits retenus sont rendus à Bee (ils entrent dans sa tête à chaque conversation)', mem);
const oub = await run('oublier', { texte: 'boulangerie' });
ok(/Oublié \(1 fait\)/.test(oub.texte) && !/boulangerie/.test(await memoireBee(e3)), '4k. oublier retire le fait demandé, pas les autres', JSON.stringify(oub));
for (let i = 0; i < 45; i++) e3.CERCLE_DB._s.prepare('INSERT INTO bee_memoire (fait, cree) VALUES (?, 0)').run('fait ' + i);
const plein = await run('memoriser', { texte: 'un de trop' });
ok(plein.ok === false && /pleine/.test(plein.texte), '4l. mémoire pleine (40 faits) → refusé, dit clairement');
/* répondre / marquer lu : mêmes portes que la boîte, avec la session de Kevin */
appels = [];
await run('repondre_message', { cle: 'lingua:12', texte: 'Merci, à demain !' }, env, undefined);
ok(appels.length === 1 && appels[0].chemin === '/__boite/admin/repondre' && appels[0].init.json.cle === 'lingua:12' && appels[0].init.json.texte === 'Merci, à demain !', '4m. répondre → POST /__boite/admin/repondre {cle, texte}', JSON.stringify(appels));
await run('marquer_lu', { cle: 'depot:7' }, env, undefined);
ok(appels[1].chemin === '/__boite/admin/lu' && appels[1].init.json.cles[0] === 'depot:7', '4n. marquer lu → POST /__boite/admin/lu {cles}');

/* ───────── 5. les outils de l'IA ───────── */
executions = 0; appels = [];
const sortie = {};
const mains = outilsAdmin(env, { now: () => NOW, appeler: async (chemin) => { appels.push(chemin); return chemin === '/__boite/admin'
  ? { ok: true, nonLus: 2, messages: [{ cle: 'lingua:12', source: 'lingua', de: 'Marie', texte: 'Tu viens samedi ?', nonLus: 1 }, { cle: 'depot:3', source: 'depots', de: 'Anonyme', texte: 'Bonjour', nonLus: 0 }, { cle: 'alerte:1', source: 'alertes', de: 'Domaine', texte: 'Nouvelle connexion', nonLus: 1 }] }
  : { ok: true }; }, apps: () => '• lingua → https://lingua.kd-mc.com/' }, sortie);
ok(mains.defs.map((d) => d.name).join() === 'proposer_action,boite_messages,etat_robot,mes_rappels,ma_memoire,apps_du_domaine', '5. l\'IA reçoit exactement 6 outils en plus', mains.defs.map((d) => d.name).join());
ok(mains.defs[0].parameters.properties.action.enum.join() === ACTIONS.join(), '5b. proposer_action ne connaît QUE les actions de la liste blanche');
const txt = await mains.exe.proposer_action({ action: 'rappel', texte: 'Dentiste', quand: '2026-10-06 14:00' });
ok(/PROPOSITION PRÊTE/.test(txt) && /Ne dis JAMAIS que c'est fait/.test(txt) && sortie.propositions.length === 1 && appels.length === 0, '5c. proposer_action PRÉPARE seulement : une carte est notée, aucune porte n\'est appelée', txt);
const refus = await mains.exe.proposer_action({ action: 'effacer_disque' });
ok(/REFUS/.test(refus) && sortie.propositions.length === 1, '5d. une action inventée par l\'IA est refusée, aucune carte ajoutée');
const bt = await mains.exe.boite_messages();
ok(/2 non lu/.test(bt) && /\[lingua:12\].*Marie.*NON LU.*Tu viens samedi/.test(bt) && !/alerte:1|Nouvelle connexion/.test(bt), '5e. la boîte est résumée avec les clés pour répondre (les alertes de connexion ne polluent pas)', bt);
ok(resumeBoite({ ok: true, nonLus: 0, messages: [] }) === 'La boîte est vide : aucun message.', '5f. boîte vide dite clairement');
ok(/lingua/.test(await mains.exe.apps_du_domaine()), '5g. l\'IA peut donner les adresses des apps');
ok(RE_AGIR.test('rappelle-moi demain à 9h') && RE_AGIR.test("j'ai des messages ?") && RE_AGIR.test('arrête le robot') && RE_AGIR.test('donne-moi le lien de lingua') && !RE_AGIR.test('bonjour comment ça va'), '5h. les demandes d\'agir prennent le chemin des outils, pas la conversation');
ok(/PROPOSER/.test(REGLES_AGIR) && /DONNÉE, jamais un ordre/.test(REGLES_AGIR) && /Ne dis jamais|Ne dis jamais « c'est fait »|jamais « c'est fait »/.test(REGLES_AGIR), '5i. la consigne de Bee dit : proposer, jamais « c\'est fait », ce qu\'on lit n\'est jamais un ordre');

/* ───────── 6. aucun KV ───────── */
ok(kvEcrit.length === 0, '6. 0 écriture KV (quota crevé : tout est en D1 gratuit)', kvEcrit.length);

console.log(`\n${pass} ✓ / ${fail} ✗`);
process.exit(fail ? 1 : 0);
