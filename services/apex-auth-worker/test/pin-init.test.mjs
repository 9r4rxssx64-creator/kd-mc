/* /pin/init (16.10.2026, leçon #559) : le PREMIER code d'une personne se pose au compte de service, une fois,
   jamais remplacé — l'app ne peut plus écrire /apex/ax_pin_<uid> elle-même (un jeton anonyme écrasait celui de l'admin). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinInit } from "../src/index.js";

const H = "a".repeat(64);
function deps(etat) {
  const kvs = new Map(); const ecrits = [];
  return {
    ecrits,
    d: {
      kv: { get: async (k) => kvs.get(k) ?? null, put: async (k, v) => { kvs.set(k, v); } },
      readPinHash: async (uid) => etat[uid] ? { ok: true, hash: etat[uid] } : { ok: false, status: 404, detail: "user_not_found" },
      rtdb: async (_e, _c, method, path, body) => { ecrits.push([method, path, body]); return { ok: true, status: 200, value: body }; },
    },
  };
}

test("premier code : écrit /apex/ax_pin_<uid> au compte de service → 201", async () => {
  const { d, ecrits } = deps({});
  const r = await pinInit({ uid: "marie-dupont", pin_hash: H }, {}, null, "1.2.3.4", d);
  assert.equal(r.status, 201);
  assert.deepEqual(ecrits, [["PUT", "apex/ax_pin_marie-dupont", H]]);
});

test("code déjà posé : refus 409, AUCUNE écriture (personne ne remplace le code d'un autre)", async () => {
  const { d, ecrits } = deps({ kdmc_admin: "b".repeat(64) });
  const r = await pinInit({ uid: "kdmc_admin", pin_hash: H }, {}, null, "1.2.3.4", d);
  assert.equal(r.status, 409);
  assert.equal(r.body.error, "pin_already_set");
  assert.deepEqual(ecrits, []);
});

test("entrée invalide (uid vide, empreinte qui n'est pas un sha256) → 400 sans toucher la base", async () => {
  const { d, ecrits } = deps({});
  assert.equal((await pinInit({ uid: "", pin_hash: H }, {}, null, "x", d)).status, 400);
  assert.equal((await pinInit({ uid: "u", pin_hash: "1234" }, {}, null, "x", d)).status, 400);
  assert.deepEqual(ecrits, []);
});

test("rate-limit : la 6e tentative d'une même adresse → 429", async () => {
  const { d } = deps({});
  for (let i = 0; i < 5; i++) await pinInit({ uid: "u" + i, pin_hash: H }, {}, null, "9.9.9.9", d);
  assert.equal((await pinInit({ uid: "u9", pin_hash: H }, {}, null, "9.9.9.9", d)).status, 429);
});

test("base injoignable (ni trouvé ni 404) → 502, pas d'écriture à l'aveugle", async () => {
  const { d, ecrits } = deps({});
  d.readPinHash = async () => ({ ok: false, status: 503, detail: "rtdb_admin_read_503" });
  assert.equal((await pinInit({ uid: "u", pin_hash: H }, {}, null, "x", d)).status, 502);
  assert.deepEqual(ecrits, []);
});
