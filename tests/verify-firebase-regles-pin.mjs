/* GARDE — « LES EMPREINTES DE CODE APEX NE SE LISENT NI NE S'ÉCRIVENT DEPUIS UN CLIENT » (leçon #559, 16.10.2026).
 *
 * MESURÉ le 16.10 : apex-ai/v13 obtient des jetons Firebase ANONYMES avec la clé Web publique (ensureAnonToken),
 * et les règles donnaient /apex en lecture à « auth != null » et /apex/$key en écriture à « auth != null » :
 * n'importe qui pouvait lire l'empreinte du code de Kevin (/apex/ax_pin_kdmc_admin), ou l'ÉCRASER, puis obtenir
 * du worker /login un jeton admin. Firebase ne sait pas retirer à un enfant ce qu'un parent accorde : la lecture
 * doit donc être donnée PAR CLÉ, et exclure ax_pin_.
 *
 * Ce garde lit le fichier publié (firebase-rules-apex.json), le script qui le publie, le worker et l'app :
 *   1. /apex sans .read au parent ; /apex/$key .read ET .write excluent ax_pin_ ;
 *   2. le script de publication refuse un fichier qui rouvrirait /apex au parent ;
 *   3. le worker a le guichet /pin/init (premier code, jamais remplacé) ; l'app ne fait plus de PUT direct ;
 *   4. sabotage : chaque contrôle rougit quand on retire la protection.
 * node tests/verify-firebase-regles-pin.mjs */
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}`); };
const lire = (f) => readFileSync(f, 'utf8');

export function controles(src) {
  const regles = JSON.parse(src.regles).rules;
  const apex = regles.apex || {};
  const cle = apex.$key || {};
  const exclut = (v) => /^auth != null && !\$key\.matches\(\/\^ax_pin_\/\)$/.test(String(v));
  return [
    [apex['.read'] === undefined, '1. /apex : aucun .read au parent (sinon un enfant ne peut plus être fermé)'],
    [exclut(cle['.read']), '1b. /apex/$key .read = « auth != null » SAUF ax_pin_'],
    [exclut(cle['.write']), '1c. /apex/$key .write = « auth != null » SAUF ax_pin_'],
    [Object.keys(apex).every((k) => !/^ax_pin_/.test(k) || (apex[k]['.read'] === false && apex[k]['.write'] === false)), '1d. aucune clé ax_pin_* rouverte à la main'],
    [/ne doit plus porter de \.read au parent/.test(src.deploy) && /ax_pin_/.test(src.deploy), '2. le script de publication refuse un /apex rouvert au parent'],
    [/url\.pathname === "\/pin\/init"/.test(src.worker) && /pin_already_set/.test(src.worker) && /(rtdb|ecrire)\(env, ctx, "PUT", `apex\/ax_pin_/.test(src.worker) && /export async function pinInit/.test(src.worker), '3. worker : guichet /pin/init, premier arrivé, jamais remplacé (409)'],
    [/\/pin\/init/.test(src.bridge) && !/\/apex\/ax_pin_\$\{encodeURIComponent\(uid\)\}\.json/.test(src.bridge), '3b. l\'app passe par le guichet, plus de PUT direct dans /apex/ax_pin_'],
  ];
}

const src = {
  regles: lire('firebase-rules-apex.json'),
  deploy: lire('tools/firebase/deploy-rules.cjs'),
  worker: lire('services/apex-auth-worker/src/index.js'),
  bridge: lire('apex-ai/v13/services/auth/firebase-auth-bridge.ts'),
};
for (const [c, m] of controles(src)) ok(c, m);

/* 4. sabotage */
const sab = [
  ['regles', (s) => { const d = JSON.parse(s); d.rules.apex['.read'] = 'auth != null'; return JSON.stringify(d); }, 0],
  ['regles', (s) => { const d = JSON.parse(s); d.rules.apex.$key['.read'] = 'auth != null'; return JSON.stringify(d); }, 1],
  ['regles', (s) => { const d = JSON.parse(s); d.rules.apex.$key['.write'] = 'auth != null'; return JSON.stringify(d); }, 2],
  ['regles', (s) => { const d = JSON.parse(s); d.rules.apex.ax_pin_kdmc_admin = { '.read': 'auth != null' }; return JSON.stringify(d); }, 3],
  ['deploy', (s) => s.replace('ne doit plus porter de .read au parent', 'x'), 4],
  ['worker', (s) => s.replace('url.pathname === "/pin/init"', 'url.pathname === "/jamais"'), 5],
  ['bridge', (s) => s.replace("this.workerUrl() + '/pin/init'", '`${this.fbUrl()}/apex/ax_pin_${encodeURIComponent(uid)}.json`'), 6],
];
for (const [k, f, i] of sab) {
  const casse = { ...src, [k]: f(src[k]) };
  ok(casse[k] !== src[k] && controles(casse)[i][0] === false, '4. sabotage « ' + controles(src)[i][1].slice(0, 58) + '… » → rouge');
}
console.log(`\n${pass} OK / ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
