/* GARDE — LE BILAN DU ROBOT « TOUTES LES FONCTIONS » TIENT DANS LES LIMITES DE GITHUB (05.11.2026)
   Constat (run 42084079235) : 13 annotations « notice » émises, GitHub n'en garde que 10 par étape et 900 caractères chacune : la ligne « bilan »
   et les 2 derniers blocs (écran Réglages) n'apparaissaient jamais. Le script remet le bilan en premier, remplit des blocs ≤ 860 caractères, en garde 8 au plus,
   et écrit le détail complet dans le résumé du job. Ici : on exécute la VRAIE logique (extraite du robot) sur 90 résultats et on compte.
   node tests/verify-annotations-robot-apex.mjs  ·  SABOTAGE=1 : remet l'ancien découpage (7 lignes par bloc, sans plafond) — doit être rouge */
import { readFileSync } from 'node:fs';
let ok = 0, ko = 0;
const t = (c, m) => { if (c) { ok++; console.log('  ✅ ' + m); } else { ko++; console.log('  ❌ ' + m); } };
const src = readFileSync(new URL('./fonctions-apex.mjs', import.meta.url), 'utf8');
const dep = src.indexOf("const courtes = RES.map"), fin = src.indexOf('  try { if (process.env.GITHUB_STEP_SUMMARY)');
t(dep > 0 && fin > dep, 'le découpage des blocs est dans le robot');
t(/GITHUB_STEP_SUMMARY/.test(src), 'le détail complet part aussi dans le résumé du job');
const RES = Array.from({ length: 90 }, (_, i) => ({ ok: i % 40 === 7 ? null : true, nom: 'Mesure connectée [réglages] : contrôle numéro ' + i + ' chez A', detail: 'x'.repeat(60) + ' · 0' }));
const sortie = [];
const annot = (n, titre, m) => sortie.push({ n, titre, m: String(m).replace(/\r?\n/g, ' ⏎ ').slice(0, 900), brut: String(m) });
let blocsCode = src.slice(dep, fin);
if (process.env.SABOTAGE) blocsCode = "const lignes = RES.map((r) => r.nom + ' — ' + r.detail); for (let i = 0; i < lignes.length; i += 7) annot('notice', 'Fonctions Apex (' + (i / 7 + 1) + ')', lignes.slice(i, i + 7).join('\\n'));";
// eslint-disable-next-line no-new-func
new Function('RES', 'annot', blocsCode)(RES, annot);
const notices = sortie.filter((x) => x.n === 'notice');
t(notices.length <= 9, `au plus 9 annotations « notice » (${notices.length}) — GitHub en garde 10`);
t(sortie.every((x) => x.brut.replace(/\r?\n/g, ' ⏎ ').length <= 900), 'aucun bloc ne dépasse 900 caractères (rien de coupé)');
const dernierNom = RES[RES.length - 1].nom.slice(0, 40);
t(sortie.some((x) => x.m.includes(dernierNom)) || notices.some((x) => /suite : voir le résumé/.test(x.m)), 'la dernière ligne (écran Réglages) est visible, ou la suite est signalée');
console.log(`\n${ok} ✅ · ${ko} ❌`); process.exit(ko ? 1 : 0);
