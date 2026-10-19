/* PREUVE (Kevin 19.10.2026 nuit : « il a marché une fois, j'ai ajouté plusieurs fichiers, il a commencé puis tout rouge. Je suis reconnu par le domaine,
 * pourquoi il me demande le code ? »). Cause : ensureGrant répond '' aux appels SIMULTANÉS pendant qu'il travaille ; les autres fichiers retombaient sur
 * l'ancien code enregistré (périmé) → refus en chaîne. Garde : 6 fichiers en parallèle, UNE seule demande de grant, tous passent par la route du routeur
 * avec la session admin, AUCUN appel direct au relais avec l'ancien code.  node tests/verify-finances-session-parallele.mjs */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'tools/finances/index.html'), 'utf8');
function extract(name, src, pre = '') {
  const start = src.indexOf(pre + 'function ' + name + '(');
  if (start < 0) throw new Error('introuvable : ' + name);
  let d = 0, i = src.indexOf('{', start), end = -1;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (d === 0) { end = i + 1; break; } } }
  return src.slice(start, end);
}
let fails = 0; const rec = (c, m) => { if (!c) fails++; console.log((c ? 'OK ' : 'FAIL ') + m); };
async function scenario(src) {
  const log = { grants: 0, route: 0, direct: 0 };
  const fetchFake = async (u, init) => {
    if (String(u).startsWith('/__fin/ia')) { log.route++; return { headers: { get: (k) => (k === 'x-fin-ia' ? '1' : null) }, ok: true }; }
    log.direct++; return { headers: { get: () => null }, ok: false, status: 401 };
  };
  const code = 'var PROXY="https://relais"; var _iaGrantP=null;\n' +
    'async function ensureGrant(){ if(ensureGrant.busy) return ""; ensureGrant.busy=true; log.grants++; await new Promise(function(r){ setTimeout(r,120); }); ensureGrant.busy=false; return "GRANT"; }\n' +
    extract('_iaGrant', src) + '\n' + 'async ' + extract('_iaFetch', src) + '\n return _iaFetch;';
  const f = new Function('log', 'fetch', code)(log, fetchFake);
  await Promise.all([1, 2, 3, 4, 5, 6].map(() => f('/gemini/x', { method: 'POST', headers: { 'x-apex-pin': 'VIEUX' }, body: '{}' }, 'VIEUX')));
  return log;
}
const bon = await scenario(SRC);
rec(bon.grants === 1, `une seule demande de grant pour 6 fichiers en parallèle (${bon.grants})`);
rec(bon.route === 6 && bon.direct === 0, `les 6 passent par le routeur, 0 appel direct avec l'ancien code (route ${bon.route}, direct ${bon.direct})`);
const sabote = SRC.replace(/var _iaGrantP=null;\n  function _iaGrant\(\)\{[\s\S]*?\n  \}\n  async function _iaFetch/, "function _iaGrant(){ return ensureGrant(); }\n  async function _iaFetch");
const sab = await scenario(sabote);
rec(sab.direct > 0, `sabotage (une demande par fichier, comme avant) → ${sab.direct} appels directs avec l'ancien code : le test garde bien quelque chose`);
console.log(`\n${fails ? '❌' : '✅'} ${fails ? fails + ' échec(s)' : 'session admin partagée entre fichiers : OK'}`); process.exit(fails ? 1 : 0);
