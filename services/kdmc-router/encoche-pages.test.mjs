/* GARDE — les pages servies par le routeur (porte de connexion, « crée ton code », page introuvable, mail confirmé…) ne passent plus
 * sous l'encoche de l'iPhone (Kevin 25.10.2026 : « le haut est caché dans l'écran »). Mesuré par le robot d'affichage : les 32 adresses
 * en anonyme sortaient « haut sous l'encoche » — la porte du routeur déclare viewport-fit=cover sans aucune marge safe-area.
 * Règle : toute page HTML du routeur qui déclare viewport-fit=cover porte safe-area-inset-top dans ses 6 lignes suivantes.
 * SABOTAGE : retirer la marge safe-area d'une porte → rouge. Lancer : node services/kdmc-router/encoche-pages.test.mjs
 */
import { readFileSync } from 'node:fs';
const FICHIERS = ['worker.js', 'mail-confirme.js'];
let ko = 0, vues = 0;
for (const f of FICHIERS) {
  const L = readFileSync(new URL('./' + f, import.meta.url), 'utf8').split('\n');
  L.forEach((l, i) => {
    if (!/<meta name="viewport"[^>]*viewport-fit=cover/.test(l)) return;
    vues++;
    const bloc = L.slice(i, i + 7).join('\n');
    const bon = /safe-area-inset-top/.test(bloc);
    console.log((bon ? '  ✓ ' : '  ✗ ') + f + ':' + (i + 1) + (bon ? '' : ' — viewport-fit=cover sans safe-area-inset-top : le haut passe sous l’encoche'));
    if (!bon) ko++;
  });
}
if (vues < 6) { console.log('  ✗ trop peu de pages trouvées (' + vues + ') : le garde ne lit plus le bon code'); ko++; }
console.log('\n' + (ko ? '❌ ' + ko + ' page(s) sous l’encoche' : '✅ ' + vues + ' pages du routeur : marge de l’encoche iPhone présente'));
process.exit(ko ? 1 : 0);
