/* GARDE — la sonde « Lingua comme Kevin » (tools/smoke/lingua-comme-kevin.mjs) AVANT de la lancer sur le vrai compte.
 * Kevin 16.10.2026 : « Connecte-toi comme moi et teste tout dans Lingua réel, comme moi ».
 * Une copie fidèle tourne ici : le VRAI routeur (porte générale active, cercle D1, IA simulée au niveau de la liaison
 * AI) sert Lingua, et la sonde s'y connecte comme Kevin par le vrai chemin (code admin de TEST → /__admin/login).
 *   1. la sonde dit OK : son compte, l'accueil, les onglets, la vraie vie + une leçon, un appel avec réponses de
 *      l'IA et bilan, le cercle, le profil, le traducteur ;
 *   2. SON COMPTE NE BOUGE PAS : le serveur ne reçoit AUCUNE écriture (hors connexion et IA de l'appel) ;
 *   3. SABOTAGE : la même sonde sans sa garde (--sans-garde) → le serveur voit des écritures. Le compteur marche,
 *      donc le « 0 » du point 2 veut dire quelque chose.
 * node tests/verify-lingua-comme-kevin.mjs */
import http from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import mod from '../services/kdmc-router/worker.js';

let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d !== undefined ? '  → ' + String(d).slice(0, 400) : ''}`); };
function d1() { const s = new DatabaseSync(':memory:');
  const st = (sql, p = []) => ({ bind: (...x) => st(sql, x), first: async () => s.prepare(sql).get(...p) ?? null, all: async () => ({ results: s.prepare(sql).all(...p) }),
    run: async () => { const r = s.prepare(sql).run(...p); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }, _x: () => s.prepare(sql).run(...p) });
  return { prepare: (q) => st(q), batch: async (l) => { for (const x of l) x._x(); return []; }, exec: async (q) => { s.exec(q); } }; }
const TYPES = { html: 'text/html', js: 'application/javascript', css: 'text/css', svg: 'image/svg+xml', webp: 'image/webp', webmanifest: 'application/manifest+json', json: 'application/json' };
const CODE_TEST = '424242';
const HASH = createHash('sha256').update(CODE_TEST).digest('hex');
const vrai = globalThis.fetch;
globalThis.fetch = async (u, i) => {
  const s = String((u && u.url) || u);
  const m = s.match(/pages\.dev\/lingua(\/[^?]*)?/);
  if (m) { const f = 'lingua' + ((m[1] && m[1] !== '/') ? m[1] : '/index.html');
    return existsSync(f) ? new Response(readFileSync(f), { headers: { 'content-type': TYPES[f.split('.').pop()] || 'application/octet-stream' } }) : new Response('', { status: 404 }); }
  if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(s)) return vrai(u, i);
  return new Response('{}', { status: 404 });
};
const AI = { run(model, input) { const sys = (input.messages || [])[0]?.content || '';
  if (/UNIQUEMENT par un objet JSON/.test(sys)) return { response: '{"bravo":"Belle phrase !","corrections":[{"dit":"I eat with my family","mieux":"I eat with my family every day","pourquoi":"Plus naturel."}]}' };
  return { response: /PHASE FIN/.test(sys) ? 'Great job. Bye!' : 'Nice! And what do you like to eat?' }; } };
const kv = new Map();
const env = () => ({ KDMC_SSO_SECRET: 'sec', KDMC_ADMIN_PIN_SHA256: HASH, AI, CERCLE_DB: d1(),
  ACCOUNTS: { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); }, list: async () => ({ keys: [] }) } });

function serveur(port, E, ecritures) {
  return new Promise((res) => {
    const srv = http.createServer(async (req, rep) => {
      try {
        const corps = ['GET', 'HEAD'].includes(req.method) ? undefined : await new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)); });
        const hote = req.headers['x-hote'] || 'kd-mc.com';
        const h = Object.assign({}, req.headers); delete h.host; delete h['x-hote'];
        if (h.origin && /localhost/.test(h.origin)) h.origin = 'https://' + hote;
        const chemin = req.url.split('?')[0];
        let mode = ''; try { mode = JSON.parse(corps || '{}').mode || ''; } catch {}
        if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && chemin !== '/__admin/login' && !(chemin === '/__lingua/ai' && /^appel/.test(mode))) ecritures.push(req.method + ' ' + hote + chemin);
        const rq = new Request('https://' + hote + req.url, { method: req.method, headers: h, body: corps });
        Object.defineProperty(rq, 'cf', { value: { asn: 8075 } });
        const r = await mod.fetch(rq, E, { waitUntil() {} });
        const hh = {}; r.headers.forEach((v, k) => { if (k !== 'strict-transport-security') hh[k] = v; });
        rep.writeHead(r.status, hh); rep.end(Buffer.from(await r.arrayBuffer()));
      } catch (e) { rep.writeHead(500); rep.end(String(e)); }
    });
    srv.listen(port, () => res(srv));
  });
}
const lancer = (port, extra = []) => new Promise((res) => {
  const c = spawn(process.execPath, ['tools/smoke/lingua-comme-kevin.mjs', 'https://lingua.kd-mc.com', '--portail=http://localhost:' + port, '--rediriger=http://localhost:' + port,
    '--captures=' + (process.env.CAPTURES || '/tmp/claude-0/lingua-comme-kevin'), ...extra], { env: Object.assign({}, process.env, { KDMC_ADMIN_PIN_SHA256: HASH }) });
  let out = ''; c.stdout.on('data', (d) => (out += d)); c.stderr.on('data', (d) => (out += d));
  const t = setTimeout(() => c.kill("SIGKILL"), 480000);
  c.on('close', (status) => { clearTimeout(t); res({ status, out }); });
});

console.log('\nLingua comme Kevin — la sonde contre une copie fidèle (vrai routeur)\n');
/* 1 + 2 */
let ecr = []; let S = await serveur(8798, env(), ecr);
let r = await lancer(8798);
const lignes = r.out.split('\n');
ok(r.status === 0 && /=== LINGUA COMME KEVIN OK/.test(r.out), '1. la sonde dit OK contre la copie fidèle (sortie 0)', lignes.filter((l) => /❌|ÉCHEC|Error/.test(l)).join(' | ') || r.out.slice(-500));
ok(/session de Kevin ouverte pour de vrai/.test(r.out) && /s'ouvre directement sur TON compte/.test(r.out), '1b. connectée comme Kevin par le vrai chemin, Lingua s\'ouvre sur SON compte');
ok(/✅ [^\n]*Bee répond pour de vrai/.test(r.out) && /✅ [^\n]*bilan de fin d'appel affiché/.test(r.out), '1c. l\'appel passe par l\'IA (réponses + bilan)');
ok(/✅ leçon jouée jusqu'au bout/.test(r.out) && /La vraie vie » : 10 situations, 20 leçons/.test(r.out), '1d. la vraie vie et une leçon jouée jusqu\'au bout');
ok(/✅ rien ne cache tes onglets ni le haut de l'écran/.test(r.out) && /✅ ta sortie « 🚪 Portail » est dans la barre du bas/.test(r.out), '1e. iPhone « installé » : rien ne cache les onglets ni le haut, la sortie Portail est dans la barre (photo du 17.10)');
ok(ecr.length === 0, '2. SON COMPTE NE BOUGE PAS : le serveur n\'a reçu AUCUNE écriture', ecr.slice(0, 8).join(' | '));
ok(/ton compte n'a pas bougé : [1-9]\d* écriture/.test(r.out), '2b. et la sonde dit combien d\'écritures elle a coupées (> 0 : il y avait bien de quoi couper)', (r.out.match(/ton compte n'a pas bougé[^\n]*/) || [''])[0]);
ok(!/kdmc_sso=|U11804|KEVIN DESARZENS|Kevin DESARZENS/.test(r.out), '2c. le journal ne contient ni jeton, ni identifiant, ni nom (il peut être public)');
S.close();
/* 3. sabotage */
ecr = []; S = await serveur(8798, env(), ecr);
r = await lancer(8798, ['--sans-garde', '--rapide']);
ok(ecr.length > 0, `3. SABOTAGE (sans la garde) : le serveur voit ${ecr.length} écriture(s) — le compteur du point 2 est réel`, r.out.slice(-300));
S.close();
/* 4. refus de sécurité */
const refus = await new Promise((res) => { const c = spawn(process.execPath, ['tools/smoke/lingua-comme-kevin.mjs', 'https://lingua.kd-mc.com', '--sans-garde']); c.on('close', (s) => res(s)); });
ok(refus === 2, '4. --sans-garde sans copie locale (donc sur le vrai compte) → refusé d\'office');

console.log(`\n=== ${pass} OK / ${fail} FAIL ===`); process.exit(fail ? 1 : 0);
