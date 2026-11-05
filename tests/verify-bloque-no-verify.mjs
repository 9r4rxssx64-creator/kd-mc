/* Garde « --no-verify refusé » : le hook PreToolUse refuse les contournements des gardes et laisse passer le reste ; il est branché dans les réglages.
 * Rouge sous SABOTAGE=1 (hook neutralisé). */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
let ko = 0; const ok = (c, m) => { if (!c) { ko++; console.error('ROUGE : ' + m); } else console.log('ok : ' + m); };
const hook = process.env.SABOTAGE === '1' ? '/bin/true' : '.claude/hooks/bloque-no-verify.sh';
const run = (cmd) => spawnSync(hook === '/bin/true' ? 'bash' : 'bash', hook === '/bin/true' ? ['-c', 'exit 0'] : [hook], { input: JSON.stringify({ tool_input: { command: cmd } }), encoding: 'utf8' });
for (const c of ['git commit -m x --no-verify', 'git push --no-verify origin main', 'cd a && git commit --no-verify -m y', 'git commit -n -m z']) ok(run(c).status === 2, 'refusé : ' + c);
for (const c of ['git commit -m "ajoute le mot --no-verify dans la doc"', 'git status', 'npm test', 'git push -u origin claude/x', 'git log --oneline -n 5']) ok(run(c).status === 0, 'autorisé : ' + c);
const s = JSON.parse(fs.readFileSync('.claude/settings.json', 'utf8'));
ok(JSON.stringify(s.hooks.PreToolUse || []).includes('bloque-no-verify.sh'), 'branché dans .claude/settings.json');
ok(fs.existsSync('.claude/agents/revue-securite.md') && /^name: revue-securite$/m.test(fs.readFileSync('.claude/agents/revue-securite.md', 'utf8')), 'agent revue-securite présent');
process.exit(ko ? 1 : 0);
