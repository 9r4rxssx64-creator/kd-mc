/* GARDE EN VRAI NAVIGATEUR — Bee est un personnage ANIMÉ, jamais une image plate avec une bouche posée dessus.
 *
 * Retour de Kevin (29.10, deux captures de son PC Windows) : « la bouche sur le dessin, c'est très moche, une bouche en plus, quelque chose de collé
 * dessus ; c'est pas vraiment un personnage animé, il n'y a que la bouche qui bouge ; elle bouge un petit peu au début, le visuel ne tient pas tout le
 * long ; un bip retentit régulièrement ; elle met un peu de temps à commencer avant de parler ». Reproduit ICI, puis gardé :
 *
 *   A. le réglage SYSTÈME « réduire les animations » (Windows l'allume seul en économie d'énergie) n'immobilise plus Bee : marionnette + 3D tournent ;
 *   B. jamais de 2ᵉ bouche visible, ni en marionnette, ni en repli sans WebGL ;
 *   C. sans WebGL : c'est le CORPS ENTIER qui se balance pendant qu'elle parle (animation CSS), pas une pièce rapportée ;
 *   D. le corps ne « parle » QUE quand le son sort (avant : ~2 s de bouche dans le vide pendant que la voix se fabriquait) ;
 *   E. aucun « bip » (oscillateur) à la réponse ;
 *   F. le choix VOLONTAIRE « calme » (kdmc_calme = 1) reste possible : image d'avant, immobile.
 *
 * node tests/verify-bee-corps.mjs        (SABOTAGE : voir les lignes « sabotage » en bas du journal de la leçon)
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const R = { ok: [], ko: [] };
const chk = (c, m) => (c ? R.ok : R.ko).push(m);
const dors = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4', '.css': 'text/css' };
const WIDGET = process.env.BEE_WIDGET || join(ROOT, 'tools/javis/javis-widget.js');

/* un son WAV de 2,5 s (un « la » doux) : le navigateur le décode et le joue pour de vrai */
function wav(sec = 2.5) {
  const sr = 22050, n = Math.round(sr * sec), b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 220 * i / sr) * 2500 * (0.6 + 0.4 * Math.sin(i / 1800))), 44 + i * 2);
  return b;
}
const SON = wav();
const REPONSE = 'Nous sommes le jeudi 29 octobre 2026 à 12:27. En ce moment à Monaco : 20 °C, ciel dégagé, vent 4 km/h. Ton planning : de 20 h à 5 h du matin.';

const srv = http.createServer((req, res) => {
  const p = (req.url || '/').split('?')[0];
  if (p === '/__javis/ai') { let c = ''; req.on('data', (d) => { c += d; }); req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, provider: 'qwen', gratuit: true, text: REPONSE })); }); return; }
  if (p === '/__sso/whoami') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok: true, uid: 'kdmc_admin', name: 'Kevin DESARZENS', verified: true, admin: true })); }
  if (p === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><meta charset=utf-8><body style="background:#0b0b10"><script src="/javis-widget.js"></script>'); }
  if (p === '/javis-widget.js') { res.writeHead(200, { 'content-type': TYPES['.js'] }); return res.end(fs.readFileSync(WIDGET)); }
  const f = join(ROOT, 'javis', p.replace(/^\//, ''));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nope'); }
  res.writeHead(200, { 'content-type': TYPES[f.slice(f.lastIndexOf('.'))] || 'text/plain' }); res.end(fs.readFileSync(f));
});
await new Promise((r) => srv.listen(0, r));
const port = srv.address().port;
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });

/* une session : Kevin demande « mon brief », la voix met 1,4 s à se fabriquer (comme sur le vrai domaine) */
async function session({ reduit = false, sansGL = false, calme = false, delaiVoix = 1400 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: reduit ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const err = []; page.on('pageerror', (e) => err.push(e.message));
  await page.addInitScript(({ sansGL, calme }) => {
    window.__oscillateurs = 0;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) { const o = AC.prototype.createOscillator; AC.prototype.createOscillator = function () { window.__oscillateurs++; return o.apply(this, arguments); }; }
    if (sansGL) { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, a) { return /webgl/.test(String(t)) ? null : g.call(this, t, a); }; }
    if (calme) { try { localStorage.setItem('kdmc_calme', '1'); } catch (_) { /* */ } }
  }, { sansGL, calme });
  await page.route('**/lingua.kd-mc.com/**', (r) => {
    const u = new URL(r.request().url());
    if (u.pathname.startsWith('/__lingua/tts')) return setTimeout(() => r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'audio/wav' }, body: SON }), delaiVoix);
    const f = u.pathname === '/marionnette.js' && process.env.BEE_MRN ? process.env.BEE_MRN : join(ROOT, 'lingua', decodeURIComponent(u.pathname));
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': TYPES[f.slice(f.lastIndexOf('.'))] || 'application/octet-stream' }, body: fs.readFileSync(f) });
    return r.fulfill({ status: 404, body: '' });
  });
  await page.route('https://api.open-meteo.com/**', (r) => r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: '{}' }));
  await page.goto(`http://localhost:${port}/`);
  await dors(2200);
  await page.click('#javis-launcher', { force: true });
  await dors(700);
  return { ctx, page, err };
}
const etat = (page) => page.evaluate(() => {
  const r = document.querySelector('#javis-head .bee-rig'); const m = r && r.querySelector('.disc-mouth');
  return {
    cls: r ? r.className : '', canvas: !!(r && r.querySelector('canvas')), mrn: !!(window.KdmcMarionnette && KdmcMarionnette.actif()),
    parle: !!(r && r.classList.contains('talk')), mouthOp: m ? getComputedStyle(m).opacity : 'absent',
    anim: r && r.querySelector('.rig-base') ? getComputedStyle(r.querySelector('.rig-base')).animationName : '', osc: window.__oscillateurs || 0,
    calme: document.documentElement.classList.contains('javis-calme'),
  };
});
async function demande(page) {
  await page.fill('#javis-input, textarea', 'mon brief'); await page.keyboard.press('Enter');
}

/* ── A + B + D + E : réglage système « réduire les animations » ACTIF (le cas du PC de Kevin) ── */
{
  const { ctx, page, err } = await session({ reduit: true });
  chk(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), 'le décor reproduit le PC de Kevin : « réduire les animations » du système est ACTIF');
  const avant = await etat(page);
  await demande(page);
  await dors(500);                                           /* la réponse est là, la voix se fabrique encore (1,4 s) */
  const attente = await etat(page);
  chk(!attente.parle, `D. avant que le son sorte, elle ne « parle » pas dans le vide (talk=${attente.parle})`);
  await dors(2000);                                          /* le son joue (2,5 s) */
  const parle = await etat(page);
  chk(parle.parle, `D. dès que le son sort, le corps parle (talk=${parle.parle})`);
  chk(parle.mrn && parle.canvas && /mrn-on/.test(parle.cls), `A. malgré « réduire les animations », la marionnette tourne (mrn=${parle.mrn}, canvas=${parle.canvas}, ${parle.cls.replace('bee-rig ', '')})`);
  chk(/p3d-on/.test(parle.cls), 'A. et la 3D d\'office aussi (p3d-on)');
  chk(parle.mouthOp === '0', `B. aucune 2ᵉ bouche visible pendant qu'elle parle (opacité ${parle.mouthOp})`);
  chk(parle.osc === avant.osc, `E. aucun « bip » (oscillateur) à la réponse ni pendant qu'elle parle (${parle.osc - avant.osc} nouveau ; le toucher du bouton, voulu par Kevin, en fait un avant)`);
  /* le visuel TIENT tout le long : le dessin du canvas continue de changer pendant toute la parole (pas seulement au début) */
  const h = async () => page.evaluate(() => { const c = document.querySelector('#javis-head .bee-rig canvas'); if (!c) return 0; const x = c.getContext('2d'); const d = x.getImageData(0, 0, c.width, c.height).data; let v = 0; for (let i = 0; i < d.length; i += 53) v = (v * 31 + d[i]) >>> 0; return v; });
  const hs = new Set(); for (let i = 0; i < 6; i++) { hs.add(await h()); await dors(120); }
  chk(hs.size >= 4, `le corps bouge réellement image après image (${hs.size} images différentes sur 6)`);
  chk(!err.length, 'aucune erreur JS (réduire les animations)');
  await ctx.close();
}

/* ── B + C : sans WebGL — le repli ne pose JAMAIS de bouche, il balance le corps entier ── */
{
  const { ctx, page, err } = await session({ sansGL: true });
  await demande(page);
  await dors(2600);
  const s = await etat(page);
  chk(!s.canvas && !s.mrn, `C. sans WebGL : pas de canvas (${s.canvas}), le dessin d'avant reste`);
  chk(s.parle && /javis-corps-parle/.test(s.anim), `C. sans WebGL : le CORPS ENTIER se balance pendant qu'elle parle (animation « ${s.anim} »)`);
  chk(s.mouthOp === '0', `B. sans WebGL non plus : aucune bouche posée par-dessus (opacité ${s.mouthOp})`);
  chk(!err.length, 'aucune erreur JS (sans WebGL)');
  await ctx.close();
}

/* ── F : le choix VOLONTAIRE « calme » ── */
{
  const { ctx, page, err } = await session({ calme: true });
  await demande(page);
  await dors(2600);
  const s = await etat(page);
  chk(s.calme && !s.canvas && !s.mrn, `F. kdmc_calme = 1 : image d'avant, immobile (calme=${s.calme}, canvas=${s.canvas})`);
  chk(s.mouthOp === '0' && s.anim !== 'javis-corps-parle', `F. et rien ne bouge (animation « ${s.anim} »)`);
  chk(!err.length, 'aucune erreur JS (calme)');
  await ctx.close();
}

await browser.close(); srv.close();
for (const m of R.ok) console.log('  ✅ ' + m);
for (const m of R.ko) console.log('  ❌ ' + m);
console.log(`\n${R.ok.length} contrôles OK, ${R.ko.length} échec(s)`);
process.exit(R.ko.length ? 1 : 0);
