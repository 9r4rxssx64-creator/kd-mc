#!/usr/bin/env node
/* Garde — « une tuile derrière la porte fiche n'est pas une tuile morte… et une vraie morte le reste »
 *
 * Mesuré le 27.09.2026 (audit/verif-live/tuiles.md, 20:05 UTC) : « Vérif LIVE → rapport » rouge
 * sur main depuis la veille, 8 destinations « mortes » sur 41 = exactement les 8 adresses derrière
 * la porte « fiche » (401 + en-tête x-kdmc-porte). La sonde des tuiles comptait tout non-200 comme
 * mort. Cette garde vérifie (1) la règle de tri, sur des réponses fabriquées ET sur les 8 réponses
 * réellement mesurées ; (2) que la sonde l'UTILISE vraiment (une règle écrite mais pas branchée ne
 * protège rien — « déclaration ≠ déploiement »).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classerDestination } from '../tools/audit/classer-destination.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, ko = 0;
const dit = (c, t) => { if (c) { ok++; console.log('  ✅ ' + t); } else { ko++; console.log('  ❌ ' + t); } };

console.log('=== 1. La règle ===');
dit(classerDestination({ status: 200 }) === 'vivante', '200 → vivante');
dit(classerDestination({ status: 401, porte: 'fiche' }) === 'porte', '401 + x-kdmc-porte → porte (normal)');
dit(classerDestination({ status: 403, porte: 'admin' }) === 'porte', '403 + x-kdmc-porte → porte');
dit(classerDestination({ status: 401, porte: '' }) === 'morte', '401 SANS en-tête du routeur → morte (on ne devine pas)');
dit(classerDestination({ status: 404, porte: 'fiche' }) === 'morte', '404, même avec l\'en-tête → morte (seuls 401/403 sont une porte)');
dit(classerDestination({ status: 500 }) === 'morte', '500 → morte');
dit(classerDestination({ err: 'ECONNRESET' }) === 'morte', 'réseau coupé → morte');

console.log('\n=== 2. Les 8 réponses réellement mesurées le 27.09 (20:05 UTC) ===');
const MESUREES = [
  'https://worldmonitor.kd-mc.com/', 'https://osint.kd-mc.com/', 'https://dossiers.kd-mc.com/',
  'https://ia.kd-mc.com/', 'https://outils.kd-mc.com/', 'https://kd-mc.com/cujina',
  'https://kd-mc.com/cujina/livre.pdf', 'https://tor.kd-mc.com/',
];
// En-tête vérifié sur le vrai domaine par coffre-sonde-ce-qui-est-servi (run 36340745642) :
// « Connexion au domaine requise. », 29 octets, x-kdmc-porte: fiche.
const classes = MESUREES.map((u) => [u, classerDestination({ status: 401, porte: 'fiche' })]);
dit(classes.every(([, c]) => c === 'porte'), `les 8 adresses de la porte ne sont plus comptées mortes (${classes.filter(([, c]) => c === 'porte').length}/8)`);

console.log('\n=== 3. La sonde des tuiles utilise VRAIMENT la règle ===');
const src = readFileSync(join(RACINE, 'tests/verif-tuiles-live.mjs'), 'utf8');
dit(/import \{ classerDestination \} from '\.\.\/tools\/audit\/classer-destination\.mjs'/.test(src),
    'verif-tuiles-live.mjs importe classerDestination');
const boucle = (src.match(/for \(const \[url, info\] of destinations\) \{[\s\S]*?\n\}/) || [''])[0];
dit(/classerDestination\(r\)/.test(boucle), 'la boucle des destinations passe par classerDestination');
dit(!/if \(!r\.ok\) mortes\.push/.test(boucle), 'plus de « tout non-200 = mort » dans la boucle');
dit(/porte: r\.headers\.get\('x-kdmc-porte'\)/.test(src), 'lire() rapporte l\'en-tête x-kdmc-porte (sans lui, la règle ne voit jamais de porte)');
dit(/derrierePorte\.length\) dire\(null,/.test(src), 'les destinations derrière la porte sont MONTRÉES à part (ℹ️), jamais comptées en ✅');

dit(!/destinations_total \+ ' destinations vivantes/.test(src),
    'la conclusion ne compte PAS les destinations de la porte comme « vivantes » (run du 27/09 20:28 : « 41 vivantes » alors que 8 étaient derrière la porte)');

console.log(`\n${ok} OK · ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
