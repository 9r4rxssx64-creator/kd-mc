/* Kevin 8.11.2026 (photo de l'écran « Qui apprend aujourd'hui ? ») : impossible de savoir quelle version tourne sur l'iPad (Bee 3D = ancienne version ?).
 * pc-config 1632 : « aucune pastille de version visible sur l'écran de connexion de Lingua ». Garde : la version s'affiche sur cet écran.
 * Sabotage : APP=<ancien app.js> doit être rouge. */
import fs from 'node:fs';
const src = fs.readFileSync(process.env.APP || 'lingua/app.js', 'utf8');
let n = 0, ko = 0; const chk = (c, l) => { n++; if (!c) ko++; console.log((c ? '  ✅ ' : '  ❌ ') + l); };
chk(/non affiliée à un tiers\. · Lingua "\+APP_VER/.test(src), 'l\'écran « Qui apprend aujourd\'hui ? » affiche la version de Lingua');
chk(/var APP_VER="v\d+\.\d+\.\d+"/.test(src), 'APP_VER est bien une version vX.Y.Z');
console.log(`\n${n - ko}/${n} contrôles OK`); process.exit(ko ? 1 : 0);
