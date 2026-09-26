#!/usr/bin/env node
/* GARDE — la MESURE de la dette XSS doit rester juste.
 *
 * Pourquoi cette garde existe (17.09.2026) : le compteur « innerHTML sans esc() » de
 * tools/audit/improvements-audit.cjs comptait AUSSI les lignes qui posent du TEXTE FIXE
 * (`el.innerHTML = '<div>…</div>'`), alors qu'une ligne sans aucune donnée ne peut rien
 * injecter du tout. Mesure : 117 lignes comptées dont **43 de texte fixe** → la vraie dette
 * était **74**. Conséquence concrète : un texte statique ajouté par une session faisait
 * monter le cliquet et rougir test:ci pour TOUT LE MONDE, pour une non-faille.
 *
 * « Une mesure fausse est pire que pas de mesure » — donc on la garde, elle aussi.
 * Le sens du garde-fou : il doit continuer à compter toute ligne qui injecte une DONNÉE
 * (concaténation, gabarit `${}`, appel de fonction) et à ignorer le texte fixe.
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(join(ROOT, 'tools/audit/improvements-audit.cjs'), 'utf8');
const bloc = src.match(/const estTexteFixe = [\s\S]*?\n};/);
if (!bloc) { console.error("❌ estTexteFixe introuvable dans improvements-audit.cjs"); process.exit(1); }
// eslint-disable-next-line no-eval
const estTexteFixe = eval('(' + bloc[0].replace(/^const estTexteFixe = /, '').replace(/;$/, '') + ')');

const CAS = [
  ["  el.innerHTML = '<b>bonjour</b>';", true, 'texte fixe (apostrophes) → PAS une faille'],
  ['  el.innerHTML = "<div>ok</div>";', true, 'texte fixe (guillemets) → PAS une faille'],
  ["  box.innerHTML='<p style=\"color:red\">message fixe.</p>';", true, 'texte fixe avec attribut style'],
  ["  el.innerHTML = '<b>' + nom + '</b>';", false, 'DONNÉE concaténée → compte'],
  ['  el.innerHTML = `<b>${nom}</b>`;', false, 'DONNÉE en gabarit → compte'],
  ['  el.innerHTML = rendu(DATA);', false, 'appel de fonction → compte'],
  ["  el.innerHTML += '<i>' + x + '</i>';", false, 'DONNÉE en +=  → compte']
];

let ko = 0;
for (const [ligne, attendu, quoi] of CAS) {
  const vu = estTexteFixe(ligne);
  const ok = vu === attendu;
  if (!ok) ko++;
  console.log(`  ${ok ? '✅' : '❌'} ${quoi}`);
}
console.log(`\n${CAS.length - ko} contrôle(s) OK, ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
