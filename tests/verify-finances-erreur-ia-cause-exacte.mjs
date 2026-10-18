/* PREUVE ciblée (Kevin 18.10.2026 — capture : presque tous les 398 documents en échec
 * « Clé IA invalide — revérifie le code (Réglages) ») — Finances mélangeait deux pannes
 * très différentes sous le même message :
 *   1) NOTRE relais (apex-secrets-proxy) refuse le PIN de Kevin → le texte brut renvoyé
 *      est exactement « Unauthorized » → là, « revérifie le code » est le bon conseil.
 *   2) Le FOURNISSEUR (Gemini/Claude/Groq…) refuse SA PROPRE clé sur le relais (corps JSON,
 *      401/403, PERMISSION_DENIED, API_KEY_SERVICE_BLOCKED, authentication_error…) — retaper
 *      son code n'y change RIEN. Mesuré en réel le 18.10 (run coffre-sonde-ia-gratuites #39086204447) :
 *      Gemini HTTP 403 « API_KEY_SERVICE_BLOCKED » — Google bloque la clé, pas le code de Kevin.
 * Les deux étaient fondues dans la même regex générique (`/401|invalid.*key|.../`), qui attrapait
 * n'importe quel 401/403 du FOURNISSEUR et affichait quand même « revérifie le code » — Kevin
 * aurait pu retaper son code cent fois sans que rien ne change.
 * Fonctions pures, extraites du vrai fichier (pas de réseau, pas de navigateur) : node tests/verify-finances-erreur-ia-cause-exacte.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'tools/finances/index.html'), 'utf8');

function extract(name, src) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('fonction introuvable : ' + name);
  let depth = 0, i = src.indexOf('{', start), end = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end < 0) throw new Error('accolade fermante introuvable : ' + name);
  return src.slice(start, end);
}

const fails = [], oks = [];
const rec = (cond, msg) => { (cond ? oks : fails).push(msg); console.log((cond ? 'OK ' : 'FAIL ') + msg); };

// _importErrMsg a besoin de _isNetErr dans sa portée.
const isNetErrSrc = extract('_isNetErr', src);
const importErrMsgSrc = extract('_importErrMsg', src);
const _importErrMsg = new Function(isNetErrSrc + '\n' + importErrMsgSrc + '\n return _importErrMsg;')();

// Cas 1 : NOTRE relais refuse le PIN de Kevin (corps brut « Unauthorized », comme le renvoie
// vraiment le worker — services/apex-secrets-proxy, `return new Response('Unauthorized', {status:401})`).
const msgPin = _importErrMsg(new Error('Claude HTTP 401 : Unauthorized'));
rec(/revérifie le code/i.test(msgPin), '1. PIN de Kevin refusé (texte brut "Unauthorized") → le message dit bien de revérifier le code');
rec(!/fournisseur/i.test(msgPin), '1b. ce cas-là ne doit PAS être présenté comme une panne fournisseur');

// Cas 2 : le FOURNISSEUR refuse SA PROPRE clé (mesuré en réel, Gemini 403 API_KEY_SERVICE_BLOCKED).
const msgGemini = _importErrMsg(new Error('Gemini HTTP 403 : {"error":{"code":403,"message":"blocked","status":"PERMISSION_DENIED","details":[{"reason":"API_KEY_SERVICE_BLOCKED"}]}}'));
rec(!/revérifie le code/i.test(msgGemini), '2. clé Gemini bloquée par Google → le message ne doit PAS envoyer Kevin revérifier SON code (ce n\'est pas lui)');
rec(/fournisseur|IA/i.test(msgGemini), '2b. le message doit nommer une panne côté IA/fournisseur, pas « code »');

// Cas 3 : le FOURNISSEUR Claude refuse sa propre clé (401, corps JSON authentication_error — forme Anthropic réelle).
const msgClaude = _importErrMsg(new Error('Claude HTTP 401 : {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}'));
rec(!/revérifie le code/i.test(msgClaude), '3. clé Claude refusée par Anthropic → pas « revérifie le code » non plus');

// Non-régression : réseau et quota doivent rester détectés comme avant (le correctif ne doit rien casser d'autre).
rec(/instable/i.test(_importErrMsg(new Error('Load failed'))), '4. réseau instable toujours détecté');
rec(/limite ia/i.test(_importErrMsg(new Error('HTTP 429 : rate limit exceeded'))), '5. quota/429 toujours détecté');

// _aiWhy (diagnostic affiché dans Réglages) doit faire la même distinction.
const aiWhySrc = extract('_aiWhy', src);
const _aiWhy = new Function(aiWhySrc + '\n return _aiWhy;')();
const whyPin = _aiWhy('Claude HTTP 401 : Unauthorized', 'anthropic');
rec(/code admin/i.test(whyPin.t) && whyPin.mine === true, '6. _aiWhy : PIN de Kevin refusé → diagnostic nomme « ton code admin », marqué mine:true');
const whyGemini = _aiWhy('Gemini HTTP 403 : API_KEY_SERVICE_BLOCKED', 'gemini');
rec(!whyGemini.mine && /fournisseur/i.test(whyGemini.t), '7. _aiWhy : clé Gemini bloquée côté fournisseur → PAS marqué mine:true');

console.log(`\n${oks.length} OK / ${fails.length} échec(s)`);
process.exit(fails.length ? 1 : 0);
