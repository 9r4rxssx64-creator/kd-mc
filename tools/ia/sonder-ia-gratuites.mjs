#!/usr/bin/env node
/* SONDER LES IA GRATUITES — chaque fournisseur dont Kevin a la clé, UNE question minuscule, en vrai (2.10.2026, « Go freellm »)
 *
 * FreeLLMAPI (tashfeenahmed/freellmapi) empile ~34 paliers gratuits derrière une seule porte — mais c'est un serveur
 * allumé 24/24. Le routeur du domaine (services/_shared/ia-route.js) fait déjà la bascule gratuit d'abord ; ce qui lui
 * manque, ce sont les fournisseurs dont Kevin détient déjà la clé sans qu'ils soient branchés. Avant de brancher :
 * MESURER. Pour chaque fournisseur : statut HTTP, temps de réponse, modèle qui a répondu, message d'erreur exact
 * (quota épuisé, clé morte, modèle retiré). Lecture seule, 1 requête de ~10 jetons par fournisseur, jamais plus.
 * Clés lues dans l'environnement (secrets du coffre), jamais écrites.   node tools/ia/sonder-ia-gratuites.mjs */

/* Fournisseurs à palier GRATUIT connu (point d'entrée OpenAI-compatible, modèle gratuit) + ceux déjà câblés, pour
   comparer. « gratuit » = palier gratuit permanent documenté par le fournisseur ; « crédits » = crédits d'essai qui
   s'épuisent (on les sonde mais on ne les met PAS en tête de cascade sans l'accord de Kevin). */
export const FOURNISSEURS = [
  { id: 'groq',       cle: 'GROQ_API_KEY',       url: 'https://api.groq.com/openai/v1/chat/completions',               modele: 'openai/gpt-oss-120b',                            palier: 'gratuit', deja: true },
  { id: 'mistral',    cle: 'MISTRAL_API_KEY',    url: 'https://api.mistral.ai/v1/chat/completions',                    modele: 'mistral-small-latest',                            palier: 'gratuit', deja: true },
  { id: 'openrouter', cle: 'OPENROUTER_API_KEY', url: 'https://openrouter.ai/api/v1/chat/completions',                 modele: 'meta-llama/llama-3.3-70b-instruct:free',          palier: 'gratuit', deja: true },
  { id: 'cerebras',   cle: 'CEREBRAS_API_KEY',   url: 'https://api.cerebras.ai/v1/chat/completions',                   modele: 'gpt-oss-120b',                                    palier: 'gratuit', deja: true },
  { id: 'sambanova',  cle: 'SAMBANOVA_API_KEY',  url: 'https://api.sambanova.ai/v1/chat/completions',                  modele: 'Meta-Llama-3.3-70B-Instruct',                     palier: 'gratuit' },
  { id: 'nvidia',     cle: 'NVIDIA_API_KEY',     url: 'https://integrate.api.nvidia.com/v1/chat/completions',          modele: 'meta/llama-3.3-70b-instruct',                     palier: 'gratuit' },
  { id: 'together',   cle: 'TOGETHER_API_KEY',   url: 'https://api.together.xyz/v1/chat/completions',                  modele: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free',    palier: 'crédits' },   // compte à crédits (MOTEURS_PAYANTS de kdmc-apis) même si ce modèle-ci est « -Free »
  { id: 'huggingface',cle: 'HF_TOKEN',           url: 'https://router.huggingface.co/v1/chat/completions',             modele: 'meta-llama/Llama-3.3-70B-Instruct',               palier: 'gratuit' },
  { id: 'glm',        cle: 'GLM_API_KEY',        url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',         modele: 'glm-4-flash',                                     palier: 'gratuit' },
  { id: 'cohere',     cle: 'COHERE_API_KEY',     url: 'https://api.cohere.ai/compatibility/v1/chat/completions',       modele: 'command-r7b-12-2024',                             palier: 'gratuit' },
  { id: 'dashscope',  cle: 'DASHSCOPE_API_KEY',  url: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions', modele: 'qwen-plus',                       palier: 'crédits' },
  { id: 'nebius',     cle: 'NEBIUS_API_KEY',     url: 'https://api.studio.nebius.com/v1/chat/completions',             modele: 'meta-llama/Llama-3.3-70B-Instruct',               palier: 'crédits' },
  { id: 'scaleway',   cle: 'SCALEWAY_API_KEY',   url: 'https://api.scaleway.ai/v1/chat/completions',                   modele: 'llama-3.3-70b-instruct',                          palier: 'crédits' },
];
const QUESTION = [{ role: 'user', content: 'Réponds uniquement par le mot : ok' }];

export async function sonder(f, cle, fetchFn = fetch) {
  const t0 = Date.now();
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 25000);
    const r = await fetchFn(f.url, { method: 'POST', signal: ctrl.signal, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cle },
      body: JSON.stringify({ model: f.modele, messages: QUESTION, max_tokens: 8, temperature: 0 }) });
    clearTimeout(t);
    const txt = await r.text(); const ms = Date.now() - t0;
    if (!r.ok) {
      let msg = txt; try { const j = JSON.parse(txt); msg = (j.error && (j.error.message || j.error)) || j.message || txt; } catch (_) { /* brut */ }
      return { id: f.id, ok: false, http: r.status, ms, detail: String(msg).replace(/\s+/g, ' ').slice(0, 140) };
    }
    const j = JSON.parse(txt);
    const texte = String(((j.choices || [])[0] || {}).message?.content || '').trim();
    return { id: f.id, ok: !!texte, http: r.status, ms, modele: j.model || f.modele, texte: texte.slice(0, 20) };
  } catch (e) { return { id: f.id, ok: false, http: 0, ms: Date.now() - t0, detail: String(e && e.message || e).slice(0, 120) }; }
}

/* Un 404 « model does not exist » (Groq, Cerebras le 2.10 : llama-3.3-70b retiré) ne dit pas QUOI mettre à la place :
   on lit la liste des modèles du fournisseur (GET /models, lecture seule) et on garde ceux de la classe 70B / Qwen /
   gpt-oss — c'est ce qui permet de corriger le nom dans ia-route sans deviner. */
export async function listerModeles(f, cle, fetchFn = fetch) {
  try {
    const r = await fetchFn(f.url.replace(/\/chat\/completions$/, '/models'), { method: 'GET', headers: { authorization: 'Bearer ' + cle } });
    if (!r.ok) return { ok: false, http: r.status };
    const j = JSON.parse(await r.text());
    const ids = (Array.isArray(j.data) ? j.data : (Array.isArray(j.models) ? j.models : [])).map((m) => String(m.id || m.name || '')).filter(Boolean).sort();
    const utiles = ids.filter((id) => /llama|qwen|gpt-oss|deepseek|mixtral|gemma|kimi|command/i.test(id) && !/whisper|tts|guard|embed|rerank|vision|audio/i.test(id));
    return { ok: true, total: ids.length, utiles: utiles.slice(0, 15) };
  } catch (e) { return { ok: false, http: 0, detail: String(e && e.message || e).slice(0, 80) }; }
}

export function ligne(f, r) {
  if (!r) return `${f.id} : clé absente (${f.cle})`;
  return r.ok ? `${f.id} ✅ ${r.ms} ms · ${r.modele} · « ${r.texte} »${f.deja ? '' : ' · À BRANCHER'} (${f.palier})`
              : `${f.id} ❌ HTTP ${r.http} en ${r.ms} ms — ${r.detail} (${f.palier})${r.modeles ? ' → ' + r.modeles : ''}`;
}

async function main() {
  const res = [];
  for (const f of FOURNISSEURS) {
    const cle = process.env[f.cle];
    const r = cle ? await sonder(f, cle) : null;
    if (r && !r.ok && r.http === 404) {
      const l = await listerModeles(f, cle);
      r.modeles = l.ok ? `modèles disponibles (${l.total}) : ${l.utiles.join(', ') || 'aucun de la classe cherchée'}` : `liste des modèles illisible (HTTP ${l.http})`;
    }
    res.push({ f, r }); console.log(ligne(f, r));
  }
  const ok = res.filter((x) => x.r && x.r.ok);
  const resume = `${ok.length}/${res.filter((x) => x.r).length} fournisseurs répondent (${res.filter((x) => !x.r).length} sans clé) · à brancher : ${ok.filter((x) => !x.f.deja && x.f.palier === 'gratuit').map((x) => x.f.id).join(', ') || 'aucun'}`;
  console.log(resume);
  if (process.env.GITHUB_ACTIONS) console.log('::notice title=IA gratuites — sonde réelle::' + [resume].concat(res.map((x) => ligne(x.f, x.r))).join(' ⏎ '));
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) main().catch((e) => { console.error('❌ ' + e.message); process.exit(1); });
