/* PREUVE — Qwen gratuit, réellement branché et réellement joignable.
 * ===========================================================================
 * Kevin 2026-09-03 : « intègre l'IA Qwen gratuite ».
 *
 * Ce qui existait avant : un moteur `qwen` était DÉCLARÉ dans TEXT_PROVIDERS…
 * mais derrière une clé `DASHSCOPE_API_KEY` (compte Alibaba) que Kevin n'a pas
 * — donc il n'a JAMAIS pu répondre une seule fois. C'est le schéma « déclaré
 * mais pas déployé » (erreur #28), exactement ce qu'un test doit empêcher.
 *
 * Ce qu'on prouve ici, sans aucun réseau (env.AI simulé, leçon #135) :
 *   1. Qwen est dans la chaîne Cloudflare (binding déjà actif, ZÉRO clé) ;
 *   2. il est AJOUTÉ APRÈS les modèles éprouvés — aucun passe-droit ;
 *   3. `{ moteur:'qwen' }` le fait répondre EN PREMIER, et la réponse nomme le
 *      modèle exact qui a servi ;
 *   4. si Qwen ne répond pas, la génération continue quand même — demander
 *      Qwen ne peut JAMAIS casser une création (jamais régresser) ;
 *   5. un `moteur` inventé par le client est ignoré (liste blanche) ;
 *   6. /health annonce Qwen sans clé.
 *
 * Lancer : node tests/verify-qwen-gratuit.mjs
 */
import worker from '../services/kdmc-crea-ai/worker.js';
import { readFileSync } from 'node:fs';

const R = { ok: [], ko: [] };
const chk = (c, m) => (c ? R.ok : R.ko).push(m);
const src = readFileSync(new URL('../services/kdmc-crea-ai/worker.js', import.meta.url), 'utf8');

/* --- 1 & 2. présence et place dans la chaîne (lu dans le code réel) -------- */
const bloc = src.slice(src.indexOf('const CF_QWEN_MODELS'), src.indexOf('const CF_TTS_TRIES'));
const qwens = [...bloc.matchAll(/'(@cf\/qwen\/[^']+)'/g)].map((m) => m[1]);
chk(qwens.length >= 3, `1. ${qwens.length} modèles Qwen candidats (un identifiant mort = on passe au suivant)`);
chk(/\.\.\.CF_QWEN_MODELS/.test(bloc), '1. Qwen est bien versé dans la chaîne texte Cloudflare');
const iLlama = bloc.indexOf('@cf/meta/llama-3.3-70b');
const iQwen = bloc.indexOf('...CF_QWEN_MODELS');
chk(iLlama >= 0 && iQwen > iLlama,
  '2. Qwen est AJOUTÉ APRÈS les modèles éprouvés (règle : nouveaux moteurs en fin de chaîne)');
chk(/DASHSCOPE_API_KEY/.test(src),
  '2. l\'ancien Qwen à clé DashScope reste là (s\'il obtient un jour la clé, il marchera) — mais il n\'est plus le seul chemin');

/* --- moteur Cloudflare simulé : Qwen répond, Llama aussi ------------------- */
function fakeAI(opts = {}) {
  const vus = [];
  return {
    vus,
    run: async (model) => {
      vus.push(model);
      if (/qwen/.test(model)) {
        if (opts.qwenDown) throw new Error('no such model');
        return { response: 'TITRE: Chanson Qwen\nCOUPLET 1:\nune ligne\nREFRAIN:\nun refrain' };
      }
      if (/llama|gemma|mistral/.test(model)) {
        return { response: 'TITRE: Chanson Llama\nCOUPLET 1:\nune ligne\nREFRAIN:\nun refrain' };
      }
      return {};
    },
  };
}
/* toutes les IA à clé sont muettes : on isole le comportement Cloudflare */
globalThis.fetch = async () => new Response(JSON.stringify({ error: 'rate limit' }), { status: 429 });
const post = (path, body, env) => worker.fetch(
  new Request('https://x' + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://kd-mc.com' },
    body: JSON.stringify(body),
  }), env);

/* --- 3. « moteur: qwen » → Qwen répond EN PREMIER -------------------------- */
let ai = fakeAI();
let r = await post('/lyrics', { theme: 'un soir d\'ete', style: 'pop', moteur: 'qwen' }, { AI: ai });
let j = await r.json();
chk(r.status === 200 && /Qwen/.test(j.lyrics || ''), `3. Qwen a écrit les paroles (HTTP ${r.status})`);
chk(/^cloudflare:@cf\/qwen\//.test(j.provider || ''),
  `3. la réponse nomme le modèle EXACT qui a servi (provider=${j.provider})`);
chk(/qwen/.test(ai.vus[0] || ''),
  `3. Qwen est bien essayé EN PREMIER quand on le demande (1er appel : ${ai.vus[0]})`);

/* --- 4. Qwen en panne → la création continue quand même -------------------- */
ai = fakeAI({ qwenDown: true });
r = await post('/lyrics', { theme: 'un soir d\'ete', style: 'pop', moteur: 'qwen' }, { AI: ai });
j = await r.json();
chk(r.status === 200 && /Llama/.test(j.lyrics || ''),
  `4. Qwen muet → un autre moteur prend le relais, la chanson sort quand même (HTTP ${r.status})`);
chk(/^cloudflare:@cf\/(meta|google|mistralai)\//.test(j.provider || ''),
  `4. et la réponse dit lequel a réellement répondu (provider=${j.provider})`);

/* --- 5. un moteur inventé par le client est ignoré ------------------------- */
ai = fakeAI();
r = await post('/lyrics', { theme: 'test', style: 'pop', moteur: '../../evil' }, { AI: ai });
j = await r.json();
chk(r.status === 200, '5. un « moteur » inventé n\'empêche pas la génération');
chk(!/evil/.test(JSON.stringify(ai.vus)),
  '5. et il n\'atteint jamais le moteur (liste blanche côté worker)');

/* --- 6. /health annonce Qwen sans clé -------------------------------------- */
r = await worker.fetch(new Request('https://x/health', { headers: { origin: 'https://kd-mc.com' } }), { AI: fakeAI() });
j = await r.json();
chk((j.engines || []).some((e) => /qwen/i.test(e)),
  `6. /health annonce Qwen gratuit sans clé (${(j.engines || []).filter((e) => /qwen/i.test(e)).join(', ') || 'absent'})`);

R.ko.forEach((m) => console.log('  FAIL ' + m));
R.ok.forEach((m) => console.log('  OK   ' + m));
console.log(`\n=== ${R.ok.length} OK / ${R.ko.length} FAIL ===`);
process.exit(R.ko.length ? 1 : 0);
