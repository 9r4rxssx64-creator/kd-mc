/* GARDE — publication : les données RH ne retournent JAMAIS sur l'hébergeur public à cause du plafond KV (2.10.2026)
 *
 * Mesuré le 2.10 (sonde-fuite du routeur rouge 4/16 de 19h31 à 21h19) : plafond KV du jour atteint (code 10048) → la
 * publication REMETTAIT les 4 fichiers RH dans le paquet Pages → pages.dev les servait en direct. Désormais :
 *   A. copie KV identique (même taille) → 0 écriture, rien dans le paquet ;
 *   B. plafond + copie KV d'avant → la copie reste, le fichier NE retourne PAS dans le paquet ;
 *   C. plafond + AUCUNE copie KV → le fichier retourne dans le paquet (seul cas, leçon #376), et on le dit ;
 *   D. sabotage : l'ancienne étape (origin/main) en situation B remettait le fichier dans le paquet → ce garde le voit.
 * L'étape réelle du workflow est extraite et jouée avec un faux `wrangler`. node tests/verify-publication-rh-plafond.mjs */
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, existsSync, chmodSync, cpSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import yaml from 'js-yaml';
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };

const NOM = 'Données RH → KV du routeur (servies derrière la connexion)';
function etape(texte) {
  const wf = yaml.load(texte);
  const job = Object.values(wf.jobs)[0];
  const st = job.steps.find((s) => s.name === NOM);
  if (!st) throw new Error('étape introuvable : ' + NOM);
  return st.run;
}
const STUB = `#!/bin/bash
if [ "$1 $2 $3" = "kv key get" ]; then [ "\${STUB_GET_BYTES:-0}" -gt 0 ] || { echo "no such key" >&2; exit 1; }; head -c "$STUB_GET_BYTES" /dev/zero | tr '\\0' 'x'; exit 0; fi
if [ "$1 $2 $3" = "kv key put" ]; then echo "$5" >> "$STUB_LOG"; if [ "\${STUB_PUT:-ok}" = "10048" ]; then echo "X [ERROR] A request to the Cloudflare API failed. your account has reached the free usage limit for this operation for today [code: 10048]"; exit 1; fi; exit 0; fi
exit 0
`;
function jouer(script, { getBytes, put }) {
  const d = mkdtempSync(join(tmpdir(), 'pub-rh-'));
  mkdirSync(join(d, 'services/kdmc-router'), { recursive: true }); mkdirSync(join(d, 'bin'));
  cpSync('services/kdmc-router/donnees-rh.js', join(d, 'services/kdmc-router/donnees-rh.js'));
  writeFileSync(join(d, 'services/kdmc-router/wrangler.toml'), '[[kv_namespaces]]\nbinding = "ACCOUNTS"\nid = "abcdef0123456789abcdef0123456789"\n');
  const liste = execFileSync('node', ['-e', "import('./services/kdmc-router/donnees-rh.js').then(m=>console.log(m.DONNEES_RH.map(c=>m.cheminDepot(c)).join('\\n')))"], { cwd: d, encoding: 'utf8' }).trim().split('\n');
  for (const f of liste) { mkdirSync(join(d, f, '..'), { recursive: true }); writeFileSync(join(d, f), 'x'.repeat(100)); }
  writeFileSync(join(d, 'bin/wrangler'), STUB); chmodSync(join(d, 'bin/wrangler'), 0o755);
  writeFileSync(join(d, 'etape.sh'), script);
  const log = join(d, 'puts.log'); writeFileSync(log, '');
  const r = spawnSync('bash', ['etape.sh'], { cwd: d, encoding: 'utf8', env: { ...process.env, PATH: join(d, 'bin') + ':' + process.env.PATH, GITHUB_REF_NAME: 'main', STUB_GET_BYTES: String(getBytes), STUB_PUT: put, STUB_LOG: log, CLOUDFLARE_API_TOKEN: 'x', CLOUDFLARE_ACCOUNT_ID: 'y' } });
  const sortie = (r.stdout || '') + (r.stderr || '');
  const puts = readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).length;
  const dansPaquet = liste.filter((f) => existsSync(join(d, 'services/kdmc-router/pages-upload', f)));
  rmSync(d, { recursive: true, force: true });
  return { code: r.status, sortie, puts, dansPaquet, n: liste.length };
}

const neuf = etape(readFileSync('.github/workflows/publier-site-prive.yml', 'utf8'));
const A = jouer(neuf, { getBytes: 100, put: 'ok' });
ok(A.code === 0 && A.puts === 0 && A.dansPaquet.length === 0 && /0 écriture/.test(A.sortie), 'A. copie KV identique → 0 écriture, rien dans le paquet', `code ${A.code} puts ${A.puts} paquet ${A.dansPaquet}`);
const B = jouer(neuf, { getBytes: 90, put: '10048' });
ok(B.code === 0 && B.puts === B.n && B.dansPaquet.length === 0 && /NE retourne PAS dans le paquet/.test(B.sortie) && /AUCUN fichier RH dans le paquet/.test(B.sortie), 'B. plafond + copie KV d\'avant → la copie reste, AUCUN fichier RH dans le paquet, et on le dit', `code ${B.code} puts ${B.puts} paquet ${B.dansPaquet} ${B.sortie.slice(-300)}`);
const C = jouer(neuf, { getBytes: 0, put: '10048' });
ok(C.code === 0 && C.dansPaquet.length === C.n && /AUCUNE copie KV/.test(C.sortie), 'C. plafond + aucune copie KV → remis dans le paquet (seul cas), et on le dit', `code ${C.code} paquet ${C.dansPaquet.length}/${C.n}`);
let ancien = null;
try { ancien = etape(execFileSync('git', ['show', 'origin/main:.github/workflows/publier-site-prive.yml'], { encoding: 'utf8' })); } catch { /* pas de origin/main ici */ }
if (ancien && ancien !== neuf) {
  const D = jouer(ancien, { getBytes: 90, put: '10048' });
  ok(D.dansPaquet.length === D.n, 'D. sabotage : l\'ancienne étape remettait les fichiers RH dans le paquet malgré une copie KV (le garde le voit)', `paquet ${D.dansPaquet.length}/${D.n}`);
} else ok(true, 'D. (origin/main identique ou absent : sabotage déjà prouvé à la création du garde)');

console.log(`\n${pass} OK / ${fail} échec(s)`); process.exit(fail ? 1 : 0);
