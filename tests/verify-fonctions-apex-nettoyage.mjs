/* Garde (16.11.2026, leçon à numéroter) : le robot « Toutes les fonctions d'Apex Chat » efface les lignes Apex Chat de ses comptes
   MÊME quand il échoue en route (run 43908208361 : « une personne n'a pas pu entrer » → 2 lignes temps-reel restées dans la base).
   SABOTAGE=1 : retire l'appel du bloc finally → le garde doit rougir. */
import { readFileSync } from 'node:fs';
const src0 = readFileSync(new URL('./fonctions-apex.mjs', import.meta.url), 'utf8');
const src = process.env.SABOTAGE === '1' ? src0.replace(/(\} finally \{\n)\s*await effacerLignesApex\(\)[^\n]*\n/, '$1') : src0;
let ko = 0; const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) ko++; };

const m = src.match(/async function effacerLignesApex\(\) \{[\s\S]*?\n\}/);
ok(!!m, 'la fonction effacerLignesApex existe');
const fin = src.match(/\} finally \{\n([\s\S]*?)\n\}\s*$/m);
ok(!!fin && /effacerLignesApex\(\)/.test(fin[1]), 'le bloc finally appelle effacerLignesApex (nettoyage même en cas d\'échec)');
const avantThrow = src.slice(src.indexOf('const B = await entrer'), src.indexOf("throw new Error('une personne n\\'a pas pu entrer')"));
ok((avantThrow.match(/personnes\.push\(/g) || []).length === 3, 'chaque personne est enregistrée dès son entrée, avant le contrôle qui peut lever');

if (m) {
  /* simulation : A n'est pas entrée, B et C oui ; deux appels de suite → 2 effacements seulement */
  const appels = []; const noter = (n, ok2, d) => appels.push([n, ok2, d]); const API = 'x';
  const mk = (e, ouvert) => ({ etiquette: e, ouvert, p: { evaluate: async () => 200 } });
  const personnes = [mk('A', false), mk('B', true), mk('C', true)]; let lignesEffacees = false;
  const f = new Function('personnes', 'noter', 'API', 'lignesEffacees', m[0].replace('async function effacerLignesApex', 'return async function') .replace(/lignesEffacees = true;/, 'lignesEffacees = true;') );
  const run = f(personnes, noter, API, lignesEffacees);
  await run(); await run();
  ok(appels.length === 2 && appels.every((a) => a[1] === true), 'B et C effacées (A, jamais entrée, ignorée), une seule fois même appelée deux fois');
}
process.exit(ko ? 1 : 0);
