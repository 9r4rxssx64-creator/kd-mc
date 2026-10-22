// PREUVE EN VRAI NAVIGATEUR (22.10.2026, v1.1.345) — une clé par appareil, GROUPES.
// Trois vrais Chromium chargent la VRAIE page : l'iPhone et le PC de Kevin, l'iPhone de Rémy, dans le groupe « Famille ».
// Le serveur simulé fait comme le vrai : UNE clé de compte (la dernière publiée gagne) + la liste des appareils.
// Vérifie : un message de groupe écrit sur n'importe quel appareil se lit sur les deux autres, signé et authentifié
// (avant : le PC de Kevin ne recevait pas la clé de groupe, et ses messages arrivaient « ⚠️ message non authentifié »).
//   node tests/runtime-groupe-appareils.mjs            (code 0 = prouvé, 1 sinon)
//   PAGE_INDEX=<ancienne index.html> node tests/runtime-groupe-appareils.mjs   → doit échouer (sabotage)
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

const appareils = {};   // uid → [{ device_id, identity_key_pub, signing_key_pub }]
const comptes = {};     // uid → bundle (la DERNIÈRE clé publiée gagne, comme users.identity_key_pub)
const GROUPE = { id: 'grp-famille', type: 'group', name: 'Famille', members: ['kdmc_admin', 'kdmc_remy'], member_count: 2, last_msg_ts: Date.now() };

async function ouvrir(nom, user, token) {
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
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
      const b = (() => { try { return JSON.parse(req.postData() || '{}'); } catch { return {}; } })();
      if (u.pathname === '/api/users/me') return j({ ok: true, user });
      if (u.pathname === '/api/conversations' && req.method() === 'GET') return j({ ok: true, conversations: [GROUPE] });
      if (u.pathname === '/api/conversations/' + GROUPE.id + '/members') return j({ ok: true, members: GROUPE.members.map((id) => ({ user_id: id })) });
      if (u.pathname === '/api/keys/prekeys' && req.method() === 'POST') {
        comptes[user.id] = { identity_key_pub: b.identity_key_pub, crypto_caps: b.crypto_caps, signing_key_pub: b.signing_key_pub || null };
        return j({ ok: true });
      }
      const mb = /^\/api\/keys\/([^/]+)\/bundle$/.exec(u.pathname);
      if (mb) { const c = comptes[decodeURIComponent(mb[1])]; return c ? j({ ok: true, bundle: c }) : j({ ok: false, error: 'key_pending' }, 409); }
      if (u.pathname === '/api/keys/device' && req.method() === 'POST') {
        const l = (appareils[user.id] = appareils[user.id] || []).filter((d) => d.device_id !== b.device_id);
        l.push({ device_id: b.device_id, identity_key_pub: b.identity_key_pub, signing_key_pub: b.signing_key_pub || null, label: b.label, last_seen: Date.now() });
        appareils[user.id] = l;
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
  // Les trames partent dans le journal de la page (pas de vrai serveur de conversation ici).
  await page.evaluate(() => { window.__trames = []; window.K._dispatchWire = (convId, w) => { window.__trames.push(w); return 'sent'; }; });
  return { nom, page, user };
}
const vider = (qui) => qui.page.evaluate(() => { const t = window.__trames; window.__trames = []; return t; });
async function envoyer(de, texte, mid) {
  const d = await de.page.evaluate(async ([t, id, g]) => window.K._grpEncryptOutgoing(g, t, { mid: id }), [texte, mid, GROUPE]);
  return { d, trames: await vider(de) };
}
async function recevoir(qui, de, envoi, mid) {
  return qui.page.evaluate(async ([env, g, sender, id]) => {
    for (const w of env.trames) await window.K._grpDecode(g, w.ciphertext, { sender, id: w.id });
    return window.K._grpDecode(g, env.d.wire, { sender, id });
  }, [envoi, GROUPE, de.user.id, mid]);
}

try {
  const KEVIN = { id: 'kdmc_admin', pseudo: 'kevin', real_name: 'Kevin DESARZENS', kdmc_uid: 'kdmc_admin', is_admin: 1, source: 'apex-sso', phone: '+33600000000' };
  const REMY = { id: 'kdmc_remy', pseudo: 'remy', real_name: 'Rémy LEDREN', kdmc_uid: 'kdmc_remy', is_admin: 0, source: 'kdmc-sso', phone: '+33600000001' };
  const kIphone = await ouvrir('iPhone de Kevin', KEVIN, 'J-K1');
  const remy = await ouvrir('iPhone de Rémy', REMY, 'J-R');
  const kPc = await ouvrir('PC de Kevin', KEVIN, 'J-K2');   // ouvert en dernier : c'est SA clé qui est « la » clé du compte
  const t0 = Date.now();
  const prets = () => (appareils.kdmc_admin || []).filter((d) => d.signing_key_pub).length >= 2 && (appareils.kdmc_remy || []).some((d) => d.signing_key_pub) && comptes.kdmc_admin && comptes.kdmc_remy;
  while (Date.now() - t0 < 20000 && !prets()) await new Promise((r) => setTimeout(r, 250));
  check(prets(), "chaque appareil a déclaré sa clé ET sa clé de signature (Kevin : 2, Rémy : 1)");

  // 1) l'iPhone de Kevin écrit : Rémy et le PC de Kevin lisent
  const e1 = await envoyer(kIphone, 'Bonjour la famille', 'g_1');
  check(e1.d && e1.d.mode === 'cipher' && String(e1.d.wire).startsWith('E2EG1:'), "l'iPhone de Kevin chiffre le message de groupe");
  for (const qui of [remy, kPc]) {
    const r = await recevoir(qui, kIphone, e1, 'g_1');
    check(r && r.text === 'Bonjour la famille' && r.encrypted === true, `${qui.nom} lit le message de l'iPhone de Kevin (${r && r.text})`);
  }
  // 2) le PC de Kevin écrit : Rémy le lit AUTHENTIFIÉ (avant : « ⚠️ message non authentifié »), l'iPhone de Kevin aussi
  const e2 = await envoyer(kPc, 'Message du PC', 'g_2');
  check(e2.d && e2.d.mode === 'cipher', 'le PC de Kevin chiffre le message de groupe');
  for (const qui of [remy, kIphone]) {
    const r = await recevoir(qui, kPc, e2, 'g_2');
    check(r && r.text === 'Message du PC' && r.encrypted === true, `${qui.nom} lit le message du PC de Kevin (${r && r.text})`);
  }
  // 3) Rémy écrit : les DEUX appareils de Kevin le lisent
  const e3 = await envoyer(remy, 'Salut de Rémy', 'g_3');
  for (const qui of [kIphone, kPc]) {
    const r = await recevoir(qui, remy, e3, 'g_3');
    check(r && r.text === 'Salut de Rémy' && r.encrypted === true, `${qui.nom} lit le message de Rémy (${r && r.text})`);
  }
  // 4) un appareil NON déclaré qui prétend signer pour Kevin : refusé
  const faux = await remy.page.evaluate(async (g) => {
    const raw = 'E2EG1:' + btoa(JSON.stringify({ v: 1, epoch: 1, kid: 'zzzz', iv: 'AAAAAAAAAAAAAAAA', ct: 'AAAA', b: 2, k: 'm', mid: 'g_4', sg: 'AAAA', sd: 'dev-inconnu-0000001' }));
    return window.K._grpDecode(g, raw, { sender: 'kdmc_admin', id: 'g_4' });
  }, GROUPE);
  check(faux && faux.encrypted !== true, `une trame d'un appareil inconnu n'est jamais affichée comme message de Kevin (${faux && faux.text})`);
} catch (e) {
  check(false, 'erreur : ' + (e && e.message));
} finally {
  await browser.close(); server.close();
}
console.log(`\n=== ${ok.length} OK / ${ko.length} KO ===`);
process.exit(ko.length ? 1 : 0);
