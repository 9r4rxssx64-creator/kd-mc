// PREUVE EN VRAI NAVIGATEUR (22.10.2026) — Kevin : « une clé par appareil pour tous ».
// Trois appareils = trois vrais Chromium indépendants qui chargent la VRAIE page : l'iPhone et le PC de Kevin, l'iPhone de Rémy.
// Un serveur simulé ne fait que tenir la liste des appareils (POST /api/keys/device, GET /api/keys/:uid/devices).
// Vérifie : chaque appareil publie TOUT SEUL sa clé au démarrage ; un message privé écrit sur l'iPhone de Kevin se lit
// sur l'iPhone de Rémy ET sur le PC de Kevin (avant : « impossible à lire sur cet appareil ») ; le serveur ne voit jamais le texte.
//   node tests/runtime-cle-par-appareil.mjs        (code 0 = prouvé, 1 sinon)
//   PAGE_INDEX=<ancienne index.html> node tests/runtime-cle-par-appareil.mjs   → doit échouer (sabotage)
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = process.env.PAGE_INDEX || join(ROOT, 'index.html');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer((req, res) => {
  const chemin = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const p = chemin === 'index.html' ? PAGE : join(ROOT, chemin);
  if (!existsSync(p)) { res.writeHead(404); return res.end('nope'); }
  res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
});
const ok = [], ko = [];
const check = (c, m) => { (c ? ok : ko).push(m); console.log(`  ${c ? '✅' : '❌'} ${m}`); };
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const PRE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(existsSync(PRE) ? { executablePath: PRE } : {});

const appareils = {};                 // uid → [{ device_id, identity_key_pub }]
const corpsVus = [];                  // tout ce que le « serveur » reçoit
const CONV = (peer) => ({ id: 'conv-kr', type: 'dm', peer_id: peer, members: ['kdmc_admin', 'kdmc_remy'], member_count: 2, last_msg_ts: Date.now() });

async function ouvrir(nom, user, token, peer) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', ...(process.env.IPHONE ? { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {}) });
  await ctx.addInitScript(([u, t]) => {
    if (sessionStorage.getItem('seed')) return;
    sessionStorage.setItem('seed', '1');
    const P = 'apex_chat_';
    localStorage.setItem(P + 'user', JSON.stringify(u));
    localStorage.setItem(P + 'token', JSON.stringify(t));
    localStorage.setItem(P + 'pin_set', JSON.stringify(true));
    localStorage.setItem('apex_chat_perms_v1', JSON.stringify({ ts: Date.now(), granted: false }));
    localStorage.setItem('apex_chat_perms_bulk_done_v1', 'true');
  }, [user, token]);
  const page = await ctx.newPage();
  await page.route('**', async (route) => {
    const req = route.request(); const u = new URL(req.url());
    if (u.port === String(port)) return route.continue();
    if (u.host === 'apex-chat-api.9r4rxssx64.workers.dev') {
      const j = (o, s = 200) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(o) });
      const corps = req.postData() || '';
      if (corps) corpsVus.push(corps);
      if (u.pathname === '/api/users/me') return j({ ok: true, user });
      if (u.pathname === '/api/conversations' && req.method() === 'GET') return j({ ok: true, conversations: [CONV(peer)] });
      if (u.pathname === '/api/keys/device' && req.method() === 'POST') {
        const b = JSON.parse(corps || '{}');
        const l = (appareils[user.id] = appareils[user.id] || []).filter((d) => d.device_id !== b.device_id);
        l.push({ device_id: b.device_id, identity_key_pub: b.identity_key_pub, label: b.label, last_seen: Date.now() }); appareils[user.id] = l;
        return j({ ok: true });
      }
      const m = /^\/api\/keys\/([^/]+)\/devices$/.exec(u.pathname);
      if (m) return j({ ok: true, devices: appareils[decodeURIComponent(m[1])] || [] });
      return j({ ok: true });
    }
    return route.abort();
  });
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.K === 'object' && window.K.user && window.ApexCrypto, null, { timeout: 20000 });
  return { nom, page, ctx };
}

try {
  const KEVIN = { id: 'kdmc_admin', pseudo: 'kevin', real_name: 'Kevin DESARZENS', kdmc_uid: 'kdmc_admin', is_admin: 1, source: 'apex-sso', phone: '+33600000000' };
  const REMY = { id: 'kdmc_remy', pseudo: 'remy', real_name: 'Rémy LEDREN', kdmc_uid: 'kdmc_remy', is_admin: 0, source: 'kdmc-sso', phone: '+33600000001' };
  const kIphone = await ouvrir('iPhone de Kevin', KEVIN, 'J-K1', 'kdmc_remy');
  const kPc = await ouvrir('PC de Kevin', KEVIN, 'J-K2', 'kdmc_remy');
  const remy = await ouvrir('iPhone de Rémy', REMY, 'J-R', 'kdmc_admin');
  // Publication automatique au démarrage (≈ 1 s) : 2 appareils pour Kevin, 1 pour Rémy.
  const t0 = Date.now();
  while (Date.now() - t0 < 15000 && !((appareils.kdmc_admin || []).length >= 2 && (appareils.kdmc_remy || []).length >= 1)) await new Promise((r) => setTimeout(r, 200));
  check((appareils.kdmc_admin || []).length === 2, `Kevin : ses 2 appareils se sont déclarés tout seuls (${(appareils.kdmc_admin || []).length})`);
  check((appareils.kdmc_remy || []).length === 1, `Rémy : son appareil s'est déclaré tout seul (${(appareils.kdmc_remy || []).length})`);
  const ids = new Set((appareils.kdmc_admin || []).map((d) => d.device_id));
  check(ids.size === 2, 'chaque appareil de Kevin a SON identifiant et SA clé');

  const TEXTE = 'Salut Rémy, test 3 appareils';
  const raw = await kIphone.page.evaluate(async (t) => {
    const conv = (window.K.conversations || []).find((c) => c.id === 'conv-kr') || { id: 'conv-kr', type: 'dm', peer_id: 'kdmc_remy', members: ['kdmc_admin', 'kdmc_remy'] };
    return window.K._mdevEncrypt ? window.K._mdevEncrypt(conv, t, 'm', 'm_test_1') : null;
  }, TEXTE);
  check(typeof raw === 'string' && raw.startsWith('E2EM1:'), "l'iPhone de Kevin chiffre pour chaque appareil (enveloppe E2EM1)");
  check(!corpsVus.some((c) => c.includes(TEXTE)), 'le serveur ne reçoit jamais le texte en clair');
  for (const qui of [remy, kPc, kIphone]) {
    const r = await qui.page.evaluate(async (x) => window.K._decodeIncoming('conv-kr', x, { sender: 'kdmc_admin', id: 'm_test_1' }), raw || '');
    check(r && r.text === TEXTE && r.encrypted === true, `${qui.nom} lit le message (${r && r.text})`);
  }
  // Phase 2 (v1.1.344) : une PHOTO envoyée depuis l'iPhone de Kevin s'ouvre sur l'iPhone de Rémy ET sur le PC de Kevin.
  const envoiPhoto = await kIphone.page.evaluate(async () => {
    const conv = { id: 'conv-kr', type: 'dm', peer_id: 'kdmc_remy', members: ['kdmc_admin', 'kdmc_remy'] };
    if (!window.K._dmMediaEncrypt) return null;
    const r = await window.K._dmMediaEncrypt(conv, new Blob([new TextEncoder().encode('PHOTO-TEST-3-APPAREILS')], { type: 'image/jpeg' }));
    if (!r || !r.file) return { sansCle: true };
    const octets = Array.from(new Uint8Array(await r.body.arrayBuffer()));
    const g = r.file;
    const marqueur = 'APXMEDIA1:' + JSON.stringify({ u: 'https://apex-chat-api.9r4rxssx64.workers.dev/api/media/x', m: 'image/jpeg', n: 'photo.jpg', s: 22, c: '', e: 2, k: g.k, i: g.i, h: g.h });
    const enveloppe = await window.K._mdevEncrypt(conv, marqueur, 'm', 'm_photo_1');
    return { octets, enveloppe };
  });
  check(envoiPhoto && envoiPhoto.octets && envoiPhoto.enveloppe && envoiPhoto.enveloppe.startsWith('E2EM1:'), 'photo : octets chiffrés par une clé propre au fichier, clé envoyée dans une enveloppe pour chaque appareil');
  check(!corpsVus.some((c) => c.includes('PHOTO-TEST')), 'photo : le serveur ne voit jamais le contenu');
  for (const qui of [remy, kPc]) {
    const vu = await qui.page.evaluate(async ([env, octets]) => {
      const d = await window.K._decodeIncoming('conv-kr', env, { sender: 'kdmc_admin', id: 'm_photo_1' });
      const f = window.K._markerFields(d.text);
      if (!f || !f.media_gk) return null;
      const clair = await window.ApexCrypto.decryptGroupFile(new Uint8Array(octets).buffer, f.media_gk);
      return new TextDecoder().decode(clair);
    }, [envoiPhoto && envoiPhoto.enveloppe, (envoiPhoto && envoiPhoto.octets) || []]).catch(() => null);
    check(vu === 'PHOTO-TEST-3-APPAREILS', `${qui.nom} ouvre la photo (${vu})`);
  }
  // Réglages › Mes appareils sur le PC de Kevin : ses 2 appareils, « cet appareil » sans bouton Retirer.
  await kPc.page.evaluate(() => window.K._openMyDevices && window.K._openMyDevices());
  await kPc.page.waitForSelector('#my-devices-list', { timeout: 5000 }).catch(() => {});
  const ecran = await kPc.page.evaluate(() => { const el = document.querySelector('#my-devices-list'); return el ? { lignes: el.children.length, retirer: el.querySelectorAll('[data-kcall="_revokeDevice"]').length, moi: el.textContent.includes('cet appareil') } : null; });
  await kPc.page.waitForTimeout(800);
  if (process.env.CAPTURE) await kPc.page.screenshot({ path: process.env.CAPTURE });
  const tailles = await kPc.page.evaluate(() => Array.from(document.querySelectorAll('#my-devices-list button')).map((b) => { const r = b.getBoundingClientRect(); return Math.min(r.width, r.height); }));
  const deborde = await kPc.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check(tailles.every((t) => t >= 44) && !deborde, `Mes appareils : boutons ≥ 44 px (${tailles.join(',')}), rien ne déborde`);
  check(ecran && ecran.lignes === 2 && ecran.retirer === 1 && ecran.moi, `Mes appareils : 2 appareils, « cet appareil » repéré, 1 seul bouton Retirer (${JSON.stringify(ecran)})`);
} catch (e) {
  check(false, 'erreur : ' + (e && e.message));
} finally {
  await browser.close(); server.close();
}
console.log(`\n=== ${ok.length} OK / ${ko.length} KO ===`);
process.exit(ko.length ? 1 : 0);
