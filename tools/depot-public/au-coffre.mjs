/* Le dépôt est coupé en deux (Kevin 24.09.2026) : un fichier ABSENT d'ici peut simplement
 * vivre dans l'autre moitié. Les gardes qui nomment un workflow précis doivent distinguer
 * « rangé au coffre » de « supprimé par erreur ».
 *
 * tools/depot-public/au-coffre.json est écrit par exporter.mjs dans le dépôt PUBLIC : il liste
 * les NOMS des workflows restés au coffre (des noms de robots, jamais une donnée). Dans le
 * coffre, ce fichier n'existe pas : rien n'est « ailleurs », tout doit être là.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
let LISTE = null;
function liste() {
  if (LISTE) return LISTE;
  const f = join(RACINE, 'tools/depot-public/au-coffre.json');
  const j = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
  LISTE = { workflows: new Set(j.workflows || []), scripts: new Set(j.scripts || []) };
  return LISTE;
}
/** Ce workflow (nom de fichier) vit-il au coffre, alors qu'on est dans le dépôt public ? */
export const workflowAuCoffre = (nom) => liste().workflows.has(basename(nom));
/** Ce script (chemin depuis la racine, ex. `tools/audit/sonde-domaine.mjs`) vit-il au coffre ?
 *  Au coffre même, la réponse est toujours non : rien n'est « ailleurs », tout doit être là. */
export const scriptAuCoffre = (chemin) => liste().scripts.has(chemin.replace(/^\.\//, ''));
