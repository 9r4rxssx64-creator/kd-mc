/**
 * Test local du chemin crypto du worker (Phase 5).
 * Vérifie SANS RÉSEAU que :
 *  - base64urlEncode produit un encodage URL-safe sans padding
 *  - importPrivateKey(pem) charge une clé pkcs8 et permet une signature RS256
 *    vérifiable (le même chemin que getGoogleAccessToken + generateCustomToken).
 *
 * Tourne avec : node --test (Node 22+, Web Crypto global).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { base64urlEncode, importPrivateKey } from "../src/index.js";

test("base64urlEncode: URL-safe, sans padding", () => {
  const out = base64urlEncode("a>?bÿ~~~"); // force des +,/,= en base64 classique
  assert.ok(!/[+/=]/.test(out), `ne doit contenir ni + ni / ni = : ${out}`);
});

test("importPrivateKey + RS256: signature vérifiable (chemin OAuth/custom token)", async () => {
  // Génère une paire RSA et exporte la privée en PEM pkcs8 (comme un Service Account)
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"]
  );
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const b64 = Buffer.from(pkcs8).toString("base64").replace(/(.{64})/g, "$1\n");
  const pem = `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----`;

  // Le worker doit pouvoir réimporter ce PEM (avec \n et espaces)
  const key = await importPrivateKey(pem);

  // Assemble un JWT exactement comme le worker (header.payload signés)
  const header = base64urlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64urlEncode(JSON.stringify({ iss: "sa@x.iam.gserviceaccount.com", iat: 1 }));
  const signingInput = `${header}.${payload}`;
  const sig = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput))
  );

  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    pair.publicKey,
    sig,
    new TextEncoder().encode(signingInput)
  );
  assert.equal(valid, true, "la signature RS256 du worker doit être vérifiable");
});
