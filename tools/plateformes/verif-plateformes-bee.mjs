#!/usr/bin/env node
/* Bee — TOUTES LES PLATEFORMES (Kevin 22.10.2026 : « teste toujours tout sur l'ordinateur, iPhone, Android, toutes les plateformes… aucun bug visuel,
   fonctionnel, de fluidité »). Même principe que tools/plateformes/verif-plateformes.mjs (l'arbre) pour la petite Bee et sa fenêtre :
   le VRAI widget du dépôt (javis/javis-widget.js), Kevin reconnu par un faux domaine local (/__sso/whoami), un faux cerveau (/__javis/ai) ;
   aucun appel au vrai domaine, aucune donnée, aucun secret. Deux surfaces :
     · l'app Bee (javis/index.html : la fenêtre est toujours ouverte) ;
     · Bee posée sur une AUTRE app du domaine (page hôte minimale : le rond flottant, puis la fenêtre qu'il ouvre).
   Par appareil et par surface :
     · 0 erreur JavaScript ;                         · la page ne déborde jamais en largeur ;
     · le rond / la fenêtre sont DANS l'écran ;        · au toucher : rond, ✕, 🔊, 🗑, ℹ️, ➤ à 44 px au moins ;
     · une question part au cerveau et la réponse s'affiche (le fil répond) ;     · le premier dessin de Bee arrive en moins de 6 s.
   Moteurs : chromium (toujours), webkit = Safari / iPhone, firefox — si installés (au dépôt PUBLIC : gratuit, voir .github/workflows/bee-plateformes.yml).
   Un moteur absent est DIT. node tools/plateformes/verif-plateformes-bee.mjs   ENGINES=chromium,webkit,firefox   PLAT=iPhone
   Sabotage : BEE_DIR=<dossier d'un ancien javis/> → doit devenir rouge sur le défaut qu'il avait ; SABOTAGE=1 force un défaut (✕ minuscule) pour prouver la mesure. */
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BEE = process.env.BEE_DIR ? path.resolve(process.env.BEE_DIR) : path.join(ROOT, 'javis');
let n = 0, ko = 0; const rouges = [];
const ok = (c, l) => { n++; if (!c) { ko++; rouges.push(l); } console.log((c ? '  ✅ ' : '  ❌ ') + l); };

let pw; for (const m of ['playwright', 'playwright-core']) { try { pw = await import(m); break; } catch (e) { /* suivant */ } }
if (!pw) { console.log('  ⏭  playwright absent : rien lancé'); process.exit(process.env.EXIGE_PLAYWRIGHT ? 1 : 0); }
const P = pw.default || pw;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4' };
const HOTE = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
  + '<title>Hôte</title></head><body style="margin:0;font:16px system-ui"><h1 style="padding:16px">Une autre app du domaine</h1><p style="padding:0 16px">Contenu.</p>'
  + '<script src="/javis-widget.js"></script></body></html>';
const QUESTIONS = [];
const srv = http.createServer((q, r) => {
  const p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  if (p === '/__sso/whoami') { r.writeHead(200, { 'content-type': 'application/json' }); return r.end(JSON.stringify({ ok: true, uid: 'kdmc_admin', name: 'Kevin DESARZENS', verified: true, admin: true })); }
  if (p === '/__javis/ai') { let c = ''; q.on('data', (d) => { c += d; }); q.on('end', () => { QUESTIONS.push(c); r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify({ ok: true, provider: 'qwen', gratuit: true, text: 'Coucou Kevin, tout va bien !' })); }); return; }
  if (p === '/hote.html') { r.writeHead(200, { 'content-type': MIME['.html'] }); return r.end(HOTE); }
  const f = path.join(BEE, p === '/' ? 'index.html' : p.replace(/^\//, ''));
  if (!f.startsWith(BEE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('nope'); }
  r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
await new Promise((r) => srv.listen(0, r)); const base = 'http://127.0.0.1:' + srv.address().port;

function chromePath() { const b = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'; try { for (const d of fs.readdirSync(b).filter((x) => /^chromium-\d+$/.test(x))) { const c = path.join(b, d, 'chrome-linux', 'chrome'); if (fs.existsSync(c)) return c; } } catch (e) { /* rien */ } return undefined; }

const D = P.devices || {};
const MATRICE = [
  { nom: 'iPhone 13 portrait', dev: 'iPhone 13', moteurs: ['webkit', 'chromium'] },
  { nom: 'iPhone 14 Pro portrait 390x844 (celui de Kevin)', vp: { width: 390, height: 844 }, tactile: true, moteurs: ['webkit', 'chromium'] },
  { nom: 'iPhone 14 Pro paysage 844x390 (celui de Kevin)', vp: { width: 844, height: 390 }, tactile: true, moteurs: ['webkit', 'chromium'] },
  { nom: 'iPhone SE (petit)', dev: 'iPhone SE', moteurs: ['webkit', 'chromium'] },
  { nom: 'Android Pixel 7', dev: 'Pixel 7', moteurs: ['chromium'] },
  { nom: 'Android Galaxy S9+ paysage', dev: 'Galaxy S9+ landscape', moteurs: ['chromium'] },
  { nom: 'iPad portrait', dev: 'iPad (gen 7)', moteurs: ['webkit', 'chromium'] },
  { nom: 'Portable bas 1272x635 (Lenovo)', vp: { width: 1272, height: 635 }, souris: true, moteurs: ['chromium', 'firefox', 'webkit'] },
  { nom: 'Grand écran 1920x1080', vp: { width: 1920, height: 1080 }, souris: true, moteurs: ['chromium', 'firefox'] }
];
const filtre = process.env.PLAT ? new RegExp(process.env.PLAT, 'i') : null;
const voulus = (process.env.ENGINES || 'chromium,webkit,firefox').split(',').map((x) => x.trim());
const lanceurs = {};
for (const m of voulus) {
  try { const type = P[m] || (P.default && P.default[m]); if (!type) throw new Error('moteur inconnu');
    lanceurs[m] = await type.launch(m === 'chromium' ? { executablePath: chromePath() } : {});
  } catch (e) { console.log(`  ⏭  moteur « ${m} » absent ici (${String(e.message).split('\n')[0].slice(0, 70)}) — couvert par le robot du dépôt public`); }
}

/* mesures dans la page : tout ce qui est mesuré l'est sur le rendu RÉEL */
const MESURE = () => {
  const vw = window.innerWidth, vh = window.innerHeight, doc = document.documentElement;
  const box = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, vu: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0 }; };
  const dedans = (b) => !!b && b.l >= -1 && b.t >= -1 && b.r <= vw + 1 && b.b <= vh + 1;
  const ids = ['#javis-launcher', '#javis-panel', '#javis-close', '#javis-voix', '#javis-oublie', '#javis-info', '#javis-send'];
  const o = { vw, vh, deborde: doc.scrollWidth > vw + 1 };
  ids.forEach((s) => { const b = box(s); o[s] = b ? { vu: b.vu, dedans: dedans(b), w: Math.round(b.w), h: Math.round(b.h) } : null; });
  return o;
};

async function surface(page, nom, plat, moteur, mode, tact) {
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e && e.message).slice(0, 120)));
  const t0 = Date.now();
  await page.goto(base + (mode === 'app' ? '/' : '/hote.html'), { waitUntil: 'domcontentloaded' });
  const tag = `${plat} · ${moteur} · ${nom}`;
  await page.waitForSelector('#javis-launcher .bee-rig', { timeout: 15000 }).catch(() => {});
  const dessin = Date.now() - t0;
  ok(await page.locator('#javis-launcher .bee-rig').count() > 0, `${tag} : Bee est dessinée`);
  ok(dessin < 6000, `${tag} : premier dessin en ${dessin} ms (< 6 s)`);
  if (mode === 'hote') {
    let m = await page.evaluate(MESURE);
    ok(m['#javis-launcher'] && m['#javis-launcher'].vu && m['#javis-launcher'].dedans, `${tag} : le rond flottant est dans l'écran`);
    if (tact) ok(m['#javis-launcher'] && m['#javis-launcher'].w >= 44 && m['#javis-launcher'].h >= 44, `${tag} : rond ≥ 44 px (${m['#javis-launcher'] && m['#javis-launcher'].w}×${m['#javis-launcher'] && m['#javis-launcher'].h})`);
    await page.waitForTimeout(800);
    /* Bee bouge sans arrêt (elle n'est jamais « stable » pour Playwright) : on touche / clique là où elle est, comme le doigt de Kevin */
    const c = await page.evaluate(() => { const r = document.querySelector('#javis-launcher').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    if (process.env.DEBUG_BEE) await page.evaluate(() => document.addEventListener('click', (e) => { const t = e.target; window.__clic = (t.id || t.className || t.tagName) + ' @' + Math.round(e.clientX) + ',' + Math.round(e.clientY); }, true));
    if (process.env.DEBUG_BEE) console.log('   tap', JSON.stringify(c), await page.evaluate((c) => { const e = document.elementFromPoint(c.x, c.y); return e ? e.tagName + '#' + e.id + '.' + e.className : 'rien'; }, c));
    if (tact) await page.touchscreen.tap(c.x, c.y); else await page.mouse.click(c.x, c.y);
    await page.waitForSelector('#javis-panel.javis-open', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(Number(process.env.ATTENTE_OUVERTURE || 1500));   /* l'ouverture grandit en 0,18 s, puis Bee propose ses boutons : un humain met plus d'une seconde à taper (mesuré : envoyer < 1 s après l'ouverture ne part pas) */
    if (process.env.DEBUG_BEE) console.log('   panneau:', await page.evaluate(() => { const e = document.querySelector('#javis-panel'); return e ? e.className + ' / ' + getComputedStyle(e).display + ' / ' + JSON.stringify(e.getBoundingClientRect()) + ' vp ' + innerWidth + 'x' + innerHeight : 'absent'; }));
  }
  if (process.env.SABOTAGE) await page.addStyleTag({ content: '#javis-close{width:20px!important;height:20px!important;min-width:0!important;min-height:0!important;padding:0!important}' });
  const m = await page.evaluate(MESURE);
  ok(!m.deborde, `${tag} : la page ne déborde pas en largeur`);
  ok(m['#javis-panel'] && m['#javis-panel'].vu && m['#javis-panel'].dedans, `${tag} : la fenêtre de Bee est dans l'écran`);
  if (tact) {
    for (const s of [...(mode === 'app' ? [] : ['#javis-close']), '#javis-voix', '#javis-oublie', '#javis-info', '#javis-send']) {
      const b = m[s]; ok(b && b.vu && b.w >= 44 && b.h >= 44, `${tag} : ${s} ≥ 44 px (${b ? b.w + '×' + b.h : 'absent'})`);
    }
  }
  /* le fil répond : une question part au cerveau, la réponse s'affiche */
  const avant = QUESTIONS.length;
  if (process.env.DEBUG_BEE) await page.evaluate(() => { window.__ev = []; ['pointerdown', 'pointerup', 'click', 'submit'].forEach((t) => document.addEventListener(t, (e) => window.__ev.push(t + ':' + ((e.target && (e.target.id || e.target.className || e.target.tagName)) || '')), true)); });
  await page.fill('#javis-input', 'Bonjour Bee', { timeout: 6000 }).catch((e) => console.log('   saisie:', String(e.message).split('\n').slice(0, 6).join(' | ').slice(0, 400)));
  if (process.env.DEBUG_BEE) console.log('   sous le ➤:', await page.evaluate(() => { const b = document.querySelector('#javis-send').getBoundingClientRect(); const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return (e ? (e.id || e.className || e.tagName) : 'rien') + ' ' + Math.round(b.left) + ',' + Math.round(b.top) + ' vp ' + innerWidth + 'x' + innerHeight; }));
  await page.locator('#javis-send').click({ timeout: 6000 }).catch((e) => console.log('   envoi:', String(e.message).split('\n').slice(0, 8).join(' | ').slice(0, 500)));
  await page.waitForFunction(() => /Coucou Kevin, tout va bien/.test(document.body.innerText), null, { timeout: 12000 }).catch(() => {});
  if (QUESTIONS.length <= avant) console.log('   diag:', JSON.stringify(await page.evaluate(() => ({ ev: window.__ev, saisie: (document.querySelector('#javis-input') || {}).value, fin: document.body.innerText.slice(-260), ouvert: !!document.querySelector('#javis-panel.javis-open'), occupe: document.querySelector('#javis-send') && document.querySelector('#javis-send').disabled }))));
  ok(QUESTIONS.length > avant, `${tag} : la question part au cerveau`);
  ok(await page.evaluate(() => /Coucou Kevin, tout va bien/.test(document.body.innerText)), `${tag} : la réponse s'affiche`);
  const apres = await page.evaluate(MESURE);
  ok(!apres.deborde, `${tag} : rien ne déborde après la réponse`);
  ok(erreurs.length === 0, `${tag} : 0 erreur JavaScript${erreurs.length ? ' — ' + erreurs[0] : ''}`);
}

for (const [moteur, nav] of Object.entries(lanceurs)) {
  for (const a of MATRICE) {
    if (!a.moteurs.includes(moteur)) continue; if (filtre && !filtre.test(a.nom)) continue;
    const prof = a.dev ? D[a.dev] : null; if (a.dev && !prof) { console.log(`  ⏭  profil « ${a.dev} » inconnu de ce Playwright`); continue; }
    const tact = !!(a.tactile || (prof && prof.hasTouch));
    const opts = prof ? { ...prof } : { viewport: a.vp, hasTouch: !!a.tactile, isMobile: !!a.tactile, deviceScaleFactor: a.tactile ? 3 : 1 };
    if (moteur === 'firefox') { delete opts.isMobile; }
    for (const mode of ['app', 'hote']) {
      const ctx = await nav.newContext({ ...opts, serviceWorkers: 'block' }).catch((e) => { console.log('  ⏭  ' + a.nom + ' / ' + moteur + ' : ' + String(e.message).split('\n')[0].slice(0, 80)); return null; });
      if (!ctx) break;
      await ctx.addInitScript(() => { try { localStorage.setItem('kdmc_perso3d', '0'); } catch (_) { /* rien */ } });
      const page = await ctx.newPage();
      await page.route(/lingua\.kd-mc\.com\/.*/, (rt) => rt.fulfill({ status: 404, body: '' }));
      try { await surface(page, mode === 'app' ? 'app Bee' : 'sur une autre app', a.nom, moteur, mode, tact); }
      catch (e) { ok(false, `${a.nom} · ${moteur} · ${mode} : plantage du contrôle — ${String(e.message).split('\n')[0].slice(0, 100)}`); }
      await ctx.close();
    }
  }
}
for (const nav of Object.values(lanceurs)) await nav.close();
srv.close();
console.log(`\n${n - ko} contrôles OK, ${ko} échec(s)${Object.keys(lanceurs).length ? ' — moteurs : ' + Object.keys(lanceurs).join(', ') : ' — AUCUN moteur lancé'}`);
if (rouges.length) console.log('Rouges :\n' + rouges.map((x) => '  · ' + x).join('\n'));
process.exit(ko || !Object.keys(lanceurs).length ? 1 : 0);
