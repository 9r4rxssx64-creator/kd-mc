#!/usr/bin/env node
/* Garde du robot « toutes les fonctions d'Apex Chat » (Kevin 21.10.2026). Il écrit dans un journal PUBLIC et crée DEUX comptes de test :
 * (1) manuel seulement, sans cron, secret par env ; (2) les deux comptes de test sont TOUJOURS supprimés (finally) ; (3) ni code ni jeton au journal ;
 * (4) les comptes s'appellent « Temps Reel… » (jamais le nom de quelqu'un) ; (5) aucune route admin hors liste ; (6) --sabotage : chaque règle rougit. */
import { readFileSync } from 'node:fs';
const lire = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
let ok = 0, ko = 0;
const t = (c, m) => { if (c) { ok++; console.log('  ✅ ' + m); } else { ko++; console.log('  ❌ ' + m); } };
export function regles(wf, js) {
  const w = wf.replace(/^\s*#.*$/gm, '');
  return {
    'workflow : à la main seulement (workflow_dispatch, jamais de cron ni de push)': /workflow_dispatch:/.test(w) && !/schedule:/.test(w) && !/^\s+(push|pull_request):/m.test(w),
    'workflow : le code admin vient du secret, par env': /KDMC_ADMIN_PIN_SHA256:\s*\$\{\{\s*secrets\.APEX_ADMIN_PIN_SHA256\s*\}\}/.test(w) && !/run:[^\n]*\$\{\{\s*secrets\./.test(w),
    'robot : les comptes de test sont supprimés dans un finally': /finally \{[^]{0,400}?for \(const u of uids\) if \(u\) \{ const d = await post\(H, '\/__admin\/compte-supprimer'/.test(js),
    'robot : les comptes s\'appellent « Temps Reel… »': /const noms = \['A', 'B', 'C'\]\.map\(\(x\) => 'Temps Reel' \+ x/.test(js),
    'robot : le code et le jeton ne sont jamais écrits au journal': !/(noter|annot)\([^)]*\$\{(codes|hash|d\.token)/.test(js),
    'robot : aucune route admin hors liste (login, compte-invite, compte-supprimer)': [...js.matchAll(/'(\/__admin\/[a-z-]+)'/g)].every((m) => ['/__admin/login', '/__admin/compte-invite', '/__admin/compte-supprimer'].includes(m[1])),
    'robot : couvre les fonctions annoncées (messages, groupe, appel, sauvegardes, push)': ['DM : arrivée chez B', 'Groupe', 'Appel audio', 'Sauvegardes', 'Notifications push', 'Réaction', 'Sondage'].every((m) => js.includes("essayer('" + m)),
  };
}
const wf = lire('.github/workflows/fonctions-apex-public.yml'), js = lire('tests/fonctions-apex.mjs');
for (const [m, v] of Object.entries(regles(wf, js))) t(v, m);
if (process.argv.includes('--sabotage')) {
  console.log('SABOTAGE');
  const rouge = (r) => Object.values(r).some((v) => !v);
  t(rouge(regles(wf + '\n  schedule:\n    - cron: "0 * * * *"\n', js)), 'S1. un cron → rouge');
  t(rouge(regles(wf, js.replace('for (const u of uids) if (u) {', 'for (const u of uids.slice(0, 1)) if (u) {'))), 'S2. un compte de test qui reste → rouge');
  t(rouge(regles(wf, js.replace("'Temps Reel' + x", "'Dupont' + x"))), 'S3. un nom qui ressemble à une vraie personne → rouge');
  t(rouge(regles(wf, js + "\nnoter(`code ${codes[0]}`);")), 'S4. le code écrit au journal → rouge');
  t(rouge(regles(wf, js + "\nawait post(H, '/__admin/revoke', {});")), 'S5. une route admin hors liste → rouge');
  t(rouge(regles(wf.replace('secrets.APEX_ADMIN_PIN_SHA256', "'x'"), js)), 'S6. secret en dur → rouge');
}
console.log(`\n${ok} OK / ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
