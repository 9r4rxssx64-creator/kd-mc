/* GARDE — aucun lien symbolique absolu ne doit être suivi par git.
 * ===========================================================================
 * Né d'une vraie faute, le 4.09.2026. Pour faire tourner les tests dans un
 * dossier de travail temporaire, j'avais créé un raccourci :
 *
 *     ln -s /home/user/CMCteams/node_modules node_modules
 *
 * puis j'ai enregistré le tout avec « git add -A . ». Le raccourci est parti
 * dans le dépôt : un fichier de type lien (120000) dont le contenu est un
 * chemin de MA machine. Sur l'ordinateur de n'importe qui d'autre, il pointe
 * dans le vide — et « npm ci » peut refuser de fonctionner.
 *
 * C'est exactement le piège de la leçon #168 (« après un merge : fichier par
 * fichier, jamais git add -A »), avec un déclencheur différent : ici ce n'est
 * pas un conflit, c'est une commodité de test qu'on oublie de retirer.
 *
 * La garde est volontairement étroite : elle n'interdit PAS les liens relatifs
 * (un lien vers un fichier du dépôt est légitime), seulement ceux qui sortent
 * du dépôt ou qui commencent par « / » — ceux-là ne peuvent, par construction,
 * marcher que sur la machine qui les a créés.
 *
 * Lancer : node tests/verify-liens-absolus.mjs
 */
import { execFileSync } from 'node:child_process';

const R = { ok: [], ko: [] };
const chk = (c, m) => (c ? R.ok : R.ko).push(m);

/* « ls-files -s » donne le mode : 120000 = lien symbolique. */
let lignes = [];
try {
  lignes = execFileSync('git', ['ls-files', '-s'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n').filter((l) => l.startsWith('120000'));
} catch (e) {
  chk(false, 'git ls-files a échoué : ' + String(e.message).slice(0, 100));
}

const fautifs = [];
for (const l of lignes) {
  const [infos, chemin] = l.split('\t');
  const sha = infos.split(/\s+/)[1];
  let cible = '';
  try { cible = execFileSync('git', ['cat-file', '-p', sha], { encoding: 'utf8' }).trim(); } catch { /* ignoré */ }
  /* absolu, ou remonte hors du dépôt */
  if (cible.startsWith('/') || cible.startsWith('~') || /(^|\/)\.\.(\/|$)/.test(cible)) {
    fautifs.push(`${chemin} → ${cible}`);
  }
}

chk(fautifs.length === 0,
  `aucun lien symbolique absolu suivi par git (${lignes.length} lien(s) au total, ${fautifs.length} fautif(s))`);
if (fautifs.length) fautifs.slice(0, 5).forEach((f) => R.ko.push('   ↳ ' + f));

R.ko.forEach((m) => console.log('  FAIL ' + m));
R.ok.forEach((m) => console.log('  OK   ' + m));
console.log(`\n=== ${R.ok.length} OK / ${R.ko.length} FAIL ===`);
process.exit(R.ko.length ? 1 : 0);
