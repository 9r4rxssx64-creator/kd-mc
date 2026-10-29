// Garde de la porte /delegue (node --test, sans réseau) : jeton, plafond, secrets, IA gratuites seulement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.js';
import { handleDelegue, empreinte, DELEGUE_DOMAINES } from './delegue.js';

const JETON = 'a'.repeat(40);
function d1({ ligne, usage = 1 } = {}) {
  const trace = [];
  return { trace, prepare(sql) { return { bind(...a) { return { async first() { trace.push([sql, a]); if (/FROM jetons/.test(sql)) return ligne === undefined ? { nom: 't', expire: Date.now() + 1e6, plafond_jour: 300, revoque: 0 } : ligne; return { n: usage }; } }; } }; } };
}
const req = (corps, jeton = JETON, methode = 'POST') => new Request('https://apis.kd-mc.com/delegue', { method: methode, headers: { authorization: 'Bearer ' + jeton, 'content-type': 'application/json' }, body: methode === 'GET' ? undefined : JSON.stringify(corps) });
const ok = async () => ({ ok: true, provider: 'groq', model: 'm', text: 'brouillon' });
const deps = (over = {}) => ({ routeSmart: ok, sansPayants: (e) => e, ...over });
const msg = [{ role: 'user', content: 'écris une fonction' }];

test('POST seulement, base branchée, jeton bien formé', async () => {
  assert.equal((await handleDelegue(req(null, JETON, 'GET'), { DELEGUE: d1() }, deps())).status, 405);
  assert.equal((await handleDelegue(req({ messages: msg }), {}, deps())).status, 503);
  assert.equal((await handleDelegue(req({ messages: msg }, 'court'), { DELEGUE: d1() }, deps())).status, 401);
});
test('jeton inconnu, révoqué ou expiré : refusé', async () => {
  for (const ligne of [null, { nom: 't', expire: Date.now() + 1e6, plafond_jour: 300, revoque: 1 }, { nom: 't', expire: Date.now() - 1, plafond_jour: 300, revoque: 0 }]) {
    const r = await handleDelegue(req({ messages: msg }), { DELEGUE: d1({ ligne }) }, deps());
    assert.equal(r.status, 401);
  }
});
test('seule l\'empreinte est cherchée, jamais le jeton en clair', async () => {
  const base = d1(); await handleDelegue(req({ messages: msg }), { DELEGUE: base }, deps());
  assert.equal(base.trace[0][1][0], await empreinte(JETON));
  assert.ok(!JSON.stringify(base.trace).includes(JETON));
});
test('réponse : brouillon + fournisseur ; domaine inconnu → general', async () => {
  let vu;
  const r = await handleDelegue(req({ messages: msg, domain: 'nimportequoi' }), { DELEGUE: d1() }, deps({ routeSmart: async (e, o) => { vu = o; return ok(); } }));
  const j = await r.json(); assert.equal(r.status, 200); assert.equal(j.text, 'brouillon'); assert.equal(j.provider, 'groq');
  assert.equal(vu.domain, 'general'); assert.equal(vu.premium, false); assert.equal(vu.council, false);
  assert.ok(DELEGUE_DOMAINES.includes('code'));
});
test('plafond du jour : 429 au-delà', async () => {
  const r = await handleDelegue(req({ messages: msg }), { DELEGUE: d1({ usage: 301 }) }, deps());
  assert.equal(r.status, 429);
});
test('secret en entrée, trop long, messages vides : refusés', async () => {
  const sk = 'sk-' + 'a1'.repeat(20);
  assert.equal((await handleDelegue(req({ messages: [{ role: 'user', content: 'voici ' + sk }] }), { DELEGUE: d1() }, deps())).status, 422);
  assert.equal((await handleDelegue(req({ messages: [{ role: 'user', content: 'x'.repeat(60001) }] }), { DELEGUE: d1() }, deps())).status, 413);
  assert.equal((await handleDelegue(req({ messages: [] }), { DELEGUE: d1() }, deps())).status, 400);
});
test('JAMAIS un moteur payant : l\'environnement passé au routage n\'a aucune clé payante', async () => {
  let envVu;
  const env = { DELEGUE: d1(), ANTHROPIC_API_KEY: 'x', OPEN_AI_API_KEY: 'x', XAI_API_KEY: 'x', DEEPSEEK_API_KEY: 'x', PERPLEXITI_API_KEY: 'x', TOGETHER_API_KEY: 'x', GROQ_API_KEY: 'g' };
  const mod = await import('./worker.js'); assert.ok(mod.sansMoteursPayants);
  await handleDelegue(req({ messages: msg }), env, { routeSmart: async (e) => { envVu = e; return ok(); }, sansPayants: mod.sansMoteursPayants });
  for (const k of ['ANTHROPIC_API_KEY', 'OPEN_AI_API_KEY', 'XAI_API_KEY', 'DEEPSEEK_API_KEY', 'PERPLEXITI_API_KEY', 'TOGETHER_API_KEY']) assert.equal(envVu[k], undefined, k);
  assert.equal(envVu.GROQ_API_KEY, 'g');
});
test('branchée dans le worker AVANT la porte des comptes, et sans jeton → 401 (pas 403 compte)', async () => {
  const r = await worker.fetch(new Request('https://apis.kd-mc.com/delegue', { method: 'POST', body: '{}' }), { DELEGUE: d1(), KDMC_SSO_SECRET: 's' });
  assert.equal(r.status, 401); assert.equal((await r.json()).error, 'jeton_requis');
});
