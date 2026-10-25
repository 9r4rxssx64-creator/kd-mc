/* VÉRIFICATION RÉELLE DE L'IA DU STUDIO CRÉA, CONNECTÉ EN ADMIN COMME KEVIN — vrai domaine, vrai service IA
 * (Kevin 25.10.2026 : « Le rendu est vraiment dégueulasse… qualité professionnelle commerciale » ; règles « Réel toujours » et « Connecte-toi réel comme moi »).
 *
 * Tourne en CI (réseau ouvert, dépôt PUBLIC = gratuit) : le code admin vient du SECRET (empreinte SHA-256, jamais écrite ni journalisée) et part au DOMAINE
 * (POST /__admin/login) comme quand Kevin le tape ; le pass obtenu sert au service crea-ai.kd-mc.com (Authorization: Bearer), exactement comme l'app.
 * L'image envoyée est FABRIQUÉE ici (une scène dessinée : un animal brun et un cavalier schématique) : aucune photo de personne réelle ne sort d'un journal public.
 *
 * Contrôles (chacun ✅ ou ❌ avec la raison exacte) :
 *   A. connexion admin acceptée par le domaine ;
 *   B. la version SERVIE de studio.kd-mc.com est celle du dépôt (sw.js) et la page servie contient la galerie du Studio Cartoon ;
 *   C. /cartoon style=toon3d → une VRAIE image rendue par une IA (200, image, > 20 ko, dimensions lues, différente de l'entrée), moteur annoncé, durée ;
 *   D. /cartoon style=anime  → pareil, et une image DIFFÉRENTE de C (deux styles = deux rendus) ;
 *   E. /frames mode=motion n=3 → 3 instants (ou le refus exact), moteur, durée ;
 *   F. aucune erreur JavaScript.
 * Les rendus sont écrits dans CAPTURES (entrée + sorties) pour être REGARDÉS (artefact du run) : un nombre ne dit pas si c'est beau.
 *
 * node tests/verif-live-studio-ia.mjs   (KDMC_ADMIN_PIN_SHA256 requis ; CAPTURES = dossier des rendus)
 * Essai sans réseau : ESSAI_LOCAL=1 (domaine et service simulés, vraie page du dépôt) — c'est test:verif-live-studio-ia-robot.
 * SABOTAGE=ia (le service rend 502) : C, D, E DOIVENT rougir ; SABOTAGE=version (sw.js servi d'une autre version) : B DOIT rougir ;
 * SABOTAGE=copie (le service renvoie l'image d'entrée telle quelle) : C DOIT rougir (« différente de l'entrée »). */
import { readFileSync, appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const LOCAL = process.env.ESSAI_LOCAL === '1';
const SABOTAGE = String(process.env.SABOTAGE || '');
const HASH = LOCAL ? '0'.repeat(64) : String(process.env.KDMC_ADMIN_PIN_SHA256 || '').trim().toLowerCase();
const DOMAINE = 'https://kd-mc.com', STUDIO = 'https://studio.kd-mc.com', IA = 'https://crea-ai.kd-mc.com';
const CAPTURES = process.env.CAPTURES || '/tmp/captures';
const RESUME = process.env.GITHUB_STEP_SUMMARY || '';
const RACINE = process.cwd();
const lignes = [];
const dire = (t) => { console.log(t); lignes.push(t); };
let echecs = 0;
const ok = (c, m, d) => { if (!c) echecs++; dire(`${c ? '✅' : '❌'} ${m}${!c && d ? ' — ' + String(d).slice(0, 700) : ''}`); };
const fin = (code) => {
  if (RESUME) { try { appendFileSync(RESUME, '## Vérification réelle de l\'IA du Studio créa (admin, vrai service)\n\n' + lignes.map((l) => '- ' + l).join('\n') + '\n'); } catch (_) { /* pas de résumé */ } }
  dire(code ? `=== VÉRIF STUDIO IA : ÉCHEC (${echecs} contrôle(s))` : '=== VÉRIF STUDIO IA : OK');
  process.exit(code);
};
if (!/^[0-9a-f]{64}$/.test(HASH)) { dire('❌ Code admin absent (secret CI) : vérification réelle IMPOSSIBLE — je n\'affirme rien.'); fin(1); }
try { mkdirSync(CAPTURES, { recursive: true }); } catch (_) { /* dossier déjà là */ }

const browser = await chromium.launch(process.env.PW_EXE ? { executablePath: process.env.PW_EXE } : {});
const ctx = await browser.newContext({
  serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
});

/* Un PNG 1×1 fabriqué ici (aucune dépendance) pour le mode local. */
import zlib from 'node:zlib';
function crc32(buf) { let c, crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
/* `bruit` : du grain aléatoire (incompressible) — une vraie image IA pèse des dizaines de ko, un aplat uni pèse 1 ko ; le mode local doit ressembler au réel. */
function pngUni(w, h, r, g, b, bruit) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  let s = 12345;
  const al = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return bruit ? (s % 61) - 30 : 0; };
  const cl = (v) => Math.max(0, Math.min(255, v));
  const rows = []; for (let y = 0; y < h; y++) { const row = Buffer.alloc(1 + w * 3); for (let x = 0; x < w; x++) { row[1 + x * 3] = cl(r + al()); row[2 + x * 3] = cl(g + al()); row[3 + x * 3] = cl(b + al()); } rows.push(row); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}
let derniereEntree = '';
if (LOCAL) {
  const sw = readFileSync(join(RACINE, 'tools/crea-studio/sw.js'), 'utf8');
  const page = readFileSync(join(RACINE, 'tools/crea-studio/index.html'), 'utf8');
  await ctx.route('**/*', (r) => {
    const q = r.request(); const u = new URL(q.url());
    const J = (o, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.hostname === 'kd-mc.com') {
      if (u.pathname === '/__admin/login') return J({ ok: true, grant: 'g-essai', token: 't-essai', admin: true, verified: true });
      if (u.pathname === '/__sso/whoami') return J({ ok: true, uid: 'kdmc_admin', admin: true, verified: true, cgu: true });
      if (u.pathname === '/sw.js') return r.fulfill({ status: 200, contentType: 'text/javascript', body: '// portail' });
      return r.fulfill({ status: 404, body: '' });
    }
    if (u.hostname === 'studio.kd-mc.com') {
      if (u.pathname === '/sw.js') return r.fulfill({ status: 200, contentType: 'text/javascript', body: SABOTAGE === 'version' ? sw.replace(/crea-studio-v[0-9.]+/, 'crea-studio-v0.0.1') : sw });
      if (u.pathname === '/' || u.pathname === '/index.html') return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: page });
      return r.fulfill({ status: 404, body: '' });
    }
    if (u.hostname === 'crea-ai.kd-mc.com') {
      let body = {}; try { body = JSON.parse(q.postData() || '{}'); } catch (_) { /* pas de corps */ }
      const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'x-crea-provider,x-crea-style', 'access-control-allow-headers': '*' };
      if (q.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
      if (SABOTAGE === 'ia') return r.fulfill({ status: 502, headers: Object.assign({ 'content-type': 'application/json' }, cors), body: JSON.stringify({ error: 'gemini_429_credits | cf_img2img_vide' }) });
      if (u.pathname === '/cartoon') {
        if (SABOTAGE === 'copie') { const m = /^data:image\/(\w+);base64,(.+)$/.exec(body.image || ''); return r.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'image/' + (m ? m[1] : 'jpeg'), 'x-crea-provider': 'gemini:test' }, cors), body: Buffer.from(m ? m[2] : '', 'base64') }); }
        const couleur = body.style === 'anime' ? [255, 120, 200] : [60, 200, 120];
        return r.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'image/png', 'x-crea-provider': 'gemini:test', 'x-crea-style': body.style || 'cartoon' }, cors), body: pngUni(320, 400, couleur[0], couleur[1], couleur[2], true) });
      }
      if (u.pathname === '/frames') {
        const fr = [[255, 0, 0], [0, 255, 0], [0, 0, 255]].map((c) => 'data:image/png;base64,' + pngUni(4, 4, c[0], c[1], c[2]).toString('base64'));
        return r.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'application/json' }, cors), body: JSON.stringify({ frames: fr, provider: 'gemini:test', mode: body.mode, got: 3 }) });
      }
      return r.fulfill({ status: 404, headers: cors, body: '{}' });
    }
    return r.fulfill({ status: 204, body: '' });
  });
}

/* La connexion admin, par le DOMAINE (comme Kevin) : l'empreinte part à /__admin/login, jamais affichée. */
async function connecter(page) {
  await page.goto(DOMAINE + '/sw.js', { waitUntil: 'domcontentloaded', timeout: 60000 });
  return page.evaluate(async (h) => {
    const x = await fetch('/__admin/login', { method: 'POST', credentials: 'include', cache: 'no-store', headers: { 'content-type': 'application/json', 'x-kdmc-verif': '1' }, body: JSON.stringify({ hash: h }) });
    const j = await x.json().catch(() => ({}));
    return { st: x.status, ok: !!j.ok, raison: j.reason || '', token: j.token || '' };
  }, HASH);
}

try {
  const page = await ctx.newPage();
  const fautes = []; page.on('pageerror', (e) => fautes.push(String(e && e.message).slice(0, 160)));

  /* A. connexion */
  const c = await connecter(page);
  ok(c.ok && !!c.token, 'connexion ADMIN au domaine (le code, vérifié par kd-mc.com — comme quand Kevin le tape)', c.ok ? 'pas de pass rendu' : `HTTP ${c.st} ${c.raison}`);
  if (!c.ok || !c.token) { await browser.close(); fin(1); }
  const PASS = c.token;

  /* B. ce qui est SERVI par studio.kd-mc.com */
  await page.goto(STUDIO + '/sw.js', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const servi = await page.evaluate(async () => {
    const t = async (p) => { try { const x = await fetch(p, { cache: 'no-store' }); return x.ok ? await x.text() : ''; } catch (_) { return ''; } };
    return { sw: await t('/sw.js'), page: await t('/') };
  });
  const vServie = (/crea-studio-v([0-9.]+)/.exec(servi.sw) || [])[1] || '';
  const vDepot = (/crea-studio-v([0-9.]+)/.exec(readFileSync(join(RACINE, 'tools/crea-studio/sw.js'), 'utf8')) || [])[1] || '';
  ok(vServie && vServie === vDepot, `la version servie (Studio créa v${vServie || '?'}) est celle du dépôt (v${vDepot})`, 'le déploiement n\'a pas (encore) pris — ne pas dire « en ligne »');
  ok(/id="animStyles"/.test(servi.page) && /Faire vivre la photo/.test(servi.page), 'la page SERVIE contient la galerie du Studio Cartoon et « Faire vivre la photo »', servi.page.length + ' octets servis');

  /* C/D/E : les appels au VRAI service, avec le pass, depuis la page du studio (même origine que l'app) */
  const appel = (chemin, corps) => page.evaluate(async ({ IA, PASS, chemin, corps }) => {
    const t0 = performance.now();
    try {
      const x = await fetch(IA + chemin, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + PASS }, body: JSON.stringify(corps) });
      const ct = x.headers.get('content-type') || '';
      const ms = Math.round(performance.now() - t0);
      if (/image/.test(ct)) {
        const b = await x.blob(); const u = URL.createObjectURL(b);
        const dim = await new Promise((res) => { const im = new Image(); im.onload = () => res([im.naturalWidth, im.naturalHeight]); im.onerror = () => res([0, 0]); im.src = u; });
        const b64 = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] || ''); fr.readAsDataURL(b); });
        return { st: x.status, ct, ms, octets: b.size, dim, provider: x.headers.get('x-crea-provider') || '', style: x.headers.get('x-crea-style') || '', b64 };
      }
      const txt = await x.text(); let j = {}; try { j = JSON.parse(txt); } catch (_) { /* pas JSON */ }
      return { st: x.status, ct, ms, json: j, txt: txt.slice(0, 900) };
    } catch (e) { return { st: 0, ms: Math.round(performance.now() - t0), err: String((e && e.message) || e) }; }
  }, { IA, PASS, chemin, corps });

  /* L'image d'ENTRÉE : une scène dessinée (animal brun qui court + cavalier schématique), 640×800. Aucune personne réelle. */
  const entree = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 640; c.height = 800; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 800); g.addColorStop(0, '#9fc5e8'); g.addColorStop(0.55, '#e8d9b5'); g.addColorStop(1, '#8a7a5a'); x.fillStyle = g; x.fillRect(0, 0, 640, 800);
    x.fillStyle = '#d8c7a0'; x.fillRect(0, 520, 640, 280);
    x.fillStyle = '#5b3a1e'; x.beginPath(); x.ellipse(320, 560, 190, 95, 0, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.ellipse(150, 540, 70, 55, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#3a2412'; [[220, 640], [300, 650], [380, 650], [460, 640]].forEach((p) => { x.fillRect(p[0], p[1], 26, 90); });
    x.fillStyle = '#f1dcc1'; x.beginPath(); x.arc(330, 380, 42, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#eeeeee'; x.beginPath(); x.ellipse(330, 358, 48, 30, 0, Math.PI, Math.PI * 2); x.fill();
    x.fillStyle = '#e6dfc8'; x.fillRect(285, 420, 90, 110);
    x.fillStyle = '#2b2b2b'; x.fillRect(285, 525, 40, 70); x.fillRect(335, 525, 40, 70);
    x.strokeStyle = '#111'; x.lineWidth = 6; x.beginPath(); x.moveTo(300, 440); x.lineTo(200, 520); x.stroke();
    /* la « petite » (≤ 480 px) accompagne la grande : FLUX.2 klein (Workers AI) exige < 512×512 */
    const p = document.createElement('canvas'); p.width = 384; p.height = 480; p.getContext('2d').drawImage(c, 0, 0, 384, 480);
    return { grande: c.toDataURL('image/jpeg', 0.9), petite: p.toDataURL('image/jpeg', 0.88) };
  });
  derniereEntree = entree.grande.split(',')[1] || '';
  try { writeFileSync(join(CAPTURES, 'entree.jpg'), Buffer.from(derniereEntree, 'base64')); } catch (_) { /* pas de dossier */ }

  const C = await appel('/cartoon', { image: entree.grande, image_petite: entree.petite, style: 'toon3d' });
  const imgOk = (r) => r && r.st === 200 && /image/.test(r.ct || '') && r.octets > 20000 && r.dim && r.dim[0] >= 256 && r.dim[1] >= 256;
  ok(imgOk(C), `C) /cartoon style=toon3d → une VRAIE image rendue (HTTP ${C.st}, ${C.octets || 0} octets, ${C.dim ? C.dim.join('×') : '?'}, ${C.ms} ms, moteur « ${C.provider || '?'} »)`, C.err || (C.json && (C.json.detail || C.json.error || C.json.message)) || C.txt || '');
  ok(!!C.b64 && C.b64 !== derniereEntree, 'C) l\'image rendue est DIFFÉRENTE de l\'entrée (pas une copie)');
  if (C.b64) { try { writeFileSync(join(CAPTURES, 'cartoon-toon3d.' + (/png/.test(C.ct) ? 'png' : 'jpg')), Buffer.from(C.b64, 'base64')); } catch (_) { /* pas de dossier */ } }

  const D = await appel('/cartoon', { image: entree.grande, image_petite: entree.petite, style: 'anime' });
  ok(imgOk(D), `D) /cartoon style=anime → une VRAIE image rendue (HTTP ${D.st}, ${D.octets || 0} octets, ${D.ms} ms, moteur « ${D.provider || '?'} »)`, D.err || (D.json && (D.json.detail || D.json.error || D.json.message)) || D.txt || '');
  ok(!!D.b64 && !!C.b64 && D.b64 !== C.b64, 'D) deux styles = deux rendus différents');
  if (D.b64) { try { writeFileSync(join(CAPTURES, 'cartoon-anime.' + (/png/.test(D.ct) ? 'png' : 'jpg')), Buffer.from(D.b64, 'base64')); } catch (_) { /* pas de dossier */ } }

  const E = await appel('/frames', { image: entree.grande, image_petite: entree.petite, mode: 'motion', n: 3 });
  const nF = (E.json && Array.isArray(E.json.frames)) ? E.json.frames.length : 0;
  ok(E.st === 200 && nF >= 2 && E.json.mode === 'motion', `E) /frames mode=motion n=3 → ${nF} instant(s) (HTTP ${E.st}, ${E.ms} ms, moteur « ${(E.json && E.json.provider) || '?'} »)`, E.err || (E.json && (E.json.detail || E.json.error || E.json.message)) || E.txt || '');
  if (nF) { E.json.frames.forEach((f, i) => { const m = /^data:image\/(\w+);base64,(.+)$/.exec(f); if (m) { try { writeFileSync(join(CAPTURES, `instant-${i + 1}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`), Buffer.from(m[2], 'base64')); } catch (_) { /* pas de dossier */ } } }); }

  /* F */
  ok(fautes.length === 0, `aucune erreur JavaScript (${fautes.length})`, fautes[0]);
  dire(`ℹ️ rendus écrits dans ${CAPTURES} (entrée + cartoon-toon3d + cartoon-anime + instants) : à REGARDER, un nombre ne dit pas si c'est beau`);

  await browser.close();
  fin(echecs ? 1 : 0);
} catch (e) {
  dire('❌ robot interrompu : ' + String((e && e.message) || e).slice(0, 300));
  try { await browser.close(); } catch (_) { /* déjà fermé */ }
  fin(1);
}
