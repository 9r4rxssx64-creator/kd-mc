/* GARDE — « BEE ÉCRIT À UNE PERSONNE DANS CMCteams / LA LIGHT » (Kevin 18.11.2026 : « il doit pouvoir agir partout… faire tout ce que je lui demande »).
 * Avec le VRAI routeur, une fausse IA, une D1 SQLite (le vrai mini-chat tourne) :
 *   1. la carte montre le message EN ENTIER et le nom ; rien n'est écrit avant le ✅ ;
 *   2. ✅ → UN message dans le fil de la personne (via la porte du mini-chat, avec la session de Kevin) ; rejouer la carte : 409 ;
 *   3. un seul mot comme nom, un message vide, un lien javascript: : refusés AVANT la carte ; un texte piégé est nettoyé ; 500 signes au plus ;
 *   4. un autre compte, un inconnu, de faux en-têtes admin, une signature trafiquée : rien n'est écrit ;
 *   5. BEE_MESSAGES_DIRECTS=0 coupe ; la porte du mini-chat est dans la liste fermée de Bee ; 0 € : aucun moteur payant.
 *   SABOTAGE=porte → la porte sort de la liste (le garde doit rougir) · SABOTAGE=valider → un seul mot passe comme nom.
 * node services/kdmc-router/bee-messages-directs.test.mjs */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, copyFileSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash, createHmac } from 'node:crypto';

/* SABOTAGE : on copie le dossier du routeur, on casse UNE chose, et on importe la copie. */
const SAB = process.env.SABOTAGE || '';
const ICI = fileURLToPath(new URL('.', import.meta.url));
let base = ICI;
if (SAB) {
  const racine = mkdtempSync(join(tmpdir(), 'bmd-sab-'));
  mkdirSync(join(racine, 'kdmc-router')); symlinkSync(join(ICI, '..', '_shared'), join(racine, '_shared'));
  base = join(racine, 'kdmc-router') + '/';
  for (const f of readdirSync(ICI)) if (/\.(js|mjs|json)$/.test(f)) copyFileSync(join(ICI, f), join(base, f));
  const casser = (f, de, vers) => { const p = join(base, f); const a = readFileSync(p, 'utf8'); const b = a.replace(de, vers); if (a === b) { console.log('SABOTAGE sans effet : ' + SAB); process.exit(2); } writeFileSync(p, b); };
  if (SAB === 'porte') casser('worker.js', ", '/__dm/admin/ecrire'];", '];');
  else if (SAB === 'valider') casser('bee-messages-directs.js', "if (nom.split(/[\\s-]+/).filter((m) => m.length > 0).length < 2) return", 'if (false) return');
  else { console.log('SABOTAGE inconnu : ' + SAB); process.exit(2); }
}
const mod = (await import(pathToFileURL(join(base, 'worker.js')).href)).default;
const { CATALOGUE, ACTIONS, RE_AGIR } = await import(pathToFileURL(join(base, 'bee-agir.js')).href);
const { ACTIONS_MESSAGES_DIRECTS, MAX_MESSAGE, RE_MESSAGES_DIRECTS, REGLES_MESSAGES_DIRECTS } = await import(pathToFileURL(join(base, 'bee-messages-directs.js')).href);

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m + (d !== undefined ? ' → ' + String(d).slice(0, 300) : '')); } };
const sha = (t) => createHash('sha256').update(t).digest('hex');
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const signe = (uid, v = 1) => { const p = b64u(JSON.stringify({ u: uid, n: uid, c: 1, v, iat: Date.now(), exp: Date.now() + 1e9 })); return p + '.' + b64u(createHmac('sha256', 'sec').update(p).digest()); };

/* une D1 SQLite : le vrai mini-chat et le vrai registre des cartes tournent dessus */
function d1() {
  const s = new DatabaseSync(':memory:');
  const stmt = (sql, p = []) => ({
    bind: (...x) => stmt(sql, x),
    first: async () => s.prepare(sql).get(...p) ?? null,
    all: async () => ({ results: s.prepare(sql).all(...p) }),
    run: async () => { const r = s.prepare(sql).run(...p); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
  });
  return { prepare: (sql) => stmt(sql), _s: s };
}
const vraiFetch = globalThis.fetch; const reseau = []; const IA_SCRIPT = { cerebras: [], groq: [] }; const vuesIA = [];
globalThis.fetch = async (url, init) => {
  const u = String(url && url.url ? url.url : url); reseau.push(u);
  const R = (corps, st) => new Response(JSON.stringify(corps), { status: st || 200, headers: { 'content-type': 'application/json' } });
  const four = /cerebras/.test(u) ? 'cerebras' : /groq/.test(u) ? 'groq' : '';
  if (four) { if (init && init.body) { try { vuesIA.push(JSON.parse(init.body)); } catch (_) {} } const rep = IA_SCRIPT[four].shift(); return rep ? R({ choices: [{ message: rep }] }) : R({ error: 'plus de réponse prévue' }, 500); }
  return R({ error: 'réseau non prévu : ' + u }, 599);
};
const kv = new Map(); const ACCOUNTS = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); }, list: async () => ({ keys: [] }) };
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
async function carte(env, texte, champs) { vuesIA.length = 0; IA_SCRIPT.cerebras = [{ content: '', tool_calls: [outil('p', 'proposer_action', Object.assign({ action: 'message_direct' }, champs))] }, { content: 'Prête.' }]; const r = await bee(env, texte); return { r, p: r.j && r.j.propositions && r.j.propositions[0] }; }
const lignesDm = (db) => { try { return db._s.prepare('SELECT * FROM dm').all(); } catch (_) { return []; } };

const MSG = 'Bonjour Davy, ton planning de décembre est en ligne, dis-moi si une case te paraît fausse.';
{ const db = d1(); const env = mkEnv(db);
  const { r, p } = await carte(env, 'écris à Davy Martin que son planning est en ligne', { nom: 'Davy Martin', texte: MSG });
  ok(r.st === 200 && p && p.action === 'message_direct' && p.risque === 'moyen', '1. la carte « écrire à une personne » est prête, risque moyen', JSON.stringify(r.j));
  ok(p && p.resume.includes(MSG) && p.resume.includes('Davy Martin') && /prochaine ouverture/.test(p.resume), '1b. la carte montre le message EN ENTIER, le nom, et dit quand il sera lu');
  ok(lignesDm(db).length === 0, '1c. avant le ✅ : aucun message n\'est écrit');
  const a = await agir(env, p.jeton);
  ok(a.st === 200 && a.j.ok && /Message déposé pour Davy Martin/.test(a.j.texte), '2. ✅ → « Message déposé » — ' + JSON.stringify(a.j));
  const l = lignesDm(db);
  ok(l.length === 1 && String(l.map((x) => Object.values(x).join('|')).join('')).includes('planning de décembre'), '2b. UN message est dans le fil de la personne (le vrai mini-chat l\'a écrit)', JSON.stringify(l));
  ok((await agir(env, p.jeton)).st === 409 && lignesDm(db).length === 1, '2c. la même carte rejouée : 409, pas de doublon'); }

/* refusés AVANT la carte */
for (const [nom, champs, re] of [['un seul mot comme nom', { nom: 'Davy', texte: MSG }, /prénom ET le nom/], ['message vide', { nom: 'Davy Martin', texte: '   ' }, /Il manque le message/], ['lien javascript:', { nom: 'Davy Martin', texte: 'clique javascript:alert(1)' }, /lien interdit/]]) {
  const db = d1(); const env = mkEnv(db); const { p } = await carte(env, 'écris à Davy que…', champs);
  ok(!p && re.test(toolMsgs(vuesIA)) && lignesDm(db).length === 0, '3. refusé avant la carte : ' + nom + ' — ' + toolMsgs(vuesIA).slice(-100)); }
{ const db = d1(); const env = mkEnv(db); const long = 'a'.repeat(MAX_MESSAGE + 300);
  const { p } = await carte(env, 'écris à Davy Martin', { nom: 'Davy <b>Martin</b>', texte: long });
  ok(p && p.resume.length < MAX_MESSAGE + 400, '3b. un message trop long est coupé à ' + MAX_MESSAGE + ' signes'); }

/* les intrus */
{ const db = d1(); const env = mkEnv(db); const { p } = await carte(env, 'écris à Davy Martin', { nom: 'Davy Martin', texte: MSG });
  for (const [nom, h] of [['un autre compte', { 'x-kdmc-sso': signe('zelie_testard') }], ['un inconnu', {}], ['de faux en-têtes admin', { 'x-kdmc-admin': 'inventé' }]]) {
    ok((await agir(env, p.jeton, h)).st === 403, '4. ' + nom + ' avec une carte VALIDE : 403'); }
  ok((await agir(env, p.jeton.replace(/\.[0-9a-f]{64}$/, '.' + '0'.repeat(64)))).st === 400, '4b. signature remplacée : 400');
  ok(lignesDm(db).length === 0, '4c. après tous ces essais : aucun message écrit'); }

/* interrupteur */
{ const db = d1(); const env = mkEnv(db, { BEE_MESSAGES_DIRECTS: '0' }); const { p } = await carte(env, 'écris à Davy Martin', { nom: 'Davy Martin', texte: MSG });
  const a = await agir(env, p.jeton); ok(!a.j.ok && /coupé/.test(a.j.texte) && lignesDm(db).length === 0, '5. BEE_MESSAGES_DIRECTS=0 : rien n\'est écrit, et c\'est dit — ' + JSON.stringify(a.j)); }

/* câblage */
ok(ACTIONS.includes('message_direct') && CATALOGUE.message_direct === ACTIONS_MESSAGES_DIRECTS.message_direct, '6. l\'action est dans le catalogue signé');
const W = readFileSync(join(base, 'worker.js'), 'utf8');
ok(/const PORTES_BEE = \[[^\]]*'\/__dm\/admin\/ecrire'/.test(W), '6b. la porte du mini-chat (admin) est dans la liste FERMÉE des portes de Bee');
ok(/REGLES_MESSAGES_DIRECTS/.test(W.replace(/import[^\n]*\n/, '')), '6c. les règles de Bee pour écrire sont dans son prompt');
for (const q of ['écris à Davy que son planning est prêt', 'envoie-lui un message', 'dis à Marie de passer', 'préviens-le', 'écris un message direct à Léa']) ok(RE_AGIR.test(q) && RE_MESSAGES_DIRECTS.test(q), '6d. prend les mains : « ' + q + ' »');
ok(/proposer_action avec l'action message_direct/.test(REGLES_MESSAGES_DIRECTS) && /Ne dis jamais « envoyé » avant le ✅/.test(REGLES_MESSAGES_DIRECTS), '6e. Bee doit passer par la carte ✅ et ne jamais dire « envoyé » avant');
ok(/RE_MESSAGES_DIRECTS\.test\(dernierMsg\) \? REGLES_MESSAGES_DIRECTS/.test(W), '6g. les règles ne sont ajoutées au prompt QUE si la demande parle d\'écrire (sinon +200 jetons à chaque demande d\'action : plafond de bee-allege dépassé, 18.11)');
ok(!Object.keys(ACTIONS_MESSAGES_DIRECTS).some((a) => /tous|all|broadcast|diffus/i.test(a)), '6f. aucune action « à tout le monde » : un message = une personne');
const M = readFileSync(join(base, 'bee-messages-directs.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
ok(!/fetch\(/.test(M) && !/ghp_|api\.github\.com/.test(M), '6g. le module n\'appelle aucun service : il ne fait que rappeler la porte du mini-chat');
ok(!reseau.some((u) => /anthropic|openai\.com|github|googleapis\.com\/v1beta|mistral|deepseek/i.test(u)), '7. 0 € : aucun moteur payant, aucun GitHub');

globalThis.fetch = vraiFetch;
console.log('\n' + pass + ' ✓ / ' + fail + ' ✗  (bee-messages-directs' + (SAB ? ' · SABOTAGE=' + SAB : '') + ')');
process.exit(fail ? 1 : 0);
