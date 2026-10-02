/* GARDE — sonde des IA gratuites (Kevin « Go freellm », 2.10.2026)
 *   1. lecture seule : une seule requête POST de chat par fournisseur, max_tokens minuscule, jamais d'autre méthode ;
 *   2. robot à la main, sans cron, borné, au coffre ; chaque clé lue par la sonde est bien passée par le robot ;
 *   3. logique (fetch simulé) : réponse OK → ok + modèle + temps ; refus (429 quota) → message exact gardé ; réseau mort →
 *      http 0 sans planter ; clé absente → « clé absente » ;
 *   4. seuls les paliers « gratuit » non encore câblés sont proposés « À BRANCHER » (jamais un palier « crédits »).
 * node tests/verify-sonde-ia-gratuites.mjs */
import { readFileSync } from 'node:fs';
import { FOURNISSEURS, sonder, ligne, listerModeles } from '../tools/ia/sonder-ia-gratuites.mjs';
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };

const src = readFileSync('tools/ia/sonder-ia-gratuites.mjs', 'utf8');
ok(!/method:\s*['"](PUT|PATCH|DELETE)['"]/.test(src) && /max_tokens:\s*8\b/.test(src) && (src.match(/method:\s*'POST'/g) || []).length === 1 && (src.match(/fetchFn\(/g) || []).length === 2, '1. lecture seule : un seul POST de chat (8 jetons au plus) + un GET /models');
const wf = readFileSync('.github/workflows/coffre-sonde-ia-gratuites.yml', 'utf8');
const regles = JSON.parse(readFileSync('tools/depot-public/regles.json', 'utf8'));
ok(/workflow_dispatch:/.test(wf) && !/schedule:/.test(wf) && /timeout-minutes:\s*\d+/.test(wf) && regles.workflows_prives.includes('.github/workflows/coffre-sonde-ia-gratuites.yml'), '2a. robot à la main, sans cron, borné, au coffre');
const manquantes = FOURNISSEURS.map((f) => f.cle).filter((c) => !wf.includes(c + ': ${{ secrets.' + c + ' }}'));
ok(manquantes.length === 0, '2b. chaque clé lue par la sonde est passée par le robot', manquantes.join(', '));

const f = FOURNISSEURS.find((x) => x.id === 'sambanova');
const faux = (status, body) => async () => ({ ok: status === 200, status, text: async () => body });
const r1 = await sonder(f, 'k', faux(200, JSON.stringify({ model: 'Meta-Llama-3.3-70B-Instruct', choices: [{ message: { content: 'ok' } }] })));
ok(r1.ok && r1.modele === 'Meta-Llama-3.3-70B-Instruct' && r1.texte === 'ok' && typeof r1.ms === 'number', '3a. réponse OK → ok, modèle, temps');
const r2 = await sonder(f, 'k', faux(429, JSON.stringify({ error: { message: 'Rate limit exceeded: 30 RPM' } })));
ok(!r2.ok && r2.http === 429 && /30 RPM/.test(r2.detail), '3b. refus 429 → message exact gardé', r2.detail);
const r3 = await sonder(f, 'k', async () => { throw new Error('fetch failed'); });
ok(!r3.ok && r3.http === 0 && /fetch failed/.test(r3.detail), '3c. réseau mort → http 0, sans planter');
ok(/clé absente/.test(ligne(f, null)), '3d. clé absente → dit « clé absente »');
let getVu = null;
const l1 = await listerModeles(f, 'k', async (url, init) => { getVu = { url, init }; return { ok: true, status: 200, text: async () => JSON.stringify({ data: [{ id: 'whisper-large-v3' }, { id: 'llama-3.1-8b-instant' }, { id: 'openai/gpt-oss-120b' }, { id: 'llama-guard-4-12b' }] }) }; });
ok(getVu && getVu.init.method === 'GET' && !getVu.init.body && /\/models$/.test(getVu.url) && l1.ok && l1.total === 4 && l1.utiles.join(',') === 'llama-3.1-8b-instant,openai/gpt-oss-120b', '3e. 404 modèle → GET /models (lecture seule) et seuls les modèles de chat utiles sont gardés', JSON.stringify(l1));
const l2 = await listerModeles(f, 'k', async () => ({ ok: false, status: 401, text: async () => '' }));
ok(!l2.ok && l2.http === 401 && /modèles disponibles/.test(ligne(f, { ok: false, http: 404, ms: 1, detail: 'no model', modeles: 'modèles disponibles (2) : a, b' })), '3f. liste illisible → dit le HTTP ; la ligne montre les modèles disponibles');
ok(/À BRANCHER/.test(ligne(f, r1)) && !/À BRANCHER/.test(ligne(FOURNISSEURS.find((x) => x.id === 'groq'), r1)), '4a. « À BRANCHER » seulement pour un gratuit pas encore câblé');
const nebius = FOURNISSEURS.find((x) => x.id === 'nebius');
ok(nebius.palier === 'crédits' && !FOURNISSEURS.some((x) => x.palier === 'gratuit' && ['nebius', 'scaleway', 'dashscope'].includes(x.id)), '4b. les paliers « crédits » (s\'épuisent) ne sont jamais déclarés gratuits');

console.log(`\n${pass} OK / ${fail} échec(s)`); process.exit(fail ? 1 : 0);
