/* Le robot « Apex AI cartes » doit être ROUGE quand la porte répond 500 (sabotage), et VERT en essai local sinon (essai local = le routeur du dépôt dans le processus). */
import { spawnSync } from 'node:child_process';
const lancer = (sab) => spawnSync(process.execPath, ['tests/verif-live-apex-cartes.mjs'], { env: Object.assign({}, process.env, { ESSAI_LOCAL: '1', SABOTAGE: sab }), encoding: 'utf8' });
let ko = 0; const ok = (c, t) => { console.log((c ? '  ✓ ' : '  ✗ ') + t); if (!c) ko++; };
const vert = lancer(''), rouge = lancer('500');
ok(vert.status === 0 && /6 ✅ · 0 ❌/.test(vert.stdout), 'essai local : 6 contrôles verts avec le routeur du dépôt');
ok(rouge.status === 1 && /❌ C\./.test(rouge.stdout) && /❌ D\./.test(rouge.stdout), 'SABOTAGE=500 : la porte qui répond 500 rend le robot ROUGE (C et D)');
console.log(ko ? '\n✗ robot cartes : garde en échec' : '\n✓ robot cartes : vert normal, rouge sous sabotage');
process.exit(ko ? 1 : 0);
