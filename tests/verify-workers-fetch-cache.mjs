/* GARDE — JAMAIS `cache:` DANS UN fetch CÔTÉ WORKER (25.10.2026, panne réelle vue par le robot « comme Kevin »)
 *
 * Mesuré sur le vrai domaine (run public 40205002932) : chaque appel authentifié à crea-ai.kd-mc.com rendait
 *   502 « whoami_exc : The 'cache' field on 'RequestInitializerDict' is not implemented. »
 * L'option `cache` de fetch n'existe que dans un NAVIGATEUR ; le runtime des Workers Cloudflare la refuse et jette.
 * Elle a été posée le 23.10 (commit 53b26dd) dans la porte « compte vérifié » de TROIS workers (crea-ai, social, vente) :
 * depuis, toute l'IA du Studio, et toute route à compte de social/vente, répondaient « Connecte-toi… » à tout le monde.
 *
 *   1) statique : aucun services/*\/worker.js (ni services/*\/*.js côté serveur) n'appelle fetch(...) avec `cache: 'no-store'`
 *      (les pages SERVIES aux navigateurs — chaînes de code client — ne sont pas concernées : on ne vise que les appels à guillemets simples) ;
 *   2) dynamique : le worker crea-ai passe sa porte même quand fetch REFUSE l'option (comme le vrai runtime) ;
 *   3) sabotage (--sabotage) : on remet `cache: 'no-store'` dans la porte de crea-ai → 2) DOIT rougir.
 * node tests/verify-workers-fetch-cache.mjs [--sabotage]
 */
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';

const SABOTAGE = process.argv.includes('--sabotage');
let ok = 0, ko = 0;
const t = (c, m) => { if (c) { ok++; console.log('  ✅ ' + m); } else { ko++; console.log('  ❌ ' + m); } };
const RACINE = new URL('..', import.meta.url).pathname;

/* 1) statique */
const fichiers = [];
for (const d of fs.readdirSync(path.join(RACINE, 'services'), { withFileTypes: true })) {
  if (!d.isDirectory()) continue;
  const dir = path.join(RACINE, 'services', d.name);
  for (const f of fs.readdirSync(dir)) if (/\.(m?js)$/.test(f) && !/\.test\.|\.spec\./.test(f) && !/client|page|widget|partout|bouton|installer-client/.test(f)) fichiers.push(path.join(dir, f));
}
const fautifs = [];
for (const f of fichiers) {
  const src = fs.readFileSync(f, 'utf8');
  const re = /fetch\(([^;]{0,500}?)cache:\s*'no-store'/g; let m;
  while ((m = re.exec(src))) {
    /* une chaîne de code CLIENT servie par le worker (ex. `+ '…fetch("/health",{cache:"no-store"…'`) utilise des guillemets doubles : exclue par le motif */
    fautifs.push(path.relative(RACINE, f) + ' → ' + m[0].replace(/\s+/g, ' ').slice(0, 110));
  }
}
t(fautifs.length === 0, `aucun fetch côté worker avec l'option cache ('no-store') dans ${fichiers.length} fichiers de services` + (fautifs.length ? ' — ' + fautifs.join(' | ') : ''));

/* 2) dynamique : crea-ai passe sa porte avec un fetch qui REFUSE l'option (comme le vrai runtime) */
let workerPath = new URL('../services/kdmc-crea-ai/worker.js', import.meta.url).href;
if (SABOTAGE) {
  let src = fs.readFileSync(new URL('../services/kdmc-crea-ai/worker.js', import.meta.url), 'utf8');
  const avant = src;
  src = src.replace("{ headers: Object.assign({ 'cache-control': 'no-cache' }, entetes) });", "{ headers: entetes, cache: 'no-store' });");
  if (src === avant) { console.log('  ❌ sabotage impossible : la porte de crea-ai n\'a pas la forme attendue'); process.exit(1); }
  const tmp = path.join(os.tmpdir(), 'crea-worker-cache-' + process.pid + '.js'); fs.writeFileSync(tmp, src); workerPath = 'file://' + tmp;
}
const worker = (await import(workerPath)).default;
let whoamiVu = 0;
global.fetch = async (u, o) => {
  if (o && Object.prototype.hasOwnProperty.call(o, 'cache')) throw new TypeError("The 'cache' field on 'RequestInitializerDict' is not implemented.");
  const url = String(u);
  if (url.includes('/__sso/whoami')) { whoamiVu++; return new Response(JSON.stringify({ ok: true, uid: 'test', verified: true }), { status: 200 }); }
  if (/generativelanguage\.googleapis\.com/.test(url)) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inline_data: { mime_type: 'image/png', data: Buffer.from('IMG').toString('base64') } }] } }] }), { status: 200 });
  return new Response('{}', { status: 404 });
};
const PIX = 'data:image/jpeg;base64,' + Buffer.from('FAKE').toString('base64');
const r = await worker.fetch(new Request('https://crea-ai.test/cartoon', { method: 'POST', headers: { authorization: 'Bearer t', 'content-type': 'application/json' }, body: JSON.stringify({ image: PIX, style: 'cartoon' }) }), { GEMINI_API_KEY: 'k', KDMC_SSO_URL: 'https://sso.test' });
let detail = ''; if (r.status !== 200) { try { detail = JSON.stringify(await r.json()).slice(0, 160); } catch (_) { /* pas JSON */ } }
t(r.status === 200 && whoamiVu === 1, `la porte « compte vérifié » de crea-ai passe avec un fetch qui refuse l'option cache (HTTP ${r.status}${detail ? ' ' + detail : ''})`);

console.log(`\n${ok} OK / ${ko} échec(s)` + (SABOTAGE ? ' — attendu : rouge' : ''));
if (SABOTAGE) process.exit(ko >= 1 ? 0 : 1);
process.exit(ko ? 1 : 0);
