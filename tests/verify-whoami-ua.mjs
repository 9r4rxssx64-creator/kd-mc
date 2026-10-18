#!/usr/bin/env node
/* Garde — tout worker qui demande « qui est cette personne ? » au domaine (/__sso/whoami) DOIT transmettre le User-Agent de la personne.
 * Le routeur lie le pass à la famille d'appareil (8.10) : appelé depuis un worker sans User-Agent, whoami répond « inconnu ». Le 13.10 six workers ont été
 * corrigés ; celui d'Apex Chat a été OUBLIÉ — résultat mesuré le 18.10 (robot parcours-invite) : 401 kdmc_session_invalide pour toute personne du domaine,
 * donc plus aucune entrée automatique dans Apex Chat. Cette garde lit chaque fichier d'un worker qui appelle whoami en SERVEUR et exige la transmission.
 * node tests/verify-whoami-ua.mjs [--sabotage] */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
const RACINE = new URL('..', import.meta.url).pathname;
const EXCLUS = [/^services\/kdmc-router\//, /\/page\.js$/, /\.test\.m?js$/, /node_modules/, /^services\/kdmc-outlook\//];
let ok = 0, ko = 0;
const t = (c, m) => { if (c) { ok++; console.log('  ✅ ' + m); } else { ko++; console.log('  ❌ ' + m); } };
function lister(d, out = []) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = join(d, e.name);
    if (e.isDirectory()) lister(p, out); else if (/\.m?js$/.test(e.name)) out.push(p);
  }
  return out;
}
export const appelleWhoami = (src) => /\/__sso\/whoami/.test(src) && /\bfetch\s*\(/.test(src);
export const transmetUa = (src) => /user-agent['"]?\]?\s*[:=]|\[['"]user-agent['"]\]\s*=|\[['"]User-Agent['"]\]\s*=|['"]user-agent['"]\s*:\s*\w+/i.test(src);
const fichiers = [...lister(join(RACINE, 'services')), ...lister(join(RACINE, 'messaging-app/workers'))].map((f) => relative(RACINE, f)).filter((f) => !EXCLUS.some((r) => r.test(f)));
const concernes = fichiers.filter((f) => appelleWhoami(readFileSync(join(RACINE, f), 'utf8')));
t(concernes.length >= 6, `${concernes.length} worker(s) appellent whoami en serveur (attendu ≥ 6, dont Apex Chat) : ${concernes.join(', ')}`);
t(concernes.includes('messaging-app/workers/api-worker.js'), 'le worker d\'Apex Chat fait partie des fichiers contrôlés');
for (const f of concernes) t(transmetUa(readFileSync(join(RACINE, f), 'utf8')), `${f} transmet le User-Agent de la personne à whoami`);
if (process.argv.includes('--sabotage')) {
  console.log('SABOTAGE');
  const vrai = readFileSync(join(RACINE, 'messaging-app/workers/api-worker.js'), 'utf8');
  t(transmetUa(vrai), 'S0. le vrai api-worker transmet bien le User-Agent');
  t(!transmetUa(vrai.replace("if (uaPersonne) entetes['User-Agent'] = uaPersonne;", '')), 'S1. sans la ligne de transmission → rouge');
  t(!transmetUa('const r = await fetch("https://kd-mc.com/__sso/whoami", { headers: { Authorization: "Bearer x" } });'), 'S2. un appel whoami sans User-Agent → rouge');
  t(appelleWhoami('await fetch("https://kd-mc.com/__sso/whoami")') && !appelleWhoami('const x = "/__sso/whoami"'), 'S3. un fichier qui ne fait que NOMMER l\'adresse n\'est pas contrôlé');
}
console.log(`\n${ok} OK / ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
