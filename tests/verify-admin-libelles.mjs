/* GARDE — libellés de l'admin sans ambiguïté (Kevin 23.10.2026, photo de kd-mc.com/admin/ : « 0 connecté(s) » alors qu'il est connecté,
 * « + 20 alerte(s) » sous « Messages non lus = 0 »). Le chiffre « connectés » compte les AUTRES : écrit « Toi seul en ligne » / « N autre(s) en ligne » ;
 * les alertes sont dites « automatiques, pas des personnes ». SABOTAGE intégré : l'ancien texte remis doit faire rougir.   node tests/verify-admin-libelles.mjs */
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../kdmc-home/admin/tableau.js', import.meta.url), 'utf8');
function verifier(s) {
  const r = [];
  r.push([/Toi seul en ligne/.test(s) && /autre\(s\) en ligne/.test(s), 'tuile « Personnes & comptes » : « Toi seul en ligne » / « N autre(s) en ligne »']);
  r.push([!/\+ ' connecté\(s\)'/.test(s) && !/' personne\(s\) connectée\(s\)'/.test(s), "plus de « 0 connecté(s) » ambigu"]);
  r.push([/alerte\(s\) automatique\(s\), pas des personnes/.test(s), 'les alertes sont dites automatiques, pas des personnes']);
  return r;
}
let fails = 0;
for (const [c, m] of verifier(src)) { if (!c) fails++; console.log((c ? 'OK   ' : 'FAIL ') + m); }
const sab = src.replace("(b.connectes ? b.connectes + ' autre(s) en ligne' : 'Toi seul en ligne')", "(b.connectes || 0) + ' connecté(s)'").replace(" alerte(s) automatique(s), pas des personnes'", " alerte(s)'");
const rouges = verifier(sab).filter(([c]) => !c).length;
console.log((rouges >= 2 ? 'OK   ' : 'FAIL ') + 'sabotage (ancien texte) : ' + rouges + ' contrôle(s) rouge(s)'); if (rouges < 2) fails++;
console.log(fails ? '❌ libellés admin : ' + fails + ' échec(s)' : '✅ libellés admin clairs'); process.exit(fails ? 1 : 0);
