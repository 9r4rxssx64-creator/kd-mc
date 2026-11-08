#!/usr/bin/env node
/* Garde du robot « parcours d'une personne invitée » (Kevin 18.10.2026 : « simule, tout en réel »). Il écrit dans un journal PUBLIC et crée un compte :
 * (1) manuel seulement, sans cron, secret du domaine par env ; (2) le compte de test est TOUJOURS supprimé (finally) ; (3) le journal ne contient jamais le code
 * ni le jeton ; (4) le compte de test porte le nom « Parcours Robot… » (jamais le nom de quelqu'un) ; (5) --sabotage : chaque règle rougit sur un cas fabriqué. */
import { readFileSync } from 'node:fs';
const lire = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
let ok = 0, ko = 0;
const t = (c, m) => { if (c) { ok++; console.log('  ✅ ' + m); } else { ko++; console.log('  ❌ ' + m); } };
export function regles(wf, js) {
  const w = wf.replace(/^\s*#.*$/gm, '');
  const finalement = (js.match(/finally \{[^]{0,260}?if \(uid\) \{ const d = await post\(H, '\/__admin\/compte-supprimer'/) || [])[0];
  return {
    'workflow : à la main seulement (workflow_dispatch, jamais de cron ni de push)': /workflow_dispatch:/.test(w) && !/schedule:/.test(w) && !/^\s+(push|pull_request):/m.test(w),
    'workflow : le code admin vient du secret, par env': /KDMC_ADMIN_PIN_SHA256:\s*\$\{\{\s*secrets\.APEX_ADMIN_PIN_SHA256\s*\}\}/.test(w) && !/run:[^\n]*\$\{\{\s*secrets\./.test(w),
    'workflow : entrée passée par env (jamais dans le shell)': /VARIANTES:\s*\$\{\{\s*inputs\.variantes\s*\}\}/.test(w) && !/run:[^\n]*\$\{\{\s*inputs/.test(w),
    'robot : le compte de test est supprimé dans un finally': !!finalement,
    'robot : le compte de test s\'appelle « Parcours Robot… »': /const prenom = 'Parcours', nom = 'Robot'/.test(js),
    'robot : le code et le jeton ne sont jamais écrits au journal': !/annot\([^)]*\$\{(code|H\[|hash|d\.token)/.test(js) && !/noter\([^)]*\$\{(code|hash)\}/.test(js),
    'robot : aucune route admin hors liste (login, compte-invite, code, compte-supprimer, apps-fermees en LECTURE, attendus)': [...js.matchAll(/'(\/__admin\/[a-z-]+)'/g)].every((m) => ['/__admin/login', '/__admin/compte-invite', '/__admin/code', '/__admin/compte-supprimer', '/__admin/apps-fermees', '/__admin/attendus'].includes(m[1])),
  };
}
const wf = lire('.github/workflows/parcours-invite-public.yml'), js = lire('tests/parcours-invite.mjs');
for (const [m, v] of Object.entries(regles(wf, js))) t(v, m);
if (process.argv.includes('--sabotage')) {
  console.log('SABOTAGE');
  const rouge = (r) => Object.values(r).some((v) => !v);
  t(rouge(regles(wf + '\n  schedule:\n    - cron: "0 * * * *"\n', js)), 'S1. un cron → rouge');
  t(rouge(regles(wf, js.replace("if (uid) { const d = await post(H, '/__admin/compte-supprimer'", "if (false) { const d = await post(H, '/__admin/compte-supprimer'"))), 'S2. plus de suppression du compte de test → rouge');
  t(rouge(regles(wf, js.replace("nom = 'Robot'", "nom = 'Dupont'"))), 'S3. un nom qui ressemble à une vraie personne → rouge');
  t(rouge(regles(wf, js + "\nnoter(`code ${code}`);")), 'S4. le code écrit au journal → rouge');
  t(rouge(regles(wf, js + "\nawait post(H, '/__admin/revoke', {});")), 'S5. une route admin hors liste → rouge');
  t(rouge(regles(wf.replace('secrets.APEX_ADMIN_PIN_SHA256', "'x'"), js)), 'S6. secret en dur → rouge');
}
console.log(`\n${ok} OK / ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
