/* GARDE — « TOUT GRATUIT, PARTOUT, TOUJOURS » (Kevin 2.10.2026 soir : « Tout gratuit pas seulement production. Toujours
 * tout gratuit. Trouve des solutions pour la meilleure qualité toujours. Note tout. »)
 *
 * Lit CHAQUE cascade d'IA du dépôt — pas seulement celles qui tournent en production — et refuse tout moteur PAYANT en
 * tête. Le payant (Anthropic, OpenAI, Perplexity, xAI, DeepSeek, Together) ne peut être qu'un secours, derrière les gratuits.
 *   1. ia-route (routage commun) : chaque domaine commence par un gratuit ; Anthropic derrière Groq dans la chaîne ;
 *   2. kdmc-apis : la chaîne de secours commence par un gratuit ; les payants sont retirés sans le laissez-passer de Kevin ;
 *   3. Créa (kdmc-crea-ai) : le 1er moteur texte est `free: true` ;
 *   4. chat-svc : l'ordre de repli par défaut commence par un gratuit, OpenRouter n'y appelle pas un modèle Claude ;
 *   5. messagerie (2 workers) et outils Lingua (3) : Groq avec un modèle gratuit vivant (gpt-oss-120b) ;
 *   6. Apex v13 : chaque domaine de la politique commence par un gratuit, free-smart par défaut pour tout le monde,
 *      chaîne par défaut du routeur gratuit d'abord, modèles Groq/Cerebras vivants ;
 *   7. sabotage : les mêmes contrôles sur une copie où Anthropic revient en tête → le garde le voit.
 * node tests/verify-tout-gratuit.mjs */
import { readFileSync } from 'node:fs';
import { DOMAIN_PREFERENCES, FREE_PROVIDERS, planChain } from '../services/_shared/ia-route.js';
import { AI_CHAIN, MOTEURS_PAYANTS, sansMoteursPayants } from '../services/kdmc-apis/worker.js';
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };
const PAYANTS = ['anthropic', 'openai', 'perplexity', 'xai', 'deepseek', 'together'];
const GRATUITS_CONNUS = ['qwen', 'groq', 'cerebras', 'gemini', 'openrouter', 'mistral', 'cohere', 'sambanova', 'nvidia', 'huggingface', 'glm', 'workers-ai'];

/* ---- fonctions pures, réutilisées pour le sabotage ---- */
export function domainesGratuitsDabord(prefs, gratuits) {
  return Object.entries(prefs).filter(([, l]) => !gratuits.includes(l[0])).map(([d, l]) => d + '→' + l[0]);
}
/* Apex : extrait DOMAIN_PREFERENCES et FREE_PROVIDERS du TypeScript (pas d'exécution de TS ici). */
export function lireApex(src) {
  const bloc = /const DOMAIN_PREFERENCES: Record<TaskDomain, readonly ProviderId\[\]> = \{([\s\S]*?)\n\};/.exec(src);
  const prefs = {};
  if (bloc) for (const m of bloc[1].matchAll(/^\s*(\w+):\s*\[([^\]]*)\]/gm)) prefs[m[1]] = m[2].split(',').map((x) => x.trim().replace(/'/g, '')).filter(Boolean);
  const free = /const FREE_PROVIDERS: readonly ProviderId\[\] = \[([^\]]*)\]/.exec(src);
  const gratuits = free ? free[1].split(',').map((x) => x.trim().replace(/'/g, '')).filter(Boolean) : [];
  const defautMode = /\n\s*return 'free-smart';\s*\n\s*\}\s*\n/.test(src) && !/\n\s*return 'auto';\s*\n\s*\}\s*\n/.test(src);
  return { prefs, gratuits, defautMode };
}

/* 1. ia-route */
const mauvais = domainesGratuitsDabord(DOMAIN_PREFERENCES, FREE_PROVIDERS);
ok(mauvais.length === 0, '1a. ia-route : chaque domaine commence par un gratuit', mauvais.join(', '));
const tous = ['qwen', 'anthropic', 'openai', 'gemini', 'groq', 'perplexity', 'cerebras', 'cohere', 'mistral'];
const payantEnTete = Object.keys(DOMAIN_PREFERENCES).filter((d) => PAYANTS.includes(planChain(d, tous)[0]));
ok(payantEnTete.length === 0, '1b. ia-route : planChain ne met jamais un payant en tête, quel que soit le domaine', payantEnTete.join(', '));
const c = planChain('code', tous);
ok(c.indexOf('anthropic') > c.indexOf('groq') && c.indexOf('perplexity') > c.indexOf('groq') && c.includes('anthropic'), '1c. ia-route : les payants restent en secours, derrière les gratuits (jamais retirés)', c.join(' > '));

/* 2. kdmc-apis */
ok(!PAYANTS.includes(AI_CHAIN[0]) && !MOTEURS_PAYANTS.includes(AI_CHAIN[0]), '2a. kdmc-apis : la chaîne de secours commence par un gratuit (' + AI_CHAIN[0] + ')');
const e = sansMoteursPayants({ ANTHROPIC_API_KEY: 'a', OPEN_AI_API_KEY: 'o', PERPLEXITI_API_KEY: 'p', TOGETHER_API_KEY: 't', GROQ_API_KEY: 'g', COHERE_API_KEY: 'c' });
ok(!e.ANTHROPIC_API_KEY && !e.OPEN_AI_API_KEY && !e.PERPLEXITI_API_KEY && !e.TOGETHER_API_KEY && e.GROQ_API_KEY && e.COHERE_API_KEY, '2b. kdmc-apis : sans le laissez-passer de Kevin, aucune clé payante ne reste, les gratuites oui');

/* 3. Créa */
const crea = readFileSync('services/kdmc-crea-ai/worker.js', 'utf8');
const premierCrea = /const TEXT_PROVIDERS = \[\s*\{([^}]*)\}/.exec(crea);
ok(premierCrea && /free:\s*true/.test(premierCrea[1]) && /id:\s*'(groq|qwen|cerebras|gemini)'/.test(premierCrea[1]), '3. Créa : le 1er moteur texte est gratuit', premierCrea && premierCrea[1].slice(0, 80));

/* 4. chat-svc */
const chat = readFileSync('services/chat-svc/src/index.js', 'utf8');
const ordre = /body\.failover \|\| \[([^\]]*)\]/.exec(chat);
const premierChat = ordre && ordre[1].split(',')[0].trim().replace(/"/g, '');
ok(premierChat && GRATUITS_CONNUS.includes(premierChat), '4a. chat-svc : l\'ordre de repli par défaut commence par un gratuit (' + premierChat + ')');
ok(!/anthropic\/claude/.test(chat), '4b. chat-svc : OpenRouter n\'appelle plus un modèle Claude (payant)');

/* 5. messagerie + outils Lingua */
for (const f of ['messaging-app/workers/api-worker.js', 'messaging-app/workers/ia-worker.js', 'tools/lingua/grow-content.mjs', 'tools/lingua/grow-vocab.mjs', 'tools/lingua/translate-stories.mjs']) {
  const s = readFileSync(f, 'utf8');
  ok(/api\.groq\.com/.test(s) && /openai\/gpt-oss-120b/.test(s) && !/llama-3\.3-70b-versatile/.test(s), '5. ' + f + ' : Groq (gratuit) avec un modèle vivant');
}

/* 6. Apex v13 */
const apex = lireApex(readFileSync('apex-ai/v13/services/ai/ai-routing-policy.ts', 'utf8'));
ok(Object.keys(apex.prefs).length >= 10 && apex.gratuits.length >= 4, '6a. Apex : politique lue (' + Object.keys(apex.prefs).length + ' domaines, ' + apex.gratuits.length + ' gratuits)');
const mauvaisApex = domainesGratuitsDabord(apex.prefs, apex.gratuits);
ok(mauvaisApex.length === 0, '6b. Apex : chaque domaine commence par un gratuit', mauvaisApex.join(', '));
ok(apex.defautMode, '6c. Apex : free-smart par défaut pour tout le monde (plus de « return \'auto\' » en défaut)');
const routeur = readFileSync('apex-ai/v13/services/ai/ai-router.ts', 'utf8');
ok(/DEFAULT_CHAIN[^\n]*=\s*\['qwen'/.test(routeur) && !/llama-3\.3-70b/.test(routeur) && /openai\/gpt-oss-120b/.test(routeur), '6d. Apex : chaîne par défaut gratuite d\'abord, modèles Groq/Cerebras vivants');

/* 7. sabotage */
const sab = Object.assign({}, DOMAIN_PREFERENCES, { code: ['anthropic', 'qwen'] });
ok(domainesGratuitsDabord(sab, FREE_PROVIDERS).length === 1, '7a. sabotage ia-route : Anthropic remis en tête du code → vu');
const apexSab = lireApex(readFileSync('apex-ai/v13/services/ai/ai-routing-policy.ts', 'utf8').replace(/admin: \['qwen'/, "admin: ['anthropic', 'qwen'"));
ok(domainesGratuitsDabord(apexSab.prefs, apexSab.gratuits).join() === 'admin→anthropic', '7b. sabotage Apex : Anthropic remis en tête des actions → vu');

console.log(`\n${pass} OK / ${fail} échec(s)`); process.exit(fail ? 1 : 0);
