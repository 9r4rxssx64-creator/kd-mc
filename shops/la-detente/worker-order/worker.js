/* La Détente — Worker de commande Printify (white-label, sécurisé).
   Détient PRINTIFY_API_KEY (secret CF). Reçoit une commande de la boutique,
   résout blueprint→provider→variant en live, et crée la commande Printify
   (statut "on-hold" : Kevin valide/paie dans Printify — pas de débit auto).
   Auth : Origin allowlist + header x-ld-app. */
const SHOP_ID = 27791653;
const API = 'https://api.printify.com/v1';
const FIREBASE_URL = 'https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app';
const PUSH_SUB_PATH = '/ld_detente/push_sub.json';
const IMG_BASE = 'https://9r4rxssx64-creator.github.io/CMCteams/shops/la-detente/img/designs/';
/* v2026-07-08 (audit amélioration Top #10) : le domaine réel kd-mc.com MANQUAIT de
   l'allowlist → depuis chez-lolo.kd-mc.com / la-detente.kd-mc.com le préflight CORS
   renvoyait l'origin github.io → navigateur bloquait /order ET /shipping (bug prod). */
const ALLOW = ['https://9r4rxssx64-creator.github.io', 'https://chez-lolo.kd-mc.com', 'https://la-detente.kd-mc.com', 'https://kd-mc.com', 'http://localhost:8080', 'http://127.0.0.1:8080'];
const APP_TAG = 'ld-order-v1';

/* Rate-limit anti-spam/coût (gratuit, sans KV). Fenêtre glissante en mémoire
   d'isolat — best-effort (réinitialisé au recyclage), pour une garantie dure
   inter-isolats brancher un KV plus tard (cf. KEVIN_ACTIONS_TODO). */
const _hits = new Map();
function rl(key, max, windowMs) {
  const now = Date.now();
  let arr = (_hits.get(key) || []).filter(t => now - t < windowMs);
  if (arr.length >= max) { _hits.set(key, arr); return true; }
  arr.push(now); _hits.set(key, arr);
  if (_hits.size > 5000) for (const [k, v] of _hits) { if (!v.length || now - v[v.length - 1] > windowMs) _hits.delete(k); }
  return false;
}

const GARMENT_BP = { tee: 6, hoodie: 77, cap: 5383, polo: null, tote: 1313 };
const COLOR_FR2EN = { 'Noir': 'Black', 'Blanc': 'White', 'Marine': 'Navy', 'Kaki': 'Military Green', 'Ardoise': 'Dark Heather', 'Bordeaux': 'Maroon', 'Anthracite': 'Black', 'Sable': 'Sand', 'Vert': 'Forest Green' };
const COUNTRY_ISO = { 'france': 'FR', 'monaco': 'MC', 'belgique': 'BE', 'belgium': 'BE', 'suisse': 'CH', 'switzerland': 'CH', 'luxembourg': 'LU', 'espagne': 'ES', 'spain': 'ES', 'italie': 'IT', 'italy': 'IT', 'allemagne': 'DE', 'germany': 'DE', 'royaume-uni': 'GB', 'uk': 'GB' };

function cors(origin) {
  const ok = ALLOW.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : ALLOW[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-ld-app',
    'Content-Type': 'application/json'
  };
}
function J(obj, status, origin) { return new Response(JSON.stringify(obj), { status: status || 200, headers: cors(origin) }); }
function isoCountry(c) { return COUNTRY_ISO[String(c || '').toLowerCase().trim()] || 'FR'; }

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors(origin) });
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/') {
      return J({ ok: true, service: 'ld-printify-order', shop_id: SHOP_ID }, 200, origin);
    }
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    // COÛT RÉEL : crée un produit-sonde, lit le cost réel, le supprime (appel Printify coûteux)
    if (request.method === 'GET' && url.pathname === '/cost') {
      if (rl('cost:' + ip, 10, 60000)) return J({ ok: false, detail: 'Trop de requêtes, patiente une minute', retryAfter: 60 }, 429, origin);
      const KEY = env.PRINTIFY_API_KEY;
      if (!KEY) return J({ ok: false, detail: 'clé serveur absente' }, 500, origin);
      const bp = parseInt(url.searchParams.get('bp') || '0', 10);
      if (!bp) return J({ ok: false, detail: 'paramètre bp manquant' }, 400, origin);
      const H = { 'Authorization': 'Bearer ' + KEY, 'User-Agent': 'LaDetente-KDMC/1.0', 'Content-Type': 'application/json' };
      try {
        const pr = await fetch(`${API}/catalog/blueprints/${bp}/print_providers.json`, { headers: H });
        if (!pr.ok) return J({ ok: false, detail: 'providers HTTP ' + pr.status, where: 'providers' }, 502, origin);
        const providers = await pr.json();
        if (!providers.length) return J({ ok: false, detail: 'aucun print provider pour ce produit' }, 422, origin);
        const pp = providers[0].id;
        const vr = await fetch(`${API}/catalog/blueprints/${bp}/print_providers/${pp}/variants.json`, { headers: H });
        if (!vr.ok) return J({ ok: false, detail: 'variants HTTP ' + vr.status, where: 'variants' }, 502, origin);
        const variants = (await vr.json()).variants || [];
        if (!variants.length) return J({ ok: false, detail: 'aucune variante' }, 422, origin);
        let imgId = null;
        try {
          const up = await fetch(`${API}/uploads/images.json`, { method: 'POST', headers: H, body: JSON.stringify({ file_name: 'ld-probe.png', url: IMG_BASE + 'crest.png' }) });
          if (up.ok) { const uj = await up.json(); imgId = uj.id; }
        } catch (_) {}
        const vids = variants.map(v => v.id);
        const body = {
          title: 'LD cost probe ' + bp, description: 'probe', blueprint_id: bp, print_provider_id: pp,
          variants: variants.map(v => ({ id: v.id, price: 2000, is_enabled: true })),
          print_areas: imgId ? [{ variant_ids: vids, placeholders: [{ position: 'front', images: [{ id: imgId, x: 0.5, y: 0.5, scale: 1, angle: 0 }] }] }] : []
        };
        const cr = await fetch(`${API}/shops/${SHOP_ID}/products.json`, { method: 'POST', headers: H, body: JSON.stringify(body) });
        const ctxt = await cr.text();
        if (!cr.ok) return J({ ok: false, detail: 'création produit-sonde HTTP ' + cr.status + ' : ' + ctxt.slice(0, 300), where: 'create' }, 502, origin);
        let prod; try { prod = JSON.parse(ctxt); } catch (_) { prod = {}; }
        const costs = (prod.variants || []).map(v => v.cost).filter(c => typeof c === 'number' && c > 0);
        if (prod.id) { try { await fetch(`${API}/shops/${SHOP_ID}/products/${prod.id}.json`, { method: 'DELETE', headers: H }); } catch (_) {} }
        if (!costs.length) return J({ ok: false, detail: 'coût absent de la réponse produit', where: 'cost' }, 502, origin);
        return J({ ok: true, blueprint_id: bp, print_provider_id: pp, min_cost: Math.min(...costs) / 100, max_cost: Math.max(...costs) / 100, currency: 'shop' }, 200, origin);
      } catch (e) { return J({ ok: false, detail: String(e && e.message || e), where: 'exception' }, 500, origin); }
    }
    // PORT RÉEL : tarif de livraison Printify pour un produit + pays
    if (request.method === 'GET' && url.pathname === '/shipping') {
      const KEY = env.PRINTIFY_API_KEY;
      if (!KEY) return J({ ok: false, detail: 'clé serveur absente' }, 500, origin);
      const bp = parseInt(url.searchParams.get('bp') || '0', 10);
      const country = (url.searchParams.get('country') || 'FR').toUpperCase();
      if (!bp) return J({ ok: false, detail: 'paramètre bp manquant' }, 400, origin);
      const H = { 'Authorization': 'Bearer ' + KEY, 'User-Agent': 'LaDetente-KDMC/1.0' };
      try {
        const pr = await fetch(`${API}/catalog/blueprints/${bp}/print_providers.json`, { headers: H });
        if (!pr.ok) return J({ ok: false, detail: 'providers HTTP ' + pr.status }, 502, origin);
        const providers = await pr.json();
        if (!providers.length) return J({ ok: false, detail: 'aucun provider' }, 422, origin);
        const pp = providers[0].id;
        const sh = await fetch(`${API}/catalog/blueprints/${bp}/print_providers/${pp}/shipping.json`, { headers: H });
        if (!sh.ok) return J({ ok: false, detail: 'shipping HTTP ' + sh.status }, 502, origin);
        const data = await sh.json();
        const profiles = data.profiles || [];
        function pick(cc) { return profiles.find(p => (p.countries || []).includes(cc)); }
        const prof = pick(country) || pick('REST_OF_THE_WORLD') || profiles[0];
        if (!prof) return J({ ok: false, detail: 'aucun profil de livraison' }, 502, origin);
        const first = prof.first_item ? prof.first_item.cost / 100 : null;
        const add = prof.additional_items ? prof.additional_items.cost / 100 : null;
        return J({ ok: true, blueprint_id: bp, country, first_item: first, additional_item: add, currency: (prof.first_item && prof.first_item.currency) || 'EUR' }, 200, origin);
      } catch (e) { return J({ ok: false, detail: String(e && e.message || e), where: 'exception' }, 500, origin); }
    }
    // TEST ALERTE : envoie une notif push de test à l'admin abonné
    if (request.method === 'GET' && url.pathname === '/push-test') {
      try {
        const n = await sendOrderPush(env, '🔔 Test alerte La Détente', 'Si tu vois cette notification, les alertes commande fonctionnent ✅');
        return J({ ok: n > 0, sent: n, detail: n > 0 ? 'push envoyé' : 'aucun abonnement (active les alertes d\'abord) ou clés VAPID manquantes' }, 200, origin);
      } catch (e) { return J({ ok: false, detail: String(e && e.message || e) }, 500, origin); }
    }
    // ALERTE IMPORTANTE : la boutique signale une erreur critique → push sur le tél admin.
    // En plus de l'email côté front. Sécurisé (origin allowlist + x-ld-app) + rate-limit anti-spam.
    if (request.method === 'POST' && url.pathname === '/alert') {
      if (!ALLOW.includes(origin)) return J({ ok: false, detail: 'origin refusée' }, 403, origin);
      if (request.headers.get('x-ld-app') !== APP_TAG) return J({ ok: false, detail: 'app tag invalide' }, 403, origin);
      if (rl('alert:' + ip, 6, 300000) || rl('alert:global', 12, 3600000)) return J({ ok: false, detail: 'trop d\'alertes, throttle', retryAfter: 300 }, 429, origin);
      let ab; try { ab = await request.json(); } catch (_) { return J({ ok: false, detail: 'json invalide' }, 400, origin); }
      const title = String(ab.title || '⚠️ Alerte La Détente').slice(0, 80);
      const bodyTxt = String(ab.body || 'Erreur signalée sur la boutique').slice(0, 300);
      const aurl = /^https?:\/\//.test(ab.url || '') ? String(ab.url).slice(0, 300) : undefined;
      try {
        const n = await sendOrderPush(env, title, bodyTxt, aurl, { tag: 'ld-alert' });
        return J({ ok: n > 0, sent: n, detail: n > 0 ? 'alerte push envoyée' : 'aucun abonnement push (active les alertes) ou clés VAPID manquantes' }, 200, origin);
      } catch (e) { return J({ ok: false, detail: String(e && e.message || e) }, 500, origin); }
    }
    // VALIDER (Kevin « bouton valider auto ») : envoie une commande on-hold en PRODUCTION
    // Printify = validation/paiement réel. Auth : Origin allowlist + x-ld-app (comme /order).
    if (request.method === 'POST' && url.pathname === '/validate') {
      if (!ALLOW.includes(origin)) return J({ ok: false, detail: 'origin refusée' }, 403, origin);
      if (request.headers.get('x-ld-app') !== APP_TAG) return J({ ok: false, detail: 'app tag invalide' }, 403, origin);
      if (rl('validate:' + ip, 10, 300000)) return J({ ok: false, detail: 'trop de validations, patiente quelques minutes', retryAfter: 300 }, 429, origin);
      const KEY = env.PRINTIFY_API_KEY;
      if (!KEY) return J({ ok: false, detail: 'clé serveur absente' }, 500, origin);
      let vb; try { vb = await request.json(); } catch (_) { return J({ ok: false, detail: 'json invalide' }, 400, origin); }
      const oid = String(vb.order_id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
      if (!oid) return J({ ok: false, detail: 'order_id manquant' }, 400, origin);
      const H = { 'Authorization': 'Bearer ' + KEY, 'User-Agent': 'LaDetente-KDMC/1.0', 'Content-Type': 'application/json' };
      try {
        const r = await fetch(`${API}/shops/${SHOP_ID}/orders/${oid}/send_to_production.json`, { method: 'POST', headers: H });
        const txt = await r.text();
        if (!r.ok) return J({ ok: false, detail: 'Printify HTTP ' + r.status + ' : ' + txt.slice(0, 300) }, 502, origin);
        return J({ ok: true, order_id: oid, detail: 'commande envoyée en production' }, 200, origin);
      } catch (e) { return J({ ok: false, detail: String(e && e.message || e) }, 500, origin); }
    }
    if (request.method !== 'POST' || url.pathname !== '/order') return J({ ok: false, detail: 'not found' }, 404, origin);
    if (!ALLOW.includes(origin)) return J({ ok: false, detail: 'origin refusée' }, 403, origin);
    if (request.headers.get('x-ld-app') !== APP_TAG) return J({ ok: false, detail: 'app tag invalide' }, 403, origin);
    // Anti-spam commandes : 5 par 5 min et par IP + plafond global 30/5 min.
    if (rl('order:' + ip, 5, 300000)) return J({ ok: false, detail: 'Trop de commandes en peu de temps, patiente quelques minutes', retryAfter: 300 }, 429, origin);
    if (rl('order:global', 30, 300000)) return J({ ok: false, detail: 'Service occupé, réessaie dans quelques minutes', retryAfter: 300 }, 429, origin);
    // Content-Type strict (rejette les POST hors application/json)
    if (!String(request.headers.get('content-type') || '').includes('application/json')) return J({ ok: false, detail: 'content-type application/json requis' }, 415, origin);
    const KEY = env.PRINTIFY_API_KEY;
    if (!KEY) return J({ ok: false, detail: 'clé serveur absente' }, 500, origin);
    const H = { 'Authorization': 'Bearer ' + KEY, 'User-Agent': 'LaDetente-KDMC/1.0', 'Content-Type': 'application/json' };

    let body; try { body = await request.json(); } catch (_) { return J({ ok: false, detail: 'json invalide' }, 400, origin); }
    const items = Array.isArray(body.items) ? body.items : [];
    const a = body.address || {};
    if (!items.length) return J({ ok: false, detail: 'panier vide' }, 400, origin);
    if (!a.name || !a.addr || !a.zip || !a.city) return J({ ok: false, detail: 'adresse incomplète' }, 400, origin);

    // Résolution variantes (cache par blueprint pendant la requête)
    const cache = {};
    async function resolve(bp) {
      if (cache[bp]) return cache[bp];
      const pr = await fetch(`${API}/catalog/blueprints/${bp}/print_providers.json`, { headers: H });
      if (!pr.ok) throw new Error('providers ' + bp + ' HTTP ' + pr.status);
      const providers = await pr.json();
      if (!providers.length) throw new Error('aucun provider pour ' + bp);
      const pp = providers[0].id;
      const vr = await fetch(`${API}/catalog/blueprints/${bp}/print_providers/${pp}/variants.json`, { headers: H });
      if (!vr.ok) throw new Error('variants ' + bp + ' HTTP ' + vr.status);
      const variants = (await vr.json()).variants || [];
      cache[bp] = { pp, variants };
      return cache[bp];
    }
    function pickVariant(variants, colorEn, size) {
      const norm = s => String(s || '').toLowerCase();
      const sz = norm(size) === 'xxl' ? '2xl' : norm(size);
      function opt(v, k) { const o = v.options || {}; return norm(o[k] || o[k[0].toUpperCase() + k.slice(1)] || ''); }
      function matchTitle(v) { return norm(v.title); }
      // 1) couleur + taille
      let hit = variants.find(v => (opt(v, 'color').includes(norm(colorEn)) || matchTitle(v).includes(norm(colorEn))) && (opt(v, 'size') === sz || matchTitle(v).includes('/ ' + sz) || matchTitle(v).endsWith(sz)));
      // 2) Black + taille
      if (!hit) hit = variants.find(v => (opt(v, 'color').includes('black') || matchTitle(v).includes('black')) && (opt(v, 'size') === sz || matchTitle(v).endsWith(sz)));
      // 3) n'importe quelle taille
      if (!hit) hit = variants.find(v => opt(v, 'size') === sz || matchTitle(v).endsWith(sz));
      // 4) premier dispo
      if (!hit) hit = variants[0];
      return hit;
    }

    // Upload base64 → Printify (logos perso), retourne une URL hébergée utilisable en print_areas
    const upCache = {};
    async function designSrc(it, design) {
      const dd = it.design_data || '';
      if (/^data:image\//.test(dd)) {
        const key = design || dd.slice(0, 40);
        if (upCache[key]) return upCache[key];
        const b64 = dd.split(',')[1] || '';
        const ur = await fetch(`${API}/uploads/images.json`, { method: 'POST', headers: H, body: JSON.stringify({ file_name: (design || 'logo') + '.png', contents: b64 }) });
        if (ur.ok) { const uj = await ur.json(); const src = uj.preview_url || uj.id; upCache[key] = src; return src; }
        warnings.push('upload base64 KO (' + ur.status + ')');
      }
      return IMG_BASE + design + '.png';
    }
    const lineItems = [];
    const warnings = [];
    for (const it of items) {
      const bp = it.blueprint_id || GARMENT_BP[it.garment] || GARMENT_BP.tee;
      const design = String(it.design || 'crest').replace(/[^a-z0-9-]/gi, '');
      const colorEn = COLOR_FR2EN[it.color] || it.color || 'Black';
      try {
        const { pp, variants } = await resolve(bp);
        const v = pickVariant(variants, colorEn, it.size || 'M');
        if (!v) { warnings.push('variante introuvable ' + bp); continue; }
        const src = await designSrc(it, design);
        lineItems.push({
          print_provider_id: pp, blueprint_id: bp, variant_id: v.id,
          print_areas: { front: src },
          quantity: Math.max(1, it.quantity || 1)
        });
      } catch (e) { warnings.push(e.message); }
    }
    if (!lineItems.length) return J({ ok: false, detail: 'aucune ligne résolue', warnings }, 422, origin);

    const tokens = String(a.name || '').trim().split(/\s+/);
    const first = tokens[0] || 'Client';
    const last = tokens.slice(1).join(' ') || 'La Détente';
    const orderBody = {
      external_id: String(body.orderId || ((body.shopPrefix || 'LD') + '-' + Date.now())).slice(0, 40),
      label: (body.label || ('La Détente ' + (body.orderId || ''))).slice(0, 80),
      line_items: lineItems,
      shipping_method: 1,
      is_printify_express: false,
      send_shipping_notification: false,
      address_to: {
        first_name: first, last_name: last,
        email: String(a.email || '').slice(0, 120),
        phone: String(a.phone || '').slice(0, 30),
        country: isoCountry(a.country), region: '',
        address1: String(a.addr || '').slice(0, 120), address2: '',
        city: String(a.city || '').slice(0, 60), zip: String(a.zip || '').slice(0, 16)
      }
    };
    const r = await fetch(`${API}/shops/${SHOP_ID}/orders.json`, { method: 'POST', headers: H, body: JSON.stringify(orderBody) });
    const txt = await r.text();
    if (!r.ok) return J({ ok: false, detail: 'Printify HTTP ' + r.status + ' : ' + txt.slice(0, 300), warnings }, 502, origin);
    let pj; try { pj = JSON.parse(txt); } catch (_) { pj = {}; }
    // 🔔 Alerte push admin (best-effort, ne bloque pas la commande)
    // Kevin « notif, 1 clic + tous les renseignements + va plus loin » : titre = boutique +
    // n° commande ; corps = client + ville + nb articles + total + paiement + détail articles.
    // 1-TAP = ouvre la commande DIRECTEMENT dans Printify pour la VALIDER/PAYER (statut on-hold).
    // 2e bouton « 🏪 Boutique » = admin boutique (déverrouillé auto via Face ID).
    try {
      const tot = body.total ? (' — ' + body.total + ' €') : '';
      const ordTxt = body.orderId ? (' · #' + String(body.orderId)) : '';
      const cityTxt = a.city ? (' · ' + a.city) : '';
      const payTxt = body.method ? (' · ' + body.method) : '';
      const itemsTxt = items.map((it) => (it.name || it.garment || 'article') + ' ×' + (it.quantity || it.qty || 1)).join(', ').slice(0, 140);
      // Lien direct vers la commande Printify (à valider/payer). Si l'id manque → liste des commandes.
      const printifyUrl = pj.id
        ? ('https://printify.com/app/orders/' + encodeURIComponent(String(pj.id)))
        : 'https://printify.com/app/orders';
      // Photo produit (1ère ligne) dans la notif + bouton « ✅ Valider & produire » (1-tap →
      // /validate → send_to_production = paiement/production réel). 2e bouton « 🏪 Boutique ».
      const firstImg = (lineItems[0] && lineItems[0].print_areas && lineItems[0].print_areas.front) || '';
      const validateUrl = url.origin + '/validate';
      const extra = {
        admin_url: body.pushUrl || 'https://9r4rxssx64-creator.github.io/CMCteams/shops/la-detente/index.html?ld_admin=1',
        validate_url: validateUrl,
        printify_order_id: pj.id || null,
        actions: pj.id
          ? [{ action: 'validate', title: '✅ Valider & produire' }, { action: 'admin', title: '🏪 Boutique' }]
          : [{ action: 'admin', title: '🏪 Boutique' }],
      };
      if (firstImg) extra.image = firstImg;
      await sendOrderPush(
        env,
        (body.shopName || 'La Détente') + ' — 🛍️ Nouvelle commande' + ordTxt,
        (a.name || 'Client') + cityTxt + ' · ' + lineItems.length + ' art.' + tot + payTxt + (itemsTxt ? ('\n' + itemsTxt) : '') + '\n→ Tape pour VALIDER/PAYER dans Printify',
        printifyUrl,
        extra,
      );
    } catch (_) {}
    // Statut "on-hold" : Kevin valide/paie. (Pas d'envoi auto en production.)
    return J({ ok: true, printify_order_id: pj.id || null, lines: lineItems.length, warnings, status: 'on-hold (à valider)' }, 200, origin);
  }
};

/* ===================== WEB PUSH (VAPID, aes128gcm) ===================== */
async function fbGetSub() {
  try {
    const r = await fetch(FIREBASE_URL + PUSH_SUB_PATH);
    if (!r.ok) return null;
    return await r.json();
  } catch (_) { return null; }
}
async function sendOrderPush(env, title, bodyTxt, url, extra) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return 0;
  const sub = await fbGetSub();
  if (!sub || !sub.endpoint || !sub.keys) return 0;
  const payload = Object.assign(
    { title: title, body: bodyTxt, url: url || 'https://9r4rxssx64-creator.github.io/CMCteams/shops/la-detente/index.html?ld_admin=1', tag: 'ld-order' },
    extra || {},
  );
  try { await sendOnePush(env, sub, payload); return 1; } catch (_) { return 0; }
}
async function sendOnePush(env, subscription, payload) {
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const endpointUrl = new URL(subscription.endpoint);
  const jwt = await buildVapidJwt(env, endpointUrl.origin);
  const encrypted = await encryptPayload(payloadBytes, subscription.keys);
  const vapidPubB64 = base64urlEncode(base64urlDecode(env.VAPID_PUBLIC_KEY));
  const headers = {
    'Content-Type': 'application/octet-stream',
    'Content-Encoding': 'aes128gcm',
    'TTL': '86400',
    'Authorization': `vapid t=${jwt}, k=${vapidPubB64}`,
    'Urgency': 'high'
  };
  const r = await fetch(subscription.endpoint, { method: 'POST', headers, body: encrypted });
  return r.status;
}
async function buildVapidJwt(env, audience) {
  const header = { typ: 'JWT', alg: 'ES256' };
  const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60;
  const payload = { aud: audience, exp, sub: 'mailto:' + (env.VAPID_EMAIL || 'desarzens.kevin@gmail.com') };
  const headerB64 = base64urlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = base64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const unsigned = headerB64 + '.' + payloadB64;
  const privKey = await importVapidPrivateKey(env.VAPID_PRIVATE_KEY, env.VAPID_PUBLIC_KEY);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: { name: 'SHA-256' } }, privKey, new TextEncoder().encode(unsigned));
  return unsigned + '.' + base64urlEncode(new Uint8Array(sig));
}
async function importVapidPrivateKey(privB64, pubB64) {
  const d = base64urlDecode(privB64);
  const pub = base64urlDecode(pubB64);
  if (pub.length !== 65 || pub[0] !== 0x04) throw new Error('VAPID public key must be uncompressed (65 bytes, starts 0x04)');
  if (d.length !== 32) throw new Error('VAPID private key must be 32 bytes raw');
  const jwk = { kty: 'EC', crv: 'P-256', d: base64urlEncode(d), x: base64urlEncode(pub.slice(1, 33)), y: base64urlEncode(pub.slice(33, 65)), ext: true };
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}
async function encryptPayload(plaintext, subKeys) {
  const clientPubBytes = base64urlDecode(subKeys.p256dh);
  const authSecret = base64urlDecode(subKeys.auth);
  const localKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const localPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', localKeys.publicKey));
  const clientPubKey = await crypto.subtle.importKey('raw', clientPubBytes, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: clientPubKey }, localKeys.privateKey, 256));
  const keyInfo = concat(new TextEncoder().encode('WebPush: info\0'), clientPubBytes, localPubRaw);
  const ikm = await hkdf(authSecret, sharedSecret, keyInfo, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, new TextEncoder().encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, new TextEncoder().encode('Content-Encoding: nonce\0'), 12);
  const padded = new Uint8Array(plaintext.length + 1);
  padded.set(plaintext, 0); padded[plaintext.length] = 0x02;
  const cekKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM', length: 128 }, false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cekKey, padded));
  const rs = new Uint8Array(4); new DataView(rs.buffer).setUint32(0, 4096, false);
  return concat(salt, rs, new Uint8Array([localPubRaw.length]), localPubRaw, cipher);
}
async function hkdf(salt, ikm, info, length) {
  const saltKey = await crypto.subtle.importKey('raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const prk = new Uint8Array(await crypto.subtle.sign('HMAC', saltKey, ikm));
  const prkKey = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const t1Input = new Uint8Array(info.length + 1); t1Input.set(info, 0); t1Input[info.length] = 0x01;
  const t1 = new Uint8Array(await crypto.subtle.sign('HMAC', prkKey, t1Input));
  return t1.slice(0, length);
}
function concat(...arrays) { let total = 0; for (const a of arrays) total += a.length; const out = new Uint8Array(total); let off = 0; for (const a of arrays) { out.set(a, off); off += a.length; } return out; }
function base64urlEncode(bytes) { return btoa(String.fromCharCode.apply(null, bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function base64urlDecode(str) { const s = String(str || '').replace(/-/g, '+').replace(/_/g, '/'); const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4)); const bin = atob(s + pad); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
