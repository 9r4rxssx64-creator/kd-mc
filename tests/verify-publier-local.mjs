/* GARDE — « publier sans Actions » : le secours qui empêche d'être bloqué quand le quota Actions du coffre est mangé (Kevin 15.10.2026).
   L'outil est exécuté POUR DE VRAI (vrai export du dépôt, vrai vérificateur) contre un faux « dépôt public » LOCAL — aucun réseau, aucun jeton.
   node tests/verify-publier-local.mjs     (SABOTAGE=1 : le plancher de 80 % est retiré → la garde doit rougir) */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + String(d).slice(0, 220) : ''}`); };
const SAB = process.env.SABOTAGE === '1';
/* sabotage : une COPIE de l'outil dont le plancher laisse tout passer (jamais le vrai fichier) */
let SCRIPT = 'tools/depot-public/publier-local.mjs';
if (SAB) { SCRIPT = 'tools/depot-public/publier-local.sab.mjs'; writeFileSync(SCRIPT, readFileSync('tools/depot-public/publier-local.mjs', 'utf8').replace('return avant <= 0 || prets >= Math.floor((avant * 80) / 100);', 'return true;')); }
const { aligner, plancherOk } = await import(pathToFileURL(join(process.cwd(), SCRIPT)).href);
process.on('exit', () => { if (SAB) rmSync(SCRIPT, { force: true }); });
const t = mkdtempSync(join(tmpdir(), 'publocal-'));
process.on('exit', () => rmSync(t, { recursive: true, force: true }));   /* le test fabrique des exports entiers : il range derrière lui */
const sh = (c, a, o = {}) => execFileSync(c, a, { encoding: 'utf8', stdio: 'pipe', ...o });
const lance = (args) => { try { return { code: 0, out: sh(process.execPath, [SCRIPT, ...args]) }; } catch (e) { return { code: e.status, out: String(e.stdout || '') + String(e.stderr || '') }; } };

/* 1. fonctions pures */
ok(plancherOk(80, 100) === true && plancherOk(79, 100) === false && plancherOk(5, 0) === true, '1. plancher : 80 % du dépôt public au moins (79/100 refusé), dépôt vide accepté');
{ const a = join(t, 'a'), b = join(t, 'b'); mkdirSync(join(a, 'x'), { recursive: true }); mkdirSync(join(b, 'y'), { recursive: true }); mkdirSync(join(b, '.git'));
  writeFileSync(join(a, 'x/1.txt'), 'un'); writeFileSync(join(a, '2.txt'), 'deux'); writeFileSync(join(b, 'y/vieux.txt'), 'vieux'); writeFileSync(join(b, '.git/HEAD'), 'garde');
  aligner(a, b);
  ok(existsSync(join(b, 'x/1.txt')) && existsSync(join(b, '2.txt')) && !existsSync(join(b, 'y/vieux.txt')) && existsSync(join(b, '.git/HEAD')), '2. aligner : copie le neuf, supprime ce qui a disparu, ne touche JAMAIS à .git'); }

/* 2. un faux dépôt public local, au même état que l'export (donc « déjà à jour ») puis modifié */
const pub = join(t, 'pub');
sh('git', ['init', '-q', '-b', 'main', pub]);
sh('git', ['config', 'user.email', 't@t'], { cwd: pub }); sh('git', ['config', 'user.name', 't'], { cwd: pub });
let r = lance(['--sortie', join(t, 's1'), '--depot', pub]);
ok(r.code === 0 && /export vérifié : \d+ fichiers, rien de sensible/.test(r.out), '3. vrai export + vrai vérificateur passent (rien de sensible)', r.out);
/* dépôt public vide : tout est « à envoyer », à blanc : rien n'est poussé */
ok(/À BLANC : rien n'a été poussé/.test(r.out) && !/poussé sur le dépôt public/.test(r.out), '4. à blanc : montre ce qui partirait, ne pousse RIEN');
/* on remplit le faux dépôt public avec l'export exact, puis on le fait grossir → un export « tronqué » doit être refusé */
aligner(join(t, 's1'), pub); sh('git', ['add', '-A'], { cwd: pub }); sh('git', ['commit', '-qm', 'etat public'], { cwd: pub });
r = lance(['--sortie', join(t, 's2'), '--depot', pub]);
ok(r.code === 0 && /déjà à jour/.test(r.out), '5. dépôt public identique à l\'export : « déjà à jour », rien à faire', r.out);
for (let i = 0; i < 2000; i++) writeFileSync(join(pub, 'extra-' + i + '.txt'), 'x');   /* le « public » a 2000 fichiers de plus que l'export : l'export en fait < 80 % */
sh('git', ['add', '-A'], { cwd: pub }); sh('git', ['commit', '-qm', 'gros public'], { cwd: pub });
r = lance(['--sortie', join(t, 's3'), '--depot', pub, '--envoyer']);
ok(r.code !== 0 && /plancher/.test(r.out) && /REFUSÉ/.test(r.out), '6. un export qui fait moins de 80 % du dépôt public est REFUSÉ, même avec --envoyer', r.out);
ok(sh('git', ['log', '--oneline'], { cwd: pub }).trim().split('\n').length === 2, '7. et le dépôt public n\'a reçu aucun commit de plus', sh('git', ['log', '--oneline'], { cwd: pub }));
/* envoi réel vers le faux dépôt (bare) : un commit est ajouté, jamais de --force */
const bare = join(t, 'bare.git'); sh('git', ['init', '-q', '--bare', '-b', 'main', bare]);
const pub2 = join(t, 'pub2'); sh('git', ['clone', '-q', bare, pub2]); sh('git', ['config', 'user.email', 't@t'], { cwd: pub2 }); sh('git', ['config', 'user.name', 't'], { cwd: pub2 });
writeFileSync(join(pub2, 'ancien.txt'), 'ancien'); sh('git', ['add', '-A'], { cwd: pub2 }); sh('git', ['commit', '-qm', 'depart'], { cwd: pub2 }); sh('git', ['push', '-q', 'origin', 'HEAD:main'], { cwd: pub2 });
r = lance(['--sortie', join(t, 's4'), '--depot', bare, '--envoyer']);
const lg = sh('git', ['--git-dir', bare, 'log', '--format=%s', 'main']).trim().split('\n');
ok(r.code === 0 && /poussé sur le dépôt public/.test(r.out) && lg.length === 2 && /Synchronisation LOCALE/.test(lg[0]) && lg[1] === 'depart', '8. --envoyer : un seul commit ajouté AU-DESSUS de l\'historique existant (jamais de --force)', r.out + JSON.stringify(lg));
console.log(`\n${fail ? '❌' : '✅'} publier-local : ${pass}/${pass + fail}`); process.exit(fail ? 1 : 0);
