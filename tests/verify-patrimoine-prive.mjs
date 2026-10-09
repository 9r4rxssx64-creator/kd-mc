/* GARDE — les dossiers « patrimoine » ne doivent JAMAIS être publiés.
 * ===========================================================================
 * Le dépôt entier est servi publiquement par Cloudflare Pages. Or l'outil
 * tools/patrimoine/chercher.mjs produit, pour chaque membre de la famille de
 * Kevin, un dossier nominatif : noms, dates de naissance et de décès, lieux,
 * et des lettres portant son adresse. Publier ça, ce serait offrir à n'importe
 * qui de quoi usurper une identité ou détourner une succession.
 *
 * Cette garde vérifie donc, à chaque passage du gate :
 *   1. « patrimoine/ » est bien ignoré par git ;
 *   2. AUCUN fichier de ce dossier n'est suivi par git (le .gitignore
 *      n'attrape pas un fichier déjà ajouté avant lui — c'est le piège) ;
 *   3. l'outil lui-même ne contient aucune donnée personnelle en dur : il doit
 *      LIRE l'arbre au moment où on le lance, pas embarquer une copie ;
 *   4. l'outil tourne encore (l'arbre change de forme ⇒ il faut le savoir).
 *
 * Lancer : node tests/verify-patrimoine-prive.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const R = { ok: [], ko: [] };
const chk = (c, m) => (c ? R.ok : R.ko).push(m);
const git = (...a) => {
  try { return execFileSync('git', a, { encoding: 'utf8' }).trim(); } catch { return ''; }
};

/* --- 1. le dossier de sortie est ignoré ------------------------------------ */
/* La règle doit être ANCRÉE à la racine (« /patrimoine/ »). Écrite sans la
   barre de tête, elle attrape TOUT dossier nommé patrimoine où qu'il soit —
   y compris tools/patrimoine/, ce qui a fait disparaître l'outil lui-même du
   dépôt le 4.09. Une exclusion trop large cache autre chose que sa cible. */
const ignore = readFileSync('.gitignore', 'utf8');
chk(/^\/patrimoine\/?$/m.test(ignore),
  '1. « /patrimoine/ » est listé dans .gitignore, ancré à la racine');
chk(!/^patrimoine\/?$/m.test(ignore),
  '1. et PAS en version large, qui masquerait aussi tools/patrimoine/');

/* --- 2. et rien de ce dossier n'est déjà suivi ----------------------------- */
const suivis = git('ls-files', 'patrimoine').split('\n').filter(Boolean);
chk(suivis.length === 0,
  `2. aucun dossier nominatif suivi par git (${suivis.length} trouvé(s)${suivis.length ? ' : ' + suivis.slice(0, 3).join(', ') : ''})`);

/* --- 3. l'outil ne contient AUCUNE donnée personnelle en dur --------------- */
const outil = 'tools/patrimoine/chercher.mjs';
chk(existsSync(outil), '3. l\'outil est là');
if (existsSync(outil)) {
  const src = readFileSync(outil, 'utf8');
  /* Un nom de famille suivi d'une date complète = une fiche recopiée dans le
     code. Les mentions en commentaire (« Marie-Joe est née à Monaco ») sont
     des explications, pas des données exploitables : on cible le gabarit
     NOM + date jj/mm/aaaa ou jj.mm.aaaa, qui est ce qu'un fichier contiendrait. */
  const fiches = src.match(/[A-ZÀ-Ý]{4,}[^\n]{0,40}\b\d{1,2}[./]\d{1,2}[./](?:18|19|20)\d{2}\b/g) || [];
  chk(fiches.length === 0,
    `3. aucune fiche nominative recopiée dans le code (${fiches.length} trouvée(s)) — l'outil lit l'arbre à l'exécution`);
}

/* --- 4. l'outil tourne toujours sur l'arbre réel --------------------------- */
let sortie = '';
try {
  sortie = execFileSync('node', [outil], { encoding: 'utf8', timeout: 60000 });
  chk(/arbre lu\s+: \d+ personnes/.test(sortie),
    '4. l\'outil lit encore l\'arbre : ' + (sortie.match(/arbre lu\s+: \d+ personnes/) || ['?'])[0]);
  const n = +(sortie.match(/à chercher \(≤30 a\) : (\d+)/) || [0, 0])[1];
  chk(n > 0, `4. il ressort ${n} personne(s) à chercher (0 = l'arbre a changé de forme, à corriger)`);
} catch (e) {
  chk(false, '4. l\'outil ne tourne plus : ' + String(e.message).slice(0, 120));
}

/* --- 5. ce qu'il vient d'écrire est bien invisible pour git ---------------- */
if (existsSync('patrimoine/00-A-FAIRE.md')) {
  const vu = git('status', '--porcelain', 'patrimoine');
  chk(vu === '', '5. après exécution, git ne voit toujours rien du dossier produit');
}

R.ko.forEach((m) => console.log('  FAIL ' + m));
R.ok.forEach((m) => console.log('  OK   ' + m));
console.log(`\n=== ${R.ok.length} OK / ${R.ko.length} FAIL ===`);
process.exit(R.ko.length ? 1 : 0);
