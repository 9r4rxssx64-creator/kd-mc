/* PREUVE — les nouveaux paliers gratuits sont AUSSI dans le worker kdmc-apis
 * (celui que les autres apps du domaine appellent), et pas seulement dans
 * Créa Studio. Kevin 2026-08-12 : « ajouter PARTOUT dans les apps en secours ».
 *
 * Sans réseau (fetch mocké), sur le VRAI worker :
 *   1. chaque nouveau moteur est branché : chaîne + modèle + adresse + secret
 *   2. l'ordre existant n'a pas bougé (aucune régression de préférence)
 *   3. PARITÉ avec le worker Créa Studio : même adresse et même modèle des
 *      deux côtés (leçon #142 : deux surfaces qui implémentent la même règle
 *      doivent être vérifiées sur le CONTENU, pas seulement l'égalité)
 *   4. secours réel : les 8 premiers tombent → un nouveau répond vraiment
 *   5. une clé absente n'est jamais appelée et n'invente aucune erreur
 *   6. /health n'annonce que ce qui est réellement branché
 * Lancer : node tests/verify-apis-paliers-gratuits.mjs
 */
import worker, { AI_CHAIN, AI_DEFAULT_MODEL, secretName, buildAiRequest } from '../services/kdmc-apis/worker.js';
import { readFileSync } from 'node:fs';

const R = { ok: [], ko: [] };
const chk = (c, m) => (c ? R.ok : R.ko).push(m);
const NOUVEAUX = ['perplexity', 'cerebras', 'nvidia', 'sambanova', 'huggingface', 'scaleway', 'nebius', 'glm', 'qwen'];
const ANCIENS = ['gemini', 'groq', 'openrouter', 'mistral', 'cohere', 'deepseek', 'together', 'xai'];

/* --- 1. branché de bout en bout --- */
NOUVEAUX.forEach((p) => {
  const req = buildAiRequest(p, 'CLE', { messages: [{ role: 'user', content: 'salut' }] });
  chk(AI_CHAIN.includes(p) && !!AI_DEFAULT_MODEL[p] && !!secretName(p) && !!req && /^https:/.test(req.url || ''),
    `1. « ${p} » est branché de bout en bout (chaîne + modèle + secret + adresse)`);
});

/* --- 2. l'ordre existant est intact --- */
chk(ANCIENS.every((p, i) => AI_CHAIN[i] === p), '2. les 8 moteurs d\'origine gardent EXACTEMENT leur ordre');
chk(AI_CHAIN.indexOf('perplexity') === ANCIENS.length, '2. les nouveaux sont ajoutés APRÈS (aucun passe-droit)');

/* --- 3. parité avec le worker Créa Studio --- */
const crea = readFileSync(new URL('../services/kdmc-crea-ai/worker.js', import.meta.url), 'utf8');
const bloc = crea.slice(crea.indexOf('const TEXT_PROVIDERS'), crea.indexOf('/* Appel « compatible OpenAI »'));
const lignes = [...bloc.matchAll(/id:\s*'([a-z]+)',\s*key:\s*'([A-Z_]+)',\s*url:\s*'([^']*)',\s*model:\s*'([^']+)'/g)];
const chezCrea = {};
lignes.forEach((m) => { chezCrea[m[1]] = { key: m[2], url: m[3], model: m[4] }; });
NOUVEAUX.forEach((p) => {
  const c = chezCrea[p];
  if (!c) { chk(false, `3. « ${p} » existe aussi dans Créa Studio`); return; }
  const req = buildAiRequest(p, 'CLE', { messages: [] });
  chk(c.key === secretName(p), `3. « ${p} » : MÊME nom de secret des 2 côtés (${c.key})`);
  chk(c.url === (req && req.url), `3. « ${p} » : MÊME adresse des 2 côtés`);
  chk(c.model === AI_DEFAULT_MODEL[p], `3. « ${p} » : MÊME modèle des 2 côtés (${c.model})`);
});

/* --- 3bis. le nom du secret doit être le MÊME dans les workflows de déploiement.
   C'est la panne classique (leçon « noms de secrets exacts ») : le code attend
   OPENAI_API_KEY, Kevin a stocké OPEN_AI_API_KEY → la clé n'arrive jamais et
   le moteur reste muet sans qu'on comprenne pourquoi. */
const wfApis = readFileSync(new URL('../.github/workflows/deploy-kdmc-apis.yml', import.meta.url), 'utf8');
const wfCrea = readFileSync(new URL('../.github/workflows/deploy-kdmc-crea-ai.yml', import.meta.url), 'utf8');
NOUVEAUX.forEach((p) => {
  const s = secretName(p);
  chk(wfApis.includes('secrets.' + s) && new RegExp('\\b' + s + '\\b').test(wfApis),
    `3bis. « ${p} » : ${s} est bien injecté par le déploiement de apis.kd-mc.com`);
  chk(wfCrea.includes('secrets.' + s),
    `3bis. « ${p} » : ${s} est bien injecté par le déploiement de Créa Studio`);
});

/* --- 4 & 5. secours réel, sans réseau --- */
let appeles = [];
global.fetch = async (u) => {
  const url = String(u);
  appeles.push(url);
  if (/api\.cerebras\.ai/.test(url)) {
    return new Response(JSON.stringify({ choices: [{ message: { content: 'SECOURS-CEREBRAS' } }] }), { status: 200 });
  }
  return new Response(JSON.stringify({ error: { message: 'rate limit' } }), { status: 429 });
};
const env = {};
ANCIENS.forEach((p) => { env[secretName(p)] = 'k'; });
env[secretName('cerebras')] = 'k';
let r = await worker.fetch(new Request('https://w/ai', {
  method: 'POST', headers: { 'content-type': 'application/json', Origin: 'https://kd-mc.com' },
  body: JSON.stringify({ messages: [{ role: 'user', content: 'salut' }] }) }), env);
let j = await r.json().catch(() => ({}));
chk(r.status === 200, '4. les 8 premiers tombent → la réponse arrive quand même (' + r.status + ')');
chk(j.provider === 'cerebras', '4. et c\'est bien un NOUVEAU palier gratuit qui a servi (' + j.provider + ')');
chk(j.text === 'SECOURS-CEREBRAS', '4. le texte du moteur de secours est bien remonté');
chk(!appeles.some((u) => /nvidia|sambanova|nebius/.test(u)),
  '5. les moteurs SANS clé ne sont jamais appelés (aucune erreur inventée)');

/* --- 6. /health honnête --- */
r = await worker.fetch(new Request('https://w/health', { headers: { Origin: 'https://kd-mc.com' } }),
  { [secretName('cerebras')]: 'k' });
j = await r.json().catch(() => ({}));
const ks = j.keys || j.providers || {};
chk(ks.cerebras === true, '6. /health annonce un moteur réellement branché');
chk(ks.nvidia === false, '6. /health n\'annonce PAS un moteur sans clé (aucune promesse en l\'air)');
chk(Object.keys(ks).length >= AI_CHAIN.length, '6. /health couvre TOUTE la chaîne (' + Object.keys(ks).length + ' entrées)');

R.ok.forEach((m) => console.log('  OK ' + m));
R.ko.forEach((m) => console.log('  FAIL ' + m));
console.log(`=== ${R.ok.length} OK / ${R.ko.length} FAIL ===`);
process.exit(R.ko.length ? 1 : 0);
