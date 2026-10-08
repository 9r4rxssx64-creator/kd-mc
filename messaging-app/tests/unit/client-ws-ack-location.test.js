// Garde (audit client 10/2026) — acks WebSocket et positions live venant du pair.
//
// ACK : le serveur (ConversationDO) répond {type:'ack', id, seq, ts} à un envoi,
// mais AUSSI {type:'ack', id:<message existant>, edited_at|deleted_at} à une
// édition / suppression. Le client renommait toujours le DERNIER message local
// « m_… » avec data.id → après une édition, un message en attente prenait l'id
// d'un AUTRE message (doublon d'id, mauvais message édité/supprimé ensuite).
// Si le serveur renvoie l'id client (client_id), le client cible ce message-là.
// LIMITE : le serveur actuel n'écho PAS l'id client (il reçoit wire.id) → sans
// écho, repli « dernier m_* » conservé (signalé, pas deviné).
//
// LOCATION : lat/lng d'un location_update viennent du pair et étaient stockés
// tels quels (chaîne, objet, NaN) → _renderLocation (l.lat.toFixed) plantait le
// rendu de la conversation, et les valeurs partaient dans les liens de carte.
//
// Discriminant : sans le correctif, les tests 1, 2 et 4 échouent.
import { describe, it, expect } from 'vitest';
import { loadDefs } from './client-extract.js';

function charger(messages) {
  const K = { user: { id: 'me' }, messages: { c1: messages } };
  const saved = [];
  const ls = (k, v) => saved.push([k, v]);
  return { K: loadDefs(['K._applyWsAck = function(convId, data){', 'K._applyLocationUpdate = function(convId, data){'], { K, ls }).K, saved };
}

describe('ack WebSocket (audit client 10/2026)', () => {
  it('1. un ack d\'ÉDITION ne renomme pas le message local en attente', () => {
    const { K } = charger([
      { id: 'srv-1', from: 'me', text: 'ancien' },
      { id: 'm_2', from: 'me', text: 'en vol' },
    ]);
    K._applyWsAck('c1', { type: 'ack', id: 'srv-1', edited_at: 123 });
    expect(K.messages.c1.map((m) => m.id)).toEqual(['srv-1', 'm_2']);
    K._applyWsAck('c1', { type: 'ack', id: 'srv-1', deleted_at: 124 });
    expect(K.messages.c1.map((m) => m.id)).toEqual(['srv-1', 'm_2']);
  });

  it('2. si le serveur écho l\'id client, c\'est CE message qui reçoit l\'id serveur', () => {
    const { K } = charger([
      { id: 'm_1', from: 'me', text: 'a' },
      { id: 'm_2', from: 'me', text: 'b' },
    ]);
    K._applyWsAck('c1', { type: 'ack', id: 'srv-A', client_id: 'm_1', ts: 5 });
    expect(K.messages.c1.map((m) => m.id)).toEqual(['srv-A', 'm_2']);
    expect(K.messages.c1[0].ts).toBe(5);
  });

  it('3. comportement conservé (serveur actuel, sans écho) : le dernier m_* adopte l\'id', () => {
    const { K, saved } = charger([
      { id: 'x', from: 'peer' },
      { id: 'm_9', from: 'me', text: 'hello' },
    ]);
    expect(K._applyWsAck('c1', { type: 'ack', id: 'srv-9', seq: 3, ts: 77 })).toBe(true);
    expect(K.messages.c1[1]).toMatchObject({ id: 'srv-9', ts: 77 });
    expect(saved.length).toBe(1);
  });
});

describe('location_update (audit client 10/2026)', () => {
  const base = () => [{ id: 'loc1', from: 'peer', location: { lat: 43.7, lng: 7.4, accuracy: 10, live: true } }];

  it('4. lat/lng non numériques, infinis ou hors bornes sont refusés', () => {
    for (const bad of [
      { lat: '43.7"><img src=x onerror=alert(1)>', lng: 7 },
      { lat: { toFixed: 1 }, lng: 7 },
      { lat: NaN, lng: 7 },
      { lat: 43, lng: Infinity },
      { lat: 91, lng: 7 },
      { lat: 43, lng: -181 },
      { lng: 7 },
    ]) {
      const { K } = charger(base());
      expect(K._applyLocationUpdate('c1', { msg_id: 'loc1', ...bad })).toBe(false);
      expect(K.messages.c1[0].location).toMatchObject({ lat: 43.7, lng: 7.4 });
    }
  });

  it('5. comportement conservé : une position valide met à jour le message', () => {
    const { K } = charger(base());
    expect(K._applyLocationUpdate('c1', { msg_id: 'loc1', lat: 43.74, lng: 7.42, accuracy: 5, updated_at: 999 })).toBe(true);
    expect(K.messages.c1[0].location).toMatchObject({ lat: 43.74, lng: 7.42, accuracy: 5, updated_at: 999 });
  });
});
