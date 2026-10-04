/* L'empreinte des sources du moteur 3D : écrite en tête de javis/perso3d.js par `npm run build:3d`, recalculée par
 * tests/verify-perso3d.mjs. Un moteur compilé AVANT le dernier changement d'un personnage serait servi tel quel à tout le domaine :
 * l'écart saute aux yeux ici. (Fichier à part : le test n'a pas besoin d'esbuild pour la recalculer.) */
import { createHash } from 'node:crypto';
export const SOURCES = ['tools/3d/perso3d-src.js', 'tools/3d/personnages-def.mjs'];
export const empreinte = (lire) => createHash('sha256').update(SOURCES.map((f) => lire(f)).join('\n--\n')).digest('hex').slice(0, 16);
