/* PREUVE — le service crea-ai dessine le CARTOON PAR STYLE avec l'IA, et sait « faire vivre » une photo
 * (Kevin 25.10.2026 : « Le rendu est vraiment dégueulasse… qualité professionnelle commerciale »).
 * Avant : /cartoon avait UNE consigne pour tous les styles, et aucun secours gratuit quand Gemini tombait ;
 * /frames ne savait que « danser » ou « chanter » — rien pour un cavalier sur un sanglier.
 * On appelle le VRAI worker, sans réseau (fetch mocké, binding AI mocké) :
 *   A) /cartoon style=anime  → la consigne envoyée à Gemini parle d'anime, en-tête x-crea-style=anime
 *   B) style inconnu         → consigne « cartoon » par défaut, jamais une erreur
 *   C) prompt libre          → repris dans la consigne
 *   D) Gemini KO (429)       → Workers AI image→image prend le relais (part de LA photo, strength 0,4-0,8)
 *   E) Gemini KO + pas d'AI  → refus honnête 502 avec les deux causes
 *   F) /frames mode=motion   → 6 instants, chaque consigne continue le MOUVEMENT de la photo
 *   G) /frames motion+style  → les instants sont rendus dans le style demandé
 *   H) /frames sans mode     → la danse d'avant, inchangée (rien ne régresse)
 * Lancer : node tests/verify-crea-cartoon-styles.mjs
 *          node tests/verify-crea-cartoon-styles.mjs --sabotage   (rejoue le worker d'AVANT : doit être rouge)
 */
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SABOTAGE = process.argv.includes('--sabotage');
let workerPath = new URL('../services/kdmc-crea-ai/worker.js', import.meta.url).href;
if (SABOTAGE) {
  /* On rejoue le worker d'AVANT en retirant du SOURCE les trois apports (pas `git show origin/main` : une fois fusionné,
     main contient le correctif et le sabotage ne discriminerait plus rien — vu le 25.10 juste après la fusion). */
  let src = fs.readFileSync(new URL('../services/kdmc-crea-ai/worker.js', import.meta.url), 'utf8');
  const avant = src;
  src = src.replace("const prompt = kind === 'cartoon' ? promptCartoon(opts.style, opts.extra) : PROMPTS[kind];", 'const prompt = PROMPTS[kind];')
    .replace("if (kind === 'cartoon') {\n    try {\n      const c = await cfImg2Img(env, prompt, imgDataUrl);", "if (false) {\n    try {\n      const c = await cfImg2Img(env, prompt, imgDataUrl);")
    .replace("(body && body.mode) === 'motion' ? 'motion' : 'dance'", "'dance'")
    .replace("kind === 'cartoon' ? { 'x-crea-style':", "false ? { 'x-crea-style':");
  if (src === avant) { console.log('❌ sabotage impossible : les points à retirer n\'ont pas été trouvés dans le source'); process.exit(1); }
  const tmp = path.join(os.tmpdir(), 'crea-worker-avant-' + process.pid + '.js');
  fs.writeFileSync(tmp, src); workerPath = 'file://' + tmp;
}
void execFileSync;
const worker = (await import(workerPath)).default;

const R = { ok: [], ko: [] };
const chk = (c, m) => (c ? R.ok : R.ko).push(m);
const PIX = 'data:image/jpeg;base64,' + Buffer.from('FAKE-PHOTO-SANGLIER').toString('base64');
let prompts = [], aiCalls = [];

function mock({ geminiOk = true } = {}) {
  prompts = []; aiCalls = [];
  global.fetch = async (u, o) => {
    const url = String(u);
    if (url.includes('/__sso/whoami')) return new Response(JSON.stringify({ ok: true, uid: 'test-compte', name: 'Test Compte', verified: true }), { status: 200 });
    if (/generativelanguage\.googleapis\.com/.test(url)) {
      try { const b = JSON.parse(o.body); prompts.push(String(b.contents[0].parts[0].text)); } catch (_) { prompts.push('?'); }
      if (!geminiOk) return new Response(JSON.stringify({ error: { message: 'Your prepayment credits are depleted' } }), { status: 429 });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [
        { inline_data: { mime_type: 'image/png', data: Buffer.from('IMG-GEMINI').toString('base64') } }] } }] }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  };
}
const AI = { run: async (model, input) => { aiCalls.push({ model, input }); return new Uint8Array(900).fill(7); } };
function env(extra) { return Object.assign({ GEMINI_API_KEY: 'k', KDMC_SSO_URL: 'https://sso.test', AI }, extra || {}); }
function req(chemin, body) {
  return new Request('https://crea-ai.test' + chemin, { method: 'POST',
    headers: { authorization: 'Bearer t', 'content-type': 'application/json', origin: 'https://studio.kd-mc.com' },
    body: JSON.stringify(body) });
}

/* A */
mock(); let r = await worker.fetch(req('/cartoon', { image: PIX, style: 'anime' }), env());
chk(r.status === 200 && /image/.test(r.headers.get('content-type') || ''), 'A) /cartoon style=anime → une image (' + r.status + ')');
chk(/anime/i.test(prompts[0] || '') && /Keep the SAME subject/.test(prompts[0] || ''), 'A) la consigne envoyée à l\'IA parle d\'ANIME et garde le sujet');
chk(r.headers.get('x-crea-style') === 'anime', 'A) en-tête x-crea-style = anime (' + r.headers.get('x-crea-style') + ')');
chk(/gemini/.test(r.headers.get('x-crea-provider') || ''), 'A) moteur = Gemini (IA principale gratuite)');

/* B */
mock(); r = await worker.fetch(req('/cartoon', { image: PIX, style: 'zzz-inconnu' }), env());
chk(r.status === 200 && /animated-movie/i.test(prompts[0] || '') && r.headers.get('x-crea-style') === 'cartoon', 'B) style inconnu → consigne « cartoon » par défaut, pas d\'erreur');

/* C */
mock(); r = await worker.fetch(req('/cartoon', { image: PIX, style: 'bd', prompt: 'avec un ciel orageux' }), env());
chk(r.status === 200 && /ciel orageux/.test(prompts[0] || '') && /bande dessin/i.test(prompts[0] || ''), 'C) le texte libre est repris dans la consigne du style BD');

/* D */
mock({ geminiOk: false }); r = await worker.fetch(req('/cartoon', { image: PIX, style: 'toon3d' }), env());
const i2i = aiCalls.find((c) => /img2img|stable-diffusion/.test(c.model));
chk(r.status === 200 && !!i2i, 'D) Gemini KO → Workers AI image→image prend le relais (' + (i2i ? i2i.model : 'aucun appel') + ')');
chk(!!i2i && Array.isArray(i2i.input.image) && i2i.input.image.length > 10 && i2i.input.strength >= 0.4 && i2i.input.strength <= 0.8, 'D) le secours part de LA photo (octets envoyés) avec une force 0,4-0,8');
chk(/cloudflare/.test(r.headers.get('x-crea-provider') || ''), 'D) le moteur annoncé est bien le secours gratuit (' + r.headers.get('x-crea-provider') + ')');

/* E */
mock({ geminiOk: false }); r = await worker.fetch(req('/cartoon', { image: PIX, style: 'anime' }), env({ AI: undefined }));
let jE = {}; try { jE = await r.json(); } catch (_) {}
chk(r.status === 502 && /gemini/.test(String(jE.error)) && /cf_no_binding|cf_img2img/.test(String(jE.error)), 'E) sans aucun moteur → refus honnête 502 avec les deux causes');

/* F */
mock(); r = await worker.fetch(req('/frames', { image: PIX, mode: 'motion', n: 6 }), env());
let jF = {}; try { jF = await r.json(); } catch (_) {}
chk(r.status === 200 && jF.mode === 'motion' && Array.isArray(jF.frames) && jF.frames.length === 6, 'F) /frames mode=motion → 6 instants (' + (jF.frames || []).length + ', mode ' + jF.mode + ')');
chk(prompts.length === 6 && prompts.every((p) => /motion/i.test(p) && /same camera framing/i.test(p)), 'F) chaque consigne continue le MOUVEMENT visible, même cadrage');
chk(prompts.some((p) => /BEFORE/.test(p)) && prompts.some((p) => /AFTER/.test(p)), 'F) les instants vont d\'un peu avant à bien après la photo');

/* G */
mock(); r = await worker.fetch(req('/frames', { image: PIX, mode: 'motion', n: 3, style: 'anime' }), env());
let jG = {}; try { jG = await r.json(); } catch (_) {}
chk(jG.style === 'anime' && prompts.length === 3 && prompts.every((p) => /anime/i.test(p)), 'G) motion + style anime → les instants sont dessinés en anime');

/* H */
mock(); r = await worker.fetch(req('/frames', { image: PIX }), env());
let jH = {}; try { jH = await r.json(); } catch (_) {}
chk(r.status === 200 && (jH.mode === 'dance' || jH.mode === undefined) && prompts.length === 5 && prompts.every((p) => /dancing/i.test(p)), 'H) sans mode → les 5 poses de danse d\'avant (rien ne régresse)');

console.log('\nCartoon IA par style + « faire vivre la photo » (service crea-ai)' + (SABOTAGE ? ' — SABOTAGE : worker d\'AVANT' : '') + '\n');
R.ok.forEach((m) => console.log('  ✅ ' + m)); R.ko.forEach((m) => console.log('  ❌ ' + m));
console.log(`\n=== ${R.ok.length} OK / ${R.ko.length} FAIL ===` + (SABOTAGE ? ' (attendu : rouge)' : ''));
if (SABOTAGE) process.exit(R.ko.length >= 5 ? 0 : 1);
process.exit(R.ko.length ? 1 : 0);
