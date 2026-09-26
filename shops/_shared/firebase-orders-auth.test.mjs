/* Test v10 — firebase-orders.js : les écritures ADMIN attachent le token role:admin
   (fail-open), les commandes clients + lectures restent anonymes. Zéro réseau réel. */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(__dirname, 'firebase-orders.js'), 'utf8');

/* Charge le fichier dans un contexte neuf avec window + fetch mockés.
   tokenResp: réponse du POST /__admin/fbtoken.
   cfg (optionnel) : { blockUntilLogin, loginOk } pour simuler le verrou par rôle.
   Renvoie { win, calls }. */
function load(tokenResp, cfg) {
  cfg = cfg || {};
  const calls = [];
  let granted = false; // passe true après un /__admin/login réussi
  const fetchMock = (url, opts) => {
    const u = String(url);
    calls.push({ url: u, method: (opts && opts.method) || 'GET' });
    if (u.indexOf('/__admin/login') >= 0) {
      if (cfg.loginOk === false) return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
      granted = true;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ grant: 'GRANT_SIGNED' }) });
    }
    if (u.indexOf('/__admin/fbtoken') >= 0) {
      // après le grant, l'endpoint renvoie un vrai token (le retry sera authentifié)
      if (granted) return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, id_token: 'GRANTTOK', expires_in: 3600 }) });
      return Promise.resolve({ ok: tokenResp.ok !== false, json: () => Promise.resolve(tokenResp.body) });
    }
    // écriture produit/logo : bloquée (401) tant que pas de grant si cfg.blockUntilLogin
    if (cfg.blockUntilLogin && !granted) return Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  };
  const win = {};
  const ctx = { window: win, fetch: fetchMock, Date, encodeURIComponent, Promise, String, Number, Object, isFinite, Error, console };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { win, calls };
}

const tests = [];
function test(label, fn) { tests.push({ label, fn }); }

test('écriture admin SANS token → fail-open (pas de ?auth=)', async () => {
  const { win, calls } = load({ ok: false, body: { ok: false } });
  await win.kdmcPublishProduct('la-detente', { id: 'p1', name: 'X' });
  const w = calls.find((c) => c.url.indexOf('/products/') >= 0);
  if (!w) throw new Error('aucune écriture produit');
  if (w.url.indexOf('?auth=') >= 0) throw new Error('ne devrait PAS avoir ?auth= sans token: ' + w.url);
  return true;
});

test('écriture admin AVEC token → ?auth=<id_token>', async () => {
  const { win, calls } = load({ ok: true, body: { ok: true, id_token: 'TOK123', expires_in: 3600 } });
  await win.kdmcPublishLogo('la-detente', { id: 'l1', name: 'L' });
  const w = calls.find((c) => c.url.indexOf('/logos/') >= 0);
  if (!w) throw new Error('aucune écriture logo');
  if (w.url.indexOf('?auth=TOK123') < 0) throw new Error('devrait avoir ?auth=TOK123: ' + w.url);
  if (w.method !== 'PUT') throw new Error('méthode: ' + w.method);
  return true;
});

test('delete admin AVEC token → ?auth= (DELETE)', async () => {
  const { win, calls } = load({ ok: true, body: { ok: true, id_token: 'TOK9', expires_in: 3600 } });
  await win.kdmcDeleteProduct('la-detente', 'p9');
  const w = calls.find((c) => c.method === 'DELETE' && c.url.indexOf('/products/') >= 0);
  if (!w || w.url.indexOf('?auth=TOK9') < 0) throw new Error('DELETE sans auth: ' + (w && w.url));
  return true;
});

test('token mis en cache : 2 écritures → 1 seul appel /__admin/fbtoken', async () => {
  const { win, calls } = load({ ok: true, body: { ok: true, id_token: 'TOKC', expires_in: 3600 } });
  await win.kdmcPublishProduct('la-detente', { id: 'a', name: 'A' });
  await win.kdmcPublishProduct('la-detente', { id: 'b', name: 'B' });
  const tokCalls = calls.filter((c) => c.url.indexOf('/__admin/fbtoken') >= 0);
  if (tokCalls.length !== 1) throw new Error('attendu 1 appel token, obtenu ' + tokCalls.length);
  return true;
});

test('commande client (kdmcPushOrder) = ANONYME (jamais de token ni ?auth=)', async () => {
  const { win, calls } = load({ ok: true, body: { ok: true, id_token: 'TOKO', expires_in: 3600 } });
  win.kdmcPushOrder({ shop: 'la-detente', orderId: 'o1', total: 10 });
  await new Promise((r) => setTimeout(r, 20));
  if (calls.some((c) => c.url.indexOf('/__admin/fbtoken') >= 0)) throw new Error('order ne doit PAS demander de token');
  const w = calls.find((c) => c.url.indexOf('/orders/') >= 0);
  if (!w || w.url.indexOf('?auth=') >= 0) throw new Error('order ne doit PAS être authentifié: ' + (w && w.url));
  return true;
});

test('lecture catalogue (kdmcFetchProducts) = ANONYME (pas de token)', async () => {
  const { win, calls } = load({ ok: true, body: { ok: true, id_token: 'TOKR', expires_in: 3600 } });
  await new Promise((r) => { win.kdmcFetchProducts('la-detente', () => r()); });
  if (calls.some((c) => c.url.indexOf('/__admin/fbtoken') >= 0)) throw new Error('la lecture ne doit PAS demander de token');
  return true;
});

/* ── v10 SÉCURITÉ DU VERROU : le Studio ne doit JAMAIS croire « Publié » à tort,
   et doit s'auto-récupérer (grant → retry) quand le verrou refuse. ───────────── */
test('verrou ON + code fourni → grant (/__admin/login) + RETRY authentifié → succès', async () => {
  const { win, calls } = load({ ok: false, body: { ok: false } }, { blockUntilLogin: true });
  win.kdmcAdminPinPrompt = () => '424242'; // hook Studio simulé
  const r = await win.kdmcPublishProduct('la-detente', { id: 'p1', name: 'X' });
  if (!r || !r.ok) throw new Error('devrait résoudre sur succès du retry');
  if (!calls.some((c) => c.url.indexOf('/__admin/login') >= 0)) throw new Error('aucun /__admin/login appelé');
  // le SECOND PUT produit doit porter le token de grant
  const puts = calls.filter((c) => c.method === 'PUT' && c.url.indexOf('/products/') >= 0);
  if (puts.length !== 2) throw new Error('attendu 2 PUT (bloqué puis retry), obtenu ' + puts.length);
  if (puts[1].url.indexOf('?auth=GRANTTOK') < 0) throw new Error('le retry doit être authentifié: ' + puts[1].url);
  return true;
});

test('verrou ON + code REFUSÉ (annulé) → REJETTE (Studio .catch, pas de faux succès)', async () => {
  const { win } = load({ ok: false, body: { ok: false } }, { blockUntilLogin: true });
  win.kdmcAdminPinPrompt = () => null; // utilisateur annule
  let rejected = false;
  try { await win.kdmcPublishProduct('la-detente', { id: 'p2', name: 'Y' }); }
  catch (e) { rejected = /admin_blocked_401/.test(e.message); }
  if (!rejected) throw new Error('un write bloqué sans code doit REJETER (jamais résoudre)');
  return true;
});

test('verrou ON + mauvais code (login KO) → REJETTE (jamais faux succès)', async () => {
  const { win } = load({ ok: false, body: { ok: false } }, { blockUntilLogin: true, loginOk: false });
  win.kdmcAdminPinPrompt = () => 'mauvais';
  let rejected = false;
  try { await win.kdmcDeleteLogo('la-detente', 'l9'); }
  catch (e) { rejected = /admin_login_failed/.test(e.message); }
  if (!rejected) throw new Error('login KO doit REJETER');
  return true;
});

const run = async () => {
  let pass = 0, fail = 0;
  for (const t of tests) {
    try { await t.fn(); console.log('  ✓ ' + t.label); pass++; }
    catch (e) { console.log('  ✗ ' + t.label + ' — ' + e.message); fail++; }
  }
  console.log(`\nfirebase-orders-auth : ${pass}/${pass + fail} OK`);
  process.exit(fail === 0 ? 0 : 1);
};
run();
