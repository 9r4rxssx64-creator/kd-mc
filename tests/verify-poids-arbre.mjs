/* GARDE : le robot de mesure de l'arbre ne fait QUE lire, n'écrit aucun nom/clé, et compte bien (texte, référence, doublon). node tests/verify-poids-arbre.mjs */
import { readFileSync } from 'node:fs'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let n = 0, f = 0; const ok = (c, m) => { n++; if (!c) f++; console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); };
const src = readFileSync('tools/firebase/poids-arbre.cjs', 'utf8'), wf = readFileSync('.github/workflows/coffre-poids-arbre.yml', 'utf8');
ok(!/method\s*:\s*['"](PUT|POST|PATCH|DELETE)/i.test(src) && !/\.(put|patch|delete)\(/i.test(src), 'lecture seule : aucun PUT/POST/PATCH/DELETE');
ok(/workflow_dispatch:/.test(wf) && !/schedule:/.test(wf) && /timeout-minutes:\s*\d+/.test(wf) && /pipefail/.test(wf), 'workflow à la main, borné, pipefail');
ok(!/console\.log\([^)]*\b(h|id|p\.name|nom)\b[^)]*\)/.test(src.replace(/ligne\(/g, '')), 'aucune clé ni nom écrit dans le journal');
const { compter, vide } = require('../tools/firebase/poids-arbre.cjs');
const a = vide(), px = 'data:image/png;base64,' + Buffer.from('abc'.repeat(50)).toString('base64');
compter(a, px); compter(a, px); compter(a, 'm:' + 'a'.repeat(64)); compter(a, 42);
ok(a.texte === 2 && a.empreintes.size === 1 && a.doublons === 1 && a.ref === 1 && a.autres === 1, 'compte : 2 en texte (1 doublon), 1 référence, 1 autre');
const b = vide(); compter(b, px.replace('abc', 'abd')); ok(b.empreintes.size === 1, 'empreinte sur les octets décodés');
console.log(`\n${f ? '❌' : '✅'} poids-arbre : ${n - f} OK / ${f} échec(s)`); process.exit(f ? 1 : 0);
