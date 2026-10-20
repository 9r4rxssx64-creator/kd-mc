// iPhone : aucune hauteur en « vh » sans sa jumelle « dvh » (Kevin 20.10.2026 : parties cachées en haut/en bas, boutons sous la barre Safari, écrans bloqués).
import { execFileSync } from 'node:child_process';
let ok = true;
try { const o = execFileSync('node', ['tools/ci/vh-vers-dvh.mjs', '--verifier'], { encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname }); console.log('  ✅ ' + o.trim().split('\n').pop()); }
catch (e) { ok = false; console.log('  ❌ ' + String(e.stdout || e.message).trim().split('\n').slice(-6).join('\n    ') + '\n  → corriger avec : node tools/ci/vh-vers-dvh.mjs'); }
process.exit(ok ? 0 : 1);
