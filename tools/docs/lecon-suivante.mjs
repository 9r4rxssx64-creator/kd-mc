#!/usr/bin/env node
/* Le prochain numéro de leçon LIBRE (16.10.2026, 5e rappel « tous les documents à jour »).
   Mesuré ce soir : 757 leçons, 582 écrit 3 fois, 583 cinq fois — chaque session devinait « le dernier + 1 » dans sa copie.
   node tools/docs/lecon-suivante.mjs  →  586 */
import { readFileSync } from 'node:fs';
const nums = [...readFileSync(new URL('../../LESSONS.md', import.meta.url), 'utf8').matchAll(/^(\d+)\. \*\*/gm)].map((m) => Number(m[1]));
console.log(Math.max(0, ...nums) + 1);
