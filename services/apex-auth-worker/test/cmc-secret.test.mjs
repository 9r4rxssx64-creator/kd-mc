/**
 * CMCteams — secrets vérifiés par le worker (27.09.2026).
 * Faux RTDB + faux KV, SANS RÉSEAU. Couvre :
 *  - /login-cmc lit le hash dans /cmcteams_secret/pw (puis l'ancien emplacement tant qu'il n'est pas migré),
 *    limite par COMPTE (10 essais / 15 min, même en changeant d'adresse IP) ;
 *  - /cmc/code/new : le code n'est JAMAIS renvoyé, refusé pour l'admin et un compte déjà validé ;
 *  - /cmc/code/check : 5 essais, code à usage unique, expiration, valide la fiche, ouvre la session.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { genCode6, ctEq } from "../src/index.js";
import { hashPwStrong, hashPwV2, verifyCmcPw } from "../src/cmc-hash.js";

async function pem() {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const b64 = Buffer.from(new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey))).toString("base64");
  return `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----`;
}
const PEM = await pem();

function monde(donnees) {
  const db = JSON.parse(JSON.stringify(donnees || {}));
  const kv = new Map([["gtoken", "jeton-sa"]]);
  const env = {
    FIREBASE_PROJECT_ID: "p", FIREBASE_CLIENT_EMAIL: "sa@p.iam", FIREBASE_PRIVATE_KEY: PEM,
    AUTH_KV: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } }
  };
  const lire = (chemin) => chemin.split("/").filter(Boolean).reduce((o, k) => (o == null ? null : o[decodeURIComponent(k)]), db);
  const ecrire = (chemin, v, fusion) => {
    const ks = chemin.split("/").filter(Boolean).map(decodeURIComponent); let o = db;
    ks.slice(0, -1).forEach((k) => { if (typeof o[k] !== "object" || o[k] === null) o[k] = {}; o = o[k]; });
    const der = ks[ks.length - 1];
    if (v === null) delete o[der]; else o[der] = fusion ? Object.assign({}, o[der] || {}, v) : v;
  };
  const journal = [];
  const fetchFaux = async (url, init = {}) => {
    const u = new URL(url), m = (init.method || "GET").toUpperCase();
    if (u.hostname.endsWith("firebasedatabase.app")) {
      const chemin = u.pathname.replace(/\.json$/, "");
      const sa = u.searchParams.get("access_token") === "jeton-sa";
      journal.push({ m, chemin, sa });
      if (!sa) return { ok: false, status: 401, text: async () => '{"error":"Permission denied"}' };
      if (m === "GET") { const v = lire(chemin); return { ok: true, status: 200, text: async () => JSON.stringify(v ?? null) }; }
      const corps = init.body ? JSON.parse(init.body) : null;
      ecrire(chemin, corps, m === "PATCH");
      return { ok: true, status: 200, text: async () => JSON.stringify(corps) };
    }
    return { ok: true, status: 200, json: async () => ({}), text: async () => "{}" };
  };
  const appel = async (route, body, ip = "1.1.1.1") => {
    const orig = globalThis.fetch; globalThis.fetch = fetchFaux;
    try {
      const req = new Request("https://w.test" + route, { method: "POST", headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip }, body: JSON.stringify(body) });
      const r = await worker.fetch(req, env, { waitUntil() {} });
      return { status: r.status, corps: await r.json() };
    } finally { globalThis.fetch = orig; }
  };
  return { db, kv, journal, appel, lire };
}

test("parité app/worker : un hash « s1: » ou « v2: » rangé en chaîne se vérifie aussi", () => {
  assert.ok(verifyCmcPw("abc", hashPwStrong("abc")));
  assert.ok(verifyCmcPw("abc", hashPwV2("abc", "sel123")));
  assert.ok(!verifyCmcPw("abd", hashPwStrong("abc")));
});

test("/login-cmc lit le hash au SECRET (l'ancien emplacement n'a plus qu'un repère)", async () => {
  const w = monde({ cmcteams_secret: { pw: { U1: { h: hashPwStrong("bon") } } }, cmcteams: { cmc_pw: { U1: { set: true } } } });
  const ok = await w.appel("/login-cmc", { uid: "U1", password: "bon" });
  assert.equal(ok.status, 200); assert.equal(ok.corps.ok, true); assert.ok(ok.corps.custom_token);
  const ko = await w.appel("/login-cmc", { uid: "U1", password: "faux" });
  assert.equal(ko.status, 401);
});

test("/login-cmc : avant migration, relit l'ancien emplacement ; repère sans hash = compte inconnu", async () => {
  const w = monde({ cmcteams: { cmc_pw: { U2: { h: hashPwStrong("x1") }, U3: { set: true } } } });
  assert.equal((await w.appel("/login-cmc", { uid: "U2", password: "x1" })).status, 200);
  assert.equal((await w.appel("/login-cmc", { uid: "U3", password: "x1" })).status, 404);
});

test("/login-cmc : 10 essais par COMPTE, même en changeant d'adresse IP", async () => {
  const w = monde({ cmcteams_secret: { pw: { U4: { h: hashPwStrong("vrai") } } } });
  for (let i = 0; i < 10; i++) assert.equal((await w.appel("/login-cmc", { uid: "U4", password: "faux" + i }, "9.9.9." + i)).status, 401);
  const bloque = await w.appel("/login-cmc", { uid: "U4", password: "vrai" }, "8.8.8.8");
  assert.equal(bloque.status, 429);
});

test("/login-cmc : identifiant hors format refusé", async () => {
  const w = monde({});
  assert.equal((await w.appel("/login-cmc", { uid: "../cmc_pw", password: "x" })).status, 400);
});

test("/cmc/code/new : code rangé au secret, JAMAIS renvoyé ; admin et compte validé refusés", async () => {
  const w = monde({ cmcteams: { cmc_reg: { U5: { nom: "A", verified: false }, U6: { verified: true } } } });
  const r = await w.appel("/cmc/code/new", { uid: "U5", email: "a@b.c", nom: "A", prenom: "B" });
  assert.equal(r.status, 200); assert.equal(r.corps.ok, true);
  assert.deepEqual(Object.keys(r.corps).sort(), ["expiresAt", "ok"], "la réponse ne porte QUE ok + expiresAt (jamais le code)");
  const e = w.lire("cmcteams_secret/codes/U5");
  assert.match(e.code, /^\d{6}$/); assert.equal(e.used, false); assert.equal(e.email, "a@b.c");
  assert.equal((await w.appel("/cmc/code/new", { uid: "U11804" })).status, 403);
  assert.equal((await w.appel("/cmc/code/new", { uid: "U6" })).status, 409);
});

test("/cmc/code/check : faux → 401, bon → session + fiche validée, réutilisé → 409", async () => {
  const w = monde({ cmcteams: { cmc_reg: { U7: { verified: false } } } });
  await w.appel("/cmc/code/new", { uid: "U7", email: "x@y.z" });
  const code = w.lire("cmcteams_secret/codes/U7").code;
  const faux = String((+code + 1) % 1000000).padStart(6, "0");
  const k = await w.appel("/cmc/code/check", { uid: "U7", code: faux });
  assert.equal(k.status, 401); assert.equal(w.lire("cmcteams_secret/codes/U7").essais, 1);
  const ok = await w.appel("/cmc/code/check", { uid: "U7", code });
  assert.equal(ok.status, 200); assert.ok(ok.corps.custom_token);
  assert.equal(w.lire("cmcteams_secret/codes/U7").used, true);
  assert.equal(w.lire("cmcteams/cmc_reg/U7").verified, true);
  assert.equal((await w.appel("/cmc/code/check", { uid: "U7", code })).status, 409);
});

test("/cmc/code/check : 5 essais max, code expiré, admin refusé", async () => {
  const w = monde({ cmcteams_secret: { codes: {
    U8: { code: "123456", used: false, essais: 5, expiresAt: Date.now() + 60000 },
    U9: { code: "123456", used: false, essais: 0, expiresAt: Date.now() - 1 } } } });
  assert.equal((await w.appel("/cmc/code/check", { uid: "U8", code: "123456" })).status, 429);
  assert.equal((await w.appel("/cmc/code/check", { uid: "U9", code: "123456" })).status, 410);
  assert.equal((await w.appel("/cmc/code/check", { uid: "U11804", code: "123456" })).status, 403);
});

test("toutes les lectures/écritures RTDB passent par le compte de service", async () => {
  const w = monde({ cmcteams: { cmc_reg: { U10: {} } } });
  await w.appel("/cmc/code/new", { uid: "U10" });
  assert.ok(w.journal.length > 0 && w.journal.every((x) => x.sa));
});

test("genCode6 : 6 chiffres ; ctEq : égalité exacte", () => {
  for (let i = 0; i < 200; i++) assert.match(genCode6(), /^\d{6}$/);
  assert.ok(ctEq("012345", "012345")); assert.ok(!ctEq("012345", "012346")); assert.ok(!ctEq("0123", "012345"));
});
