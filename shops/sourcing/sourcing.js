/* KDMC Sourcing — moteur commun (hub + page fournisseur).
   - SSO transverse kd-mc.com (Kevin + Laurence). Fail-open anti-lockout.
   - Sélection partagée temps réel via Firebase RTDB (path isolé shops_sourcing_v1/*).
   - Catalogue "live" via un proxy worker (clé API du fournisseur côté serveur) ;
     si pas branché → mode curaté (lien direct catalogue + ajout manuel).
   - Aucune donnée inventée : un catalogue ne s'affiche que s'il vient réellement
     d'une API branchée. Sinon on affiche un lien vers le vrai catalogue.
*/
(function (global) {
  'use strict';

  var FB = 'https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app';
  var SEL_PATH = 'shops_sourcing_v1/selection';   // sélection partagée Kevin+Laurence
  var LS_PROXY = 'kdmc_sourcing_proxy';            // base URL du worker proxy catalogue (optionnel)
  var LS_USER = 'kdmc_sourcing_user';              // nom affiché (fallback)

  /* ---------- utils ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function qs(k) { try { return new URLSearchParams(location.search).get(k) || ''; } catch (e) { return ''; } }
  function el(id) { return document.getElementById(id); }
  function num(v) { var n = Number(String(v).replace(',', '.')); return isFinite(n) ? n : 0; }
  function toast(msg) {
    var t = el('kdmc-toast');
    if (!t) { t = document.createElement('div'); t.id = 'kdmc-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.className = 'show';
    clearTimeout(t._h); t._h = setTimeout(function () { t.className = ''; }, 2600);
  }

  /* ---------- SSO ---------- */
  var _user = null;
  function bootSSO(onReady) {
    try { if (global.kdmcSSO && global.kdmcSSO.consumeHashToken) global.kdmcSSO.consumeHashToken(); } catch (e) { /* */ }
    if (!global.kdmcSSO || !global.kdmcSSO.whoamiResult) {
      // SSO indisponible → fail-open (jamais de lockout)
      _user = { uid: '', name: (function () { try { return localStorage.getItem(LS_USER) || 'Invité'; } catch (e) { return 'Invité'; } })(), open: true };
      onReady(_user); return;
    }
    global.kdmcSSO.whoamiResult().then(function (r) {
      if (r.state === 'session') {
        _user = r.session; try { localStorage.setItem(LS_USER, _user.name || ''); } catch (e) { /* */ }
        onReady(_user);
      } else if (r.state === 'neterr') {
        // réseau KO → fail-open
        _user = { uid: '', name: (function () { try { return localStorage.getItem(LS_USER) || 'Invité'; } catch (e) { return 'Invité'; } })(), open: true };
        onReady(_user);
      } else {
        onReady(null); // invalid → demande connexion
      }
    }).catch(function () {
      _user = { uid: '', name: 'Invité', open: true }; onReady(_user);
    });
  }
  function loginRedirect() {
    var ret = encodeURIComponent(location.href);
    if (global.kdmcSSO && global.kdmcSSO.ensureSession) { global.kdmcSSO.ensureSession(location.href); return; }
    location.href = 'https://kd-mc.com/?return=' + ret;
  }

  /* ---------- sélection partagée (Firebase REST) ---------- */
  function selUrl(id) { return FB + '/' + SEL_PATH + (id ? '/' + encodeURIComponent(id) : '') + '.json'; }
  var _selCache = {};
  function fetchSelection(cb) {
    fetch(selUrl()).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      _selCache = (j && typeof j === 'object') ? j : {};
      try { cb(_selCache); } catch (e) { /* */ }
    }).catch(function () { try { cb(_selCache); } catch (e) { /* */ } });
  }
  function itemId(p) {
    var raw = (p.supplier || '') + '|' + (p.sku || p.url || p.title || '');
    return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120) || ('it_' + Date.now());
  }
  function addToSelection(p, cb) {
    var id = p.id || itemId(p);
    var payload = {
      id: id, supplier: String(p.supplier || '').slice(0, 60), supplierName: String(p.supplierName || '').slice(0, 80),
      family: String(p.family || '').slice(0, 30), title: String(p.title || '').slice(0, 200),
      price: num(p.price), currency: String(p.currency || '').slice(0, 8),
      image: String(p.image || '').slice(0, 500), url: String(p.url || '').slice(0, 500),
      sku: String(p.sku || '').slice(0, 80), note: String(p.note || '').slice(0, 300),
      addedBy: (_user && _user.name) || 'Invité', ts: Date.now()
    };
    fetch(selUrl(id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function (r) { _selCache[id] = payload; toast('✅ Ajouté à la sélection'); if (cb) cb(true, id); })
      .catch(function () { toast('⚠️ Réseau — réessaie'); if (cb) cb(false); });
  }
  function removeFromSelection(id, cb) {
    fetch(selUrl(id), { method: 'DELETE' }).then(function () {
      delete _selCache[id]; toast('🗑️ Retiré'); if (cb) cb(true);
    }).catch(function () { toast('⚠️ Réseau'); if (cb) cb(false); });
  }
  function selectionArray() {
    return Object.keys(_selCache).map(function (k) { return _selCache[k]; })
      .filter(function (x) { return x && x.id; }).sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
  }
  function exportCsv() {
    var rows = selectionArray();
    var head = ['supplier', 'supplierName', 'family', 'title', 'price', 'currency', 'sku', 'url', 'image', 'addedBy', 'date'];
    var lines = [head.join(';')];
    rows.forEach(function (r) {
      lines.push([r.supplier, r.supplierName, r.family, r.title, r.price, r.currency, r.sku, r.url, r.image, r.addedBy,
      new Date(r.ts || 0).toISOString()].map(function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }).join(';'));
    });
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'kdmc-selection-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }

  /* ---------- catalogue live (via proxy worker, optionnel) ---------- */
  function proxyBase() { try { return localStorage.getItem(LS_PROXY) || ''; } catch (e) { return ''; } }
  function setProxyBase(u) { try { if (u) localStorage.setItem(LS_PROXY, u); else localStorage.removeItem(LS_PROXY); } catch (e) { /* */ } }
  /* Tente de charger un vrai catalogue depuis le proxy worker.
     Renvoie une promesse -> {ok, products:[{title,price,currency,image,url,sku}], error?}.
     Le proxy détient la clé API du fournisseur (jamais exposée au navigateur). */
  function loadCatalog(supplierId, opts) {
    opts = opts || {};
    var base = proxyBase();
    if (!base) return Promise.resolve({ ok: false, error: 'no_proxy' });
    var u = base.replace(/\/$/, '') + '/catalog?supplier=' + encodeURIComponent(supplierId)
      + '&page=' + (opts.page || 1) + (opts.q ? '&q=' + encodeURIComponent(opts.q) : '');
    return fetch(u, { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : { ok: false, error: 'http_' + r.status }; })
      .then(function (j) {
        if (!j || j.ok === false) return { ok: false, error: (j && j.error) || 'unknown' };
        var arr = (j.products || j.items || []).map(function (p) {
          return {
            title: p.title || p.name || '', price: num(p.price || p.sellPrice || p.cost),
            currency: p.currency || j.currency || 'EUR', image: p.image || p.img || (p.images && p.images[0]) || '',
            url: p.url || p.link || '', sku: p.sku || p.id || ''
          };
        });
        return { ok: true, products: arr };
      })
      .catch(function () { return { ok: false, error: 'neterr' }; });
  }

  global.KDMCSourcing = {
    esc: esc, qs: qs, el: el, toast: toast, num: num,
    bootSSO: bootSSO, loginRedirect: loginRedirect, currentUser: function () { return _user; },
    /* Accès réservé admin (Kevin) + Lolo (Laurence). Zone PRIVÉE sans secret local :
       le nom auto-déclaré ne suffit JAMAIS (leçon #99) — on exige verified (Face ID).
       Pas de fail-open ici : si le SSO est injoignable, la porte renvoie au portail
       (re-connexion Face ID), ce n'est pas un lockout (aucun secret à taper). */
    isAllowed: function (u) {
      if (!u) return false;
      if (u.admin) return true;                 // admin prouvé serveur (verified)
      if (u.verified !== true) return false;    // nom seul = zéro accès
      var n = String(u.name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      return /kevin|desarzens|laurence|lolo|saint.?polit/.test(n);
    },
    fetchSelection: fetchSelection, addToSelection: addToSelection, removeFromSelection: removeFromSelection,
    selectionArray: selectionArray, isSelected: function (id) { return !!_selCache[id]; }, exportCsv: exportCsv,
    loadCatalog: loadCatalog, proxyBase: proxyBase, setProxyBase: setProxyBase,
    loadSuppliers: function () {
      return fetch('suppliers.json', { cache: 'no-store' }).then(function (r) { return r.json(); });
    }
  };

  /* Service Worker (network-first). Échec silencieux. */
  try {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
    }
  } catch (e) { /* */ }
})(window);
