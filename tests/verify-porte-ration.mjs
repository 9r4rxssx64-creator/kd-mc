/* GARDE — la PORTE DE RATION des gros robots (Kevin 15.10.2026 : « Économise le forfait action. Au maximum, trouve des solutions pour ne
   jamais plus être bloqué »). Mesuré : le 12.10 le quota du coffre a été mangé par des robots de 18 à 29 min lancés sans regarder ce qu'il
   restait — et un quota épuisé bloque TOUS les autres robots. Désormais chaque gros robot commence par lire la ration du jour et ne démarre pas
   si elle ne couvre pas son coût (sauf « forcer »). Le script est exécuté POUR DE VRAI avec un faux `gh` ; les 6 workflows sont lus tels quels.
   node tests/verify-porte-ration.mjs      (SABOTAGE=1 : la chaîne privée perd sa porte → la garde doit rougir) */
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { mkdtempSync, writeFileSync, mkdirSync, chmodSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + String(d).slice(0, 200) : ''}`); };
const SAB = process.env.SABOTAGE === '1';
const dir = mkdtempSync(join(tmpdir(), 'porte-'));
mkdirSync(join(dir, 'bin'));
const jour = new Date().toISOString().slice(0, 10);
const run = (min) => ({ name: 'Chaîne', status: 'completed', conclusion: 'success', run_started_at: `${jour}T00:30:00Z`, created_at: `${jour}T00:30:00Z`, updated_at: new Date(Date.parse(`${jour}T00:30:00Z`) + min * 60000).toISOString() });
const faux = (min) => { writeFileSync(join(dir, 'bin/gh'), `#!/bin/bash\n[ "$GH_MODE" = muet ] && { echo boom >&2; exit 1; }\ncat <<'J'\n${JSON.stringify({ workflow_runs: [run(min)] })}\nJ\n`); chmodSync(join(dir, 'bin/gh'), 0o755); };
const porte = (besoin, extra = {}) => { try { execFileSync('bash', ['tools/ci/porte-ration.sh', String(besoin)], { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, PATH: join(dir, 'bin') + ':' + process.env.PATH, GITHUB_REPOSITORY: 'x/y', RATION_JSON: join(dir, 'r.json'), ...extra } }); return 0; } catch (e) { return e.status; } };

faux(50);   /* 50 min mangées, 10 restantes */
ok(porte(30) === 3, '1. 50 min mangées : une chaîne de 30 min NE DÉMARRE PAS (code 3)', porte(30));
ok(porte(10) === 0, '2. 50 min mangées : un robot de 10 min tient dans la ration');
faux(5);
ok(porte(30) === 0, '3. 5 min mangées : la chaîne de 30 min part');
ok(porte(30, { GH_MODE: 'muet' }) === 0, '4. FAIL-OUVERT : si la ration ne peut pas être lue, la porte laisse partir (elle ne bloque jamais à tort)');

/* les 6 gros robots portent la porte, l'entrée « forcer », le droit de lire les runs, et la porte passe AVANT l'installation des paquets */
const ROBOTS = { 'coffre-chaine-privee': 30, 'cmc-runtime-audit': 10, 'arbre-nuage': 4, 'verif-reelle': 15, 'audit-lingua': 10, 'voir-comme-kevin': 8 };
for (const [nom, besoin] of Object.entries(ROBOTS)) {
  let y = readFileSync(`.github/workflows/${nom}.yml`, 'utf8');
  if (SAB && nom === 'coffre-chaine-privee') y = y.replace(/\n\s*- name: Porte de ration[\s\S]*?porte-ration\.sh \d+\n/, '\n');
  const porteAt = y.indexOf('bash tools/ci/porte-ration.sh ' + besoin);
  const install = y.search(/npm (install|ci)\b/);
  ok(porteAt > 0 && (install < 0 || porteAt < install), `5.${nom} : la porte (${besoin} min) existe et passe avant l'installation des paquets`);
  ok(/forcer_ration:\s*\n\s*description:[^\n]*\n\s*type: boolean/.test(y) && /if: \$\{\{ !inputs\.forcer_ration \}\}/.test(y), `6.${nom} : l'entrée « forcer_ration » (accord de Kevin) contourne la porte`);
  ok(/actions: read/.test(y), `7.${nom} : le robot a le droit de lire la liste des runs du jour`);
}
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
/* 8. AUCUNE entrée en double dans AUCUN workflow : une clé dupliquée rend le fichier invalide pour GitHub (PyYAML, plus tolérant, ne le voit pas) —
   mesuré le 15.10 : « forcer » ajouté en double dans 3 workflows → 3 runs rouges « workflow file issue » à chaque push sur main */
{
  const dossier = '.github/workflows'; let doubles = [];
  for (const f of readdirSync(dossier).filter((x) => /\.ya?ml$/.test(x))) {
    const L = readFileSync(join(dossier, f), 'utf8').split('\n'); let dedans = false; const vus = new Set();
    for (const l of L) {
      if (/^    inputs:\s*$/.test(l)) { dedans = true; vus.clear(); continue; }
      if (dedans) { if (l.trim() && !/^\s{5,}/.test(l)) dedans = false; else { const m = /^      ([A-Za-z0-9_-]+):\s*$/.exec(l); if (m) { if (vus.has(m[1])) doubles.push(f + ' → ' + m[1]); vus.add(m[1]); } } }
    }
  }
  ok(doubles.length === 0, '8. aucune entrée dupliquée dans les entrées de workflow_dispatch (clé en double = fichier invalide pour GitHub)', doubles.join(' ; '));
}
console.log(`\n${fail ? '❌' : '✅'} porte-ration : ${pass}/${pass + fail}`); process.exit(fail ? 1 : 0);
