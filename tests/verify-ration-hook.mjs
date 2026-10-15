/* GARDE — chaque session voit la ration Actions du jour dès son ouverture (Kevin 15.10.2026 : « Économise le forfait action… ne jamais plus
   être bloqué »). Le hook SessionStart est exécuté POUR DE VRAI dans un dépôt jetable, avec un faux `gh` (jamais l'API), sans réseau.
   node tests/verify-ration-hook.mjs      (SABOTAGE=1 : le hook n'ajoute plus la ration → la garde doit rougir) */
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { mkdtempSync, writeFileSync, mkdirSync, copyFileSync, readFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + String(d).slice(0, 200) : ''}`); };
const SAB = process.env.SABOTAGE === '1';
const racine = process.cwd();
const dir = mkdtempSync(join(tmpdir(), 'hookration-'));
const sh = (c, o = {}) => execFileSync('bash', ['-c', c], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...o.env }, stdio: ['ignore', 'pipe', 'pipe'] });
/* dépôt jetable : une « origin » locale avec la page d'état et l'outil de ration, comme main */
sh('git init -q . && git config user.email t@t && git config user.name t && mkdir -p tools/ci .claude/hooks');
writeFileSync(join(dir, 'ETAT-DU-MOMENT.md'), '# ÉTAT TEST\nvérité du jour\n');
copyFileSync(join(racine, 'tools/ci/ration-actions.mjs'), join(dir, 'tools/ci/ration-actions.mjs'));
let hook = readFileSync(join(racine, '.claude/hooks/etat-du-moment.sh'), 'utf8');
if (SAB) hook = hook.replace(/RATION=\$\(timeout 8 node[^\n]*\n/, 'RATION=""\n');
writeFileSync(join(dir, '.claude/hooks/etat-du-moment.sh'), hook);
sh('git add -A && git commit -qm init && git branch -M main && git update-ref refs/remotes/origin/main HEAD');
/* faux gh : renvoie 3 runs d'aujourd'hui (35 min) ; GH_MODE=muet → échoue */
const jour = new Date().toISOString().slice(0, 10);
const run = (min) => ({ name: 'Chaîne', status: 'completed', conclusion: 'success', run_started_at: `${jour}T01:00:00Z`, created_at: `${jour}T01:00:00Z`, updated_at: new Date(Date.parse(`${jour}T01:00:00Z`) + min * 60000).toISOString() });
mkdirSync(join(dir, 'bin'));
writeFileSync(join(dir, 'bin/gh'), `#!/bin/bash\n[ "$GH_MODE" = muet ] && exit 1\ncat <<'J'\n${JSON.stringify({ workflow_runs: [run(20), run(15)] })}\nJ\n`); chmodSync(join(dir, 'bin/gh'), 0o755);
const lance = (extra) => sh('bash .claude/hooks/etat-du-moment.sh', { env: { CLAUDE_PROJECT_DIR: dir, PATH: join(dir, 'bin') + ':' + process.env.PATH, TMPDIR: dir, ...extra } });
let out = lance({});
ok(/vérité du jour/.test(out), '1. la page d\'état de main est toujours servie');
ok(/35 min consommées sur 60 \(25 restantes\)/.test(out.replace(/\\u00e9/g, 'é')) || /35 min consomm/.test(out), '2. la ration du jour (35 min mangées, 25 restantes) est dans le contexte de la session', out.slice(-400));
ok(/porte-ration\.sh/.test(out), '3. la session est renvoyée vers la porte des gros robots');
out = lance({ GH_MODE: 'muet' });
ok(/vérité du jour/.test(out) && !/consommées/.test(out), '4. FAIL-OUVERT : si gh se tait, la page d\'état part quand même, sans ligne de ration');
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
console.log(`\n${fail ? '❌' : '✅'} ration-hook : ${pass}/${pass + fail}`); process.exit(fail ? 1 : 0);
