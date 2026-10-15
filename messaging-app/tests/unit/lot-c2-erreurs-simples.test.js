// Lot C2 (audit A4 P1-5, 15.10.2026) — erreurs en français simple, partout.
// Avant : 37 toasts affichaient le texte technique brut (« Load failed », « NotAllowedError: The request
// is not allowed by the user agent… », « HTTP 500 », « VAPID key manquante », « Worker offline »…).
//  1) Garde : AUCUN toast de la page (index.html RÉELLE) n'affiche `e.message`, un nom d'erreur, un code
//     HTTP ou un champ technique du serveur sans passer par K._humanError / K._httpError.
//  2) K._humanError (extrait de la page, jamais recopié) traduit les erreurs iPhone courantes.
// Sabotage : remettre un `toast('… : ' + e.message)` ou revenir à l'ancien _humanError → échec.
import { describe, it, expect } from 'vitest';
import { readIndex, loadDefs } from './client-extract.js';

/** Retire les appels K._humanError(…)/K._httpError(…) (parenthèses équilibrées). */
function sansTraduction(line) {
  let out = line;
  for (const fn of ['K._humanError(', 'K._httpError(']) {
    let i;
    while ((i = out.indexOf(fn)) >= 0) {
      let depth = 0, j = i + fn.length - 1;
      for (; j < out.length; j++) {
        if (out[j] === '(') depth++;
        else if (out[j] === ')') { depth--; if (depth === 0) break; }
      }
      out = out.slice(0, i) + '«traduit»' + out.slice(j + 1);
    }
  }
  return out;
}
const BRUT = /\b(?:e|err|error|ex|d|data|r|res|resp|j|e429)\??\.(?:message|name|detail|cause|error|status|code)\b|['"`]HTTP\b|HTTP ['"`]|\bVAPID\b|\bWorker offline\b|fallback|WebSocket|parsing JSON|cause inconnue/;

describe('A4 P1-5 — aucun toast technique brut', () => {
  it('chaque toast de la page passe par K._humanError / K._httpError pour afficher une erreur', () => {
    const fautifs = [];
    readIndex().split('\n').forEach((l, n) => {
      if (!/\btoast\(/.test(l) || /function toast\(/.test(l)) return;
      const rest = sansTraduction(l.slice(l.indexOf('toast(')));
      if (BRUT.test(rest)) fautifs.push(`${n + 1}: ${l.trim().slice(0, 140)}`);
    });
    expect(fautifs).toEqual([]);
  });
  it('la garde détecte bien un toast brut (témoin)', () => {
    expect(BRUT.test(sansTraduction("toast('Envoi média : ' + e.message, 'err')"))).toBe(true);
    expect(BRUT.test(sansTraduction("toast('x ' + ('HTTP ' + r.status))"))).toBe(true);
    expect(BRUT.test(sansTraduction("toast('Envoi média : ' + K._humanError(e), 'err')"))).toBe(false);
  });
});

describe('A4 P1-5 — K._humanError traduit les erreurs iPhone', () => {
  const K = loadDefs(['K._HTTP_ERRORS = ', 'K._httpError = function(status){', 'K._humanError = function(e, fallback){'], { K: {} }).K;
  const err = (name, message) => Object.assign(new Error(message), { name });
  it.each([
    [new TypeError('Load failed'), /Réseau indisponible/],
    [new TypeError('Failed to fetch'), /Réseau indisponible/],
    [err('NotAllowedError', 'The request is not allowed by the user agent or the platform in the current context, possibly because the user denied permission.'), /autorise le micro/],
    [err('NotAllowedError', 'The operation either timed out or was not allowed. See: https://www.w3.org/TR/webauthn-2/#sctn-privacy-considerations-client.'), /Face ID/],
    [err('NotFoundError', 'Requested device not found'), /introuvable/],
    [err('NotReadableError', 'Could not start video source'), /déjà utilisé/],
    [err('QuotaExceededError', 'The quota has been exceeded.'), /Mémoire du téléphone pleine/],
    [err('AbortError', 'The user aborted a request.'), /Pas de réponse/],
    [new Error('HTTP 500'), /souci passager/],
    [new Error('Erreur 413'), /trop lourd/],
    [new Error('HTTP 429'), /attends une minute/],
    [new Error('D1_ERROR: no such table'), /^Une erreur est survenue/],
    [new Error('Cannot read properties of undefined (reading \'id\')'), /^Une erreur est survenue/],
    ['too_large', /^Une erreur est survenue/],
  ])('%s', (e, attendu) => {
    const t = K._humanError(e);
    expect(t).toMatch(attendu);
    expect(t).not.toMatch(/Error|HTTP|undefined|https?:/);
  });
  it('GPS : codes 1/2/3 traduits', () => {
    const geo = (code) => ({ code, message: 'User denied Geolocation', PERMISSION_DENIED: 1 });
    expect(K._humanError(geo(1))).toMatch(/Position refusée/);
    expect(K._humanError(geo(2))).toMatch(/Position introuvable/);
    expect(K._humanError(geo(3))).toMatch(/trop de temps/);
  });
  it('un message déjà en français simple (serveur) est gardé ; repli si vide', () => {
    expect(K._humanError(new Error('Fichier trop lourd (max 100 Mo)'))).toBe('Fichier trop lourd (max 100 Mo)');
    expect(K._humanError({ message: 'Pas membre de cette conversation' })).toBe('Pas membre de cette conversation');
    expect(K._humanError(null, 'Envoi impossible')).toBe('Envoi impossible');
    expect(K._httpError(404)).toMatch(/Introuvable/);
    expect(K._httpError(503)).toMatch(/souci passager/);
    expect(K._httpError(418)).toMatch(/n'a pas répondu/);
  });
});
