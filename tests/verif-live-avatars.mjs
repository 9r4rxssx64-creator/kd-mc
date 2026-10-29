/* VÉRIFICATION RÉELLE, EN LIGNE, CONNECTÉ EN ADMIN — Studio « Avatars & marionnettes » avec le VRAI service IA (Kevin 29.10.2026 ; « réel toujours », « connecte-toi réel comme moi »).
 * Tourne en CI au dépôt PUBLIC (gratuit) : le code admin vient du SECRET (empreinte, jamais écrite ni journalisée) et part au DOMAINE comme quand Kevin le tape.
 * Le visage envoyé est une personne FICTIVE (tests/avatars-donnees) : aucune vraie personne ne sort d'un journal public.
 *
 *   A. connexion admin ; B. ce qui est SERVI par studio.kd-mc.com : version, les 4 fichiers de l'avatar, la section ;
 *   C. pour chaque look (Toon 3D, Anime, Marionnette feutre, Peluche, Brique, Argile) : le service rend une VRAIE image avec la consigne « avatar »,
 *      et le suivi de visage RE-TROUVE le visage dessus (écart des repères en % de l'écart entre les yeux) — c'est ce qui rend l'animation possible ;
 *   D. la voix du service (MeloTTS) : durée, synchro des lèvres calculée ;
 *   E. le parcours COMPLET dans la vraie page : photo → look IA « feutre » → la bouche s'ouvre sur le dessin ; rendus déposés dans CAPTURES pour être REGARDÉS ;
 *   F. 0 erreur JavaScript.
 * node tests/verif-live-avatars.mjs   (KDMC_ADMIN_PIN_SHA256 requis ; CAPTURES = dossier des rendus)
 * Essai sans réseau : ESSAI_LOCAL=1 (domaine, service IA simulés ; vraie page du dépôt ; le suivi de visage vient quand même de jsDelivr/Google, sinon « indisponible »). */
import { readFileSync, appendFileSync, mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';

const LOCAL = process.env.ESSAI_LOCAL === '1';
const SAB = LOCAL ? String(process.env.SABOTAGE || '') : ''; /* essai local seulement : ia = le service ne rend plus d'image · version = sw.js servi d'une autre version */
/* attente par sondage (pas de waitForFunction : la sécurité du domaine l'interdit) */
const attendre = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch (e) { /* page en chargement */ } await new Promise((r) => setTimeout(r, 250)); } return false; };
const HASH = LOCAL ? '0'.repeat(64) : String(process.env.KDMC_ADMIN_PIN_SHA256 || '').trim().toLowerCase();
const DOMAINE = 'https://kd-mc.com', STUDIO = 'https://studio.kd-mc.com', IA = 'https://crea-ai.kd-mc.com';
const CAPTURES = process.env.CAPTURES || '/tmp/avatars-live';
const RESUME = process.env.GITHUB_STEP_SUMMARY || '';
const RACINE = process.cwd(), DIR = process.env.STUDIO_DIR || join(RACINE, 'tools/crea-studio');
const lignes = []; const dire = (t) => { console.log(t); lignes.push(t); };
let echecs = 0; const ok = (c, m, d) => { if (!c) echecs++; dire(`${c ? '✅' : '❌'} ${m}${!c && d ? ' — ' + String(d).slice(0, 600) : ''}`); };
const fin = (code) => {
  if (RESUME) { try { appendFileSync(RESUME, '## Avatars — vérification réelle (admin, vrai service IA)\n\n' + lignes.map((l) => '- ' + l).join('\n') + '\n'); } catch (_) { /* pas de résumé */ } }
  dire(code ? `=== VÉRIF AVATARS : ÉCHEC (${echecs} contrôle(s))` : '=== VÉRIF AVATARS : OK'); process.exit(code);
};
if (!/^[0-9a-f]{64}$/.test(HASH)) { dire('❌ Code admin absent (secret CI) : vérification réelle IMPOSSIBLE — je n\'affirme rien.'); fin(1); }
try { mkdirSync(CAPTURES, { recursive: true }); } catch (_) { /* déjà là */ }
/* essai local sans accès au suivi de visage (jsDelivr / Google) : on le DIT et on ne prétend rien (le vrai robot, lui, a le réseau) */
if (LOCAL) {
  const joignable = await Promise.all(['https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/package.json', 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'].map((u) => fetch(u, { method: 'HEAD', signal: AbortSignal.timeout(10000) }).then((x) => x.ok).catch(() => false)));
  if (joignable.some((x) => !x)) { dire('⚠️ essai local : le suivi de visage (jsDelivr / Google) est injoignable ici — garde non jouée, rien d\'affirmé'); process.exit(0); }
}


const FIXTURE = readFileSync(join(RACINE, 'tests/avatars-donnees/fictif-homme.jpg'));
const FIXTURE_B64 = FIXTURE.toString('base64');
const MIME = { '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.html': 'text/html', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
/* une voix de synthèse minimale pour l'essai local (le vrai service rend de la vraie voix) */
function wavEssai() { const sr = 16000, n = sr * 1.2, b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40); for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(8000 * Math.sin(2 * Math.PI * 220 * i / sr) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 3 * i / sr))), 44 + i * 2); return b; }

const browser = await chromium.launch(process.env.PW_EXE ? { executablePath: process.env.PW_EXE } : { args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
const appelsIA = [];
if (LOCAL) {
  await ctx.route('**/*', (r) => {
    const q = r.request(), u = new URL(q.url()); const J = (o, st = 200) => r.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.hostname === 'cdn.jsdelivr.net' || u.hostname === 'storage.googleapis.com') return r.continue();
    if (u.hostname === 'kd-mc.com') { if (u.pathname === '/__admin/login') return J({ ok: true, token: 't-essai' }); return r.fulfill({ status: 200, contentType: 'text/javascript', body: '// portail' }); }
    if (u.hostname === 'studio.kd-mc.com') {
      if (u.pathname.startsWith('/__')) return J({ ok: false });
      let p = u.pathname === '/' ? '/index.html' : u.pathname; const f = join(DIR, p);
      if (!existsSync(f) || statSync(f).isDirectory()) return r.fulfill({ status: 404, body: '' });
      if (SAB === 'version' && p === '/sw.js') return r.fulfill({ status: 200, contentType: 'text/javascript', body: readFileSync(f, 'utf8').replace(/crea-studio-v[0-9.]+/, 'crea-studio-v0.0.1') });
      return r.fulfill({ status: 200, contentType: MIME[extname(f)] || 'application/octet-stream', body: readFileSync(f) });
    }
    if (u.hostname === 'crea-ai.kd-mc.com' || u.hostname === 'kdmc-crea-ai.9r4rxssx64.workers.dev') {
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-expose-headers': 'x-crea-provider,x-crea-style' };
      if (q.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
      if (u.pathname === '/voice') return r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'audio/wav', 'x-crea-provider': 'essai' }, body: wavEssai() });
      if (u.pathname === '/cartoon' && SAB === 'ia') return r.fulfill({ status: 502, headers: cors, body: '{}' });
      if (u.pathname === '/cartoon') { let b = {}; try { b = JSON.parse(q.postData() || '{}'); } catch (_) { /* ok */ } appelsIA.push(b);
        return r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'image/jpeg', 'x-crea-provider': 'essai', 'x-crea-style': b.style || '' }, body: FIXTURE }); }
      return r.fulfill({ status: 404, headers: cors, body: '{}' });
    }
    return r.abort();
  });
}

async function connecter(page) {
  await page.goto(DOMAINE + '/sw.js', { waitUntil: 'domcontentloaded', timeout: 60000 });
  return page.evaluate(async (h) => {
    const x = await fetch('/__admin/login', { method: 'POST', credentials: 'include', cache: 'no-store', headers: { 'content-type': 'application/json', 'x-kdmc-verif': '1' }, body: JSON.stringify({ hash: h }) });
    const j = await x.json().catch(() => ({})); return { st: x.status, ok: !!j.ok, raison: j.reason || '', token: j.token || '' };
  }, HASH);
}

try {
  const page = await ctx.newPage(); const fautes = [];
  page.on('pageerror', (e) => fautes.push(String(e && e.message).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|INFO:|XNNPACK|GPU|WebGL|GL Driver/i.test(m.text())) fautes.push('console: ' + m.text().slice(0, 160)); });

  /* A. connexion */
  const c = await connecter(page);
  ok(c.ok && !!c.token, 'A) connexion ADMIN au domaine (le code, vérifié par kd-mc.com — comme quand Kevin le tape)', c.ok ? 'pas de pass rendu' : `HTTP ${c.st} ${c.raison}`);
  if (!c.ok || !c.token) { await browser.close(); fin(1); }
  const PASS = c.token;

  /* B. ce qui est SERVI */
  await page.goto(STUDIO + '/sw.js', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const servi = await page.evaluate(async () => {
    const t = async (p) => { try { const x = await fetch(p, { cache: 'no-store' }); return { ok: x.ok, st: x.status, txt: x.ok ? await x.text() : '' }; } catch (e) { return { ok: false, st: 0, txt: '' }; } };
    const r = { sw: await t('/sw.js'), page: await t('/') };
    for (const f of ['core', 'rendu', 'persos', 'studio']) r[f] = await t('/avatar-' + f + '.js');
    return r;
  });
  const vServie = (/crea-studio-v([0-9.]+)/.exec(servi.sw.txt) || [])[1] || '', vDepot = (/crea-studio-v([0-9.]+)/.exec(readFileSync(join(DIR, 'sw.js'), 'utf8')) || [])[1] || '';
  ok(vServie && vServie === vDepot, `B) version SERVIE par studio.kd-mc.com : v${vServie || '?'} (dépôt : v${vDepot})`, 'le déploiement n\'a pas (encore) pris — ne pas dire « en ligne »');
  ok(['core', 'rendu', 'persos', 'studio'].every((f) => servi[f].ok && servi[f].txt.length > 3000 && /AvatarCore|AvatarRendu|AvatarPersos|racine\.Avatar/.test(servi[f].txt)), `B) les 4 fichiers de l'avatar sont SERVIS (${['core', 'rendu', 'persos', 'studio'].map((f) => servi[f].st + ':' + servi[f].txt.length).join(', ')} octets)`);
  ok(/id="s-avatar"/.test(servi.page.txt) && /data-go="avatar"/.test(servi.page.txt) && /avatar-studio\.js/.test(servi.page.txt), 'B) la page SERVIE contient la section « Avatars » et ses scripts');

  /* la vraie page, compte local fictif pour passer la porte du Studio (aucune donnée de Kevin) */
  await page.goto(STUDIO + '/', { waitUntil: 'load', timeout: 60000 });
  await page.evaluate((t) => { try { localStorage.setItem('crea_sso_token', t); } catch (e) { /* ok */ } }, PASS);
  await attendre(() => page.evaluate(() => !!(window.Avatar && document.querySelectorAll('#bnav button[data-go]').length >= 10)), 40000);
  const pret = await page.evaluate(() => !!window.Avatar);
  ok(pret, 'B) la vraie page se charge avec le moteur d\'avatar (window.Avatar)');
  if (pret) {
    await page.evaluate(() => { const g = document.getElementById('gate'); if (g && !g.classList.contains('hidden')) { document.getElementById('gateName').value = 'Robot Avatars'; document.getElementById('gateCode').value = '123456'; document.getElementById('gateGo').click(); } });
    await attendre(() => page.evaluate(() => { const g = document.getElementById('gate'); return !g || g.classList.contains('hidden'); }), 30000);
    await page.click('#bnav button[data-go="avatar"]').catch(() => null); await page.waitForTimeout(300);

    /* C. les looks IA : une vraie image, et le visage re-trouvé dessus */
    const LOOKS = ['toon3d', 'anime', 'feutre', 'peluche', 'lego', 'clay'];
    for (const style of LOOKS) {
      const R = await page.evaluate(async ({ IA, PASS, style, b64 }) => {
        const t0 = performance.now();
        try {
          const im0 = new Image(); await new Promise((o) => { im0.onload = o; im0.src = 'data:image/jpeg;base64,' + b64; });
          const c0 = document.createElement('canvas'); c0.width = im0.width; c0.height = im0.height; c0.getContext('2d').drawImage(im0, 0, 0);
          const p = document.createElement('canvas'); const s = Math.min(1, 480 / Math.max(c0.width, c0.height)); p.width = Math.round(c0.width * s); p.height = Math.round(c0.height * s); p.getContext('2d').drawImage(c0, 0, 0, p.width, p.height);
          const x = await fetch(IA + '/cartoon', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + PASS }, body: JSON.stringify({ image: c0.toDataURL('image/jpeg', 0.9), image_petite: p.toDataURL('image/jpeg', 0.88), style, avatar: true }) });
          const ct = x.headers.get('content-type') || ''; const ms = Math.round(performance.now() - t0);
          if (!/image/.test(ct)) { const txt = await x.text(); return { st: x.status, ms, txt: txt.slice(0, 400) }; }
          const blob = await x.blob(); const url = URL.createObjectURL(blob); const im = new Image(); await new Promise((o, ko) => { im.onload = o; im.onerror = ko; im.src = url; });
          const cv = document.createElement('canvas'); cv.width = 640; cv.height = 640; cv.getContext('2d').drawImage(im, 0, 0, 640, 640);
          const b64o = await new Promise((o) => { const fr = new FileReader(); fr.onload = () => o(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
          /* le suivi de visage sur le dessin ET sur la photo d'origine : même points ? */
          let trouve = false, ecart = null, mediapipe = true;
          try {
            const c640 = document.createElement('canvas'); c640.width = 640; c640.height = 640; c640.getContext('2d').drawImage(im0, 0, 0, 640, 640);
            const a = await Avatar.Vision.image(c640), b = await Avatar.Vision.image(cv);
            if (a && b) { trouve = true; const P = (L, i) => [L.lm[i].x * 640, L.lm[i].y * 640]; const io = Math.hypot(P(a, 33)[0] - P(a, 263)[0], P(a, 33)[1] - P(a, 263)[1]);
              ecart = [1, 152, 13, 33, 263].reduce((s2, i) => s2 + Math.hypot(P(a, i)[0] - P(b, i)[0], P(a, i)[1] - P(b, i)[1]), 0) / 5 / io; }
          } catch (e) { mediapipe = false; }
          return { st: x.status, ms, ct, octets: blob.size, dim: [im.naturalWidth, im.naturalHeight], provider: x.headers.get('x-crea-provider') || '', b64: b64o, trouve, ecart, mediapipe };
        } catch (e) { return { st: 0, ms: Math.round(performance.now() - t0), txt: String((e && e.message) || e) }; }
      }, { IA, PASS, style, b64: FIXTURE_B64 });
      const bon = R.st === 200 && R.octets > (LOCAL ? 1000 : 15000) && R.dim && R.dim[0] >= 256;
      ok(bon, `C) look « ${style} » : image rendue par l'IA (HTTP ${R.st}, ${R.octets || 0} octets, ${R.dim ? R.dim.join('×') : '?'}, ${R.ms} ms, moteur « ${R.provider || '?'} »)`, R.txt);
      if (R.b64) writeFileSync(join(CAPTURES, `look-${style}.${/png/.test(R.ct) ? 'png' : 'jpg'}`), Buffer.from(R.b64, 'base64'));
      if (bon && R.mediapipe) dire(`   ${R.trouve ? '🙂 visage re-trouvé' : '⚠️ visage NON re-trouvé (le studio garde alors les repères de la photo)'}${R.ecart != null ? ' · écart des repères ' + (R.ecart * 100).toFixed(1) + ' % de l\'écart entre les yeux' : ''}`);
      else if (bon) dire('   ℹ️ suivi de visage indisponible dans cet essai (réseau coupé) : re-détection non mesurée');
      LOOKS.found = (LOOKS.found || 0) + (R.trouve ? 1 : 0); LOOKS.bons = (LOOKS.bons || 0) + (bon ? 1 : 0);
    }
    ok((LOOKS.bons || 0) >= 5, `C) au moins 5 looks sur 6 rendus par l'IA gratuite (${LOOKS.bons || 0}/6) ; visage re-trouvé sur ${LOOKS.found || 0}/${LOOKS.bons || 0} (les autres gardent les repères de la photo)`);

    /* D. la voix du service */
    const V = await page.evaluate(async ({ IA, PASS }) => {
      try {
        const x = await fetch(IA + '/voice', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + PASS }, body: JSON.stringify({ text: 'Bonjour, je suis ton avatar. Regarde ma bouche bouger.', lang: 'fr' }) });
        if (!x.ok) return { st: x.status, txt: (await x.text()).slice(0, 300) };
        const blob = await x.blob(); const son = await Avatar.preparerSonDepuis(blob); let mx = 0; son.frames.forEach((f) => { mx = Math.max(mx, f.jaw); });
        return { st: x.status, octets: blob.size, duree: son.duree, images: son.frames.length, jawMax: mx, fournisseur: x.headers.get('x-crea-provider') };
      } catch (e) { return { st: 0, txt: String((e && e.message) || e) }; }
    }, { IA, PASS });
    ok(V.st === 200 && V.duree > 1 && V.jawMax > 0.3, `D) voix du service (${V.fournisseur || '?'}) : ${V.duree ? V.duree.toFixed(1) : '?'} s, ${V.images || 0} images de bouche, ouverture max ${V.jawMax ? V.jawMax.toFixed(2) : '?'}`, V.txt);

    /* E. le parcours complet : photo → look IA feutre → la bouche s'ouvre sur le dessin */
    const E = await page.evaluate(async ({ b64 }) => {
      const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      await Avatar.depuisPhoto(new File([u], 'fictif.jpg', { type: 'image/jpeg' })); const e0 = Avatar.etat();
      if (e0.source !== 'photo') return { etape: 'photo', e0 };
      Avatar.rendre({}); const cv = Avatar.canvas(); const nu = document.createElement('canvas'); nu.width = cv.width; nu.height = cv.height; nu.getContext('2d').drawImage(cv, 0, 0);
      const t0 = performance.now(); await Avatar.appliquerLook('feutre'); const e1 = Avatar.etat(); const ms = Math.round(performance.now() - t0);
      Avatar.rendre({ jaw: 0.7, smile: 0.3 }); const ouvert = Avatar.canvas().toDataURL('image/png').split(',')[1];
      Avatar.rendre({ blinkL: 1 }); const clin = Avatar.canvas().toDataURL('image/png').split(',')[1];
      Avatar.rendre({}); const repos = Avatar.canvas().toDataURL('image/png').split(',')[1];
      return { etape: 'ok', photo: e0, look: e1.look, textures: e1.texturesLook, retrouves: e1.looksRetrouves, ms, ouvert, clin, repos, vide: 0 };
    }, { b64: FIXTURE_B64 });
    if (E.etape === 'ok') {
      writeFileSync(join(CAPTURES, 'parcours-feutre-bouche.png'), Buffer.from(E.ouvert, 'base64')); writeFileSync(join(CAPTURES, 'parcours-feutre-clin.png'), Buffer.from(E.clin, 'base64')); writeFileSync(join(CAPTURES, 'parcours-feutre-repos.png'), Buffer.from(E.repos, 'base64'));
      ok(E.look === 'feutre' && E.textures >= 1, `E) parcours complet dans la vraie page : photo → look IA « feutre » appliqué en ${E.ms} ms (${E.textures} texture, visage re-trouvé ${E.retrouves}/1) ; rendus déposés pour être regardés`);
    } else ok(false, `E) parcours complet : arrêté à l'étape « ${E.etape} »`, JSON.stringify(E).slice(0, 300));
  }
  ok(fautes.length === 0, 'F) 0 erreur JavaScript pendant tout le parcours', fautes.slice(0, 3).join(' | '));
} catch (e) { ok(false, 'exception du robot', e && e.stack); }
await browser.close();
fin(echecs ? 1 : 0);
