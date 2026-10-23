/* GARDE — « IL DOIT POUVOIR TOUT FAIRE DANS N'IMPORTE QUELLE APP DU DOMAINE… » (Kevin 16.10.2026), CE QU'IL A OUVERT : LIRE PLUS, GÉRER LES COMPTES, RÉGLER LE ROBOT —
 * derrière son bouton ✅, SEUL KEVIN S'EN SERT, et ce qu'il a gardé fermé RESTE fermé (coffre et clés, code admin, créer un compte avec un code, argent réel, arbre publié).
 * Avec le VRAI routeur, de vraies sessions, de fausses IA :
 *   1. lire plus : personnes attendues, bannies, demandes Rotaplan (jamais l'e-mail) ; les secrets sont retirés de ce qui part à l'IA ; la porte du robot est atteinte avec la session de Kevin ;
 *   2. ouvrir un compte en attente · supprimer un compte (copie 30 jours, nom libéré, ban facultatif ; JAMAIS l'admin, ni par la carte ni par la porte) · lever un bannissement · attendus ;
 *   3. le robot : IA pilote en auto / off, lancer une décision, annuler l'essai — et jamais le mode réel ;
 *   4. le NOM de la carte vient du domaine ; un compte inconnu, SON propre compte, un identifiant tordu : refusés AVANT la carte ;
 *   5. un autre compte, un inconnu, une signature trafiquée, une carte rejouée : rien ne bouge ;
 *   6. la liste blanche est EXACTE (29 portes, nommées) et ne contient aucune des portes que Kevin a gardées fermées ;
 *   7. 0 € : aucun moteur payant.
 * node services/kdmc-router/bee-droits-plus.test.mjs */
import { readFileSync } from 'node:fs';
import { createHash, createHmac } from 'node:crypto';
import mod from './worker.js';
import { proposer, signer, CATALOGUE, ACTIONS, RE_AGIR } from './bee-agir.js';
import { DROITS_PLUS, ACTIONS_DROITS_PLUS, RE_DROITS_PLUS, compact, resumeScan, resumeDemandes, outilsLecturePlus } from './bee-droits-plus.js';

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m + (d !== undefined ? ' → ' + String(d).slice(0, 300) : '')); } };
const vraiFetch = globalThis.fetch;
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const signe = (uid, v) => { const p = b64u(JSON.stringify({ u: uid, n: uid, c: 1, v: v ? 1 : 0, iat: Date.now(), exp: Date.now() + 1e9 })); return p + '.' + b64u(createHmac('sha256', 'sec').update(p).digest()); };

/* ── le KV : trois comptes (deux « ordinaires », l'admin) et un code enregistré ── */
const kv = new Map();
const put = (k, v) => kv.set(k, typeof v === 'string' ? v : JSON.stringify(v));
const compte = (uid, name, extra) => Object.assign({ uid, name, verified: true, portee: 'domaine', acces: [], bloque: [], last_seen: Date.now() - 3600e3, tel: '+33 0 00 00 00 00', ip: '203.0.113.9', appareils: [{ ua: 'iPhone X' }], hash: 'f'.repeat(64), lieu: 'Quelque part' }, extra || {});
function remettre() {
  kv.clear();
  put('acc:zelie_testard', compte('zelie_testard', 'Zélie TESTARD'));
  put('acc:octave_testard', compte('octave_testard', 'Octave TESTARD', { portee: 'app', acces: ['lingua'] }));
  put('acc:kdmc_admin', compte('kdmc_admin', 'Kevin ADMIN'));
  put('idx:uids', ['zelie_testard', 'octave_testard', 'kdmc_admin']);
  put('cred:zelie_testard', { sel: 'x', h: 'y' });
  put('aud:log', [{ ts: Date.now() - 60e3, ev: 'login', uid: 'zelie_testard', ip: '203.0.113.9', ua: 'iPhone', lieu: 'Quelque part' }]);
}
const kvEcrit = [];
const ACCOUNTS = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); kvEcrit.push(k); }, delete: async (k) => { kv.delete(k); }, list: async () => ({ keys: [], list_complete: true }) };
const IA_SCRIPT = { cerebras: [], groq: [] }; const IA_VUES = []; let reseau = [];
globalThis.fetch = async (url, init) => {
  const u = String(url); reseau.push(u);
  const R = (corps, st) => new Response(JSON.stringify(corps), { status: st || 200, headers: { 'content-type': 'application/json' } });
  const four = /cerebras/.test(u) ? 'cerebras' : /groq/.test(u) ? 'groq' : '';
  if (four) { const corps = JSON.parse(init.body); IA_VUES.push({ four, corps }); const rep = IA_SCRIPT[four].shift(); return rep ? R({ choices: [{ message: rep }] }) : R({ error: 'plus de réponse prévue' }, 500); }
  return R({ error: 'réseau non prévu : ' + u }, 599);
};
const env = { KDMC_SSO_SECRET: 'sec', KDMC_PORTE_TOTALE: '0', KDMC_ADMIN_PIN_SHA256: createHash('sha256').update('424242').digest('hex'), ACCOUNTS, CEREBRAS_API_KEY: 'c', GROQ_API_KEY: 'g', AI: { run: async () => ({ response: 'ancien chemin' }) } };
const att = []; const ctx = { waitUntil: (x) => att.push(x), passThroughOnException() {} };
const req = async (hote, chemin, { m = 'GET', headers = {}, corps } = {}) => { const r = await mod.fetch(new Request('https://' + hote + chemin, { method: m, headers, body: corps === undefined ? undefined : JSON.stringify(corps) }), env, ctx); await Promise.allSettled(att.splice(0)); return r; };
remettre();
const login = await req('kd-mc.com', '/__admin/login', { m: 'POST', headers: { 'content-type': 'application/json', origin: 'https://kd-mc.com' }, corps: { code: '424242' } });
const sc = login.headers.getSetCookie ? login.headers.getSetCookie() : [login.headers.get('set-cookie') || ''];
const KEVIN = { cookie: sc.map((c) => c.split(';')[0]).join('; ') };
const AUTRE = { cookie: 'kdmc_sso=' + signe('zelie_testard', true) };
ok(/kdmc_sso=/.test(KEVIN.cookie), '0. connexion de Kevin par le code admin (session vérifiée)');
const appel = (id) => ({ id, type: 'function', function: { name: '', arguments: '' } });
const outil = (id, name, args) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args || {}) } });
const reset = () => { reseau = []; IA_VUES.length = 0; IA_SCRIPT.cerebras = []; IA_SCRIPT.groq = []; };
const toolMsgs = () => IA_VUES.flatMap((v) => v.corps.messages.filter((m) => m.role === 'tool').map((m) => m.content)).join('\n');
async function bee(texte, headers) {
  const r = await mod.fetch(new Request('https://javis.kd-mc.com/__javis/ai', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, headers || KEVIN), body: JSON.stringify({ messages: [{ role: 'user', content: texte }] }) }), env, { waitUntil() {} });
  return { st: r.status, j: await r.json().catch(() => null) };
}
const AGIR = (headers, corps, host = 'javis.kd-mc.com') => req(host, '/__javis/agir', { m: 'POST', headers: Object.assign({ 'content-type': 'application/json', origin: 'https://' + host }, headers), corps });
const kvJ = (k) => JSON.parse(kv.get(k) || 'null');
/** Fait proposer une action par la fausse IA (par le VRAI chemin : /__javis/ai) et rend la carte. */
async function carte(texte, action, champs) {
  reset(); IA_SCRIPT.cerebras = [{ content: '', tool_calls: [outil('p', 'proposer_action', Object.assign({ action }, champs))] }, { content: 'Carte prête.' }];
  const r = await bee(texte); return { r, p: r.j && r.j.propositions && r.j.propositions[0] };
}


const lireOutil = async (nom, args) => { reset(); IA_SCRIPT.cerebras = [{ content: '', tool_calls: [outil('a', nom, args || {})] }, { content: 'Voilà.' }]; await bee('montre-moi les personnes attendues, les bannis, les demandes et le robot'); return toolMsgs(); };   /* une phrase réaliste : elle choisit le lot d'outils d'ADMINISTRATION (consigne allégée, 17.10) */
const jeton = async (texte, action, champs) => (await carte(texte, action, champs)).p;
const ack = async (p, h) => { const r = await AGIR(h || KEVIN, { jeton: p.jeton, confirme: true }); return { st: r.status, j: await r.json() }; };

/* ───────── 1. LIRE PLUS ───────── */
put('cfg:attendus', [{ n: 'lucie martin', nom: 'Lucie Martin', at: Date.now() - 3600e3 }]);
put('ban:idx', [{ id: 'pirate_x@1790000000000', uid: 'pirate_x', nom: 'Pirate X', at: 1790000000000, cles: ['ban:n:pirate x'] }]); put('ban:n:pirate x', { at: 1, uid: 'pirate_x' });
put('demande:1', { prenom: 'Claire', nom: 'Durand', email: 'claire@secret-mail.example', fonction: 'DRH', etablissement: 'Hôtel du Port', ts: Date.now() - 86400e3 }); put('demandes:idx', ['demande:1']);
{ let t = await lireOutil('personnes_attendues'); ok(/1 personne\(s\) attendue\(s\) : Lucie Martin/.test(t), '1. personnes_attendues : la liste, avec les noms — ' + t.slice(0, 160));
  t = await lireOutil('personnes_bannies'); ok(/1 banni\(s\)/.test(t) && /Pirate X/.test(t) && /pirate_x@1790000000000/.test(t), '1b. personnes_bannies : le nom ET l\'identifiant du bannissement (pour proposer de le lever) — ' + t.slice(0, 200));
  t = await lireOutil('demandes_rotaplan'); ok(/Claire Durand/.test(t) && /Hôtel du Port/.test(t) && /DRH/.test(t) && !/secret-mail|@/.test(t), '1c. demandes_rotaplan : nom, fonction, établissement — JAMAIS l\'e-mail d\'un prospect — ' + t.slice(0, 220));
  t = await lireOutil('robot_ia'); ok(/L'IA pilote est illisible \(railway_token_absent/.test(t) || /railway_token_absent/.test(t), '1d. les portes du robot sont atteintes AVEC la session de Kevin (ici sans Railway : l\'échec est DIT, rien d\'inventé) — ' + t.slice(0, 200));
  ok(!/porte_non_autorisee/.test(t), '1e. la porte du robot est dans la liste blanche (pas « porte_non_autorisee »)');
  for (const nom of ['robot_flotte', 'robot_bilan', 'robot_liens', 'robot_marche']) { const x = await lireOutil(nom); ok(!/porte_non_autorisee/.test(x), '1f. ' + nom + ' : porte ouverte à Bee — ' + x.slice(0, 80)); } }
{ const r = compact({ ok: true, status: 200, token: 'ABC', cle_api: 'DEF', code: '1234', pin: 'zz', hash: 'hh', bots: [{ nom: 'p1', net: 12.5, secret: 'ghi', cookie: 'c' }], long: 'x'.repeat(9000) }, 400);
  ok(!/ABC|DEF|1234|zz|hh|ghi|"cookie"|"ok"|"status"/.test(r) && /"nom":"p1"/.test(r) && r.length <= 400, '1g. compact : retire tout ce qui ressemble à un secret (jeton, clé, code, PIN, empreinte, cookie), borne la taille — ' + r.slice(0, 160)); }
ok(/Scan de 2 paires/.test(resumeScan({ scanned: 2, results: [{ symbol: 'BTC/USDT', cat: 'sort_du_calme', ci: 0.31, ci_delta: -0.2 }, { symbol: 'ETH/USDT', cat: 'neutre', ci: 0.5 }] })) && /sort_du_calme/.test(resumeScan({ scanned: 1, results: [{ symbol: 'A', cat: 'sort_du_calme' }] })), '1h. le scan est résumé : les paires, leur catégorie');
ok(!/@/.test(resumeDemandes({ demandes: [{ prenom: 'A', nom: 'B', email: 'x@y.fr', etablissement: 'Z', ts: 1 }] })), '1i. résumé des demandes sans e-mail');

/* ───────── 2. OUVRIR UN COMPTE EN ATTENTE ───────── */
{ const z = kvJ('acc:zelie_testard'); z.attente_admin = 'inscription'; put('acc:zelie_testard', z);
  const p = await jeton('ouvre le compte de Zélie', 'compte_ouvrir', { uid: 'zelie_testard', nom: 'PIRATE FAUX NOM' });
  ok(p && p.risque === 'moyen' && /OUVRIR le compte de « Zélie TESTARD »/.test(p.resume) && !/PIRATE/.test(p.resume), '2. la carte « ouvrir le compte » porte le VRAI nom (pas celui de l\'IA), risque moyen — ' + (p && p.resume));
  ok(kvJ('acc:zelie_testard').attente_admin === 'inscription', '2b. avant le bouton : toujours en attente');
  const a = await ack(p);
  ok(a.st === 200 && a.j.ok && /Le compte de Zélie TESTARD est ouvert/.test(a.j.texte) && !kvJ('acc:zelie_testard').attente_admin && kvJ('acc:zelie_testard').valide_admin_at > 0, '2c. ✅ → l\'attente est levée et la validation est marquée — ' + JSON.stringify(a.j));
  ok(kv.has('cred:zelie_testard') && kvJ('acc:zelie_testard').portee === 'domaine', '2d. son code et son périmètre n\'ont pas bougé');
  ok((await ack(p)).st === 409, '2e. la même carte rejouée : 409'); }

/* ───────── 3. SUPPRIMER UN COMPTE ───────── */
{ put('nm:octave testard', 'octave_testard'); put('cred:octave_testard', { sel: 's', h: 'h' });
  const p = await jeton('supprime le compte d\'Octave', 'compte_supprimer', { uid: 'octave_testard' });
  ok(p && p.risque === 'eleve' && /SUPPRIMER le compte de « Octave TESTARD »/.test(p.resume) && /copie de la fiche, sans code, reste 30 jours/.test(p.resume) && !/BANNIR/.test(p.resume), '3. carte « supprimer » : risque ÉLEVÉ, dit ce qui est effacé et que la copie reste 30 jours — ' + (p && p.resume));
  ok(kv.has('acc:octave_testard'), '3b. avant le bouton : le compte existe');
  const a = await ack(p);
  ok(a.j.ok && !kv.has('acc:octave_testard') && !kv.has('cred:octave_testard') && !kv.has('nm:octave testard') && kv.has('del:octave_testard') && !kvJ('idx:uids').includes('octave_testard'), '3c. ✅ → fiche, code et nom réservé effacés, copie 30 jours gardée, sortie de l\'index — ' + JSON.stringify(a.j));
  ok(kv.has('acc:zelie_testard') && kv.has('acc:kdmc_admin') && !JSON.stringify(kvJ('del:octave_testard')).includes('"h":"h"'), '3d. les autres comptes sont intacts, et la copie ne contient pas le code');
  ok(!kv.has('ban:n:octave testard') && !JSON.stringify(kvJ('ban:idx')).includes('octave'), '3e. sans « bannir » : personne n\'est banni');
  put('acc:lucie_martin', compte('lucie_martin', 'Lucie Martin')); put('idx:uids', ['zelie_testard', 'kdmc_admin', 'lucie_martin']);
  const pb = await jeton('supprime Lucie et bannis-la', 'compte_supprimer', { uid: 'lucie_martin', bannir: true });
  ok(/ET la BANNIR/.test(pb.resume), '3f. « bannir » : la carte le dit en toutes lettres');
  const ab = await ack(pb);
  ok(ab.j.ok && /bannie/.test(ab.j.texte) && JSON.parse(kv.get('ban:idx')).some((x) => x.uid === 'lucie_martin'), '3g. supprimée ET bannie — ' + JSON.stringify(ab.j));
  const faux = await jeton('supprime Zélie', 'compte_supprimer', { uid: 'zelie_testard', bannir: 'peut-être' });
  ok(faux && !/BANNIR/.test(faux.resume), '3h. « bannir » flou (« peut-être ») : pas banni — la carte ne le promet pas');
  const adm = await carte('supprime mon compte', 'compte_supprimer', { uid: 'kdmc_admin' });
  ok(!adm.p && /ton propre compte/.test(toolMsgs()), '3i. SON PROPRE compte : refusé avant la carte');
  const direct = await DROITS_PLUS.compte_supprimer.executer(env, { uid: 'kdmc_admin', nom: 'Kevin', bannir: false }, { appeler: async (chemin, init) => { const r = await mod.fetch(new Request('https://javis.kd-mc.com' + chemin, { method: init.method, headers: Object.assign({ 'content-type': 'application/json', origin: 'https://javis.kd-mc.com' }, KEVIN), body: JSON.stringify(init.json) }), env, ctx); const j = await r.json(); return Object.assign({}, j, { status: r.status, ok: r.ok && j.ok !== false }); } });
  ok(!direct.ok && /admin_protege/.test(direct.texte) && kv.has('acc:kdmc_admin'), '3j. même si on contournait la carte : LA PORTE du domaine refuse d\'effacer l\'admin (admin_protege) — ' + direct.texte); }

/* ───────── 4. LEVER UN BANNISSEMENT ───────── */
{ const p = await jeton('autorise de nouveau Pirate X', 'compte_debannir', { id: 'pirate_x@1790000000000', nom: 'FAUX' });
  ok(p && /AUTORISER DE NOUVEAU « Pirate X »/.test(p.resume) && !/FAUX/.test(p.resume), '4. la carte porte le nom lu dans la liste des bannis — ' + (p && p.resume));
  const a = await ack(p);
  ok(a.j.ok && !JSON.parse(kv.get('ban:idx')).some((x) => x.id === 'pirate_x@1790000000000') && !kv.has('ban:n:pirate x'), '4b. ✅ → le bannissement est levé (la liste ET la clé) — ' + JSON.stringify(a.j));
  for (const [id, re] of [['inconnu@1790000000000', /Je ne trouve aucun banni/], ['n importe quoi', /identifiant du bannissement/], ['', /identifiant du bannissement/]]) { const c = await carte('autorise de nouveau ce banni', 'compte_debannir', { id }); ok(!c.p && re.test(toolMsgs()), '4c. identifiant « ' + id + ' » : refusé avant la carte'); } }

/* ───────── 5. PERSONNES ATTENDUES ───────── */
{ const p = await jeton('attends Paul Durand', 'personne_attendue', { nom: 'Paul Durand' });
  ok(p && p.risque === 'faible' && /AJOUTER « Paul Durand »/.test(p.resume), '5. carte « ajouter un attendu », risque faible');
  const a = await ack(p); ok(a.j.ok && JSON.parse(kv.get('cfg:attendus')).some((x) => x.nom === 'Paul Durand'), '5b. ✅ → ajouté');
  const r = await jeton('retire Paul Durand', 'personne_attendue', { nom: 'Paul Durand', retirer: true });
  ok(/RETIRER « Paul Durand »/.test(r.resume), '5c. carte « retirer »'); await ack(r); ok(!JSON.parse(kv.get('cfg:attendus')).some((x) => x.nom === 'Paul Durand') && JSON.parse(kv.get('cfg:attendus')).some((x) => x.nom === 'Lucie Martin'), '5d. retiré, la liste a gardé les autres');
  const un = await carte('attends Paul', 'personne_attendue', { nom: 'Paul' }); ok(!un.p && /prénom ET le nom/.test(toolMsgs()), '5e. un seul mot : refusé (prénom ET nom, comme à la connexion)'); }

/* ───────── 6. LE ROBOT (cartes + portes, sans Railway) ───────── */
{ const p1 = await jeton('mets l\'IA pilote en auto', 'robot_ia_mode', { mode: 'auto' });
  ok(p1 && p1.risque === 'moyen' && /EN AUTO/.test(p1.resume) && /PAPIER \(jamais l'argent réel\)/.test(p1.resume), '6. carte « IA pilote en auto » : robots PAPIER, jamais l\'argent réel');
  const p2 = await jeton('arrête l\'IA pilote', 'robot_ia_mode', { mode: 'arrêt' }); ok(p2 && /À L'ARRÊT/.test(p2.resume), '6b. « arrêt » = off');
  const mauvais = await carte('mets le robot en réel', 'robot_ia_mode', { mode: 'reel' }); ok(!mauvais.p, '6c. le mode « réel » n\'existe PAS : refusé avant la carte');
  const p3 = await jeton('lance une décision de l\'IA pilote maintenant', 'robot_ia_lancer', {}); ok(p3 && /LANCER UNE DÉCISION/.test(p3.resume) && /réversible/.test(p3.resume), '6d. carte « lancer maintenant » : dit que c\'est réversible');
  const p4 = await jeton('annule l\'essai en cours de l\'IA pilote', 'robot_ia_annuler', {}); ok(p4 && /ANNULER L'ESSAI EN COURS/.test(p4.resume), '6e. carte « annuler l\'essai »');
  const a = await ack(p1); ok(!a.j.ok && !/porte_non_autorisee/.test(a.j.texte || '') && /railway_token_absent|Le réglage/.test(a.j.texte || ''), '6f. ✅ → la porte du robot est atteinte AVEC la session de Kevin (sans Railway ici : l\'échec est dit) — ' + a.j.texte); }
{ const appels = []; const o = { appeler: async (chemin, init) => { appels.push([chemin, init && init.method, JSON.stringify(init && init.json)]); return { ok: true, mode: 'auto', texte: 'x' }; } };
  await DROITS_PLUS.robot_ia_mode.executer(env, { mode: 'auto' }, o); await DROITS_PLUS.robot_ia_lancer.executer(env, {}, o); await DROITS_PLUS.robot_ia_annuler.executer(env, {}, o);
  ok(JSON.stringify(appels) === JSON.stringify([['/__bot/ia/mode', 'POST', '{"mode":"auto"}'], ['/__bot/ia/tick', 'POST', '{}'], ['/__bot/ia/annuler', 'POST', '{}']]), '6g. les 3 actions du robot appellent EXACTEMENT ces 3 portes, avec ces corps — ' + JSON.stringify(appels)); }

/* ───────── 7. REFUS AVANT LA CARTE ───────── */
for (const [nom, action, champs, re] of [['compte inconnu', 'compte_supprimer', { uid: 'personne_inconnue' }, /Je ne connais aucun compte/], ['identifiant tordu', 'compte_ouvrir', { uid: '../../__fin/vault' }, /identifiant/], ['identifiant absent', 'compte_supprimer', {}, /identifiant de la personne/]]) {
  const c = await carte('supprime le compte (' + nom + ')', action, champs); ok(!c.p && re.test(toolMsgs()), '7. refusé avant la carte : ' + nom + ' — ' + toolMsgs().slice(-110)); }

/* ───────── 8. LES INTRUS ───────── */
const AVANT = JSON.stringify([...kv.entries()]);
{ const sign = async (a, c) => (await proposer(env, a, c, Date.now(), { appeler: async () => ({ ok: true, name: 'Zélie TESTARD', apps: [], bannis: [{ id: 'q@1790000000000', nom: 'Q' }] }) })).proposition;
  const propositions = [await sign('compte_ouvrir', { uid: 'zelie_testard' }), await sign('compte_supprimer', { uid: 'zelie_testard', bannir: true }), await sign('personne_attendue', { nom: 'Eve Martin' }), await sign('robot_ia_mode', { mode: 'off' }), await sign('robot_ia_lancer', {})];
  ok(propositions.every((p) => p && p.jeton), '8. cinq propositions signées pour les intrus');
  for (const [nom, h] of [['un autre compte reconnu', AUTRE], ['un inconnu', {}], ['de faux en-têtes admin', { 'x-kdmc-admin': 'inventé', 'x-kdmc-sso': 'inventé' }]]) {
    const codes = []; for (const p of propositions) codes.push((await AGIR(h, { jeton: p.jeton, confirme: true })).status);
    ok(codes.every((c) => c === 403), '8b. ' + nom + ' avec une proposition VALIDE : 403 pour les 5 actions — ' + codes.join(',')); }
  ok((await AGIR(KEVIN, { jeton: propositions[0].jeton.replace(/\.[0-9a-f]{64}$/, '.' + '0'.repeat(64)), confirme: true })).status === 400, '8c. signature remplacée : 400');
  ok((await AGIR(KEVIN, { jeton: propositions[1].jeton })).status === 400, '8d. Kevin sans le bouton : 400');
  ok(JSON.stringify([...kv.entries()]) === AVANT, '8e. après tous ces essais, RIEN n\'a bougé dans le registre'); }

/* ───────── 9. LA LISTE BLANCHE EST EXACTE ET CE QUI EST FERMÉ LE RESTE ───────── */
const W = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
const DP = readFileSync(new URL('./bee-droits-plus.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const PORTES = ((W.match(/const PORTES_BEE = \[([^\]]*)\]/) || [])[1] || '').split(',').map((x) => x.replace(/['\s]|\/\/.*$/g, '')).filter(Boolean).sort();
const ATTENDUES = ['/__admin/accounts', '/__admin/acces', '/__admin/acces-lot', '/__admin/apps-fermees', '/__admin/attendus', '/__admin/audit', '/__admin/bannis', '/__admin/code', '/__admin/compte-invite', '/__admin/compte-ouvrir', '/__admin/compte-supprimer', '/__admin/debannir', '/__admin/revoke',
  '/__bot/analysis', '/__bot/config', '/__bot/fleet', '/__bot/history', '/__bot/ia', '/__bot/ia/annuler', '/__bot/ia/mode', '/__bot/ia/tick', '/__bot/kill', '/__bot/liens', '/__bot/marche', '/__bot/scan', '/__bot/start', '/__bot/status',
  '/__boite/admin', '/__boite/admin/lu', '/__boite/admin/repondre', '/__demandes'].sort();
ok(JSON.stringify(PORTES) === JSON.stringify(ATTENDUES), '9. la liste blanche est EXACTEMENT ces ' + ATTENDUES.length + ' portes — écart : ' + [...PORTES.filter((x) => !ATTENDUES.includes(x)).map((x) => '+' + x), ...ATTENDUES.filter((x) => !PORTES.includes(x)).map((x) => '-' + x)].join(' '));
const FERMEES = ['/__fin/vault', '/__fin/meta', '/__admin/login', '/__admin/grant', '/__admin/logout', '/__admin/fbtoken', '/__admin/domain-log', '/__admin/me', '/__bot/reel',
  '/__arbre/seed', '/__arbre/code', '/__arbre/cle', '/__arbre/unlock', '/__arbre/correction', '/__arbre/journal', '/__arbre/status', '/__sso/login', '/__sso/issue', '/__sso/pass', '/__sso/webauthn', '/__sso/cookie', '/__sso/fbtoken',
  '/__lingua/ai', '/__lingua/tts', '/__mail/scan', '/__mail/ack', '/__notify-kevin', '/__dep/matricules', '/__dep/membre', '/__deces', '/__beatbot/relay'];
ok(FERMEES.every((f) => !PORTES.includes(f)), '9b. RESTENT FERMÉES, une par une : coffre et clés, connexion et code admin, journal détaillé (IP), arbre publié, sessions, matricules du planning (noms de collègues) — ouvertes par erreur : ' + FERMEES.filter((f) => PORTES.includes(f)).join(' '));
const visees = [...new Set([...DP.matchAll(/'(\/__[a-z0-9\/-]+)(?:\?[^']*)?'/g)].map((m) => m[1]))];
ok(visees.length >= 14 && visees.every((v) => PORTES.includes(v)), '9c. toute porte visée par bee-droits-plus.js est dans la liste blanche (' + visees.length + ' portes) — hors liste : ' + visees.filter((v) => !PORTES.includes(v)).join(' '));
ok(!FERMEES.some((f) => DP.includes(f)), '9d. le code de la suite ne nomme AUCUNE porte fermée');
ok(ACTIONS_DROITS_PLUS.length === 7 && ACTIONS_DROITS_PLUS.every((a) => ACTIONS.includes(a) && CATALOGUE[a] === DROITS_PLUS[a]) && !ACTIONS_DROITS_PLUS.some((a) => /reel|real|code_admin|coffre|cle|secret/i.test(a)), '9e. 7 actions, toutes dans le catalogue signé, aucune ne touche au réel, au coffre ni au code admin');
ok(['compte_supprimer'].every((a) => CATALOGUE[a].risque === 'eleve') && ['compte_ouvrir', 'compte_debannir', 'robot_ia_mode', 'robot_ia_lancer', 'robot_ia_annuler'].every((a) => CATALOGUE[a].risque === 'moyen') && CATALOGUE.personne_attendue.risque === 'faible', '9f. supprimer = risque ÉLEVÉ ; le reste proportionné');
ok(['compte_ouvrir', 'compte_supprimer'].every((a) => typeof CATALOGUE[a].enrichir === 'function') && typeof CATALOGUE.compte_debannir.enrichir === 'function', '9g. toute action sur une PERSONNE vérifie son nom auprès du domaine avant la carte');
for (const q of ['supprime le compte de Zélie', 'qui est banni ?', 'autorise de nouveau Pirate X', 'les demandes de démo Rotaplan', 'scanne le marché', 'lance une décision de l\'IA pilote', 'annule l\'essai', 'retire Paul Durand de la liste', 'mets l\'IA pilote en auto', 'ouvre le compte de Yann', 'qui est attendu ?', 'bilan du robot'])
  ok(RE_AGIR.test(q), '9h. prend les mains : « ' + q + ' »');
ok(!reseau.some((u) => /anthropic|openai\.com|googleapis\.com\/v1beta|mistral|deepseek/i.test(u)), '10. 0 € : aucun moteur payant appelé');

globalThis.fetch = vraiFetch;
console.log('\n' + pass + ' ✓ / ' + fail + ' ✗  (bee-droits-plus)');
process.exit(fail ? 1 : 0);
