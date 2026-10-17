import { createRequire } from 'node:module';
import https from 'node:https';
import { readFileSync } from 'node:fs';
const OUTILS = process.env.OUTILS_LOCAL || '/tmp/local-reel';   // où lancer.sh a installé wrangler / esbuild / le paquet
const require = createRequire(OUTILS + '/wr/');
const { Miniflare } = require('miniflare');
const wr = await import(require.resolve('wrangler'));
/* Le VRAI routeur (worker.js empaqueté comme le fait wrangler : esbuild + keep_names) dans workerd (Miniflare), avec les VRAIES pages (public/ de prepare-secours.mjs). Un petit serveur https
   transmet chaque requête AVEC son adresse (lingua.kd-mc.com…) : `wrangler dev` la réécrit en 127.0.0.1, donc toutes les adresses y ressemblent au portail. L'IA (Workers AI) est retirée :
   en local elle facturerait le compte — aucune réponse de Bee n'est demandée ici. Code admin = un code JETABLE (HASH_LOCAL), jamais le vrai. */
const CONF = process.env.CONF, HASH = process.env.HASH_LOCAL;
const { workerOptions } = wr.unstable_getMiniflareWorkerOptions(CONF);
const opts = Object.assign({}, workerOptions, { modules: true, scriptPath: OUTILS + '/worker.mjs', modulesRoot: OUTILS, script: undefined, name: 'kdmc-router',
  bindings: Object.assign({}, workerOptions.bindings, { KDMC_SSO_SECRET: 'secret-local-123', KDMC_ADMIN_PIN_SHA256: HASH }) });
delete opts.script; delete opts.ai; delete opts.wrappedBindings;
const mf = new Miniflare(opts);
await mf.ready;
const srv = https.createServer({ key: readFileSync(OUTILS + '/key.pem'), cert: readFileSync(OUTILS + '/cert.pem') }, async (req, res) => {
  try {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = chunks.length && !['GET', 'HEAD'].includes(req.method) ? Buffer.concat(chunks) : undefined;
    const h = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (!/^(host|connection|content-length|transfer-encoding)$/i.test(k)) h.set(k, Array.isArray(v) ? v.join(', ') : v);
    const r = await mf.dispatchFetch('https://' + req.headers.host + req.url, { method: req.method, headers: h, body, redirect: 'manual' });
    const out = {}; for (const [k, v] of r.headers) if (!/^(set-cookie|content-encoding|content-length|transfer-encoding)$/i.test(k)) out[k] = v;
    const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : []; if (sc.length) out['set-cookie'] = sc;
    res.writeHead(r.status, out); res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) { res.writeHead(500, { 'content-type': 'text/plain' }); res.end('local: ' + String(e && e.message || e).slice(0, 300)); }
});
srv.listen(8787, '127.0.0.1', () => console.log('PRET https://127.0.0.1:8787'));
