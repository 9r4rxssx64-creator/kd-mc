/* GARDE — un harnais qui simule CMCteams bloque les service workers (leçon #380, mesurée le 1.10.2026)
 *
 * Mesuré : `test:donnees-rh-app` 12/12 chez l'agent, rouge au coffre (run 36874003734). Même Playwright 1.56,
 * même Chromium 1194. La différence est le RÉSEAU : `navigator.serviceWorker.register('./sw.js')` et les requêtes
 * d'un service worker ne passent PAS par `ctx.route`. Chez l'agent (réseau fermé) l'enregistrement échoue → pas de
 * SW. En CI (réseau ouvert) le navigateur télécharge le VRAI `cmcteams.kd-mc.com/sw.js` (production), qui pré-cache
 * le vrai `/index.html`, prend le contrôle (`clients.claim`) et sert chaque recharge depuis la production, en
 * contournant le harnais : le test mesure alors le site en ligne au lieu du code de la branche.
 * Reproduit en local (serveur HTTPS + --host-resolver-rules) : sans blocage, 17 requêtes échappent au harnais
 * après une recharge ; avec `serviceWorkers: 'block'`, zéro.
 *
 * Règle : tout fichier de tests/ qui (a) ouvre un contexte Playwright, (b) répond lui-même aux requêtes
 * (`fulfill(`) et (c) simule l'origine `https://cmcteams.kd-mc.com` doit passer `serviceWorkers: 'block'` à CHAQUE
 * `newContext(`. Hors champ : un outil qui regarde le vrai site sans rien servir (`verif-live-rapport`), et un test
 * qui sert l'app depuis 127.0.0.1 pour éprouver le vrai SW (`verify-background-sync-benin`).
 * SABOTAGE prouvé : retirer `serviceWorkers: 'block'` d'un `newContext(` de verify-boot-sobre.mjs → rouge.
 * node tests/verify-harnais-sans-sw.mjs */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };

const fichiers = readdirSync('tests').filter((f) => f.endsWith('.mjs') && f !== 'verify-harnais-sans-sw.mjs').map((f) => 'tests/' + f);
/* Deux familles de harnais exposés :
 *   A. ceux qui simulent l'origine https://cmcteams.kd-mc.com et répondent eux-mêmes (fulfill) ;
 *   B. ceux qui servent l'app depuis un serveur local (createServer) ET simulent par ctx.route un hôte EXTERNE que le
 *      SW relaie (workers.dev, *.kd-mc.com) — mesuré le 1.10 : test:secrets-cmc et test:fiches-privees « flottants » en CI
 *      parce que le SW refaisait leurs fetch vers le VRAI apex-auth-worker.
 * Exemptions écrites, avec leur raison : un test qui éprouve le vrai SW ne peut pas le bloquer. */
const TOLERES = {
  'tests/verify-background-sync-benin.mjs': 'éprouve le vrai SW : reg.sync.register() refusé ne doit pas tuer l\'app',
  'tests/verify-maj-forcee-reelle.mjs': 'éprouve la MAJ forcée AVEC le SW qui contrôle la page (controllerchange → reload)',
};
const estA = (s) => /fulfill\(/.test(s) && /https:\/\/cmcteams\.kd-mc\.com/.test(s);
const estB = (s) => /createServer\(/.test(s) && /route\((\/[^/\n]*workers\\\.dev|\/[a-z-]*\\\.kd-mc|'https:\/\/[a-z-]*\.kd-mc\.com|\/apex-)/.test(s);
const harnais = fichiers.filter((f) => { if (TOLERES[f]) return false; const s = readFileSync(f, 'utf8'); return /newContext\(/.test(s) && (estA(s) || estB(s)); });
for (const f of Object.keys(TOLERES)) if (existsSync(f)) console.log(`  ℹ️  exempté : ${f} — ${TOLERES[f]}`);
/* au coffre les 5 harnais sont là ; au dépôt public, ceux qui lisent index.html (CMCteams) restent au coffre */
const auCoffre = existsSync('tests/verify-donnees-rh-app.mjs');
ok(harnais.length >= (auCoffre ? 12 : 1), `${harnais.length} harnais exposés (attendu ≥ ${auCoffre ? 12 : 1}${auCoffre ? ' : 5 de la famille A + secrets-cmc, fiches-privees, ecritures-cmc, finances ×4, javis-bee-reelle, light-equipes-firebase' : ' au dépôt public'})`, harnais.join(', '));
for (const f of harnais) {
  const s = readFileSync(f, 'utf8');
  /* chaque newContext( … ) doit porter serviceWorkers: 'block' — soit dans ses accolades, soit via une constante
   * déclarée dans le fichier (ex. `const CTX = { serviceWorkers: 'block' }` puis `newContext(CTX)`). */
  const constantes = new Set([...s.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*\{[^}]*serviceWorkers:\s*'block'/g)].map((m) => m[1]));
  const appels = [...s.matchAll(/newContext\(([^;]*?)\)\s*;/g)];
  const fautifs = appels.filter((m) => { const arg = m[1].trim(); if (!arg) return true; if (/serviceWorkers:\s*'block'/.test(arg)) return false; return !constantes.has(arg); });
  ok(appels.length > 0 && fautifs.length === 0, `${f} : ${appels.length} newContext( — tous avec serviceWorkers: 'block'`, fautifs.map((m) => 'newContext(' + m[1].trim().slice(0, 60) + ')').join(' | '));
}
console.log(`\n${pass} OK / ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
