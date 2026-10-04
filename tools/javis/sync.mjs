/* Recopie la SEULE Bee vers les pages qui l'embarquent.
 *
 * Pourquoi cet outil existe : les 3 copies du widget doivent être identiques à l'octet,
 * et c'était garanti… par la mémoire de celui qui modifiait le fichier. Le 16.09 la
 * recopie a été oubliée : deux Bee différentes en ligne, sans un seul message d'erreur.
 * `npm run test:javis-bee` le DÉTECTE — mais après le commit. Cet outil le fait AVANT.
 *
 *   npm run sync:javis            recopie et dit ce qui a changé
 *   npm run sync:javis -- --verif ne recopie rien, sort 1 si une copie diverge
 *
 * La liste des pages porteuses est DÉDUITE du dépôt (grep), jamais écrite à la main :
 * une page ajoutée demain est synchronisée sans qu'on y pense.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CANON = 'tools/javis/javis-widget.js';
const verifSeule = process.argv.includes('--verif');

/* Les pages qui chargent le widget → le dossier où sa copie doit vivre. */
const IGNORE = new Set(['node_modules', '.git', 'vendor', 'archives', '_archive_v12', 'coverage']);
function pagesPorteuses(dir = ROOT, out = []) {
  for (const e of readdirSync(dir)) {
    if (IGNORE.has(e) || e.startsWith('.')) continue;
    const p = join(dir, e);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) pagesPorteuses(p, out);
    else if (e.endsWith('.html') && /<script[^>]+src="[^"]*javis-widget\.js/.test(readFileSync(p, 'utf8'))) out.push(p);
  }
  return out;
}

/* Seulement les pages SUIVIES par git (audit externe 02.10 : les copies des dossiers ignorés —
   pages-upload/, public/, fabriqués par secours:prepare — rendaient test:javis-bee rouge en local).
   Sans git (archive), on retombe sur la lecture du disque. */
function pagesSuivies() {
  try {
    const l = execFileSync('git', ['ls-files', '-z', '--', '*.html'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);
    return l.map((f) => join(ROOT, f)).filter((p) => /<script[^>]+src="[^"]*javis-widget\.js/.test(readFileSync(p, 'utf8')));
  } catch { return pagesPorteuses(); }
}
/* LA MARIONNETTE (3.10) : une seule source, tools/javis/marionnette.js, posée DANS le widget
   entre deux repères (le widget reste un seul fichier, chargé par toutes les pages porteuses)
   et recopiée à côté de Lingua (lingua/marionnette.js), qui l'appelle par une balise <script>. */
const SOURCE_MRN = 'tools/javis/marionnette.js';
const COPIE_MRN = 'lingua/marionnette.js';
const mrn = readFileSync(join(ROOT, SOURCE_MRN), 'utf8');
{
  const w = readFileSync(join(ROOT, CANON), 'utf8');
  const re = /\/\*<marionnette>\*\/[\s\S]*?\/\*<\/marionnette>\*\//;
  if (!re.test(w)) { console.error(`✗ repères /*<marionnette>*/ absents de ${CANON}`); process.exit(1); }
  const voulu = w.replace(re, () => '/*<marionnette>*/\n' + mrn.trimEnd() + '\n/*</marionnette>*/');
  if (voulu !== w) {
    if (verifSeule) { console.log(`  ✗ ${CANON} : la marionnette DIVERGE de ${SOURCE_MRN}`); process.exitCode = 1; }
    else { writeFileSync(join(ROOT, CANON), voulu); console.log(`  → ${CANON} : marionnette reposée depuis ${SOURCE_MRN}`); }
  } else console.log(`  = ${CANON} : marionnette identique à ${SOURCE_MRN}`);
  let l = null; try { l = readFileSync(join(ROOT, COPIE_MRN), 'utf8'); } catch { /* absente */ }
  if (l !== mrn) {
    if (verifSeule) { console.log(`  ✗ ${COPIE_MRN} DIVERGE de ${SOURCE_MRN}`); process.exitCode = 1; }
    else { writeFileSync(join(ROOT, COPIE_MRN), mrn); console.log(`  → ${COPIE_MRN} ${l === null ? 'créée' : 'remise à jour'}`); }
  } else console.log(`  = ${COPIE_MRN} (déjà identique)`);
}
const canon = readFileSync(join(ROOT, CANON));
const cibles = [...new Set(pagesSuivies().map((page) => join(dirname(page), 'javis-widget.js')))]
  .filter((c) => relative(ROOT, c) !== CANON);

let divergentes = 0;
for (const cible of cibles) {
  const nom = relative(ROOT, cible);
  let avant = null;
  try { avant = readFileSync(cible); } catch { /* absente */ }
  if (avant && avant.equals(canon)) { console.log(`  = ${nom} (déjà identique)`); continue; }
  divergentes++;
  if (verifSeule) { console.log(`  ✗ ${nom} DIVERGE de ${CANON}`); continue; }
  writeFileSync(cible, canon);
  console.log(`  → ${nom} ${avant ? 'remise à jour' : 'créée'} (${canon.length} octets)`);
}

console.log(verifSeule
  ? `Bee : ${cibles.length} copie(s) contrôlée(s), ${divergentes} divergente(s)`
  : `Bee : ${cibles.length} copie(s), ${divergentes} mise(s) à jour depuis ${CANON}`);
process.exit(verifSeule && (divergentes || process.exitCode) ? 1 : 0);
