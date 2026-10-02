/* GARDE — « CONFÉRENCE DES IA GRATUITES, POUR TOUTES LES APPS, PRÉSENTES ET FUTURES » (Kevin 2.10.2026 soir :
 * « Intègre toujours toutes les IA gratuites, la conférence, l'analyse et le travail de la meilleure, la plus compétente,
 *   pour toutes les apps du domaine que l'on utilise et les futures. Elles réfléchissent chacune de leur côté pour la même
 *   question, comparent et améliorent, et la meilleure, la plus compétente, travaille. »)
 *
 *   1. le routage commun porte bien la conférence v2 (toutes les voix, juge qui note, la meilleure retravaille, compétence) ;
 *   2. chaque app texte du domaine entre par la conférence (routeSmart) : kdmc-apis /ai, Bee (routeur), Créa ; Apex : chef
 *      d'orchestre gratuit ; le coach Lingua (traductions courtes) passe par le routage commun (routeText) — déclaré ;
 *   3. FUTURES apps : tout worker du dépôt qui appelle un fournisseur d'IA en direct doit figurer dans la liste ci-dessous
 *      avec sa raison — un nouveau worker qui court-circuite la conférence rougit ce garde ;
 *   4. sabotage : un faux worker ajouté au balayage est vu.
 * node tests/verify-conference-partout.mjs */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { councilText, routeSmart, COUNCIL_DOMAINS, freeVoices, QWEN_MODELS } from '../services/_shared/ia-route.js';
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };

/* 1. le routage commun */
const src = readFileSync('services/_shared/ia-route.js', 'utf8');
ok(typeof councilText === 'function' && typeof routeSmart === 'function' && /COMPARE_SYSTEM/.test(src) && /AMELIORE_SYSTEM/.test(src) && /noterCompetence\(/.test(src), '1a. ia-route : conférence v2 (comparer, améliorer, compétence mesurée)');
ok(freeVoices({ AI: {}, GROQ_API_KEY: 'g', COHERE_API_KEY: 'c' }).length === QWEN_MODELS.length + 2, '1b. toutes les voix gratuites siègent (chaque Qwen + chaque gratuit à clé)');
ok(['reasoning', 'creative', 'general', 'summary', 'code', 'search'].every((d) => COUNCIL_DOMAINS.includes(d)), '1c. la conférence couvre les questions difficiles de tous les types (code et recherche compris)');

/* 2. les apps du domaine */
const ENTREES = [
  ['services/kdmc-apis/worker.js', /routeSmart\(env, \{/, 'kdmc-apis /ai (toutes les apps qui parlent au domaine)'],
  ['services/kdmc-router/worker.js', /await routeSmart\(env, Object\.assign\(\{\}, base, \{ chain: gratuites, analyse: 'regex', council: 'auto'/, 'Bee (routeur /__javis/ai)'],
  ['services/kdmc-crea-ai/worker.js', /routeSmart\(env, \{ prompt, wantJson/, 'Créa (texte : paroles, compositions)'],
  ['services/kdmc-router/worker.js', /routeText\(env, \{ messages: chat, domain: 'translation'/, 'coach Lingua (traductions courtes : routage commun, une voix)'],
];
for (const [f, re, nom] of ENTREES) ok(re.test(readFileSync(f, 'utf8')), '2. ' + nom + ' entre par le routage commun');
const crew = readFileSync('apex-ai/v13/services/ai/crew-experts.ts', 'utf8');
ok(!/streamSingle\(\s*'anthropic'/.test(crew) && /const chef: CrewProvider = this\.availableProviders\(\)\.find/.test(crew), '2. Apex : le chef d\'orchestre de la conférence est la meilleure IA gratuite disponible');

/* 3. futures apps : balayage des workers */
const DIRECT = /api\.groq\.com|api\.anthropic\.com|generativelanguage\.googleapis|api\.mistral\.ai|openrouter\.ai\/api|api\.cerebras\.ai|api\.cohere|api\.openai\.com|api\.deepseek\.com|api\.perplexity\.ai|api\.together\.xyz|api\.sambanova\.ai|integrate\.api\.nvidia\.com/;
/* chaque appel direct connu, avec sa raison — une entrée de plus = une décision écrite ici, pas un oubli */
const PERMIS = {
  'services/_shared/ia-route.js': 'LE routage commun : c\'est lui qui appelle les fournisseurs',
  'services/kdmc-apis/worker.js': 'passerelle : relais des clés pour Apex (proxy) + secours historique derrière routeSmart',
  'services/kdmc-router/worker.js': 'voix (TTS) et Coach IA historique ; le texte de Bee passe par routeSmart',
  'services/kdmc-crea-ai/worker.js': 'cascade texte de secours derrière la conférence + images',
  'services/chat-svc/src/index.js': 'ancien service de chat (gratuit d\'abord) — à faire passer par /ai (chantier)',
  'services/kdmc-balances/src/index.js': 'service annexe — à faire passer par /ai (chantier)',
  'services/apex-v13-backend/src/index.js': 'proxy Apex : relais des clés, pas de choix d\'IA',
  'messaging-app/workers/api-worker.js': 'messagerie : Groq gratuit en direct — à faire passer par /ai (chantier)',
  'messaging-app/workers/ia-worker.js': 'messagerie : Groq gratuit en direct — à faire passer par /ai (chantier)',
};
export function balayer(racines, lire = (f) => readFileSync(f, 'utf8')) {
  const trouves = [];
  const marche = (d) => {
    for (const e of readdirSync(d)) {
      const f = join(d, e);
      if (/node_modules|pages-upload|\/public\/|\.test\.|\/tests\/|\/dist\//.test(f + '/')) continue;
      const st = statSync(f);
      if (st.isDirectory()) marche(f);
      else if (/\.(js|mjs)$/.test(e) && DIRECT.test(lire(f))) trouves.push(f);
    }
  };
  for (const r of racines) marche(r);
  return trouves;
}
const trouves = balayer(['services', 'messaging-app/workers']);
const inconnus = trouves.filter((f) => !PERMIS[f]);
ok(inconnus.length === 0, '3. tout worker qui appelle une IA en direct est connu et justifié (futures apps : passer par routeSmart ou /ai)', inconnus.join(', '));
ok(trouves.length >= 6, '3b. le balayage voit bien les appels directs connus (' + trouves.length + ')');

/* 4. sabotage : un faux worker avec un appel direct → vu */
const sab = balayer(['services'], (f) => (f.endsWith('services/kdmc-apis/worker.js') ? 'x' : readFileSync(f, 'utf8')) + (f.endsWith('services/kdmc-router/wrangler.toml') ? '' : ''));
ok(!sab.includes('services/kdmc-apis/worker.js') && sab.length === trouves.filter((f) => f.startsWith('services/')).length - 1, '4a. le balayage dépend bien du contenu (kdmc-apis masqué → absent)');
const faux = balayer(['services'], (f) => (f.endsWith('services/kdmc-uptime/worker.js') ? 'fetch("https://api.anthropic.com/v1/messages")' : readFileSync(f, 'utf8')));
ok(faux.includes('services/kdmc-uptime/worker.js') && !PERMIS['services/kdmc-uptime/worker.js'], '4b. sabotage : un worker qui se met à appeler Anthropic en direct serait inconnu → rouge');

console.log(`\n${pass} OK / ${fail} échec(s)`); process.exit(fail ? 1 : 0);
