#!/usr/bin/env node
/* verify-journal-beatbot — PoolPilot / Beatbot (tools/poolrobot) écrit au JOURNAL DU DOMAINE (pont 2632, Kevin 17.11 :
 * « qui a fait quoi ou quand, de tout le domaine, chaque app ») : après chaque enregistrement réussi, UN appel
 * window.kdmcJournal("PoolPilot : <phrase>") ; jamais de valeur ni de nom dans la phrase ; jamais d'appel tout seul
 * (rien à l'ouverture, rien en attendant) ; jamais d'erreur si le script du domaine manque.
 * Sabotage : BEATBOT_RACINE=<ancienne copie du dépôt> → rouge. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, devices } from 'playwright';

const RACINE = process.env.BEATBOT_RACINE || new URL('..', import.meta.url).pathname;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
let ok = 0, ko = 0;
const vrai = (c, m) => { if (c) { ok++; console.log('  ✅ ' + m); } else { ko++; console.log('  ❌ ' + m); } };

const serveur = http.createServer((q, r) => {
  let f = path.join(RACINE, decodeURIComponent(q.url.split('?')[0]));
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!f.startsWith(path.resolve(RACINE)) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(r);
});
await new Promise((o) => serveur.listen(0, o));
const url = `http://127.0.0.1:${serveur.address().port}/tools/poolrobot/`;
const navigateur = await chromium.launch();

async function ouvrir(avecJournal) {
  const page = await navigateur.newPage(devices['iPhone 13']);
  const erreurs = []; page.on('pageerror', (e) => erreurs.push(e.message));
  if (avecJournal) await page.addInitScript(() => { window.__j = []; window.kdmcJournal = (t, ty) => { window.__j.push([t, ty]); }; });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
  await page.waitForSelector('#nav button', { timeout: 15000 }).catch(() => {});
  return { page, erreurs };
}
// chaque geste : [nom, code exécuté dans la page]
const GESTES = [
  ['resetMaint', () => resetMaint('filter')],
  ['delSession', () => delSession('inexistante')],
  ['applyPreset', () => applyPreset(Object.keys(PRESETS)[0])],
  ['setPerf', () => setPerf('usage', 'moyenne')],
  ['applySeason', () => applySeason(Object.keys(SEASONS)[0])],
  ['applyReco', () => applyReco()],
  ['delMarker', () => delMarker('inexistant')],
];

console.log('avec le script du domaine');
{
  const { page, erreurs } = await ouvrir(true);
  await page.waitForTimeout(3500);
  const auRepos = await page.evaluate(() => window.__j.length);
  vrai(auRepos === 0, `rien n'est écrit au journal à l'ouverture ni en attendant (${auRepos} appel)`);
  for (const [nom, geste] of GESTES) {
    const avant = await page.evaluate(() => window.__j.length);
    await page.evaluate(geste);
    const apres = await page.evaluate(() => window.__j.slice());
    const nouveaux = apres.slice(avant);
    vrai(nouveaux.length === 1, `${nom} : UN appel au journal (${nouveaux.length})`);
    const t = (nouveaux[0] || [''])[0];
    vrai(/^PoolPilot : [a-zàâçéèêëîïôûù' ]{4,60}$/i.test(t), `${nom} : phrase courte, sans valeur ni chiffre (« ${t} »)`);
  }
  vrai(erreurs.length === 0, `0 erreur JavaScript${erreurs.length ? ' : ' + erreurs[0] : ''}`);
  await page.close();
}
console.log('sans le script du domaine');
{
  const { page, erreurs } = await ouvrir(false);
  await page.waitForTimeout(1500);
  for (const [, geste] of GESTES) await page.evaluate(geste);
  vrai(erreurs.length === 0, `les 7 gestes passent sans erreur quand le journal n'existe pas${erreurs.length ? ' : ' + erreurs[0] : ''}`);
  await page.close();
}
await navigateur.close(); serveur.close();
console.log(`\n${ok} ✅ · ${ko} ❌`);
process.exit(ko ? 1 : 0);
