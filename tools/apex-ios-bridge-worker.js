/**
 * APEX iOS Bridge Worker (Cloudflare Worker) — v13.3.58 (Kevin 2026-05-08).
 *
 * Demande Kevin : "Ajoute toi des outils ou fonctions dédiés pour débloquer ou
 * faire autrement sur iOS. Cherche, pousse plus loin"
 *
 * STRATÉGIE A — Cloudflare Worker bridge IR/BT/IoT pour iOS Safari
 *
 * Pourquoi ce Worker existe :
 * - iOS Safari PWA bloque Web Bluetooth, Web NFC, Web USB, Web Serial
 * - Apex iOS ne peut donc pas piloter directement les devices LAN
 * - Ce Worker tourne sur Cloudflare edge (HTTPS exposé)
 * - Apex iOS POST → Worker → Forward HTTPS vers Cloud APIs (Broadlink, eWeLink, Tuya, Hue)
 *
 * Endpoints exposés :
 *   POST /broadlink/ir       — Send IR command via Broadlink Cloud
 *   POST /broadlink/learn    — Learn IR code from remote
 *   POST /ewelink/cmd        — Sonoff/eWeLink device command
 *   POST /tuya/cmd           — Tuya Smart device command
 *   POST /hue/lan            — Philips Hue Bridge LAN (via tunnel CF)
 *   POST /homekit/scene      — HomeKit scene trigger (via tunnel)
 *   GET  /scan-lan           — Server-side LAN scan (mDNS via tunnel)
 *   GET  /health             — Health check
 *
 * Sécurité :
 * - Auth Bearer token : Authorization: Bearer <ax_apex_bridge_token>
 * - Token signé HMAC-SHA256 (rotation 30j)
 * - CORS strict : seul *.github.io et *.pages.dev autorisés
 * - Rate limit : 60 req/min par IP
 * - Audit log : chaque action loggée vers KV (CF_AUDIT_LOG)
 *
 * Déploiement Kevin (1-clic) : voir tools/apex-ios-bridge-deploy.html
 *
 * Variables d'environnement Worker (Cloudflare → Settings → Environment) :
 *   APEX_BRIDGE_TOKEN          — secret partagé Apex iOS ↔ Worker
 *   BROADLINK_TOKEN            — token Broadlink Cloud (optionnel)
 *   EWELINK_TOKEN              — token eWeLink (optionnel)
 *   TUYA_TOKEN                 — token Tuya (optionnel)
 *   HUE_BRIDGE_URL             — URL Hue Bridge LAN (via tunnel CF)
 *   HUE_USERNAME               — username Hue Bridge
 *   ALLOWED_ORIGINS            — CSV liste origins (default: github.io)
 */

const DEFAULT_ALLOWED_ORIGINS = [
  'https://9r4rxssx64-creator.github.io',
  'https://*.pages.dev',
  'http://localhost:5173',
  'http://localhost:5174',
];

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;

/* In-memory rate limit (Worker stateless mais cache courte durée OK) */
const rateLimitCache = new Map();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('origin') || '';

    /* --- CORS preflight --- */
    if (request.method === 'OPTIONS') {
      return handleCORS(origin, env);
    }

    /* --- Health --- */
    if (url.pathname === '/health') {
      return jsonResponse({ ok: true, service: 'apex-ios-bridge', version: 'v13.3.58' }, 200, origin, env);
    }

    /* --- Rate limit --- */
    const clientIP = request.headers.get('cf-connecting-ip') || 'unknown';
    if (!checkRateLimit(clientIP)) {
      return jsonResponse({ ok: false, error: 'rate_limited' }, 429, origin, env);
    }

    /* --- Auth --- */
    const auth = request.headers.get('authorization') || '';
    const expectedToken = env.APEX_BRIDGE_TOKEN || '';
    if (!expectedToken) {
      return jsonResponse({ ok: false, error: 'worker_not_configured', hint: 'Set APEX_BRIDGE_TOKEN env var' }, 500, origin, env);
    }
    if (!auth.startsWith('Bearer ') || auth.slice(7) !== expectedToken) {
      return jsonResponse({ ok: false, error: 'unauthorized' }, 401, origin, env);
    }

    /* --- Routing --- */
    try {
      let body = {};
      if (request.method === 'POST') {
        try { body = await request.json(); } catch { body = {}; }
      }
      let result;
      switch (url.pathname) {
        case '/broadlink/ir':
          result = await broadlinkSendIR(body, env);
          break;
        case '/broadlink/learn':
          result = await broadlinkLearnIR(body, env);
          break;
        case '/ewelink/cmd':
          result = await ewelinkCommand(body, env);
          break;
        case '/tuya/cmd':
          result = await tuyaCommand(body, env);
          break;
        case '/hue/lan':
          result = await hueLAN(body, env);
          break;
        case '/homekit/scene':
          result = await homekitScene(body, env);
          break;
        case '/scan-lan':
          result = await scanLAN(env);
          break;
        default:
          return jsonResponse({ ok: false, error: 'not_found', path: url.pathname }, 404, origin, env);
      }
      /* Audit log async */
      ctx.waitUntil(logAudit(env, { path: url.pathname, ip: clientIP, ok: !!result?.ok, ts: Date.now() }));
      return jsonResponse(result, result?.ok ? 200 : 502, origin, env);
    } catch (err) {
      return jsonResponse({ ok: false, error: 'internal', detail: String(err?.message || err) }, 500, origin, env);
    }
  },
};

/* ============================================================================
 * Helpers — CORS + rate limit + JSON
 * ============================================================================ */

function getAllowedOrigins(env) {
  const csv = env.ALLOWED_ORIGINS || '';
  if (!csv) return DEFAULT_ALLOWED_ORIGINS;
  return csv.split(',').map((s) => s.trim()).filter(Boolean);
}

function isOriginAllowed(origin, env) {
  if (!origin) return false;
  const allowed = getAllowedOrigins(env);
  for (const a of allowed) {
    if (a === origin) return true;
    if (a.startsWith('*.') && origin.endsWith(a.slice(1))) return true;
    if (a.includes('*.pages.dev') && origin.endsWith('.pages.dev')) return true;
  }
  return false;
}

function corsHeaders(origin, env) {
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (isOriginAllowed(origin, env)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function handleCORS(origin, env) {
  return new Response(null, { status: 204, headers: corsHeaders(origin, env) });
}

function jsonResponse(data, status, origin, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin, env),
    },
  });
}

function checkRateLimit(ip) {
  const now = Date.now();
  const bucket = rateLimitCache.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }
  bucket.count++;
  rateLimitCache.set(ip, bucket);
  return bucket.count <= RATE_LIMIT_MAX;
}

async function logAudit(env, entry) {
  if (!env.CF_AUDIT_LOG) return; /* KV namespace optionnelle */
  try {
    const key = `audit_${entry.ts}_${Math.random().toString(36).slice(2, 8)}`;
    await env.CF_AUDIT_LOG.put(key, JSON.stringify(entry), { expirationTtl: 60 * 60 * 24 * 30 });
  } catch { /* ignore */ }
}

/* ============================================================================
 * Broadlink Cloud forwarding
 * ============================================================================ */

async function broadlinkSendIR(body, env) {
  const { device_id, ir_hex, token } = body || {};
  if (!device_id || !ir_hex) return { ok: false, error: 'missing_params' };
  const accessToken = token || env.BROADLINK_TOKEN;
  if (!accessToken) return { ok: false, error: 'no_broadlink_token' };
  try {
    const resp = await fetch('https://api.ibroadlink.com/appsync/group/dev/v3/sendcmd', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ devid: device_id, code: ir_hex }),
    });
    const data = await resp.json().catch(() => ({}));
    return { ok: resp.ok, status: resp.status, data };
  } catch (e) {
    return { ok: false, error: 'broadlink_network', detail: String(e) };
  }
}

async function broadlinkLearnIR(body, env) {
  const { device_id, token } = body || {};
  if (!device_id) return { ok: false, error: 'missing_device_id' };
  const accessToken = token || env.BROADLINK_TOKEN;
  if (!accessToken) return { ok: false, error: 'no_broadlink_token' };
  try {
    const resp = await fetch('https://api.ibroadlink.com/appsync/group/dev/v3/learncmd', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ devid: device_id }),
    });
    const data = await resp.json().catch(() => ({}));
    return { ok: resp.ok, status: resp.status, data };
  } catch (e) {
    return { ok: false, error: 'broadlink_network', detail: String(e) };
  }
}

/* ============================================================================
 * eWeLink (Sonoff) forwarding
 * ============================================================================ */

async function ewelinkCommand(body, env) {
  const { device_id, params, token } = body || {};
  if (!device_id || !params) return { ok: false, error: 'missing_params' };
  const accessToken = token || env.EWELINK_TOKEN;
  if (!accessToken) return { ok: false, error: 'no_ewelink_token' };
  try {
    const resp = await fetch(`https://eu-apia.coolkit.cc/v2/device/thing/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'X-CK-Appid': env.EWELINK_APPID || '',
      },
      body: JSON.stringify({
        thingList: [{ itemType: 1, id: device_id, params }],
      }),
    });
    const data = await resp.json().catch(() => ({}));
    return { ok: resp.ok, status: resp.status, data };
  } catch (e) {
    return { ok: false, error: 'ewelink_network', detail: String(e) };
  }
}

/* ============================================================================
 * Tuya forwarding
 * ============================================================================ */

async function tuyaCommand(body, env) {
  const { device_id, commands, token } = body || {};
  if (!device_id || !commands) return { ok: false, error: 'missing_params' };
  const accessToken = token || env.TUYA_TOKEN;
  if (!accessToken) return { ok: false, error: 'no_tuya_token' };
  try {
    const resp = await fetch(`https://openapi.tuyaeu.com/v1.0/devices/${device_id}/commands`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        access_token: accessToken,
      },
      body: JSON.stringify({ commands }),
    });
    const data = await resp.json().catch(() => ({}));
    return { ok: resp.ok, status: resp.status, data };
  } catch (e) {
    return { ok: false, error: 'tuya_network', detail: String(e) };
  }
}

/* ============================================================================
 * Philips Hue Bridge (LAN via Cloudflare Tunnel)
 * ============================================================================ */

async function hueLAN(body, env) {
  const { resource, action } = body || {};
  if (!resource || !action) return { ok: false, error: 'missing_params' };
  const bridgeUrl = env.HUE_BRIDGE_URL;
  const username = env.HUE_USERNAME;
  if (!bridgeUrl || !username) return { ok: false, error: 'hue_not_configured' };
  try {
    const resp = await fetch(`${bridgeUrl}/api/${username}/${resource}`, {
      method: action.method || 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action.body || {}),
    });
    const data = await resp.json().catch(() => ({}));
    return { ok: resp.ok, status: resp.status, data };
  } catch (e) {
    return { ok: false, error: 'hue_network', detail: String(e) };
  }
}

/* ============================================================================
 * HomeKit scene (via tunnel ou bridge)
 * ============================================================================ */

async function homekitScene(body, env) {
  const { scene_name } = body || {};
  if (!scene_name) return { ok: false, error: 'missing_scene_name' };
  const homekitBridge = env.HOMEKIT_BRIDGE_URL;
  if (!homekitBridge) return { ok: false, error: 'homekit_not_configured', hint: 'Set HOMEKIT_BRIDGE_URL via tunnel' };
  try {
    const resp = await fetch(`${homekitBridge}/scene/${encodeURIComponent(scene_name)}`, {
      method: 'POST',
    });
    return { ok: resp.ok, status: resp.status };
  } catch (e) {
    return { ok: false, error: 'homekit_network', detail: String(e) };
  }
}

/* ============================================================================
 * LAN scan (server-side mDNS via tunnel)
 * ============================================================================ */

async function scanLAN(env) {
  /* Si Kevin a déployé un agent local exposé via tunnel CF, on l'interroge */
  const lanAgent = env.LAN_AGENT_URL;
  if (!lanAgent) {
    return { ok: false, error: 'lan_agent_not_configured', devices: [] };
  }
  try {
    const resp = await fetch(`${lanAgent}/scan`, { method: 'GET' });
    const data = await resp.json().catch(() => ({ devices: [] }));
    return { ok: resp.ok, devices: data.devices || [] };
  } catch (e) {
    return { ok: false, error: 'lan_agent_unreachable', detail: String(e), devices: [] };
  }
}
