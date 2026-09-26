// ════════════════════════════════════════════════════════════════════════
//  E2E DEUX CLIENTS — échange réel sur la PROD live (Playwright)
//  Kevin (2026-06-09) : « simule des clients, leurs connexions, l'échange de
//  messages, photos… teste à ma place. »
//
//  Ouvre DEUX clients (Alice + Bob = comptes de test, PAS Kevin/Laurence),
//  les authentifie via l'OTP de test, ouvre un VRAI WebSocket comme l'app, et
//  prouve qu'un message TEXTE et une PHOTO partent d'un client et ARRIVENT chez
//  l'autre — dans les DEUX sens — sur l'infra déployée (Worker + Durable Object).
//
//  Non destructif : numéros de test FIXES réutilisés (le serveur dédoublonne en
//  1 compte + 1 conversation). Si l'OTP de test est désactivé (ALLOW_TEST_OTP
//  off), le test se SKIP proprement (CI reste verte).
// ════════════════════════════════════════════════════════════════════════
import { test, expect, request as pwRequest } from '@playwright/test';

const API = 'https://apex-chat-api.9r4rxssx64.workers.dev';
const WS_BASE = API.replace(/^https?/, 'wss');

const A = { phone: '+33600000091', name: 'Alice E2E', pseudo: 'alice_e2e' };
const B = { phone: '+33600000092', name: 'Bob E2E', pseudo: 'bob_e2e' };

// PNG 1×1 transparent (vrai fichier image pour l'upload média)
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

// v1.1.198 — login de test SÛR (secret-gaté, 2 numéros fixes). Le secret CI
// E2E_TEST_SECRET == APEX_CHAT_ADMIN_TOKEN (header X-Test-Auth côté worker).
// .trim() : le secret GitHub peut contenir un retour-ligne final → header invalide
// ("Invalid character in header content"). Le worker le compare sans newline.
const TEST_SECRET = (process.env.E2E_TEST_SECRET || '').trim();
async function auth(request, u) {
  if (!TEST_SECRET) return { ok: false, status: 0, body: { reason: 'no E2E_TEST_SECRET' } };
  const r = await request.post(API + '/api/test/login', {
    headers: { 'X-Test-Auth': TEST_SECRET },
    data: { phone: u.phone, name: u.name, pseudo: u.pseudo },
  });
  return { ok: r.ok(), status: r.status(), body: await r.json().catch(() => ({})) };
}

// Ouvre un WebSocket DANS la page (origine prod valide) et collecte les frames.
async function openWs(page, convId, token, uid) {
  await page.goto('./', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.evaluate(({ WS_BASE, convId, token, uid }) => {
    return new Promise((resolve, reject) => {
      const url = WS_BASE + '/api/conversations/' + encodeURIComponent(convId) + '/ws'
        + '?token=' + encodeURIComponent(token)
        + '&uid=' + encodeURIComponent(uid)
        + '&conv=' + encodeURIComponent(convId);
      const ws = new WebSocket(url);
      window.__frames = [];
      ws.addEventListener('message', (e) => { try { window.__frames.push(JSON.parse(e.data)); } catch (_) {} });
      ws.addEventListener('open', () => resolve(true));
      ws.addEventListener('error', () => reject(new Error('ws error')));
      window.__ws = ws;
      setTimeout(() => reject(new Error('ws open timeout 12s')), 12000);
    });
  }, { WS_BASE, convId, token, uid });
}
const wsSend = (page, obj) => page.evaluate((o) => window.__ws.send(JSON.stringify(o)), obj);
const wsFrames = (page) => page.evaluate(() => window.__frames || []);

test.describe('Échange réel 2 clients (Alice ↔ Bob) sur la prod', () => {
  // v1.1.201 — Kevin « efface Alice et bob quand tu as terminé ». Les comptes de
  // test sont purgés après chaque run (secret-gaté), ils ne traînent jamais.
  test.afterAll(async () => {
    if (!TEST_SECRET) return;
    try {
      const ctx = await pwRequest.newContext();
      await ctx.post(API + '/api/test/cleanup', { headers: { 'X-Test-Auth': TEST_SECRET }, data: {} });
      await ctx.dispose();
    } catch (_) { /* best-effort */ }
  });

  test('texte aller/retour + photo livrés via WebSocket', async ({ browser, request, browserName }) => {
    // WebKit sur CI Linux bloque l'ouverture de WebSocket depuis une page
    // ("SecurityError: operation is insecure") — limite du moteur en CI, pas un
    // bug app. La preuve live WS tourne sur Chromium ; l'engine + le pipeline
    // (tests unit) couvrent la logique sur tous les cas.
    test.skip(browserName === 'webkit', 'WebSocket-from-page instable sur WebKit CI');
    // 1) Auth des 2 clients de test
    const aAuth = await auth(request, A);
    const bAuth = await auth(request, B);
    if (!aAuth.ok || !bAuth.ok) {
      test.skip(true, `login de test indisponible — A:${aAuth.status} B:${bAuth.status} (${JSON.stringify(aAuth.body)})`);
      return;
    }
    const aTok = aAuth.body.token, aId = aAuth.body.user.id;
    const bTok = bAuth.body.token, bId = bAuth.body.user.id;
    expect(aTok && bTok, 'tokens présents').toBeTruthy();
    expect(aId).not.toBe(bId);

    // 2) Bob crée le DM avec Alice (canonique + dédoublonné côté serveur)
    const convR = await request.post(API + '/api/conversations', {
      headers: { Authorization: 'Bearer ' + bTok },
      data: { type: 'dm', members: [aId] },
    });
    expect(convR.ok(), 'create conv HTTP ' + convR.status()).toBeTruthy();
    const conv = await convR.json();
    const convId = conv.id || conv.conv_id || (conv.conversation && conv.conversation.id);
    expect(convId, 'convId renvoyé').toBeTruthy();

    // 2 bis) F30 — renommer une conversation. Bob l'a créée (propriétaire) → 200 ;
    // avant le correctif du 24/09 la prod répondait 500 alors que le nom changeait.
    // Alice n'est que membre → 403.
    const ren = await request.patch(API + '/api/conversations/' + encodeURIComponent(convId), {
      headers: { Authorization: 'Bearer ' + bTok },
      data: { name: 'E2E renommée ' + Date.now() },
    });
    expect(ren.status(), 'PATCH conv par le propriétaire').toBe(200);
    const renA = await request.patch(API + '/api/conversations/' + encodeURIComponent(convId), {
      headers: { Authorization: 'Bearer ' + aTok },
      data: { name: 'pirate' },
    });
    expect(renA.status(), 'PATCH conv par un simple membre').toBe(403);

    // 3) Deux contextes navigateur distincts = deux vrais clients connectés
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    try {
      await openWs(pageA, convId, aTok, aId);
      await openWs(pageB, convId, bTok, bId);

      // 4) TEXTE Bob → Alice
      const t1 = 'E2E hello ' + Date.now();
      await wsSend(pageB, { type: 'message', ciphertext: t1, mime: 'text/plain' });
      await expect.poll(async () => (await wsFrames(pageA)).some(f => f.type === 'message' && f.ciphertext === t1),
        { timeout: 15000, message: 'Alice doit recevoir le message de Bob' }).toBe(true);

      // 5) TEXTE Alice → Bob (sens inverse)
      const t2 = 'E2E reply ' + Date.now();
      await wsSend(pageA, { type: 'message', ciphertext: t2, mime: 'text/plain' });
      await expect.poll(async () => (await wsFrames(pageB)).some(f => f.type === 'message' && f.ciphertext === t2),
        { timeout: 15000, message: 'Bob doit recevoir la réponse d\'Alice' }).toBe(true);

      // 6) PHOTO : Bob upload une image (R2) puis envoie le marqueur média
      const up = await request.post(API + '/api/media', {
        headers: { Authorization: 'Bearer ' + bTok, 'content-type': 'image/png', 'x-file-name': 'photo.png' },
        data: PNG_1x1,
      });
      expect(up.ok(), 'upload média HTTP ' + up.status()).toBeTruthy();
      const media = await up.json();
      expect(media.url, 'url média').toBeTruthy();
      const marker = 'APXMEDIA1:' + JSON.stringify({ u: media.url, m: 'image/png', n: 'photo.png', s: media.size || PNG_1x1.length, c: 'ma photo' });
      await wsSend(pageB, { type: 'message', ciphertext: marker, mime: 'image/png' });
      await expect.poll(async () => (await wsFrames(pageA)).some(f => f.type === 'message' && typeof f.ciphertext === 'string' && f.ciphertext.includes('APXMEDIA1:') && f.ciphertext.includes(media.url)),
        { timeout: 15000, message: 'Alice doit recevoir la photo de Bob' }).toBe(true);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});
