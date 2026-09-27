#!/usr/bin/env node
/* ============================================================================
 * GARDE — la sonde « 31 adresses » ne prend plus une PORTE pour une PANNE
 * ----------------------------------------------------------------------------
 * Mesuré le 27.09.2026 : depuis les portes par DOSSIER du routeur, le livre de
 * cuisine (cuisine / cocina / cujina) répond 401 texte à qui ne se présente pas
 * comme un navigateur, et une petite page « porte » (200, `x-kdmc-porte`) à un
 * navigateur. La sonde du déploiement (tools/audit/sonde-site-publie.mjs) ne
 * mettait pas les en-têtes d'un navigateur → 3 ❌ → le déploiement du routeur
 * restait rouge à chaque livraison (runs 36314626122, 36336460747).
 *
 * Ici, un FAUX routeur local rejoue exactement ce comportement, et on vérifie :
 *   A. la sonde passe la porte comme un navigateur et va vérifier le contenu
 *      DERRIÈRE, chez l'hébergeur → 0 échec ;
 *   B. si le contenu manque chez l'hébergeur, la porte ne masque rien → échec ;
 *   C. la sonde envoie bien `Sec-Fetch-Dest: document` (sinon 401, cf. A).
 * Sabotage prouvé : sans les en-têtes → A rouge ; sans la lecture derrière la
 * porte → B vert à tort → ce test échoue.
 * ========================================================================== */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const src = readFileSync('services/kdmc-router/worker.js', 'utf8');
const bloc = src.slice(src.indexOf('const ROUTES'), src.indexOf('// Proxy MÊME ORIGINE'));
const ROUTES = [...bloc.matchAll(/'([a-z0-9.-]+\.kd-mc\.com|kd-mc\.com)'\s*:\s*'\/CMCteams\/?([^']*)'/g)]
  .map((m) => ({ hote: m[1], dossier: m[2] }));
const FERMEES = new Set(['cuisine.kd-mc.com', 'cocina.kd-mc.com', 'cujina.kd-mc.com']);
const DOSSIER_CUISINE = 'tools/cuisine';

let ok = 0, ko = 0;
const test = (nom, cond, detail = '') => { if (cond) { ok++; console.log('  ✓ ' + nom); } else { ko++; console.log('  ✗ ' + nom + (detail ? ' — ' + detail : '')); } };

function page(txt) { return ('<!doctype html><html><head><title>' + txt + '</title></head><body>' + txt + '</body></html>').padEnd(1000, ' .'); }

/* Le faux routeur : /<hôte>/ = le domaine ; /up/<dossier>/ = l'hébergeur derrière. */
const etat = { secFetchVu: {}, upstreamCuisine: true };
const serveur = createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/up/')) {
    const dossier = u.pathname.slice(4).replace(/\/$/, '');
    if (dossier === DOSSIER_CUISINE && !etat.upstreamCuisine) { res.writeHead(404, { 'content-type': 'text/html' }); return res.end('<html>pas là</html>'); }
    res.writeHead(200, { 'content-type': 'text/html' }); return res.end(page('hébergeur ' + dossier));
  }
  const hote = u.pathname.split('/')[1];
  const r = ROUTES.find((x) => x.hote === hote);
  if (!r) { res.writeHead(404); return res.end('inconnu'); }
  if (FERMEES.has(hote)) {
    etat.secFetchVu[hote] = req.headers['sec-fetch-dest'] || '';
    if (req.headers['sec-fetch-dest'] !== 'document') { res.writeHead(401, { 'content-type': 'text/plain' }); return res.end('porte fermée'); }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'x-kdmc-porte': 'fiche', 'cache-control': 'no-store' });
    return res.end('<!doctype html><html><head><title>A Cüjina de Mùnegu — connexion</title></head><body data-return="https://' + hote + '/"><h1>🔒</h1><script src="/__sso/porte.js"></script></body></html>');
  }
  res.writeHead(200, { 'content-type': 'text/html' }); res.end(page('domaine ' + (r.dossier || 'racine')));
});

await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + serveur.address().port;

/* spawn ASYNCHRONE : avec spawnSync, la boucle d'événements du test est bloquée et le
   faux routeur (dans ce même processus) ne répond jamais → la sonde attend 25 s par adresse. */
function sonde() {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, ['tools/audit/sonde-site-publie.mjs', 'https://kd-mc.com'], {
      env: { ...process.env, SONDE_HOTE_BASE: base, SONDE_UPSTREAM: base + '/up' },
    });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', (code) => resolve({ code, out }));
  });
}

console.log('A. portes fermées + contenu présent derrière → tout est servi');
const a = await sonde();
test('la sonde sort en 0 (aucune adresse en échec)', a.code === 0, 'code ' + a.code + '\n' + a.out.slice(-600));
test('0 en échec, affiché', /\/ 0 en échec ===/.test(a.out));
test('les 3 adresses du livre sont marquées « derrière une porte », pas « en panne »', /🔒 3 adresse\(s\) derrière une porte/.test(a.out));
test('chaque ligne du livre nomme la porte et l’adresse vérifiée derrière', (a.out.match(/🔒 porte « fiche » → contenu vérifié derrière \(.*\/up\/tools\/cuisine\/\)/g) || []).length === 3);

console.log('C. la sonde se présente comme un navigateur (Sec-Fetch-Dest: document)');
for (const h of FERMEES) test('Sec-Fetch-Dest reçu pour ' + h, etat.secFetchVu[h] === 'document', JSON.stringify(etat.secFetchVu[h]));

console.log('B. porte fermée mais contenu ABSENT chez l’hébergeur → la porte ne masque rien');
etat.upstreamCuisine = false;
const b = await sonde();
test('la sonde sort en 1', b.code === 1, 'code ' + b.code);
test('les 3 adresses du livre sont en ❌ (HTTP 404 derrière la porte)', (b.out.match(/❌ (cuisine|cocina|cujina)\.kd-mc\.com\s+404/g) || []).length === 3, b.out.slice(-500));
test('les autres adresses restent ✅', /=== \d+ servies \/ 3 en échec ===/.test(b.out));

serveur.close();
console.log(`\n${ok} OK / ${ko} FAIL`);
if (ko) { console.log('❌ verify-sonde-porte : la sonde du déploiement confond encore porte et panne'); process.exit(1); }
console.log('✅ verify-sonde-porte : la sonde passe la porte comme un navigateur et vérifie le contenu derrière');
