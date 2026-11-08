/* Kevin 8.11.2026 : « La marionnette est très moche » (capture : Bee 3D de Lingua, brune, raide, sans ailes lisibles).
 * Dans Lingua, Bee reste le dessin animé 2D (ailes, visage souriant) : le moteur 3D n'est pas chargé. Un seul interrupteur :
 * `window.KDMC_PERSO3D=false` posé AVANT marionnette.js (prefere3D() le lit). Rouge si la ligne disparaît ou passe après. */
import fs from 'node:fs';
let n = 0, ko = 0;
const chk = (c, l) => { n++; if (!c) ko++; console.log((c ? '  ✅ ' : '  ❌ ') + l); };
const html = fs.readFileSync('lingua/index.html', 'utf8');
const iFlag = html.indexOf('window.KDMC_PERSO3D=false');
const iMar = html.search(/<script src="marionnette\.js/);
chk(iFlag > 0, 'Lingua pose window.KDMC_PERSO3D=false');
chk(iMar > 0 && iFlag > 0 && iFlag < iMar, 'la ligne est AVANT marionnette.js (sinon prefere3D() ne la voit pas)');
const mar = fs.readFileSync('lingua/marionnette.js', 'utf8');
chk(/window\.KDMC_PERSO3D === false/.test(mar), 'marionnette.js lit bien KDMC_PERSO3D === false (sinon la ligne ne sert à rien)');
console.log(`\n${n - ko}/${n} contrôles OK`);
process.exit(ko ? 1 : 0);
