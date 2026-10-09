/* GARDE — LES BOUTIQUES SONT FERMÉES DANS LE FICHIER DE RÈGLES (audit 2026-10-08).
 *
 * Trouvé le 8.10 dans firebase-rules-apex.json : products .write ouvert (« hasChildren » seulement),
 * logos .write: true, selection .read: true et .write sans jeton, orders .read: true (n'importe qui
 * lisait les commandes). Le verrou n'existait que dans un bloc annexe (_phase_shops_rolelock),
 * appliqué ou non à la publication selon une variable d'environnement.
 *
 * Ce garde lit les nœuds shops_admin_v1 et shops_sourcing_v1 du FICHIER et échoue si un .read ou
 * un .write vaut true, ou est une chaîne qui n'exige pas `auth.token.role`. Exceptions JUSTIFIÉES,
 * une par une (toute autre ouverture fait échouer) :
 *   · products/.read, logos/.read   : le catalogue publié se LIT par les clients (lecture seule) ;
 *   · ld_wiped_v1/.read             : drapeau lu par la page La Détente (sa .write est false) ;
 *   · orders/$shop/$orderId/.write  : le checkout CLIENT écrit une commande, une seule fois
 *                                     (« !data.exists() »), jamais réécrite — exigence du script
 *                                     de publication, qui refuse un role:admin ici.
 *
 * Lancer : node tests/verify-firebase-rules-fermees.mjs [chemin-du-fichier]
 */
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FICHIER = resolve(process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..', 'firebase-rules-apex.json'));
let ok = 0, ko = 0;
const dis = (b, m) => { b ? ok++ : ko++; console.log(`  ${b ? '✅' : '❌'} ${m}`); };
console.log('\nRègles Firebase des boutiques fermées (' + FICHIER + ')\n');

let doc;
try { doc = JSON.parse(readFileSync(FICHIER, 'utf8')); dis(true, 'JSON valide'); }
catch (e) { dis(false, 'JSON invalide : ' + e.message); console.log(`\n${ok} OK / ${ko} échec(s)`); process.exit(1); }
const r = doc.rules || {};
dis(r['.read'] === false && r['.write'] === false, 'deny racine conservé');

const ROLE = /auth\s*!=\s*null\s*&&\s*(?:auth\.token\.role\s*===?\s*'admin'|\(auth\.token\.role\s*===?\s*'admin'\s*\|\|\s*auth\.token\.role\s*===?\s*'shops'\))/;   /* 8.10 : le rôle « shops » (Laurence) est accepté sur ces nœuds, et seulement là */
const EXCEPTIONS = {
  'shops_admin_v1/products/.read': (v) => v === true,
  'shops_admin_v1/logos/.read': (v) => v === true,
  'shops_admin_v1/ld_wiped_v1/.read': (v) => v === true,
  'shops_admin_v1/orders/$shop/$orderId/.write': (v) => typeof v === 'string' && /!data\.exists\(\)/.test(v) && !/role/.test(v),
};
const ouverts = []; let regles = 0;
function marche(n, chemin) {
  if (!n || typeof n !== 'object') return;
  for (const k of Object.keys(n)) {
    if (k === '.read' || k === '.write') {
      regles++;
      const v = n[k], c = chemin + '/' + k;
      if (v === false) continue;                               /* fermé : rien à redire */
      if (EXCEPTIONS[c]) { if (!EXCEPTIONS[c](v)) ouverts.push(c + ' = ' + JSON.stringify(v) + ' (exception mal formée)'); continue; }
      if (v === true || v === 'true' || typeof v !== 'string' || !ROLE.test(v)) ouverts.push(c + ' = ' + JSON.stringify(v));
      continue;
    }
    if (k.startsWith('.') || k.startsWith('_')) continue;
    marche(n[k], chemin + '/' + k);
  }
}
for (const racine of ['shops_admin_v1', 'shops_sourcing_v1']) {
  dis(!!r[racine], 'nœud ' + racine + ' présent');
  marche(r[racine], racine);
}
dis(regles >= 8, `règles lues sous les boutiques : ${regles}`);
dis(ouverts.length === 0, 'aucune lecture/écriture ouverte ou sans rôle admin' + (ouverts.length ? '\n     ' + ouverts.join('\n     ') : ''));
/* Les quatre points de l'audit, nommément. */
const g = (p) => p.split('/').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), r);
dis(ROLE.test(String(g('shops_admin_v1/orders/.read'))), 'orders : lecture au rôle admin seulement');
dis(ROLE.test(String(g('shops_admin_v1/products/$shop/$id/.write'))), 'products : écriture au rôle admin');
dis(ROLE.test(String(g('shops_admin_v1/logos/$shop/$id/.write'))), 'logos : écriture au rôle admin');
dis(ROLE.test(String(g('shops_sourcing_v1/selection/.read'))) && ROLE.test(String(g('shops_sourcing_v1/selection/$id/.write'))), 'selection : lecture ET écriture au rôle admin');
dis(/!data\.exists\(\)/.test(String(g('shops_admin_v1/orders/$shop/$orderId/.write'))), 'les commandes clients restent possibles (checkout anonyme, une seule fois)');

console.log(`\n${ok} OK / ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
