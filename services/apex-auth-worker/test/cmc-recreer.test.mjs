/**
 * /cmc/pw/recreer — un collègue présent dans la BANQUE ou les IMPORTS recrée SON mot de passe (Kevin 6.10.2026).
 * Faux RTDB + faux KV + faux domaine, SANS RÉSEAU. Noms inventés.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { verifyCmcPw, hashPwStrong } from "../src/cmc-hash.js";
import { memeIdentite, dansLaBanque } from "../src/membre.js";
import { membreDansPlanning } from "../../kdmc-router/membre-planning.js";

async function pem() {
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const b64 = Buffer.from(new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey))).toString("base64");
  return `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----`;
}
const PEM = await pem();
const BANQUE = [{ id: "U00015", name: "DUPONT M", team: "1" }, { id: "U00016", name: "MARTIN-ROUX L", team: "2" }];

function monde(donnees, planning) {
  const db = structuredClone(donnees || {});
  const kv = new Map([["gtoken", "jeton-sa"]]);
  const env = { FIREBASE_PROJECT_ID: "p", FIREBASE_CLIENT_EMAIL: "sa@p.iam", FIREBASE_PRIVATE_KEY: PEM,
    AUTH_KV: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } } };
  const lire = (chemin) => chemin.split("/").filter(Boolean).reduce((o, k) => (o == null ? null : o[decodeURIComponent(k)]), db);
  const ecrire = (chemin, v) => {
    const ks = chemin.split("/").filter(Boolean).map(decodeURIComponent);
    let o = db;
    ks.slice(0, -1).forEach((k) => { if (typeof o[k] !== "object" || o[k] === null) o[k] = {}; o = o[k]; });
    o[ks.at(-1)] = v;
  };
  const membre = [];
  const fetchFaux = async (url, init = {}) => {
    const u = new URL(url), m = (init.method || "GET").toUpperCase();
    if (u.hostname.endsWith("firebasedatabase.app")) {
      const chemin = u.pathname.replace(/\.json$/, "");
      if (u.searchParams.get("access_token") !== "jeton-sa") return { ok: false, status: 401, text: async () => "{}" };
      if (m === "GET") { const v = lire(chemin); return { ok: true, status: 200, text: async () => JSON.stringify(v ?? null) }; }
      ecrire(chemin, init.body ? JSON.parse(init.body) : null);
      return { ok: true, status: 200, text: async () => init.body || "null" };
    }
    if (u.pathname === "/__dep/membre") {
      const b = JSON.parse(init.body || "{}"); membre.push(b);
      return { ok: true, status: 200, json: async () => ({ ok: membreDansPlanning(planning || "", b.matricule, b.nom, b.prenom) }) };
    }
    return { ok: true, status: 200, json: async () => ({}), text: async () => "{}" };
  };
  const appel = async (body, ip = "1.1.1.1") => {
    const orig = globalThis.fetch; globalThis.fetch = fetchFaux;
    try {
      const r = await worker.fetch(new Request("https://w.test/cmc/pw/recreer", { method: "POST", headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip }, body: JSON.stringify(body) }), env, { waitUntil() {} });
      return { status: r.status, corps: await r.json() };
    } finally { globalThis.fetch = orig; }
  };
  return { db, appel, lire, membre };
}

test("même règle de nom que le domaine (parité membre.js ⇄ membre-planning.js)", () => {
  const cas = [["DUPONT M", "Dupont", "Marc", true], ["DUPONT M", "Dupont", "Paul", false], ["DUPONT M", "Durand", "Marc", false],
    ["MARTIN-ROUX L", "Martin Roux", "Léa", true], ["DURAND JE", "Durand", "Jean", true], ["DURAND JE", "Durand", "Jacques", false], ["ÉTIENNE V", "Etienne", "Valérie", true]];
  for (const [sbm, nom, prenom, attendu] of cas) {
    assert.equal(memeIdentite(sbm, nom, prenom), attendu, `${sbm} / ${prenom} ${nom}`);
    assert.equal(membreDansPlanning(`{"id":"U00001","name":"${sbm}"}`, "U00001", nom, prenom), attendu, `parité domaine : ${sbm}`);
  }
  assert.equal(dansLaBanque({ a: BANQUE[0] }, "U00015", "Dupont", "Marc"), true, "banque rangée en objet");
});

test("présent dans la BANQUE, aucun mot de passe au serveur → il recrée le sien et entre", async () => {
  const w = monde({ cmcteams: { cmc_e: BANQUE, cmc_pw: { U00015: { set: true } } } });
  const r = await w.appel({ uid: "U00015", nom: "Dupont", prenom: "Marc", password: "nouveau1" });
  assert.equal(r.status, 200, JSON.stringify(r.corps));
  assert.ok(r.corps.custom_token, "la session s'ouvre");
  const s = w.lire("cmcteams_secret/pw/U00015");
  assert.ok(s && /^v2:/.test(s.h) && s.setBy === "recreation", "hash v2 rangé au secret");
  assert.ok(verifyCmcPw("nouveau1", s), "le nouveau mot de passe se vérifie");
  assert.deepEqual(Object.keys(w.lire("cmcteams/cmc_pw/U00015")).sort(), ["set", "setAt", "setBy"], "copie publique : repère seul, AUCUN hash");
});

test("présent seulement dans les IMPORTS (planning publié, vérifié par le domaine) → accepté", async () => {
  const w = monde({ cmcteams: { cmc_e: [] } }, '{"id":"U00020","name":"BLANC S"}');
  const r = await w.appel({ uid: "U00020", nom: "Blanc", prenom: "Sophie", password: "nouveau1" });
  assert.equal(r.status, 200, JSON.stringify(r.corps));
  assert.equal(w.membre.length, 1, "le domaine a été interrogé");
});

test("on n'écrase JAMAIS un mot de passe existant (sinon nom + matricule suffiraient à voler un compte)", async () => {
  const w = monde({ cmcteams: { cmc_e: BANQUE }, cmcteams_secret: { pw: { U00015: { h: hashPwStrong("ancien1") } } } });
  const r = await w.appel({ uid: "U00015", nom: "Dupont", prenom: "Marc", password: "pirate1" });
  assert.equal(r.status, 409);
  assert.ok(verifyCmcPw("ancien1", w.lire("cmcteams_secret/pw/U00015")), "l'ancien mot de passe est intact");
});

test("absent de la banque ET des imports, ou nom qui ne va pas avec le matricule → refusé, rien d'écrit", async () => {
  const w = monde({ cmcteams: { cmc_e: BANQUE } }, '{"id":"U00015","name":"DUPONT M"}');
  for (const b of [{ uid: "U09999", nom: "Dupont", prenom: "Marc" }, { uid: "U00015", nom: "Durand", prenom: "Marc" }, { uid: "U00015", nom: "Dupont", prenom: "Paul" }]) {
    const r = await w.appel({ ...b, password: "nouveau1" });
    assert.equal(r.status, 403, JSON.stringify(b));
  }
  assert.equal(w.lire("cmcteams_secret/pw"), null, "rien n'a été rangé");
});

test("garde-fous : admin refusé, mot de passe trop court, matricule mal formé, essais limités", async () => {
  const w = monde({ cmcteams: { cmc_e: [...BANQUE, { id: "U11804", name: "ADMIN K" }] } });
  assert.equal((await w.appel({ uid: "U11804", nom: "Admin", prenom: "Kevin", password: "nouveau1" })).status, 403);
  assert.equal((await w.appel({ uid: "U00015", nom: "Dupont", prenom: "Marc", password: "123" })).status, 400);
  assert.equal((await w.appel({ uid: "U00015.*", nom: "Dupont", prenom: "Marc", password: "nouveau1" })).status, 400);
  const w2 = monde({ cmcteams: { cmc_e: BANQUE } });
  let dernier = 0;
  for (let i = 0; i < 6; i++) dernier = (await w2.appel({ uid: "U00016", nom: "Faux", prenom: "Nom", password: "nouveau1" }, "9.9.9." + i)).status;
  assert.equal(dernier, 429, "6e essai sur le même compte en une heure : bloqué");
});
