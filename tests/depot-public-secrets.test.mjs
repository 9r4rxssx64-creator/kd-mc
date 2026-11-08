/* Le robot de bascule recopie les ~107 clés de Kevin dans le dépôt public. On le fait tourner
 * contre un FAUX GitHub local : chaque clé doit arriver chiffrée, se déchiffrer À L'IDENTIQUE,
 * le jeton temporaire ne doit pas partir, et AUCUNE valeur ne doit apparaître dans le journal.
 * (Kevin 24.09.2026 — « dépôt public tout neuf ».)
 *
 * libsodium n'est pas une dépendance du projet : on l'installe dans un dossier temporaire
 * (registre npm). Si l'installation échoue, le test ÉCHOUE et le dit — jamais un faux vert.
 *
 *   node tests/depot-public-secrets.test.mjs
 */
import { mkdtempSync, copyFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawnSync } from 'node:child_process';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const T = mkdtempSync(join(tmpdir(), 'depot-public-secrets-'));
try {
  execSync('npm i --no-save --ignore-scripts --no-audit --no-fund libsodium-wrappers@0.7.15', { cwd: T, stdio: 'pipe', timeout: 120000 });
} catch (e) {
  console.log('❌ libsodium n’a pas pu être installé (registre npm injoignable ?) — contrôle NON EFFECTUÉ, donc échec.');
  process.exit(1);
}
copyFileSync(join(RACINE, 'tools/depot-public/poser-secrets.mjs'), join(T, 'poser-secrets.mjs'));
writeFileSync(join(T, 'faux-github.mjs'), "import http from 'node:http'; import sodium from 'libsodium-wrappers'; import { spawn } from 'node:child_process';\nawait sodium.ready;\nconst kp = sodium.crypto_box_keypair();\nconst recus = {};\nconst srv = http.createServer((req, res) => {\n  let b = ''; req.on('data', (d) => b += d); req.on('end', () => {\n    if (req.url.endsWith('/actions/secrets/public-key')) { res.end(JSON.stringify({ key_id: 'K1', key: sodium.to_base64(kp.publicKey, sodium.base64_variants.ORIGINAL) })); return; }\n    const m = req.url.match(/\\/actions\\/secrets\\/([^/]+)$/);\n    if (m && req.method === 'PUT') { recus[decodeURIComponent(m[1])] = JSON.parse(b); res.statusCode = 201; res.end(); return; }\n    res.statusCode = 404; res.end('{}');\n  });\n});\nawait new Promise((r) => srv.listen(0, '127.0.0.1', r));\nconst valeurs = { ANTHROPIC_API_KEY: 'sk-ant-api03-' + 'Zq9'.repeat(30), CLOUDFLARE_API_TOKEN: 'cf_' + Math.random().toString(36).slice(2), github_token: 'NE-DOIT-PAS-PARTIR', VIDE: '' };\nconst r = await new Promise((fini) => {\n  const c = spawn('node', ['poser-secrets.mjs'], { env: { ...process.env, GITHUB_API: 'http://127.0.0.1:' + srv.address().port, PAT: 'x', DEPOT_PUBLIC: 'moi/kd-mc', TOUS_LES_SECRETS: JSON.stringify(valeurs), EN_PLUS: JSON.stringify({ COFFRE_CLE_LECTURE: '-----BEGIN OPENSSH PRIVATE KEY-----\\nabc\\n' }) } });\n  let out = ''; c.stdout.on('data', (d) => out += d); c.stderr.on('data', (d) => out += d);\n  c.on('close', (code) => fini({ status: code, stdout: out, stderr: '' }));\n});\nsrv.close();\nconst journal = r.stdout + r.stderr;\nlet ok = 0, ko = 0; const dit = (c, t) => { if (c) { ok++; console.log('  \u2705 ' + t); } else { ko++; console.log('  \u274c ' + t); } };\ndit(r.status === 0, 'le script se termine sans erreur');\nconst dechiffre = (n) => sodium.to_string(sodium.crypto_box_seal_open(sodium.from_base64(recus[n].encrypted_value, sodium.base64_variants.ORIGINAL), kp.publicKey, kp.privateKey));\ndit(dechiffre('ANTHROPIC_API_KEY') === valeurs.ANTHROPIC_API_KEY, 'la cl\u00e9 Anthropic arrive chiffr\u00e9e et se d\u00e9chiffre \u00c0 L\u2019IDENTIQUE');\ndit(dechiffre('CLOUDFLARE_API_TOKEN') === valeurs.CLOUDFLARE_API_TOKEN, 'la cl\u00e9 Cloudflare aussi');\ndit(dechiffre('COFFRE_CLE_LECTURE').startsWith('-----BEGIN OPENSSH'), 'la cl\u00e9 de lecture du coffre (fabriqu\u00e9e par le robot) est pos\u00e9e');\ndit(!('github_token' in recus), 'le jeton propre \u00e0 chaque ex\u00e9cution n\u2019est PAS recopi\u00e9');\ndit(!('VIDE' in recus), 'une cl\u00e9 vide n\u2019est pas pos\u00e9e');\ndit(recus.ANTHROPIC_API_KEY.key_id === 'K1', 'chaque cl\u00e9 est scell\u00e9e avec la cl\u00e9 publique du d\u00e9p\u00f4t CIBLE');\ndit(!Object.values(valeurs).filter(Boolean).some((v) => journal.includes(v)), 'aucune valeur n\u2019appara\u00eet dans le journal');\nconsole.log('  journal du script : ' + journal.trim());\nconsole.log(`\\n${ok} OK \u00b7 ${ko} \u00e9chec(s)`); process.exit(ko ? 1 : 0);\n");
const r = spawnSync('node', ['faux-github.mjs'], { cwd: T, stdio: 'inherit', timeout: 60000 });
process.exit(r.status ?? 1);
