/* GARDE — LE ROBOT LIGHTHOUSE D'APEX ARCHIVE LA MESURE DU JOUR, PAS UN VIEUX FICHIER (studio-crea, 24.10.2026, tâche 26 du pont)
   Mesuré le 24.10 sur le run public 40000661325 (23.10, « success ») : l'artefact ne contenait que
   `apex-ai/v13/lighthouse-v13.3.73*.json` — des fichiers figés dans le dépôt, mesure du 8 MAI 2026 (performance 99) —
   alors que la mesure fraîche (`.lighthouseci/`, performance 51 en mobile, LCP 7,9 s) n'y était pas :
   `actions/upload-artifact` ignore les dossiers cachés sans `include-hidden-files: true`. Et le résumé du run
   affichait des seuils (≥ 90) qui ne sont pas ceux du fichier de configuration (≥ 45). Qui lisait le robot lisait faux.
   node tests/verify-lighthouse-robot.mjs            → doit être vert
   node tests/verify-lighthouse-robot.mjs --sabotage → rejoue l'ancien robot : doit être rouge (preuve que la garde discrimine) */
import { readFileSync } from 'node:fs';

const SABOTAGE = process.argv.includes('--sabotage');
let ok = 0, ko = 0;
const t = (c, m) => { if (c) { ok++; console.log('  ✅ ' + m); } else { ko++; console.log('  ❌ ' + m); } };

let y = readFileSync(new URL('../.github/workflows/lighthouse-apex-v13.yml', import.meta.url), 'utf8');
if (SABOTAGE) {
  // L'ancien robot (avant le 24.10) : dossier caché sans l'option, vieux JSON archivés, seuils écrits à la main.
  y = y
    .replace(/\n\s+include-hidden-files: true/, '')
    .replace(/path: apex-ai\/v13\/\.lighthouseci\//, 'path: |\n            apex-ai/v13/.lighthouseci/\n            apex-ai/v13/lighthouse-*.json')
    .replace(/lighthouse\.config\.json", "utf8"\)/, 'x", "utf8")')
    .replace(/\/\^lhr-\.\*\\\.json\$\//, '/^rien$/');
}

const upload = (() => {
  const i = y.indexOf('name: Upload Lighthouse reports');
  const j = y.indexOf('- name:', i + 10);
  return i < 0 ? '' : y.slice(i, j < 0 ? undefined : j);
})();
const summary = (() => {
  const i = y.indexOf('name: Summary');
  return i < 0 ? '' : y.slice(i);
})();

console.log('\nRobot Lighthouse d\'Apex v13 : la mesure du jour, pas un vieux fichier' + (SABOTAGE ? ' (SABOTAGE : ancien robot rejoué)' : '') + '\n');
t(upload.length > 0, 'l\'étape « Upload Lighthouse reports » existe');
t(/\.lighthouseci\//.test(upload), 'elle archive le dossier de la mesure du jour (.lighthouseci/)');
t(/include-hidden-files:\s*true/.test(upload), 'elle pose include-hidden-files: true (sinon le dossier caché est ignoré et l\'artefact est vide ou périmé)');
t(!/lighthouse-\*\.json/.test(upload), 'elle n\'archive PLUS les vieux lighthouse-*.json figés dans le dépôt (mesure de mai 2026)');
t(/lighthouse\.config\.json", "utf8"\)/.test(summary), 'le résumé lit les seuils dans lighthouse.config.json (plus de « ≥ 90 » écrit à la main)');
t(!/echo "- Performance ≥ 90"/.test(summary), 'aucun seuil écrit en dur dans le résumé');
// 24.10, run de preuve 40099928754 : avec la cible « temporary-public-storage », lhci n'écrit PAS de manifest.json
// (seulement lhr-*.json) — un résumé qui lirait le manifest dirait « n'a pas mesuré » alors que la mesure est là.
t(/\/\^lhr-\.\*\\\.json\$\//.test(summary) && !/manifest\.json", "utf8"\)/.test(summary), 'le résumé imprime les scores MESURÉS du jour en lisant les rapports lhr-*.json (pas un manifest.json que lhci n\'écrit pas)');
t(/process\.stdout\.write\(texte\)/.test(summary), 'le résumé est aussi écrit dans le journal du run (lisible par l\'API, preuve possible depuis une session)');
t(/n a pas mesuré|Aucune mesure du jour/.test(summary), 'sans mesure du jour, le résumé le dit au lieu d\'afficher un vieux score');

console.log(`\n${ok} OK / ${ko} échec(s)` + (SABOTAGE ? ` — attendu : rouge` : ''));
if (SABOTAGE) process.exit(ko >= 4 ? 0 : 1);
process.exit(ko ? 1 : 0);
