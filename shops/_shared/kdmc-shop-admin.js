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
 * - Auth : UNIQUEMENT le domaine (audit 2026-10-08). Avant : le sel + l'empreinte PBKDF2 du code
 *   admin étaient commités ici (dépôt PUBLIC → un calcul hors ligne retrouve un code à 6 chiffres),
 *   et un drapeau localStorage « kdmc_admin_<boutique>=1 » suffisait à devenir admin. Maintenant :
 *   kd-mc.com/__sso/whoami (session vérifiée, admin ou rôle « shops ») ou /__admin/grant (laissez-
 *   passer admin HttpOnly posé par le domaine). Aucune vérification locale, rien de mémorisé.
 * - Thème : lit la variable CSS --p de la boutique → boutons à sa couleur.
 * - Isolation (règle Kevin) : produits stockés par boutique (clé STORE_ID).
 * - Ouverture admin : ?admin=1 dans l'URL, ou #admin, ou window.kdmcAdminOpen().
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SID = (window.STORE_ID || 'shop');
  var SNAME = (window.STORE_NAME || 'Boutique');
  var PRODS = 'kdmc_prod_' + SID;        /* produits ajoutés (locaux) */
  /* Admin = verdict du DOMAINE, gardé en mémoire de la page seulement (jamais en localStorage :
     un drapeau local se pose en une ligne dans la console et ouvrait l'admin). */
  var _admin = false;
  /* Ménage des anciennes marques locales (drapeau de confiance + compteur d'essais). */
  try { localStorage.removeItem('kdmc_admin_' + SID); localStorage.removeItem('kdmc_admin_lock_' + SID); } catch (_) {}

  function T(msg, kind) { try { if (typeof window.toast === 'function') return window.toast(msg, kind); } catch (_) {} alert(msg); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function isAdmin() { return _admin === true; }
  function theme() {
    try { var c = getComputedStyle(document.documentElement).getPropertyValue('--p').trim(); return c || '#c9a227'; } catch (_) { return '#c9a227'; }
  }
  function rerender() { try { if (typeof window.dc === 'function') window.dc(); } catch (_) {} }

  /* ── Auth : on demande au DOMAINE, jamais de code vérifié ici ─────────────────── */
  /* Portail du domaine : prouve l'identité (Face ID ou prénom + nom + code) puis revient ici. */
  function allerAuPortail() {
    try { location.href = 'https://kd-mc.com/?return=' + encodeURIComponent(location.href.replace(/#.*$/, '') + '#admin'); } catch (_) {}
  }
  /* ── UI : écran d'accès (plus aucun champ de code : c'est le portail qui le demande) ───── */
  function openUnlock() {
    if (isAdmin()) { installBar(); return; }
    if (document.getElementById('kdmcAdminModal')) return;
    var p = theme();
    var d = document.createElement('div');
    d.id = 'kdmcAdminModal';
    d.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:18px;-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)';
    d.innerHTML = '<div style="background:#15171c;border:1px solid ' + p + '55;border-radius:16px;padding:22px;max-width:340px;width:100%;color:#f1f2f3;font-family:-apple-system,system-ui,sans-serif">'
      + '<div style="font-weight:800;font-size:17px;margin-bottom:4px">🔑 Accès admin — ' + esc(SNAME) + '</div>'
      + '<div id="kdmcAdminMsg" style="font-size:12.5px;opacity:.7;margin-bottom:14px">On regarde si le domaine te reconnaît…</div>'
      + '<div style="display:flex;gap:8px">'
      + '<button id="kdmcAdminGo" style="flex:1;min-height:46px;padding:12px;background:' + p + ';color:#11160c;border:none;border-radius:11px;font-weight:800;font-size:15px;cursor:pointer">Me connecter sur kd-mc.com</button>'
      + '<button id="kdmcAdminX" style="min-height:46px;padding:12px 16px;background:transparent;color:#9aa0a6;border:1px solid #2a2d31;border-radius:11px;font-weight:600;cursor:pointer">Fermer</button>'
      + '</div></div>';
    document.body.appendChild(d);
    d.addEventListener('click', function (e) { if (e.target === d) d.remove(); });
    document.getElementById('kdmcAdminX').onclick = function () { d.remove(); };
    document.getElementById('kdmcAdminGo').onclick = allerAuPortail;
    ssoAutoAdmin().then(function (ok) {
      var m = document.getElementById('kdmcAdminMsg');
      if (ok) { d.remove(); T('🔓 Accès admin activé (reconnu par le domaine)'); return; }
      if (m) m.textContent = 'Le domaine ne te reconnaît pas comme admin ici. Connecte-toi sur kd-mc.com (Face ID ou prénom + nom + code), tu reviendras ici tout seul.';
    });
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
  function logout() {
    _admin = false; var b = document.getElementById('kdmcAdminBar'); if (b) b.remove();
    /* Le laissez-passer admin est un cookie HttpOnly du domaine : seul lui peut l'effacer. */
    try { fetch('/__admin/logout', { method: 'POST', credentials: 'include' }).catch(function () {}); } catch (_) {}
    T('Déconnecté de l\'admin'); rerender();
  }

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
     On demande à kd-mc.com « qui es-tu ? » : admin vérifié (Face ID) ou rôle « shops »
     (Laurence) → l'admin s'ouvre. Sinon on tente /__admin/grant : le laissez-passer admin
     (cookie HttpOnly posé après le code sur le portail) vaut preuve. Jamais le nom seul
     (leçon #99), jamais une liste de prénoms dans le code, jamais de code vérifié ici.
     Domaine injoignable → pas admin (rien de cassé pour les clients : la boutique s'affiche). */
  function autorise(j) {
    if (!j || !j.ok || j.verified !== true) return false;
    return j.admin === true || (Array.isArray(j.roles) && j.roles.indexOf('shops') >= 0);
  }
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
      var ok = autorise(j);
      if (!ok) {
        /* Laissez-passer admin déjà posé par une autre app du domaine (cookie .kd-mc.com) ? */
        var rg = await fetch('/__admin/grant', { credentials: 'include', cache: 'no-store', headers: hdr });
        var g = rg && rg.ok ? await rg.json() : null;
        ok = !!(g && g.ok);
      }
      if (ok) { _admin = true; installBar(); rerender(); return true; }
    } catch (_) { /* domaine injoignable → pas admin, rien de cassé */ }
    return false;
  }
  /* ── Boot ──────────────────────────────────────────────────────────────── */
  window.kdmcAdminOpen = openUnlock;
  function boot() {
    mergeIntoCatalog(); if (loadProds().length) rerender();
    var veut = false;
    try { var q = location.search || '', h = location.hash || ''; veut = /[?&]admin=1\b/.test(q) || h === '#admin'; } catch (_) {}
    ssoAutoAdmin().then(function (ok) { if (!ok && veut) openUnlock(); });
    window.addEventListener('hashchange', function () { if (location.hash === '#admin') openUnlock(); });
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(boot, 300);
  else document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 300); });
})();
