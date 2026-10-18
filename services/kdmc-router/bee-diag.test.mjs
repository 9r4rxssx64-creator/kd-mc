/* GARDE — « DANS L'ARBRE BEE NE FONCTIONNE TOUJOURS PAS, JE NE PEUX RIEN LUI FAIRE FAIRE » (Kevin 16.10.2026) : QUE LA PANNE SE VOIE.
 * Avec le VRAI routeur, une fausse base D1 et de fausses IA gratuites :
 *   1. le journal : chaque demande à /__javis/ai | agir | fil laisse UNE ligne (heure, route, résultat, raison, par quel canal la session est arrivée en oui/non,
 *      IA, outils, durée, famille d'appareil) — JAMAIS un message de Kevin, un jeton, l'empreinte du code famille ; 300 lignes gardées ; BEE_JOURNAL=0 le coupe ;
 *      une base en panne ne bloque JAMAIS la réponse ;
 *   2. le test « 🩺 Tester Bee » (POST /__javis/ai {diag:true}) : réservé à Kevin ; dit si la session est prouvée, quelles IA gratuites ont une clé, laquelle répond
 *      VRAIMENT, si l'arbre est publié et si son nuage répond, les interrupteurs ; ne coûte rien et n'écrit rien dans l'arbre ;
 *   3. un inconnu : 403, aucune IA appelée, mais la tentative est dans le journal (c'est elle qui explique « Bee ne fait rien » quand le domaine ne reconnaît pas le téléphone) ;
 *   4. 0 € : aucun moteur payant.
 * node services/kdmc-router/bee-diag.test.mjs */
import { createHash, createHmac } from 'node:crypto';
import mod from './worker.js';
import { journaliser, canalSession, appareil, avecJournal, bilanDiag, GARDES_JOURNAL } from './bee-diag.js';

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m + (d !== undefined ? ' → ' + String(d).slice(0, 300) : '')); } };
const sha = (t) => createHash('sha256').update(t).digest('hex');
const CH = sha('code-famille-diag');

/* ───────── une fausse D1 qui comprend ce que le journal lui dit ───────── */
function fauxD1() {
  const d = { lignes: [], id: 0, panne: false, tables: 0 };
  d.prepare = (sql) => ({ bind: (...a) => ({
    run: async () => {
      if (d.panne) throw new Error('D1 en panne');
      if (/^CREATE TABLE IF NOT EXISTS bee_journal/i.test(sql)) { d.tables++; return { meta: { changes: 0 } }; }
      if (/^INSERT INTO bee_journal/i.test(sql)) { d.lignes.push({ id: ++d.id, ts: a[0], route: a[1], hote: a[2], app: a[3], statut: a[4], raison: a[5], canal: a[6], ia: a[7], outils: a[8], ms: a[9], appareil: a[10] }); return { meta: { changes: 1 } }; }
      if (/^DELETE FROM bee_journal/i.test(sql)) { const seuil = d.id - a[0]; d.lignes = d.lignes.filter((l) => l.id > seuil); return { meta: { changes: 1 } }; }
      return { meta: { changes: 0 } };
    } }), run: async () => { if (d.panne) throw new Error('D1 en panne'); if (/^CREATE TABLE IF NOT EXISTS bee_journal/i.test(sql)) d.tables++; return { meta: { changes: 0 } }; } });
  return d;
}

/* ───────── 1. les petites fonctions ───────── */
ok(appareil(new Request('https://x/', { headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' } })) === 'iPhone/Safari', '1. un iPhone en Safari est reconnu (jamais l\'agent complet)');
{ const c = canalSession(new Request('https://arbre.kd-mc.com/__javis/ai', { headers: { 'x-kdmc-sso': 'SECRET-TOKEN-VALUE', cookie: 'kdmc_k=1; kdmc_sso=AUTRE-SECRET', origin: 'https://arbre.kd-mc.com' } }));
  ok(/en-tête=oui/.test(c) && /cookie=oui/.test(c) && /marqueur=oui/.test(c) && /origine=arbre\.kd-mc\.com/.test(c) && !/SECRET/.test(c), '1b. le canal dit OUI/NON seulement : aucune valeur de jeton ni de cookie', c);
  const v = canalSession(new Request('https://arbre.kd-mc.com/__javis/ai', { headers: {} }));
  ok(/en-tête=non/.test(v) && /bearer=non/.test(v) && /cookie=non/.test(v) && /marqueur=non/.test(v) && /origine=aucune/.test(v), '1c. rien envoyé = tout « non »'); }
{ const db = fauxD1(); const env = { CERCLE_DB: db };
  for (let i = 0; i < GARDES_JOURNAL + 25; i++) await journaliser(env, { route: 'ai', hote: 'arbre.kd-mc.com', statut: 200, ms: i });
  ok(db.lignes.length === GARDES_JOURNAL, '1d. ' + (GARDES_JOURNAL + 25) + ' demandes → ' + GARDES_JOURNAL + ' lignes gardées (les plus récentes)', db.lignes.length);
  ok(db.lignes[0].ms === 25 && db.lignes[db.lignes.length - 1].ms === GARDES_JOURNAL + 24, '1e. ce sont bien les plus récentes qui restent');
  db.panne = true; ok(await journaliser(env, { route: 'ai' }) === false, '1f. une base en panne : le journal renonce en silence (jamais d\'exception)');
  ok(await journaliser({ CERCLE_DB: fauxD1(), BEE_JOURNAL: '0' }, { route: 'ai' }) === false && await journaliser({}, { route: 'ai' }) === false, '1g. BEE_JOURNAL=0, ou pas de base : rien n\'est écrit'); }
{ const db = fauxD1(); await journaliser({ CERCLE_DB: db }, { route: 'ai', raison: 'a<script>b\u0000c', canal: 'x'.repeat(500) });
  ok(!/[<>\u0000]/.test(db.lignes[0].raison) && db.lignes[0].canal.length <= 160, '1h. le texte écrit est nettoyé et borné'); }
{ const db = fauxD1(); let rendu = false;
  db.panne = true;
  const res = await avecJournal({ CERCLE_DB: db }, null, new Request('https://arbre.kd-mc.com/__javis/ai', { method: 'POST' }), 'ai', async () => { rendu = true; return new Response('{"ok":true}', { status: 200 }); });
  ok(rendu && res.status === 200 && (await res.json()).ok === true, '1i. même base en panne, la réponse de Bee part intacte (corps relisible)'); }

/* ───────── 2. avec le VRAI routeur ───────── */
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const signe = (uid, v = 1) => { const p = b64u(JSON.stringify({ u: uid, n: uid, c: 1, v, iat: Date.now(), exp: Date.now() + 1e9 })); return p + '.' + b64u(createHmac('sha256', 'sec').update(p).digest()); };
const vraiFetch = globalThis.fetch;
const IA_SCRIPT = { cerebras: [], groq: [] }; let IA_VUES = []; let reseau = [];
globalThis.fetch = async (url, init) => {
  const u = String(url && url.url ? url.url : url); reseau.push(u);
  const R = (corps, st) => new Response(JSON.stringify(corps), { status: st || 200, headers: { 'content-type': 'application/json' } });
  if (/identitytoolkit/.test(u)) return R({ idToken: 'jeton-anonyme' });
  if (/firebasedatabase\.app/.test(u)) return R('x');
  const four = /cerebras/.test(u) ? 'cerebras' : /groq/.test(u) ? 'groq' : '';
  if (four) { IA_VUES.push(four); const rep = IA_SCRIPT[four].shift(); return rep ? R({ choices: [{ message: rep }] }) : R({ error: 'plus de réponse prévue' }, 500); }
  return R({ error: 'réseau non prévu : ' + u }, 599);
};
const SEED = { persons: { p1: { prenom: 'Zélie', nom: 'TESTARD' }, p2: { prenom: 'Octave', nom: 'TESTARD' } } };
const kv = new Map();
const ACCOUNTS = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } };
function serveur(db, extra) { return Object.assign({ KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: sha('424242'), ACCOUNTS, CERCLE_DB: db, CEREBRAS_API_KEY: 'c', GROQ_API_KEY: 'g', AI: { run: async () => ({ response: 'ancien' }) } }, extra || {}); }
function remettre() { kv.clear(); kv.set('arbre:codehash', CH); kv.set('arbre:seed', JSON.stringify(SEED)); IA_SCRIPT.cerebras = []; IA_SCRIPT.groq = []; IA_VUES = []; reseau = []; }
const textes = [];
async function bee(env, corps, { sso = signe('kdmc_admin'), ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1', chemin = '/__javis/ai', host = 'arbre.kd-mc.com' } = {}) {
  const h = { 'content-type': 'application/json', 'user-agent': ua, origin: 'https://' + host }; if (sso) h['x-kdmc-sso'] = sso;
  const r = await mod.fetch(new Request('https://' + host + chemin, { method: 'POST', headers: h, body: JSON.stringify(corps) }), env, { waitUntil() {} });
  const t = await r.text(); textes.push(t); let j = null; try { j = JSON.parse(t); } catch (_) {}
  return { st: r.status, j };
}

{ remettre(); const db = fauxD1(); const env = serveur(db);
  IA_SCRIPT.cerebras = [{ content: 'Voici une réponse' }];
  const r = await bee(env, { messages: [{ role: 'user', content: 'Bonjour, ma question privée de Kevin' }], contexte: { app: 'arbre', titre: 'Arbre' } });
  ok(r.st === 200 && r.j.ok, '2. Kevin parle à Bee : 200', JSON.stringify(r.j));
  ok(db.lignes.length === 1 && db.lignes[0].route === 'ai' && db.lignes[0].statut === 200 && db.lignes[0].hote === 'arbre.kd-mc.com' && db.lignes[0].ia === 'cerebras' && db.lignes[0].appareil === 'iPhone/Safari', '2b. une ligne de journal : route, résultat, IA, appareil', JSON.stringify(db.lignes[0]));
  ok(/en-tête=oui/.test(db.lignes[0].canal) && /origine=arbre\.kd-mc\.com/.test(db.lignes[0].canal), '2c. et par quel canal la session est arrivée');
  ok(!JSON.stringify(db.lignes).includes('ma question privée') && !JSON.stringify(db.lignes).includes(signe('kdmc_admin').slice(0, 20)) && !JSON.stringify(db.lignes).includes(CH), '2d. le journal ne contient NI le message de Kevin, NI un jeton, NI l\'empreinte du code famille');
  /* un inconnu */
  const x = await bee(env, { messages: [{ role: 'user', content: 'je suis un inconnu' }] }, { sso: null, ua: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120' });
  ok(x.st === 403 && IA_VUES.length === 1, '2e. un inconnu : 403 et AUCUNE IA appelée (seule celle de Kevin a servi)');
  const l = db.lignes[db.lignes.length - 1];
  ok(l.statut === 403 && l.raison === 'kevin_seulement' && /en-tête=non/.test(l.canal) && l.appareil === 'Windows/Chrome', '2f. le refus est DANS le journal avec sa raison et ce que le navigateur envoyait (c\'est lui qui explique « Bee ne fait rien »)', JSON.stringify(l));
  /* la route agir et la route fil */
  await bee(env, { jeton: 'v1.x.' + 'a'.repeat(64), confirme: true }, { chemin: '/__javis/agir', sso: null });
  ok(db.lignes.some((z) => z.route === 'agir' && z.statut === 403), '2g. /__javis/agir est journalisé aussi');
  await mod.fetch(new Request('https://arbre.kd-mc.com/__javis/fil', { method: 'GET', headers: {} }), env, { waitUntil() {} });
  ok(db.lignes.some((z) => z.route === 'fil'), '2h. /__javis/fil aussi'); }

{ /* base en panne : Bee répond quand même */
  remettre(); const db = fauxD1(); db.panne = true; const env = serveur(db); IA_SCRIPT.cerebras = [{ content: 'Réponse malgré la panne du journal' }];
  const r = await bee(env, { messages: [{ role: 'user', content: 'Salut' }] });
  ok(r.st === 200 && /malgré la panne/.test(r.j.text), '3. journal en panne : Bee répond normalement'); }
{ remettre(); const db = fauxD1(); const env = serveur(db, { BEE_JOURNAL: '0' }); IA_SCRIPT.cerebras = [{ content: 'ok' }];
  await bee(env, { messages: [{ role: 'user', content: 'Salut' }] });
  ok(db.lignes.length === 0 && db.tables === 0, '3b. BEE_JOURNAL=0 : rien n\'est écrit, rien n\'est créé'); }

/* ───────── le test de Bee ───────── */
{ remettre(); const db = fauxD1(); const env = serveur(db); IA_SCRIPT.cerebras = [{ content: 'ok' }];
  const r = await bee(env, { diag: true });
  ok(r.st === 200 && r.j.ok === true && typeof r.j.texte === 'string', '4. « Tester Bee » : Kevin reçoit un bilan', JSON.stringify(r.j));
  const t = r.j.texte;
  ok(/Session : ✅ Face ID prouvé/.test(t) && /arrivée par jeton/.test(t), '4b. la session est dite prouvée, et par quel chemin');
  ok(/IA gratuites à outils avec clé : cerebras, groq/.test(t) && /répond à l'instant : ✅ cerebras/.test(t), '4c. les IA gratuites avec clé + celle qui répond VRAIMENT');
  ok(/Arbre publié sur le domaine : ✅ 2 personnes/.test(t) && /Code famille connu du domaine : ✅ oui/.test(t) && /Nuage de l'arbre \(lecture\) : ✅ répond/.test(t), '4d. l\'arbre : publié, code famille connu, nuage qui répond');
  ok(/Interrupteurs : ✅ tous allumés/.test(t) && /Bee est en état de travailler/.test(t) && r.j.ok, '4e. conclusion : en état de travailler');
  ok(!t.includes(CH) && !t.includes('jeton-anonyme') && !/AIza/.test(t), '4f. le bilan ne montre NI l\'empreinte du code famille, NI un jeton, NI une clé');
  ok(!reseau.some((u) => /firebasedatabase\.app/.test(u) && /PUT|PATCH/.test(u)) , '4g. le test ne fait que LIRE l\'arbre'); }
{ /* aucune IA ne répond */
  remettre(); const env = serveur(fauxD1());
  const r = await bee(env, { diag: true });
  ok(r.st === 200 && /répond à l'instant : ❌ aucune/.test(r.j.texte) && r.j.ok === false && /Voilà ce qui bloque/.test(r.j.texte), '5. aucune IA gratuite ne répond : le bilan le dit (❌) et conclut « voilà ce qui bloque »', r.j && r.j.texte); }
{ /* interrupteurs coupés + arbre non publié */
  remettre(); kv.delete('arbre:seed'); kv.delete('arbre:codehash'); const env = serveur(fauxD1(), { BEE_ARBRE_ECRIRE: '0' }); IA_SCRIPT.cerebras = [{ content: 'ok' }];
  const r = await bee(env, { diag: true });
  ok(/Arbre publié sur le domaine : ❌ non/.test(r.j.texte) && /Code famille connu du domaine : ❌ non/.test(r.j.texte) && /coupés : BEE_ARBRE_ECRIRE/.test(r.j.texte), '6. arbre non publié + interrupteur coupé : dits en clair'); }
{ /* inconnu : pas de test, pas d'IA */
  remettre(); const env = serveur(fauxD1());
  const r = await bee(env, { diag: true }, { sso: null });
  ok(r.st === 403 && IA_VUES.length === 0 && !(r.j && r.j.texte), '7. un inconnu ne peut PAS lancer le test (403) et aucune IA n\'est sollicitée'); }
{ /* session faible (sans Face ID) = refus */
  remettre(); const env = serveur(fauxD1());
  const r = await bee(env, { diag: true }, { sso: signe('kdmc_admin', 0) });
  ok(r.st === 403, '8. un jeton SANS Face ID n\'ouvre pas le test'); }

/* ───────── 0 € ───────── */
ok(!reseau.some((u) => /anthropic|openai\.com|googleapis\.com\/v1beta|mistral|deepseek/i.test(u)), '9. 0 € : aucun moteur payant appelé');
ok(!textes.join('\n').includes(CH), '10. l\'empreinte du code famille n\'apparaît dans AUCUNE réponse');
ok((await bilanDiag({}, { session: {}, fournisseurs: [], ia: async () => null, arbre: async () => null })).ok === false, '11. sans session ni IA : le bilan dit non, il ne ment pas');
{ const b = await bilanDiag({}, { session: { grant: true }, fournisseurs: [], ia: async () => null, arbre: async () => null, pauses: { groq: { secondes: 42, raison: 'quota presque à sec (tokens)' }, cerebras: { secondes: 840, raison: 'outils : 429' } } });
  ok(/en PAUSE à l'instant : groq \(quota presque à sec \(tokens\), encore 42 s\) · cerebras/.test(b.texte), '12. le bilan nomme les IA gratuites EN PAUSE, la raison et le temps restant (cause visible, plus de « Bee ne fait rien » muet)', b.texte);
  const c = await bilanDiag({}, { session: { grant: true }, fournisseurs: [], ia: async () => null, arbre: async () => null, pauses: {} });
  ok(/en pause : aucune/.test(c.texte), '12b. aucune pause : il le dit'); }

globalThis.fetch = vraiFetch;
console.log('\n' + pass + ' ✓ / ' + fail + ' ✗  (bee-diag)');
process.exit(fail ? 1 : 0);
