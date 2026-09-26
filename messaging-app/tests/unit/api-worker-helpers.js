/**
 * Helpers partagés pour tests api-worker.js
 * Mocks Cloudflare bindings : D1, KV, R2, Queues, AI, DO namespace, JWT.
 */
import { vi } from 'vitest';

export const SECRET = 'jwt-test-secret';

/** Crée une "stmt" D1 qui répond selon la SQL via dispatch table */
export function makeStmt(sql, dispatch = {}) {
  const stmt = {
    sql,
    _args: [],
    bind(...args) { this._args = args; return this; },
    async first() {
      const fn = dispatch.first;
      if (typeof fn === 'function') return fn(sql, this._args);
      return fn ?? null;
    },
    async all() {
      const fn = dispatch.all;
      if (typeof fn === 'function') return fn(sql, this._args);
      return fn ?? { results: [] };
    },
    async run() {
      const fn = dispatch.run;
      if (typeof fn === 'function') return fn(sql, this._args);
      return fn ?? { success: true, meta: { changes: 1 } };
    },
  };
  return stmt;
}

/** D1 mock générique avec dispatch SQL → handlers */
export function makeDB(handlers = {}) {
  return {
    _calls: [],
    prepare: vi.fn(function (sql) {
      this._calls.push(sql);
      const dispatch = {};
      // Recherche dans handlers : la 1ère key qui matche en includes()
      for (const [pattern, h] of Object.entries(handlers)) {
        if (sql.includes(pattern)) {
          Object.assign(dispatch, typeof h === 'function' ? { first: h } : h);
          break;
        }
      }
      return makeStmt(sql, dispatch);
    }),
    batch: vi.fn(async (stmts) => ({ success: true, count: stmts.length })),
  };
}

export function makeKV(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    _store: store,
    get: vi.fn(async (k, type) => {
      const v = store.get(k);
      if (v === undefined) return null;
      return type === 'json' && typeof v === 'string' ? JSON.parse(v) : v;
    }),
    put: vi.fn(async (k, v) => { store.set(k, v); }),
    delete: vi.fn(async (k) => store.delete(k)),
    list: vi.fn(async () => ({ keys: [...store.keys()].map((name) => ({ name })) })),
  };
}

export function makeR2() {
  const store = new Map();
  return {
    _store: store,
    put: vi.fn(async (k, v) => { store.set(k, v); }),
    get: vi.fn(async (k) => store.has(k) ? { body: store.get(k), text: async () => store.get(k) } : null),
    head: vi.fn(async (k) => store.has(k) ? { size: store.get(k).length } : null),
    list: vi.fn(async () => ({ objects: [...store.keys()].map((key) => ({ key })) })),
    delete: vi.fn(async (k) => store.delete(k)),
  };
}

export function makeQueue() {
  const sent = [];
  return { _sent: sent, send: vi.fn(async (msg) => { sent.push(msg); }) };
}

export function makeDONamespace() {
  return {
    idFromName: vi.fn((name) => ({ toString: () => 'do-' + name })),
    idFromString: vi.fn((s) => ({ toString: () => s })),
    newUniqueId: vi.fn(() => ({ toString: () => 'do-' + crypto.randomUUID() })),
    get: vi.fn(() => ({
      fetch: vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    })),
  };
}

export const ENV = (overrides = {}) => ({
  JWT_SIGN_KEY: SECRET,
  ALLOW_TEST_OTP: 'true',            // v1.1.172 — mode cercle privé (défaut wrangler)
  APEX_CHAT_ADMIN_TOKEN: 'admin-secret',
  APEX_CHAT_ADMIN_PHONE_E164: '+33600000001',
  APEX_CHAT_DB: makeDB(),
  APEX_CHAT_CACHE: makeKV(),
  APEX_CHAT_KV: makeKV(),            // v1.1.30 — quota daily store
  APEX_CHAT_MEDIA: makeR2(),
  TELEMETRY_QUEUE: makeQueue(),
  PUSH_QUEUE: makeQueue(),
  CONVERSATION_DO: makeDONamespace(),
  BROADCAST_DO: makeDONamespace(),
  PRESENCE_DO: makeDONamespace(),
  ANTHROPIC_API_KEY: 'a',
  GROQ_API_KEY: 'g',
  ...overrides,
});

/** Génère un JWT valide signé avec SECRET */
export async function makeJWT(payload, secret = SECRET) {
  const enc = new TextEncoder();
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${header}.${payloadB64}`));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${header}.${payloadB64}.${sigB64}`;
}

/** Crée une Request avec body JSON et headers Auth si fourni */
export function makeRequest({ method = 'GET', path = '/', body, token, extraHeaders = {} } = {}) {
  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
  if (token) headers.Authorization = 'Bearer ' + token;
  return new Request('https://api.apex/' + path.replace(/^\//, ''), {
    method,
    headers,
    body: body !== undefined && method !== 'GET' && method !== 'OPTIONS' ? JSON.stringify(body) : undefined,
  });
}

/**
 * `happy-dom` retire l'en-tête `Origin` d'une Request — exactement comme un
 * vrai navigateur, où `Origin` est posé par le navigateur lui-même et non par
 * le code. Pour tester le CORS **côté serveur** (audit P2b, v1.1.287) on le
 * réinjecte avec un proxy qui ne change QUE la lecture de cet en-tête ; tout le
 * reste de la Request (méthode, URL, corps) est intact.
 */
export function withOrigin(request, origin) {
  const headers = {
    get: (name) => (String(name).toLowerCase() === 'origin' ? origin : request.headers.get(name)),
  };
  return new Proxy(request, {
    get(target, prop) {
      if (prop === 'headers') return headers;
      const v = Reflect.get(target, prop);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
}
