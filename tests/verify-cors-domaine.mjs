/* AUDIT DU DOMAINE 22.10.2026 (pont 197, point 2) : plus de `Access-Control-Allow-Origin: *` sur les workers du domaine.
 * Les VRAIS workers (le proxy de secrets est lu dans son workflow) répondent à un site étranger SANS en-tête CORS, et au domaine / github.io / app installée
 * AVEC leur propre origine (+ Vary: Origin). Le coffre R2 accepte aussi kd-mc.com et ses sous-domaines.
 *   node tests/verify-cors-domaine.mjs        SABOTAGE=avant : lit les fichiers dans l'état de HEAD~ (avant correction) → doit rougir */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AVANT = process.env.SABOTAGE === 'avant';
const lire = (f) => AVANT ? execFileSync('git', ['show', 'origin/main:' + f], { cwd: ROOT, maxBuffer: 1 << 28 }).toString('utf8') : readFileSync(join(ROOT, f), 'utf8');
let ok = 0, ko = 0; const dis = (b, m) => { b ? ok++ : ko++; console.log(`  ${b ? '✅' : '❌'} ${m}`); };
const dir = mkdtempSync(join(tmpdir(), 'cors-'));
const charge = async (nom, src) => { const f = join(dir, nom + '.mjs'); writeFileSync(f, src); return (await import('file://' + f)).default; };

/* proxy de secrets : source dans le workflow */
const wf = lire('.github/workflows/sync-apex-secrets-to-cf-worker.yml');
const marque = "cat > /tmp/apex-secrets-proxy/src/index.js << 'EOF'";
const apres = wf.slice(wf.indexOf(marque) + marque.length + 1);
const proxy = await charge('proxy', apres.slice(0, apres.indexOf('\n          EOF')).split('\n').map((l) => l.replace(/^ {10}/, '')).join('\n'));
const push = await charge('push', lire('tools/cloudflare/apex-push-worker.js'));
const auth = await charge('auth', lire('services/apex-auth-worker/src/index.js').replace(/from "\.\/(cmc-hash|membre)\.js"/g, (m, n) => `from "${join(ROOT, 'services/apex-auth-worker/src', n + '.js')}"`));
const coffre = await charge('coffre', lire('services/coffre-r2/src/index.js'));

const ENV = { APEX_ADMIN_PIN_SHA256: 'a'.repeat(64), ACCOUNTS: { get: async () => null, put: async () => {}, delete: async () => {} } };
const demande = (w, path, origine, methode = 'GET') => w.fetch(new Request('https://w.example' + path, { method: methode, headers: origine ? { Origin: origine } : {} }), ENV, { waitUntil() {} });
const ETRANGER = 'https://evil.example', DOMAINE = 'https://apex-ai.kd-mc.com';
const SERVICES = [['proxy de secrets', proxy, '/health'], ['push', push, '/health'], ['auth', auth, '/health']];

for (const [nom, w, chemin] of SERVICES) {
  for (const methode of ['GET', 'OPTIONS']) {
    const r = await demande(w, chemin, ETRANGER, methode);
    dis(r.headers.get('access-control-allow-origin') === null, `${nom} (${methode}) : un site étranger ne reçoit AUCUN Access-Control-Allow-Origin (reçu : ${r.headers.get('access-control-allow-origin')})`);
  }
  for (const o of [DOMAINE, 'https://kd-mc.com', 'https://9r4rxssx64-creator.github.io', 'capacitor://localhost']) {
    const r = await demande(w, chemin, o, 'OPTIONS');
    dis(r.headers.get('access-control-allow-origin') === o, `${nom} : ${o} reçoit sa propre origine`);
  }
  const r = await demande(w, chemin, 'https://kd-mc.com.evil.example');
  dis(r.headers.get('access-control-allow-origin') === null, `${nom} : « kd-mc.com.evil.example » (faux sous-domaine) est refusé`);
  dis(/origin/i.test((await demande(w, chemin, DOMAINE)).headers.get('vary') || ''), `${nom} : Vary: Origin présent`);
}
for (const [o, attendu] of [[DOMAINE, DOMAINE], ['https://kd-mc.com', 'https://kd-mc.com'], ['https://9r4rxssx64-creator.github.io', 'https://9r4rxssx64-creator.github.io']]) {
  const r = await demande(coffre, '/health', o);
  dis(r.headers.get('access-control-allow-origin') === attendu, `coffre R2 : ${o} accepté`);
}
dis((await demande(coffre, '/health', ETRANGER)).headers.get('access-control-allow-origin') !== ETRANGER, 'coffre R2 : un site étranger n\'est jamais reflété');
console.log(`\n=== ${ok} OK / ${ko} FAIL ===`);
process.exit(ko ? 1 : 0);
