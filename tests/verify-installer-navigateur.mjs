/* PREUVE EN VRAI NAVIGATEUR (Kevin 22.10.2026 : « un bouton pour installer l'application sur l'écran d'accueil… notifications acceptées, application fermée »).
 * Le VRAI script servi à toutes les apps (INSTALLER_JS) tourne dans un vrai Chromium, avec un faux domaine : Android (bouton d'installation du navigateur), iPhone Safari (guide 3 gestes),
 * iPhone hors Safari (« ouvre dans Safari »), app installée (notifications : permission → abonnement → enregistré au domaine), page qui a déjà son manifeste (aucun doublon), cadre (rien).
 * SABOTAGE intégré : sans l'appel prompt() / sans le manifeste ajouté, la preuve rougit.   node tests/verify-installer-navigateur.mjs */
import { chromium } from 'playwright'; import http from 'node:http';
import { INSTALLER_JS } from '../services/kdmc-router/installer-client.js';
let fails = 0; const rec = (c, m, d) => { if (!c) fails++; console.log((c ? 'OK   ' : 'FAIL ') + m + (!c && d ? ' → ' + d : '')); };
const appels = [];
function serveur(js) {
  return http.createServer(async (q, r) => {
    let corps = ''; for await (const c of q) corps += c;
    appels.push(q.method + ' ' + q.url + (corps ? ' ' + corps : ''));
    const json = (o) => { r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify(o)); };
    if (q.url === '/__installer/installer.js') { r.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' }); return r.end(js); }
    if (q.url === '/__push/cle') return json({ ok: true, cle: 'BPcle_publique_test-AAAA' });
    if (q.url === '/__push/abonner') return json({ ok: true, actif: true });
    if (q.url === '/__push/test') return json({ ok: true, envoyes: 1 });
    if (q.url.startsWith('/__push/installee')) return json(q.method === 'POST' ? { ok: true, installee: true } : { ok: true, installee: !!(q.headers.cookie && /installee=1/.test(q.headers.cookie)) });
    if (q.url === '/apex') { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return r.end('<html><body><div id="install-hint">📱 Mets Apex Chat sur ton écran d\'accueil</div><p>x</p><script src="/__installer/installer.js"></script></body></html>'); }
    if (q.url === '/avec-manifeste') { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return r.end('<html><head><link rel="manifest" href="/mon.json"><link rel="apple-touch-icon" href="/i.png"></head><body><p>x</p><script src="/__installer/installer.js"></script></body></html>'); }
    if (q.url === '/entete') { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return r.end('<html><body style="margin:0"><button id="deco" style="position:fixed;top:5px;right:5px;width:44px;height:44px;z-index:99">✕</button><p>x</p><script src="/__installer/installer.js"></script></body></html>'); }
    if (q.url === '/__sso/whoami') return json(q.headers.cookie && /anonyme/.test(q.headers.cookie) ? { ok: false } : { ok: true, uid: 'nouvelle-personne' });
    if (q.url === '/abeille') { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return r.end('<html><body style="margin:0"><iframe srcdoc="x" style="position:fixed;right:0;top:0;width:140px;height:110px;z-index:2147483000;border:0"></iframe><iframe srcdoc="y" style="position:fixed;right:0;bottom:0;width:140px;height:130px;z-index:2147483000;border:0"></iframe><p>x</p><script src="/__installer/installer.js"></script></body></html>'); }
    if (q.url === '/cadre') { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return r.end('<html><body><iframe src="/"></iframe></body></html>'); }
    r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end('<html><head><title>App</title></head><body><p>Bonjour</p><script src="/__installer/installer.js"></script></body></html>');
  });
}
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const UA_IOS_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const UA_IOS_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1';
async function essai(js, f) {
  const srv = serveur(js); await new Promise((r) => srv.listen(0, r)); const port = srv.address().port; const nav = await chromium.launch();
  try { await f(nav, 'http://127.0.0.1:' + port); } finally { await nav.close(); srv.close(); }
}
const texte = (p) => p.evaluate(() => (document.querySelector('[data-kdmc-installer="feuille"]') || { innerText: '' }).innerText);
async function suite(js, etiquette) {
  /* A — Android : le vrai bouton du navigateur */
  await essai(js, async (nav, base) => {
    const ctx = await nav.newContext({ userAgent: UA_ANDROID, viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true }); const p = await ctx.newPage();
    await p.addInitScript(() => { window.__prompts = 0; });
    await p.goto(base + '/'); await p.waitForTimeout(400);
    const prep = await p.evaluate(() => ({ man: (document.querySelector('link[rel="manifest"]') || {}).getAttribute && document.querySelector('link[rel="manifest"]').getAttribute('href'), apple: !!document.querySelector('link[rel="apple-touch-icon"]'), pastille: !!document.querySelector('[data-kdmc-installer="pastille"]') }));
    rec(prep.man === '/__installer/manifest.webmanifest' && prep.apple, etiquette + ' A1. une page sans manifeste ni icône reçoit les deux (installable)', JSON.stringify(prep));
    rec(prep.pastille, etiquette + ' A2. la pastille 📲 est là');
    await p.evaluate(() => { const e = new Event('beforeinstallprompt'); e.prompt = () => { window.__prompts++; return Promise.resolve(); }; e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e); });
    await p.click('[data-kdmc-installer="pastille"]'); await p.waitForTimeout(150);
    rec(/Un toucher, tu acceptes/.test(await texte(p)), etiquette + ' A3. la feuille promet « un toucher, tu acceptes »');
    await p.click('button:has-text("Installer sur")'); await p.waitForTimeout(250);
    rec((await p.evaluate(() => window.__prompts)) === 1, etiquette + " A4. le toucher déclenche la VRAIE fenêtre d'installation du navigateur (prompt appelé 1 fois)");
    rec(/Installée/.test(await texte(p)), etiquette + ' A5. après acceptation : « ✅ Installée »');
    await ctx.close();
  });
  /* A' — la pastille ne couvre JAMAIS un bouton de la page (Lenovo 22.10 : « ✕ Déconnexion » de CMCteams) */
  await essai(js, async (nav, base) => {
    const ctx = await nav.newContext({ userAgent: UA_ANDROID, viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true }); const p = await ctx.newPage();
    await p.goto(base + '/entete'); await p.waitForTimeout(600);
    const r = await p.evaluate(() => { const a = document.querySelector('[data-kdmc-installer="pastille"]').getBoundingClientRect(), b = document.getElementById('deco').getBoundingClientRect(); return { chev: !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom), vue: a.width >= 44 && a.height >= 44 && a.left >= 0 && a.top >= 0 && a.right <= innerWidth && a.bottom <= innerHeight }; });
    rec(!r.chev && r.vue, etiquette + " A'. la pastille ne couvre pas le bouton « ✕ » de l'en-tête et reste à l'écran", JSON.stringify(r));
    await ctx.close();
  });
  /* A'' — à l'inscription : une personne connectée voit « Installer » d'elle-même, UNE seule fois par appareil */
  await essai(js, async (nav, base) => {
    const ctx = await nav.newContext({ userAgent: UA_ANDROID, viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true }); const p = await ctx.newPage();
    await p.goto(base + '/'); await p.waitForTimeout(5200);
    rec((await texte(p)).length > 20, etiquette + " A''1. connectée et pas installée : la feuille s'ouvre toute seule");
    await p.goto(base + '/'); await p.waitForTimeout(5200);
    rec((await texte(p)) === '', etiquette + " A''2. à la visite suivante : plus d'ouverture automatique (une seule fois)");
    await ctx.close();
    const ctx2 = await nav.newContext({ userAgent: UA_ANDROID, viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true }); const p2 = await ctx2.newPage();
    await ctx2.addCookies([{ name: 'anonyme', value: '1', url: base }]);
    await p2.goto(base + '/'); await p2.waitForTimeout(5200);
    rec((await texte(p2)) === '', etiquette + " A''3. visiteur non connecté : rien ne s'ouvre");
    await ctx2.close();
  });
  /* A''' — la pastille n'est jamais cachée DERRIÈRE un cadre (la mascotte d'Apex Chat, pont 396) */
  await essai(js, async (nav, base) => {
    const ctx = await nav.newContext({ userAgent: UA_ANDROID, viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true }); const p = await ctx.newPage();
    await p.goto(base + '/abeille'); await p.waitForTimeout(1900);
    const haut = await p.evaluate(() => { const b = document.querySelector('[data-kdmc-installer="pastille"]').getBoundingClientRect(); const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!(e && e.getAttribute('data-kdmc-installer') === 'pastille'); });
    rec(haut, etiquette + " A'''. la pastille reste cliquable (rien ne la recouvre, ni cadre ni mascotte)");
    await ctx.close();
  });
  /* B — iPhone Safari : le guide */
  await essai(js, async (nav, base) => {
    const ctx = await nav.newContext({ userAgent: UA_IOS_SAFARI, viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true }); const p = await ctx.newPage();
    await p.goto(base + '/'); await p.waitForTimeout(300); await p.click('[data-kdmc-installer="pastille"]'); await p.waitForTimeout(100);
    rec(/d'abord installer l'application/.test(await texte(p)), etiquette + " B1. iPhone Safari : les notifications disent « d'abord installer »");
    await p.click('button:has-text("Installer sur")'); await p.waitForTimeout(150); const t = await texte(p);
    rec(/3 gestes/.test(t) && /Partager/.test(t) && /Sur l'écran d'accueil/.test(t) && /Ajouter/.test(t), etiquette + ' B2. iPhone Safari : guide « Partager → Sur l\'écran d\'accueil → Ajouter »', t.slice(0, 160));
    await ctx.close();
  });
  /* C — iPhone mais pas Safari */
  await essai(js, async (nav, base) => {
    const ctx = await nav.newContext({ userAgent: UA_IOS_CHROME, viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true }); const p = await ctx.newPage();
    await p.goto(base + '/'); await p.waitForTimeout(300); await p.click('[data-kdmc-installer="pastille"]'); await p.click('button:has-text("Installer sur")'); await p.waitForTimeout(150);
    rec(/Ouvre cette page dans Safari/.test(await texte(p)), etiquette + ' C1. iPhone hors Safari : « Ouvre cette page dans Safari »');
    await ctx.close();
  });
  /* D — app installée : permission → abonnement → enregistrement */
  await essai(js, async (nav, base) => {
    const ctx = await nav.newContext({ userAgent: UA_IOS_SAFARI, viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true }); const p = await ctx.newPage();
    await p.addInitScript(() => {
      Object.defineProperty(navigator, 'standalone', { value: true });
      window.PushManager = window.PushManager || function () {};
      let perm = 'default';
      Object.defineProperty(Notification, 'permission', { get: () => perm });
      Notification.requestPermission = () => { perm = 'granted'; return Promise.resolve('granted'); };
      const sub = { endpoint: 'https://web.push.apple.com/QWERTY', toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'BPtest', auth: 'AUtest' } }; } };
      const reg = { pushManager: { getSubscription: () => Promise.resolve(window.__sub || null), subscribe: (o) => { window.__opts = o; window.__sub = sub; return Promise.resolve(sub); } } };
      Object.defineProperty(navigator, 'serviceWorker', { value: { getRegistration: () => Promise.resolve(reg), register: () => Promise.resolve(reg), ready: Promise.resolve(reg) } });
    });
    appels.length = 0; await p.goto(base + '/'); await p.waitForTimeout(1800);   // app installée : la feuille s'ouvre toute seule (notifications)
    let t = await texte(p);
    rec(/Un toucher, tu acceptes/.test(t) && !/Installer l'application/.test(t) && /Notifications/.test(t), etiquette + " D1. app installée : la feuille propose les notifications toute seule, SANS ligne « Installer l'application »", t.slice(0, 120));
    const sig = appels.find((a) => a.startsWith('POST /__push/installee'));
    rec(!!sig && /"appareil":"iphone-17-390x/.test(sig), etiquette + " D1b. l'app installée se signale au domaine (compte + appareil)", sig);
    await p.click('button:has-text("Activer les notifications")'); await p.waitForTimeout(500);
    const ab = appels.find((a) => a.startsWith('POST /__push/abonner'));
    rec(!!ab && /QWERTY/.test(ab) && /"app":"127.0.0.1"/.test(ab) && /"installee":true/.test(ab), etiquette + ' D2. le toucher → permission → abonnement envoyé au domaine (appareil, app, installée)', ab);
    rec((await p.evaluate(() => window.__opts && window.__opts.userVisibleOnly)) === true && (await p.evaluate(() => window.__opts.applicationServerKey.length)) > 10, etiquette + ' D3. abonnement « visible » avec la clé publique du service');
    t = await texte(p);
    rec(/Activées/.test(t) && /Envoie-moi une notification de test/.test(t), etiquette + ' D4. « ✅ Activées » + bouton de test', t.slice(0, 160));
    await p.click('button:has-text("notification de test")'); await p.waitForTimeout(400);
    rec(appels.some((a) => a.startsWith('POST /__push/test')) && /Envoyée/.test(await texte(p)), etiquette + ' D5. le test part au domaine et le dit');
    await ctx.close();
  });
  /* F — l'app est DÉJÀ installée sur cet appareil : dans le navigateur, plus aucun visuel d'installation (Kevin 23.10) */
  await essai(js, async (nav, base) => {
    /* F1 — iPhone Safari : le domaine sait que l'app est sur cet iPhone → ni 📲, ni feuille automatique, ni bandeau propre à l'app */
    const ctx = await nav.newContext({ userAgent: UA_IOS_SAFARI, viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true }); const p = await ctx.newPage();
    await ctx.addCookies([{ name: 'installee', value: '1', url: base }]);
    await p.goto(base + '/apex'); await p.waitForTimeout(5200);
    const f1 = await p.evaluate(() => ({ pastille: !!document.querySelector('[data-kdmc-installer="pastille"]'), feuille: !!document.querySelector('[data-kdmc-installer="feuille"]'), bandeau: getComputedStyle(document.getElementById('install-hint')).display }));
    rec(!f1.pastille && !f1.feuille && f1.bandeau === 'none', etiquette + " F1. iPhone Safari, app déjà sur l'iPhone : ni 📲, ni feuille, ni bandeau « Mets Apex Chat sur ton écran d'accueil »", JSON.stringify(f1));
    await ctx.close();
    /* F2 — même iPhone, app PAS installée : tout reste (pas de faux positif) */
    const ctx2 = await nav.newContext({ userAgent: UA_IOS_SAFARI, viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true }); const p2 = await ctx2.newPage();
    await p2.goto(base + '/apex'); await p2.waitForTimeout(800);
    const f2 = await p2.evaluate(() => ({ pastille: !!document.querySelector('[data-kdmc-installer="pastille"]'), bandeau: getComputedStyle(document.getElementById('install-hint')).display }));
    rec(f2.pastille && f2.bandeau !== 'none', etiquette + ' F2. app pas installée : la 📲 et le bandeau restent', JSON.stringify(f2));
    await ctx2.close();
    /* F3 — Android : l'app installée a été ouverte (même stockage que Chrome) → l'onglet Chrome n'affiche plus rien, même sans compte */
    const ctx3 = await nav.newContext({ userAgent: UA_ANDROID, viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true }); const p3 = await ctx3.newPage();
    await ctx3.addCookies([{ name: 'anonyme', value: '1', url: base }]);
    await p3.goto(base + '/'); await p3.evaluate(() => localStorage.setItem('kdmc_app_installee_at', String(Date.now())));
    await p3.goto(base + '/'); await p3.waitForTimeout(600);
    rec(!(await p3.evaluate(() => !!document.querySelector('[data-kdmc-installer="pastille"]'))), etiquette + " F3. Android, app déjà ouverte depuis l'écran d'accueil : l'onglet Chrome n'a plus la 📲");
    await ctx3.close();
  });
  /* E — page qui a déjà son manifeste ; cadre */
  await essai(js, async (nav, base) => {
    const ctx = await nav.newContext({ userAgent: UA_ANDROID, viewport: { width: 390, height: 780 } }); const p = await ctx.newPage();
    await p.goto(base + '/avec-manifeste'); await p.waitForTimeout(300);
    rec((await p.evaluate(() => document.querySelectorAll('link[rel="manifest"]').length)) === 1 && (await p.evaluate(() => document.querySelectorAll('link[rel="apple-touch-icon"]').length)) === 1, etiquette + ' E1. une page qui a déjà son manifeste et son icône n\'en reçoit pas un second');
    await p.goto(base + '/cadre'); await p.waitForTimeout(300);
    rec((await p.frames()[1].evaluate(() => !document.querySelector('[data-kdmc-installer]'))), etiquette + ' E2. dans un cadre (iframe) : rien');
    await ctx.close();
  });
}
await suite(INSTALLER_JS, 'vrai script —');
/* sabotage : sans l'appel prompt() et sans ajout du manifeste, la preuve doit rougir */
const avant = fails;
const saboté = INSTALLER_JS.replace('p.prompt();', '').replace('var tout = DEJA || (', 'var tout = (').replace("st.textContent = sel + '{display:none!important}';", '').replace("m.href = '/__installer/manifest.webmanifest'; h.appendChild(m);", '');
console.log('\n— sabotage : script sans prompt() ni manifeste (la preuve doit ROUGIR) —');
await suite(saboté, 'sabotage —');
const rougi = fails - avant; fails = avant;
rec(rougi >= 2, 'le sabotage fait bien rougir la preuve (' + rougi + ' contrôles rouges)');
console.log(`\n${fails ? '❌' : '✅'} installer (vrai navigateur) : ${fails ? fails + ' échec(s)' : 'installation + notifications prouvées'}`); process.exit(fails ? 1 : 0);
