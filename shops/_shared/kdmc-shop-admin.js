/**
 * KDMC Shops — Module ADMIN PARTAGÉ (barre admin uniforme, thémée par boutique).
 * Kevin 2026-06-13 (option B) : donne une vraie barre admin aux boutiques qui
 * n'en ont pas (digital-vault, ecocraft, pawsome, tech-hub), sans dupliquer le code.
 *
 * Inclure UNE ligne avant </body> :
 *   <script src="/CMCteams/shops/_shared/kdmc-shop-admin.js" defer></script>
 *
 * Pilote les globals de la boutique : window.P (catalogue), window.dc (rendu),
 * window.toast, window.STORE_ID/STORE_NAME, window.CATS (optionnel). Aucune autre modif.
 *
 * - Auth : MÊME code admin que Chez Lolo (PBKDF2 200k) → identifiant uniforme.
 * - Thème : lit la variable CSS --p de la boutique → boutons à sa couleur.
 * - Isolation (règle Kevin) : confiance + produits stockés par boutique (clé STORE_ID).
 * - Ouverture admin : ?admin=1 dans l'URL, ou #admin, ou window.kdmcAdminOpen().
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SID = (window.STORE_ID || 'shop');
  var SNAME = (window.STORE_NAME || 'Boutique');
  var SALT = '0cc66855c92d79874f7e9eb95bea3294';
  var HASH = '41f5f808dbc0f3d2ba1de7dac11cc9903f61ecf9e26d646d536da181030449e2';
  var TRUST = 'kdmc_admin_' + SID;       /* par boutique = isolé */
  var PRODS = 'kdmc_prod_' + SID;        /* produits ajoutés (locaux) */
  var LOCK = 'kdmc_admin_lock_' + SID;

  function T(msg, kind) { try { if (typeof window.toast === 'function') return window.toast(msg, kind); } catch (_) {} alert(msg); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function isAdmin() { return localStorage.getItem(TRUST) === '1'; }
  function theme() {
    try { var c = getComputedStyle(document.documentElement).getPropertyValue('--p').trim(); return c || '#c9a227'; } catch (_) { return '#c9a227'; }
  }
  function rerender() { try { if (typeof window.dc === 'function') window.dc(); } catch (_) {} }

  /* ── Auth (même mécanisme/identifiant que Chez Lolo) ───────────────────── */
  async function hashPw(pw, salt) {
    var enc = new TextEncoder();
    var k = await crypto.subtle.importKey('raw', enc.encode(pw), { name: 'PBKDF2' }, false, ['deriveBits']);
    var b = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt || SALT), iterations: 200000, hash: 'SHA-256' }, k, 256);
    return Array.prototype.map.call(new Uint8Array(b), function (x) { return x.toString(16).padStart(2, '0'); }).join('');
  }
  function lockState() { try { return JSON.parse(localStorage.getItem(LOCK) || '{}'); } catch (_) { return {}; } }
  function lockMsg() { var s = lockState(), now = Date.now(); if (s.until && now < s.until) { var sec = Math.ceil((s.until - now) / 1000); return 'Trop d\'essais — réessaie dans ' + (sec >= 60 ? Math.ceil(sec / 60) + ' min' : sec + ' s'); } return ''; }

  /* ── UI : modal de déverrouillage ──────────────────────────────────────── */
  function openUnlock() {
    if (isAdmin()) { installBar(); return; }
    if (document.getElementById('kdmcAdminModal')) return;
    var p = theme();
    var d = document.createElement('div');
    d.id = 'kdmcAdminModal';
    d.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:18px;-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)';
    d.innerHTML = '<div style="background:#15171c;border:1px solid ' + p + '55;border-radius:16px;padding:22px;max-width:340px;width:100%;color:#f1f2f3;font-family:-apple-system,system-ui,sans-serif">'
      + '<div style="font-weight:800;font-size:17px;margin-bottom:4px">🔑 Accès admin — ' + esc(SNAME) + '</div>'
      + '<div style="font-size:12.5px;opacity:.7;margin-bottom:14px">Code admin (le même que tes autres boutiques).</div>'
      + '<input id="kdmcAdminPw" type="password" autocomplete="current-password" placeholder="Code admin" style="width:100%;min-height:46px;padding:12px;border-radius:11px;border:1px solid #2a2d31;background:#0a120c;color:#fff;font-size:16px;margin-bottom:12px">'
      + '<div style="display:flex;gap:8px">'
      + '<button id="kdmcAdminGo" style="flex:1;min-height:46px;padding:12px;background:' + p + ';color:#11160c;border:none;border-radius:11px;font-weight:800;font-size:15px;cursor:pointer">Déverrouiller</button>'
      + '<button id="kdmcAdminX" style="min-height:46px;padding:12px 16px;background:transparent;color:#9aa0a6;border:1px solid #2a2d31;border-radius:11px;font-weight:600;cursor:pointer">Fermer</button>'
      + '</div></div>';
    document.body.appendChild(d);
    d.addEventListener('click', function (e) { if (e.target === d) d.remove(); });
    document.getElementById('kdmcAdminX').onclick = function () { d.remove(); };
    var go = document.getElementById('kdmcAdminGo');
    var inp = document.getElementById('kdmcAdminPw');
    go.onclick = tryUnlock;
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') tryUnlock(); });
    setTimeout(function () { try { inp.focus(); } catch (_) {} }, 60);
  }
  async function tryUnlock() {
    var lm = lockMsg(); if (lm) { T(lm, 'error'); return; }
    var inp = document.getElementById('kdmcAdminPw'); if (!inp) return;
    var pw = inp.value || '';
    var ok = false;
    try { ok = (await hashPw(pw, SALT)) === HASH; } catch (_) { ok = false; }
    if (ok) {
      localStorage.setItem(TRUST, '1'); localStorage.removeItem(LOCK);
      var m = document.getElementById('kdmcAdminModal'); if (m) m.remove();
      T('🔓 Accès admin activé sur cet appareil');
      installBar(); rerender();
    } else {
      var s = lockState(), n = (s.n || 0) + 1;
      var dl = [0, 0, 0, 0, 30000, 120000, 600000, 3600000, 86400000];
      localStorage.setItem(LOCK, JSON.stringify({ n: n, until: Date.now() + (dl[Math.min(n, dl.length - 1)] || 86400000) }));
      T(n >= 5 ? ('Code incorrect — ' + lockMsg()) : 'Code incorrect', 'error');
    }
  }

  /* ── Barre admin thémée ────────────────────────────────────────────────── */
  function installBar() {
    var old = document.getElementById('kdmcAdminBar'); if (old) old.remove();
    if (!isAdmin()) return;
    var p = theme();
    var bs = 'background:rgba(20,20,24,.92);color:#fff;border:1px solid #555;border-radius:100px;font:700 12px system-ui;padding:9px 12px;cursor:pointer';
    var bar = document.createElement('div');
    bar.id = 'kdmcAdminBar';
    bar.style.cssText = 'position:fixed;left:10px;bottom:74px;z-index:9000;display:flex;gap:6px;flex-wrap:wrap;max-width:78vw';
    var html = '<button id="kdmcAddP" style="background:linear-gradient(135deg,' + p + ',' + p + 'cc);color:#11160c;border:none;border-radius:100px;font:800 12px system-ui;padding:9px 14px;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.35)">➕ Produit</button>'
      + '<button id="kdmcMng" style="' + bs + '">🗂️ Gérer</button>';
    if (typeof window.getMyOrders === 'function' || typeof window.sv === 'function') html += '<button id="kdmcOrd" style="' + bs + '">📜 Commandes</button>';
    html += '<button id="kdmcSto" style="' + bs + '">📦</button>'
      + '<button id="kdmcOut" style="' + bs + '">🚪</button>';
    bar.innerHTML = html;
    document.body.appendChild(bar);
    var on = function (id, fn) { var el = document.getElementById(id); if (el) el.onclick = fn; };
    on('kdmcAddP', addProductForm);
    on('kdmcMng', manageForm);
    on('kdmcOrd', function () { try { if (typeof window.sv === 'function') return window.sv('orders'); } catch (_) {} ordersModal(); });
    on('kdmcSto', storageInfo);
    on('kdmcOut', logout);
  }
  function logout() { localStorage.removeItem(TRUST); var b = document.getElementById('kdmcAdminBar'); if (b) b.remove(); T('Déconnecté de l\'admin'); rerender(); }

  /* ── Produits (locaux, fusionnés dans window.P) ────────────────────────── */
  function loadProds() { try { return JSON.parse(localStorage.getItem(PRODS) || '[]'); } catch (_) { return []; } }
  function saveProds(a) { try { localStorage.setItem(PRODS, JSON.stringify(a || [])); } catch (_) {} }
  function mergeIntoCatalog() {
    if (!Array.isArray(window.P)) return;
    var custom = loadProds(); if (!custom.length) return;
    var have = {}; window.P.forEach(function (x) { if (x && x.id) have[x.id] = 1; });
    custom.slice().reverse().forEach(function (q) { if (!have[q.id]) window.P.unshift(q); });
  }
  function addProductForm() {
    if (document.getElementById('kdmcProdModal')) return;
    var p = theme();
    var cats = (Array.isArray(window.CATS) ? window.CATS : []).filter(function (c) { return c && c.id && c.id !== 'all'; });
    var catOpts = cats.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc((c.icon ? c.icon + ' ' : '') + (c.name || c.id)) + '</option>'; }).join('');
    var d = document.createElement('div'); d.id = 'kdmcProdModal';
    d.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:18px';
    d.innerHTML = '<div style="background:#15171c;border:1px solid ' + p + '55;border-radius:16px;padding:20px;max-width:380px;width:100%;color:#f1f2f3;font-family:-apple-system,system-ui,sans-serif;max-height:90vh;overflow:auto">'
      + '<div style="font-weight:800;font-size:16px;margin-bottom:12px">➕ Ajouter un produit — ' + esc(SNAME) + '</div>'
      + '<input id="kp_name" placeholder="Nom du produit" style="width:100%;min-height:44px;padding:11px;border-radius:10px;border:1px solid #2a2d31;background:#0a120c;color:#fff;font-size:16px;margin-bottom:9px">'
      + '<div style="display:flex;gap:8px"><input id="kp_price" type="number" inputmode="decimal" placeholder="Prix €" style="flex:1;min-height:44px;padding:11px;border-radius:10px;border:1px solid #2a2d31;background:#0a120c;color:#fff;font-size:16px;margin-bottom:9px"><input id="kp_orig" type="number" inputmode="decimal" placeholder="Prix barré (option)" style="flex:1;min-height:44px;padding:11px;border-radius:10px;border:1px solid #2a2d31;background:#0a120c;color:#fff;font-size:16px;margin-bottom:9px"></div>'
      + (catOpts ? '<select id="kp_cat" style="width:100%;min-height:44px;padding:11px;border-radius:10px;border:1px solid #2a2d31;background:#0a120c;color:#fff;font-size:16px;margin-bottom:9px">' + catOpts + '</select>' : '<input id="kp_cat" placeholder="Catégorie" style="width:100%;min-height:44px;padding:11px;border-radius:10px;border:1px solid #2a2d31;background:#0a120c;color:#fff;font-size:16px;margin-bottom:9px">')
      + '<input id="kp_img" placeholder="URL de la photo (https://…)" style="width:100%;min-height:44px;padding:11px;border-radius:10px;border:1px solid #2a2d31;background:#0a120c;color:#fff;font-size:16px;margin-bottom:9px">'
      + '<textarea id="kp_desc" placeholder="Description (option)" style="width:100%;min-height:60px;padding:11px;border-radius:10px;border:1px solid #2a2d31;background:#0a120c;color:#fff;font-size:16px;margin-bottom:12px"></textarea>'
      + '<div style="display:flex;gap:8px"><button id="kp_go" style="flex:1;min-height:46px;padding:12px;background:' + p + ';color:#11160c;border:none;border-radius:11px;font-weight:800;cursor:pointer">Publier</button><button id="kp_x" style="min-height:46px;padding:12px 16px;background:transparent;color:#9aa0a6;border:1px solid #2a2d31;border-radius:11px;font-weight:600;cursor:pointer">Annuler</button></div>'
      + '</div>';
    document.body.appendChild(d);
    d.addEventListener('click', function (e) { if (e.target === d) d.remove(); });
    document.getElementById('kp_x').onclick = function () { d.remove(); };
    document.getElementById('kp_go').onclick = function () {
      var name = (document.getElementById('kp_name').value || '').trim();
      var price = parseFloat(document.getElementById('kp_price').value) || 0;
      if (!name) { T('Donne un nom au produit', 'error'); return; }
      if (!(price > 0)) { T('Donne un prix valide', 'error'); return; }
      var orig = parseFloat(document.getElementById('kp_orig').value) || 0;
      var cat = (document.getElementById('kp_cat').value || '').trim() || 'autres';
      var img = (document.getElementById('kp_img').value || '').trim();
      var desc = (document.getElementById('kp_desc').value || '').trim() || name;
      var prod = { id: 'cust_' + Date.now().toString(36), name: name, cat: cat, price: price, origPrice: orig > price ? orig : Math.round(price * 1.2 * 100) / 100, img: img || '📦', rating: 5, reviews: 0, desc: desc, tags: ['nouveau'], stock: 99, shipping: 'standard', _custom: true };
      var arr = loadProds(); arr.push(prod); saveProds(arr);
      mergeIntoCatalog();
      d.remove(); T('✅ Produit publié : ' + name); rerender();
    };
    setTimeout(function () { try { document.getElementById('kp_name').focus(); } catch (_) {} }, 60);
  }
  function manageForm() {
    var arr = loadProds();
    if (document.getElementById('kdmcMngModal')) return;
    var d = document.createElement('div'); d.id = 'kdmcMngModal';
    d.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:18px';
    var rows = arr.length ? arr.slice().reverse().map(function (q) {
      return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #2a2d31"><div style="flex:1;font-size:13px;font-weight:600">' + esc(q.name) + ' <span style="opacity:.6;font-weight:400">· ' + (q.price) + '€</span></div><button data-id="' + esc(q.id) + '" class="kdmcDel" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:12px;font-weight:700">Retirer</button></div>';
    }).join('') : '<div style="opacity:.6;font-size:13px;padding:10px 0">Aucun produit ajouté pour l\'instant.</div>';
    d.innerHTML = '<div style="background:#15171c;border:1px solid #2a2d31;border-radius:16px;padding:20px;max-width:380px;width:100%;color:#f1f2f3;font-family:-apple-system,system-ui,sans-serif;max-height:80vh;overflow:auto"><div style="font-weight:800;font-size:16px;margin-bottom:10px">🗂️ Mes produits ajoutés</div>' + rows + '<button id="kdmcMngX" style="width:100%;margin-top:14px;min-height:44px;padding:11px;background:transparent;color:#9aa0a6;border:1px solid #2a2d31;border-radius:11px;font-weight:600;cursor:pointer">Fermer</button></div>';
    document.body.appendChild(d);
    d.addEventListener('click', function (e) { if (e.target === d) d.remove(); });
    document.getElementById('kdmcMngX').onclick = function () { d.remove(); };
    Array.prototype.forEach.call(d.querySelectorAll('.kdmcDel'), function (b) {
      b.onclick = function () {
        var id = b.getAttribute('data-id');
        saveProds(loadProds().filter(function (x) { return x.id !== id; }));
        if (Array.isArray(window.P)) { var i = window.P.findIndex(function (x) { return x && x.id === id; }); if (i >= 0) window.P.splice(i, 1); }
        b.closest('div').remove(); T('Produit retiré'); rerender();
      };
    });
  }
  function ordersModal() {
    var o = []; try { if (typeof window.getMyOrders === 'function') o = window.getMyOrders() || []; } catch (_) {}
    T(o.length ? ('📜 ' + o.length + ' commande(s). Détail dans l\'onglet Commandes.') : 'Aucune commande pour le moment.');
  }
  function storageInfo() {
    try {
      if (navigator.storage && navigator.storage.estimate) {
        navigator.storage.estimate().then(function (e) {
          var mb = function (b) { return (b / 1048576).toFixed(1); };
          var pct = e.quota ? Math.round((e.usage || 0) / e.quota * 100) : 0;
          T('📦 Stockage : ' + mb(e.usage || 0) + ' Mo utilisés (' + pct + '%).');
        });
      } else T('Info stockage indisponible ici');
    } catch (_) { T('Info stockage indisponible'); }
  }

  /* ── Admin UNIVERSEL du domaine (Kevin reconnu partout, sans code par boutique) ──
     On demande à kd-mc.com « qui es-tu ? » : si c'est Kevin (ou Laurence) reconnu
     par le domaine avec Face ID (verified), on ouvre l'admin tout seul — comme le
     tableau de bord des boutiques. Le code PIN local reste un SECOURS si le domaine
     est injoignable. Sécurité : admin EXIGE verified (Face ID), jamais le nom seul.
     Si le SSO ne répond pas (autre origine, hors ligne) → on ne casse rien (PIN). */
  async function ssoAutoAdmin() {
    if (isAdmin()) return true;
    try {
      var hsh = location.hash || ''; var mm = hsh.match(/[#&]kdmc_sso=([^&]+)/);
      if (mm) { try { localStorage.setItem('kdmc_sso_token', decodeURIComponent(mm[1])); } catch (_) {}
                try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {} }
      var tok = ''; try { tok = localStorage.getItem('kdmc_sso_token') || ''; } catch (_) {}
      var hdr = {}; if (tok) hdr.Authorization = 'Bearer ' + tok;
      var rs = await fetch('/__sso/whoami', { credentials: 'include', cache: 'no-store', headers: hdr });
      var j = rs && rs.ok ? await rs.json() : null;
      var ok = j && j.ok && j.verified === true &&
        (j.admin === true || /laurence|lolo|saint.?polit|kevin|desarzens/i.test(j.name || ''));
      if (ok) { localStorage.setItem(TRUST, '1'); localStorage.removeItem(LOCK); installBar(); rerender(); return true; }
    } catch (_) { /* SSO injoignable → on retombe sur le PIN, rien de cassé */ }
    return false;
  }
  /* ── Boot ──────────────────────────────────────────────────────────────── */
  window.kdmcAdminOpen = openUnlock;
  function boot() {
    mergeIntoCatalog(); if (loadProds().length) rerender();
    if (isAdmin()) installBar(); else ssoAutoAdmin();
    try {
      var q = location.search || '', h = location.hash || '';
      if (/[?&]admin=1\b/.test(q) || h === '#admin') openUnlock();
    } catch (_) {}
    window.addEventListener('hashchange', function () { if (location.hash === '#admin') openUnlock(); });
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(boot, 300);
  else document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 300); });
})();
