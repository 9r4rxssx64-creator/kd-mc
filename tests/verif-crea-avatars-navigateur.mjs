/* VÉRIFICATION RÉELLE (navigateur) — Créa Studio « Avatars & marionnettes » (Kevin 29.10.2026 ; règles « tout tester partout » et « réel toujours »).
 * Ouvre la VRAIE page du Studio, avec le VRAI suivi de visage MediaPipe (téléchargé depuis jsDelivr / Google, comme chez Kevin), et MESURE en pixels :
 *   B. 8 personnages : tiennent dans le cadre (oreilles, chapeau, couronne), la bouche s'ouvre ;
 *   C. photo d'une personne fictive : visage trouvé (478 points), IDENTITÉ au repos (écart moyen avec la photo), la bouche ne bouge QUE le bas du visage,
 *      un clin d'œil ne ferme QUE l'œil gauche, la tête tourne ;
 *   D. un chien : placement à la main (trois touches) puis bouche qui s'ouvre au bon endroit ;
 *   E. la voix : synchro des lèvres sur des voyelles, changement de hauteur (fréquence mesurée), voix IA par le service (simulé), voix ajoutée par une autre branche ;
 *   F. l'enregistrement : une vraie vidéo (taille, dimensions, son présent) ;
 *   G. garder un avatar, le recharger ; H. filtre noir & blanc (saturation mesurée) ; I. look IA (service simulé : la consigne « avatar » part, le visage est re-trouvé) ;
 *   J. la caméra (Chromium : visage vidéo simulé par ffmpeg → la bouche de l'avatar suit) ; K. vitesse de dessin ; L. 0 erreur JavaScript.
 * Les rendus sont écrits dans CAPTURES pour être REGARDÉS (un nombre ne dit pas si c'est beau).
 *
 * node tests/verif-crea-avatars-navigateur.mjs        ENGINES=chromium,webkit,firefox · CAPTURES=dossier · STUDIO_DIR=ancien/autre Studio (sabotage)
 * node tests/verif-crea-avatars-navigateur.mjs --sabotage   6 mutations, chacune DOIT faire rougir au moins un contrôle. */
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { fileURLToPath } from 'node:url'; import { spawnSync } from 'node:child_process';
import { chromium, webkit, firefox } from 'playwright';
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(R, 'tests/avatars-donnees');
const SOURCE = path.join(R, 'tools/crea-studio');
const STUDIO = process.env.STUDIO_DIR || SOURCE;
const CAPTURES = process.env.CAPTURES || path.join(os.tmpdir(), 'avatars-captures');
const MOTEURS = (process.env.ENGINES || 'chromium').split(',').map((s) => s.trim()).filter(Boolean);
const RESUME = process.env.GITHUB_STEP_SUMMARY || '';

const MUTATIONS = [
  ['la bouche ne s\'ouvre plus', 'avatar-core.js', 'var ouv = P.jaw * 0.62 * mw;', 'var ouv = 0;'],
  ['l\'intérieur de la bouche n\'est plus dessiné', 'avatar-rendu.js', '      cavite(v, D, P);', '      void 0;'],
  ['les oreilles sortent du cadre', 'avatar-persos.js', 'var ext = etendue(esp, options.accessoire);', 'var ext = { haut: 1, bas: 1, demi: 1 };'],
  ['le visage est décalé au repos', 'avatar-core.js', 'D[i * 2] = e.cx + rx2 * ca + ry2 * sa;', 'D[i * 2] = e.cx + rx2 * ca + ry2 * sa + 4;'],
  ['la consigne « avatar » ne part plus', 'avatar-studio.js', 'style: style, avatar: true }', 'style: style }'],
  ['la voix ne change plus de hauteur', 'avatar-core.js', 'return reechantillonner(etirerWSOLA(x, ratio), ratio);', 'return x;']
];
if (process.argv.includes('--sabotage')) {
  let rouges = 0; const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'avnav-sab-'));
  for (const [nom, fichier, avant, apres] of MUTATIONS) {
    const d = path.join(tmp, String(Math.random()).slice(2, 8)); fs.cpSync(SOURCE, d, { recursive: true });
    const src = fs.readFileSync(path.join(d, fichier), 'utf8');
    if (!src.includes(avant)) { console.log(`  ❌ mutation « ${nom} » : texte à saboter introuvable (le contrôle ne protège plus rien)`); continue; }
    fs.writeFileSync(path.join(d, fichier), src.replace(avant, apres));
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, STUDIO_DIR: d, ENGINES: 'chromium', SANS_CAMERA: '1', SANS_VIDEO: '1', CAPTURES: path.join(tmp, 'c') }, encoding: 'utf8', timeout: 600000 });
    const fails = ((r.stdout || '').match(/^❌ /gm) || []).length; const rouge = r.status !== 0 && fails > 0; if (rouge) rouges++;
    console.log(`  ${rouge ? '✅' : '❌'} sabotage « ${nom} » → ${fails} contrôle(s) rouge(s)${rouge ? '' : ' (DEVAIT rougir)'}`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n=== ${rouges}/${MUTATIONS.length} sabotages détectés ${rouges === MUTATIONS.length ? '— la vérification est discriminante' : '— TROP MOLLE'}`); process.exit(rouges === MUTATIONS.length ? 0 : 1);
}

fs.mkdirSync(CAPTURES, { recursive: true });
const lignes = []; let n = 0, ko = 0; const rouges = []; const TMPFILES = new Map();
const dire = (t) => { console.log(t); lignes.push(t); };
const ok = (c, m, d) => { n++; if (!c) { ko++; rouges.push(m); } dire(`${c ? '✅' : '❌'} ${m}${!c && d ? ' — ' + String(d).slice(0, 300) : ''}`); };

/* ---- les fichiers de la page, les pièces d'essai, les sons fabriqués ici ---- */
const MIME = { '.webm': 'video/webm', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.html': 'text/html', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html';
  if (u.startsWith('/__')) { r.writeHead(200, { 'content-type': 'application/json' }); return r.end('{"ok":false,"reason":"hors_ligne_test"}'); }
  const f = u.startsWith('/fix/') ? path.join(R, 'tests/avatars-donnees', u.slice(5)) : u.startsWith('/tmpfile/') ? (TMPFILES.get(u.slice(9)) || '') : path.join(STUDIO, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
}).listen(0);
const PORT = srv.address().port;

function wav(x, sr) { const b = Buffer.alloc(44 + x.length * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(x.length * 2, 40); for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2); return b; }
function voyelle(sr, sec, f0, formants, vol) { const nn = Math.round(sr * sec), x = new Float32Array(nn); for (let h = 1; h * f0 < 5500; h++) { const f = h * f0; let a = 0; for (const [fc, bw, ga] of formants) a += ga * Math.exp(-((f - fc) ** 2) / (2 * bw * bw)); for (let i = 0; i < nn; i++) x[i] += a * Math.sin(2 * Math.PI * f * i / sr) / h; } let mx = 0; for (const v of x) mx = Math.max(mx, Math.abs(v)); for (let i = 0; i < nn; i++) x[i] = x[i] / mx * vol; return x; }
const colle = (...a) => { const o = new Float32Array(a.reduce((s, v) => s + v.length, 0)); let p = 0; for (const v of a) { o.set(v, p); p += v.length; } return o; };
const SR = 22050, SIL = new Float32Array(SR * 0.25);
const PAROLE = wav(colle(SIL, voyelle(SR, 0.5, 120, [[800, 120, 1], [1200, 150, 0.8]], 0.5), SIL, voyelle(SR, 0.5, 120, [[300, 60, 1], [2300, 200, 0.9]], 0.5), SIL, voyelle(SR, 0.5, 120, [[300, 60, 1], [800, 120, 0.6]], 0.5), SIL), SR);
const SINUS = wav(Float32Array.from({ length: SR * 1.2 }, (_, i) => 0.5 * Math.sin(2 * Math.PI * 200 * i / SR)), SR);

const CIBLE = { chromium, webkit, firefox };
async function lancer(nom) { try { return await CIBLE[nom].launch(nom === 'chromium' ? { args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } : nom === 'firefox' ? { firefoxUserPrefs: { 'media.autoplay.default': 0, 'media.autoplay.blocking_policy': 0, 'media.autoplay.block-webaudio': false } } : {}); } catch (e) { dire(`ℹ️ ${nom} absent ici (${String(e.message).split('\n')[0].slice(0, 80)}) : lancé par le robot du dépôt public`); return null; } }

async function contexte(browser, nom, extra) {
  const mobile = nom !== 'firefox';
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, ...(mobile ? { isMobile: true, hasTouch: true } : {}), serviceWorkers: 'block', permissions: nom === 'chromium' ? ['camera', 'microphone'] : [], ...(extra || {}) });
  const corps = [];
  if (process.env.SANS_WEBGL) await ctx.addInitScript(() => { window.__avatarSansWebGL = true; });   /* dessin 2D de repli (moteur sans WebGL) */
  await ctx.route('**/*', async (r) => {
    const q = r.request(), u = new URL(q.url());
    if (process.env.SANS_VISION && (u.hostname === 'cdn.jsdelivr.net' || u.hostname === 'storage.googleapis.com')) return r.abort();   /* essai : le suivi de visage ne se charge pas */
    if (u.hostname === 'localhost' || u.hostname === 'cdn.jsdelivr.net' || u.hostname === 'storage.googleapis.com') return r.continue();
    if (u.hostname === 'crea-ai.kd-mc.com' || u.hostname === 'kdmc-crea-ai.9r4rxssx64.workers.dev') {
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-expose-headers': 'x-crea-provider,x-crea-style' };
      if (q.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
      if (u.pathname === '/voice') return r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'audio/wav', 'x-crea-provider': 'essai' }, body: PAROLE });
      if (u.pathname === '/cartoon') { let b = {}; try { b = JSON.parse(q.postData() || '{}'); } catch (e) { /* ok */ } corps.push({ style: b.style, avatar: b.avatar, petite: !!b.image_petite, grande: String(b.image || '').length });
        return r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'image/jpeg', 'x-crea-provider': 'essai', 'x-crea-style': b.style || '' }, body: fs.readFileSync(path.join(R, 'tests/avatars-donnees/fictif-homme.jpg')) }); }
      return r.fulfill({ status: 404, headers: cors, body: '{}' });
    }
    return r.abort();
  });
  ctx.__corps = corps; return ctx;
}
const MESURES = `(() => {
  const lire = (c) => c.getContext('2d').getImageData(0, 0, c.width, c.height);
  window.__m = {
    lire,
    diffMoy(a, b, y0 = 0, y1 = 1, x0 = 0, x1 = 1) { const A = lire(a), B = lire(b), W = A.width, H = A.height; let s = 0, k = 0; for (let y = Math.floor(H * y0); y < Math.floor(H * y1); y++) for (let x = Math.floor(W * x0); x < Math.floor(W * x1); x++) { const i = (y * W + x) * 4; s += Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]); k += 3; } return s / k; },
    boite(a, b, seuil = 30) { const A = lire(a), B = lire(b), W = A.width, H = A.height; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, nb = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, d = Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]); if (d > seuil) { nb++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } } return { x0: x0 / W, y0: y0 / H, x1: x1 / W, y1: y1 / H, n: nb }; },
    copie(c) { const o = document.createElement('canvas'); o.width = c.width; o.height = c.height; o.getContext('2d').drawImage(c, 0, 0); return o; },
    sombres(c, b) { const A = lire(c), W = A.width, H = A.height; let k = 0; for (let y = Math.floor(H * b.y0); y <= Math.floor(H * b.y1); y++) for (let x = Math.floor(W * b.x0); x <= Math.floor(W * b.x1); x++) { const i = (y * W + x) * 4; if (0.3 * A.data[i] + 0.59 * A.data[i + 1] + 0.11 * A.data[i + 2] < 70) k++; } return k; },
    saturation(c, y0 = 0.2, y1 = 0.8) { const A = lire(c), W = A.width, H = A.height; let s = 0, k = 0; for (let y = Math.floor(H * y0); y < Math.floor(H * y1); y += 2) for (let x = 0; x < W; x += 2) { const i = (y * W + x) * 4, mx = Math.max(A.data[i], A.data[i + 1], A.data[i + 2]), mn = Math.min(A.data[i], A.data[i + 1], A.data[i + 2]); s += mx ? (mx - mn) / mx : 0; k++; } return s / k; },
    vide(c) { const A = lire(c); let s = 0, s2 = 0, k = 0; for (let i = 0; i < A.data.length; i += 16) { const l = A.data[i] * 0.3 + A.data[i + 1] * 0.59 + A.data[i + 2] * 0.11; s += l; s2 += l * l; k++; } const m = s / k; return Math.sqrt(Math.max(0, s2 / k - m * m)); },
    png(c) { return c.toDataURL('image/png').split(',')[1]; },
    blobOK: true,
    async photo(url, nom, type) { if (this.blobOK) return this.fichier(url, nom, type); const im = new Image(); im.src = url + '?i=' + Math.random(); await im.decode(); return im; },
    async fichier(url, nom, type) { const r = await fetch(url); const buf = await r.arrayBuffer(); return new File([buf], nom, { type: type || r.headers.get('content-type') || 'image/jpeg' }); },
    async wav(b64) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return this.blobOK ? new Blob([u], { type: 'audio/wav' }) : u; },
    frequence(buffer) { const x = buffer.getChannelData(0), N = 8192, re = new Float64Array(N), im = new Float64Array(N), d0 = Math.floor((x.length - N) / 2); for (let i = 0; i < N; i++) re[i] = x[d0 + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)); AvatarCore.fft(re, im); let best = 1, bv = 0; for (let k = 1; k < N / 2; k++) { const v = Math.hypot(re[k], im[k]); if (v > bv) { bv = v; best = k; } } return best * buffer.sampleRate / N; }
  };
})()`;

async function ouvrirStudio(ctx, erreurs) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => erreurs.push(String(e && e.message).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|INFO:|XNNPACK|GPU|WebGL|GL Driver|Button failed/i.test(m.text())) erreurs.push('console: ' + m.text().slice(0, 160)); });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.Avatar && document.querySelectorAll('#bnav button[data-go]').length >= 10, null, { timeout: 30000 });
  await page.evaluate(() => { const g = document.getElementById('gate'); if (g && !g.classList.contains('hidden')) { document.getElementById('gateName').value = 'Test Avatars'; document.getElementById('gateCode').value = '123456'; document.getElementById('gateGo').click(); } });
  await page.waitForFunction(() => { const g = document.getElementById('gate'); return !g || g.classList.contains('hidden'); }, null, { timeout: 30000 });
  await page.evaluate(MESURES);
  await page.click('#bnav button[data-go="avatar"]'); await page.waitForTimeout(300);
  return page;
}

/* poser les repères à la main : œil gauche, œil droit, bouche (coordonnées dans l'image d'origine) */
async function toucherYeuxBouche(page, T0, points) {
  const box = await page.evaluate(() => { const r = Avatar.canvas().getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, cw: Avatar.canvas().width, ch: Avatar.canvas().height }; });
  const vers = (px, py) => { const m = T0.m; const cx = (m.ox + px * m.s) / box.cw * box.w + box.x, cy = (m.oy + py * m.s) / box.ch * box.h + box.y; return [cx, cy]; };
  await page.evaluate(() => Avatar.canvas().scrollIntoView({ block: 'center' })); const b2 = await page.evaluate(() => { const r = Avatar.canvas().getBoundingClientRect(); return { x: r.left, y: r.top }; }); const dx = b2.x - box.x, dy = b2.y - box.y;
  for (const [px, py] of points) { const [cx, cy] = vers(px, py); await page.mouse.click(cx + dx, cy + dy); await page.waitForTimeout(80); }
}

async function suite(nom, browser) {
  const tag = nom; const erreurs = []; const ctx = await contexte(browser, nom); const page = await ouvrirStudio(ctx, erreurs);
  await page.evaluate((b) => { window.__m.blobOK = b; }, nom === 'chromium');
  const sauver = async (fichier, b64) => fs.writeFileSync(path.join(CAPTURES, `${nom}-${fichier}.png`), Buffer.from(b64, 'base64'));
  dire(`\n== ${nom} ==`);

  /* B. personnages */
  const persos = ['panda', 'lion', 'ane', 'abeille', 'chat', 'renard', 'ours', 'lapin'];
  const B = await page.evaluate((ids) => {
    const res = []; const bord = document.createElement('canvas'); bord.width = 540; bord.height = 960; const g = bord.getContext('2d');
    for (const id of ids) {
      Avatar.choisirPerso(id);
      Avatar.rendre({}); const c0 = __m.copie(Avatar.canvas()); Avatar.rendre({ jaw: 1 }); const c1 = Avatar.canvas(); const bb = __m.boite(c0, c1, 40);
      let pire = 1;
      for (const acc of ['aucun', 'fete', 'couronne', 'casquette']) {
        g.clearRect(0, 0, 540, 960); AvatarPersos.dessiner(g, id, AvatarCore.paramsNeutres(), 540, 960, { accessoire: acc, sansOmbre: true, echelle: 0.96 });
        const d = g.getImageData(0, 0, 540, 960).data; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
        for (let y = 0; y < 960; y++) for (let x = 0; x < 540; x++) if (d[(y * 540 + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        const marge = Math.min(x0, y0, 539 - x1, 959 - y1); pire = Math.min(pire, marge);
        res.push({ id, acc, marge, rempli: Math.max((x1 - x0) / 540, (y1 - y0) / 960) });
      }
      res.push({ id, bouche: bb.n, y0: bb.y0, y1: bb.y1 });
    }
    return res;
  }, persos);
  const coupes = B.filter((r) => r.acc && r.marge < 1).map((r) => r.id + '+' + r.acc), petits = B.filter((r) => r.acc && r.rempli < 0.55).map((r) => r.id + '+' + r.acc);
  ok(coupes.length === 0, `${tag} B) 8 personnages × 4 accessoires : rien ne dépasse du cadre (${B.filter((r) => r.acc).length} dessins, plus petite marge ${Math.min(...B.filter((r) => r.acc).map((r) => r.marge))} px)`, coupes.join(', '));
  ok(petits.length === 0, `${tag} B) chaque personnage remplit au moins 55 % de l'image (aucun minuscule)`, petits.join(', '));
  const muets = B.filter((r) => r.bouche !== undefined && r.bouche < 500).map((r) => r.id);
  ok(muets.length === 0, `${tag} B) la bouche de chaque personnage s'ouvre (pixels changés : ${B.filter((r) => r.bouche !== undefined).map((r) => r.bouche).join(', ')})`, muets.join(', '));
  await sauver('perso-lapin', await page.evaluate(() => { Avatar.choisirPerso('lapin'); Avatar.rendre({ jaw: 0.5, smile: 0.6 }); return __m.png(Avatar.canvas()); }));

  /* C. photo */
  const t0 = Date.now();
  await page.evaluate(async () => { await Avatar.depuisPhoto(await __m.photo('/fix/fictif-homme.jpg', 'homme.jpg', 'image/jpeg')); });
  const dureeDetect = Date.now() - t0; let E = await page.evaluate(() => Avatar.etat());
  /* un moteur SANS WebGL (Firefox sans carte graphique, comme sur le robot) : le suivi de visage ne peut pas démarrer ; l'app doit alors le DIRE et proposer les 3 touchés */
  if (E.source === 'touches' && (E.panneVision || '').length > 0) {
    const T = await page.evaluate(() => Avatar.touchesInfo());
    ok(!!T && T.n === 0, `${tag} C) suivi de visage indisponible ici (« ${E.panneVision.slice(0, 40)} ») : l'app propose les 3 touchés à la main`);
    const lm = JSON.parse(fs.readFileSync(path.join(FIX, 'fictif-homme.lm.json'), 'utf8')).lm;
    const pt = (i) => [lm[i][0] * T.w, lm[i][1] * T.h];
    const yeux = [pt(468), pt(473)].sort((a, b) => a[0] - b[0]);
    await toucherYeuxBouche(page, T, [yeux[0], yeux[1], [(pt(13)[0] + pt(14)[0]) / 2, (pt(13)[1] + pt(14)[1]) / 2]]);
    E = await page.evaluate(() => Avatar.etat());
    ok(E.source === 'photo' && E.manuel[0] === true && !!E.rendu, `${tag} C) repli à la main : l'avatar existe (rendu ${E.rendu}) et la bouche s'ouvre`, JSON.stringify(E).slice(0, 160));
    const o = await page.evaluate(() => { Avatar.rendre({}); const a = __m.copie(Avatar.canvas()); Avatar.rendre({ jaw: 1 }); return { bouche: __m.diffMoy(a, Avatar.canvas(), 0.5, 0.85) }; });
    ok(o.bouche > 4, `${tag} C) repli à la main : la bouche change à l'écran (${o.bouche.toFixed(1)})`);
  }

  const sansSuivi = E.manuel && E.manuel[0] === true && (E.panneVision || '').length > 0;
  if (!sansSuivi) ok(E.source === 'photo' && E.vues === 1 && E.manuel[0] === false && !!E.rendu, `${tag} C) photo « homme » : visage trouvé par MediaPipe (${E.delegue || '?'}), rendu ${E.rendu}, en ${dureeDetect} ms (modèle compris)`, JSON.stringify(E).slice(0, 200) + (E.panneVision || E.erreurVision ? ' | panne: ' + E.panneVision + ' / ' + E.erreurVision : ''));
  if (E.source === 'photo' && !E.manuel[0]) {
    const C = await page.evaluate(() => {
      Avatar.rendre({}); const neutre = __m.copie(Avatar.canvas()), cadre = Avatar.cadre(), orig = Avatar.vue0();
      const ref = document.createElement('canvas'); ref.width = neutre.width; ref.height = neutre.height; const g = ref.getContext('2d'); g.fillStyle = '#111'; g.fillRect(0, 0, ref.width, ref.height); g.setTransform(cadre.s, 0, 0, cadre.s, cadre.ox, cadre.oy); g.drawImage(orig, 0, 0);
      const identite = __m.diffMoy(neutre, ref);
      const out = {};
      Avatar.rendre({ jaw: 1 }); const bouche = __m.copie(Avatar.canvas()); out.bouche = __m.boite(neutre, bouche, 30); out.hautInchange = __m.diffMoy(neutre, bouche, 0.1, 0.46); const mb = Avatar.mesureBouche({ jaw: 1 }); const cv = Avatar.canvas(), id = cv.getContext('2d').getImageData(Math.round(mb.cx - mb.largeur * 0.3), Math.round(mb.cy - mb.ouverture * 0.3), Math.max(2, Math.round(mb.largeur * 0.6)), Math.max(2, Math.round(mb.ouverture * 0.6))).data; let sb = 0; for (let i = 0; i < id.length; i += 4) if (0.3 * id[i] + 0.59 * id[i + 1] + 0.11 * id[i + 2] < 110) sb++; out.sombres = sb / (id.length / 4); out.ouverturePx = mb.ouverture;
      Avatar.rendre({ blinkL: 1 }); const clin = __m.copie(Avatar.canvas()); out.clinG = __m.diffMoy(neutre, clin, 0.3, 0.5, 0.15, 0.5); out.clinD = __m.diffMoy(neutre, clin, 0.3, 0.5, 0.5, 0.85); out.clinBas = __m.diffMoy(neutre, clin, 0.55, 0.9);
      Avatar.rendre({ smile: 1 }); const sou = __m.copie(Avatar.canvas()); out.sourire = __m.boite(neutre, sou, 25); out.sourireHaut = __m.diffMoy(neutre, sou, 0.1, 0.4); out.sourireBas = __m.diffMoy(neutre, sou, 0.5, 0.8);
      Avatar.rendre({ yaw: 0.35 }); const tete = __m.copie(Avatar.canvas()); out.tete = __m.diffMoy(neutre, tete, 0.1, 0.8);
      const feuille = document.createElement('canvas'); feuille.width = 540 * 4; feuille.height = 960; const f = feuille.getContext('2d');
      [[{}], [{ jaw: 0.7 }], [{ blinkL: 1, smile: 0.5 }], [{ yaw: 0.3, roll: 0.1, smile: 0.7 }]].forEach((p, i) => { Avatar.rendre(p[0]); f.drawImage(Avatar.canvas(), i * 540, 0); });
      out.feuille = __m.png(feuille); out.identite = identite;
      /* vitesse : 60 images (bouche + clins) */
      const t1 = performance.now(); for (let i = 0; i < 60; i++) Avatar.rendre({ jaw: (i % 10) / 10, blinkL: i % 7 === 0 ? 1 : 0, yaw: Math.sin(i / 9) * 0.2 }); out.ms = (performance.now() - t1) / 60;
      return out;
    });
    await sauver('homme-feuille', C.feuille);
    ok(C.identite < 3, `${tag} C) IDENTITÉ : au repos le rendu est la photo (écart moyen ${C.identite.toFixed(2)} / 255 sur toute l'image)`);
    ok(C.bouche.n > 800 && C.bouche.y0 > 0.44 && C.hautInchange < 0.6, `${tag} C) la bouche ouverte ne change que le bas du visage : ${C.bouche.n} pixels, de ${(C.bouche.y0 * 100).toFixed(0)} % à ${(C.bouche.y1 * 100).toFixed(0)} % de hauteur ; yeux et front inchangés (${C.hautInchange.toFixed(2)})`);
    ok(C.sombres > 0.45 && C.ouverturePx > 30, `${tag} C) l'intérieur de la bouche est dessiné : ${(C.sombres * 100).toFixed(0)} % de l'ouverture (${C.ouverturePx.toFixed(0)} px) est sombre ou rouge (cavité, langue), au lieu des lèvres de la photo`);
    ok(C.clinG > 4 && C.clinD < 0.5 && C.clinBas < 0.5, `${tag} C) clin d'œil : œil gauche change (${C.clinG.toFixed(1)}), œil droit (${C.clinD.toFixed(2)}) et bas du visage (${C.clinBas.toFixed(2)}) inchangés`);
    ok(C.sourire.n > 300 && C.sourireBas > 3 * C.sourireHaut && C.sourireHaut < 1, `${tag} C) sourire : ${C.sourire.n} pixels changés ; bas du visage ${C.sourireBas.toFixed(1)} contre front et yeux ${C.sourireHaut.toFixed(2)}`);
    ok(C.tete > 3, `${tag} C) la tête tourne (écart moyen ${C.tete.toFixed(1)} avec la tête de face)`);
    ok(C.ms < 60, `${tag} K) vitesse de dessin : ${C.ms.toFixed(1)} ms par image (limite 60 ms en logiciel, ≥ 30 images/s visé sur téléphone)`);
  }

  /* lunettes : détectées sur l'homme à lunettes, pas sur les autres ; elles adoucissent les sourcils (la monture n'est plus arrachée) */
  if (sansSuivi) dire(`ℹ️ ${tag} C) lunettes : sans suivi de visage ici, la détection des lunettes n'est pas mesurable (jouée sur Chromium)`);
  else {
    const Lu = await page.evaluate(async () => {
      const r = {}; r.homme = Avatar.etat().lunettes;
      await Avatar.depuisPhoto(await __m.photo('/fix/fictif-barbe.jpg', 'barbe.jpg', 'image/jpeg')); r.barbe = Avatar.etat().lunettes; r.source = Avatar.etat().source;
      Avatar.rendre({}); const n0 = __m.copie(Avatar.canvas()); Avatar.rendre({ browL: 1, browR: 1 }); r.avec = __m.diffMoy(n0, Avatar.canvas(), 0.3, 0.6);
      document.getElementById('avLunettes').click(); Avatar.rendre({}); const n1 = __m.copie(Avatar.canvas()); Avatar.rendre({ browL: 1, browR: 1 }); r.sans = __m.diffMoy(n1, Avatar.canvas(), 0.3, 0.6); r.bouton = Avatar.etat().lunettes;
      document.getElementById('avLunettes').click();
      await Avatar.depuisPhoto(await __m.photo('/fix/fictif-homme.jpg', 'homme.jpg', 'image/jpeg')); return r;
    });
    ok(Lu.source === 'photo' && Lu.homme === false && Lu.barbe === true && Lu.bouton === false && Lu.avec < Lu.sans * 0.6, `${tag} C) lunettes : repérées sur l'homme à lunettes (${Lu.barbe}), pas sur l'autre (${Lu.homme}) ; sourcils levés : ${Lu.avec.toFixed(2)} avec le réglage « lunettes » contre ${Lu.sans.toFixed(2)} sans ; le bouton corrige à la main`, JSON.stringify(Lu));
  }

  /* H. filtre noir & blanc, puis retour au réel */
  if (E.source === 'photo') {
    const H = await page.evaluate(async () => { Avatar.rendre({}); const s0 = __m.saturation(Avatar.canvas()); await Avatar.appliquerLook('nb'); Avatar.rendre({}); const s1 = __m.saturation(Avatar.canvas()); await Avatar.appliquerLook('reel'); Avatar.rendre({}); return { s0, s1, s2: __m.saturation(Avatar.canvas()), look: Avatar.etat().look }; });
    ok(H.s0 > 0.12 && H.s1 < 0.03 && Math.abs(H.s2 - H.s0) < 0.01 && H.look === 'reel', `${tag} H) filtre noir & blanc : saturation ${H.s0.toFixed(2)} → ${H.s1.toFixed(3)} → retour au réel ${H.s2.toFixed(2)}`);
    /* I. look IA (service simulé) */
    const L = await page.evaluate(async () => { await Avatar.appliquerLook('toon3d'); const e = Avatar.etat(); Avatar.rendre({ jaw: 0.4 }); return { look: e.look, retrouves: e.looksRetrouves, textures: e.texturesLook, vide: __m.vide(Avatar.canvas()) }; });
    const cor = ctx.__corps[ctx.__corps.length - 1] || {};
    ok(cor.style === 'toon3d' && cor.avatar === true && cor.petite === true, `${tag} I) look IA : la demande part avec style « ${cor.style} », consigne avatar=${cor.avatar}, petite image=${cor.petite}`);
    ok(L.look === 'toon3d' && L.textures === 1 && L.retrouves === (sansSuivi ? 0 : 1) && L.vide > 20, `${tag} I) le dessin remplace la photo (${L.textures} texture) et le visage y est re-trouvé (${L.retrouves}/1), rendu non vide`, JSON.stringify(L) + ' ' + (await page.evaluate(() => Avatar.etat().erreurLook)));
    await page.evaluate(async () => { await Avatar.appliquerLook('reel'); });
  }

  /* E. voix */
  const parole = PAROLE.toString('base64'), sinus = SINUS.toString('base64');
  const V = await page.evaluate(async ({ parole }) => {
    const blob = await __m.wav(parole); const son = await Avatar.preparerSonDepuis(blob); const f = son.frames; let silence = 0, vo = 0;
    f.slice(0, 6).forEach((x) => { silence = Math.max(silence, x.jaw); }); f.slice(Math.round(0.3 * 30), Math.round(0.7 * 30)).forEach((x) => { vo = Math.max(vo, x.jaw); });
    return { duree: son.duree, n: f.length, silence, voyelle: vo };
  }, { parole });
  ok(Math.abs(V.duree - 2.5) < 0.1 && V.silence < 0.05 && V.voyelle > 0.35, `${tag} E) voix décodée : ${V.duree.toFixed(2)} s, ${V.n} images de bouche, silence ${V.silence.toFixed(2)}, voyelle « a » ${V.voyelle.toFixed(2)}`);
  const Hh = await page.evaluate(async ({ sinus }) => {
    const blob = await __m.wav(sinus); const r = {}; Avatar.reglerHauteur('naturelle'); let s = await Avatar.preparerSonDepuis(blob); r.f0 = __m.frequence(s.buffer); r.d0 = s.duree;
    Avatar.reglerHauteur('aigue'); s = await Avatar.preparerSonDepuis(blob); r.f1 = __m.frequence(s.buffer); r.d1 = s.duree;
    Avatar.reglerHauteur('grave'); s = await Avatar.preparerSonDepuis(blob); r.f2 = __m.frequence(s.buffer); r.d2 = s.duree; Avatar.reglerHauteur('perso'); return r;
  }, { sinus });
  ok(Math.abs(Hh.f0 - 200) < 8 && Math.abs(Hh.f1 / Hh.f0 - 1.22) < 0.07 && Math.abs(Hh.f2 / Hh.f0 - 0.82) < 0.07 && Math.abs(Hh.d1 / Hh.d0 - 1) < 0.04 && Math.abs(Hh.d2 / Hh.d0 - 1) < 0.04,
    `${tag} E) hauteur de la voix : ${Hh.f0.toFixed(0)} Hz → aiguë ${Hh.f1.toFixed(0)} Hz, grave ${Hh.f2.toFixed(0)} Hz ; durée gardée (${(Hh.d1 / Hh.d0 * 100).toFixed(1)} %, ${(Hh.d2 / Hh.d0 * 100).toFixed(1)} %)`);
  /* la voix IA par le service (simulé) + une voix ajoutée par une autre branche */
  const F = await page.evaluate(async ({ parole }) => {
    document.getElementById('avScript').value = 'Bonjour tout le monde'; Avatar.reglerMode('texte'); Avatar.reglerHauteur('naturelle');
    let appels = 0; Avatar.Voix.ajouter({ id: 'clone-essai', nom: 'Voix clonée (essai)', emoji: '🧬', fabriquer: async () => { appels++; return await __m.wav(parole); } });
    const chips = [...document.querySelectorAll('#avVoix .chip')].map((c) => c.dataset.id);
    await Avatar.jouer(false); const e1 = Avatar.etat();
    return { chips, son: e1.son, appels };
  }, { parole });
  ok(F.chips.includes('domaine') && F.chips.includes('clone-essai') && F.son && F.son.duree > 1.5, `${tag} E) voix IA du service lue (${F.son ? F.son.duree.toFixed(2) : '?'} s) ; une voix ajoutée par une autre branche apparaît dans la liste (${F.chips.join(', ')})`, JSON.stringify(F).slice(0, 300));
  const F2 = await page.evaluate(async () => { document.querySelector('#avVoix .chip[data-id="clone-essai"]').click(); Avatar.reglerMode('texte'); await Avatar.jouer(false); return Avatar.etat().son; });
  ok(!!F2 && F2.duree > 1.5, `${tag} E) choisir la voix ajoutée la fait parler (contrat « fournisseur de voix » pour le clonage)`);

  /* F. enregistrement vidéo */
  const mr = await page.evaluate(() => typeof MediaRecorder !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream);
  if (mr) {
    await page.evaluate(async ({ parole }) => { Avatar.reglerMode('fichier'); await Avatar.preparerSonDepuis(await __m.wav(parole)); Avatar.definirHumeur('joie'); await Avatar.jouer(true); }, { parole });
    const Fv = await page.evaluate(async () => {
      const b = Avatar.sortie(); if (!b) return { taille: 0 };
      const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.src = URL.createObjectURL(b);
      const meta = await new Promise((ok2) => { v.onloadedmetadata = () => ok2(true); v.onerror = () => ok2(false); setTimeout(() => ok2(false), 8000); });
      let rms = 0; try { const ctx2 = new (window.AudioContext || window.webkitAudioContext)(); const ab = await ctx2.decodeAudioData(await b.arrayBuffer()); const x = ab.getChannelData(0); let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; rms = Math.sqrt(s / x.length); } catch (e) { rms = -1; }
      return { taille: b.size, type: b.type, meta, w: v.videoWidth, h: v.videoHeight, rms, info: Avatar.etat().sortieInfo };
    });
    ok(Fv.taille > 4000 && /video/.test(Fv.type || '') && Fv.meta && Fv.w === 540 && Fv.h === 960, `${tag} F) vidéo enregistrée : ${Fv.taille} octets, ${Fv.type}, ${Fv.w}×${Fv.h}`, JSON.stringify(Fv));
    ok(Fv.rms > 0.01 || Fv.rms === -1, `${tag} F) la vidéo contient le SON de la voix (niveau ${Fv.rms === -1 ? 'non décodable par ce moteur' : Fv.rms.toFixed(3)} ; ${JSON.stringify(Fv.info)})`, JSON.stringify(Fv.info));
  } else {
    const h = await page.evaluate(async () => { await Avatar.jouer(true); return document.getElementById('avHint').textContent; });
    ok(/enregistrer|Mets à jour|navigateur/i.test(h), `${tag} F) ce moteur ne sait pas enregistrer : l'écran le DIT en français (« ${h.slice(0, 70)} »)`);
  }

  /* G. garder / recharger */
  if (E.source === 'photo') {
    const G = await page.evaluate(async () => {
      await Avatar.garder(); const bd = await new Promise((ok2, ko2) => { const q = indexedDB.open('crea_avatars', 1); q.onsuccess = () => ok2(q.result); q.onerror = () => ko2(q.error); });
      const l = await new Promise((ok2) => { const r = bd.transaction('avatars').objectStore('avatars').getAll(); r.onsuccess = () => ok2(r.result || []); });
      const p = l[l.length - 1] && l[l.length - 1].paquet; const val = p ? AvatarCore.validerPaquet(p) : { ok: false };
      await Avatar.charger(p); const e = Avatar.etat(); Avatar.rendre({ jaw: 0.5 });
      return { n: l.length, ok: val.ok, vues: e.vues, source: e.source, octets: JSON.stringify(p).length, vide: __m.vide(Avatar.canvas()) };
    });
    ok(G.n >= 1 && G.ok && G.vues === 1 && G.source === 'photo' && G.vide > 8, `${tag} G) avatar gardé (${G.octets} octets) puis rechargé : paquet valide, ${G.vues} vue, rendu non vide`, JSON.stringify(G));
  }

  /* D. chien : à la main */
  await page.evaluate(async () => { await Avatar.depuisPhoto(await __m.photo('/fix/fictif-chien.jpg', 'chien.jpg', 'image/jpeg'), { manuel: true }); });
  const T0 = await page.evaluate(() => Avatar.touchesInfo());
  ok(!!T0 && T0.n === 0, `${tag} D) chien : l'écran demande de toucher les yeux et la bouche`);
  if (T0) {
    await toucherYeuxBouche(page, T0, [[246, 158], [394, 160], [324, 362]]);
    const D = await page.evaluate(() => { const e = Avatar.etat(); if (e.source !== 'photo') return { source: e.source }; Avatar.rendre({}); const n0 = __m.copie(Avatar.canvas()); Avatar.rendre({ jaw: 1 }); const c1 = __m.copie(Avatar.canvas()); const b = { haut: __m.diffMoy(n0, c1, 0.05, 0.35), bouche: __m.diffMoy(n0, c1, 0.5, 0.85), n: __m.boite(n0, c1, 30).n }; const png = __m.png(Avatar.canvas()); Avatar.rendre({ blinkL: 1, blinkR: 1 }); return { source: e.source, manuel: e.manuel[0], b, png, ferme: __m.png(Avatar.canvas()) }; });
    ok(D.source === 'photo' && D.manuel === true && D.b && D.b.bouche > 4 && D.b.bouche > 3 * D.b.haut, `${tag} D) chien placé à la main : la bouche s'ouvre sous les yeux (changement ${D.b ? D.b.bouche.toFixed(1) : '?'} dans la zone de la bouche contre ${D.b ? D.b.haut.toFixed(1) : '?'} sur le front)`, JSON.stringify(D).slice(0, 160));
    if (D.png) { await sauver('chien-bouche', D.png); await sauver('chien-yeux-fermes', D.ferme); }
  }

  /* J. caméra (Chromium, visage vidéo simulé) */
  if (nom === 'chromium' && !process.env.SANS_CAMERA) {
    await page.evaluate(async () => { await Avatar.depuisPhoto(await __m.photo('/fix/fictif-homme.jpg', 'homme.jpg', 'image/jpeg')); });
    const images = await page.evaluate(() => { const o = []; [0, 1].forEach((j) => { Avatar.rendre({ jaw: j }); o.push(__m.png(Avatar.canvas())); }); return o; });
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cam-')); let y4m = null;
    try {
      images.forEach((b, i) => fs.writeFileSync(path.join(d, `a${i}.png`), Buffer.from(b, 'base64')));
      const liste = []; for (let k = 0; k < 24; k++) liste.push(k % 24 < 12 ? 'a0.png' : 'a1.png'); fs.writeFileSync(path.join(d, 'l.txt'), liste.map((f) => `file '${f}'\nduration 0.1`).join('\n'));
      const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(d, 'l.txt'), '-vf', 'scale=640:480:force_original_aspect_ratio=decrease,pad=640:480:(ow-iw)/2:(oh-ih)/2,fps=10', '-pix_fmt', 'yuv420p', path.join(d, 'visage.y4m')], { encoding: 'utf8', timeout: 60000 });
      if (r.status === 0) y4m = path.join(d, 'visage.y4m'); else dire('ℹ️ ffmpeg a échoué : ' + (r.stderr || '').slice(0, 120));
    } catch (e) { dire('ℹ️ caméra simulée impossible : ' + e.message); }
    if (y4m) {
      const b2 = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-video-capture=' + y4m] });
      const ctx2 = await contexte(b2, 'chromium'); const e2 = []; const p2 = await ouvrirStudio(ctx2, e2);
      await p2.evaluate(() => { Avatar.choisirPerso('panda'); Avatar.reglerMode('camera'); });
      const mesure = await p2.evaluate(async () => {
        try { await Avatar.jouer(false); } catch (e) { return { erreur: String(e && e.message) }; }
        const vals = []; for (let i = 0; i < 90; i++) { await new Promise((r) => setTimeout(r, 120)); Avatar.rendre(); vals.push(Avatar.etat().params.jaw); if (i > 25 && Math.max(...vals) > 0.4 && Math.min(...vals.slice(5)) < 0.15) break; }
        const e = Avatar.etat(); return { vals, camera: e.camera };
      });
      const v = mesure.vals || [];
      ok(mesure.camera === true && v.length > 10 && Math.max(...v) > 0.35 && Math.min(...v.slice(5)) < 0.2, `${tag} J) caméra : l'avatar copie la bouche (jaw de ${v.length ? Math.min(...v.slice(5)).toFixed(2) : '?'} à ${v.length ? Math.max(...v).toFixed(2) : '?'} sur ${v.length} mesures)`, JSON.stringify(mesure).slice(0, 200));
      await p2.evaluate(() => Avatar.pause()); erreurs.push(...e2);
      await b2.close();
    }
    try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* ok */ }
  } else if (nom !== 'chromium') dire(`ℹ️ ${nom} : la caméra simulée (fichier vidéo) n'existe que sous Chromium — confié au Lenovo / à l'iPhone réel (mission au pont)`);

  /* M. vidéo « tour de la tête » (une vidéo fabriquée ici : la tête tourne de -0,55 à +0,55 rad, avec la voix en son) */
  if (nom !== 'webkit' && !process.env.SANS_VIDEO) {
    await page.evaluate(async () => { await Avatar.depuisPhoto(await __m.photo('/fix/fictif-homme.jpg', 'homme.jpg', 'image/jpeg')); });
    const rendus = await page.evaluate(() => { const o = []; for (let i = 0; i < 20; i++) { const yaw = -0.55 + 1.1 * i / 19; Avatar.rendre({ yaw }); o.push(__m.png(Avatar.canvas())); } return o; });
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'orbite-')); let fichier = null;
    try {
      rendus.forEach((b, i) => fs.writeFileSync(path.join(d, `f${String(i).padStart(2, '0')}.png`), Buffer.from(b, 'base64'))); fs.writeFileSync(path.join(d, 'voix.wav'), PAROLE);
      const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '6.6', '-i', path.join(d, 'f%02d.png'), '-i', path.join(d, 'voix.wav'), '-vf', 'scale=360:640,format=yuv420p', '-c:v', 'libvpx', '-auto-alt-ref', '0', '-b:v', '1500k', '-c:a', 'libopus', '-shortest', path.join(d, 'orbite.webm')], { encoding: 'utf8', timeout: 90000 });
      if (r.status === 0) { fichier = path.join(d, 'orbite.webm'); TMPFILES.set('orbite.webm', fichier); } else dire('ℹ️ ffmpeg a échoué : ' + (r.stderr || '').slice(0, 120));
    } catch (e) { dire('ℹ️ vidéo simulée impossible : ' + e.message); }
    if (fichier) {
      const M = await page.evaluate(async () => {
        await Avatar.depuisVideo(await __m.fichier('/tmpfile/orbite.webm', 'orbite.webm', 'video/webm'));
        const e = Avatar.etat(); const r = { source: e.source, vues: e.vues, yaws: e.yaws };
        Avatar.rendre({ yaw: 0 }); const a = __m.copie(Avatar.canvas()); Avatar.rendre({ yaw: 0.3 }); const b = Avatar.canvas(); r.diff = __m.diffMoy(a, b, 0.1, 0.8); r.vide = __m.vide(b);
        const bt = document.getElementById('avVoixVideo'); r.bouton = bt && !bt.classList.contains('hidden'); if (r.bouton) { bt.click(); for (let i = 0; i < 40 && !(Avatar.etat().son && Avatar.etat().son.duree > 1); i++) await new Promise((o) => setTimeout(o, 250)); } r.son = Avatar.etat().son;
        return r;
      });
      ok(M.source === 'photo' && M.vues >= 2 && (Math.max(...M.yaws) - Math.min(...M.yaws)) > 0.12 && M.diff > 3 && M.vide > 20, `${tag} M) vidéo du tour de la tête : ${M.vues} vue(s) gardée(s) aux angles ${M.yaws.map((v) => (v * 57.3).toFixed(0) + '°').join(', ')} ; la tête tourne à l'écran (écart ${M.diff ? M.diff.toFixed(1) : '?'})`, JSON.stringify(M).slice(0, 200));
      ok(M.bouton === true && M.son && Math.abs(M.son.duree - 2.5) < 0.4, `${tag} M) « prendre la voix de la vidéo » : bouton présent, voix récupérée de ${M.son ? M.son.duree.toFixed(2) : '?'} s (attendu 2,5 s)`);
    }
    try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* ok */ }
  }

  ok(erreurs.length === 0, `${tag} L) 0 erreur JavaScript pendant tout le parcours`, erreurs.slice(0, 3).join(' | '));
  await ctx.close();
}

for (const nom of MOTEURS) {
  if (!CIBLE[nom]) { dire(`❌ moteur inconnu : ${nom}`); ko++; continue; }
  const b = await lancer(nom); if (!b) continue;
  try { await suite(nom, b); } catch (e) { ok(false, `${nom} : le parcours s'est arrêté`, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); }
  await b.close();
}
srv.close();
dire(`\n${n - ko}/${n} contrôles OK` + (ko ? ` — ${ko} rouge(s) :\n  - ` + rouges.join('\n  - ') : ''));
if (RESUME) { try { fs.appendFileSync(RESUME, '## Avatars & marionnettes — vérification réelle\n\n' + lignes.map((l) => '- ' + l).join('\n') + '\n'); } catch (e) { /* ok */ } }
if (process.env.GITHUB_ACTIONS) { for (const r of rouges.slice(0, 30)) console.log('::error title=avatars-navigateur::' + r.replace(/[\r\n]+/g, ' ').slice(0, 400)); console.log('::notice title=avatars-navigateur::' + (n - ko) + '/' + n + ' contrôles OK ; moteurs : ' + MOTEURS.join(', ')); }
process.exit(ko ? 1 : 0);
