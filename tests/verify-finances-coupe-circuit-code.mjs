/* PREUVE (Kevin 19.10.2026 — capture : 6 fichiers « Code admin refusé par le relais » d'un coup, 398 documents).
 * Le relais (apex-secrets-proxy) compte CHAQUE refus de code dans un verrou commun à tout le domaine (20/heure, même pour le bon code,
 * y compris la connexion admin du routeur). Finances essayait, pour chaque fichier, TOUTE la chaîne d'IA avec le même code refusé :
 * N moteurs × N fichiers = verrou fermé en un import. Le coupe-circuit : un « Unauthorized » arrête la chaîne et le même code
 * n'est plus présenté au relais pendant 10 min ; un NOUVEAU code est essayé tout de suite.
 * node tests/verify-finances-coupe-circuit-code.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'tools/finances/index.html'), 'utf8');
function extract(name, src) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('fonction introuvable : ' + name);
  let depth = 0, i = src.indexOf('{', start), end = -1;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } } }
  return src.slice(start, end);
}
let fails = 0; const rec = (c, m) => { if (!c) fails++; console.log((c ? 'OK ' : 'FAIL ') + m); };

async function scenario(src) {
  const appels = []; let hashCourant = 'aaa';
  const f = new Function('appels', 'etat', 'var _pinRefuse=null;\n async function aiPinHash(){ return etat.h; }\n' +
    'async function _aiCallProviderBrut(prov,parts,max,hash){ appels.push(hash); if(etat.refuse) throw new Error(prov+" HTTP 401 : Unauthorized"); return "ok"; }\n' +
    'async ' + extract('aiCallProvider', src) + '\n return aiCallProvider;');
  const etat = { h: hashCourant, refuse: true };
  const call = f(appels, etat);
  const r = [];
  for (let k = 0; k < 6; k++) { try { await call('gemini', [], 10); r.push('ok'); } catch (e) { r.push(/Unauthorized/.test(e.message) ? 'refus' : 'autre'); } }
  const apres6 = appels.length;
  etat.h = 'bbb'; etat.refuse = false;
  let nouveau = ''; try { nouveau = await call('gemini', [], 10); } catch (e) { nouveau = 'KO ' + e.message; }
  return { r, apres6, nouveau, total: appels.length };
}
const bon = await scenario(SRC);
rec(bon.r.every((x) => x === 'refus'), '6 fichiers de suite : tous échouent en « Unauthorized » (message conservé pour l\'écran)');
rec(bon.apres6 === 1, `le relais n'est appelé qu\'UNE fois pour 6 fichiers (appels : ${bon.apres6})`);
rec(bon.nouveau === 'ok' && bon.total === 2, 'un NOUVEAU code est essayé tout de suite (le coupe-circuit ne retient que le code refusé)');
rec(/if\(\/\\bUnauthorized\\b\/\.test\(\(e&&e\.message\)\|\|String\(e\)\)\) break;/.test(extract('_aiTry', SRC)), 'la chaîne d\'IA s\'arrête au premier « Unauthorized » (_aiTry)');
// Sabotage : sans coupe-circuit, le test doit voir 6 appels
const sabote = SRC.replace(/if\(_pinRefuse && _pinRefuse\.h===hash[^\n]*\n/, '');
const sab = await scenario(sabote);
rec(sab.apres6 === 6, `sabotage (coupe-circuit retiré) → 6 appels au relais : le test garde bien quelque chose (${sab.apres6})`);
console.log(`\n${fails ? '❌' : '✅'} ${fails ? fails + ' échec(s)' : 'coupe-circuit du code admin : OK'}`);
process.exit(fails ? 1 : 0);
