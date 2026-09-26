/* PREUVE — les POSES DE DANSE ont enfin un secours (comme les figurines).
 * Mesuré en CI le 2026-08-14 : les crédits image Google étaient à zéro
 *   gemini-3.1-flash-image-preview : 429 « prepayment credits are depleted »
 * → /magic s'en sortait (il avait déjà un moteur d'ÉDITION en secours)
 *   mais /frames rendait 502 « pas de poses ». Même panne, deux comportements.
 *
 * On appelle le VRAI worker, sans réseau (fetch mocké) :
 *   A) Gemini KO + moteur d'édition dispo → les poses sortent quand même,
 *      et elles viennent d'un moteur qui part de TA photo
 *   B) Gemini KO + AUCUN moteur          → refus honnête (502) + la raison,
 *      jamais une image inventée
 *   C) Gemini OK                          → aucun secours n'est appelé
 *      (discriminant : le test ferait la différence si je m'étais trompé)
 *   D) /pose (copie d'une pose de référence) → refus expliqué, PAS de
 *      substitution par un moteur à une seule image
 * Lancer : node tests/verify-crea-frames-secours.mjs
 */
import worker from '../services/kdmc-crea-ai/worker.js';

const R = { ok: [], ko: [] };
const chk = (c, m) => (c ? R.ok : R.ko).push(m);
const PIX = 'data:image/jpeg;base64,' + Buffer.from('FAKE-PHOTO-KEVIN').toString('base64');
let vus = [];

let creations = 0;
function mock({ geminiOk = false, editeur = false, creationsKo = [], creation429 = false } = {}) {
  vus = [];
  creations = 0;
  global.fetch = async (u) => {
    const url = String(u);
    vus.push(url);
    if (/generativelanguage\.googleapis\.com/.test(url)) {
      if (!geminiOk) {
        return new Response(JSON.stringify({ error: { message: 'Your prepayment credits are depleted' } }), { status: 429 });
      }
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [
        { inline_data: { mime_type: 'image/png', data: Buffer.from('POSE-GEMINI').toString('base64') } }] } }] }), { status: 200 });
    }
    if (/api\.replicate\.com\/v1\/models\//.test(url)) {
      if (!editeur) return new Response('nope', { status: 404 });
      return new Response(JSON.stringify({ latest_version: { id: 'v1' } }), { status: 200 });
    }
    if (/api\.replicate\.com\/v1\/predictions/.test(url)) {
      creations++;
      /* Le VRAI format d'erreur de Replicate (RFC 7807) : un 429 avec `detail`
         qui dit pourquoi, et AUCUN champ `error`. C'est ce corps-là qui, le
         2026-09-06, ressortait en « model_429 » nu dans le rapport. */
      if (creation429) {
        return new Response(JSON.stringify({
          title: 'Too Many Requests', status: 429,
          detail: 'You have reached the free tier spend limit. Add a payment method to continue.'
        }), { status: 429 });
      }
      /* creationsKo simule une pose qui casse (délai dépassé, modèle occupé…)
         pendant que l'autre réussit — exactement le cas du 2026-09-06. */
      if (creationsKo.includes(creations)) {
        return new Response(JSON.stringify({ error: 'timeout' }), { status: 200 });
      }
      return new Response(JSON.stringify({ status: 'succeeded', output: 'https://out/pose.png',
        urls: { get: 'https://api.replicate.com/v1/predictions/x' } }), { status: 200 });
    }
    if (/^https:\/\/out\//.test(url)) {
      return new Response(Buffer.from('POSE-EDITEE'), { status: 200, headers: { 'content-type': 'image/png' } });
    }
    return new Response('{}', { status: 200 });
  };
}
const call = (chemin, env, body) => worker.fetch(
  new Request('https://w' + chemin, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), env);

/* A) Gemini à sec + moteur d'édition dispo → ça marche quand même */
mock({ editeur: true });
let r = await call('/frames', { GEMINI_API_KEY: 'k', REPLICATE_API_TOKEN: 't' }, { image: PIX, mode: 'dance', n: 5 });
let j = await r.json().catch(() => ({}));
chk(r.status === 200, 'A. crédits Google à zéro → les poses sortent quand même (' + r.status + ')');
chk((j.frames || []).length >= 2, 'A. au moins 2 poses (le minimum pour animer) : ' + (j.frames || []).length);
chk(/replicate-edit/.test(j.provider || ''), 'A. c\'est un moteur d\'ÉDITION qui a servi (' + j.provider + ')');
chk((j.frames || []).every((f) => /^data:image\//.test(f)), 'A. ce sont bien des images');

/* A-bis. budget Cloudflare : « Too many subrequests » nous a déjà cassé /magic.
   On compte les appels réseau réellement faits — ils doivent rester bien
   sous la limite du plan gratuit (50). */
chk(vus.length <= 20, 'A. budget sous-requêtes tenu : ' + vus.length + ' appels (limite 50, il faut de la marge pour les attentes)');
chk(vus.filter((u) => /generativelanguage/.test(u)).length <= 6,
  'A. Gemini en panne est SONDÉ une fois, pas martelé sur les 5 poses : '
  + vus.filter((u) => /generativelanguage/.test(u)).length + ' appels');
chk(vus.filter((u) => /v1\/models\//.test(u)).length <= 2,
  'A. la version du modèle est résolue au plus 2 fois (pas une par image)');

/* B) rien pour éditer → refus honnête, aucune image inventée */
mock({});
r = await call('/frames', { GEMINI_API_KEY: 'k' }, { image: PIX, mode: 'dance' });
j = await r.json().catch(() => ({}));
chk(r.status === 502, 'B. aucun moteur → refus (502), reçu ' + r.status);
chk(/depleted|credits|429/i.test(j.detail || j.error || ''), 'B. la VRAIE cause est dite : ' + String(j.error).slice(0, 60));
chk(!(j.frames || []).length, 'B. aucune image inventée n\'est renvoyée');
chk(/quelqu'un d'autre/.test(j.message || ''), 'B. et c\'est expliqué simplement à Kevin');

/* C) DISCRIMINANT — Gemini marche : le secours ne doit PAS être appelé */
mock({ geminiOk: true, editeur: true });
r = await call('/frames', { GEMINI_API_KEY: 'k', REPLICATE_API_TOKEN: 't' }, { image: PIX, mode: 'dance', n: 5 });
j = await r.json().catch(() => ({}));
chk(j.provider === 'gemini', 'C. Gemini dispo → c\'est lui qui sert (' + j.provider + ')');
chk((j.frames || []).length === 5, 'C. et les 5 poses demandées sont là : ' + (j.frames || []).length);
chk(!vus.some((u) => /replicate/.test(u)), 'C. le payant n\'est PAS appelé pour rien (discriminant)');

/* D) /pose : pas de substitution silencieuse */
mock({ editeur: true });
r = await call('/pose', { GEMINI_API_KEY: 'k', REPLICATE_API_TOKEN: 't' },
  { image: PIX, poses: [PIX, PIX] });
j = await r.json().catch(() => ({}));
chk(r.status === 502, 'D. copie de pose impossible → refus (502), reçu ' + r.status);
chk(/indisponible/.test(j.message || ''), 'D. on explique pourquoi au lieu de rendre autre chose');

/* E) LE BUG DU 2026-09-06 — une pose casse, l'autre réussit.
      Avant : `Promise.all` rejetait au premier échec et jetait AUSSI la pose
      réussie → 0 pose → 502 « je n'ai pas pu fabriquer les poses », alors que
      /magic (même moteur, même run) rendait une image sans problème.
      Maintenant : allSettled garde la bonne + rattrape la manquante seule.
      DISCRIMINANT : ce test échoue si on revient à `Promise.all`. */
mock({ editeur: true, creationsKo: [2] });
r = await call('/frames', { GEMINI_API_KEY: 'k', REPLICATE_API_TOKEN: 't' }, { image: PIX, mode: 'dance', n: 2 });
j = await r.json().catch(() => ({}));
chk(r.status === 200, 'E. 1 pose qui casse ne jette PLUS la pose réussie (' + r.status + ', avant : 502)');
chk((j.frames || []).length >= 2, 'E. les 2 poses sont là après rattrapage : ' + (j.frames || []).length);
chk(creations === 3, 'E. la manquante est refaite SEULE (3 lancements : 2 + 1 rattrapage), vu ' + creations);
chk(/replicate-edit/.test(j.provider || ''), 'E. et c\'est bien le moteur d\'édition qui a servi');

/* F) les DEUX poses cassent → refus honnête, mais la cause EXACTE de CHACUNE
      est dite (règle « toujours détailler les erreurs, cause exacte »). */
mock({ editeur: true, creationsKo: [1, 2] });
r = await call('/frames', { GEMINI_API_KEY: 'k', REPLICATE_API_TOKEN: 't' }, { image: PIX, mode: 'dance', n: 2 });
j = await r.json().catch(() => ({}));
chk(r.status === 502, 'F. les 2 poses cassées → refus (502), reçu ' + r.status);
chk(/edit#1/.test(j.detail || '') && /edit#2/.test(j.detail || ''),
  'F. la cause de CHAQUE pose est nommée : ' + String(j.detail || '').slice(0, 90));
chk(!(j.frames || []).length, 'F. aucune image inventée');

/* G) Replicate refuse avec un 429 « palier gratuit atteint » → le rapport doit
      dire POURQUOI, pas seulement le numéro. Vécu le 2026-09-06 : le verdict
      affichait `model_429` — impossible de savoir s'il fallait attendre ou
      recharger. DISCRIMINANT : sans la lecture de `detail`, ce test échoue. */
mock({ editeur: true, creation429: true });
r = await call('/frames', { GEMINI_API_KEY: 'k', REPLICATE_API_TOKEN: 't' }, { image: PIX, mode: 'dance', n: 2 });
j = await r.json().catch(() => ({}));
chk(r.status === 502, 'G. moteur d\'édition à sec → refus honnête (502), reçu ' + r.status);
chk(/429/.test(j.detail || ''), 'G. le code du refus est dit : ' + String(j.detail || '').slice(0, 60));
chk(/free tier|spend limit/i.test(j.detail || ''),
  'G. et sa RAISON exacte aussi (palier gratuit / plafond), pas juste « model_429 »');
chk(!/model_429/.test(j.detail || ''), 'G. plus de code nu « model_429 » sans explication');

R.ok.forEach((m) => console.log('  OK ' + m));
R.ko.forEach((m) => console.log('  FAIL ' + m));
console.log(`=== ${R.ok.length} OK / ${R.ko.length} FAIL ===`);
process.exit(R.ko.length ? 1 : 0);
