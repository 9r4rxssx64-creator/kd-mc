/* GARDE — LES SCRIPTS QUE LE ROUTEUR SERT AUX PAGES NE DÉPENDENT D'AUCUNE AIDE DU WORKER (Kevin 17.10 : « vérifie que Bee est présent partout »).
 * Cause réelle trouvée en réel : wrangler empaquette le Worker avec esbuild « keep_names », qui réécrit `function f(){}` en
 * `__name(f, "f")` ; or `fn.toString()` (c'est ainsi qu'on sert bee-partout.js et boite-bouton.js) rend ce code TRANSFORMÉ, et `__name`
 * n'existe que dans le Worker. Dans la page : ReferenceError, avalée par le try/catch → ni Bee, ni ✉️, ni « ← Portail », sans un seul message.
 *   1. les deux scripts servis définissent EUX-MÊMES `__name` (le serveur peut les transformer comme il veut) ;
 *   2. un script auquel on injecte un appel `__name(...)` — ce que fait le paquetage — SE LANCE quand même dans une page simulée ;
 *   3. le contrôle : le MÊME script SANS l'aide ne se lance pas (le test voit bien la panne — il n'est pas vert pour rien) ;
 *   4. avec le VRAI esbuild « keep_names » (s'il est installé) : le script réellement empaqueté se lance aussi.
 * node services/kdmc-router/js-servis.test.mjs */
import vm from 'node:vm';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { PARTOUT_JS, partout, NOM_AIDE } from './bee-partout.js';
import { BOUTON_JS, bouton } from './boite-bouton.js';

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m + (d !== undefined ? ' → ' + String(d).slice(0, 300) : '')); } };
const ICI = dirname(fileURLToPath(import.meta.url));

/* Une page minimale : de quoi qu'un script « lise » le décor sans rien casser. Marqueur de Kevin posé (le chemin sans réseau). */
function page(js) {
  const ajoutes = [];
  const g = {
    document: { cookie: 'kdmc_k=1', title: 'Test', body: { appendChild: (e) => { ajoutes.push(e); } }, documentElement: { appendChild: (e) => { ajoutes.push(e); } },
      getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, visibilityState: 'hidden',
      createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, addEventListener() {}, setAttribute2() {} }) },
    localStorage: { getItem: () => null, setItem() {} }, location: { hostname: 'lingua.kd-mc.com', pathname: '/', origin: 'https://lingua.kd-mc.com', href: 'https://lingua.kd-mc.com/' },
    innerWidth: 390, innerHeight: 800, addEventListener() {}, setInterval() { return 0; }, fetch: () => new Promise(() => {}), Promise, JSON, Math, Date, String, Number, Object,
  };
  g.window = g; g.self = g; g.top = g;
  vm.createContext(g);
  try { vm.runInContext(js, g, { timeout: 2000 }); } catch (e) { return { g, ajoutes, exc: String(e && e.message) }; }
  return { g, ajoutes, exc: '' };
}
/* Ce que le paquetage fait : un appel `__name(...)` dès l'entrée du code (après `try {`), comme `__name(bas, "bas")` du vrai fichier servi. */
const avecNom = (js) => js.replace('try {', 'try { __name(function () {}, "x");');

/* ───── 1. l'aide est définie par le script servi lui-même ───── */
ok(NOM_AIDE === 'var __name=function(f){return f};', '1a. l\'aide __name est définie (une seule source, dans bee-partout.js)');
ok(PARTOUT_JS.startsWith('(function(){' + NOM_AIDE), '1b. PARTOUT_JS commence par définir __name', PARTOUT_JS.slice(0, 80));
ok(BOUTON_JS.startsWith('(function(){' + NOM_AIDE), '1c. BOUTON_JS commence par définir __name', BOUTON_JS.slice(0, 80));
ok(PARTOUT_JS.includes(partout.toString()) && BOUTON_JS.includes(bouton.toString()), '1d. les deux scripts servis contiennent bien la fonction elle-même');

/* ───── 2. même transformé, le script se lance ───── */
{
  const r = page(avecNom(PARTOUT_JS));
  ok(r.g.__kdmcBee === 1 && r.ajoutes.length === 1, '2a. Bee (transformé par le paquetage) se lance et pose son cadre', `exc=${r.exc} __kdmcBee=${r.g.__kdmcBee} cadres=${r.ajoutes.length}`);
}
{
  const r = page(avecNom(BOUTON_JS));
  ok(r.g.__kdmcBoite === 1, '2b. le bouton ✉️ / « ← Portail » (transformé par le paquetage) se lance', `exc=${r.exc} __kdmcBoite=${r.g.__kdmcBoite}`);
}
/* Sans paquetage non plus : le script brut doit rester sain (le shim ne casse rien). */
ok(page(PARTOUT_JS).g.__kdmcBee === 1 && page(BOUTON_JS).g.__kdmcBoite === 1, '2c. non transformé : les deux se lancent aussi');

/* ───── 3. contrôle : SANS l'aide, la panne est visible par ce test ───── */
{
  const sans = (js) => js.replace(NOM_AIDE, '');
  ok(page(avecNom(sans(PARTOUT_JS))).g.__kdmcBee !== 1, '3a. CONTRÔLE : Bee sans l\'aide ne se lance PAS (c\'est la panne réelle du 17.10)');
  ok(page(avecNom(sans(BOUTON_JS))).g.__kdmcBoite !== 1, '3b. CONTRÔLE : le bouton sans l\'aide ne se lance PAS');
}

/* ───── 4. le VRAI esbuild « keep_names », s'il est là ───── */
function trouverEsbuild() {
  const cand = [join(ICI, '../../node_modules/.bin/esbuild'), join(ICI, 'node_modules/.bin/esbuild'), '/tmp/esb/node_modules/.bin/esbuild'];
  return cand.find((c) => existsSync(c)) || '';
}
const esb = trouverEsbuild();
if (!esb) console.log('  ⏭  4. esbuild absent : paquetage réel non rejoué ici (les contrôles 2 et 3 simulent exactement ce qu\'il écrit)');
else {
  const tmp = mkdtempSync(join(tmpdir(), 'js-servis-'));
  const empaquete = async (src, nom) => {
    const out = join(tmp, nom + '.mjs');
    execFileSync(esb, [join(ICI, src), '--bundle', '--format=esm', '--keep-names', '--outfile=' + out, '--log-level=error']);
    return import(pathToFileURL(out).href);
  };
  const mp = await empaquete('bee-partout.js', 'p'), mb = await empaquete('boite-bouton.js', 'b');
  ok(/__name\(/.test(mp.PARTOUT_JS) && /__name\(/.test(mb.BOUTON_JS), '4a. le vrai paquetage ajoute bien des __name( dans le texte servi (la panne est reproduite)');
  ok(page(mp.PARTOUT_JS).g.__kdmcBee === 1, '4b. VRAI esbuild : Bee se lance', page(mp.PARTOUT_JS).exc);
  ok(page(mb.BOUTON_JS).g.__kdmcBoite === 1, '4c. VRAI esbuild : le bouton se lance', page(mb.BOUTON_JS).exc);
}

/* ───── 5. câblage : le routeur sert bien ces textes-là ───── */
const W = readFileSync(join(ICI, 'worker.js'), 'utf8'), B = readFileSync(join(ICI, 'boite.js'), 'utf8');
ok(/new Response\(BOUTON_JS/.test(B), '5a. /__boite/bouton.js sert BOUTON_JS tel quel');
ok(/handlePartout\(/.test(W) && /PARTOUT_JS/.test(readFileSync(join(ICI, 'bee-partout.js'), 'utf8')), '5b. le routeur passe par handlePartout, qui sert PARTOUT_JS');

console.log(`\n${pass} ✓ / ${fail} ✗`);
process.exit(fail ? 1 : 0);
