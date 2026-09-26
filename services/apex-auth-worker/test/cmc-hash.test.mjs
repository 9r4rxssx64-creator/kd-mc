/**
 * Parité worker ↔ app pour la vérification des mots de passe CMCteams.
 * Les vecteurs attendus ont été calculés avec le code EXACT de index.html
 * (hashPw / hashPwStrong / hashPwV2). Si ce test casse, le worker ne valide
 * plus les mots de passe comme l'app → login CMC cassé. NE PAS ajuster les
 * vecteurs sans re-générer depuis index.html.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPw, hashPwStrong, hashPwV2, verifyCmcPw } from "../src/cmc-hash.js";

test("parité hash : vecteurs identiques à l'app", () => {
  assert.equal(hashPw("Test123!"), "3211728865");
  assert.equal(hashPwStrong("Test123!"), "s1:q6mtc01xye1gb");
  assert.equal(hashPwV2("Test123!", "saltABC"), "v2:saltABC:101ofzccb6iw71v1i7wt");
  assert.equal(hashPwV2("Kevin2026", "U11804"), "v2:U11804:3ory4g15dm7i01mp5rdx");
});

test("verifyCmcPw : formats v2 / s1 / djb2-objet / legacy-string", () => {
  // v2 (sel dynamique embarqué)
  assert.equal(verifyCmcPw("Kevin2026", { h: "v2:U11804:3ory4g15dm7i01mp5rdx" }), true);
  assert.equal(verifyCmcPw("mauvais", { h: "v2:U11804:3ory4g15dm7i01mp5rdx" }), false);
  // s1 (sel statique)
  assert.equal(verifyCmcPw("Test123!", { h: "s1:q6mtc01xye1gb" }), true);
  assert.equal(verifyCmcPw("Test123?", { h: "s1:q6mtc01xye1gb" }), false);
  // djb2 dans { h }
  assert.equal(verifyCmcPw("Test123!", { h: "3211728865" }), true);
  // legacy string brute
  assert.equal(verifyCmcPw("Test123!", "3211728865"), true);
  assert.equal(verifyCmcPw("x", "3211728865"), false);
});

test("verifyCmcPw : entrées vides / malformées → false", () => {
  assert.equal(verifyCmcPw("x", null), false);
  assert.equal(verifyCmcPw("x", undefined), false);
  assert.equal(verifyCmcPw("x", {}), false);
  assert.equal(verifyCmcPw("x", { h: "v2:onlytwo" }), false);
});
