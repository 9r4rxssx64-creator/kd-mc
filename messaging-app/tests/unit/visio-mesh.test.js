/**
 * Tests lib/visio-mesh.js — Visio conférence multi-user mesh P2P.
 * Coverage 100% via mocks RTCPeerConnection + getUserMedia + WebSocket.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createVisioSession, ICE_SERVERS } from '../../lib/visio-mesh.js';

// ----------------------------------------------------------------------------
// Mocks
// ----------------------------------------------------------------------------
class MockRTCPeerConnection {
  constructor(config) {
    this.config = config;
    this.senders = [];
    this.tracks = [];
    this.remoteDescription = null;
    this.localDescription = null;
    this.connectionState = 'new';
    this._listeners = {};
    this.candidates = [];
    this._closed = false;
  }
  addTrack(track, stream) {
    const sender = { track, replaceTrack: vi.fn(async (newTrack) => { sender.track = newTrack; }) };
    this.senders.push(sender);
    this.tracks.push(track);
    return sender;
  }
  getSenders() { return this.senders; }
  async createOffer() { return { type: 'offer', sdp: 'fake-offer-sdp' }; }
  async createAnswer() { return { type: 'answer', sdp: 'fake-answer-sdp' }; }
  async setLocalDescription(d) { this.localDescription = d; }
  async setRemoteDescription(d) { this.remoteDescription = d; }
  async addIceCandidate(c) { this.candidates.push(c); }
  close() { this._closed = true; this._fire('connectionstatechange'); }
  set ontrack(fn) { this._listeners.track = fn; }
  set onicecandidate(fn) { this._listeners.icecandidate = fn; }
  set onconnectionstatechange(fn) { this._listeners.connectionstatechange = fn; }
  _fire(type, data) {
    const fn = this._listeners[type];
    if (fn) fn(data || {});
  }
}

function makeMockStream(kinds = ['audio', 'video']) {
  return {
    getTracks: () => kinds.map((k) => makeTrack(k)),
    getAudioTracks: () => kinds.filter((k) => k === 'audio').map(makeTrack),
    getVideoTracks: () => kinds.filter((k) => k === 'video').map(makeTrack),
  };
}
function makeTrack(kind) {
  return { kind, enabled: true, stop: vi.fn(), onended: null };
}

function makeWS() {
  const sent = [];
  return {
    readyState: 1,
    sent,
    send: vi.fn((d) => sent.push(JSON.parse(d))),
  };
}

const baseDeps = {
  RTCPeerConnection: MockRTCPeerConnection,
  getUserMedia: vi.fn(async () => makeMockStream(['audio', 'video'])),
  getDisplayMedia: vi.fn(async () => makeMockStream(['video'])),
};

beforeEach(() => {
  vi.restoreAllMocks();
  baseDeps.getUserMedia.mockClear?.();
  baseDeps.getDisplayMedia.mockClear?.();
});

// ----------------------------------------------------------------------------
describe('createVisioSession — init + ICE servers', () => {
  it('ICE_SERVERS exposés (Cloudflare + Google STUN)', () => {
    expect(ICE_SERVERS).toHaveLength(2);
    expect(ICE_SERVERS[0].urls).toContain('cloudflare');
    expect(ICE_SERVERS[1].urls).toContain('google');
  });

  it('crée session avec props requises', () => {
    const ws = makeWS();
    const s = createVisioSession({ convId: 'c1', userId: 'u1', type: 'video', ws, deps: baseDeps });
    expect(s.state.convId).toBe('c1');
    expect(s.state.userId).toBe('u1');
    expect(s.state.type).toBe('video');
    expect(s.state.peers).toBeInstanceOf(Map);
    expect(s.state.peers.size).toBe(0);
  });

  it('throw si RTCPeerConnection indisponible', () => {
    const ws = makeWS();
    expect(() => createVisioSession({
      convId: 'c', userId: 'u', type: 'audio', ws,
      deps: { ...baseDeps, RTCPeerConnection: null },
    })).toThrow('WebRTC non supporté');
  });

  it('fallback global RTCPeerConnection si pas dans deps', () => {
    const ws = makeWS();
    globalThis.RTCPeerConnection = MockRTCPeerConnection;
    try {
      const s = createVisioSession({ convId: 'c', userId: 'u', type: 'audio', ws, deps: {} });
      expect(s.state.userId).toBe('u');
    } finally {
      delete globalThis.RTCPeerConnection;
    }
  });

  // happy-dom ≥ 20 : `globalThis.navigator` n'a qu'un getter et `mediaDevices` est en
  // lecture seule → on redéfinit la propriété (configurable) au lieu de l'assigner.
  function setMediaDevices(md) {
    if (!globalThis.navigator) Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
    Object.defineProperty(globalThis.navigator, 'mediaDevices', { value: md, configurable: true, writable: true });
  }

  it('fallback getUserMedia via navigator.mediaDevices si pas dans deps', async () => {
    const ws = makeWS();
    const origMD = globalThis.navigator?.mediaDevices;
    setMediaDevices({
      getUserMedia: vi.fn(async () => makeMockStream(['audio'])),
      getDisplayMedia: vi.fn(async () => makeMockStream(['video'])),
    });
    try {
      const s = createVisioSession({
        convId: 'c', userId: 'u', type: 'audio', ws,
        deps: { RTCPeerConnection: MockRTCPeerConnection },
      });
      await s.startLocalStream();
      expect(globalThis.navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
    } finally {
      if (origMD) setMediaDevices(origMD);
    }
  });

  it('fallback getDisplayMedia via navigator.mediaDevices', async () => {
    const ws = makeWS();
    setMediaDevices({
      getUserMedia: vi.fn(async () => makeMockStream(['audio', 'video'])),
      getDisplayMedia: vi.fn(async () => makeMockStream(['video'])),
    });
    const s = createVisioSession({
      convId: 'c', userId: 'u', type: 'video', ws,
      deps: { RTCPeerConnection: MockRTCPeerConnection },
    });
    await s.startLocalStream();
    await s.inviteUser('peer2');
    await s.toggleScreenShare();
    expect(globalThis.navigator.mediaDevices.getDisplayMedia).toHaveBeenCalled();
  });

  it('options callbacks par défaut no-op', () => {
    const ws = makeWS();
    const s = createVisioSession({ convId: 'c', userId: 'u', type: 'audio', ws, deps: baseDeps });
    expect(() => s.state.onRemoteStream('x', null)).not.toThrow();
    expect(() => s.state.onPeerLeave('x')).not.toThrow();
    expect(() => s.state.onStateChange('x', 'connected')).not.toThrow();
  });
});

// ----------------------------------------------------------------------------
describe('createVisioSession — startLocalStream', () => {
  it('demande getUserMedia avec contraintes selon type', async () => {
    const ws = makeWS();
    const s = createVisioSession({ convId: 'c', userId: 'u', type: 'video', ws, deps: baseDeps });
    await s.startLocalStream();
    expect(baseDeps.getUserMedia).toHaveBeenCalledWith({ audio: true, video: true });
    expect(s.state.localStream).toBeDefined();
  });

  it('type audio → video:false', async () => {
    const ws = makeWS();
    const s = createVisioSession({ convId: 'c', userId: 'u', type: 'audio', ws, deps: baseDeps });
    await s.startLocalStream();
    expect(baseDeps.getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
  });

  it('startLocalStream APRÈS peers existants → ajoute tracks à chaque peer', async () => {
    const ws = makeWS();
    const s = createVisioSession({ convId: 'c', userId: 'u', type: 'video', ws, deps: baseDeps });
    // Crée peer SANS local stream d'abord
    await s.inviteUser('peer2');
    expect(s.state.peers.get('peer2').pc.tracks).toHaveLength(0);
    // Puis startLocalStream
    await s.startLocalStream();
    expect(s.state.peers.get('peer2').pc.tracks.length).toBeGreaterThan(0);
  });
});

// ----------------------------------------------------------------------------
describe('createVisioSession — inviteUser (initiator)', () => {
  it('crée PC + envoie webrtc-offer via WS', async () => {
    const ws = makeWS();
    const s = createVisioSession({ convId: 'c1', userId: 'u1', type: 'audio', ws, deps: baseDeps });
    await s.startLocalStream();
    await s.inviteUser('peer2');
    const offer = ws.sent.find((m) => m.type === 'webrtc-offer');
    expect(offer).toBeDefined();
    expect(offer.to).toBe('peer2');
    expect(offer.from).toBe('u1');
    expect(offer.convId).toBe('c1');
    expect(offer.offer.type).toBe('offer');
  });

  it('inviteUser déjà invité → no-op (idempotent)', async () => {
    const ws = makeWS();
    const s = createVisioSession({ convId: 'c', userId: 'u', type: 'audio', ws, deps: baseDeps });
    await s.startLocalStream();
    await s.inviteUser('peer2');
    ws.send.mockClear();
    await s.inviteUser('peer2');
    expect(ws.send).not.toHaveBeenCalled();
  });

  it('ICE candidate → relay via WS', async () => {
    const ws = makeWS();
    const s = createVisioSession({ convId: 'c', userId: 'u', type: 'audio', ws, deps: baseDeps });
    await s.startLocalStream();
    const peer = await s.inviteUser('peer2');
    peer.pc._fire('icecandidate', { candidate: { candidate: 'fake-ice' } });
    const cand = ws.sent.find((m) => m.type === 'webrtc-candidate');
    expect(cand).toBeDefined();
    expect(cand.candidate.candidate).toBe('fake-ice');
  });

  it('ontrack → callback onRemoteStream', async () => {
    const ws = makeWS();
    const onRemote = vi.fn();
    const s = createVisioSession({
      convId: 'c', userId: 'u', type: 'video', ws,
      onRemoteStream: onRemote, deps: baseDeps,
    });
    await s.startLocalStream();
    const peer = await s.inviteUser('peer2');
    const remoteStream = makeMockStream(['video']);
    peer.pc._fire('track', { streams: [remoteStream] });
    expect(onRemote).toHaveBeenCalledWith('peer2', remoteStream);
  });

  it('connectionstatechange failed → removePeer + onPeerLeave', async () => {
    const ws = makeWS();
    const onLeave = vi.fn();
    const s = createVisioSession({
      convId: 'c', userId: 'u', type: 'audio', ws,
      onPeerLeave: onLeave, deps: baseDeps,
    });
    await s.startLocalStream();
    const peer = await s.inviteUser('peer2');
    peer.pc.connectionState = 'failed';
    peer.pc._fire('connectionstatechange');
    expect(onLeave).toHaveBeenCalledWith('peer2');
    expect(s.state.peers.has('peer2')).toBe(false);
  });

  it('connectionstatechange connected → onStateChange', async () => {
    const ws = makeWS();
    const onState = vi.fn();
    const s = createVisioSession({
      convId: 'c', userId: 'u', type: 'audio', ws,
      onStateChange: onState, deps: baseDeps,
    });
    await s.startLocalStream();
    const peer = await s.inviteUser('peer2');
    peer.pc.connectionState = 'connected';
    peer.pc._fire('connectionstatechange');
    expect(onState).toHaveBeenCalledWith('peer2', 'connected');
  });

  it('ICE candidate sans candidate → no send', async () => {
    const ws = makeWS();
    const s = createVisioSession({ convId: 'c', userId: 'u', type: 'audio', ws, deps: baseDeps });
    await s.startLocalStream();
    const peer = await s.inviteUser('peer2');
    ws.send.mockClear();
    peer.pc._fire('icecandidate', { candidate: null });
    const candidates = ws.sent.filter((m) => m.type === 'webrtc-candidate');
    expect(candidates).toHaveLength(0);
  });
});

// ----------------------------------------------------------------------------
describe('createVisioSession — onOffer (receiver)', () => {
  it('reçoit offer → setRemoteDescription + setLocalDescription answer + envoi WS', async () => {
    const ws = makeWS();
    const s = createVisioSession({ convId: 'c', userId: 'u2', type: 'audio', ws, deps: baseDeps });
    await s.startLocalStream();
    await s.onOffer('caller1', { type: 'offer', sdp: 'remote-sdp' });
    expect(s.state.peers.has('caller1')).toBe(true);
    const peer = s.state.peers.get('caller1');
    expect(peer.pc.remoteDescription.sdp).toBe('remote-sdp');
    expect(peer.pc.localDescription.type).toBe('answer');
    const answerMsg = ws.sent.find((m) => m.type === 'webrtc-answer');
    expect(answerMsg).toBeDefined();
    expect(answerMsg.to).toBe('caller1');
  });

  it('peer existant → réutilise PC (pas de nouveau)', async () => {
    const ws = makeWS();
    const s = createVisioSession({ convId: 'c', userId: 'u2', type: 'audio', ws, deps: baseDeps });
    await s.startLocalStream();
    await s.inviteUser('caller1');
    const pcAvant = s.state.peers.get('caller1').pc;
    await s.onOffer('caller1', { type: 'offer', sdp: 'r' });
    expect(s.state.peers.get('caller1').pc).toBe(pcAvant);
  });

  it('onOffer sans localStream → peer créé mais sans tracks', async () => {
    const ws = makeWS();
    const s = createVisioSession({ convId: 'c', userId: 'u2', type: 'audio', ws, deps: baseDeps });
    await s.onOffer('caller1', { type: 'offer', sdp: 'r' });
    expect(s.state.peers.get('caller1').pc.tracks).toHaveLength(0);
  });

  it('ICE candidate handler envoie via WS (path branch)', async () => {
    const ws = makeWS();
    const s = createVisioSession({ convId: 'c', userId: 'u2', type: 'audio', ws, deps: baseDeps });
    await s.startLocalStream();
    await s.onOffer('caller1', { type: 'offer', sdp: 'r' });
    const peer = s.state.peers.get('caller1');
    peer.pc._fire('icecandidate', { candidate: { candidate: 'ic' } });
    expect(ws.sent.find((m) => m.type === 'webrtc-candidate' && m.to === 'caller1')).toBeDefined();
  });

  it('ontrack du receiver → onRemoteStream callback', async () => {
    const ws = makeWS();
    const onRemote = vi.fn();
    const s = createVisioSession({
      convId: 'c', userId: 'u2', type: 'video', ws,
      onRemoteStream: onRemote, deps: baseDeps,
    });
    await s.startLocalStream();
    await s.onOffer('caller1', { type: 'offer', sdp: 'r' });
    const peer = s.state.peers.get('caller1');
    const remote = makeMockStream(['video']);
    peer.pc._fire('track', { streams: [remote] });
    expect(onRemote).toHaveBeenCalledWith('caller1', remote);
  });

  it('receiver connectionState closed → removePeer', async () => {
    const ws = makeWS();
    const s = createVisioSession({ convId: 'c', userId: 'u2', type: 'audio', ws, deps: baseDeps });
    await s.startLocalStream();
    await s.onOffer('caller1', { type: 'offer', sdp: 'r' });
    const peer = s.state.peers.get('caller1');
    peer.pc.connectionState = 'closed';
    peer.pc._fire('connectionstatechange');
    expect(s.state.peers.has('caller1')).toBe(false);
  });

  it('receiver ICE sans candidate → no send', async () => {
    const ws = makeWS();
    const s = createVisioSession({ convId: 'c', userId: 'u2', type: 'audio', ws, deps: baseDeps });
    await s.onOffer('caller1', { type: 'offer', sdp: 'r' });
    ws.send.mockClear();
    const peer = s.state.peers.get('caller1');
    peer.pc._fire('icecandidate', { candidate: null });
    expect(ws.sent.filter((m) => m.type === 'webrtc-candidate' && m.to === 'caller1')).toHaveLength(0);
  });
});

// ----------------------------------------------------------------------------
describe('createVisioSession — onAnswer', () => {
  it('reçoit answer → setRemoteDescription sur initiator', async () => {
    const ws = makeWS();
    const s = createVisioSession({ convId: 'c', userId: 'u1', type: 'audio', ws, deps: baseDeps });
    await s.startLocalStream();
    await s.inviteUser('peer2');
    await s.onAnswer('peer2', { type: 'answer', sdp: 'answer-sdp' });
    expect(s.state.peers.get('peer2').pc.remoteDescription.sdp).toBe('answer-sdp');
  });

  it('onAnswer peer inconnu → no-op', async () => {
    const ws = makeWS();
    const s = createVisioSession({ convId: 'c', userId: 'u1', type: 'audio', ws, deps: baseDeps });
    await s.onAnswer('inconnu', { type: 'answer', sdp: 'x' });
    expect(s.state.peers.has('inconnu')).toBe(false);
  });
});

// ----------------------------------------------------------------------------
describe('createVisioSession — onCandidate', () => {
  it('ajoute ICE candidate au PC du peer', async () => {
    const ws = makeWS();
    const s = createVisioSession({ convId: 'c', userId: 'u', type: 'audio', ws, deps: baseDeps });
    await s.startLocalStream();
    await s.inviteUser('peer2');
    await s.onCandidate('peer2', { candidate: 'ice-foo' });
    expect(s.state.peers.get('peer2').pc.candidates).toContainEqual({ candidate: 'ice-foo' });
  });

  it('peer inconnu → no-op silent', async () => {
    const ws = makeWS();
    const s = createVisioSession({ convId: 'c', userId: 'u', type: 'audio', ws, deps: baseDeps });
    await expect(s.onCandidate('inconnu', { candidate: 'x' })).resolves.toBeUndefined();
  });

  it('addIceCandidate throw → catch silent (ICE early)', async () => {
    const ws = makeWS();
    const s = createVisioSession({ convId: 'c', userId: 'u', type: 'audio', ws, deps: baseDeps });
    await s.startLocalStream();
    await s.inviteUser('peer2');
    const peer = s.state.peers.get('peer2');
    peer.pc.addIceCandidate = async () => { throw new Error('not ready'); };
    await expect(s.onCandidate('peer2', { candidate: 'x' })).resolves.toBeUndefined();
  });
});

// ----------------------------------------------------------------------------
describe('createVisioSession — toggleMute / toggleVideo', () => {
  it('toggleMute sans stream → return false initial state', () => {
    const ws = makeWS();
    const s = createVisioSession({ convId: 'c', userId: 'u', type: 'audio', ws, deps: baseDeps });
    expect(s.toggleMute()).toBe(false);
  });

  it('toggleMute avec stream → flip + disable audio tracks', async () => {
    const ws = makeWS();
    const s = createVisioSession({ convId: 'c', userId: 'u', type: 'audio', ws, deps: baseDeps });
    const fakeStream = {
      getAudioTracks: () => [{ enabled: true }],
      getVideoTracks: () => [],
      getTracks: () => [{ kind: 'audio', enabled: true, stop: vi.fn() }],
    };
    s.state.localStream = fakeStream;
    expect(s.toggleMute()).toBe(true);
    expect(s.toggleMute()).toBe(false);
  });

  it('toggleVideo sans stream → return false', () => {
    const ws = makeWS();
    const s = createVisioSession({ convId: 'c', userId: 'u', type: 'video', ws, deps: baseDeps });
    expect(s.toggleVideo()).toBe(false);
  });

  it('toggleVideo avec stream → flip videoOff', async () => {
    const ws = makeWS();
    const s = createVisioSession({ convId: 'c', userId: 'u', type: 'video', ws, deps: baseDeps });
    s.state.localStream = {
      getVideoTracks: () => [{ enabled: true }],
      getAudioTracks: () => [],
      getTracks: () => [{ kind: 'video', enabled: true, stop: vi.fn() }],
    };
    expect(s.toggleVideo()).toBe(true);
    expect(s.toggleVideo()).toBe(false);
  });
});

// ----------------------------------------------------------------------------
describe('createVisioSession — toggleScreenShare', () => {
  it('start screen share → replaceTrack sur tous peers', async () => {
    const ws = makeWS();
    const s = createVisioSession({ convId: 'c', userId: 'u', type: 'video', ws, deps: baseDeps });
    await s.startLocalStream();
    await s.inviteUser('peer2');
    const result = await s.toggleScreenShare();
    expect(result).toBe(true);
    expect(s.state.screenStream).not.toBeNull();
    const senders = s.state.peers.get('peer2').pc.getSenders();
    const vidSender = senders.find((sd) => sd.track?.kind === 'video');
    expect(vidSender.replaceTrack).toHaveBeenCalled();
  });

  it('stop screen share → revient à caméra', async () => {
    const ws = makeWS();
    const s = createVisioSession({ convId: 'c', userId: 'u', type: 'video', ws, deps: baseDeps });
    await s.startLocalStream();
    await s.inviteUser('peer2');
    await s.toggleScreenShare(); // start
    const stopped = await s.toggleScreenShare(); // stop
    expect(stopped).toBe(false);
    expect(s.state.screenStream).toBeNull();
  });

  it('stop screen share sans localStream → just stop screen', async () => {
    const ws = makeWS();
    const s = createVisioSession({ convId: 'c', userId: 'u', type: 'video', ws, deps: baseDeps });
    await s.startLocalStream();
    await s.inviteUser('peer2');
    await s.toggleScreenShare();
    s.state.localStream = null;
    const stopped = await s.toggleScreenShare();
    expect(stopped).toBe(false);
  });
});

// ----------------------------------------------------------------------------
describe('createVisioSession — removePeer + end', () => {
  it('removePeer ferme PC + onPeerLeave', async () => {
    const ws = makeWS();
    const onLeave = vi.fn();
    const s = createVisioSession({
      convId: 'c', userId: 'u', type: 'audio', ws, onPeerLeave: onLeave, deps: baseDeps,
    });
    await s.startLocalStream();
    await s.inviteUser('peer2');
    s.removePeer('peer2');
    expect(s.state.peers.has('peer2')).toBe(false);
    expect(onLeave).toHaveBeenCalledWith('peer2');
  });

  it('removePeer inconnu → no-op', () => {
    const ws = makeWS();
    const s = createVisioSession({ convId: 'c', userId: 'u', type: 'audio', ws, deps: baseDeps });
    expect(() => s.removePeer('inconnu')).not.toThrow();
  });

  it('removePeer pc.close() throw → catch silent', async () => {
    const ws = makeWS();
    const s = createVisioSession({ convId: 'c', userId: 'u', type: 'audio', ws, deps: baseDeps });
    await s.startLocalStream();
    await s.inviteUser('peer2');
    const peer = s.state.peers.get('peer2');
    peer.pc.close = () => { throw new Error('already closed'); };
    expect(() => s.removePeer('peer2')).not.toThrow();
  });

  it('end() ferme tous peers + stop streams + envoie call-end', async () => {
    const ws = makeWS();
    const s = createVisioSession({ convId: 'c', userId: 'u', type: 'video', ws, deps: baseDeps });
    await s.startLocalStream();
    await s.inviteUser('peer2');
    await s.inviteUser('peer3');
    await s.toggleScreenShare();
    expect(s.state.peers.size).toBe(2);
    s.end();
    expect(s.state.peers.size).toBe(0);
    expect(s.state.localStream).toBeNull();
    expect(s.state.screenStream).toBeNull();
    const callEnd = ws.sent.find((m) => m.type === 'call-end');
    expect(callEnd).toBeDefined();
  });

  it('end() sans streams ni peers → safe', () => {
    const ws = makeWS();
    const s = createVisioSession({ convId: 'c', userId: 'u', type: 'audio', ws, deps: baseDeps });
    expect(() => s.end()).not.toThrow();
  });
});

// ----------------------------------------------------------------------------
describe('createVisioSession — multi-user mesh (3-4 peers)', () => {
  it('mesh 3 users → 2 peers chez chacun', async () => {
    const ws = makeWS();
    const u1 = createVisioSession({ convId: 'c', userId: 'u1', type: 'video', ws, deps: baseDeps });
    await u1.startLocalStream();
    await u1.inviteUser('u2');
    await u1.inviteUser('u3');
    expect(u1.state.peers.size).toBe(2);
  });

  it('ws non OPEN → send no-op (pas de crash)', () => {
    const ws = { readyState: 0, send: vi.fn() }; // pas OPEN
    const s = createVisioSession({ convId: 'c', userId: 'u', type: 'audio', ws, deps: baseDeps });
    expect(() => s.end()).not.toThrow();
    expect(ws.send).not.toHaveBeenCalled();
  });

  it('ws absent → send no-op', () => {
    const s = createVisioSession({ convId: 'c', userId: 'u', type: 'audio', ws: null, deps: baseDeps });
    expect(() => s.end()).not.toThrow();
  });

  /* === v1.1.252 — serveurs ICE injectables (TURN, audit amélioration Top #5) === */
  it('opts.iceServers fourni → utilisé pour CHAQUE peer (initiator ET receiver)', async () => {
    const turn = [{ urls: 'turn:turn.cloudflare.com:3478', username: 'u', credential: 'c' }];
    const ws = makeWS();
    const s = createVisioSession({ convId: 'c', userId: 'me', type: 'audio', ws, deps: baseDeps, iceServers: turn });
    const p1 = await s.inviteUser('alice');
    expect(p1.pc.config.iceServers).toBe(turn);
    await s.onOffer('bob', { type: 'offer', sdp: 'x' });
    expect(s.state.peers.get('bob').pc.config.iceServers).toBe(turn);
  });

  it('opts.iceServers absent/vide → fallback STUN ICE_SERVERS', async () => {
    const ws = makeWS();
    const s1 = createVisioSession({ convId: 'c', userId: 'me', type: 'audio', ws, deps: baseDeps });
    const p1 = await s1.inviteUser('alice');
    expect(p1.pc.config.iceServers).toBe(ICE_SERVERS);
    const s2 = createVisioSession({ convId: 'c', userId: 'me', type: 'audio', ws, deps: baseDeps, iceServers: [] });
    const p2 = await s2.inviteUser('bob');
    expect(p2.pc.config.iceServers).toBe(ICE_SERVERS);
  });
});
