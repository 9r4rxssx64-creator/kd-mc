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
const harnais = fichiers.filter((f) => { const s = readFileSync(f, 'utf8'); return /newContext\(/.test(s) && /fulfill\(/.test(s) && /https:\/\/cmcteams\.kd-mc\.com/.test(s); });
/* au coffre les 5 harnais sont là ; au dépôt public, ceux qui lisent index.html (CMCteams) restent au coffre */
const auCoffre = existsSync('tests/verify-donnees-rh-app.mjs');
ok(harnais.length >= (auCoffre ? 5 : 1), `${harnais.length} harnais simulent cmcteams.kd-mc.com (attendu ≥ ${auCoffre ? 5 : 1}${auCoffre ? ' : admin-sans-code, bee-comportements, boot-sobre, compte-unique-portail, donnees-rh-app' : ' au dépôt public'})`, harnais.join(', '));
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
