/* GARDE — un test défini est un test lancé (10.10.2026).
 * Vécu : en fusionnant main, la garde `test:arbre-maj-auto` est restée DÉFINIE dans package.json mais est sortie de `test:ci`
 * (elle suivait la dernière étape, sans « && » derrière : le remplacement automatique n'a rien trouvé). 402 étapes vertes, une
 * garde de main en moins, et personne ne l'aurait vu (leçon #488).
 * Règle : tout script « test:* » défini est dans `test:ci`, sauf la liste FIGÉE ci-dessous (anciens tests hors chaîne au 10.10.2026).
 * Cette liste ne doit que RÉTRÉCIR. node tests/verify-tests-dans-ci.mjs */
import { readFileSync } from 'node:fs';

const HORS_CHAINE_10_10 = new Set(['test:runtime', 'test:encadres', 'test:pitboss', 'test:teamhistory', 'test:v639', 'test:v650', 'test:kevin',
  'test:badge', 'test:scoped', 'test:agents', 'test:bridge', 'test:autoupdate', 'test:guards', 'test:pin', 'test:handoff', 'test:master', 'test:v702',
  'test:v702-import-e2e', 'test:v702-safety', 'test:v719', 'test:teamsizes', 'test:monaco', 'test:crypto-bot', 'test:bot-ia', 'test:ci-prive',
  'test:comptes-reparer-nom', 'test:connecteurs']);

const sc = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts;
const etapes = new Set(sc['test:ci'].match(/test:[\w-]+/g) || []);
let ko = 0;
const oubliees = Object.keys(sc).filter((k) => k.startsWith('test:') && k !== 'test:ci' && !etapes.has(k) && !HORS_CHAINE_10_10.has(k));
if (oubliees.length) { ko++; console.log('❌ défini(s) mais jamais lancé(s) par test:ci : ' + oubliees.join(', ') + '\n   → ajouter « && npm run <nom> » dans test:ci'); }
const fantomes = [...etapes].filter((k) => !sc[k]);
if (fantomes.length) { ko++; console.log('❌ test:ci appelle des scripts qui n\'existent pas : ' + fantomes.join(', ')); }
const revenus = [...HORS_CHAINE_10_10].filter((k) => etapes.has(k));
if (revenus.length) console.log('ℹ️ revenu(s) dans la chaîne, à retirer de la liste figée : ' + revenus.join(', '));
console.log(ko ? `❌ tests-dans-ci : ${ko} problème(s)` : `✅ tests-dans-ci : ${etapes.size} étapes, aucun test défini hors chaîne (liste figée : ${HORS_CHAINE_10_10.size})`);
process.exit(ko ? 1 : 0);
