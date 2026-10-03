/* GARDE — la sonde « comme Kevin sur trois appareils » (tools/smoke/verif-appareils.mjs) est elle-même
 * vérifiée AVANT de dépenser une vérification réelle (plafond : 2 par jour) :
 *   1. contre une copie fidèle servie sur localhost (Lingua + portail + routeur avec sa base D1), elle
 *      dit OK — chaque appareil passe ses écrans, 0 requête non-GET, portes du cercle fermées ;
 *   2. SABOTAGE : la même copie SANS la base du cercle (liaison CERCLE_DB absente) → elle dit ÉCHEC et
 *      nomme la porte qui ne répond pas. Une sonde qui ne rougit jamais ne prouve rien.
 * Ici, WebKit n'est pas installé : l'iPhone est joué par Chromium et la sonde le DIT (en CI : vrai WebKit).
 * node tests/verify-verif-appareils.mjs
 */
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import mod from '../services/kdmc-router/worker.js';

let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d !== undefined ? '  → ' + String(d).slice(0, 300) : ''}`); };
function d1() { const s = new DatabaseSync(':memory:');
  const st = (sql, p = []) => ({ bind: (...x) => st(sql, x), first: async () => s.prepare(sql).get(...p) ?? null, all: async () => ({ results: s.prepare(sql).all(...p) }),
    run: async () => { const r = s.prepare(sql).run(...p); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }, _x: () => s.prepare(sql).run(...p) });
  return { prepare: (q) => st(q), batch: async (l) => { for (const x of l) x._x(); return []; } }; }
const TYPES = { html: 'text/html', js: 'application/javascript', css: 'text/css', svg: 'image/svg+xml', webp: 'image/webp', webmanifest: 'application/manifest+json', json: 'application/json' };
function serveur(port, dossier, hote, env) {
  return new Promise((res) => {
    const srv = http.createServer(async (req, rep) => {
      try {
        const u = new URL(req.url, 'https://' + hote);
        if (u.pathname.startsWith('/__')) {
          const corps = ['GET', 'HEAD'].includes(req.method) ? undefined : await new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)); });
          const h = Object.assign({}, req.headers); delete h.host;
          const r = await mod.fetch(new Request('https://' + hote + req.url, { method: req.method, headers: h, body: corps }), env, { waitUntil() {} });
          const hh = {}; r.headers.forEach((v, k) => { hh[k] = v; });
          rep.writeHead(r.status, hh); rep.end(Buffer.from(await r.arrayBuffer())); return;
        }
        const f = dossier + (u.pathname === '/' ? '/index.html' : u.pathname);
        if (!existsSync(f)) { rep.writeHead(404); rep.end(''); return; }
        rep.writeHead(200, { 'content-type': TYPES[f.split('.').pop()] || 'application/octet-stream' }); rep.end(readFileSync(f));
      } catch (e) { rep.writeHead(500); rep.end(String(e)); }
    });
    srv.listen(port, () => res(srv));
  });
}
const kv = new Map();
/* le service de notifications (appel de Bee, v2.134.0) : simulé ici, sa clé publique sur /health */
const _vraiFetch = globalThis.fetch;
globalThis.fetch = async (u, i) => (String(u) === 'https://push.test/health' ? new Response(JSON.stringify({ ok: true, vapidPublic: 'B'.repeat(87) })) : _vraiFetch(u, i));
const env = (avecCercle) => Object.assign({ KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: 'a'.repeat(64), KDMC_PUSH_URL: 'https://push.test',
  ACCOUNTS: { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } } }, avecCercle ? { CERCLE_DB: d1() } : {});

/* asynchrone, OBLIGATOIRE : un lancement synchrone gèlerait la boucle d'événements… et donc le serveur
   de ce même processus — la sonde ne verrait jamais la copie (mesuré : 100 % de délais dépassés). */
const lancer = (portL, portP) => new Promise((res) => {
  const c = spawn(process.execPath, ['tools/smoke/verif-appareils.mjs', 'http://localhost:' + portL, '--portail=http://localhost:' + portP, '--moteurs=chromium', '--captures=' + (process.env.CAPTURES || '/tmp/claude-0/verif-appareils')]);
  let out = ''; c.stdout.on('data', (d) => (out += d)); c.stderr.on('data', (d) => (out += d));
  const t = setTimeout(() => c.kill('SIGKILL'), 240000);
  c.on('close', (status) => { clearTimeout(t); res({ status, out }); });
});

/* 1. copie fidèle → OK */
let L = await serveur(8796, 'lingua', 'lingua.kd-mc.com', env(true)), P = await serveur(8797, 'kdmc-home', 'kd-mc.com', env(true));
let r = await lancer(8796, 8797); let out = r.out;
ok(r.status === 0 && /=== VÉRIF APPAREILS OK/.test(out), '1. contre la copie fidèle : la sonde dit OK (sortie 0)', out.split('\n').filter((l) => /❌|ÉCHEC|Error/.test(l)).join(' | ') || out.slice(-400));
ok((out.match(/^— /gm) || []).length === 3 && /joué par chromium/.test(out), '1b. trois appareils joués ; sans WebKit ici, l\'iPhone est joué par Chromium et c\'est DIT');
ok(/version servie : v2\.\d+\.\d+/.test(out), '1c. la version servie est lue et nommée', (out.match(/version servie[^\n]*/) || [''])[0]);
ok(/\[iphone[^\]]*\] la page n'a RIEN posté/.test(out) && /\[android\] la page n'a RIEN posté/.test(out) && /\[ordinateur\] la page n'a RIEN posté/.test(out), '1d. sur chaque appareil : 0 requête non-GET (aucun compte créé)');
ok(/\[cercle\] un site extérieur ne peut rien poster/.test(out) && /\[cercle\] la boîte de l'admin est fermée/.test(out), '1e. les portes du cercle sont contrôlées de l\'extérieur');
L.close(); P.close();

/* 2. SABOTAGE : sans la base du cercle → ÉCHEC nommé */
L = await serveur(8796, 'lingua', 'lingua.kd-mc.com', env(false)); P = await serveur(8797, 'kdmc-home', 'kd-mc.com', env(false));
r = await lancer(8796, 8797); out = r.out;
ok(r.status === 1 && /=== VÉRIF APPAREILS ÉCHEC/.test(out), '2. SABOTAGE (base du cercle absente) : la sonde dit ÉCHEC (sortie 1)', out.slice(-300));
ok(/❌ \[cercle\] un lien d'invitation inconnu est refusé proprement/.test(out), '2b. et nomme la porte qui ne répond pas (invitation)');
L.close(); P.close();

console.log(`\n=== ${pass} OK / ${fail} FAIL ===`); process.exit(fail ? 1 : 0);
