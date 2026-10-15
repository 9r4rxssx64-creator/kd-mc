/**
 * Lot E1 — émulation de l'API d'HIBERNATION des WebSockets du runtime Durable Objects, pour les tests.
 *
 * Le vrai runtime fournit toujours, sur `state` : acceptWebSocket(ws, tags), getWebSockets(tag),
 * setWebSocketAutoResponse(pair) ; sur chaque socket acceptée : serializeAttachment / deserializeAttachment ;
 * et il appelle `webSocketMessage(ws, data)` / `webSocketClose(ws, code, reason, wasClean)` sur L'INSTANCE
 * COURANTE de l'objet (une nouvelle instance après un sommeil).
 *
 * Importer ce module :
 *  - complète tout `state` de test qui n'a pas ces méthodes au moment où un ConversationDO est construit ;
 *  - relaie les événements d'une MockWS (`addEventListener('message'|'close')`, donc triggerMessage /
 *    triggerClose / `_l.message[0](…)`) vers les gestionnaires d'hibernation de l'instance courante ;
 *  - fournit `wake(do)` : construit une NOUVELLE instance sur le même état (simule un réveil après sommeil).
 * Un `state` qui fournit déjà acceptWebSocket n'est pas touché (tests qui émulent le runtime eux-mêmes).
 */
import { ConversationDO } from '../../../workers/durable-objects/ConversationDO.js';

if (typeof globalThis.WebSocketRequestResponsePair !== 'function') {
  globalThis.WebSocketRequestResponsePair = class WebSocketRequestResponsePair {
    constructor(request, response) { this.request = request; this.response = response; }
    getRequest() { return this.request; }
    getResponse() { return this.response; }
  };
}

/** Ajoute l'API d'hibernation à `state` (sockets acceptées gardées, attachments copiés comme le runtime). */
export function installHibernation(state) {
  const sockets = new Set();
  state.__hibSockets = sockets;
  state.acceptWebSocket = (ws, tags = []) => {
    ws.accepted = true;
    ws.hibernatable = true;
    ws.tags = tags;
    sockets.add(ws);
    if (typeof ws.serializeAttachment !== 'function') {
      // Le runtime sérialise (structured clone) : l'attachment est une COPIE, pas l'objet vivant.
      ws.serializeAttachment = (v) => { ws.__attachment = v === undefined ? undefined : JSON.parse(JSON.stringify(v)); };
      ws.deserializeAttachment = () => (ws.__attachment === undefined ? null : JSON.parse(JSON.stringify(ws.__attachment)));
    }
    if (typeof ws.addEventListener === 'function') {
      ws.addEventListener('message', (e) => state.__hibDO.webSocketMessage(ws, e && e.data));
      ws.addEventListener('close', (e) => {
        sockets.delete(ws);
        return state.__hibDO.webSocketClose(ws, (e && e.code) || 1005, (e && e.reason) || '', true);
      });
    }
  };
  state.getWebSockets = (tag) => [...sockets].filter((w) => !tag || (w.tags || []).includes(tag));
  state.setWebSocketAutoResponse = (pair) => { state.autoResponse = pair; };
  return state;
}

// L'instance courante reçoit les événements ; un `state` sans API d'hibernation est complété.
Object.defineProperty(ConversationDO.prototype, 'state', {
  configurable: true,
  get() { return undefined; },
  set(v) {
    Object.defineProperty(this, 'state', { value: v, writable: true, enumerable: true, configurable: true });
    if (v && typeof v === 'object') {
      if (typeof v.acceptWebSocket !== 'function') installHibernation(v);
      v.__hibDO = this;
    }
  },
});

/** Réveil après hibernation : nouvelle instance, même état durable, mêmes sockets ouvertes. */
export function wake(doObj) {
  return new ConversationDO(doObj.state, doObj.env);
}
