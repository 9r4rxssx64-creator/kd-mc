/* GARDE — accessibilité de Lingua (audit 2.10 : axe mesurait zoom bloqué, 493 contrastes faibles, 584
 * cadenas sans nom ; après correction, axe = 0 défaut sur arrivée, création, choix de langue, accueil, leçon).
 * Garde statique (sans axe, qui n'est pas une dépendance du dépôt) des causes corrigées.
 * node tests/verify-lingua-accessibilite.mjs */
import { readFileSync } from 'node:fs';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}`); };
const html = readFileSync(new URL('../lingua/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../lingua/app.js', import.meta.url), 'utf8');
ok(!/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/.test(html), '1. le zoom n\'est pas bloqué (WCAG 1.4.4)');
ok(/-webkit-touch-callout:none\)\{input,select,textarea\{font-size:16px/.test(html), '2. iPhone : les champs font 16 px (pas de saut de zoom au toucher)');
ok(/node\.setAttribute\("aria-label"/.test(app) && /enode\.setAttribute\("aria-label"/.test(app), '3. chaque leçon et chaque examen du parcours a un nom lisible (fini « 🔒 » ×584)');
ok(/PARCOURS FENÊTRÉ/.test(app) && /path-more/.test(app), '4. le parcours n\'affiche que les unités autour de l\'élève (plus 586 boutons d\'un coup)');
ok(/\.unit-head\{[^}]*linear-gradient\(rgba\(0,0,0,\.42\)/.test(html), '5. en-têtes d\'unité : voile sombre → texte blanc lisible sur toutes les couleurs');
ok(/\.btn-main\{[^}]*background:#087a54/.test(html), '6. bouton principal : vert assez foncé pour le texte blanc (≥ 4,5:1)');
ok(!/\.legal-note\{[^}]*color:#5f7284/.test(html), '7. mention légale : plus de gris illisible');
ok(/:focus-visible\{outline:3px/.test(html), '8. le focus clavier est visible');
ok(/id="tbAv"[^>]*aria-label=/.test(app), '9. le bouton avatar a un nom');
console.log(`\n=== ${pass} OK / ${fail} FAIL ===`); process.exit(fail ? 1 : 0);
