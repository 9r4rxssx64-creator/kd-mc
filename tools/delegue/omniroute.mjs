/* VOIE OMNIROUTE (Kevin 26.11.2026) — passerelle locale gratuite (https://github.com/cheaper-inference/OmniRoute) : un point d'accès compatible OpenAI
 * sur http://localhost:20128/v1, modèle « auto », qui bascule seul entre les fournisseurs à offre gratuite. Deux voies, même client :
 *   · omniroute : fournisseurs du nuage (jamais pour une fiche fermée : voir tools/arbre/confidentialite.mjs) ;
 *   · local     : un modèle qui tourne SUR le Lenovo (Ollama, http://localhost:11434/v1) — rien ne sort de la machine : seule voie des fiches fermées.
 * Clé OmniRoute : variable OMNIROUTE_KEY ou fichier hors dépôt (OMNIROUTE_FICHIER_CLE) — jamais dans un message ni dans le dépôt. */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { jetonCourant } from './delegue.mjs';

const retirerBarre = (u) => { let f = String(u).length; while (f > 0 && u[f - 1] === '/') f--; return u.slice(0, f); };
export const URL_OMNIROUTE = (env = process.env) => retirerBarre(env.OMNIROUTE_URL || 'http://localhost:20128/v1');
export const URL_LOCAL = (env = process.env) => retirerBarre(env.LOCAL_LLM_URL || 'http://localhost:11434/v1');
export function cleOmniroute(env = process.env) {
  if (env.OMNIROUTE_KEY) return env.OMNIROUTE_KEY;
  try { return readFileSync(env.OMNIROUTE_FICHIER_CLE || join(homedir(), '.omniroute-cle'), 'utf8').trim(); } catch (_) { return ''; }
}
async function appel(url, modele, messages, { cle = '', fetchImpl = fetch, delaiMs = 120000, maxTokens = 3000 } = {}) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), delaiMs);
  try {
    const r = await fetchImpl(url + '/chat/completions', { method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json', ...(cle ? { authorization: 'Bearer ' + cle } : {}) }, body: JSON.stringify({ model: modele, messages, max_tokens: maxTokens, temperature: 0 }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + String((d.error && (d.error.message || d.error)) || '').slice(0, 120));
    const c = d.choices?.[0];
    return String(c?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  } finally { clearTimeout(t); }
}
export const viaOmniroute = (messages, o = {}) => appel(URL_OMNIROUTE(o.env), o.modele || 'auto', messages, { ...o, cle: cleOmniroute(o.env) });
export const viaLocal = (messages, o = {}) => appel(URL_LOCAL(o.env), o.modele || (o.env || process.env).LOCAL_LLM_MODELE || 'qwen2.5:7b', messages, o);
/** La passerelle répond-elle vraiment ? (sonde mesurée, jamais supposée) */
export async function sonde({ env = process.env, fetchImpl = fetch } = {}) {
  const sortie = {};
  for (const [nom, f] of [['omniroute', viaOmniroute], ['local', viaLocal]]) {
    const t0 = Date.now();
    try { const r = await f([{ role: 'user', content: 'Réponds seulement : OK' }], { env, fetchImpl, delaiMs: 30000, maxTokens: 400 }); /* une sonde à la fois, volontairement */ sortie[nom] = { ok: /ok/i.test(r), ms: Date.now() - t0 }; }
    catch (e) { sortie[nom] = { ok: false, erreur: String(e.message).slice(0, 100) }; }
  }
  return sortie;
}

/* Autres voies GRATUITES compatibles OpenAI (liste « Free LLM API resources » : https://github.com/cheaper... / raullenchai/free-llm-api-resources). Sans clé : llm7, pollinations.
   Avec clé gratuite déjà détenue (variable d'environnement, jamais dans le dépôt) : OpenRouter (modèles « :free »), Groq, Cerebras, Mistral, NVIDIA NIM, GitHub Models, Cloudflare Workers AI, SambaNova.
   Toutes = fiches OUVERTES seulement (le fournisseur peut garder les entrées ; l'extraction ne contient jamais la cible). */
const compat = (url, varCle) => (messages, o = {}) => appel(url, o.modele, messages, { ...o, cle: varCle ? (o.env || process.env)[varCle] || '' : 'unused' });
export const FOURNISSEURS = {
  llm7: { parMinute: 4, fonction: compat('https://api.llm7.io/v1'), modeles: ['gpt-oss:20b', 'codestral-latest', 'deepseek-v4-flash', 'gemini-3.6-flash', 'Qwen3.8-Flash', 'minimax-m2.7', 'nemotron-3-nano:30b'] }   /* mesuré le 26.11 par pc-connecteurs : gpt-oss:20b et codestral répondent ; minimax, nemotron, mistral-Nemo « unavailable » ce jour (la panne les repose) ; les trois « flash » sont listés par /v1/models, non mesurés */,
  pollinations: { parMinute: 1, fonction: compat('https://text.pollinations.ai/openai'),   /* mesuré 26.11 : « 1 reply every 45 seconds per IP » */ modeles: ['openai'] },
  openrouter: { fonction: compat('https://openrouter.ai/api/v1', 'OPENROUTER_KEY'), modeles: ['meta-llama/llama-3.3-70b-instruct:free', 'deepseek/deepseek-r1:free'], cle: 'OPENROUTER_KEY' },
  groq: { fonction: compat('https://api.groq.com/openai/v1', 'GROQ_KEY'), modeles: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'], cle: 'GROQ_KEY' },
  cerebras: { fonction: compat('https://api.cerebras.ai/v1', 'CEREBRAS_KEY'), modeles: ['llama-3.3-70b', 'qwen-3-32b'], cle: 'CEREBRAS_KEY' },
  mistral: { fonction: compat('https://api.mistral.ai/v1', 'MISTRAL_KEY'), modeles: ['mistral-small-latest', 'codestral-latest'], cle: 'MISTRAL_KEY' },
  nvidia: { fonction: compat('https://integrate.api.nvidia.com/v1', 'NVIDIA_KEY'), modeles: ['meta/llama-3.3-70b-instruct'], cle: 'NVIDIA_KEY' },
  github: { fonction: compat('https://models.github.ai/inference', 'GITHUB_MODELS_KEY'), modeles: ['openai/gpt-4.1-mini', 'meta/llama-3.3-70b-instruct'], cle: 'GITHUB_MODELS_KEY' },
  sambanova: { fonction: compat('https://api.sambanova.ai/v1', 'SAMBANOVA_KEY'), modeles: ['Meta-Llama-3.3-70B-Instruct'], cle: 'SAMBANOVA_KEY' },
};
/** Table voie → fonction, pour lecteur-ia (local + omniroute + fournisseurs directs). */
export const TOUTES_VOIES = { local: viaLocal, omniroute: viaOmniroute, ...Object.fromEntries(Object.entries(FOURNISSEURS).map(([n, f]) => [n, f.fonction])) };
/** Travailleurs de l'essaim possibles MAINTENANT : sans clé toujours ; avec clé seulement si la variable est posée. Un modèle par travailleur. */
export function travailleursDisponibles(env = process.env) {
  const w = [];
  for (const [nom, f] of Object.entries(FOURNISSEURS)) {
    if (f.cle && !env[f.cle] && !(nom === 'domaine' && jetonCourant(env))) continue;
    for (const m of f.modeles) w.push({ nom: nom + '/' + m, voie: nom, modele: m, concurrence: 2, parMinute: f.parMinute ?? (f.cle ? 20 : 8) });
  }
  return w;
}

/** Voie « domaine » : la porte apis.kd-mc.com/delegue détient déjà les clés gratuites (Groq, Cerebras, Gemini, Mistral, Qwen…) ; le Lenovo n'en garde aucune.
 *  Jeton de session (jeton.mjs nouveau) = 300 appels/jour. Le « modèle » est ici le DOMAINE : general, reasoning, long_context, summary, translation, creative, search. */
export async function viaDomaine(messages, o = {}) {
  const env = o.env || process.env, jeton = jetonCourant(env);
  if (!jeton) throw new Error('HTTP 401 pas de jeton DELEGUE_JETON (jeton.mjs nouveau)');
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), o.delaiMs || 90000);
  try {
    const r = await (o.fetchImpl || fetch)(env.DELEGUE_URL || 'https://apis.kd-mc.com/delegue', { method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + jeton }, body: JSON.stringify({ domain: o.modele || 'general', messages, max_tokens: o.maxTokens || 3000 }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) throw new Error('HTTP ' + r.status + ' ' + String(d.error || d.detail || '').slice(0, 100));
    return String(d.text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  } finally { clearTimeout(t); }
}
FOURNISSEURS.domaine = { fonction: viaDomaine, modeles: ['general', 'reasoning', 'long_context', 'summary'], cle: 'DELEGUE_JETON' };
TOUTES_VOIES.domaine = viaDomaine;
