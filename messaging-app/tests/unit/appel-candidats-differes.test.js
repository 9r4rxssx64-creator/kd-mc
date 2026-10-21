/**
 * Robot « toutes les fonctions » (22.10.2026) : quand la connexion temps réel n'était pas encore ouverte au lancement de l'appel, les 6 candidats ICE de l'appelant étaient JETÉS
 * (aucun envoyé) : l'appelé ne pouvait pas se connecter, l'appel échouait au bout de 20 s. Le test exécute le VRAI code de la page.
 */
import { describe, it, expect, vi } from 'vitest';
import { readIndex, extractDef } from './client-extract.js';

const html = readIndex();
function monter(ouvert) {
  const envoyes = [];
  const WS = { OPEN: 1 };
  const K = { ws: { readyState: ouvert ? 1 : 0, send: (m) => envoyes.push(JSON.parse(m)) }, _activeCall: { type: 'audio' } };
  // eslint-disable-next-line no-new-func
  new Function('K', 'WebSocket', '_safeCatch', extractDef(html, 'K._sendCallCand = function(frame){') + '\n' + extractDef(html, 'K._flushCallCands = function(){'))(K, WS, () => {});
  return { K, envoyes };
}
const c = (n) => ({ type: 'webrtc-candidate', candidate: { n }, convId: 'x' });

describe('appel : candidats ICE produits avant l\'ouverture du temps réel', () => {
  it('connexion ouverte : envoyé tout de suite', () => {
    const { K, envoyes } = monter(true);
    expect(K._sendCallCand(c(1))).toBe(true); expect(envoyes).toHaveLength(1);
  });
  it('connexion pas ouverte : gardés (rien n\'est perdu), puis envoyés dans l\'ordre quand elle s\'ouvre', () => {
    const { K, envoyes } = monter(false);
    expect(K._sendCallCand(c(1))).toBe(false); K._sendCallCand(c(2)); K._sendCallCand(c(3));
    expect(envoyes).toHaveLength(0); expect(K._flushCallCands()).toBe(0);       // toujours fermée : on garde
    K.ws.readyState = 1;
    expect(K._flushCallCands()).toBe(3); expect(envoyes.map((f) => f.candidate.n)).toEqual([1, 2, 3]);
    expect(K._flushCallCands()).toBe(0);                                          // rien en double
  });
  it('pas d\'appel en cours : rien ne plante', () => {
    const { K } = monter(false); K._activeCall = null;
    expect(K._sendCallCand(c(1))).toBe(false); expect(K._flushCallCands()).toBe(0);
  });
  it('la page vide la file après l\'envoi de l\'offre (2 chemins) et de la réponse', () => {
    expect((html.match(/K\._flushCallCands\(\);/g) || []).length).toBeGreaterThanOrEqual(3);
  });
});
