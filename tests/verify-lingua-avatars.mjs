/* Kevin 8.11.2026 : « Ajoute beaucoup d'avatars plus mignons » (écran « Nouveau compte » de Lingua, 16 avatars seulement).
 * Garde : au moins 48 avatars, aucun doublon, chacun = UN seul émoji sans sélecteur de variante (U+FE0F : une case vide sur certains
 * appareils), les 16 d'origine toujours là (un compte déjà créé garde le sien), liste défilante et cases ≥ 44 px. Sabotage : APP=<ancien app.js>. */
import fs from 'node:fs';
let n = 0, ko = 0; const chk = (c, l) => { n++; if (!c) ko++; console.log((c ? '  ✅ ' : '  ❌ ') + l); };
const src = fs.readFileSync(process.env.APP || 'lingua/app.js', 'utf8'); const css = fs.readFileSync('lingua/index.html', 'utf8');
const m = src.match(/var AVATARS=\[([\s\S]*?)\];/); const A = m ? JSON.parse('[' + m[1].replace(/\n/g, '') + ']') : [];
const ORIGINE = ['🦊','🐼','🐨','🦁','🐵','🐸','🦄','🐙','🐯','🐧','🐷','🐰','🐻','🐮','🐲','🦖'];
chk(A.length >= 48, `au moins 48 avatars (${A.length})`);
chk(new Set(A).size === A.length, 'aucun doublon');
const seg = new Intl.Segmenter('fr', { granularity: 'grapheme' });
chk(A.every((a) => [...seg.segment(a)].length === 1 && !/️|‍/.test(a)), 'chaque avatar = UN seul émoji, sans sélecteur de variante ni assemblage');
chk(ORIGINE.every((a) => A.includes(a)), 'les 16 avatars d\'origine sont gardés (un compte existant garde le sien)');
chk(/\.av-pick\{[^}]*overflow-y:auto/.test(css) && /\.av-opt\{[^}]*min-height:44px/.test(css), 'la liste défile et chaque case fait au moins 44 px');
console.log(`\n${n - ko}/${n} contrôles OK`); process.exit(ko ? 1 : 0);
