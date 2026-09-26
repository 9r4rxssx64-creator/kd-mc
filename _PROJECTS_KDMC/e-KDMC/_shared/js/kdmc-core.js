/* KDMC Core — Shared utilities for all e-KDMC stores */
/* Version: 1.0.0 | Licence: Propriétaire KDMC */

"use strict";

/* ═══════════════════════════════════════════
   SÉCURITÉ
   ═══════════════════════════════════════════ */

function esc(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ═══════════════════════════════════════════
   TOAST NOTIFICATIONS
   ═══════════════════════════════════════════ */

var _toastTimer = null;
function toast(msg, type) {
  type = type || "success";
  var el = document.getElementById("kdmc-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "kdmc-toast";
    document.body.appendChild(el);
  }
  var icons = { success: "✅", error: "❌", warning: "⚠️", info: "ℹ️" };
  el.className = "kdmc-toast kdmc-toast--" + type + " kdmc-toast--show";
  el.innerHTML = '<span class="kdmc-toast__icon">' + (icons[type] || "") + '</span><span class="kdmc-toast__msg">' + esc(msg) + "</span>";
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function () {
    el.classList.remove("kdmc-toast--show");
  }, 3500);
}

/* ═══════════════════════════════════════════
   LOCAL STORAGE HELPERS
   ═══════════════════════════════════════════ */

function lsGet(key, fallback) {
  try {
    var v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch (e) {
    return fallback;
  }
}

function lsSet(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
    return true;
  } catch (e) {
    if (e.name === "QuotaExceededError") {
      toast("Stockage plein — veuillez vider le cache", "error");
    }
    return false;
  }
}

/* ═══════════════════════════════════════════
   CART MANAGEMENT
   ═══════════════════════════════════════════ */

function cartInit(storeKey) {
  return lsGet("kdmc_cart_" + storeKey, []);
}

function cartSave(storeKey, cart) {
  lsSet("kdmc_cart_" + storeKey, cart);
  cartUpdateBadge(cart);
}

function cartAdd(storeKey, cart, product, qty) {
  qty = qty || 1;
  var existing = cart.find(function (i) { return i.id === product.id; });
  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({ id: product.id, name: product.name, price: product.price, img: product.img, qty: qty });
  }
  cartSave(storeKey, cart);
  toast(esc(product.name) + " ajouté au panier", "success");
  return cart;
}

function cartRemove(storeKey, cart, productId) {
  cart = cart.filter(function (i) { return i.id !== productId; });
  cartSave(storeKey, cart);
  return cart;
}

function cartUpdateQty(storeKey, cart, productId, qty) {
  var item = cart.find(function (i) { return i.id === productId; });
  if (item) {
    item.qty = Math.max(1, qty);
  }
  cartSave(storeKey, cart);
  return cart;
}

function cartTotal(cart) {
  return cart.reduce(function (sum, i) { return sum + i.price * i.qty; }, 0);
}

function cartCount(cart) {
  return cart.reduce(function (sum, i) { return sum + i.qty; }, 0);
}

function cartUpdateBadge(cart) {
  var badge = document.getElementById("cart-badge");
  if (badge) {
    var count = cartCount(cart);
    badge.textContent = count;
    badge.style.display = count > 0 ? "flex" : "none";
  }
}

/* ═══════════════════════════════════════════
   PROMO CODES
   ═══════════════════════════════════════════ */

var PROMO_CODES = {
  BIENVENUE10: { discount: 0.10, type: "percent", label: "-10%", minOrder: 0 },
  KDMC20: { discount: 0.20, type: "percent", label: "-20%", minOrder: 50 },
  LIVRAISON: { discount: 4.99, type: "fixed", label: "-4.99€ livraison", minOrder: 30 },
  PREMIUM15: { discount: 0.15, type: "percent", label: "-15%", minOrder: 75 },
  FLASH25: { discount: 0.25, type: "percent", label: "-25% Flash", minOrder: 100 }
};

function applyPromo(code, subtotal) {
  var promo = PROMO_CODES[code.toUpperCase()];
  if (!promo) return { valid: false, msg: "Code promo invalide" };
  if (subtotal < promo.minOrder) return { valid: false, msg: "Commande minimum : " + promo.minOrder + "€" };
  var discount = promo.type === "percent" ? subtotal * promo.discount : promo.discount;
  return { valid: true, discount: Math.round(discount * 100) / 100, label: promo.label };
}

/* ═══════════════════════════════════════════
   CUSTOMER AUTH (localStorage based)
   ═══════════════════════════════════════════ */

function authInit(storeKey) {
  return lsGet("kdmc_user_" + storeKey, null);
}

function authSave(storeKey, user) {
  lsSet("kdmc_user_" + storeKey, user);
}

function authLogout(storeKey) {
  localStorage.removeItem("kdmc_user_" + storeKey);
}

/* ═══════════════════════════════════════════
   PRODUCT HELPERS
   ═══════════════════════════════════════════ */

function filterProducts(products, filters, search) {
  var results = products.slice();
  if (filters.cat && filters.cat !== "all") {
    results = results.filter(function (p) { return p.cat === filters.cat; });
  }
  if (filters.priceMin > 0) {
    results = results.filter(function (p) { return p.price >= filters.priceMin; });
  }
  if (filters.priceMax < 999) {
    results = results.filter(function (p) { return p.price <= filters.priceMax; });
  }
  if (filters.brand && filters.brand !== "all") {
    results = results.filter(function (p) { return p.brand === filters.brand; });
  }
  if (search && search.length > 1) {
    var q = search.toLowerCase();
    results = results.filter(function (p) {
      return p.name.toLowerCase().indexOf(q) !== -1 || p.desc.toLowerCase().indexOf(q) !== -1 || (p.tags && p.tags.join(" ").toLowerCase().indexOf(q) !== -1);
    });
  }
  switch (filters.sort) {
    case "price-asc": results.sort(function (a, b) { return a.price - b.price; }); break;
    case "price-desc": results.sort(function (a, b) { return b.price - a.price; }); break;
    case "rating": results.sort(function (a, b) { return b.rating - a.rating; }); break;
    case "newest": results.sort(function (a, b) { return (b.id > a.id ? 1 : -1); }); break;
    case "popular": default: results.sort(function (a, b) { return b.reviews - a.reviews; }); break;
  }
  return results;
}

function paginate(items, page, perPage) {
  var start = (page - 1) * perPage;
  return {
    items: items.slice(start, start + perPage),
    total: items.length,
    pages: Math.ceil(items.length / perPage),
    page: page
  };
}

function renderStars(rating) {
  var full = Math.floor(rating);
  var half = rating % 1 >= 0.3;
  var html = "";
  for (var i = 0; i < full; i++) html += "★";
  if (half) html += "½";
  for (var j = full + (half ? 1 : 0); j < 5; j++) html += "☆";
  return '<span class="kdmc-stars" title="' + rating + '/5">' + html + "</span>";
}

function formatPrice(price) {
  return price.toFixed(2).replace(".", ",") + " €";
}

function discountPercent(orig, current) {
  if (!orig || orig <= current) return 0;
  return Math.round((1 - current / orig) * 100);
}

/* ═══════════════════════════════════════════
   ANALYTICS (GA4 wrapper)
   ═══════════════════════════════════════════ */

function trackEvent(name, params) {
  if (typeof gtag === "function") {
    gtag("event", name, params || {});
  }
}

/* ═══════════════════════════════════════════
   SEO HELPERS
   ═══════════════════════════════════════════ */

function setPageMeta(title, description) {
  document.title = title;
  var metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute("content", description);
}

function injectJsonLd(data) {
  var existing = document.getElementById("kdmc-jsonld");
  if (existing) existing.remove();
  var script = document.createElement("script");
  script.id = "kdmc-jsonld";
  script.type = "application/ld+json";
  script.textContent = JSON.stringify(data);
  document.head.appendChild(script);
}

/* ═══════════════════════════════════════════
   NEWSLETTER
   ═══════════════════════════════════════════ */

function subscribeNewsletter(email, storeId) {
  if (!email || email.indexOf("@") === -1) {
    toast("Adresse email invalide", "error");
    return false;
  }
  trackEvent("newsletter_signup", { store: storeId, email: email });
  toast("Bienvenue ! Vérifiez vos emails pour confirmer 📧", "success");
  return true;
}

/* ═══════════════════════════════════════════
   COOKIE CONSENT
   ═══════════════════════════════════════════ */

function cookieConsentInit() {
  if (lsGet("kdmc_cookie_consent", false)) return;
  var banner = document.createElement("div");
  banner.id = "cookie-banner";
  banner.className = "kdmc-cookie-banner";
  banner.innerHTML = '<div class="kdmc-cookie-banner__text">' +
    "🍪 Ce site utilise des cookies pour améliorer votre expérience. " +
    '<a href="#" onclick="sv(\'privacy\');return false;">En savoir plus</a>' +
    "</div>" +
    '<div class="kdmc-cookie-banner__actions">' +
    '<button onclick="cookieAccept()" class="kdmc-btn kdmc-btn--primary">✅ Accepter</button>' +
    '<button onclick="cookieRefuse()" class="kdmc-btn kdmc-btn--ghost">Refuser</button>' +
    "</div>";
  document.body.appendChild(banner);
}

function cookieAccept() {
  lsSet("kdmc_cookie_consent", true);
  var b = document.getElementById("cookie-banner");
  if (b) b.remove();
  trackEvent("cookie_consent", { action: "accept" });
}

function cookieRefuse() {
  lsSet("kdmc_cookie_consent", false);
  var b = document.getElementById("cookie-banner");
  if (b) b.remove();
}

/* ═══════════════════════════════════════════
   UTILITY
   ═══════════════════════════════════════════ */

function debounce(fn, ms) {
  var timer;
  return function () {
    var ctx = this, args = arguments;
    clearTimeout(timer);
    timer = setTimeout(function () { fn.apply(ctx, args); }, ms);
  };
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function timeAgo(ts) {
  var diff = Date.now() - ts;
  var mins = Math.floor(diff / 60000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return mins + " min";
  var hours = Math.floor(mins / 60);
  if (hours < 24) return hours + "h";
  var days = Math.floor(hours / 24);
  if (days < 30) return days + "j";
  return Math.floor(days / 30) + " mois";
}

function generateOrderId() {
  return "KDMC-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
}
