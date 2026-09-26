/* PREUVE — Qwen gratuit dans le relais Apex (apex-secrets-proxy), sans réseau.
 * ===========================================================================
 * Kevin 2026-09-05 : « Fait tourner Apex sur Qwen l'IA gratuite ».
 *
 * Le worker n'est pas un fichier du dépôt : sa source vit DANS le workflow de
 * déploiement (.github/workflows/sync-apex-secrets-to-cf-worker.yml, heredoc).
 * On l'extrait telle quelle, on l'exécute avec un Workers AI SIMULÉ (env.AI), et
 * on prouve (leçon #135 : ce qu'on ne peut pas atteindre, on le simule à l'identique) :
 *   1. /health annonce `qwen` dès que le binding AI existe (sans AUCUNE clé) ;
 *   2. sans binding AI → 503 clair (fail-open : le client passe au suivant) ;
 *   3. le PIN reste obligatoire sur /qwen (aucun passe-droit sécurité) ;
 *   4. réponse NON-stream = format OpenAI (choices[0].message.content), et le
 *      raisonnement <think>…</think> de Qwen3 n'atteint jamais Kevin ;
 *   5. réponse STREAM = morceaux OpenAI `choices[0].delta.content` + [DONE] —
 *      exactement ce que le lecteur SSE du client Apex sait lire ; <think> filtré
 *      même coupé en plein milieu d'une balise ;
 *   6. le 1er modèle mort → le suivant sert, et la réponse NOMME le modèle exact ;
 *   7. aucun modèle ne répond → 502 avec la liste des tentatives (cause exacte).
 *
 * Lancer : node tests/verify-apex-proxy-qwen.mjs
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const R = { ok: [], ko: [] };
const chk = (c, m) => (c ? R.ok : R.ko).push(m);

/* --- extraction de la source du worker depuis le workflow ------------------ */
const wf = readFileSync(new URL('../.github/workflows/sync-apex-secrets-to-cf-worker.yml', import.meta.url), 'utf8');
const startMarker = "cat > /tmp/apex-secrets-proxy/src/index.js << 'EOF'";
const s = wf.indexOf(startMarker);
chk(s > 0, '0. la source du worker est bien dans le workflow (heredoc trouvé)');
const after = wf.slice(s + startMarker.length + 1);
const e = after.indexOf('\n          EOF');
const raw = after.slice(0, e);
const src = raw.split('\n').map((l) => l.replace(/^ {10}/, '')).join('\n');
chk(/\[ai\]\s*\n\s*binding = "AI"/.test(wf), '0. wrangler.toml déclare le binding Workers AI ([ai] binding = "AI")');

const dir = mkdtempSync(join(tmpdir(), 'apex-proxy-'));
const file = join(dir, 'index.mjs');
writeFileSync(file, src);
const worker = (await import('file://' + file)).default;

/* --- Workers AI simulé ------------------------------------------------------ */
function sse(parts) {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(ctrl) {
      for (const p of parts) ctrl.enqueue(enc.encode(p));
      ctrl.close();
    },
  });
}
function fakeAI(opts = {}) {
  const calls = [];
  return {
    calls,
    run: async (model, input) => {
      calls.push(model);
      if ((opts.dead || []).includes(model)) throw new Error('No such model: ' + model);
      if (opts.allDead) throw new Error('boom');
      if (input.stream) {
        /* balise <think> coupée en plein milieu entre 2 morceaux + réponse en 3 bouts */
        return sse([
          'data: {"response":"<thi"}\n\n',
          'data: {"response":"nk>je réfléchis…</think>Bon"}\n\n',
          'data: {"response":"jour "}\n\ndata: {"response":"Kevin"}\n\n',
          'data: [DONE]\n\n',
        ]);
      }
      return { response: '<think>raisonnement interne</think>Bonjour Kevin, 3 mots.', usage: { total_tokens: 12 } };
    },
  };
}
const PIN_HASH = createHash('sha256').update('000000').digest('hex');
const env = (ai) => ({ AI: ai, APEX_ADMIN_PIN_SHA256: PIN_HASH, ANTHROPIC_API_KEY: 'x' });
const post = (path, body, en, pin = PIN_HASH) => worker.fetch(new Request('https://w' + path, {
  method: 'POST',
  headers: Object.assign({ 'content-type': 'application/json' }, pin ? { 'x-apex-pin': pin } : {}),
  body: JSON.stringify(body),
}), en);
const msgs = [{ role: 'system', content: 'Tu es Apex.' }, { role: 'user', content: 'Bonjour' }];

/* --- 1. /health annonce qwen sans clé -------------------------------------- */
let r = await worker.fetch(new Request('https://w/health'), env(fakeAI()));
let j = await r.json();
chk(r.status === 200 && (j.available_providers || []).includes('qwen'), '1. /health annonce qwen (0 clé, juste le binding AI)');
chk(Array.isArray(j.qwen_models) && j.qwen_models[0] === '@cf/qwen/qwen3.8-27b', `1. /health liste les modèles Qwen, le plus récent en tête (${(j.qwen_models || [])[0]})`);
r = await worker.fetch(new Request('https://w/health'), { APEX_ADMIN_PIN_SHA256: PIN_HASH });
j = await r.json();
chk(!(j.available_providers || []).includes('qwen'), '1. sans binding AI, /health n\'annonce PAS qwen (pas de faux « disponible »)');

/* --- 2. sans binding AI → 503 clair --------------------------------------- */
r = await post('/qwen/v1/chat/completions', { messages: msgs }, { APEX_ADMIN_PIN_SHA256: PIN_HASH });
chk(r.status === 503, `2. sans Workers AI → HTTP ${r.status} (503 attendu, fail-open côté client)`);

/* --- 3. PIN obligatoire ---------------------------------------------------- */
r = await post('/qwen/v1/chat/completions', { messages: msgs }, env(fakeAI()), '');
chk(r.status === 401, `3. sans PIN → HTTP ${r.status} (401 : aucun passe-droit pour le gratuit)`);

/* --- 4. non-stream : format OpenAI, <think> filtré ------------------------- */
let ai = fakeAI();
r = await post('/qwen/v1/chat/completions', { messages: msgs, stream: false }, env(ai));
j = await r.json();
const content = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
chk(r.status === 200 && content === 'Bonjour Kevin, 3 mots.', `4. non-stream = format OpenAI, sans le raisonnement (« ${content} »)`);
chk(r.headers.get('x-apex-model') === '@cf/qwen/qwen3.8-27b', `4. la réponse nomme le modèle exact (${r.headers.get('x-apex-model')})`);
chk(ai.calls.length === 1 && ai.calls[0] === '@cf/qwen/qwen3.8-27b', '4. Qwen 3.8 est essayé EN PREMIER');

/* --- 5. stream : morceaux OpenAI + [DONE], <think> filtré même coupé ------- */
ai = fakeAI();
r = await post('/qwen/v1/chat/completions', { messages: msgs, stream: true }, env(ai));
const text = await r.text();
const chunks = text.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim());
const deltas = chunks.filter((c) => c !== '[DONE]').map((c) => JSON.parse(c));
const assembled = deltas.map((d) => (d.choices[0].delta.content || '')).join('');
chk(r.status === 200 && /text\/event-stream/.test(r.headers.get('content-type') || ''), `5. stream = text/event-stream (HTTP ${r.status})`);
chk(assembled === 'Bonjour Kevin', `5. texte reconstitué = « ${assembled} » (raisonnement <think> filtré, balise coupée gérée)`);
chk(deltas.every((d) => d.object === 'chat.completion.chunk' && d.choices[0].index === 0), '5. chaque morceau est un chat.completion.chunk OpenAI (lisible par le client Apex)');
chk(deltas[deltas.length - 1].choices[0].finish_reason === 'stop' && chunks[chunks.length - 1] === '[DONE]', '5. fin propre : finish_reason=stop puis [DONE]');

/* --- 6. 1er modèle mort → le suivant sert, nommé --------------------------- */
ai = fakeAI({ dead: ['@cf/qwen/qwen3.8-27b'] });
r = await post('/qwen/v1/chat/completions', { messages: msgs }, env(ai));
j = await r.json();
chk(r.status === 200 && r.headers.get('x-apex-model') === '@cf/qwen/qwen3-30b-a3b-fp8',
  `6. identifiant mort → on passe au suivant, nommé (${r.headers.get('x-apex-model')}, ${ai.calls.length} essais)`);

/* --- 7. aucun modèle → 502 + tentatives ------------------------------------ */
ai = fakeAI({ allDead: true });
r = await post('/qwen/v1/chat/completions', { messages: msgs }, env(ai));
j = await r.json();
chk(r.status === 502 && Array.isArray(j.error && j.error.tried) && j.error.tried.length === ai.calls.length,
  `7. tous morts → HTTP ${r.status} avec la liste des ${(j.error && j.error.tried || []).length} tentatives (cause exacte, jamais muet)`);

/* --- 8. les relais à clé ne sont pas touchés (jamais régresser) ------------- */
r = await post('/anthropic/v1/messages', { messages: msgs }, { APEX_ADMIN_PIN_SHA256: PIN_HASH });
chk(r.status === 503 && /not configured/.test(await r.text()), '8. un relais à clé sans clé répond toujours 503 « not configured » (inchangé)');

R.ko.forEach((m) => console.log('  FAIL ' + m));
R.ok.forEach((m) => console.log('  OK   ' + m));
console.log(`\n=== ${R.ok.length} OK / ${R.ko.length} FAIL ===`);
process.exit(R.ko.length ? 1 : 0);
