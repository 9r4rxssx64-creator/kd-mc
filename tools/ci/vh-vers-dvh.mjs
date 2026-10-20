#!/usr/bin/env node
/* iPhone : « 100vh » = la hauteur AVEC la barre Safari repliée → le bas des fenêtres et leurs boutons passent SOUS la barre, et le défilement
   ne peut plus les atteindre (Kevin 20.10.2026 : « une partie cachée en haut ou en bas, des boutons… les écrans se bloquent »).
   Ce script ajoute, dans chaque règle CSS qui fixe une hauteur en vh, la même hauteur en dvh (hauteur VISIBLE) juste après : les navigateurs
   qui ne connaissent pas dvh gardent le vh, les autres prennent dvh. Idempotent. --verifier : liste ce qui manque, sort 1 s'il en reste.
   Usage : node tools/ci/vh-vers-dvh.mjs [--verifier] [fichier…] */
import fs from 'node:fs';
import path from 'node:path';
const DOSSIERS = ['index.html', 'arbre', 'shops', 'lingua', 'messaging-app', 'kdmc-home', 'coffre-fort', 'la-detente', 'tools', 'javis', 'patrimoine'];
const SAUF = /node_modules|research|_archive|\/dist\/|apex-ai-v13\/(assets|chunks)|\.min\./;
function liste(d) { let r = []; if (!fs.existsSync(d)) return r; const st = fs.statSync(d); if (st.isFile()) return /\.(html|css)$/.test(d) ? [d] : []; for (const f of fs.readdirSync(d, { withFileTypes: true })) { if (f.name.startsWith('.') || f.name === 'node_modules') continue; const p = path.join(d, f.name); if (SAUF.test(p)) continue; r = r.concat(f.isDirectory() ? liste(p) : (/\.(html|css)$/.test(f.name) ? [p] : [])); } return r; }
const VERIF = process.argv.includes('--verifier');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const fichiers = args.length ? args : DOSSIERS.flatMap(liste);
const REGLE = /([^{}<>]*)\{([^{}]*)\}/g;
const DECL = /((?:max-|min-)?height\s*:\s*)(\d+(?:\.\d+)?)vh(\s*!important)?/g;
let reste = 0, change = 0;
for (const f of fichiers) {
  const s = fs.readFileSync(f, 'utf8');
  let nb = 0;
  const out = s.replace(REGLE, (m, sel, corps) => {
    if (/dvh|svh/.test(corps) || /[`$]\{/.test(m) || !DECL.test(corps)) { DECL.lastIndex = 0; return m; }
    DECL.lastIndex = 0;
    const nv = corps.replace(DECL, (x, p, n, imp) => { nb++; return p + n + 'vh' + (imp || '') + ';' + p + n + 'dvh' + (imp || ''); });
    return sel + '{' + nv + '}';
  });
  if (nb) { reste += nb; if (!VERIF) { fs.writeFileSync(f, out); change++; console.log('  ' + f + ' : ' + nb); } else console.log('  manque : ' + f + ' (' + nb + ')'); }
}
console.log(VERIF ? `${reste} hauteur(s) en vh sans dvh` : `${change} fichier(s) corrigé(s), ${reste} hauteur(s)`);
process.exit(VERIF && reste ? 1 : 0);
