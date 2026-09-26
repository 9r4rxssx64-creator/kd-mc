/**
 * Apex Chat — Visio conférence multi-participants (mesh P2P, jusqu'à 4)
 *
 * Architecture : full-mesh P2P (chaque user crée N-1 RTCPeerConnection).
 *   - Avantage : pas de serveur SFU/MCU, E2E garanti, gratuit
 *   - Limite : bande passante O(N²), bon jusqu'à 4 personnes max
 *   - Au-delà : passer à SFU (Cloudflare Calls / livekit / mediasoup)
 *
 * Signaling via ConversationDO WebSocket (relay webrtc-offer/answer/candidate
 * avec `to:userId` pour cibler le destinataire).
 *
 * Module ESM testable 100% (mocks RTCPeerConnection + getUserMedia).
 */

'use strict';

export const ICE_SERVERS = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' },
];

/**
 * Crée une session visio multi-user.
 * @param {object} opts
 * @param {string} opts.convId - ID conversation
 * @param {string} opts.userId - ID local
 * @param {'audio'|'video'} opts.type
 * @param {WebSocket} opts.ws - WS pour signaling (envoie offer/answer/candidate)
 * @param {object} [opts.deps] - Injection dépendances pour tests
 *   (RTCPeerConnection, getUserMedia, getDisplayMedia)
 */
export function createVisioSession(opts) {
  const { convId, userId, type, ws } = opts;
  /* v1.1.252 (audit amélioration Top #5) : serveurs ICE INJECTABLES — le mesh était
     STUN-only en dur = échec garanti en 4G/NAT symétrique. L'app passe désormais
     STUN + TURN Cloudflare (K._ensureIceServers). Fallback : constantes STUN. */
  const iceServers = (Array.isArray(opts.iceServers) && opts.iceServers.length) ? opts.iceServers : ICE_SERVERS;
  const RTCPeer = opts.deps?.RTCPeerConnection || (typeof RTCPeerConnection !== 'undefined' ? RTCPeerConnection : null);
  const getUserMedia = opts.deps?.getUserMedia ||
    ((c) => navigator.mediaDevices.getUserMedia(c));
  const getDisplayMedia = opts.deps?.getDisplayMedia ||
    ((c) => navigator.mediaDevices.getDisplayMedia(c));

  if (!RTCPeer) throw new Error('WebRTC non supporté');

  /** @type {Map<string, {pc: RTCPeerConnection, remoteStream: MediaStream}>} */
  const peers = new Map();
  const state = {
    convId,
    userId,
    type,
    peers,
    localStream: null,
    screenStream: null,
    muted: false,
    videoOff: false,
    onRemoteStream: opts.onRemoteStream || (() => {}),
    onPeerLeave: opts.onPeerLeave || (() => {}),
    onStateChange: opts.onStateChange || (() => {}),
  };

  function send(payload) {
    if (ws && ws.readyState === 1 /* WebSocket.OPEN */) {
      ws.send(JSON.stringify({ ...payload, convId, from: userId }));
    }
  }

  /** Initialise local stream + ajoute aux peers existants */
  async function startLocalStream() {
    const constraints = { audio: true, video: type === 'video' };
    state.localStream = await getUserMedia(constraints);
    // Ajouter aux peers existants
    for (const { pc } of peers.values()) {
      state.localStream.getTracks().forEach((t) => pc.addTrack(t, state.localStream));
    }
    return state.localStream;
  }

  /** Crée une PeerConnection vers un user (initiator = on envoie offer) */
  async function inviteUser(remoteUserId) {
    if (peers.has(remoteUserId)) return peers.get(remoteUserId);
    const pc = new RTCPeer({ iceServers });
    const peerState = { pc, remoteStream: null };
    peers.set(remoteUserId, peerState);

    if (state.localStream) {
      state.localStream.getTracks().forEach((t) => pc.addTrack(t, state.localStream));
    }
    pc.ontrack = (e) => {
      peerState.remoteStream = e.streams[0];
      state.onRemoteStream(remoteUserId, e.streams[0]);
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) send({ type: 'webrtc-candidate', to: remoteUserId, candidate: e.candidate });
    };
    pc.onconnectionstatechange = () => {
      state.onStateChange(remoteUserId, pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        removePeer(remoteUserId);
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    send({ type: 'webrtc-offer', to: remoteUserId, offer, callType: type });
    return peerState;
  }

  /** Reçoit offer d'un user (receiver = on envoie answer) */
  async function onOffer(remoteUserId, offer) {
    let peerState = peers.get(remoteUserId);
    if (!peerState) {
      const pc = new RTCPeer({ iceServers });
      peerState = { pc, remoteStream: null };
      peers.set(remoteUserId, peerState);
      if (state.localStream) {
        state.localStream.getTracks().forEach((t) => pc.addTrack(t, state.localStream));
      }
      pc.ontrack = (e) => {
        peerState.remoteStream = e.streams[0];
        state.onRemoteStream(remoteUserId, e.streams[0]);
      };
      pc.onicecandidate = (e) => {
        if (e.candidate) send({ type: 'webrtc-candidate', to: remoteUserId, candidate: e.candidate });
      };
      pc.onconnectionstatechange = () => {
        state.onStateChange(remoteUserId, pc.connectionState);
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          removePeer(remoteUserId);
        }
      };
    }
    await peerState.pc.setRemoteDescription(offer);
    const answer = await peerState.pc.createAnswer();
    await peerState.pc.setLocalDescription(answer);
    send({ type: 'webrtc-answer', to: remoteUserId, answer });
  }

  /** Reçoit answer (initiator) */
  async function onAnswer(remoteUserId, answer) {
    const peerState = peers.get(remoteUserId);
    if (!peerState) return;
    await peerState.pc.setRemoteDescription(answer);
  }

  /** Reçoit ICE candidate */
  async function onCandidate(remoteUserId, candidate) {
    const peerState = peers.get(remoteUserId);
    if (!peerState) return;
    try {
      await peerState.pc.addIceCandidate(candidate);
    } catch {
      // Ignore : candidate peut arriver avant remote description
    }
  }

  /** Toggle micro */
  function toggleMute() {
    if (!state.localStream) return state.muted;
    state.muted = !state.muted;
    state.localStream.getAudioTracks().forEach((t) => { t.enabled = !state.muted; });
    return state.muted;
  }

  /** Toggle vidéo */
  function toggleVideo() {
    if (!state.localStream) return state.videoOff;
    state.videoOff = !state.videoOff;
    state.localStream.getVideoTracks().forEach((t) => { t.enabled = !state.videoOff; });
    return state.videoOff;
  }

  /** Partage écran (replace video track) */
  async function toggleScreenShare() {
    if (state.screenStream) {
      // Stop screen share, retour caméra
      state.screenStream.getTracks().forEach((t) => t.stop());
      state.screenStream = null;
      const camTrack = state.localStream?.getVideoTracks()[0];
      if (camTrack) {
        for (const { pc } of peers.values()) {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) await sender.replaceTrack(camTrack);
        }
      }
      return false;
    }
    const screen = await getDisplayMedia({ video: true, audio: false });
    state.screenStream = screen;
    const screenTrack = screen.getVideoTracks()[0];
    for (const { pc } of peers.values()) {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) await sender.replaceTrack(screenTrack);
    }
    return true;
  }

  /** Retire un peer (peer left / failed) */
  function removePeer(remoteUserId) {
    const peerState = peers.get(remoteUserId);
    if (!peerState) return;
    try { peerState.pc.close(); } catch { /* already closed */ }
    peers.delete(remoteUserId);
    state.onPeerLeave(remoteUserId);
  }

  /** End call : ferme tous peers + stop streams */
  function end() {
    for (const remoteUserId of [...peers.keys()]) removePeer(remoteUserId);
    if (state.localStream) state.localStream.getTracks().forEach((t) => t.stop());
    if (state.screenStream) state.screenStream.getTracks().forEach((t) => t.stop());
    state.localStream = null;
    state.screenStream = null;
    send({ type: 'call-end' });
  }

  return {
    state,
    startLocalStream,
    inviteUser,
    onOffer,
    onAnswer,
    onCandidate,
    toggleMute,
    toggleVideo,
    toggleScreenShare,
    removePeer,
    end,
  };
}

// Compat browser : expose window.ApexVisio pour usage direct sans bundler
if (typeof window !== 'undefined') {
  window.ApexVisio = { createVisioSession };
  window.ApexVisio.ICE_SERVERS = ICE_SERVERS;
}
