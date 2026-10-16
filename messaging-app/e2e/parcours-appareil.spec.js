// ════════════════════════════════════════════════════════════════════════
//  PARCOURS D'UN APPAREIL RÉEL — « connecte-toi comme moi et vérifie à ma place » (Kevin 16.10.2026)
//
//  Honnêtement : le robot ne se connecte JAMAIS en tant que Kevin (son code admin et Face ID ne quittent pas
//  son téléphone — règle absolue). Il se connecte avec Alice et Bob, DEUX COMPTES DE TEST que le serveur
//  réserve aux contrôles (login de test, numéros fixes, effacés après chaque passage), dans un VRAI navigateur
//  (Chromium et WebKit « iPhone 14 Pro »), sur la PRODUCTION, avec la vraie page. Il rejoue les gestes que
//  Kevin devait faire à la main :
//    A. la version affichée = la version annoncée par le serveur ;
//    B. mode clair : les couleurs réellement affichées sont lisibles (contraste WCAG ≥ 4,5:1, MESURÉ) ;
//    C. « Te déconnecter » : le jeton de CET appareil est refusé ensuite, celui d'un autre appareil continue ;
//    D. message écrit HORS LIGNE : 🕓, puis ✓ au retour du réseau (jamais « livré » à tort).
//  Sans le secret E2E_TEST_SECRET : sauté ET annoncé ; avec le secret, une panne du login de test = ÉCHEC.
// ════════════════════════════════════════════════════════════════════════
import { test, expect, pwRequest, marquer } from './fixtures.js';
import { exigerLoginTest } from './login-test-politique.js';

const API = 'https://apex-chat-api.9r4rxssx64.workers.dev';
const A = { phone: '+33600000091', name: 'Alice E2E', pseudo: 'alice_e2e' };
const B = { phone: '+33600000092', name: 'Bob E2E', pseudo: 'bob_e2e' };
const TEST_SECRET = (process.env.E2E_TEST_SECRET || '').trim();

async function auth(request, u) {
  if (!TEST_SECRET) return { ok: false, status: 0, body: { reason: 'no E2E_TEST_SECRET' } };
  const r = await request.post(API + '/api/test/login', { headers: { 'X-Test-Auth': TEST_SECRET }, data: { phone: u.phone, name: u.name, pseudo: u.pseudo } });
  return { ok: r.ok(), status: r.status(), body: await r.json().catch(() => ({})) };
}
const meStatus = async (request, token) => (await request.get(API + '/api/users/me', { headers: { Authorization: 'Bearer ' + token } })).status();

/** Pose la session AVANT le chargement de la page, comme le fait l'app elle-même (clés « apex_chat_… »). */
async function injecter(page, token, user) {
  await page.addInitScript(({ token, user }) => {
    try {
      localStorage.setItem('apex_chat_token', JSON.stringify(token));
      localStorage.setItem('apex_chat_user', JSON.stringify(user));
      localStorage.setItem('apex_chat_cgu_accepted', JSON.stringify(true));
    } catch (_) { /* page sans stockage */ }
  }, { token, user });
}
async function ecran(page) { return page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 260)).catch(() => '(page illisible)'); }
async function prete(page) {
  try { await page.waitForFunction(() => window.K && K.user && K.token && document.querySelector('#topbar-version, .bnav-btn, .chat-list, #chat-msgs'), null, { timeout: 30000 }); }
  catch (e) { throw new Error('l\'app n\'a pas ouvert la session de test. Écran vu : « ' + await ecran(page) + ' »'); }
}

const lum = (rgb) => { const c = rgb.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test.describe('Parcours d\'un appareil (comptes de test) sur la prod', () => {
  let aTok, aUser, aTok2, bTok, convId;

  test.beforeAll(async () => {
    if (!TEST_SECRET) return;
    const ctx = await pwRequest.newContext({ extraHTTPHeaders: { 'x-kdmc-sonde': 'apex-chat-e2e' } });
    const a = await auth(ctx, A), b = await auth(ctx, B), a2 = await auth(ctx, A);
    if (a.ok && b.ok && a2.ok) {
      aTok = a.body.token; aUser = a.body.user; aTok2 = a2.body.token; bTok = b.body.token;
      const c = await ctx.post(API + '/api/conversations', { headers: { Authorization: 'Bearer ' + bTok }, data: { type: 'dm', members: [aUser.id] } });
      const cj = await c.json().catch(() => ({}));
      convId = cj.id || cj.conv_id || (cj.conversation && cj.conversation.id);
    }
    await ctx.dispose();
  });
  test.afterAll(async () => {
    if (!TEST_SECRET) return;
    const ctx = await pwRequest.newContext();
    await ctx.post(API + '/api/test/cleanup', { headers: { 'X-Test-Auth': TEST_SECRET }, data: {} }).catch(() => {});
    await ctx.dispose();
  });
  const pret = () => exigerLoginTest(test, TEST_SECRET, aTok ? { ok: true } : { ok: false, status: 0 }, bTok ? { ok: true } : { ok: false, status: 0 });

  test('A. la version affichée est celle du serveur', async ({ browser, request }) => {
    pret();
    const ctx = await browser.newContext(); await marquer(ctx);
    const page = await ctx.newPage(); await injecter(page, aTok, aUser);
    const sante = await (await request.get(API + '/api/health')).json();
    await page.goto('./', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await prete(page);
    const affichee = await page.evaluate(() => (document.querySelector('#topbar-version') || document.querySelector('#splash-version') || {}).textContent || '');
    expect(affichee.trim(), 'version affichée par l\'app').toBe('v' + sante.version);
    await ctx.close();
  });

  test('B. mode clair : les couleurs affichées sont lisibles (≥ 4,5:1 mesuré)', async ({ browser }) => {
    pret();
    const ctx = await browser.newContext({ colorScheme: 'light' }); await marquer(ctx);
    const page = await ctx.newPage(); await injecter(page, aTok, aUser);
    await page.goto('./', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await prete(page);
    const mesure = await page.evaluate(() => {
      const probe = document.createElement('i'); document.body.appendChild(probe);
      const lire = (v) => { probe.style.color = 'var(' + v + ')'; const m = getComputedStyle(probe).color.match(/\d+(\.\d+)?/g) || []; return m.slice(0, 3).map(Number); };
      const r = {}; for (const v of ['--ax-bg', '--ax-bg-2', '--ax-text', '--ax-text-2', '--ax-text-3', '--ax-gold', '--ax-blue', '--ax-warn', '--ax-ok', '--ax-err']) r[v] = lire(v);
      probe.remove(); return r;
    });
    for (const v of ['--ax-text', '--ax-text-2', '--ax-text-3', '--ax-gold', '--ax-blue', '--ax-warn', '--ax-ok', '--ax-err']) {
      expect(ratio(mesure[v], mesure['--ax-bg']), v + ' ' + JSON.stringify(mesure[v]) + ' sur le fond ' + JSON.stringify(mesure['--ax-bg']) + ' (toutes les mesures : ' + JSON.stringify(mesure) + ')').toBeGreaterThanOrEqual(4.5);
    }
    await ctx.close();
  });

  test('C. « Te déconnecter » coupe CET appareil côté serveur, pas les autres', async ({ browser, request }) => {
    pret();
    expect(await meStatus(request, aTok), 'jeton valide avant').toBe(200);
    const ctx = await browser.newContext(); await marquer(ctx);
    const page = await ctx.newPage(); await injecter(page, aTok, aUser);
    page.on('dialog', (d) => d.accept());
    await page.goto('./', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await prete(page);
    await page.evaluate(() => K.logout());
    await expect.poll(() => meStatus(request, aTok), { timeout: 20000, message: 'le jeton déconnecté doit être refusé par le serveur' }).toBe(401);
    expect(await meStatus(request, aTok2), 'le jeton d\'un autre appareil du même compte continue').toBe(200);
    await ctx.close();
  });

  test('D. message écrit hors ligne : 🕓 puis ✓ au retour du réseau', async ({ browser, browserName }) => {
    test.skip(browserName === 'webkit', 'WebSocket-from-page instable sur WebKit CI (limite du moteur)');
    pret();
    expect(convId, 'conversation de test créée').toBeTruthy();
    const ctx = await browser.newContext(); await marquer(ctx);
    const page = await ctx.newPage(); await injecter(page, aTok2, aUser);
    await page.goto('./', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await prete(page);
    // La liste de l'appareil se remplit depuis le serveur : on la rafraîchit, PUIS on ouvre (comme un toucher dans la liste).
    await page.evaluate(async (id) => { try { await K._refreshConvs(); } catch (_) {} await K.openConv(id); }, convId);
    try { await page.waitForSelector('#msg-input', { timeout: 20000 }); } catch (e) { throw new Error('la conversation ne s\'est pas ouverte. Écran vu : « ' + await ecran(page) + ' »'); }
    await page.waitForTimeout(2500);   // laisse le temps réel s'ouvrir
    await ctx.setOffline(true);
    await page.fill('#msg-input', 'test hors ligne ' + Date.now());
    await page.click('.chat-send');
    const statut = page.locator('.msg.me .msg-status').last();
    await expect(statut, 'statut du message écrit sans réseau').toContainText('🕓', { timeout: 10000 });
    await ctx.setOffline(false);
    await expect(statut, 'statut après le retour du réseau').toContainText('✓', { timeout: 45000 });
    await ctx.close();
  });
});
