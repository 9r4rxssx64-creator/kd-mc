/**
 * Contrat fail-open de l'échange custom_token → id_token (Phase 5 client).
 * Garantit qu'EN L'ABSENCE de FIREBASE_WEB_API_KEY le worker ne change RIEN
 * (renvoie null → le client reçoit seulement custom_token → comportement actuel).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { exchangeForIdToken } from "../src/index.js";

test("exchangeForIdToken: pas de Web API key → null (fail-open, 0 régression)", async () => {
  const r = await exchangeForIdToken("custom.tok.en", {});
  assert.equal(r, null);
});

test("exchangeForIdToken: succès → {idToken, refreshToken, expiresIn}", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ idToken: "ID123", refreshToken: "RT456", expiresIn: "3600" })
  });
  try {
    const r = await exchangeForIdToken("custom.tok.en", { FIREBASE_WEB_API_KEY: "AIzaFAKE" });
    assert.deepEqual(r, { idToken: "ID123", refreshToken: "RT456", expiresIn: "3600" });
  } finally {
    globalThis.fetch = orig;
  }
});

test("exchangeForIdToken: réponse !ok → null (fail-open, login réussit sans id_token)", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 400, text: async () => "CONFIGURATION_NOT_FOUND" });
  try {
    const r = await exchangeForIdToken("custom.tok.en", { FIREBASE_WEB_API_KEY: "AIzaFAKE" });
    assert.equal(r, null);
  } finally {
    globalThis.fetch = orig;
  }
});
