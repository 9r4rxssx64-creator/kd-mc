/* GARDE — « ELLE LANCE CLAUDE CODE ELLE-MÊME » (Kevin 16.10.2026), CE QUI EST VRAIMENT POSSIBLE : DÉPOSER LA TÂCHE, AVEC SON ✅, DANS UNE BOÎTE QUE CLAUDE CODE LIT.
 * Avec le VRAI routeur, une fausse IA, une fausse base D1 :
 *   1. la carte montre le TEXTE COMPLET de la consigne et dit que rien ne s'exécute maintenant ; rien n'est écrit avant le ✅ ;
 *   2. ✅ → UNE ligne en attente dans la boîte (titre, consigne, date) ; rejouer la carte : 409 ; plafond de 20 tâches en attente ;
 *   3. titre ou consigne trop courts : refusés AVANT la carte ; un texte piégé reste du texte ; un secret n'est pas demandé ;
 *   4. un autre compte, un inconnu, une signature trafiquée : rien n'est écrit ; l'outil taches_code ne rend que ce que Kevin a déposé ;
 *   5. BEE_TACHES=0 coupe ; 0 € : aucun moteur payant, aucun jeton GitHub (le domaine n'en a pas) ; le rappel de démarrage de Claude Code nomme la boîte.
 * node services/kdmc-router/bee-taches.test.mjs */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash, createHmac } from 'node:crypto';
import mod from './worker.js';
import { CATALOGUE, ACTIONS, RE_AGIR } from './bee-agir.js';
import { ACTIONS_TACHES, MAX_ATTENTE, MAX_CONSIGNE, outilsTaches, RE_TACHES, REGLES_TACHES } from './bee-taches.js';

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m + (d !== undefined ? ' → ' + String(d).slice(0, 300) : '')); } };
const sha = (t) => createHash('sha256').update(t).digest('hex');
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const signe = (uid, v = 1) => { const p = b64u(JSON.stringify({ u: uid, n: uid, c: 1, v, iat: Date.now(), exp: Date.now() + 1e9 })); return p + '.' + b64u(createHmac('sha256', 'sec').update(p).digest()); };

/* une fausse D1 qui comprend la boîte des tâches */
function fauxD1() {
  const d = { lignes: [], id: 0, vus: new Set() };
  const rep = (sql, a) => ({
    run: async () => { if (/^INSERT OR IGNORE INTO bee_agir_vus/i.test(sql)) { const n = String(a[0]); if (d.vus.has(n)) return { meta: { changes: 0 } }; d.vus.add(n); return { meta: { changes: 1 } }; } if (/^INSERT INTO bee_taches/i.test(sql)) d.lignes.push({ id: ++d.id, titre: a[0], consigne: a[1], cree: a[2], statut: 'attente', note: null, fait_le: null }); return { meta: { changes: 1 } }; },
    first: async () => (/COUNT\(\*\)/i.test(sql) ? { n: d.lignes.filter((l) => l.statut === 'attente').length } : null),
    all: async () => ({ results: d.lignes.slice().reverse().slice(0, 10) }),
  });
  d.prepare = (sql) => Object.assign(rep(sql, []), { bind: (...a) => rep(sql, a) });
  return d;
}
const vraiFetch = globalThis.fetch; let reseau = []; const IA_SCRIPT = { cerebras: [], groq: [] };
globalThis.fetch = async (url, init) => {
  const u = String(url && url.url ? url.url : url); reseau.push(u);
  const R = (corps, st) => new Response(JSON.stringify(corps), { status: st || 200, headers: { 'content-type': 'application/json' } });
  const four = /cerebras/.test(u) ? 'cerebras' : /groq/.test(u) ? 'groq' : '';
  if (four) { const rep = IA_SCRIPT[four].shift(); return rep ? R({ choices: [{ message: rep }] }) : R({ error: 'plus de réponse prévue' }, 500); }
  return R({ error: 'réseau non prévu : ' + u }, 599);
};
const kv = new Map(); const ACCOUNTS = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } };
const mkEnv = (db, extra) => Object.assign({ KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: sha('424242'), ACCOUNTS, CERCLE_DB: db, CEREBRAS_API_KEY: 'c', GROQ_API_KEY: 'g', AI: { run: async () => ({ response: 'ancien' }) } }, extra || {});
const outil = (id, name, args) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args || {}) } });
const toolMsgs = (vues) => vues.flatMap((v) => v.messages.filter((m) => m.role === 'tool').map((m) => m.content)).join('\n');
const KEVIN = { 'x-kdmc-sso': signe('kdmc_admin') };
async function bee(env, texte) {
  const r = await mod.fetch(new Request('https://arbre.kd-mc.com/__javis/ai', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json', origin: 'https://arbre.kd-mc.com' }, KEVIN), body: JSON.stringify({ messages: [{ role: 'user', content: texte }] }) }), env, { waitUntil() {} });
  return { st: r.status, j: await r.json().catch(() => null) };
}
async function agir(env, jeton, h) {
  const r = await mod.fetch(new Request('https://arbre.kd-mc.com/__javis/agir', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json', origin: 'https://arbre.kd-mc.com' }, h || KEVIN), body: JSON.stringify({ jeton, confirme: true }) }), env, { waitUntil() {} });
  return { st: r.status, j: await r.json().catch(() => null) };
}
const vuesIA = [];
const _f = globalThis.fetch; globalThis.fetch = async (url, init) => { const u = String(url && url.url ? url.url : url); if (/cerebras|groq/.test(u) && init && init.body) { try { vuesIA.push(JSON.parse(init.body)); } catch (_) {} } return _f(url, init); };
async function carte(env, texte, champs) { vuesIA.length = 0; IA_SCRIPT.cerebras = [{ content: '', tool_calls: [outil('p', 'proposer_action', Object.assign({ action: 'tache_code' }, champs))] }, { content: 'Prête.' }]; const r = await bee(env, texte); return { r, p: r.j && r.j.propositions && r.j.propositions[0] }; }

const CONSIGNE = 'Dans l\'app Lingua, ajoute un bouton « Réviser mes erreurs » sur l\'écran d\'accueil qui ouvre les 10 derniers mots ratés. Ne casse pas le mode hors ligne ; lance les tests de Lingua avant de publier.';
{ const db = fauxD1(); const env = mkEnv(db);
  const { r, p } = await carte(env, 'dépose une tâche pour Claude Code : un bouton dans Lingua', { titre: 'Bouton « Réviser mes erreurs » dans Lingua', consigne: CONSIGNE });
  ok(r.st === 200 && p && p.action === 'tache_code' && p.risque === 'moyen', '1. la carte « tâche pour Claude Code » est prête, risque moyen', JSON.stringify(r.j));
  ok(p && p.resume.includes(CONSIGNE) && /Rien n'est exécuté maintenant/.test(p.resume) && /prochain démarrage/.test(p.resume), '1b. la carte montre la consigne EN ENTIER et dit que rien ne s\'exécute maintenant');
  ok(db.lignes.length === 0, '1c. avant le ✅ : rien n\'est écrit dans la boîte');
  const a = await agir(env, p.jeton);
  ok(a.st === 200 && a.j.ok && /Tâche déposée/.test(a.j.texte) && db.lignes.length === 1 && db.lignes[0].consigne === CONSIGNE && db.lignes[0].statut === 'attente' && db.lignes[0].titre.includes('Réviser'), '2. ✅ → UNE tâche en attente dans la boîte, consigne intacte — ' + JSON.stringify(a.j));
  ok((await agir(env, p.jeton)).st === 409 && db.lignes.length === 1, '2b. la même carte rejouée : 409, pas de doublon');
  /* l'outil de lecture */
  IA_SCRIPT.cerebras = [{ content: '', tool_calls: [outil('t', 'taches_code', {})] }, { content: 'Voilà.' }]; vuesIA.length = 0;
  await bee(env, 'où en est ma tâche pour Claude Code ?');
  const t = toolMsgs(vuesIA); ok(/1 tâche\(s\)/.test(t) && /\[attente\]/.test(t) && /Réviser mes erreurs/.test(t), '2c. taches_code : la liste avec le statut — ' + t.slice(0, 160)); }
{ const db = fauxD1(); const env = mkEnv(db);
  for (let i = 0; i < MAX_ATTENTE; i++) db.lignes.push({ id: ++db.id, titre: 't' + i, consigne: 'x', cree: 1, statut: 'attente' });
  const { p } = await carte(env, 'dépose une tâche pour Claude Code', { titre: 'Encore une', consigne: CONSIGNE });
  const a = await agir(env, p.jeton);
  ok(!a.j.ok && /déjà 20 tâches en attente/.test(a.j.texte) && db.lignes.length === MAX_ATTENTE, '2d. plafond de ' + MAX_ATTENTE + ' tâches en attente : refusé, dit, rien d\'écrit — ' + a.j.texte); }
for (const [nom, champs, re] of [['titre trop court', { titre: 'a', consigne: CONSIGNE }, /titre de la tâche/], ['consigne trop courte', { titre: 'Un bouton', consigne: 'fais-le' }, /consigne est trop courte/], ['rien', {}, /titre de la tâche/]]) {
  const db = fauxD1(); const env = mkEnv(db); const { p } = await carte(env, 'dépose une tâche pour Claude Code', champs);
  ok(!p && re.test(toolMsgs(vuesIA)) && db.lignes.length === 0, '3. refusé avant la carte : ' + nom + ' — ' + toolMsgs(vuesIA).slice(-100)); }
{ const db = fauxD1(); const env = mkEnv(db); const long = 'a'.repeat(MAX_CONSIGNE + 500);
  const { p } = await carte(env, 'dépose une tâche pour Claude Code', { titre: 'Texte piégé <img onerror=alert(1)>', consigne: long });
  ok(p && !/</.test(p.resume) && p.resume.length < MAX_CONSIGNE + 400, '3b. un texte piégé (<img…>) est nettoyé, et une consigne trop longue est coupée à ' + MAX_CONSIGNE + ' (la carte la montre en entier)'); }

/* ───────── les intrus ───────── */
{ const db = fauxD1(); const env = mkEnv(db); const { p } = await carte(env, 'dépose une tâche pour Claude Code', { titre: 'Un bouton', consigne: CONSIGNE });
  for (const [nom, h] of [['un autre compte', { 'x-kdmc-sso': signe('zelie_testard') }], ['un inconnu', {}], ['de faux en-têtes admin', { 'x-kdmc-admin': 'inventé' }]]) {
    ok((await agir(env, p.jeton, h)).st === 403, '4. ' + nom + ' avec une carte VALIDE : 403'); }
  ok((await agir(env, p.jeton.replace(/\.[0-9a-f]{64}$/, '.' + '0'.repeat(64)))).st === 400, '4b. signature remplacée : 400');
  ok(db.lignes.length === 0, '4c. après tous ces essais : la boîte est vide'); }
{ const db = fauxD1(); const env = mkEnv(db, { BEE_TACHES: '0' }); const { p } = await carte(env, 'dépose une tâche pour Claude Code', { titre: 'Un bouton', consigne: CONSIGNE });
  const a = await agir(env, p.jeton); ok(!a.j.ok && /pas disponible/.test(a.j.texte) && db.lignes.length === 0, '5. BEE_TACHES=0 : rien n\'est déposé, et c\'est dit'); }

/* ───────── câblage ───────── */
ok(ACTIONS.includes('tache_code') && CATALOGUE.tache_code === ACTIONS_TACHES.tache_code && !Object.keys(ACTIONS_TACHES).some((a) => /deploy|push|merge|secret|cle|token/i.test(a)), '6. une seule action, dans le catalogue signé : elle DÉPOSE, elle ne déploie ni ne pousse rien');
const T = readFileSync(new URL('./bee-taches.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
ok(!/api\.github\.com|GITHUB|ghp_|github_pat|Authorization/i.test(T) && !/fetch\(/.test(T), '6b. le domaine n\'a AUCUN jeton GitHub et le module n\'appelle aucun service : il écrit seulement dans D1');
for (const q of ['dépose une tâche pour Claude Code', 'déploie la nouvelle version de Lingua', 'crée une page pour mes recettes', 'corrige le bug du bouton', 'modifie le code de l\'arbre', 'développe un outil de calcul']) ok(RE_AGIR.test(q) && RE_TACHES.test(q), '6c. prend les mains : « ' + q + ' »');
ok(/proposer_action \(action tache_code/.test(REGLES_TACHES) && /jamais dans la consigne un secret/i.test(REGLES_TACHES.replace('N\'écris jamais dans la consigne un secret', 'jamais dans la consigne un secret')), '6d. les règles de Bee lui disent de déposer la tâche (carte ✅) et de ne jamais y mettre un secret');
const sortieRappel = execFileSync('node', [fileURLToPath(new URL('../../tools/pipeline/rappel.mjs', import.meta.url))], { encoding: 'utf8', timeout: 60000 });
ok(/Tâches déposées par Bee/.test(sortieRappel) && /bee_taches WHERE statut=/.test(sortieRappel) && /0b49b8eb-8df8-49fe-93f7-1e385bf98b34/.test(sortieRappel), '7. le rappel de démarrage de Claude Code (EXÉCUTÉ) nomme la boîte : base, table, requête — la tâche est lue à chaque session');
ok(!reseau.some((u) => /anthropic|openai\.com|github|googleapis\.com\/v1beta|mistral|deepseek/i.test(u)), '8. 0 € et aucun appel à GitHub');
ok(outilsTaches({}).exe && (await outilsTaches({}).exe.taches_code()) === 'La boîte des tâches est absente.', '9. sans base : l\'outil le dit');

globalThis.fetch = vraiFetch;
console.log('\n' + pass + ' ✓ / ' + fail + ' ✗  (bee-taches)');
process.exit(fail ? 1 : 0);
