#!/usr/bin/env node
/* Lots de recherche pour le Lenovo, depuis un export lu sur l'ENTRÉE STANDARD (aucun chemin de fichier en argument) :
 *   node tools/arbre/appliquer-nuage.mjs --exporter /dev/stdout | node tools/arbre/lots-ia.mjs [--n 30]   ou   node tools/arbre/lots-ia.mjs --n 30 < export.json
 * Écrit sur la sortie un JSON { ouvert:[…], ferme:[…] } ; les « fermé » portent local_seulement:true (modèle local uniquement, rien ne part dans le nuage). */
import { readFileSync } from 'node:fs';
import { lots } from './confidentialite.mjs';
if (process.argv[1]?.endsWith('lots-ia.mjs')) {
  const d = JSON.parse(readFileSync(0, 'utf8')); const i = process.argv.indexOf('--n');
  console.log(JSON.stringify(lots(d.persons || d, { n: i > 0 ? Number(process.argv[i + 1]) : 30 }), null, 1));
}
