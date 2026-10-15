// Lot D (finitions de l'ultra-audit, 15.10.2026) — mise en page dans un VRAI Chromium (sans écran), 375×667 et 390×844.
//  Item 2 (A4 P2-9) : conversation plein écran (pas de barre du bas, pas d'espace perdu sous la saisie) ; clavier
//    simulé en réduisant la fenêtre visible (visualViewport) → la zone de saisie reste collée au-dessus du clavier,
//    entièrement visible, et le dernier message reste visible juste au-dessus d'elle.
//  Item 1 : position refusée → bandeau visible, bouton « Comment faire » ≥ 44 px, texte ≥ 14 px, ne recouvre rien,
//    et l'app reste utilisable (on ouvre une conversation).
//  Item 3 (A4 P2-8) : iPhone dans Safari → guide d'installation AVANT le numéro / SMS ; « Continuer dans Safari »
//    (≥ 44 px) affiche le numéro ; app installée → numéro directement.
// Avant le correctif (sabotage = index.html de v1.1.305 servi à la place) ce script échoue.
// Usage : python3 -m http.server 4173 dans un dossier où CMCteams/ pointe vers la racine du dépôt, puis
//   APEX_URL=http://127.0.0.1:4173/CMCteams/messaging-app/ node tests/layout-d-clavier-install.mjs
import { chromium } from 'playwright';

const URL = process.env.APEX_URL || 'http://127.0.0.1:4173/CMCteams/messaging-app/';
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium' });
let fail = 0, pass = 0;
const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

function seedScript({ standalone, login }) {
  // Fenêtre visible simulée : même interface que window.visualViewport (hauteur, décalage, événement resize).
  const vv = new EventTarget();
  vv._h = null;
  Object.defineProperty(vv, 'height', { get() { return this._h == null ? window.innerHeight : this._h; } });
  Object.defineProperty(vv, 'width', { get() { return window.innerWidth; } });
  vv.offsetTop = 0; vv.offsetLeft = 0; vv.pageTop = 0; vv.scale = 1;
  Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
  window.__kb = (h) => { vv._h = h; vv.dispatchEvent(new Event('resize')); };
  if (standalone) {
    const mm = window.matchMedia.bind(window);
    window.matchMedia = (q) => (/display-mode:\s*standalone/.test(q) ? { matches: true, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} } : mm(q));
    Object.defineProperty(navigator, 'standalone', { get: () => true });
  }
  if (login || sessionStorage.getItem('seeded')) return;
  sessionStorage.setItem('seeded', '1');
  const P = 'apex_chat_';
  localStorage.setItem(P + 'user', JSON.stringify({ id: 'u_me', pseudo: 'Kevin', first_name: 'Kevin', phone: '+33600000001' }));
  localStorage.setItem(P + 'token', JSON.stringify('local-test'));
  localStorage.setItem('apex_chat_cgu_v1', JSON.stringify({ cgu: '2026-09-17' }));
  localStorage.setItem('apex_chat_perms_v1', '1');
  const now = Date.now();
  localStorage.setItem(P + 'conversations', JSON.stringify([
    { id: 'c1', name: 'Maman', type: 'dm', peer_id: 'u_mom', members: ['u_me', 'u_mom'], last_preview: 'Tu viens ?', last_msg_ts: now - 60000 },
  ]));
  const msgs = []; for (let i = 0; i < 40; i++) msgs.push({ id: 'm' + i, from: i % 2 ? 'u_mom' : 'u_me', text: 'Message numéro ' + i, ts: now - (40 - i) * 60000 });
  localStorage.setItem(P + 'messages_c1', JSON.stringify(msgs));
}

async function open({ w, h, ua, standalone = false, login = false }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', ...(ua ? { userAgent: ua } : {}) });
  await ctx.addInitScript(seedScript, { standalone, login });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { const m = document.getElementById('modal-host'); if (m) m.innerHTML = ''; const t = document.getElementById('toasts'); if (t) t.innerHTML = ''; });
  return { ctx, page };
}

const measure = (page) => page.evaluate(() => {
  const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return null;
    const b = e.getBoundingClientRect(); return b.height < 1 ? null : { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) }; };
  const msgs = [...document.querySelectorAll('#chat-msgs .msg[data-msg-id]')];
  const last = msgs.length ? msgs[msgs.length - 1].getBoundingClientRect() : null;
  return { vvh: window.visualViewport.height, input: r('.chat-input'), header: r('.chat-header'), chips: r('#smart-reply-chips'), ta: r('#msg-input') || r('.chat-input textarea'), box: r('#chat-msgs'), bnav: r('#bnav'), topbar: r('#topbar'),
    last: last && { top: Math.round(last.top), bottom: Math.round(last.bottom) }, scrollY: window.scrollY,
    // espace de la conversation NON utilisé : hauteur de #app moins la somme de ses blocs (en-tête, bandeau, messages, saisie…)
    unused: (() => { const app = document.getElementById('app'); let sum = 0; for (const c of app.children) sum += c.getBoundingClientRect().height; return Math.round(app.getBoundingClientRect().height - sum); })(),
    appBottom: Math.round(document.getElementById('app').getBoundingClientRect().bottom) };
});

for (const [w, h] of [[375, 667], [390, 844]]) {
  // ── Item 2 : conversation plein écran + clavier
  {
    const { ctx, page } = await open({ w, h });
    await page.evaluate(() => K.openConv('c1'));
    await page.waitForTimeout(1200);
    const a = await measure(page);
    ok(!a.bnav, `${w}×${h} conversation : pas de barre du bas (le ← de l'en-tête ramène à la liste)`, JSON.stringify(a));
    ok(a.input && a.input.bottom >= h - 2 && a.input.bottom <= h + 1, `${w}×${h} conversation : la saisie touche le bas de l'écran (pas d'espace perdu)`, JSON.stringify(a.input));
    ok(a.input && a.input.h <= 160, `${w}×${h} conversation : zone de saisie compacte (≤ 160 px, avant 169 px + barre du bas 65 px)`, JSON.stringify(a.input));
    ok(a.box && Math.abs(a.unused) <= 2 && a.appBottom === h, `${w}×${h} conversation : la zone des messages prend tout le reste (aucun espace perdu ; messages ${a.box && a.box.h} px)`, JSON.stringify(a));
    ok(a.last && a.last.bottom <= a.input.top + 1 && a.last.top >= a.box.top - 1, `${w}×${h} conversation : le dernier message est visible au-dessus de la saisie`, JSON.stringify(a));
    const kbH = Math.round(h * 0.42);                  // clavier iPhone ≈ 40 % de l'écran
    const vis = h - kbH;
    await page.focus('#msg-input').catch(() => {});
    await page.evaluate((v) => window.__kb(v), vis);
    await page.waitForTimeout(400);
    const b = await measure(page);
    ok(b.input && b.input.bottom <= vis + 1 && b.input.bottom >= vis - 12, `${w}×${h} clavier ouvert (visible ${vis} px) : la saisie est collée au-dessus du clavier`, JSON.stringify(b.input));
    ok(b.ta && b.ta.top >= 0 && b.ta.bottom <= vis, `${w}×${h} clavier ouvert : le champ du message est entièrement visible`, JSON.stringify(b.ta));
    ok(b.last && b.last.bottom <= b.input.top + 1 && b.last.bottom >= b.input.top - 60 && b.last.top >= 0, `${w}×${h} clavier ouvert : le dernier message reste visible juste au-dessus de la saisie`, JSON.stringify(b));
    ok(!b.topbar, `${w}×${h} clavier ouvert : la barre du haut se replie (place aux messages)`, JSON.stringify(b.topbar));
    ok(!b.chips && b.box && b.box.h >= vis * 0.45, `${w}×${h} clavier ouvert : réponses suggérées repliées, zone des messages ≥ 45 % du visible`, JSON.stringify(b));
    await page.evaluate((v) => window.__kb(v), h);
    await page.waitForTimeout(300);
    const c = await measure(page);
    ok(c.input && c.input.bottom >= h - 2 && c.topbar, `${w}×${h} clavier fermé : tout revient (saisie en bas, barre du haut)`, JSON.stringify(c));
    // Lecture plus haut : le clavier ne fait pas sauter la lecture en bas.
    await page.evaluate(() => { const bx = document.getElementById('chat-msgs'); bx.scrollTop = 0; bx.dispatchEvent(new Event('scroll')); });
    await page.waitForTimeout(100);
    await page.evaluate((v) => window.__kb(v), vis);
    await page.waitForTimeout(300);
    const rd = await page.evaluate(() => { const bx = document.getElementById('chat-msgs'); return { top: bx.scrollTop, max: bx.scrollHeight - bx.clientHeight }; });
    ok(rd.max - rd.top > 300, `${w}×${h} clavier ouvert pendant une lecture plus haut : on ne saute pas tout en bas`, JSON.stringify(rd));
    await ctx.close();
  }
  // ── Item 1 : bandeau position coupée
  {
    const { ctx, page } = await open({ w, h });
    await page.evaluate(() => K._onGeoState('denied'));
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const b = document.getElementById('geo-banner'); if (!b) return null;
      const bb = b.getBoundingClientRect(); const btn = b.querySelector('button'); const bt = btn.getBoundingClientRect();
      const inter = (a, c) => Math.max(0, Math.min(a.right, c.right) - Math.max(a.left, c.left)) * Math.max(0, Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top));
      const hits = [];
      for (const e of document.querySelectorAll('button, a, input, textarea, [onclick], [role=button]')) {
        if (b.contains(e)) continue; const r2 = e.getBoundingClientRect(); const cs = getComputedStyle(e);
        if (r2.width < 1 || r2.height < 1 || cs.display === 'none' || cs.visibility === 'hidden') continue;
        if (inter(bb, r2) > 0) hits.push(e.id || e.className || e.tagName);
      }
      const center = document.elementFromPoint((bt.left + bt.right) / 2, (bt.top + bt.bottom) / 2);
      return { h: bb.height, top: bb.top, btnH: bt.height, btnW: bt.width, fs: parseFloat(getComputedStyle(b).fontSize), btnFs: parseFloat(getComputedStyle(btn).fontSize),
        hits, btnTouchable: center === btn || btn.contains(center), within: bb.right <= innerWidth + 0.5 && bb.left >= -0.5 };
    });
    ok(!!r && r.btnH >= 44 && r.btnW >= 44 && r.fs >= 14 && r.btnFs >= 14, `${w}×${h} position coupée : bandeau visible, « Comment faire » ≥ 44 px, texte ≥ 14 px`, JSON.stringify(r));
    ok(!!r && r.hits.length === 0 && r.btnTouchable && r.within, `${w}×${h} position coupée : le bandeau ne recouvre rien et tient dans l'écran`, JSON.stringify(r));
    await page.click('#geo-banner button');
    await page.waitForTimeout(300);
    const help = await page.evaluate(() => document.getElementById('modal-host').textContent);
    ok(/Réglages/.test(help) && /Safari/.test(help) && /Position/.test(help), `${w}×${h} « Comment faire » : Réglages → Safari → Position`, help.slice(0, 120));
    await page.evaluate(() => K._closeModal());
    await page.evaluate(() => K.openConv('c1'));
    await page.waitForTimeout(800);
    const still = await page.evaluate(() => ({ view: K.view, banner: !!document.getElementById('geo-banner'), input: !!document.getElementById('msg-input') }));
    ok(still.view === 'chat' && still.banner && still.input, `${w}×${h} position coupée : l'app n'est pas bloquée (conversation ouverte, bandeau toujours là)`, JSON.stringify(still));
    await ctx.close();
  }
  // ── Item 3 : guide d'installation avant le SMS (iPhone, Safari)
  {
    const { ctx, page } = await open({ w, h, ua: IPHONE_UA, login: true });
    const r = await page.evaluate(() => {
      const g = document.getElementById('install-first'); const skip = document.getElementById('btn-install-skip');
      const vis = (e) => !!e && e.getBoundingClientRect().height > 0;
      let minFs = 99; if (g) for (const e of g.querySelectorAll('p, li span, button')) { if (e.textContent.trim()) minFs = Math.min(minFs, parseFloat(getComputedStyle(e).fontSize)); }
      return { guide: vis(g), phone: vis(document.getElementById('auth-phone')), sms: vis(document.getElementById('btn-auth-phone')),
        skipH: skip && skip.getBoundingClientRect().height, skipBottom: skip && skip.getBoundingClientRect().bottom, minFs };
    });
    ok(r.guide && !r.phone && !r.sms, `${w}×${h} iPhone Safari : le guide « écran d'accueil » vient AVANT le numéro et le SMS`, JSON.stringify(r));
    ok(r.skipH >= 44 && r.minFs >= 14, `${w}×${h} iPhone Safari : « Continuer dans Safari » ≥ 44 px, textes ≥ 14 px`, JSON.stringify(r));
    await page.click('#btn-install-skip');
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => ({ phone: !!document.getElementById('auth-phone'), guide: !!document.getElementById('install-first') }));
    ok(after.phone && !after.guide, `${w}×${h} iPhone Safari : après « Continuer », le numéro s'affiche`, JSON.stringify(after));
    await ctx.close();
    const s = await open({ w, h, ua: IPHONE_UA, login: true, standalone: true });
    const st = await s.page.evaluate(() => ({ phone: !!document.getElementById('auth-phone'), guide: !!document.getElementById('install-first') }));
    ok(st.phone && !st.guide, `${w}×${h} app installée : le numéro directement (pas de guide)`, JSON.stringify(st));
    await s.ctx.close();
  }
}

await browser.close();
console.log(`\n${pass} OK · ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
