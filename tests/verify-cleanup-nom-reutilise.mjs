/* PREUVE — le nettoyage des branches ne supprime plus une branche VIVANTE parce
 * que son NOM a déjà eu une PR fusionnée.
 * ===========================================================================
 * `cleanup-stale-branches.yml` (déclenché à la fin de CHAQUE auto-merge) a une
 * détection « squash » : il demande à GitHub la liste des PR fusionnées et
 * supprime les branches portant ces noms. Or une session garde le même nom de
 * branche pendant des jours : `claude/apex-chat-mfa-faceid` avait 5 PR fusionnées
 * (#3717 … #3739) puis a reçu de NOUVEAUX commits — et le job la supprimait dans
 * la minute qui suivait chaque push (mesuré 2× le 10.09.2026 : PR #3744 « dirty »
 * avec branche disparue, puis « Rattraper main » en échec sur une branche effacée).
 *
 * Ce test fabrique un dépôt distant où l'on connaît la vérité pour chaque cas,
 * extrait la boucle de filtrage TELLE QU'ELLE EST ÉCRITE dans le workflow, la
 * fait tourner, et vérifie qu'elle ne retient que la branche ENTIÈREMENT dans main.
 *
 * Discriminant par construction : une branche « finie » doit partir, une branche
 * « nom réutilisé + nouveaux commits » doit rester, une branche absente est ignorée.
 *
 * Lancer : node tests/verify-cleanup-nom-reutilise.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const R = { ok: [], ko: [] };
const chk = (c, m) => (c ? R.ok : R.ko).push(m);
const WF = '.github/workflows/cleanup-stale-branches.yml';
const src = readFileSync(WF, 'utf8');

/* --- 1. garde de source : le filtre existe, au bon endroit ------------------ */
chk(/merge-base --is-ancestor "origin\/\$b" origin\/main/.test(src),
  'source : la suppression exige que la POINTE ACTUELLE de la branche soit déjà dans main');
chk(/git show-ref --verify --quiet "refs\/remotes\/origin\/\$b"/.test(src),
  'source : une branche absente d\'origin est ignorée, pas supprimée « au cas où »');
const iFiltre = src.indexOf('merge-base --is-ancestor "origin/$b"');
const iFichier = src.indexOf('> /tmp/merged_branches.txt');
const iSuppr = src.indexOf('git push origin --delete "$branch"');
chk(iFiltre > 0 && iFiltre < iFichier && iFichier < iSuppr,
  'source : le filtre s\'applique AVANT l\'écriture de la liste, elle-même lue par la suppression');

/* --- 2. extraire la boucle telle qu'écrite dans le workflow ----------------- */
const m = src.match(/\n(\s*)ALL=""\n([\s\S]*?)\n\s*ALL=\$\(printf "%s" "\$ALL" \| sort -u/);
chk(!!m, 'source : la boucle de filtrage est extractible (ALL="" … ALL=$(printf …))');

/* --- 3. dépôt distant + clone, trois cas connus ---------------------------- */
const D = mkdtempSync(join(tmpdir(), 'cleanup-'));
const bare = join(D, 'origin.git'), work = join(D, 'work'), clone = join(D, 'clone');
const g = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' });
try {
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare]);
  execFileSync('git', ['clone', '-q', bare, work]);
  g(work, 'config', 'user.email', 't@t'); g(work, 'config', 'user.name', 't');
  g(work, 'config', 'push.negotiate', 'false'); // évite l'avertissement « push negotiation failed » sur un dépôt local
  writeFileSync(join(work, 'a.txt'), 'A');
  g(work, 'add', '-A'); g(work, 'commit', '-q', '-m', 'base');
  g(work, 'push', '-q', 'origin', 'main');

  /* claude/finie : un commit, fusionné dans main → entièrement dans main */
  g(work, 'checkout', '-q', '-b', 'claude/finie');
  writeFileSync(join(work, 'f.txt'), 'F'); g(work, 'add', '-A'); g(work, 'commit', '-q', '-m', 'finie');
  g(work, 'checkout', '-q', 'main'); g(work, 'merge', '-q', '--no-ff', '-m', 'PR finie', 'claude/finie');
  g(work, 'push', '-q', 'origin', 'main', 'claude/finie');

  /* claude/reutilisee : une 1re PR fusionnée (le NOM figure donc dans « PR mergées »),
     puis un NOUVEAU commit pas encore dans main */
  g(work, 'checkout', '-q', '-b', 'claude/reutilisee');
  writeFileSync(join(work, 'r1.txt'), 'R1'); g(work, 'add', '-A'); g(work, 'commit', '-q', '-m', 'reutilisee 1');
  g(work, 'checkout', '-q', 'main'); g(work, 'merge', '-q', '--no-ff', '-m', 'PR reutilisee 1', 'claude/reutilisee');
  g(work, 'push', '-q', 'origin', 'main');
  g(work, 'checkout', '-q', 'claude/reutilisee');
  writeFileSync(join(work, 'r2.txt'), 'R2'); g(work, 'add', '-A'); g(work, 'commit', '-q', '-m', 'reutilisee 2 (pas dans main)');
  g(work, 'push', '-q', 'origin', 'claude/reutilisee');

  /* le clone joue le rôle du runner : toutes les branches distantes visibles */
  execFileSync('git', ['clone', '-q', bare, clone]);
  g(clone, 'fetch', '-q', 'origin', '--prune', '+refs/heads/*:refs/remotes/origin/*');

  /* --- 4. faire tourner la boucle EXTRAITE du workflow ----------------------- */
  const indent = m[1].length;
  const boucle = m[2].split('\n').map(l => l.slice(indent)).join('\n');
  const script = `set -e
CANDIDATES="claude/finie
claude/reutilisee
claude/inexistante"
ALL=""
${boucle}
ALL=$(printf "%s" "$ALL" | sort -u | grep -E "^claude/" || true)
echo "=== ALL ==="
echo "$ALL"`;
  const out = execFileSync('bash', ['-c', script], { cwd: clone, encoding: 'utf8' });
  const liste = out.split('=== ALL ===')[1].split('\n').map(s => s.trim()).filter(Boolean);
  chk(liste.includes('claude/finie'), 'comportement : une branche ENTIÈREMENT dans main est bien supprimée');
  chk(!liste.includes('claude/reutilisee'),
    'comportement : une branche dont le nom a eu une PR fusionnée MAIS qui porte de nouveaux commits est GARDÉE');
  chk(!liste.includes('claude/inexistante'), 'comportement : une branche absente d\'origin n\'est pas listée');
  chk(/\[GARDÉE\] claude\/reutilisee — 1 commit\(s\)/.test(out),
    'comportement : la raison est écrite (« 1 commit(s) pas encore dans main »)');
  chk(/\[ABSENTE\] claude\/inexistante/.test(out), 'comportement : l\'absence est écrite, pas silencieuse');

  /* --- 5. discriminant : sans le filtre, la branche vivante partirait -------- */
  const sans = `CANDIDATES="claude/finie
claude/reutilisee"
ALL=$(printf "%s\\n" "$CANDIDATES" | sort -u | grep -E "^claude/" || true)
echo "$ALL"`;
  const out2 = execFileSync('bash', ['-c', sans], { cwd: clone, encoding: 'utf8' });
  chk(/claude\/reutilisee/.test(out2),
    'discriminant : l\'ancienne logique (sans filtre) supprimait bien la branche vivante — le test voit la différence');
} finally {
  rmSync(D, { recursive: true, force: true });
}

for (const l of R.ok) console.log('  ✅ ' + l);
for (const l of R.ko) console.log('  ❌ ' + l);
console.log(`\n${R.ok.length} OK / ${R.ko.length} KO — ${WF}`);
process.exit(R.ko.length ? 1 : 0);
