/* GARDE — liens.json (lu par Bee) = liens.js (affiché à Kevin) : une seule source, le JSON est GÉNÉRÉ (Kevin 13.10 : « tous les liens, outils… comme toi et Apex »).
 *   1. liens.json est EXACTEMENT ce que tools/liens/exporter.mjs fabrique depuis liens.js (sinon : relance l'exporteur) ;
 *   2. il a des familles et des éléments, chaque adresse est en https, aucun élément sans nom ni adresse ;
 *   3. aucun secret (clé, jeton, clé privée) ;
 *   4. sabotage : une modification de liens.js est VUE (le contrôle 1 devient rouge) ; un littéral abîmé fait échouer l'exporteur au lieu de publier un JSON vide.
 * node tests/verify-liens-json.mjs */
import fs from 'node:fs';
import { fabriquer, SOURCE, CIBLE } from '../tools/liens/exporter.mjs';

let ok = 0, ko = 0;
const chk = (c, m, d) => { if (c) { ok++; console.log('  ✅ ' + m); } else { ko++; console.log('  ❌ ' + m + (d ? ' — ' + d : '')); } };
const src = fs.readFileSync(SOURCE, 'utf8');
const attendu = fabriquer(src);
const actuel = fs.existsSync(CIBLE) ? fs.readFileSync(CIBLE, 'utf8') : '';
chk(actuel === attendu, '1. liens.json = ce que fabrique l\'exporteur depuis liens.js (aucune dérive)', 'lance : node tools/liens/exporter.mjs');
const j = JSON.parse(actuel || '{"familles":[]}');
const items = j.familles.flatMap((f) => f.items.map((e) => Object.assign({ famille: f.titre }, e)));
chk(j.familles.length >= 8 && items.length >= 40, '2. ' + j.familles.length + ' familles, ' + items.length + ' éléments');
const adresses = items.flatMap((e) => (e.url ? [e.url] : []).concat((e.liens || []).map((x) => x.u)));
chk(adresses.length >= 60 && adresses.every((u) => /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(?:[/?#:].*)?$/i.test(u)), '2b. ' + adresses.length + ' adresses, toutes en https', adresses.filter((u) => !/^https:\/\//.test(u)).slice(0, 3).join(' '));
chk(items.every((e) => e.nom && (e.url || (e.liens && e.liens.length))), '2c. chaque élément a un nom et une adresse', items.filter((e) => !(e.nom && (e.url || (e.liens && e.liens.length)))).map((e) => e.nom).join(','));
chk(!/sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|xox[bp]-|AIza[0-9A-Za-z_-]{30,}|-----BEGIN [A-Z ]*PRIVATE|eyJ[A-Za-z0-9_-]{30,}\./.test(actuel), '3. aucun secret dans liens.json');
/* sabotage */
const modifie = src.replace("nm: 'CMCteams'", "nm: 'CMCteams-MODIFIE'");
chk(modifie !== src && fabriquer(modifie) !== actuel, '4. sabotage : un lien modifié dans liens.js rend le contrôle 1 ROUGE (la dérive est vue)');
let jete = false; try { fabriquer(src.replace('var DATA = [', 'var AUTRE = [')); } catch (e) { jete = /introuvable/.test(e.message); }
chk(jete, '4b. sabotage : liens.js sans « var DATA » → l\'exporteur ÉCHOUE (pas de JSON vide publié)');
let abime = false; try { fabriquer(src.replace(/\n  \];\n/, '\n')); } catch (e) { abime = true; }
chk(abime, '4c. sabotage : littéral non fermé → l\'exporteur ÉCHOUE');
console.log(`\n${ok} ✅ / ${ko} ❌`);
process.exit(ko ? 1 : 0);
