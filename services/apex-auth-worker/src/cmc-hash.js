/**
 * cmc-hash.js — Vérification des mots de passe CMCteams côté worker (Phase 5).
 *
 * ⚠️ COPIE VERBATIM des fonctions de hash de l'app (index.html : hashPw / hashPwStrong /
 * hashPwV2 / verifyPw). NE PAS "optimiser" : certaines multiplications dépassent 2^53,
 * l'imprécision IEEE-754 est DÉTERMINISTE et doit être IDENTIQUE des deux côtés sinon
 * les hash ne matchent plus. La parité est verrouillée par test (cmc-hash.test.mjs).
 *
 * Le worker reçoit le mot de passe en clair (HTTPS uniquement), lit cmc_pw/<uid> en
 * admin (service account), et rejoue verifyCmcPw. Le mot de passe n'est JAMAIS loggé.
 */

// DJB2 legacy — vérification anciens comptes uniquement
export function hashPw(pw) {
  var h = 0;
  for (var i = 0; i < pw.length; i++) { h = ((h << 5) - h) + pw.charCodeAt(i); h |= 0; }
  return String(h >>> 0);
}

// Key-stretching 10 000 rounds + sel statique (v1 legacy)
export function hashPwStrong(pw) {
  var s = "CMCteams2026:" + pw;
  var h1 = 0, h2 = 2166136261;
  for (var r = 0; r < 10000; r++) {
    for (var i = 0; i < s.length; i++) { h1 = ((h1 << 5) - h1) + s.charCodeAt(i) | 0; h2 = (h2 ^ s.charCodeAt(i)) * 16777619 >>> 0; }
  }
  return "s1:" + (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}

// 15 000 rounds + sel dynamique + 3 registres (v2)
export function hashPwV2(pw, salt) {
  var s = salt + ":" + pw;
  var h1 = 0, h2 = 2166136261, h3 = 5381;
  for (var r = 0; r < 15000; r++) {
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      h1 = ((h1 << 5) - h1) + c | 0;
      h2 = (h2 ^ c) * 16777619 >>> 0;
      h3 = ((h3 << 5) + h3) + c | 0;
    }
  }
  return "v2:" + salt + ":" + (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36) + (h3 >>> 0).toString(36);
}

/**
 * Réplique exactement verifyPw(pw, stored) de l'app.
 * `stored` = la valeur RTDB de cmc_pw/<uid> : soit une string legacy (DJB2),
 * soit un objet { h: "v2:..."|"s1:..."|"<djb2>", ... }.
 */
export function verifyCmcPw(pw, stored) {
  if (!stored) return false;
  if (typeof stored === "string") return hashPw(pw) === stored; // legacy DJB2
  if (stored.h) {
    if (stored.h.indexOf("v2:") === 0) {
      var parts = stored.h.split(":");
      if (parts.length < 3) return false;
      return hashPwV2(pw, parts[1]) === stored.h;
    }
    if (stored.h.indexOf("s1:") === 0) return hashPwStrong(pw) === stored.h;
    return hashPw(pw) === stored.h; // legacy DJB2 dans { h }
  }
  return false;
}
