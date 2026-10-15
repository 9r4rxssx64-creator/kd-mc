// Lot C2 (audit A4 P1-4, 15.10.2026) — la bulle de version ne recouvre JAMAIS un élément touchable.
// Vrai Chromium (sans écran) en 375×667 et 390×844, mode Safari ET app installée (display-mode: standalone),
// sur l'écran de connexion, la liste des chats et une conversation ouverte (session locale simulée).
// Pour chaque écran : rectangle de la bulle visible (#kdmc-version-badge) comparé à TOUS les éléments
// touchables visibles (button, a, input, textarea, select, label, [onclick], [role=button]) ; et le point
// central de la bulle doit bien toucher la bulle. La version de la barre du haut fait ≥ 44 px de haut.
// Avant le correctif (mesure de l'audit) : bulle y=580-603 sur le champ message (Safari 375) et sur l'onglet
// « Chats » en app installée 390 → ce script échoue (sabotage vérifié).
// Usage : python3 -m http.server 4173 dans un dossier où CMCteams/ pointe vers la racine du dépôt, puis
//   APEX_URL=http://127.0.0.1:4173/CMCteams/messaging-app/ node tests/layout-c2-badge-clavier.mjs
import { chromium } from 'playwright';

const URL = process.env.APEX_URL || 'http://127.0.0.1:4173/CMCteams/messaging-app/';
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium' });
let fail = 0, pass = 0;
const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };

async function run({ w, h, standalone, screen }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR' });
  await ctx.addInitScript(({ standalone, screen }) => {
    if (standalone) {
      const mm = window.matchMedia.bind(window);
      window.matchMedia = (q) => (/display-mode:\s*standalone/.test(q) ? { matches: true, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} } : mm(q));
      Object.defineProperty(navigator, 'standalone', { get: () => true });
    }
    if (screen === 'login' || sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const P = 'apex_chat_';
    localStorage.setItem(P + 'user', JSON.stringify({ id: 'u_me', pseudo: 'Kevin', first_name: 'Kevin', phone: '+33600000001' }));
    localStorage.setItem(P + 'token', JSON.stringify('local-test'));
    localStorage.setItem('apex_chat_cgu_v1', JSON.stringify({ cgu: '2026-09-17' }));
    localStorage.setItem('apex_chat_perms_v1', '1');
    const now = Date.now();
    localStorage.setItem(P + 'conversations', JSON.stringify([
      { id: 'c1', name: 'Maman', type: 'dm', peer_id: 'u_mom', members: ['u_me', 'u_mom'], last_preview: 'Tu viens ?', last_msg_ts: now - 60000 },
      { id: 'c2', name: 'Famille', type: 'group', members: ['u_me', 'u_mom', 'u_bro'], last_preview: 'Photo', last_msg_ts: now - 3600000 },
    ]));
    const msgs = []; for (let i = 0; i < 30; i++) msgs.push({ id: 'm' + i, from: i % 2 ? 'u_mom' : 'u_me', text: 'Message ' + i, ts: now - (30 - i) * 60000 });
    localStorage.setItem(P + 'messages_c1', JSON.stringify(msgs));
  }, { standalone, screen });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  if (screen === 'chat') { await page.evaluate(() => K.openConv('c1')); await page.waitForTimeout(800); }
  await page.evaluate(() => { const m = document.getElementById('modal-host'); if (m) m.innerHTML = ''; const t = document.getElementById('toasts'); if (t) t.innerHTML = ''; });
  await page.waitForTimeout(1700);   // le module re-vérifie la bulle toutes les 1,5 s
  const r = await page.evaluate(() => {
    const vis = (e) => { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return null;
      const b = e.getBoundingClientRect(); if (b.width < 1 || b.height < 1 || b.bottom <= 0 || b.top >= innerHeight || b.right <= 0 || b.left >= innerWidth) return null; return b; };
    const badge = document.getElementById('kdmc-version-badge');
    const bb = badge && vis(badge);
    const inter = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const hits = [];
    if (bb) {
      for (const e of document.querySelectorAll('button, a, input, textarea, select, label, [onclick], [role=button]')) {
        if (e === badge || e.contains(badge)) continue;
        // un élément recouvert par un écran plein (ex. l'app derrière l'écran de connexion) n'est pas touchable
        const b = vis(e); if (!b) continue;
        const cx = Math.min(Math.max((b.left + b.right) / 2, 0), innerWidth - 1), cy = Math.min(Math.max((b.top + b.bottom) / 2, 0), innerHeight - 1);
        const top = document.elementFromPoint(cx, cy);
        if (top && !(top === e || e.contains(top) || top === badge)) continue;
        if (inter(bb, b) > 0) hits.push((e.id || e.className || e.tagName) + ' ' + JSON.stringify([b.left, b.top, b.right, b.bottom].map(Math.round)));
      }
    }
    const center = bb ? document.elementFromPoint((bb.left + bb.right) / 2, (bb.top + bb.bottom) / 2) : null;
    const tv = document.getElementById('topbar-version');
    const tvb = tv && vis(tv);
    return { badge: bb && [bb.left, bb.top, bb.right, bb.bottom].map(Math.round), hits, centerIsBadge: !bb || center === badge || badge.contains(center),
      topbarVer: tvb && { h: Math.round(tvb.height), w: Math.round(tvb.width), fs: parseFloat(getComputedStyle(tv).fontSize) },
      badgeFs: bb && parseFloat(getComputedStyle(badge).fontSize), badgeH: bb && Math.round(bb.height) };
  });
  await ctx.close();
  return r;
}

for (const [w, h] of [[375, 667], [390, 844]]) {
  for (const standalone of [false, true]) {
    for (const screen of ['login', 'chats', 'chat']) {
      const tag = `${w}×${h} ${standalone ? 'app installée' : 'Safari'} ${screen}`;
      const r = await run({ w, h, standalone, screen });
      ok(r.hits.length === 0, `${tag} : la bulle ne recouvre aucun élément touchable (bulle ${JSON.stringify(r.badge)})`, r.hits.join(' | '));
      ok(r.centerIsBadge, `${tag} : rien ne recouvre la bulle elle-même`);
      if (screen === 'login') ok(!!r.badge && r.badgeH >= 44 && r.badgeFs >= 14, `${tag} : bulle visible avant connexion, ≥ 44 px, texte ≥ 14 px`, JSON.stringify(r));
      else ok(!r.badge && r.topbarVer && r.topbarVer.h >= 44 && r.topbarVer.fs >= 14, `${tag} : une seule version, dans la barre du haut, touchable (≥ 44 px, ≥ 14 px)`, JSON.stringify(r));
    }
  }
}
// A6-10 dans le VRAI moteur : une petite photo JPEG avec un bloc Exif (GPS) passe par K._stripMediaMeta →
// le canvas la ré-encode : plus aucune trace d'Exif/GPS, et l'image reste lisible.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 48;
    const g = c.getContext('2d'); g.fillStyle = '#c33'; g.fillRect(0, 0, 64, 48);
    const bin = atob(c.toDataURL('image/jpeg', 0.9).split(',')[1]);   // (pas de fetch(data:) : la CSP l'interdit)
    const clean = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    const exif = new TextEncoder().encode('Exif\0\0MM\0*GPSLatitude=48.8584;GPSLongitude=2.2945;Model=iPhone');
    const app1 = new Uint8Array([0xFF, 0xE1, (exif.length + 2) >> 8, (exif.length + 2) & 255, ...exif]);
    const withExif = new Uint8Array([...clean.subarray(0, 2), ...app1, ...clean.subarray(2)]);
    const latin = (u8) => Array.from(u8, (x) => String.fromCharCode(x)).join('');
    const before = latin(withExif).includes('GPSLatitude');
    const res = await K._stripMediaMeta(new File([withExif], 'IMG_0001.jpg', { type: 'image/jpeg' }));
    const out = new Uint8Array(await res.body.arrayBuffer());
    let decodable = false; try { const bm = await createImageBitmap(new Blob([out], { type: 'image/jpeg' })); decodable = bm.width === 64 && bm.height === 48; } catch (_) {}
    return { before, cleaned: res.cleaned, ctype: res.ctype, after: latin(out).includes('GPSLatitude') || latin(out).includes('Exif'), decodable };
  });
  ok(r.before && r.cleaned && !r.after && r.decodable && r.ctype === 'image/jpeg', 'A6-10 (Chromium) : petite photo avec GPS → ré-encodée, plus d\'Exif/GPS, image lisible', JSON.stringify(r));
  await ctx.close();
}

await browser.close();
console.log(`\n${pass} OK · ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
