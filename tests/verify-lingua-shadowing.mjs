/* GARDE — « Écoute, répète, compare » dans l'atelier prononciation (2.10), vrai navigateur, micro simulé.
 *   1. le bouton existe dans l'atelier ;
 *   2. il enregistre, puis propose « le modèle / moi / les deux » ;
 *   3. l'auto-évaluation 😄 donne +2 XP et nourrit la révision espacée (fiche FSRS du mot) ;
 *   4. rien n'est envoyé : aucune requête vers le domaine pendant l'exercice (hors voix du modèle) ;
 *   5. sans micro autorisé, un message clair (pas de plantage).
 * node tests/verify-lingua-shadowing.mjs */
import { chromium } from 'playwright';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', 'lingua');
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const reqs = [];
const srv = http.createServer((q, r) => { reqs.push(q.url); const p = decodeURIComponent(q.url.split('?')[0]);
  if (p.startsWith('/__')) { r.writeHead(200, { 'content-type': 'application/json' }); return r.end('{"ok":false}'); }
  const f = join(RACINE, p === '/' ? 'index.html' : p); if (!existsSync(f)) { r.writeHead(404); return r.end(''); }
  r.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' }); r.end(readFileSync(f)); });
await new Promise((res) => srv.listen(0, '127.0.0.1', res));
const BASE = 'http://127.0.0.1:' + srv.address().port;
const seed = () => { localStorage.setItem('lingua_g_accounts', JSON.stringify([{ id: 'a1', name: 'Test Ombre', avatar: '🦊', code: '', created: 1 }]));
  localStorage.setItem('lingua_g_current', JSON.stringify('a1')); localStorage.setItem('lingua_a_a1_course', JSON.stringify('en')); localStorage.setItem('lingua_a_a1_sound', 'false'); localStorage.setItem('lingua_a_a1_placeAsked', 'true'); };
const erreurs = [];
async function ouvrir(args) {
  const nav = await chromium.launch({ args });
  const ctx = await nav.newContext({ permissions: args.length ? ['microphone'] : [] , serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', (e) => erreurs.push(e.message)); await p.addInitScript(seed);
  await p.goto(BASE + '/'); await p.waitForTimeout(1200);
  await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Atelier prononciation/.test(b.textContent))?.click());
  await p.waitForTimeout(800);
  return { nav, p };
}
let { nav, p } = await ouvrir(['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']);
ok(!!(await p.$('#pnShadow')), '1. l\'atelier propose « 🎙️ Répète et compare »');
const xp0 = await p.evaluate(() => +JSON.parse(localStorage.getItem('lingua_a_a1_xp') || '0'));
const n0 = reqs.length;
await p.click('#pnShadow');
await p.waitForSelector('#shDeux', { timeout: 15000 }).catch(() => {});
ok(!!(await p.$('#shMod')) && !!(await p.$('#shMoi')) && !!(await p.$('#shDeux')), '2. après l\'enregistrement : « le modèle », « moi », « les deux »');
await p.click('[data-n="3"]'); await p.waitForTimeout(400);
const etat = await p.evaluate(() => ({ xp: +JSON.parse(localStorage.getItem('lingua_a_a1_xp') || '0'), srs: JSON.parse(localStorage.getItem('lingua_a_a1_srs') || '{}') }));
const fiches = Object.values(etat.srs.en || {});
ok(etat.xp === xp0 + 2 && fiches.some((f) => f.st > 0 && f.reps === 1), `3. 😄 → +2 XP (${xp0} → ${etat.xp}) et fiche FSRS du mot créée`);
ok(reqs.slice(n0).filter((u) => !/\/__lingua\/tts|sw\.js\?_v=/.test(u)).length === 0, `4. aucune requête au domaine pendant l'exercice (${reqs.slice(n0).join(', ') || 'aucune'})`);
await nav.close();
({ nav, p } = await ouvrir([]));
await p.evaluate(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new Error('refusé')); });
await p.click('#pnShadow'); await p.waitForTimeout(3500);
ok(/Micro refusé/.test(await p.evaluate(() => document.getElementById('pnShadowZone')?.innerText || '')), '5. micro refusé → message clair, pas de plantage');
await nav.close(); srv.close();
ok(erreurs.length === 0, `6. aucune erreur JavaScript${erreurs.length ? ' — ' + erreurs[0] : ''}`);
console.log(`\n=== ${pass} OK / ${fail} FAIL ===`); process.exit(fail ? 1 : 0);
