/**
 * Robot « toutes les fonctions » (journal WebSocket, 22.10.2026) : l'offre d'appel revenait à l'APPELANT par une autre connexion de son compte ; l'app répondait « occupé » à son propre appel
 * et l'appel était coupé des deux côtés. Garde côté page (le garde côté salle est dans do-revue-moteur.test.js) : une offre dont l'expéditeur est soi-même est ignorée AVANT toute sonnerie.
 */
import { describe, it, expect } from 'vitest';
import { readIndex } from './client-extract.js';

const html = readIndex();
describe('appel : jamais d\'écho de sa propre offre', () => {
  it('le traitement de « webrtc-offer » ignore une offre venant de soi-même avant d\'appeler la sonnerie', () => {
    const i = html.indexOf("case 'webrtc-offer': {");
    expect(i).toBeGreaterThan(0);
    const bloc = html.slice(i, i + 1800);
    const iGarde = bloc.indexOf('data.from === K.user.id');
    const iSonnerie = bloc.indexOf('K._onIncomingCall(data)');
    expect(iGarde).toBeGreaterThan(0); expect(iSonnerie).toBeGreaterThan(iGarde);
  });
});
