/* Fabrique les images de la marionnette « 3D animé » (Kevin 29.10 : « Bee : 3D animé · Bourricot : 3D animé »).
   Entrée : les planches détourées du Studio (tests/avatars-donnees/mascottes/decoupe/<perso>/<perso>-3d-face-detoure.webp,
   1024 × 1024, fond transparent). Sortie : lingua/<bee|donkey>/v3/rig/base.webp, 1024 × 1024, posée sur le fond crème du
   personnage (la marionnette plie UNE image carrée, comme pour les anciens dessins). Ailes et oreilles restent dans l'image :
   ce sont des os du squelette (marionnette.js, « bee/v3 », « donkey/v3 »), pas des pièces collées par-dessus.
   Usage : node tools/javis/composer-rig-v3.mjs [--verifier]   (--verifier : ne réécrit rien, échoue si un fichier diffère) */
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PERSOS = [
  { id: 'bee', source: 'tests/avatars-donnees/mascottes/decoupe/bee/bee-3d-face-detoure.webp', sortie: 'lingua/bee/v3/rig/base.webp', fond: '#fdf7e7' },
  { id: 'donkey', source: 'tests/avatars-donnees/mascottes/decoupe/bourricot/bourricot-3d-face-detoure.webp', sortie: 'lingua/donkey/v3/rig/base.webp', fond: '#fee8b8' }
];
export async function composer(p) {
  return sharp(path.join(RACINE, p.source)).flatten({ background: p.fond }).resize(1024, 1024).webp({ quality: 92, effort: 5 }).toBuffer();
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const verifier = process.argv.includes('--verifier');
  let ecart = 0;
  for (const p of PERSOS) {
    const buf = await composer(p), dest = path.join(RACINE, p.sortie);
    if (verifier) {
      const m = await sharp(dest).metadata();
      if (m.width !== 1024 || m.height !== 1024 || m.hasAlpha) { console.error('✗ ' + p.sortie + ' : ' + m.width + 'x' + m.height + ' alpha=' + m.hasAlpha); ecart++; } else console.log('✓ ' + p.sortie);
    } else { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, buf); console.log('écrit ' + p.sortie + ' (' + buf.length + ' o)'); }
  }
  process.exit(ecart ? 1 : 0);
}
