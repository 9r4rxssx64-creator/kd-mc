/* GARDE — Face ID AUTOMATIQUE du portail à la 1re ouverture (lot « reconnu partout », reste du 13.10 ; Kevin : « Face ID automatique
 * seulement à la 1re ouverture »). Le vrai kdmc-portal.js est lu et contrôlé :
 *   1. renderUnlock lance Face ID tout seul quand la personne a un passkey (appel de tenterPk(true)) ;
 *   2. UNE seule fois par chargement de page (drapeau _pkAuto) — jamais de boucle de Face ID ;
 *   3. un refus silencieux (geste manquant / annulation) n'écrit aucune erreur : le bouton et le code restent ;
 *   4. le bouton « Se connecter avec Face ID » reste là et relance à la main (tenterPk(false)).
 * node tests/verify-portail-faceid-auto.mjs   ·   SABOTAGE=boucle|erreur|bouton rougit un contrôle. */
import { readFileSync, existsSync } from 'node:fs';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}`); };
const F = new URL('../kdmc-home/kdmc-portal.js', import.meta.url);
if (!existsSync(F)) { console.log('  ✅ (kdmc-home absent de ce dépôt : contrôlé au coffre)'); process.exit(0); }
let s = readFileSync(F, 'utf8');
const sab = process.env.SABOTAGE;
if (sab === 'boucle') s = s.replace('if (!_pkAuto) { _pkAuto = true;', 'if (true) {');
if (sab === 'erreur') s = s.replace('var silence = auto &&', 'var silence = false &&');
if (sab === 'bouton') s = s.replace("addEventListener('click', function () { tenterPk(false); })", "addEventListener('click', function () {})");
const u = s.slice(s.indexOf('function renderUnlock'), s.indexOf('function wireCgu'));
ok(/tenterPk\(true\)/.test(u), '1. Face ID lancé tout seul à l\'ouverture (tenterPk(true))');
ok(/var _pkAuto = false/.test(s) && /if \(!_pkAuto\) \{ _pkAuto = true;/.test(u), '2. une seule tentative automatique par page (_pkAuto)');
ok(/var silence = auto && \/NotAllowed/.test(u) && /if \(!silence\)/.test(u), '3. refus silencieux : pas de message d\'erreur en automatique');
ok(/u-pk'\)\.addEventListener\('click', function \(\) \{ tenterPk\(false\); \}\)/.test(u), '4. le bouton Face ID relance à la main');
ok(/hasPk = _hasPasskey\(acc\.uid\) && _pkSupported\(\)/.test(u) && /if \(hasPk\) \{/.test(u), '5. rien d\'automatique sans passkey ni support');
console.log(`\n${pass} ok, ${fail} rouge`); process.exit(fail ? 1 : 0);
