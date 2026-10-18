#!/usr/bin/env node
/* Garde du robot « personne attendue » (Kevin 18.10.2026 : « J'ai invité Yann et Ludo, personne ne doit galérer »). Il agit sur de VRAIS comptes depuis un journal PUBLIC :
 * (1) une seule fiche doit correspondre, jamais l'admin ; (2) SANS_NOMS=1 au workflow et « compte 1 » dans le journal ; (3) manuel, sans cron, secret par env,
 * entrée passée par env ; (4) il ne pose aucun code et ne modifie aucun compte (une seule route d'écriture : /__admin/attendus) ; (5) --sabotage. */
import { readFileSync } from 'node:fs';
const lire = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
let ok = 0, ko = 0;
const t = (c, m) => { if (c) { ok++; console.log('  ✅ ' + m); } else { ko++; console.log('  ❌ ' + m); } };
export function regles(wf, js) {
  const w = wf.replace(/^\s*#.*$/gm, '');
  return {
    'workflow : à la main seulement, jamais de cron': /workflow_dispatch:/.test(w) && !/schedule:/.test(w) && !/^\s+(push|pull_request):/m.test(w),
    'workflow : SANS_NOMS=1, code admin par secret/env, entrées par env': /SANS_NOMS:\s*"1"/.test(w) && /KDMC_ADMIN_PIN_SHA256:\s*\$\{\{\s*secrets\.APEX_ADMIN_PIN_SHA256\s*\}\}/.test(w) && /PRENOM:\s*\$\{\{\s*inputs\.prenom\s*\}\}/.test(w) && !/run:[^\n]*\$\{\{\s*inputs/.test(w),
    'script : exactement UNE fiche, jamais l\'admin': /cibles\.length !== 1/.test(js) && /ADMIN_UIDS\.has\(a\.uid\)/.test(js),
    'script : le journal écrit « compte 1 » en mode sans noms (jamais le nom, ni l\'uid)': /const etiquette = SANS_NOMS \? 'compte 1' : c\.name;/.test(js) && !/annot\([^)]*\$\{(c\.uid|c\.name)\}/.test(js),
    'script : autonome (aucun import du fichier privé session-kevin.mjs)': !/from '\.\/session-kevin\.mjs'/.test(js),
    'script : une seule écriture, sur /__admin/attendus ; aucun code posé': [...js.matchAll(/'(\/__admin\/[a-z-]+)'/g)].every((m) => ['/__admin/login', '/__admin/accounts', '/__admin/attendus'].includes(m[1])) && !/compte-invite|\/__admin\/code|compte-supprimer|credSet/.test(js),
  };
}
const wf = lire('.github/workflows/attendre-compte-public.yml'), js = lire('tools/smoke/attendre-compte.mjs');
for (const [m, v] of Object.entries(regles(wf, js))) t(v, m);
if (process.argv.includes('--sabotage')) {
  console.log('SABOTAGE');
  const rouge = (r) => Object.values(r).some((v) => !v);
  t(rouge(regles(wf.replace('SANS_NOMS: "1"', 'SANS_NOMS: "0"'), js)), 'S1. SANS_NOMS à 0 → rouge');
  t(rouge(regles(wf + '\n  schedule:\n    - cron: "0 * * * *"\n', js)), 'S2. un cron → rouge');
  t(rouge(regles(wf, js.replace('cibles.length !== 1', 'cibles.length < 1'))), 'S3. plusieurs fiches acceptées → rouge');
  t(rouge(regles(wf, js.replace("const etiquette = SANS_NOMS ? 'compte 1' : c.name;", 'const etiquette = c.name;'))), 'S4. le nom écrit au journal public → rouge');
  t(rouge(regles(wf, js + "\nawait fetch(DOMAINE + '/__admin/code', { method: 'POST' });")), 'S5. une route d\'écriture hors liste → rouge');
  t(rouge(regles(wf, "import { passPortail } from './session-kevin.mjs';\n" + js)), 'S6. import du fichier privé → rouge');
}
console.log(`\n${ok} OK / ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
