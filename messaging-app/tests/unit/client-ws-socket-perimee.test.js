// Garde (audit client 10/2026) — la fermeture d'une ANCIENNE WebSocket ne tue plus
// la socket vivante.
//
// K._openWs ferme la socket courante puis en ouvre une nouvelle (après un await du
// ticket). L'événement « close » de l'ancienne arrive APRÈS : son écouteur faisait
// K.ws = null (+ coupait le ping, relançait une reconnexion) alors que K.ws était
// déjà la NOUVELLE socket → messages envoyés « hors ligne », doublons de sockets.
// Correctif : chaque écouteur vise sa propre socket ; if(K.ws !== ws) return.
//
// Discriminant : sans le correctif, le test 1 voit K.ws === null.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadDefs } from './client-extract.js';

class FakeWS {
  static all = [];
  static OPEN = 1;
  constructor(url) { this.url = url; this.l = {}; this.readyState = 0; FakeWS.all.push(this); }
  addEventListener(t, f) { (this.l[t] = this.l[t] || []).push(f); }
  close() { this.readyState = 3; }
  send() {}
  fire(t, e = {}) { (this.l[t] || []).forEach((f) => f(e)); }
}

function charger() {
  FakeWS.all = [];
  const K = {
    user: { id: 'u1' }, token: 'tok', view: 'chats', viewData: null,
    _wsTicket: async () => 'T',
    _flushOutboxFor: () => {}, _flushPendingEncrypt: () => {},
  };
  const { K: KK } = loadDefs(['K._openWs = async function(convId){'], {
    K, API_BASE: 'https://api.example', WebSocket: FakeWS,
    _logTelemetry: () => {}, _safeCatch: () => {}, toast: vi.fn(), _handleWsMessage: async () => {},
  });
  return KK;
}

afterEach(() => { vi.useRealTimers(); });

describe('WebSocket : une socket périmée ne touche pas la vivante (audit client 10/2026)', () => {
  it('1. close tardif de l\'ancienne socket → K.ws reste la nouvelle', async () => {
    const K = charger();
    await K._openWs('c1');
    const ws1 = K.ws;
    await K._openWs('c1');
    const ws2 = K.ws;
    expect(ws2).not.toBe(ws1);
    ws1.fire('close', { code: 1006, reason: '' });
    expect(K.ws).toBe(ws2);
    expect(K._wsConvId).toBe('c1');
    expect(K.wsPing).toBeTruthy();          // le ping de la socket vivante n'est pas coupé
    clearInterval(K.wsPing);
  });

  it('2. comportement conservé : la fermeture de la socket COURANTE remet K.ws à null', async () => {
    const K = charger();
    await K._openWs('c1');
    const ws = K.ws;
    ws.fire('close', { code: 1000, reason: '' });
    expect(K.ws).toBeNull();
    expect(K.wsPing).toBeNull();
  });

  it('3. ouvrir une nouvelle socket arrête le ping de l\'ancienne (pas de fuite)', async () => {
    const K = charger();
    const spy = vi.spyOn(globalThis, 'clearInterval');
    await K._openWs('c1');
    const p1 = K.wsPing;
    await K._openWs('c2');
    expect(spy).toHaveBeenCalledWith(p1);
    clearInterval(K.wsPing);
    spy.mockRestore();
  });
});
