/* PREUVE — /magic ne rend JAMAIS « quelqu'un d'autre » en douce.
 * Kevin 2026-08-12 : « les figurines et les autres transformations… ce n'est pas moi ».
 * Cause : quand Gemini (le seul moteur qui ÉDITE la photo) échouait, le worker
 * basculait sur un moteur texte→image qui RECRÉE une personne inventée, et
 * l'app présentait ça comme la transformation demandée.
 *
 * On appelle le VRAI worker, sans réseau (fetch mocké) :
 *   A) Gemini KO + Replicate absent + keep_face  → refus explicite (502
 *      face_edit_failed), AUCUNE image inventée renvoyée
 *   B) Gemini KO + Replicate présent            → un moteur d'ÉDITION prend le
 *      relais (l'identité est gardée), image renvoyée
 *   C) Gemini KO + keep_face + allow_recreate   → image inventée AUTORISÉE,
 *      mais marquée 'recreated' + la RAISON de l'échec
 *   D) sans keep_face (ancien client)           → comportement d'avant conservé
 *   E) Gemini OK                                 → aucun secours, image directe
 * Lancer : node tests/verify-crea-magic-identity.mjs
 */
import worker from '../services/kdmc-crea-ai/worker.js';

const R = { ok: [], ko: [] };
const chk = (c, m) => (c ? R.ok : R.ko).push(m);
const PIX = 'data:image/jpeg;base64,' + Buffer.from('FAKE-PHOTO-KEVIN').toString('base64');

function fakeAI() {                       /* Cloudflare Workers AI : texte→image */
  /* >100 caractères : c'est le seuil que le worker exige pour considérer
     qu'une image a vraiment été rendue (sinon il passe au modèle suivant). */
  const img = Buffer.from('INVENTED-IMAGE-'.repeat(40)).toString('base64');
  return { run: async () => ({ image: img }) };
}
/* Remplace fetch : Gemini en panne, Replicate joue le moteur d'édition. */
function mockFetch({ geminiOk = false, replicateOk = false } = {}) {
  global.fetch = async (u, o) => {
    const url = String(u);
    if (/generativelanguage\.googleapis\.com/.test(url)) {
      if (!geminiOk) return new Response(JSON.stringify({ error: { message: 'quota exceeded' } }), { status: 429 });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [
        { inline_data: { mime_type: 'image/png', data: Buffer.from('EDITED').toString('base64') } }] } }] }), { status: 200 });
    }
    if (/api\.replicate\.com\/v1\/models\//.test(url)) {
      if (!replicateOk) return new Response('nope', { status: 404 });
      return new Response(JSON.stringify({ latest_version: { id: 'v1' } }), { status: 200 });
    }
    if (/api\.replicate\.com\/v1\/predictions/.test(url)) {
      return new Response(JSON.stringify({ status: 'succeeded', output: 'https://out/img.png',
        urls: { get: 'https://api.replicate.com/v1/predictions/x' } }), { status: 200 });
    }
    if (/^https:\/\/out\//.test(url)) return new Response('IMGBYTES', { status: 200, headers: { 'content-type': 'image/png' } });
    return new Response('{}', { status: 200 });
  };
}
const call = (env, body) => worker.fetch(
  new Request('https://w/magic', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  env);

/* A) rien pour éditer + keep_face → REFUS, pas d'image inventée */
mockFetch({});
let r = await call({ GEMINI_API_KEY: 'k', AI: fakeAI() }, { image: PIX, preset: 'figurine', keep_face: true });
let j = await r.clone().json().catch(() => null);
chk(r.status === 502, 'A. édition impossible + keep_face → refus (502), reçu ' + r.status);
chk(j && j.error === 'face_edit_failed', 'A. la raison est nommée : face_edit_failed');
chk(!/image/.test(r.headers.get('content-type') || ''), 'A. AUCUNE image inventée n\'est renvoyée');
chk(j && /gemini/.test(j.detail || ''), 'A. le détail dit POURQUOI (gemini…)');

/* B) un moteur d'ÉDITION disponible → il prend le relais, on garde le visage */
mockFetch({ replicateOk: true });
r = await call({ GEMINI_API_KEY: 'k', AI: fakeAI(), REPLICATE_API_TOKEN: 't' },
  { image: PIX, preset: 'figurine', keep_face: true });
chk(r.status === 200, 'B. moteur d\'édition de secours → 200, reçu ' + r.status);
chk(/replicate-edit/.test(r.headers.get('x-crea-provider') || ''),
  'B. c\'est bien un moteur d\'ÉDITION qui a servi (' + r.headers.get('x-crea-provider') + ')');
chk(r.headers.get('x-crea-fallback') !== 'recreated', 'B. rien n\'a été inventé');

/* C) Kevin accepte explicitement une image inventée */
mockFetch({});
r = await call({ GEMINI_API_KEY: 'k', AI: fakeAI() },
  { image: PIX, preset: 'figurine', keep_face: true, allow_recreate: true });
chk(r.status === 200, 'C. image inventée autorisée → 200, reçu ' + r.status);
chk(r.headers.get('x-crea-fallback') === 'recreated', 'C. elle est MARQUÉE comme inventée');
chk(/gemini/.test(r.headers.get('x-crea-why') || ''), 'C. et la raison est dite (x-crea-why)');

/* D) ancien client (pas de keep_face) → comportement d'avant, aucune régression */
mockFetch({});
r = await call({ GEMINI_API_KEY: 'k', AI: fakeAI() }, { image: PIX, preset: 'figurine' });
chk(r.status === 200 && r.headers.get('x-crea-fallback') === 'recreated',
  'D. ancien client : comportement d\'avant conservé (pas de régression)');

/* E) Gemini marche → il édite ta photo, aucun secours */
mockFetch({ geminiOk: true });
r = await call({ GEMINI_API_KEY: 'k', AI: fakeAI() }, { image: PIX, preset: 'figurine', keep_face: true });
chk(r.status === 200 && !r.headers.get('x-crea-fallback'),
  'E. Gemini disponible → ta photo est éditée, aucun secours');

R.ok.forEach((m) => console.log('  OK ' + m));
R.ko.forEach((m) => console.log('  FAIL ' + m));
console.log(`=== ${R.ok.length} OK / ${R.ko.length} FAIL ===`);
process.exit(R.ko.length ? 1 : 0);
