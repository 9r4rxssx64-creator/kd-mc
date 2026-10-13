/* kdmc-home/liens/liens.js (le centre de liens de Kevin, affiché en page) → kdmc-home/liens/liens.json (lisible par Bee, 0 secret).
 * Une seule source : liens.js. Le JSON est GÉNÉRÉ ; `npm run test:liens-json` échoue s'il dérive.
 *   node tools/liens/exporter.mjs          écrit le fichier
 *   node tools/liens/exporter.mjs --verifier   compare sans écrire (utilisé par le test)
 * Aucune évaluation du code de la page : on isole le littéral `var DATA = [ … ];` (+ les constantes d'adresses du début), puis on l'évalue dans un
 * bac à sable `vm` sans réseau ni document. */
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ICI = path.dirname(fileURLToPath(import.meta.url));
export const SOURCE = path.join(ICI, '..', '..', 'kdmc-home', 'liens', 'liens.js');
export const CIBLE = path.join(ICI, '..', '..', 'kdmc-home', 'liens', 'liens.json');

export function extraire(src) {
  const iDeb = src.indexOf('var DATA = [');
  if (iDeb < 0) throw new Error('var DATA introuvable dans liens.js');
  /* fin du littéral : le `]` qui ferme le premier `[` (on saute les chaînes) */
  let i = src.indexOf('[', iDeb), prof = 0, q = '';
  for (; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = ''; continue; }
    if (c === '\'' || c === '"' || c === '`') { q = c; continue; }
    if (c === '[') prof++; else if (c === ']') { prof--; if (!prof) break; }
  }
  if (prof) throw new Error('littéral DATA non fermé');
  const debutCorps = src.indexOf('\'use strict\';');
  const prefixe = src.slice(debutCorps >= 0 ? debutCorps : 0, iDeb);          // les constantes (GH, PAGES, CF, WK, FB…)
  const code = '(function(){' + prefixe.replace(/'use strict';/, '') + '\n' + src.slice(iDeb, i + 1) + ';\nreturn DATA;})()';
  const DATA = vm.runInNewContext(code, Object.create(null), { timeout: 1000 });
  return DATA;
}

export function fabriquer(src) {
  const DATA = extraire(src);
  const propre = (t) => String(t == null ? '' : t);
  const adr = (u) => { const t = propre(u); return t.startsWith('/') ? 'https://kd-mc.com' + t : t; };   // la page est servie par kd-mc.com : « /admin/ » = https://kd-mc.com/admin/
  const familles = DATA.map((f) => ({
    titre: propre(f.title), sous: propre(f.sub),
    items: (f.items || []).map((e) => {
      const o = { icone: propre(e.ic), nom: propre(e.nm), desc: propre(e.ds) };
      if (e.url) o.url = adr(e.url);
      if (Array.isArray(e.links)) o.liens = e.links.map((x) => ({ l: propre(x.l), u: adr(x.u) }));
      return o;
    }),
  }));
  return JSON.stringify({ _doc: 'GÉNÉRÉ par tools/liens/exporter.mjs depuis liens.js — ne pas éditer à la main (npm run test:liens-json). Aucun secret : seulement des adresses.', familles }, null, 1) + '\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sortie = fabriquer(fs.readFileSync(SOURCE, 'utf8'));
  if (process.argv.includes('--verifier')) {
    const actuel = fs.existsSync(CIBLE) ? fs.readFileSync(CIBLE, 'utf8') : '';
    console.log(actuel === sortie ? 'liens.json à jour' : 'liens.json DÉRIVE de liens.js : lance node tools/liens/exporter.mjs');
    process.exit(actuel === sortie ? 0 : 1);
  }
  fs.writeFileSync(CIBLE, sortie);
  const j = JSON.parse(sortie); console.log('liens.json écrit : ' + j.familles.length + ' familles, ' + j.familles.reduce((n, f) => n + f.items.length, 0) + ' éléments');
}
