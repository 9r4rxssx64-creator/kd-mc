/* GARDE EN VRAI NAVIGATEUR — Bee est un personnage ANIMÉ, jamais une image plate avec une bouche posée dessus.
 *
 * Retour de Kevin (29.10, deux captures de son PC Windows) : « la bouche sur le dessin, c'est très moche, une bouche en plus, quelque chose de collé
 * dessus ; c'est pas vraiment un personnage animé, il n'y a que la bouche qui bouge ; elle bouge un petit peu au début, le visuel ne tient pas tout le
 * long ; un bip retentit régulièrement ; elle met un peu de temps à commencer avant de parler ». Reproduit ICI, puis gardé :
 *
 *   A. le réglage SYSTÈME « réduire les animations » (Windows l'allume seul en économie d'énergie) n'immobilise plus Bee : marionnette + 3D tournent ;
 *   B. jamais de 2ᵉ bouche visible, ni en marionnette, ni en repli sans WebGL ;
 *   C. sans WebGL : la MÊME marionnette est dessinée en canvas 2D (le maillage, triangle par triangle) — jamais une simple image qu'on balance ;
 *   G. chaque membre vit pendant qu'elle parle (antennes, bras, jambes, tête, corps, ailes) : une vraie petite marionnette, complète, vivante ;
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
  const f = p === '/perso3d.js' && process.env.BEE_P3D ? process.env.BEE_P3D : join(ROOT, 'javis', p.replace(/^\//, ''));
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
    const f = u.pathname === '/marionnette.js' && process.env.BEE_MRN ? process.env.BEE_MRN : u.pathname === '/perso3d.js' && process.env.BEE_P3D ? process.env.BEE_P3D : join(ROOT, 'lingua', decodeURIComponent(u.pathname));
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
  chk(!/p3d-on/.test(parle.cls), 'A. Bee porte le dessin « 3D animé » du Studio, animé tel quel : le modèle 3D maison ne le remplace pas (pas de p3d-on)');
  chk(parle.mouthOp === '0', `B. aucune 2ᵉ bouche visible pendant qu'elle parle (opacité ${parle.mouthOp})`);
  chk(parle.osc === avant.osc, `E. aucun « bip » (oscillateur) à la réponse ni pendant qu'elle parle (${parle.osc - avant.osc} nouveau ; le toucher du bouton, voulu par Kevin, en fait un avant)`);
  /* le visuel TIENT tout le long : le dessin du canvas continue de changer pendant toute la parole (pas seulement au début) */
  const h = async () => page.evaluate(() => { const c = document.querySelector('#javis-head .bee-rig canvas'); if (!c) return 0; const x = c.getContext('2d'); const d = x.getImageData(0, 0, c.width, c.height).data; let v = 0; for (let i = 0; i < d.length; i += 53) v = (v * 31 + d[i]) >>> 0; return v; });
  const hs = new Set(); for (let i = 0; i < 6; i++) { hs.add(await h()); await dors(120); }
  chk(hs.size >= 4, `le corps bouge réellement image après image (${hs.size} images différentes sur 6)`);
  chk(!err.length, 'aucune erreur JS (réduire les animations)');
  await ctx.close();
}

/* ── B + C : sans WebGL — la MÊME marionnette, dessinée en canvas 2D (plus une image qu'on balance) ── */
{
  const { ctx, page, err } = await session({ sansGL: true });
  await demande(page);
  await dors(2600);
  const s = await etat(page);
  chk(s.canvas && s.mrn && /mrn-on/.test(s.cls), `C. sans WebGL : la marionnette tourne quand même, en canvas 2D (canvas=${s.canvas}, mrn=${s.mrn}, ${s.cls.replace('bee-rig ', '')})`);
  chk(await page.evaluate(() => KdmcMarionnette.mode() === 'canvas2d'), 'C. et c\'est bien le rendu 2D du maillage (mode canvas2d)');
  chk(s.parle, `D. elle parle (talk=${s.parle}) quand le son sort`);
  chk(s.mouthOp === '0', `B. sans WebGL non plus : aucune bouche posée par-dessus (opacité ${s.mouthOp})`);
  const h2 = async () => page.evaluate(() => { const c = document.querySelector('#javis-head .bee-rig canvas'); if (!c) return 0; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let v = 0; for (let i = 0; i < d.length; i += 53) v = (v * 31 + d[i]) >>> 0; return v; });
  const hs2 = new Set(); for (let i = 0; i < 6; i++) { hs2.add(await h2()); await dors(120); }
  chk(hs2.size >= 4, `C. sans WebGL, le corps bouge réellement image après image (${hs2.size} images différentes sur 6)`);
  /* H. le clignement est PEINT dans le dessin (de la couleur de la peau) : plus de paupière HTML posée par-dessus (« une tache collée ») */
  const lire = () => page.evaluate(() => { const c = document.querySelector('#javis-head .bee-rig canvas'); const w = c.width; const d = c.getContext('2d').getImageData(Math.round(w * 0.3), Math.round(w * 0.25), Math.round(w * 0.4), Math.round(w * 0.2)).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s; });
  const ouvert = await lire();
  await page.evaluate(() => document.querySelector('#javis-head .bee-rig').classList.add('blink'));
  await dors(300);
  const clin = await lire();
  const lid = await page.evaluate(() => getComputedStyle(document.querySelector('#javis-head .rig-lid')).opacity);
  await page.evaluate(() => document.querySelector('#javis-head .bee-rig').classList.remove('blink'));
  chk(Math.abs(clin - ouvert) / ouvert > 0.03, `H. au clignement le dessin change (paupières peintes : ${((clin - ouvert) / ouvert * 100).toFixed(1)} %)`);
  chk(lid === '0', `H. et la paupière HTML posée par-dessus reste invisible (opacité ${lid})`);
  chk(!err.length, 'aucune erreur JS (sans WebGL)');
  await ctx.close();
}
/* dernier recours (ni WebGL ni canvas 2D) : le corps entier se balance — la règle existe, jamais une pièce rapportée */
{
  const src = fs.readFileSync(WIDGET, 'utf8');
  chk(/\.bee-rig\.talk:not\(\.mrn-on\) \.rig-base\{[^}]*animation:javis-corps-parle/.test(src), 'dernier recours : la règle « le corps entier se balance » est dans le widget');
}

/* ── G : CHAQUE MEMBRE VIT pendant qu'elle parle (Kevin 29.10 : « une vraie petite marionnette animée, complète, vivante ») ── */
{
  const { ctx, page, err } = await session({});
  await demande(page); await dors(1500);
  /* ce que la PAROLE ajoute au repos : on compare chaque membre à lui-même au repos (sinon le geste de base, toujours là, ferait passer le contrôle) */
  const amp = await page.evaluate(() => {
    const out = { d2: {}, d3: {} };
    for (const h of ['repos', 'parle']) {
      const o = out.d2[h] = {};
      KdmcMarionnette._sequence('bee/v3', h, 8, 1 / 30, (pos, t, S, ang) => { for (const k in ang) { const a = o[k] || (o[k] = [1e9, -1e9]); a[0] = Math.min(a[0], ang[k]); a[1] = Math.max(a[1], ang[k]); } });
    }
    /* 30.10 : Bee porte le dessin « 3D animé » du Studio (bee/v3) : pas de modèle 3D maison à mesurer ici (ses poses sont mesurées par verify-perso3d, E) */
    for (const piece of (window.KdmcPerso3D ? KdmcPerso3D._pieces('bee') : [])) {
      const a = out.d3[piece] = [[1e9, -1e9], [1e9, -1e9], [1e9, -1e9]];
      for (let t = 0; t < 8; t += 1 / 30) {
        const p = KdmcPerso3D._pose('bee', piece, 'parle', t, { niveau: 0.6, ouv: 0.5 }), r = KdmcPerso3D._pose('bee', piece, 'repos', t, { niveau: 0.6, ouv: 0.5 });
        for (let j = 0; j < 3; j++) { const dl = p.r[j] - r.r[j]; a[j][0] = Math.min(a[j][0], dl); a[j][1] = Math.max(a[j][1], dl); }
      }
    }
    return out;
  });
  const d = (h, k) => (amp.d2[h][k] ? amp.d2[h][k][1] - amp.d2[h][k][0] : 0);
  const plus = (k) => d('parle', k) - d('repos', k);                         /* ce que la parole ajoute */
  const m2 = { antennes: Math.min(plus('antG'), plus('antD')), 'un bras': Math.max(plus('brasG'), plus('brasD')), jambes: Math.min(plus('jambeG'), plus('jambeD')), tête: plus('tete'), corps: plus('corps') };
  const seuil2 = { antennes: 8, 'un bras': 6, jambes: 6, tête: 5, corps: 2 };
  for (const k of Object.keys(seuil2)) chk(m2[k] >= seuil2[k], `G. marionnette 2D : ${k} — la parole ajoute ${m2[k].toFixed(1)}° de mouvement en 8 s (≥ ${seuil2[k]}°)`);
  const d3 = (piece) => Math.max(...(amp.d3[piece] || [[0, 0]]).map((x) => x[1] - x[0]));
  const m3 = { 'jambes 3D': Math.min(d3('jambeG'), d3('jambeD')), 'antennes 3D': Math.min(d3('antenneG'), d3('antenneD')), 'ailes 3D': Math.min(d3('aileG'), d3('aileD')), 'bras 3D': Math.max(d3('brasG'), d3('brasD')), 'tête 3D': d3('tete'), 'corps 3D': d3('corps') };
  const seuil3 = { 'jambes 3D': 9, 'antennes 3D': 10, 'ailes 3D': 6, 'bras 3D': 12, 'tête 3D': 8, 'corps 3D': 4 };
  const a3d = await page.evaluate(() => !!window.KdmcPerso3D);
  if (a3d) for (const k of Object.keys(seuil3)) chk(m3[k] >= seuil3[k], `G. ${k} : la parole ajoute ${m3[k].toFixed(1)}° de mouvement en 8 s (≥ ${seuil3[k]}°)`);
  chk(!err.length, 'aucune erreur JS (membres)');
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
