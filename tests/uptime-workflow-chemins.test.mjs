#!/usr/bin/env node
/**
 * Garde : dans deploy-kdmc-uptime.yml, une étape qui lit un fichier par un chemin depuis la RACINE du dépôt
 * (`services/…`, `tests/…`) tourne avec `working-directory: .`.
 *
 * Mesuré le 15.10.2026 (run kd-mc 38751126105) : « Impossible de lire la liste des workers dans
 * services/kdmc-uptime/worker.js ». Le dossier par défaut du job est services/kdmc-uptime ; l'étape
 * « Santé des workers » lisait services/kdmc-uptime/worker.js depuis là → fichier introuvable, et comme
 * l'étape est « jamais bloquante », les 7 workers critiques (dont kdmc-vente) n'étaient sondés par PERSONNE.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const wf = readFileSync(join(ROOT, '.github/workflows/deploy-kdmc-uptime.yml'), 'utf8');
let ok = 0;
let fail = 0;
const check = (cond, m) => { if (cond) { ok++; console.log('  OK   ' + m); } else { fail++; console.log('  FAIL ' + m); } };

const defaut = (wf.match(/defaults:\s*\n\s*run:\s*\n\s*working-directory:\s*(\S+)/) || [])[1];
check(defaut === 'services/kdmc-uptime', 'dossier par défaut du job lu : ' + defaut);

const etapes = wf.split(/\n(?=      - name: )/).slice(1);
let lues = 0;
for (const e of etapes) {
  const nom = (e.match(/- name: (.*)/) || [])[1];
  const corps = e.replace(/^\s*#.*$/gm, '');
  const lit = /(readFileSync\(|node |cat |grep [^|]*?)\s*['"]?(services|tests|tools)\//.test(corps) || /['"](services|tests)\/[\w./-]+['"]/.test(corps);
  if (!lit) continue;
  lues++;
  check(/working-directory:\s*\.\s*\n/.test(e), `« ${nom} » lit un chemin depuis la racine → working-directory: .`);
}
check(lues >= 4, `étapes vérifiées : ${lues} (au moins les 4 gardes + santé des workers)`);

// La liste lue par l'étape « Santé des workers » existe bien et n'est pas vide.
const s = readFileSync(join(ROOT, 'services/kdmc-uptime/worker.js'), 'utf8');
const m = s.match(/const WORKERS = \[([\s\S]*?)\]/);
const liste = m ? [...m[1].matchAll(/'([a-z0-9-]+)'/g)].map((x) => x[1]) : [];
check(liste.includes('kdmc-vente') && liste.length >= 5, 'liste WORKERS lisible (' + liste.length + ' workers, dont kdmc-vente)');

console.log(`\n${ok} ✅ / ${fail} ❌`);
process.exit(fail ? 1 : 0);
