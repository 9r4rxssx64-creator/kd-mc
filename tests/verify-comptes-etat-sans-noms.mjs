#!/usr/bin/env node
/* Garde : le robot « état des comptes » du dépôt PUBLIC n'écrit ni nom ni identifiant dans son journal (un journal public se lit par tous).
 * Kevin 18.10.2026 : « Yann et Ludo ont déjà un compte, pourquoi n'arrivent-ils pas à se connecter ? Vérifie réel ».
 * Prouve : (1) le workflow public pose SANS_NOMS=1, jamais en cron, lit le secret du domaine ; (2) le script, en mode SANS_NOMS, n'écrit
 * QUE « compte N » + les causes ; (3) --sabotage : sans l'interrupteur, ou avec un nom dans le gabarit, la garde rougit. */
import { readFileSync } from 'node:fs';
const lire = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
let ok = 0, ko = 0;
const t = (c, m) => { if (c) { ok++; console.log('  ✅ ' + m); } else { ko++; console.log('  ❌ ' + m); } };
export function regles(wf, js) {
  const sansComm = wf.replace(/^\s*#.*$/gm, '');
  const gabarit = (js.match(/annot\('notice', 'Compte', `([^\n]*)`\); \}/) || [])[1] || '';
  return {
    'workflow : SANS_NOMS=1': /SANS_NOMS:\s*"1"/.test(sansComm),
    'workflow : jamais de cron': !/schedule:/.test(sansComm),
    'workflow : le code admin vient du secret': /KDMC_ADMIN_PIN_SHA256:\s*\$\{\{\s*secrets\.APEX_ADMIN_PIN_SHA256\s*\}\}/.test(sansComm),
    'script : mode SANS_NOMS lu': /process\.env\.SANS_NOMS === '1'/.test(js),
    'script : en mode SANS_NOMS le gabarit écrit « compte N », jamais le nom ni l\'uid': /\$\{SANS_NOMS \? 'compte ' \+ n : `\$\{nom\} \(\$\{a\.uid\}\)`\}/.test(gabarit) && !/\$\{nom\}|\$\{a\.uid\}/.test(gabarit.replace(/\$\{SANS_NOMS \? 'compte ' \+ n : `\$\{nom\} \(\$\{a\.uid\}\)`\}/, '')),
  };
}
const wf = lire('.github/workflows/comptes-etat-public.yml'), js = lire('tools/smoke/comptes-etat.mjs');
for (const [m, v] of Object.entries(regles(wf, js))) t(v, m);
if (process.argv.includes('--sabotage')) {
  console.log('SABOTAGE');
  const rouge = (r) => Object.values(r).some((v) => !v);
  t(rouge(regles(wf.replace('SANS_NOMS: "1"', 'SANS_NOMS: "0"'), js)), 'S1. SANS_NOMS à 0 dans le workflow → rouge');
  t(rouge(regles(wf + '\n  schedule:\n    - cron: "0 * * * *"\n', js)), 'S2. un cron ajouté → rouge');
  t(rouge(regles(wf, js.replace("${SANS_NOMS ? 'compte ' + n : `${nom} (${a.uid})`}", '${nom} (${a.uid})'))), 'S3. le nom écrit même en mode sans noms → rouge');
  t(rouge(regles(wf, js.replace("process.env.SANS_NOMS === '1'", 'false'))), 'S4. mode sans noms jamais lu → rouge');
}
console.log(`\n${ok} OK / ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
