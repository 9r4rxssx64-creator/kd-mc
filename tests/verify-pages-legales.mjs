/* GARDE — les pages légales disent la vérité (audit complet 30.09.2026, P0 / R4)
 *
 * Mesuré avant : « Responsable : Kevin DESARZENS, Casino de Monte-Carlo (SBM) », « Contact DPO : …@sbm.mc »,
 * et la loi 1.165 (abrogée) citée dans quatre pages. Kevin agit EN SON NOM : l'app n'est ni éditée ni
 * cautionnée par la SBM, et la loi en vigueur est la n° 1.565 du 3 décembre 2024 (en vigueur depuis le
 * 14.12.2024). Ici, pour chacune des quatre pages :
 *   - plus aucune citation de la loi 1.165 (sauf pour dire qu'elle est remplacée) ;
 *   - plus aucune adresse @sbm.mc comme contact ;
 *   - la loi 1.565 nommée ; CMCteams et ses CGU disent « à titre personnel » et que la SBM n'est pas responsable ;
 *   - aucun « DPO » annoncé (un éditeur individuel n'en désigne pas : on dit « contact données personnelles »).
 * SABOTAGE prouvé : remettre « Loi 1.165 » dans privacy.html → rouge.
 * node tests/verify-pages-legales.mjs */
import { readFileSync } from 'node:fs';
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };
const lire = (p) => readFileSync(p, 'utf8');
const PAGES = ['privacy.html', 'cgu.html', 'messaging-app/cgu.html', 'shops/legal/confidentialite.html'];
for (const p of PAGES) {
  const s = lire(p);
  const citations1165 = (s.match(/1\.165/g) || []).length;
  const remplace = (s.match(/remplace la loi n° 1\.165/g) || []).length;
  ok(citations1165 === remplace, `${p} : la loi 1.165 n'est plus citée comme en vigueur (${citations1165} mention(s), ${remplace} pour dire qu'elle est remplacée)`);
  ok(/1\.565 du 3 décembre 2024/.test(s), `${p} : la loi n° 1.565 du 3 décembre 2024 est nommée`);
  ok(!/@sbm\.mc/.test(s), `${p} : aucune adresse @sbm.mc comme contact`);
  ok(!/\bDPO\b/.test(s), `${p} : aucun « DPO » annoncé`);
}
for (const p of ['privacy.html', 'cgu.html']) {
  const s = lire(p);
  ok(/à titre personnel/.test(s) && /Société des Bains de Mer \(SBM\)/.test(s) && !/Casino de Monte-Carlo \(SBM\)<\/li>/.test(s), `${p} : Kevin agit à titre personnel, la SBM est nommée comme NON responsable`);
  ok(!/Place du Casino, 98000 Monaco/.test(s), `${p} : l'adresse de la SBM n'est plus donnée comme celle de l'éditeur`);
  ok(/mailto:kevind@monaco\.mc/.test(s), `${p} : le contact est l'adresse personnelle de Kevin`);
}
console.log(`\n${pass} OK / ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
