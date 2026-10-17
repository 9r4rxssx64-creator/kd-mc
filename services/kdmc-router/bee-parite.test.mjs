/* GARDE — BEE A LES MÊMES COMPÉTENCES QU'APEX ET QUE CLAUDE CODE, SANS PAYER (Kevin 13.10.2026, capture : « fais en sorte de voir les fiches
 * dans l'arbre » → « je ne peux pas, c'est Apex » ; puis « je veux que Jarvis ait les mêmes compétences que Apex, comme tes compétences aussi. Gratuit tjs »).
 *   1. nouveaux outils gratuits, PARTAGÉS avec Apex (/ai) : convertir (unités hors ligne, devises BCE), heure_ailleurs (Intl), dates (calcul pur) ;
 *   2. l'arbre : Bee cherche une personne (prénom, nom, ordre inversé, accents, tirets) et rend sa fiche (parents, conjoints, enfants, frères/sœurs, notes) — texte seul, 4 au plus ;
 *   3. par le VRAI serveur de Bee : l'IA appelle l'outil arbre, reçoit la fiche, répond ; la fiche reste une DONNÉE ; interrupteur BEE_ARBRE=0 ; un autre que Kevin → 403, rien lu ;
 *   4. le caractère de Bee dit la vérité (outils, mains + bouton, arbre) et ne renvoie plus à « c'est Apex » sans rien dire ;
 *   5. Apex (via /ai) reçoit les nouveaux outils mais PAS l'arbre ni le planning (données privées) ;
 *   6. 0 € : aucun moteur payant appelé.
 * node services/kdmc-router/bee-parite.test.mjs */
import mod, { BEE_CARACTERE } from './worker.js';
import apis from '../kdmc-apis/worker.js';
import { convertir, convertirUnites, heure_ailleurs, dates, RE_BESOIN_OUTILS, DEFINITIONS } from '../_shared/outils-lecture.js';
import { trouver, fiche, chercherDansArbre, outilsArbre, RE_ARBRE, MAX_FICHES, MAX_NOTES } from './bee-arbre.js';
import { REGLES_AGIR } from './bee-agir.js';
import { createHash, createHmac } from 'node:crypto';

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m + (d !== undefined ? ' → ' + String(d).slice(0, 300) : '')); } };
const proche = (a, b, e) => Math.abs(a - b) <= (e || 1e-6);
const refuse = async (f, re) => { try { await f(); return false; } catch (e) { return re ? re.test(e.message) : true; } };

/* ───────── 1. les nouveaux outils ───────── */
ok(proche(convertirUnites(10, 'km', 'miles'), 6.2137119, 1e-5), '1. 10 km = 6,2137 miles');
ok(proche(convertirUnites(5, 'lb', 'kg'), 2.26796185, 1e-6) && proche(convertirUnites(1, 'kg', 'g'), 1000), '1b. livres / kilos / grammes');
ok(proche(convertirUnites(100, 'F', 'C'), 37.7777778, 1e-5) && proche(convertirUnites(0, '°C', 'K'), 273.15) && proche(convertirUnites(-40, 'C', 'F'), -40), '1c. températures (°F, °C, K) — −40 est le même des deux côtés');
ok(proche(convertirUnites(90, 'km/h', 'm/s'), 25, 1e-9) && proche(convertirUnites(2, 'l', 'ml'), 2000), '1d. vitesse et volume');
ok(await refuse(() => convertirUnites(1, 'km', 'kg'), /ne peut pas convertir/) && await refuse(() => convertirUnites(1, 'zorg', 'km'), /inconnue/) && await refuse(() => convertirUnites('abc', 'km', 'm'), /valeur/), '1e. longueur→masse, unité inventée, valeur absurde : refusés, rien d\'inventé');
const vraiFetch = globalThis.fetch;
let reseau = [];
const IA_SCRIPT = { cerebras: [], groq: [] }; const IA_VUES = [];
const SEED = { persons: {
  p1: { prenom: 'Zélie', nom: 'TESTARD', sexe: 'F', vivant: true, naissance: { date: '1981-10-02', lieu: 'Valmont-sur-Mer' }, metier: 'vendeuse', pere: 'p2', mere: 'p3', conjoints: ['p4'], notes: 'Aime les arbres. ' + 'x'.repeat(400) },
  p2: { prenom: 'Octave', nom: 'TESTARD', sexe: 'M', vivant: true, naissance: { date: '1953-03-27', lieu: 'Vallée-Haute' }, conjoints: ['p3'] },
  p3: { prenom: 'Capucine', nom: 'VALMONT', sexe: 'F', vivant: true, naissance: { date: '1956-07-26', lieu: 'Mont-Fictif' }, conjoints: ['p2'] },
  p4: { prenom: 'Barnabé', nom: 'LEFICTIF', sexe: 'M', vivant: true, conjoints: ['p1'] },
  p5: { prenom: 'Léonie', nom: 'LEFICTIF', sexe: 'F', vivant: true, pere: 'p4', mere: 'p1', naissance: { date: '2004-10-07' } },
  p6: { prenom: 'Lucien', nom: 'LEFICTIF', sexe: 'M', vivant: true, pere: 'p4', mere: 'p1' },
  p7: { prenom: 'Zélie-Anne', nom: 'AUTRE', sexe: 'F', vivant: false, deces: { date: '1999-01-01', lieu: 'Ailleurs' } },
  p8: { prenom: 'Octavie', nom: 'TESTARD', sexe: 'F', vivant: true, pere: 'p2', mere: 'p3' },
} };
globalThis.fetch = async (url, init) => {
  const u = String(url); reseau.push(u);
  const R = (corps, st) => new Response(typeof corps === 'string' ? corps : JSON.stringify(corps), { status: st || 200, headers: { 'content-type': 'application/json' } });
  if (u.startsWith('https://api.frankfurter.dev/')) return /base=USD&symbols=EUR/.test(u) ? R({ date: '2026-10-13', rates: { EUR: 0.9 } }) : R({ message: 'not found' }, 404);
  const four = /cerebras/.test(u) ? 'cerebras' : /groq/.test(u) ? 'groq' : '';
  if (four) {
    const corps = JSON.parse(init.body); IA_VUES.push({ four, corps });
    const rep = IA_SCRIPT[four].shift();
    if (!rep) return R({ error: 'plus de réponse prévue' }, 500);
    return R({ choices: [{ message: rep }] });
  }
  return R({ error: 'réseau non prévu : ' + u }, 599);
};
const reset = () => { reseau = []; IA_VUES.length = 0; IA_SCRIPT.cerebras = []; IA_SCRIPT.groq = []; };
{ reset();
  const c = await convertir({ valeur: 100, de: 'USD', vers: 'EUR' });
  ok(/100 USD = 90 EUR/.test(c) && /Banque centrale européenne/.test(c) && reseau.length === 1 && /frankfurter\.dev/.test(reseau[0]), '1f. devises : taux BCE du jour (gratuit, sans clé), un seul appel — ' + c);
  ok(await refuse(() => convertir({ valeur: 1, de: 'USD', vers: 'XXX' }), /devise inconnue|HTTP/), '1g. devise inexistante : échec clair, pas de taux inventé');
  reseau = []; ok(/10 km = 6\.21/.test(await convertir({ valeur: 10, de: 'km', vers: 'miles' })) && reseau.length === 0, '1h. une conversion d\'unités n\'appelle AUCUN réseau'); }
{ const ny = await heure_ailleurs({ ville: 'New York' }), tk = await heure_ailleurs({ ville: 'tokyo' }), iana = await heure_ailleurs({ ville: 'Asia/Dubai' });
  ok(/America\/New_York/.test(ny) && /h par rapport à Monaco/.test(ny) && /Asia\/Tokyo/.test(tk) && /Asia\/Dubai/.test(iana), '1i. l\'heure à New York, Tokyo (minuscules), Dubaï (nom IANA) — avec l\'écart avec Monaco');
  ok(/même heure/.test(await heure_ailleurs({ ville: 'Paris' })) && /même heure/.test(await heure_ailleurs({ ville: 'Monaco' })), '1j. Paris et Monaco : même heure');
  ok(await refuse(() => heure_ailleurs({ ville: 'Atlantide' }), /inconnu/) && await refuse(() => heure_ailleurs({ ville: '' })), '1k. ville inconnue ou vide : refusée'); }
{ const e = await dates({ de: '2026-10-13', a: '2026-12-25' }), p = await dates({ de: '2026-10-13', ajouter_jours: 45 }), n = await dates({ de: '13/10/2026', a: '2026-10-01' }), bis = await dates({ de: '2028-02-28', ajouter_jours: 1 });
  ok(/73 jour\(s\) \(10 semaine\(s\) et 3 jour\(s\)\)/.test(e) && /vendredi 25 décembre/.test(e), '1l. du 13.10 au 25.12 : 73 jours, un vendredi — ' + e);
  ok(/vendredi 27 novembre 2026/.test(p), '1m. 13.10 + 45 jours = vendredi 27 novembre — ' + p);
  ok(/−12 jour|-12 jour/.test(n) && /AVANT/.test(n), '1n. une date passée (format JJ/MM/AAAA) : écart négatif dit clairement — ' + n);
  ok(/29 février/.test(bis), '1o. 2028 est bissextile : 28.02 + 1 jour = 29 février — ' + bis);
  ok(await refuse(() => dates({ de: '2026-02-30', a: '2026-03-01' }), /inexistante/) && await refuse(() => dates({ de: 'bientôt', a: '2026-03-01' }), /non comprise/) && await refuse(() => dates({ de: '2026-01-01', ajouter_jours: 999999 }), /non compris/), '1p. date inexistante, texte, nombre absurde : refusés'); }
for (const q of ['convertis 10 km en miles', 'combien de miles dans 20 km', 'quelle heure est-il à Tokyo ?', 'quelle heure il est à New York', 'combien de jours avant Noël', 'dans 45 jours on est quelle date', 'combien font 100 dollars en euros'])
  ok(RE_BESOIN_OUTILS.test(q), '1q. prend les outils : « ' + q + ' »');
for (const q of ['salut Bee, ça va ?', 'raconte-moi une blague', 'merci beaucoup'])
  ok(!RE_BESOIN_OUTILS.test(q), '1r. garde la conversation : « ' + q + ' »');
ok(['convertir', 'heure_ailleurs', 'dates'].every((n) => DEFINITIONS.some((d) => d.name === n && d.parameters && d.description.length > 40)), '1s. les trois outils sont dans le catalogue vu par l\'IA (donc par Apex aussi)');

/* ───────── 2. l'arbre ───────── */
const noms = (r) => r.map((x) => x.p.prenom + ' ' + x.p.nom);
ok(noms(trouver(SEED, 'Zélie TESTARD'))[0] === 'Zélie TESTARD', '2. « Zélie TESTARD » → la bonne personne en premier (pas l\'homonyme Zélie-Anne)');
ok(noms(trouver(SEED, 'testard zelie'))[0] === 'Zélie TESTARD' && noms(trouver(SEED, 'ZELIE'))[0].startsWith('Zélie'), '2b. ordre inversé, sans accent, en majuscules : retrouvée');
ok(noms(trouver(SEED, 'Zelie Anne'))[0] === 'Zélie-Anne AUTRE', '2c. le tiret ne gêne pas (Zélie-Anne)');
ok(trouver(SEED, 'Testard').length === 3 && trouver(SEED, 'LEFICTIF').length === 3, '2d. un nom de famille : toutes les personnes qui le portent');
ok(trouver(SEED, 'qui sont les enfants de nobody').length === 0 && trouver(SEED, '   ').length === 0 && trouver(SEED, 'la le de').length === 0, '2e. personne d\'inconnu / demande vide / mots vides : aucune fiche');
{ const gros = { persons: {} }; for (let i = 0; i < 30; i++) gros.persons['g' + i] = { prenom: 'Jean', nom: 'DUMMY' + i };
  ok(trouver(gros, 'Jean').length === MAX_FICHES, '2f. au plus ' + MAX_FICHES + ' fiches : jamais l\'arbre entier'); }
{ const f = fiche(SEED, 'p1');
  ok(/Zélie TESTARD \[id : p1\] \(femme\) — vivant\(e\)/.test(f) && /né\(e\) : 1981-10-02 à Valmont-sur-Mer/.test(f) && /métier : vendeuse/.test(f), '2g. fiche : identité, naissance, métier');
  ok(/père : Octave TESTARD/.test(f) && /mère : Capucine VALMONT/.test(f) && /conjoint\(s\) : Barnabé LEFICTIF/.test(f), '2h. fiche : parents et conjoint (noms, jamais des identifiants)');
  ok(/enfants : Léonie LEFICTIF, Lucien LEFICTIF/.test(f) && /frères et sœurs : Octavie TESTARD/.test(f), '2i. fiche : enfants (retrouvés par leurs parents) et fratrie');
  const notes = (f.match(/notes : (.*)$/m) || [])[1] || '';
  ok(/Aime les arbres/.test(notes) && /\[…\]/.test(notes) && notes.length <= MAX_NOTES + 6, '2j. notes coupées à ' + MAX_NOTES + ' signes (' + notes.length + ')');
  ok(/\[id : p1\]/.test(f) && !/(père|mère|conjoint|enfants|frères)[^\n]*\bp[1-8]\b/.test(f), '2k. la fiche porte son identifiant UNE fois « [id : …] » (pour proposer une modification) ; les liens de parenté restent des noms'); }
{ const t = chercherDansArbre(SEED, 'Nobody Existe');
  ok(/Aucune personne de l'arbre ne correspond/.test(t) && /Ne l'invente pas/.test(t) && /8 personnes/.test(t), '2l. personne introuvable : le dit, avec le total, et interdit d\'inventer'); }
ok(await refuse(() => chercherDansArbre(null, 'Zélie'), /pas disponible/), '2m. arbre non publié : échec clair');
{ let pasDeSeed = outilsArbre(async () => null);
  ok(await refuse(() => pasDeSeed.exe.arbre({ recherche: 'Zélie' }), /pas encore publié/) && await refuse(() => pasDeSeed.exe.arbre({ recherche: '' }), /quelle personne/), '2n. arbre vide ou demande vide : refusé proprement'); }
for (const q of ['qui est le père de Zélie ?', 'ses enfants sont nés quand', 'donne-moi la fiche de Capucine', 'elle est née où ?', 'cherche dans l\'arbre', 'son conjoint', 'la famille de Kevin', 'ses grands-parents'])
  ok(RE_ARBRE.test(q), '2o. parle de la famille : « ' + q + ' »');
for (const q of ['quel temps demain', 'combien font 2+2', 'raconte-moi une blague', 'merci'])
  ok(!RE_ARBRE.test(q), '2p. ne parle pas de la famille : « ' + q + ' »');

/* ───────── 3. par le VRAI serveur de Bee ───────── */
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const signe = (uid) => { const p = b64u(JSON.stringify({ u: uid, n: uid, c: 1, v: 1, iat: Date.now(), exp: Date.now() + 1e9 })); return p + '.' + b64u(createHmac('sha256', 'sec').update(p).digest()); };
const kv = new Map(); kv.set('arbre:seed', JSON.stringify(SEED));
const ACCOUNTS = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } };
const SERVEUR = { KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: createHash('sha256').update('424242').digest('hex'), ACCOUNTS, CEREBRAS_API_KEY: 'c', GROQ_API_KEY: 'g', AI: { run: async () => ({ response: 'Réponse de l\'ancien chemin.' }) } };
const appelOutil = (id, name, args) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args || {}) } });
async function bee(texte, env2, entetes, contexte) {
  const r = await mod.fetch(new Request('https://arbre.kd-mc.com/__javis/ai', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json', 'x-kdmc-sso': signe('kdmc_admin') }, entetes || {}),
    body: JSON.stringify({ messages: [{ role: 'user', content: texte }], contexte: contexte || undefined }) }), env2 || SERVEUR, { waitUntil() {} });
  return { st: r.status, j: await r.json().catch(() => null) };
}
const outilsVus = () => IA_VUES.flatMap((v) => (v.corps.tools || []).map((t) => t.function.name));
const messagesOutil = () => IA_VUES.flatMap((v) => v.corps.messages.filter((m) => m.role === 'tool').map((m) => m.content)).join('\n');
{ reset();
  IA_SCRIPT.cerebras = [{ content: '', tool_calls: [appelOutil('a', 'arbre', { recherche: 'Zélie TESTARD' })] }, { content: 'Zélie est née le 2 octobre 1981 à Valmont-sur-Mer, elle est vendeuse.' }];
  const r = await bee('Quand est née Zélie TESTARD ?');
  ok(r.st === 200 && r.j.ok && /1981/.test(r.j.text) && r.j.outils.join() === 'arbre' && r.j.gratuit === true && r.j.provider === 'cerebras', '3. l\'IA appelle l\'outil arbre et répond avec la fiche — ' + JSON.stringify(r.j));
  const tm = messagesOutil();
  ok(/DONNÉE D'OUTIL/.test(tm) && /né\(e\) : 1981-10-02 à Valmont-sur-Mer/.test(tm) && /père : Octave TESTARD/.test(tm), '3b. la fiche arrive à l\'IA encadrée comme une DONNÉE (jamais un ordre), avec les vrais faits');
  ok(outilsVus().includes('arbre') && outilsVus().includes('convertir') && !outilsVus().includes('proposer_action'), '3c. l\'outil arbre est offert avec les outils de base ; une simple QUESTION n\'envoie pas les outils d\'action (consigne allégée, 17.10)');
  const sys = IA_VUES[0].corps.messages[0].content;
  ok(/ARBRE DE FAMILLE/.test(sys) && /Ne dis jamais « je ne vois pas les fiches »/.test(sys), '3d. le caractère de Bee lui dit d\'utiliser l\'outil, pas de dire qu\'elle ne voit pas'); }
{ reset(); IA_SCRIPT.cerebras = [{ content: 'Tu es dans l\'arbre.' }];
  const r = await bee('où suis-je ?', SERVEUR, null, { app: 'arbre', titre: 'Arbre' });
  ok(r.st === 200 && outilsVus().includes('arbre'), '3e. Kevin DANS l\'app de l\'arbre : l\'outil est offert même pour une question courte'); }
{ reset(); IA_SCRIPT.cerebras = [{ content: 'Ok.' }];
  await bee('où suis-je ?', SERVEUR, null, { app: 'lingua', titre: 'Lingua' });
  ok(!outilsVus().includes('arbre') && IA_VUES.every((v) => !v.corps.tools), '3f. une question courte dans une autre app : pas d\'outils inutiles'); }
{ reset(); IA_SCRIPT.cerebras = [{ content: '', tool_calls: [appelOutil('a', 'arbre', { recherche: 'Zélie' })] }, { content: 'Je ne peux pas.' }];
  const r = await bee('Quand est née Zélie TESTARD ?', Object.assign({}, SERVEUR, { BEE_ARBRE: '0' }));
  ok(!outilsVus().includes('arbre') && !/Zélie TESTARD \(femme\)/.test(messagesOutil()), '3g. interrupteur BEE_ARBRE=0 : l\'outil n\'existe plus (aucune fiche lue) — ' + JSON.stringify(r.j)); }
{ reset();
  const r = await bee('Quand est née Zélie TESTARD ?', SERVEUR, { 'x-kdmc-sso': signe('bob') });
  ok(r.st === 403 && IA_VUES.length === 0, '3h. quelqu\'un d\'autre que Kevin : 403, aucun appel IA, aucune fiche lue');
  const r2 = await mod.fetch(new Request('https://arbre.kd-mc.com/__javis/ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'Quand est née Zélie TESTARD ?' }] }) }), SERVEUR, { waitUntil() {} });
  ok(r2.status === 403 && IA_VUES.length === 0, '3i. un inconnu (sans session) : 403 aussi'); }
{ reset(); const SANS = Object.assign({}, SERVEUR); const k2 = new Map(); SANS.ACCOUNTS = { get: async (k) => (k2.has(k) ? k2.get(k) : null), put: async (k, v) => { k2.set(k, v); }, delete: async () => {} };
  IA_SCRIPT.cerebras = [{ content: '', tool_calls: [appelOutil('a', 'arbre', { recherche: 'Zélie' })] }, { content: 'Je ne la trouve pas.' }];
  const r = await bee('Quand est née Zélie TESTARD ?', SANS);
  ok(r.st === 200 && /ÉCHEC DE L'OUTIL : l'arbre n'est pas encore publié/.test(messagesOutil()), '3j. arbre non publié : l\'IA reçoit « échec de l\'outil » et le dit (rien d\'inventé) — ' + JSON.stringify(r.j)); }
{ reset(); IA_SCRIPT.cerebras = [{ content: 'Ok.' }];
  await bee('combien font 2+2 ?', Object.assign({}, SERVEUR, { ANTHROPIC_API_KEY: 'payant', OPENAI_API_KEY: 'payant' }));
  ok(reseau.every((u) => !/anthropic|openai/.test(u)), '3k. 0 € : aucun appel Anthropic / OpenAI'); }

/* ───────── 4. le caractère dit la vérité ───────── */
ok(/tutoiement/.test(BEE_CARACTERE) && /n'invente jamais/.test(BEE_CARACTERE) && /ne prétends jamais avoir fait/.test(BEE_CARACTERE), '4. le caractère garde ses règles d\'honnêteté (tutoiement, n\'invente jamais, ne prétends jamais avoir fait)');
ok(!/AUCUNE donnée privée/.test(BEE_CARACTERE) && !/dis que c'est Apex qui peut la faire/.test(BEE_CARACTERE), '4b. il ne dit plus « aucune donnée privée » ni « dis que c\'est Apex »');
ok(/arbre de famille/.test(BEE_CARACTERE) && /boîte de messages/.test(BEE_CARACTERE) && /bouton ✅/.test(BEE_CARACTERE) && /consigne toute prête/.test(BEE_CARACTERE), '4c. il liste ses vrais moyens (arbre, boîte, mains avec bouton ✅) et propose la consigne toute prête pour ce qu\'il ne peut pas faire');
ok(/consigne toute prête/.test(REGLES_AGIR) && !/dis que c'est Apex\.'/.test(REGLES_AGIR), '4d. les règles des mains disent aussi « précisément ce que tu ne peux pas » (jamais un simple « c\'est Apex »)');

import { readFileSync, existsSync } from 'node:fs';
{ const wd = readFileSync(new URL('../../tools/javis/javis-widget.js', import.meta.url), 'utf8');
  ok(/je lis ses fiches sur ton domaine/.test(wd) && /je ne modifie une fiche que si tu touches mon bouton ✅/.test(wd) && /je ne supprime jamais rien/.test(wd) && /frankfurter\.dev/.test(wd), '4e. le ℹ️ du widget DIT que les fiches qui répondent partent à l\'IA gratuite et que les devises passent par frankfurter.dev');
  for (const f of ['javis', 'arbre']) { const u = new URL('../../' + f + '/javis-widget.js', import.meta.url); if (existsSync(u)) ok(readFileSync(u, 'utf8') === wd, '4f. copie ' + f + '/ identique à la source'); } }

/* ───────── 5. Apex reçoit les nouveaux outils, pas les données de Kevin ───────── */
async function ia(corps, entetes) {
  const r = await apis.fetch(new Request('https://apis.kd-mc.com/ai', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json', origin: 'https://apex-ai.kd-mc.com' }, entetes || {}), body: JSON.stringify(corps) }), SERVEUR, { waitUntil() {} });
  return { st: r.status, j: await r.json().catch(() => null) };
}
{ reset(); IA_SCRIPT.cerebras = [{ content: '', tool_calls: [appelOutil('c', 'convertir', { valeur: 10, de: 'km', vers: 'miles' })] }, { content: '10 km = 6,2 miles.' }];
  const r = await ia({ messages: [{ role: 'user', content: 'convertis 10 km en miles' }], system: 'Tu es Apex.' }, { 'x-kdmc-sso': signe('kdmc_admin') });
  ok(r.st === 200 && r.j.ok && r.j.outils.join() === 'convertir' && /6,2 miles/.test(r.j.text), '5. Apex (via /ai, laissez-passer de Kevin) utilise convertir — mêmes outils que Bee — ' + JSON.stringify(r.j));
  const noms2 = outilsVus();
  ok(['convertir', 'heure_ailleurs', 'dates', 'meteo', 'calcul'].every((n) => noms2.includes(n)) && !noms2.includes('arbre') && !noms2.includes('planning') && !noms2.includes('proposer_action'), '5b. Apex a les outils du monde, PAS l\'arbre, ni le planning, ni les mains de Bee (données et pouvoirs de Kevin)'); }

globalThis.fetch = vraiFetch;
console.log(`\n${pass} ✓ / ${fail} ✗`);
process.exit(fail ? 1 : 0);
