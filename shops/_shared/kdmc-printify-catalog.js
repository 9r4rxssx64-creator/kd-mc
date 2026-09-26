/**
 * KDMC Shops — Catalogue Printify PARTAGÉ (v1, 2026-07-08, audit amélioration Top #10)
 *
 * Avant : le flux Printify (import blueprints → publication → édition prix/nom →
 * frais de port réels) était codé EN DUR dans la-detente ; chez-lolo n'avait rien
 * → impossible de publier son catalogue le jour J. Ici : module générique par
 * STORE_ID, inclus par n'importe quelle boutique.
 *
 * Prérequis dans la page hôte : window.STORE_ID, window.P (catalogue rendu),
 * window.dc() (re-render), window.toast(msg, type). Optionnels :
 * window.kdmcPublishProduct/kdmcFetchProducts/kdmcDeleteProduct (firebase-orders.js,
 * fail-open sinon : publication locale seulement), window._clOrderCfg/_ldOrderCfg
 * ({worker_url, app_tag}) pour /shipping.
 *
 * Règles appliquées : chemins ABSOLUS /CMCteams/... (leçon #102 — les relatifs
 * ../_shared 404ent derrière le routeur kd-mc.com) · fail-open partout · aucune
 * clé côté client (la clé Printify vit dans le worker) · isolation par STORE_ID.
 */
(function () {
  'use strict';
  var SID = window.STORE_ID || 'shop';
  /* Le catalogue blueprints est un catalogue DE COMPTE Printify (pas par boutique) —
     généré par le cron la-detente-printify-blueprints.yml. URL absolue (leçon #102). */
  var BP_URL = window.KDMC_BP_URL || '/CMCteams/shops/la-detente/printify-blueprints.json';
  var PUB_KEY = 'kdmc_pub_' + SID;

  function lg(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* quota */ } }
  function t(m, err) { try { if (typeof window.toast === 'function') window.toast(m, err ? 'error' : undefined); } catch (e) { /* noop */ } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function orderCfg() { return window._clOrderCfg || window._ldOrderCfg || window._kdmcOrderCfg || null; }

  function published() { return lg(PUB_KEY, []); }
  function savePublished(arr) { lset(PUB_KEY, arr); }

  function mergeIntoP(arr) {
    if (!window.P || !Array.isArray(window.P) || !Array.isArray(arr)) return;
    arr.forEach(function (p) {
      if (!p || !p.id) return;
      var ix = -1;
      for (var i = 0; i < window.P.length; i++) { if (window.P[i] && window.P[i].id === p.id) { ix = i; break; } }
      if (ix >= 0) window.P[ix] = p; else window.P.push(p);
    });
  }

  /** Au boot : cache local immédiat + produits publiés depuis le cloud (cross-device). */
  function bootSync() {
    var cache = published();
    if (cache.length) mergeIntoP(cache);
    if (window.kdmcFetchProducts) {
      window.kdmcFetchProducts(SID, function (arr) {
        if (arr && arr.length) {
          savePublished(arr);
          mergeIntoP(arr);
          if (typeof window.dc === 'function') window.dc();
        }
      });
    }
  }

  function loadBlueprints(cb) {
    var c = lg('kdmc_bp_cache_v1', null);
    if (c && c.t && Date.now() - c.t < 24 * 3600 * 1000 && c.j) return cb(c.j);
    fetch(BP_URL).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (j && j.categories) lset('kdmc_bp_cache_v1', { t: Date.now(), j: j });
      cb((j && j.categories) ? j : ((c && c.j) || null));
    }).catch(function () { cb((c && c.j) || null); });
  }

  /* ── Panel admin ─────────────────────────────────────────────────────── */
  function open() {
    loadBlueprints(function (j) {
      if (!j || !j.categories) { t('Catalogue Printify indisponible (hors-ligne ? réessaie)', true); return; }
      renderPanel(j);
    });
  }

  function closePanel() { var m = document.getElementById('kdmcCatModal'); if (m) m.remove(); }

  function renderPanel(j) {
    closePanel();
    var cats = j.categories || {};
    var pubs = published();
    var html = '<div style="background:var(--card,#1a1c20);color:var(--text,#eee);border:1px solid var(--border,#333);border-radius:16px;max-width:560px;width:100%;max-height:88vh;overflow-y:auto;padding:20px">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h2 style="font-size:19px;font-weight:800;margin:0">🖨 Catalogue Printify — ' + esc(window.STORE_NAME || SID) + '</h2><span onclick="kdmcCatalog.close()" style="cursor:pointer;font-size:24px;color:var(--muted,#999);min-width:44px;min-height:44px;display:flex;align-items:center;justify-content:center">✕</span></div>'
      + '<p style="font-size:12px;color:var(--muted,#999);margin:0 0 14px">Choisis un support, fixe nom + prix, publie : visible par tous les clients, commande envoyée à Printify (on-hold) au checkout.</p>';
    /* Produits déjà publiés (édition prix/nom en ligne) */
    if (pubs.length) {
      html += '<details open style="margin-bottom:14px"><summary style="font-weight:700;cursor:pointer;padding:6px 0">✅ Publiés (' + pubs.length + ')</summary>';
      pubs.forEach(function (p) {
        html += '<div style="display:flex;gap:8px;align-items:center;padding:8px;border:1px solid var(--border,#333);border-radius:10px;margin-top:6px">'
          + (p.img && /^(https:|data:image\/|\/CMCteams\/)/.test(p.img) ? '<img src="' + esc(p.img) + '" style="width:42px;height:42px;object-fit:contain;background:#fff;border-radius:8px">' : '<span style="font-size:24px">👕</span>')
          + '<input value="' + esc(p.name) + '" onchange="kdmcCatalog.editName(\'' + esc(p.id) + '\',this.value)" style="flex:1;min-width:0;padding:8px;border-radius:8px;border:1px solid var(--border,#333);background:var(--bg,#111);color:inherit;font-size:13px">'
          + '<input type="number" step="0.5" value="' + (+p.price || 0) + '" onchange="kdmcCatalog.editPrice(\'' + esc(p.id) + '\',this.value)" style="width:72px;padding:8px;border-radius:8px;border:1px solid var(--border,#333);background:var(--bg,#111);color:inherit;font-size:13px"> €'
          + '<button onclick="kdmcCatalog.remove(\'' + esc(p.id) + '\')" title="Retirer" style="background:none;border:none;color:#e05555;font-size:18px;cursor:pointer;min-width:44px;min-height:44px">🗑</button></div>';
      });
      html += '</details>';
    }
    /* Catégories blueprints */
    Object.keys(cats).forEach(function (ck) {
      var cat = cats[ck] || {}; var items = cat.items || [];
      if (!items.length) return;
      html += '<details' + (ck === 'top' ? ' open' : '') + ' style="margin-bottom:8px"><summary style="font-weight:700;cursor:pointer;padding:8px 0">' + esc(cat.label || ck) + ' <span style="color:var(--muted,#999);font-weight:400">(' + items.length + ')</span></summary>';
      items.slice(0, 40).forEach(function (it) {
        html += '<div style="display:flex;gap:10px;align-items:center;padding:8px;border:1px solid var(--border,#333);border-radius:10px;margin-top:6px">'
          + (it.image ? '<img src="' + esc(it.image) + '" loading="lazy" style="width:46px;height:46px;object-fit:contain;background:#fff;border-radius:8px">' : '<span style="font-size:26px">📦</span>')
          + '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(it.title || ('#' + it.id)) + '</div><div style="font-size:11px;color:var(--muted,#999)">' + esc(it.brand || '') + ' · réf #' + esc(String(it.id)) + '</div></div>'
          + '<button onclick="kdmcCatalog.publishForm(' + (+it.id || 0) + ',\'' + esc(ck) + '\')" style="background:var(--p,#7c8c3c);color:#fff;border:none;border-radius:100px;font:700 12px system-ui;padding:10px 14px;cursor:pointer;min-height:44px">Publier</button></div>';
      });
      if (items.length > 40) html += '<div style="font-size:11px;color:var(--muted,#999);padding:6px 0">… ' + (items.length - 40) + ' autres dans cette catégorie (affichage limité)</div>';
      html += '</details>';
    });
    html += '</div>';
    var m = document.createElement('div');
    m.id = 'kdmcCatModal';
    m.style.cssText = 'position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;padding:14px';
    m.innerHTML = html;
    m.onclick = function (e) { if (e.target === m) m.remove(); };
    document.body.appendChild(m);
    window._kdmcBpCache = j;
  }

  function findBp(id) {
    var j = window._kdmcBpCache; if (!j || !j.categories) return null;
    var found = null;
    Object.keys(j.categories).forEach(function (ck) {
      (j.categories[ck].items || []).forEach(function (it) { if (+it.id === +id) found = it; });
    });
    return found;
  }

  function publishForm(bpId, cat) {
    var it = findBp(bpId) || { id: bpId, title: 'Produit #' + bpId };
    var defName = String(it.title || 'Produit').replace(/^(unisex|mens|womens|adult)\s+/i, '') + ' ' + (window.STORE_NAME || '');
    var old = document.getElementById('kdmcPubModal'); if (old) old.remove();
    var m = document.createElement('div');
    m.id = 'kdmcPubModal';
    m.style.cssText = 'position:fixed;inset:0;z-index:10060;background:rgba(0,0,0,.88);display:flex;align-items:center;justify-content:center;padding:14px';
    m.innerHTML = '<div style="background:var(--card,#1a1c20);color:var(--text,#eee);border:1px solid var(--border,#333);border-radius:16px;max-width:400px;width:100%;padding:20px">'
      + '<h3 style="margin:0 0 4px;font-size:17px">🚀 Publier en boutique</h3>'
      + '<div style="font-size:11px;color:var(--muted,#999);margin-bottom:10px">' + esc(it.title || '') + ' · réf #' + esc(String(bpId)) + '</div>'
      + (it.image ? '<img src="' + esc(it.image) + '" style="width:130px;height:130px;object-fit:contain;background:#fff;border-radius:12px;display:block;margin:0 auto 12px">' : '')
      + '<label style="font-size:12px;color:var(--muted,#999)">Nom en boutique</label>'
      + '<input id="kdmc_pub_name" value="' + esc(defName.trim()) + '" style="width:100%;padding:11px;border-radius:8px;border:1px solid var(--border,#333);background:var(--bg,#111);color:inherit;margin:5px 0 10px;box-sizing:border-box">'
      + '<label style="font-size:12px;color:var(--muted,#999)">Prix (€)</label>'
      + '<input id="kdmc_pub_price" type="number" step="0.5" value="29" style="width:100%;padding:11px;border-radius:8px;border:1px solid var(--border,#333);background:var(--bg,#111);color:inherit;margin:5px 0 8px;box-sizing:border-box">'
      + '<div id="kdmc_pub_ship" style="font-size:11.5px;color:var(--muted,#999);margin-bottom:12px">Frais de port réels : <button onclick="kdmcCatalog.showShip(' + (+bpId || 0) + ')" style="background:none;border:1px solid var(--border,#333);border-radius:8px;color:inherit;padding:6px 10px;cursor:pointer;font-size:11px">💶 Vérifier (Printify live)</button></div>'
      + '<button onclick="kdmcCatalog.publish(' + (+bpId || 0) + ',\'' + esc(cat) + '\')" style="width:100%;padding:14px;background:var(--p,#7c8c3c);color:#fff;border:none;border-radius:10px;font-weight:800;cursor:pointer;min-height:44px">🚀 Publier</button>'
      + '<button onclick="document.getElementById(\'kdmcPubModal\').remove()" style="width:100%;padding:10px;background:none;border:none;color:var(--muted,#999);cursor:pointer;margin-top:6px">Annuler</button></div>';
    m.onclick = function (e) { if (e.target === m) m.remove(); };
    document.body.appendChild(m);
  }

  function publish(bpId, cat) {
    var it = findBp(bpId) || { id: bpId, title: 'Produit #' + bpId };
    var name = ((document.getElementById('kdmc_pub_name') || {}).value || '').trim() || ('Produit ' + (window.STORE_NAME || ''));
    var price = parseFloat((document.getElementById('kdmc_pub_price') || {}).value) || 29;
    var id = 'kp_' + SID + '_' + bpId;
    var prod = {
      id: id, name: name, cat: cat || 'textile', price: price,
      origPrice: Math.round(price * 1.22 * 10) / 10,
      img: it.image || '', rating: 5, reviews: 0,
      desc: name + ' — impression à la demande premium (' + esc(it.title || '') + '). Taille au choix à la commande, expédié au nom de la boutique.',
      material: 'Impression à la demande premium', tags: ['printify', cat || 'textile'],
      sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock: 50, shipping: 'standard',
      _printify: { blueprint_id: +bpId, category: cat || 'textile' }, ts: Date.now(),
    };
    var arr = published().filter(function (x) { return x.id !== id; }).concat([prod]);
    savePublished(arr);
    mergeIntoP([prod]);
    var done = function () {
      t('✅ Publié : ' + name);
      var mm = document.getElementById('kdmcPubModal'); if (mm) mm.remove();
      closePanel();
      if (typeof window.dc === 'function') window.dc();
    };
    if (window.kdmcPublishProduct) window.kdmcPublishProduct(SID, prod).then(done).catch(function () { t('Publié localement (cloud KO, réessaie)', true); done(); });
    else done();
  }

  function editPrice(id, val) {
    var v = parseFloat(val); if (!v) return;
    var arr = published(); var p = null;
    arr.forEach(function (x) { if (x.id === id) p = x; });
    if (!p) return;
    p.price = v; p.origPrice = Math.round(v * 1.22 * 10) / 10;
    savePublished(arr); mergeIntoP([p]);
    if (window.kdmcPublishProduct) window.kdmcPublishProduct(SID, p).catch(function () { /* fail-open */ });
    t('Prix mis à jour : ' + v.toFixed(2) + ' €');
    if (typeof window.dc === 'function') window.dc();
  }

  function editName(id, val) {
    val = (val || '').trim(); if (!val) return;
    var arr = published(); var p = null;
    arr.forEach(function (x) { if (x.id === id) p = x; });
    if (!p) return;
    p.name = val;
    savePublished(arr); mergeIntoP([p]);
    if (window.kdmcPublishProduct) window.kdmcPublishProduct(SID, p).catch(function () { /* fail-open */ });
    t('Nom mis à jour');
    if (typeof window.dc === 'function') window.dc();
  }

  function remove(id) {
    if (!window.confirm('Retirer ce produit de la boutique ?')) return;
    savePublished(published().filter(function (x) { return x.id !== id; }));
    if (window.P && Array.isArray(window.P)) {
      for (var i = window.P.length - 1; i >= 0; i--) { if (window.P[i] && window.P[i].id === id) window.P.splice(i, 1); }
    }
    if (window.kdmcDeleteProduct) window.kdmcDeleteProduct(SID, id).catch(function () { /* fail-open */ });
    t('Produit retiré');
    closePanel(); open();
    if (typeof window.dc === 'function') window.dc();
  }

  /* ── Frais de port RÉELS (Printify live via le worker, clé côté serveur) ── */
  function quoteShipping(bpId, country, cb) {
    var cfg = orderCfg();
    if (!cfg || !cfg.worker_url || !bpId) return cb(null);
    fetch(cfg.worker_url.replace(/\/$/, '') + '/shipping?bp=' + encodeURIComponent(bpId) + '&country=' + encodeURIComponent(country || 'FR'), {
      headers: { 'x-ld-app': cfg.app_tag || 'ld-order-v1' },
    }).then(function (r) { return r.json(); }).then(function (j) { cb(j && j.ok ? j : null); }).catch(function () { cb(null); });
  }

  function showShip(bpId) {
    var box = document.getElementById('kdmc_pub_ship');
    if (box) box.innerHTML = '⏳ Tarif Printify en cours…';
    quoteShipping(bpId, 'FR', function (j) {
      if (!box) return;
      if (!j) { box.innerHTML = '⚠️ Tarif indisponible (worker hors-ligne ou clé absente)'; return; }
      box.innerHTML = '💶 Port réel FR : <b>' + (j.first_item != null ? j.first_item.toFixed(2) + ' €' : '?') + '</b>'
        + (j.additional_item != null ? ' (+' + j.additional_item.toFixed(2) + ' €/article suppl.)' : '') + ' — à intégrer dans ton prix.';
    });
  }

  /** Estimation port pour le PANIER (somme des articles printify) — affichage checkout. */
  function cartShippingEstimate(cartItems, country, cb) {
    try {
      var bps = [];
      (cartItems || []).forEach(function (ci) {
        var p = (window.P || []).filter(function (x) { return x && x.id === (ci.id || ci.pid); })[0];
        var bp = p && p._printify && p._printify.blueprint_id;
        if (bp) for (var i = 0; i < (ci.qty || 1); i++) bps.push(bp);
      });
      if (!bps.length) return cb(null);
      quoteShipping(bps[0], country || 'FR', function (j) {
        if (!j || j.first_item == null) return cb(null);
        var total = j.first_item + (bps.length - 1) * (j.additional_item != null ? j.additional_item : j.first_item);
        cb({ total: Math.round(total * 100) / 100, items: bps.length, currency: j.currency || 'EUR' });
      });
    } catch (e) { cb(null); }
  }

  window.kdmcCatalog = {
    open: open, close: closePanel, bootSync: bootSync,
    publishForm: publishForm, publish: publish,
    editPrice: editPrice, editName: editName, remove: remove,
    quoteShipping: quoteShipping, showShip: showShip,
    cartShippingEstimate: cartShippingEstimate,
    published: published,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootSync);
  else bootSync();
})();
