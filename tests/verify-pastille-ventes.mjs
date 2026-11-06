/* Pastille de version sur les trois pages de vente (tâche 108, « MAJ forcées + pastilles de version partout », 6.11.2026).
 * Rotaplan et Devenir croupier interdisent tout script (CSP script-src 'none'), Kit IA n'accepte que ses propres fichiers :
 * le module partagé version-badge-pwa.js ne peut pas y tourner. La pastille est donc un texte simple « vX.Y.Z » dans le
 * pied de page, que le robot « Servi » lit (feuille dont le texte est exactement vX.Y.Z), sans toucher à la CSP.
 * Sabotage : SABOTAGE=1 retire la pastille en mémoire → le contrôle doit être rouge. */
import { readFileSync } from 'node:fs';
let rouge = 0;
const ok = (c, m, d = '') => { console.log((c ? '✅ ' : '❌ ') + m + (c ? '' : '  ' + d)); if (!c) rouge++; };
const PAGES = ['shops/rotaplan/index.html', 'shops/croupier/index.html', 'shops/kit-ia/index.html'];
for (const f of PAGES) {
  let h = readFileSync(f, 'utf8');
  if (process.env.SABOTAGE === '1') h = h.replace(/<span[^>]*data-app-ver="v[\d.]+"[^>]*>v[\d.]+<\/span>/g, '');
  const pied = (h.match(/<footer[\s\S]*?<\/footer>/) || [''])[0];
  const m = pied.match(/<span[^>]*data-app-ver="(v\d+\.\d+\.\d+)"[^>]*>(v\d+\.\d+\.\d+)<\/span>/);
  ok(!!m && m[1] === m[2], `${f} : pastille « vX.Y.Z » dans le pied de page (feuille lisible par Servi)`, m ? JSON.stringify(m.slice(1)) : 'absente');
  const csp = (h.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i) || [])[1] || '';
  if (/rotaplan|croupier/.test(f)) ok(/script-src 'none'/.test(csp), `${f} : la CSP interdit toujours tout script`);
  ok(!/version-badge-pwa\.js/.test(h), `${f} : aucun script de badge ajouté (la CSP le bloquerait)`);
}
if (rouge) { console.log(`\n${rouge} contrôle(s) rouge(s)`); process.exit(1); }
console.log('\nPastilles des pages de vente : tout vert');
