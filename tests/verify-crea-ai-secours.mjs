/* PREUVE — la chaîne de secours IA du worker kdmc-crea-ai.
 * Kevin 2026-08-12 : « recherche beaucoup d'autres IA gratuites pour ajouter
 * partout dans les apps en secours ».
 * On vérifie, sur le VRAI worker et sans aucun réseau (fetch mocké) :
 *   1. les moteurs ajoutés existent et sont bien APRÈS les moteurs éprouvés
 *      (on ne change pas l'ordre de préférence existant)
 *   2. une clé absente = moteur ignoré, jamais une erreur inventée
 *   3. quand les 6 premiers tombent, un des NOUVEAUX prend vraiment le relais
 *   4. le payant (OpenAI) est bien en DERNIER
 *   5. l'image a un filet gratuit SANS CLÉ (pollinations) quand tout est tombé
 *   6. /health annonce honnêtement ce qui est branché
 * Lancer : node tests/verify-crea-ai-secours.mjs
 */
import worker from '../services/kdmc-crea-ai/worker.js';
import { readFileSync } from 'node:fs';

const R = { ok: [], ko: [] };
const chk = (c, m) => (c ? R.ok : R.ko).push(m);
const src = readFileSync(new URL('../services/kdmc-crea-ai/worker.js', import.meta.url), 'utf8');

/* --- 1. présence + ordre --- */
const bloc = src.slice(src.indexOf('const TEXT_PROVIDERS'), src.indexOf('/* Appel « compatible OpenAI »'));
const ids = [...bloc.matchAll(/id:\s*'([a-z]+)'/g)].map((m) => m[1]);
const nouveaux = ['xai', 'perplexity', 'cerebras', 'nvidia', 'sambanova', 'huggingface',
  'scaleway', 'nebius', 'glm', 'qwen', 'openai'];
nouveaux.forEach((n) => chk(ids.includes(n), `1. moteur « ${n} » branché`));
chk(ids.indexOf('groq') === 0, '1. l\'ordre existant est intact (groq reste 1er)');
chk(ids.indexOf('openrouter') < ids.indexOf('xai'),
  '1. les nouveaux sont AJOUTÉS APRÈS les anciens (aucun passe-droit)');
chk(ids[ids.length - 1] === 'openai',
  '4. le PAYANT (openai) est en tout dernier — on n\'y arrive qu\'après tous les gratuits');
chk(ids.length >= 17, `1. ${ids.length} moteurs texte au total (avant : 7)`);

/* --- 1bis. modèles d'IMAGE Gemini : la panne du 2026-08-14 ---------------
   Les 2 seuls noms configurés étaient morts (404 « not found for API version
   v1beta ») → figurines, cartoon ET poses de danse tombaient ensemble. On
   exige donc plusieurs candidats ET la génération actuelle en tête. */
const gm = src.slice(src.indexOf('const GEM_MODELS'), src.indexOf('function parseDataUrl'));
const modeles = [...gm.matchAll(/'(gemini-[^']+)'/g)].map((m) => m[1]);
chk(modeles.length >= 4, `1bis. ${modeles.length} modèles image candidats (avant la panne : 2)`);
chk(/^gemini-3/.test(modeles[0]),
  '1bis. la génération ACTUELLE est essayée en premier (' + modeles[0] + ')');
chk(modeles.some((m) => /^gemini-2\./.test(m)),
  '1bis. les anciens restent en repli (une régression Google ne casse pas tout)');
chk(src.includes('gemErrs'),
  '1bis. l\'erreur de CHAQUE modèle est remontée — c\'est son absence qui a masqué la panne');

/* --- 2 & 3. secours réel : les 6 premiers tombent, un nouveau répond --- */
let appeles = [];
global.fetch = async (u, o) => {
  const url = String(u);
  appeles.push(url);
  if (/groq|mistral|cohere|together|deepseek|openrouter|generativelanguage/.test(url)) {
    return new Response(JSON.stringify({ error: 'rate limit' }), { status: 429 });
  }
  if (/api\.x\.ai/.test(url)) {                      /* 1er nouveau avec une clé */
    return new Response(JSON.stringify({ choices: [{ message: { content: 'SECOURS-XAI' } }] }), { status: 200 });
  }
  return new Response(JSON.stringify({ error: 'nope' }), { status: 500 });
};
const envBase = {
  GROQ_API_KEY: 'k', MISTRAL_API_KEY: 'k', COHERE_API_KEY: 'k', TOGETHER_API_KEY: 'k',
  DEEPSEEK_API_KEY: 'k', OPENROUTER_API_KEY: 'k', GEMINI_API_KEY: 'k', XAI_API_KEY: 'k',
};
let r = await worker.fetch(new Request('https://w/lyrics', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ theme: 'test', style: 'pop' }) }), envBase);
let j = await r.json().catch(() => ({}));
chk(r.status === 200, '3. quand les 6 premiers tombent, la réponse arrive quand même (' + r.status + ')');
chk(/xai/.test(j.provider || ''), '3. et c\'est bien un NOUVEAU moteur qui a servi (' + j.provider + ')');
chk(appeles.some((u) => /api\.x\.ai/.test(u)), '3. le nouveau moteur a réellement été appelé');

/* 2. sans la clé, le moteur est sauté sans bruit */
appeles = [];
r = await worker.fetch(new Request('https://w/lyrics', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ theme: 'test' }) }), { GROQ_API_KEY: 'k' });
chk(!appeles.some((u) => /cerebras|nvidia|sambanova/.test(u)),
  '2. une IA sans clé n\'est jamais appelée (aucune erreur inventée)');

/* --- 5. image : filet gratuit SANS CLÉ quand tout le reste est tombé --- */
let pollAppele = false;
global.fetch = async (u) => {
  const url = String(u);
  if (/image\.pollinations\.ai/.test(url)) {
    pollAppele = true;
    return new Response(new Uint8Array(4000), { status: 200, headers: { 'content-type': 'image/jpeg' } });
  }
  return new Response(JSON.stringify({ error: 'down' }), { status: 503 });
};
r = await worker.fetch(new Request('https://w/bg', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ prompt: 'un ciel bleu', ratio: '1:1' }) }), { GEMINI_API_KEY: 'k' });
chk(r.status === 200, '5. image : une image sort même sans AUCUNE clé qui marche (' + r.status + ')');
chk(pollAppele, '5. le filet SANS CLÉ (pollinations) a bien été utilisé');
chk(/pollinations/.test(r.headers.get('x-crea-provider') || ''),
  '5. et il est nommé honnêtement : ' + r.headers.get('x-crea-provider'));

/* --- 6. /health dit la vérité --- */
r = await worker.fetch(new Request('https://w/health'), { GROQ_API_KEY: 'k', XAI_API_KEY: 'k' });
j = await r.json();
chk((j.engines || []).includes('xai'), '6. /health annonce les nouveaux moteurs branchés');
chk((j.engines || []).some((e) => /pollinations/.test(e)),
  '6. /health annonce le filet sans clé (toujours disponible)');
chk(!(j.engines || []).includes('cerebras'),
  '6. /health n\'annonce PAS un moteur sans clé (aucune promesse en l\'air)');

R.ok.forEach((m) => console.log('  OK ' + m));
R.ko.forEach((m) => console.log('  FAIL ' + m));
console.log(`=== ${R.ok.length} OK / ${R.ko.length} FAIL ===`);
process.exit(R.ko.length ? 1 : 0);
