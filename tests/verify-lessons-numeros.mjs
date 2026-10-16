/* GARDE — UN NUMÉRO DE LEÇON NEUF ET UNIQUE (Kevin 16.10.2026, 5e rappel « mets TOUS les documents à jour… sans rien oublier »).
 * Mesuré ce soir : 757 leçons, 135 numéros non croissants, 582 écrit 3 fois et 583 cinq fois — chaque session devinait
 * « le dernier + 1 » dans sa propre copie. Un numéro qui désigne cinq leçons ne désigne plus rien (« leçon #583 » dans
 * un MEMO, une PR, un message : laquelle ?). L'histoire reste telle quelle (cliquet : les 757 premières entrées sont figées) ;
 * toute leçon AJOUTÉE porte un numéro strictement plus grand que tout ce qui existe avant elle.
 * Prochain numéro libre : node tools/docs/lecon-suivante.mjs
 * node tests/verify-lessons-numeros.mjs */
import { readFileSync } from 'node:fs';

const FIGEES = 757;          /* entrées déjà là le 16.10 au soir — leurs numéros ne sont pas rejugés */
let ok = 0, ko = 0;
const t = (c, m) => { if (c) { ok++; console.log('  ✅ ' + m); } else { ko++; console.log('  ❌ ' + m); } };

export function controler(texte, figees = FIGEES) {
  const nums = [...texte.matchAll(/^(\d+)\. \*\*/gm)].map((m) => Number(m[1]));
  const pb = [];
  let max = Math.max(0, ...nums.slice(0, figees));
  for (const n of nums.slice(figees)) {
    if (n <= max) pb.push(`leçon ${n} : numéro déjà pris (le plus grand avant elle est ${max}) — prends ${max + 1}`);
    max = Math.max(max, n);
  }
  return { total: nums.length, pb };
}

const src = readFileSync('LESSONS.md', 'utf8');
const r = controler(src);
t(r.total >= FIGEES, `${r.total} leçons (≥ ${FIGEES} figées)`);
t(r.pb.length === 0, r.pb.length ? r.pb.join(' · ') : 'chaque leçon ajoutée depuis le 16.10 soir porte un numéro neuf et croissant');
/* sabotage : une leçon ajoutée avec un numéro déjà pris → rouge */
const casse = src.replace(/\s*$/, '\n\n583. **DOUBLON DE TEST** — x.\n');
t(controler(casse).pb.length === 1, 'sabotage « ajouter une leçon numérotée 583 » → rouge');
const bon = src.replace(/\s*$/, '\n\n999. **NEUVE** — x.\n');
t(controler(bon).pb.length === 0, 'une leçon au numéro neuf (999) passe');
console.log(`\n${ok} OK / ${ko} échec(s)`);
if (ko) process.exit(1);
