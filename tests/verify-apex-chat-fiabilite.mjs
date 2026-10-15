/* GARDE — fiabilité d'Apex Chat (lot E2, audit A5 du 15.10.2026). Sans dépendance.
 *
 *  1. PORTE QUALITÉ (F4) : deploy-apex-chat.yml joue la suite vitest du MÊME commit et le job de
 *     déploiement en dépend (`needs: tests`) ; aucun `continue-on-error`, aucun `|| true` qui
 *     avalerait l'échec des tests.
 *  2. MIGRATIONS (F7) : le déploiement passe par tools/d1-migrations-runner.mjs (journal), plus de
 *     boucle `for mig in $(ls …)` ni de « duplicate column » toléré pour un fichier entier.
 *  3. SECRETS DANS LES JOURNAUX PUBLICS (F8) : aucun workflow n'imprime un morceau du jeton
 *     Cloudflare (`${CLOUDFLARE_API_TOKEN:…}`) ni ses politiques (`user/tokens/$TOKEN_ID`) ;
 *     sync-secrets-to-cloudflare.yml pousse les secrets avec printf (echo ajoute un \n).
 *  4. SAUVEGARDES (F3) : la clé dédiée BACKUP_ENCRYPTION_KEY est poussée par `env:` (jamais écrite
 *     dans le script) ; l'exercice de restauration est manuel, sans cron, sans artefact, au coffre.
 *     La sauvegarde GitHub (apex-chat-d1-backup.yml) : son étape de push est JOUÉE pour de vrai
 *     (vrai git, faux dépôt distant) — l'ancienne version, qui appelait le script anti-Vercel
 *     après avoir quitté main, échoue ; la nouvelle passe.
 *  5. ALERTE HORS CLOUDFLARE (F6) : la sonde kdmc-uptime sonde la santé profonde d'Apex Chat
 *     (service binding) et appelle un battement EXTERNE ('/fail' en cas de panne) — logique jouée
 *     avec des fetch simulés.
 *  --sabotage : chaque règle statique a son cas fabriqué qui DOIT rougir.
 * node tests/verify-apex-chat-fiabilite.mjs [--sabotage]
 */
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { workflowAuCoffre } from '../tools/depot-public/au-coffre.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WF = join(ROOT, '.github/workflows');
const lire = (f) => readFileSync(join(WF, f), 'utf8');
const sansCommentaires = (t) => t.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
let pass = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else fails.push(m); console.log(`  ${c ? '✅' : '❌'} ${m}`); };

/* ───── règles statiques (pures : utilisées aussi par --sabotage) ───── */
export function reglesDeploy(src) {
  const t = sansCommentaires(src);
  const job = (nom) => (t.match(new RegExp(`^  ${nom}:\\n([\\s\\S]*?)(?=^  [A-Za-z0-9_-]+:\\n|(?![\\s\\S]))`, 'm')) || [])[1] || '';
  const tests = job('tests'); const deploy = job('deploy');
  const etape = (nom) => (t.match(new RegExp(`- name: ${nom}[^\\n]*\\n([\\s\\S]*?)(?=\\n\\s+- name:|(?![\\s\\S]))`)) || [])[1] || '';
  const migr = etape('Apply D1 migrations');
  const secrets = etape('Generate \\+ put secrets');
  return {
    'job tests : vitest --coverage du commit': /npx vitest run --coverage\s*$/m.test(tests) && /npm (install|ci)/.test(tests),
    'job deploy : needs: tests': /^\s+needs:\s*(tests|\[\s*tests\s*\])\s*(#.*)?$/m.test(deploy),
    'aucun continue-on-error dans le workflow': !/continue-on-error:\s*true/.test(t),
    'vitest jamais suivi de || true': !/vitest run[^\n]*\|\|/.test(t),
    'migrations par le moteur à journal': /node \.\.\/tools\/d1-migrations-runner\.mjs --remote apex-chat-main/.test(migr),
    'plus de boucle qui rejoue tous les fichiers': !/for mig in/.test(t) && !/duplicate column/.test(migr),
    'BACKUP_ENCRYPTION_KEY passe par env:': /BACKUP_ENCRYPTION_KEY: \$\{\{ secrets\.BACKUP_ENCRYPTION_KEY \}\}/.test(secrets)
      && /put_secret "BACKUP_ENCRYPTION_KEY" "\$BACKUP_ENCRYPTION_KEY"/.test(secrets) && !/run:[\s\S]*\$\{\{ secrets\.BACKUP_ENCRYPTION_KEY/.test(secrets.split('run: |')[1] || ''),
  };
}
export const fuiteJeton = (src) => /\$\{CLOUDFLARE_API_TOKEN:\s*-?\d/.test(src) /* sous-chaîne, pas ${X:-} */ || /user\/tokens\/\$TOKEN_ID/.test(src) || /Token prefix/.test(src);
export const echoDansSecret = (src) => /echo\s+"?\$\w+"?\s*\|\s*(npx\s+)?wrangler(@\S+)?\s+secret put/.test(sansCommentaires(src));
export function reglesExercice(src) {
  const t = sansCommentaires(src);
  return {
    'manuel seulement (workflow_dispatch, aucun schedule ni push)': /workflow_dispatch:/.test(t) && !/schedule:/.test(t) && !/^\s+(push|pull_request|workflow_run):/m.test(t),
    'aucun artefact publié (données déchiffrées)': !/upload-artifact/.test(t),
    'clé et jour passés par env:': /BACKUP_ENCRYPTION_KEY: \$\{\{ secrets\.BACKUP_ENCRYPTION_KEY \}\}/.test(t) && /JOUR: \$\{\{ inputs\.jour \}\}/.test(t) && !/run:[^\n]*\$\{\{ inputs/.test(t),
    'ménage des fichiers déchiffrés même en échec': /if: always\(\)\s*\n\s*run: rm -rf "\$RUNNER_TEMP\/sauvegarde"/.test(t),
    'reconstruit ET vérifie avec backup-restore.mjs': /backup-restore\.mjs "\$D" --sqlite/.test(t),
  };
}

/* ───── 1-4 : les vrais fichiers ───── */
console.log('1-2. deploy-apex-chat.yml');
for (const [m, v] of Object.entries(reglesDeploy(lire('deploy-apex-chat.yml')))) ok(v, m);

console.log('3. secrets dans les journaux publics');
const fuites = readdirSync(WF).filter((f) => /\.ya?ml$/.test(f) && fuiteJeton(lire(f)));
ok(fuites.length === 0, `aucun workflow n'imprime le préfixe ni les politiques du jeton Cloudflare (${fuites.join(', ') || 'aucun'})`);
ok(!echoDansSecret(lire('sync-secrets-to-cloudflare.yml')) && /printf '%s' "\$value" \| wrangler secret put/.test(lire('sync-secrets-to-cloudflare.yml')), 'sync-secrets-to-cloudflare.yml : printf, jamais echo, vers wrangler secret put');
ok(!echoDansSecret(lire('deploy-apex-chat.yml')), 'deploy-apex-chat.yml : aucun echo vers wrangler secret put');

console.log('4. sauvegardes');
const EX = 'apex-chat-exercice-restauration.yml';
if (existsSync(join(WF, EX))) for (const [m, v] of Object.entries(reglesExercice(lire(EX)))) ok(v, `${EX} : ${m}`);
else ok(workflowAuCoffre(EX), `${EX} absent ici — rangé au coffre (dépôt public)`);
const regles = JSON.parse(readFileSync(join(ROOT, 'tools/depot-public/regles.json'), 'utf8'));
ok(regles.workflows_prives.includes('.github/workflows/' + EX), `${EX} reste au coffre (workflows_prives : il déchiffre de vraies données)`);

/** Joue l'étape « Pousse sur la branche d1-backups » avec un vrai git et un faux dépôt distant. */
function jouerPushSauvegarde(script) {
  const tmp = mkdtempSync(join(tmpdir(), 'd1bk-'));
  const g = (cwd, ...a) => execFileSync('git', a, { cwd, stdio: 'pipe', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
  try {
    const distant = join(tmp, 'distant.git'); g(tmp, 'init', '-q', '--bare', distant);
    const graine = join(tmp, 'graine'); g(tmp, 'init', '-q', '-b', 'main', graine);
    mkdirSync(join(graine, 'tools/vercel'), { recursive: true });
    writeFileSync(join(graine, 'tools/vercel/museler-branche-orpheline.sh'), readFileSync(join(ROOT, 'tools/vercel/museler-branche-orpheline.sh')));
    writeFileSync(join(graine, 'README.md'), 'main\n');
    g(graine, 'add', '-A'); g(graine, 'commit', '-qm', 'main'); g(graine, 'remote', 'add', 'origin', distant); g(graine, 'push', '-q', 'origin', 'main');
    // une branche d1-backups EXISTANTE, orpheline, sans tools/ (l'état réel du dépôt)
    g(graine, 'checkout', '-q', '--orphan', 'd1-backups'); g(graine, 'rm', '-rqf', '--cached', '.');
    rmSync(join(graine, 'tools'), { recursive: true, force: true }); rmSync(join(graine, 'README.md'));
    mkdirSync(join(graine, 'backups/apex-chat-d1'), { recursive: true }); writeFileSync(join(graine, 'backups/apex-chat-d1/20260801.sql.enc'), 'x');
    g(graine, 'add', '-A'); g(graine, 'commit', '-qm', 'ancienne'); g(graine, 'push', '-q', 'origin', 'd1-backups');
    const travail = join(tmp, 'travail'); g(tmp, 'clone', '-q', '-b', 'main', distant, travail);
    const out = join(tmp, 'out'); mkdirSync(out); writeFileSync(join(out, 'latest.sql.enc'), 'chiffré'); writeFileSync(join(out, '20261015.sql.enc'), 'chiffré');
    const runner = join(tmp, 'runner'); mkdirSync(runner);
    const r = spawnSync('bash', ['-e', '-c', script.replace(/\/tmp\/out/g, out)], { cwd: travail, encoding: 'utf8', env: { ...process.env, RUNNER_TEMP: runner, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
    let fichiers = '';
    try { fichiers = execFileSync('git', ['ls-tree', '-r', '--name-only', 'd1-backups'], { cwd: distant, encoding: 'utf8' }); } catch (_) { /* */ }
    return { status: r.status, sortie: (r.stdout + r.stderr).slice(-400), fichiers };
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
function etapeRun(src, nom) {
  const l = src.split('\n'); const i = l.findIndex((x) => x.includes('- name: ' + nom));
  const r = l.findIndex((x, k) => k > i && /^\s+run: \|\s*$/.test(x)); const marge = l[r].length - l[r].trimStart().length;
  const c = []; for (let k = r + 1; k < l.length; k++) { if (l[k].trim() && l[k].length - l[k].trimStart().length <= marge) break; c.push(l[k]); }
  const min = Math.min(...c.filter((x) => x.trim()).map((x) => x.length - x.trimStart().length));
  return c.map((x) => x.slice(min)).join('\n');
}
const BK = 'apex-chat-d1-backup.yml';
if (existsSync(join(WF, BK))) {
  const etapeBk = etapeRun(lire(BK), 'Pousse sur la branche d1-backups');
  const r = jouerPushSauvegarde(etapeBk);
  ok(r.status === 0 && /backups\/apex-chat-d1\/20261015\.sql\.enc/.test(r.fichiers) && /tools\/agent\/vercel\.json/.test(r.fichiers),
    `${BK} : l'étape de push, jouée (vrai git, faux distant), pousse la sauvegarde ET la muselière Vercel${r.status ? ' → ' + r.sortie : ''}`);
  const ancienne = etapeBk.replace(/bash "\$MUSELIERE"[^\n]*/, 'bash tools/vercel/museler-branche-orpheline.sh');
  ok(jouerPushSauvegarde(ancienne).status !== 0, `${BK} : l'ANCIENNE forme (script appelé après avoir quitté main) échoue bien — le test discrimine`);
} else ok(workflowAuCoffre(BK), `${BK} absent ici — rangé au coffre`);

/* ───── 5 : alerte hors Cloudflare (logique de la sonde, fetch simulés) ───── */
console.log('5. sonde kdmc-uptime : santé profonde d\'Apex Chat + battement externe');
const caches = new Map();
globalThis.caches = { default: { match: async (u) => (caches.has(u) ? new Response(caches.get(u)) : undefined), put: async (u, r) => { caches.set(u, await r.text()); } } };
const appels = [];
globalThis.fetch = async (url, init = {}) => { appels.push({ url: String(url), method: init.method || 'GET', body: init.body }); return new Response('ok', { status: 200 }); };
const U = await import('../services/kdmc-uptime/worker.js');
const toml = readFileSync(join(ROOT, 'services/kdmc-uptime/wrangler.toml'), 'utf8');
ok(/binding = "APEX_CHAT_API"\s*\nservice = "apex-chat-api"/.test(toml), 'wrangler.toml : service binding APEX_CHAT_API → apex-chat-api');
ok(/printf '%s' "\$BATTEMENT" \| wrangler secret put HEARTBEAT_URL/.test(lire('deploy-kdmc-uptime.yml')) && !/schedule:/.test(sansCommentaires(lire('deploy-kdmc-uptime.yml'))), 'deploy-kdmc-uptime.yml pose HEARTBEAT_URL (printf, facultatif), sans cron');
const kv = new Map();
const ACCOUNTS = { get: async (k) => (kv.has(k) ? JSON.parse(kv.get(k)) : null), put: async (k, v) => { kv.set(k, v); } };
const api = (status, body) => ({ fetch: async () => new Response(JSON.stringify(body), { status }) });
const env = (apex, extra = {}) => ({ ACCOUNTS, HEARTBEAT_URL: 'https://hc-ping.example/uuid-test/', APEX_CHAT_API: apex, ...extra });
const hb = () => appels.filter((a) => a.url.startsWith('https://hc-ping.example/'));

appels.length = 0;
let st = await U.runPass(env(api(200, { ok: true, checks: { d1: 'ok', do: 'ok', backup: 'ok' } })));
ok(st.results.some((r) => r.id === U.APEX_API_ID && r.ok) && st.down.length === 0, '5a. API saine → cible apex-chat-api en bonne santé');
ok(hb().length === 1 && hb()[0].url === 'https://hc-ping.example/uuid-test' && hb()[0].method === 'POST' && st.battement.envoye, '5b. tout va bien → battement EXTERNE simple (le service ne s\'inquiète pas)');
appels.length = 0;
st = await U.runPass(env(api(503, { ok: false, checks: { d1: 'ko', do: 'ok', backup: 'unknown' } })));
ok(st.down.includes(U.APEX_API_ID) && st.results.find((r) => r.id === U.APEX_API_ID).detail === 'd1:ko', '5c. D1 en panne (503) → apex-chat-api EN PANNE, cause « d1:ko »');
ok(hb().length === 1 && hb()[0].url === 'https://hc-ping.example/uuid-test/fail' && /en panne : apex-chat-api/.test(hb()[0].body), '5d. panne → battement « /fail » : alerte e-mail immédiate HORS Cloudflare');
appels.length = 0;
st = await U.runPass(env(api(200, { ok: true, checks: { d1: 'ok', do: 'ok', backup: 'stale' } })));
ok(st.down.includes(U.APEX_API_ID) && hb()[0].url.endsWith('/fail'), '5e. sauvegarde de plus de 26 h → comptée comme une panne (/fail)');
appels.length = 0;
st = await U.runPass(env({ fetch: async () => { throw new Error('binding mort'); } }));
ok(st.down.includes(U.APEX_API_ID) && st.results.find((r) => r.id === U.APEX_API_ID).code === 'erreur', '5f. service injoignable → panne, sans faire tomber le passage');
appels.length = 0;
st = await U.runPass(env(api(200, { ok: true, checks: {} }), { HEARTBEAT_URL: '' }));
ok(hb().length === 0 && st.battement.envoye === false, '5g. sans HEARTBEAT_URL → aucun appel externe, la sonde continue (fail-open)');
appels.length = 0;
st = await U.runPass({ ACCOUNTS });
ok(!st.results.some((r) => r.id === U.APEX_API_ID), '5h. sans binding (ancien déploiement) → API non sondée plutôt qu\'une fausse panne');

/* ───── --sabotage : chaque règle statique doit rougir sur un cas fabriqué ───── */
if (process.argv.includes('--sabotage')) {
  console.log('SABOTAGE');
  const vrai = lire('deploy-apex-chat.yml');
  const casser = (de, vers) => reglesDeploy(vrai.replace(de, vers));
  const rouge = (r) => Object.values(r).some((v) => !v);
  ok(rouge(casser(/\n    needs: tests[^\n]*/, '')), 'S1. sans `needs: tests` → rouge');
  ok(rouge(casser('run: npx vitest run --coverage', 'run: npx vitest run --coverage || true')), 'S2. vitest || true → rouge');
  ok(rouge(casser('node ../tools/d1-migrations-runner.mjs --remote apex-chat-main --dir ../d1-migrations', 'for mig in $(ls ../d1-migrations/0*.sql | sort); do wrangler d1 execute apex-chat-main --file="$mig" --remote; done')), 'S3. ancienne boucle de migrations → rouge');
  ok(rouge(casser('put_secret "BACKUP_ENCRYPTION_KEY" "$BACKUP_ENCRYPTION_KEY"', 'put_secret "BACKUP_ENCRYPTION_KEY" "${{ secrets.BACKUP_ENCRYPTION_KEY }}"')), 'S4. clé de sauvegarde écrite dans le script → rouge');
  ok(fuiteJeton('run: echo "Token prefix: ${CLOUDFLARE_API_TOKEN:0:10}..."'), 'S5. préfixe du jeton imprimé → détecté');
  ok(fuiteJeton('curl https://api.cloudflare.com/client/v4/user/tokens/$TOKEN_ID'), 'S6. politiques du jeton → détecté');
  ok(echoDansSecret('            echo "$value" | wrangler secret put "$name"'), 'S7. echo vers wrangler secret put → détecté');
  const ex = existsSync(join(WF, EX)) ? lire(EX) : '';
  if (ex) {
    ok(rouge(reglesExercice(ex.replace('on:\n  workflow_dispatch:', 'on:\n  schedule:\n    - cron: "0 4 * * 1"\n  workflow_dispatch:'))), 'S8. exercice avec cron → rouge');
    ok(rouge(reglesExercice(ex + '\n      - uses: actions/upload-artifact@v4\n')), 'S9. exercice qui publie un artefact → rouge');
    ok(rouge(reglesExercice(ex.replace('          JOUR: ${{ inputs.jour }}\n', '').replace('if [ -n "$JOUR" ]', 'JOUR=${{ inputs.jour }}; if [ -n "$JOUR" ]'))), 'S10. entrée écrite dans le shell → rouge');
  }
}

console.log(`\n${pass} OK / ${fails.length} échec(s)`);
if (fails.length) { for (const f of fails) console.log('  ❌ ' + f); process.exit(1); }
