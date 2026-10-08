// Garde (audit E2E client, v1.1.294) — justesse du chiffrement de bout en bout
// côté CLIENT. Le code testé est EXTRAIT de la vraie page (index.html, via
// client-extract.js) et tourne avec la VRAIE crypto (lib/crypto-core.js : ECDH
// P-256 + AES-GCM) : un « pair » simulé tente réellement de déchiffrer ce qui
// part sur le fil.
//
//  1. GROUPES : le serveur ne donne qu'UN peer_pubkey par groupe (le dernier
//     membre vu) → l'ancien client chiffrait pour CE membre seulement (les
//     autres voyaient « impossible à lire ») et le « pair » changeait avec
//     last_seen (fausses alertes « clé changée »). Un groupe passe désormais
//     par le chemin NON-E2E explicite (decideWire « clear ») avec un indicateur
//     honnête dans l'en-tête ; aucune session 1:1, aucune alerte de clé.
//  2. CHEMINS QUI CONTOURNAIENT decideWire : position (APXLOC1), message
//     programmé, édition, carte de contact, sondage, position live → même
//     décision que le texte ; jamais de clair silencieux dans un DM chiffré ;
//     un message programmé ne dit plus « envoyé » si le WS n'est pas ouvert.
//  3. TOFU STRICT : une clé de contact différente de la clé épinglée n'est
//     jamais adoptée en silence (bundle OU liste des conversations) ; bandeau
//     persistant + action explicite « J'ai vérifié, accepter la nouvelle clé ».
//  4. Un message reçu SANS préfixe E2E dans un DM chiffré porte un marqueur
//     visible « non chiffré ».
//
// Discriminant (prouvé par sabotage d'une copie d'index.html via
// CLIENT_INDEX_PATH) : chaque correctif retiré fait échouer sa section.
import { describe, it, expect } from 'vitest';
import { loadDefs, readIndex, extractDef, realEsc } from './client-extract.js';
import * as CC from '../../lib/crypto-core.js';

const DEFS = [
  'K._e2eOn = function(){',
  'K._E2E_TAG = ',
  'K._RATCHET_TAG = ',
  'K._ratchetOn = function(){',
  'K._convIsDm = function(conv){',
  'K._e2eAppliesTo = function(conv){',
  'K._GROUP_E2E_NOTICE = ',
  'K._e2eActive = function(conv){',
  'K._notifyKeyChange = function(conv){',
  'K._pinnedPeerKey = function(convId){',
  'K._pendingPeerKey = function(convId){',
  'K._keyChangePending = function(conv){',
  'K._tofuPeerKey = function(conv, freshPub){',
  'K._tofuCheckConvList = function(convs){',
  'K._acceptPeerKeyChange = async function(convId){',
  'K._renderKeyChangeBanner = function(conv){',
  'K._ensureSession = async function(conv, force){',
  'K._healFetchAt = ',
  'K._decryptE2EHeal = async function(convId, ct){',
  'K._sendRefreshAt = ',
  'K._ensureFreshSession = async function(conv){',
  'K._encryptOutgoing = async function(conv, plaintext){',
  'K._dispatchWire = function(convId, wire){',
  'K._sendSecure = async function(conv, plaintext, opts){',
  'K._pendingToastText = function(conv){',
  'K._sendMsg = async function(){',
  'K._queuePendingEncrypt = function(item){',
  'K._flushPendingEncrypt = async function(convId){',
  'K._outboxAdd = function(item){',
  'K._outboxRemove = function(id){',
  'K._flushOutboxFor = function(convId){',
  'K._locationUpdateAllowed = function(conv){',
  'K._parseLocationMarker = function(txt){',
  'K._sendLocationMsg = function(lat, lng, accuracy, expiresAt){',
  'K._sendContactCard = function(){',
  'K._parseContactMarker = function(txt){',
  'K._parsePollMarker = function(txt){',
  'K._sendPoll = function(){',
  'K._runScheduledDue = async function(){',
  'K._saveEditMsg = async function(msgId){',
  'K._parseMediaMarker = function(txt){',
  'K._sendMediaMessage = async function(media, captionOverride){',
  'K._decodeIncoming = async function(convId, raw){',
  'K._markerFields = function(txt){',
  'K._unencryptedBadge = function(m){',
  'K._chatHeaderSubtitle = function(conv){',
];

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _m: m,
  };
}

let seq = 0;
async function newPeer() {
  const keys = await CC.generateIdentityKeys();
  return { keys, pub: await CC.exportPublicKey(keys.publicKey) };
}

// Le pair (destinataire) déchiffre un payload « E2E1:… » avec SA clé privée.
async function peerDecrypt(peer, myPub, payload) {
  const id = 'peer-side-' + (++seq);
  await CC.establishSession(id, peer.keys.privateKey, await CC.importPublicKey(myPub));
  return CC.decryptForConv(id, payload.slice('E2E1:'.length));
}

async function harness({ conv, bundlePub = null, wsOpen = true, wsConvId, e2e = true, dom = {} } = {}) {
  const store = {};
  const ls = (k, v) => { store[k] = JSON.parse(JSON.stringify(v)); };
  const lg = (k, d) => (k in store ? JSON.parse(JSON.stringify(store[k])) : d);
  const localStorage = memStorage();
  if (!e2e) localStorage.setItem('apex_chat_e2e', '0');
  const sent = [];
  const toasts = [];
  const apiCalls = [];
  const me = await CC.generateIdentityKeys();
  const myPub = await CC.exportPublicKey(me.publicKey);
  const K = {
    user: { id: 'me' }, messages: {}, conversations: [conv], viewData: conv,
    ws: { readyState: wsOpen ? 1 : 3, send: (s) => sent.push(JSON.parse(s)) },
    _wsConvId: wsConvId === undefined ? conv.id : wsConvId,
    _E2E_ENABLED: true, token: 'tok', view: 'chat',
    _cryptoKeys: me, __bundlePub: bundlePub,
    render() {}, _closeModal() {}, _clearDraft() {}, _renderReplyBanner() {},
    _canEditMsg: () => true,
    _presenceLabel: () => 'LIBELLE-DM',
  };
  K._api = async (method, path) => {
    apiCalls.push(method + ' ' + path);
    if (K.__bundlePub) return { ok: true, bundle: { identity_key_pub: K.__bundlePub, crypto_caps: '' } };
    throw new Error('409 key_pending');
  };
  const ApexCrypto = { ...CC };
  const input = { value: '' };
  const document = {
    getElementById: (id) => (id in dom ? { value: dom[id], checked: !!dom[id] } : null),
    querySelectorAll: () => (dom.__pollOpts || []).map((v) => ({ value: v })),
  };
  const g = {
    K, window: { ApexCrypto }, ApexCrypto, localStorage, WebSocket: { OPEN: 1 },
    toast: (m) => toasts.push(String(m)), ls, lg, _safeCatch: () => {}, esc: realEsc(),
    console: { log() {}, warn() {}, error() {} }, _ensureCryptoKeys: async () => {},
    $: () => input, document,
  };
  loadDefs(DEFS, g);
  return { K, sent, toasts, store, localStorage, input, apiCalls, myPub, ApexCrypto };
}

const dm = (id, extra = {}) => ({ id, type: 'dm', peer_id: 'u_peer', name: 'Laurence', ...extra });

// ---------------------------------------------------------------------------
describe('1. groupes : jamais de session E2E 1:1, indicateur honnête', () => {
  for (const type of ['group', 'community', 'channel']) {
    it(`1a. ${type} : _sendMsg envoie par le chemin non-E2E explicite (pas de E2E1 pour UN membre)`, async () => {
      const member = await newPeer();
      const conv = { id: 'g_' + type + (++seq), type, name: 'Équipe', peer_id: 'u_last', peer_pubkey: member.pub, member_count: 5 };
      const h = await harness({ conv, bundlePub: member.pub });
      h.input.value = 'bonjour le groupe';
      await h.K._sendMsg();
      expect(h.sent).toHaveLength(1);
      expect(h.sent[0]).toMatchObject({ type: 'message', ciphertext: 'bonjour le groupe' });
      expect(CC.getSessionKey(conv.id)).toBeFalsy();          // aucune session 1:1
      expect(h.localStorage.getItem('peerkey_' + conv.id)).toBeNull();
      expect(h.store.pending_encrypt || []).toHaveLength(0);
    });
  }

  it('1b. groupe : _ensureSession refuse, et un « pair » qui change ne déclenche aucune alerte', async () => {
    const a = await newPeer();
    const b = await newPeer();
    const conv = { id: 'g_alert' + (++seq), type: 'group', peer_id: 'u_a', peer_pubkey: a.pub, member_count: 4 };
    const h = await harness({ conv, bundlePub: a.pub });
    expect(await h.K._ensureSession(conv)).toBe(false);
    conv.peer_pubkey = b.pub; h.K.__bundlePub = b.pub;      // last_seen a changé de membre
    expect(await h.K._ensureSession(conv, true)).toBe(false);
    h.K._tofuCheckConvList([conv]);
    expect(h.toasts.join(' ')).not.toMatch(/clé de sécurité/);
    expect(conv._key_changed).toBeFalsy();
    expect(h.K._renderKeyChangeBanner(conv)).toBe('');
  });

  it('1c. groupe : médias et pièces → marqueur non-E2E, jamais la session d\'un membre', async () => {
    const member = await newPeer();
    const conv = { id: 'g_media' + (++seq), type: 'group', peer_id: 'u_m', peer_pubkey: member.pub };
    const h = await harness({ conv, bundlePub: member.pub });
    await h.K._sendMediaMessage({ url: 'https://x/m.jpg', mime: 'image/jpeg', name: 'm.jpg', size: 3, enc: false }, '');
    expect(h.sent[0].ciphertext.startsWith('APXMEDIA1:')).toBe(true);
  });

  it('1d. en-tête : groupe = mention « pas de bout en bout » (aucun cadenas E2E) ; DM inchangé', async () => {
    const conv = { id: 'g_hdr', type: 'group', member_count: 3 };
    const h = await harness({ conv });
    const sub = h.K._chatHeaderSubtitle(conv);
    expect(sub).toContain('pas de bout en bout');
    expect(sub).not.toMatch(/🛡|E2E/);
    expect(h.K._chatHeaderSubtitle({ id: 'c', type: 'channel' })).toContain('pas de bout en bout');
    expect(h.K._chatHeaderSubtitle(dm('d_hdr'))).toBe('LIBELLE-DM');
    expect(h.K._e2eActive(conv)).toBe(false);
  });

  it('1e. groupe : un ancien E2E1 reçu → note honnête, sans re-fetch de clé ni alerte', async () => {
    const conv = { id: 'g_rx' + (++seq), type: 'group', peer_id: 'u_x' };
    const h = await harness({ conv, bundlePub: (await newPeer()).pub });
    const r = await h.K._decodeIncoming(conv.id, 'E2E1:AAAA');
    expect(r.text).toMatch(/illisible dans un groupe/);
    expect(h.apiCalls).toHaveLength(0);
  });

  it('1f. contrôle : un DM reste chiffré E2E et le pair le lit', async () => {
    const peer = await newPeer();
    const conv = dm('d_ctl' + (++seq), { peer_pubkey: peer.pub });
    const h = await harness({ conv, bundlePub: peer.pub });
    h.input.value = 'secret';
    await h.K._sendMsg();
    expect(h.sent[0].ciphertext.startsWith('E2E1:')).toBe(true);
    expect(await peerDecrypt(peer, h.myPub, h.sent[0].ciphertext)).toBe('secret');
  });
});

// ---------------------------------------------------------------------------
describe('2. aucun chemin ne contourne la décision de chiffrement (DM, E2E ON)', () => {
  it('2a. position sans clé du contact → rien en clair, mise en attente visible', async () => {
    const conv = dm('d_loc0' + (++seq));               // ni peer_pubkey ni bundle
    const h = await harness({ conv });
    h.K._sendLocationMsg(43.7, 7.4, 10, null);
    expect(await h.K._lastLocationSend).toBe('pending');
    expect(h.sent).toHaveLength(0);
    expect(JSON.stringify(h.store.outbox || [])).not.toContain('APXLOC1');
    expect(h.store.pending_encrypt).toHaveLength(1);
    expect(h.K.messages[conv.id][0].pending_encrypt).toBe(true);
  });

  it('2b. position avec clé → E2E1, déchiffrable par le pair', async () => {
    const peer = await newPeer();
    const conv = dm('d_loc1' + (++seq), { peer_pubkey: peer.pub });
    const h = await harness({ conv, bundlePub: peer.pub });
    h.K._sendLocationMsg(43.7, 7.4, 10, null);
    expect(await h.K._lastLocationSend).toBe('sent');
    expect(h.sent[0].ciphertext.startsWith('E2E1:')).toBe(true);
    expect(await peerDecrypt(peer, h.myPub, h.sent[0].ciphertext)).toMatch(/^APXLOC1:/);
  });

  it('2c. message programmé : chiffré, et mis en file (pas « envoyé ») si le WS de la conv n\'est pas ouvert', async () => {
    const peer = await newPeer();
    const conv = dm('d_sch' + (++seq), { peer_pubkey: peer.pub });
    const h = await harness({ conv, bundlePub: peer.pub, wsConvId: 'une_autre_conv' });
    h.store.ax_scheduled_msgs = [
      { id: 's1', convId: conv.id, convName: 'Laurence', text: 'rdv 18h', sendAt: Date.now() - 1000 },
      { id: 's2', convId: 'pas_encore_chargee', convName: 'X', text: 'plus tard', sendAt: Date.now() - 1000 },
    ];
    const res = await h.K._runScheduledDue();
    expect(res).toEqual(['queued']);
    expect(h.sent).toHaveLength(0);                         // le WS ouvert est celui d'une AUTRE conv
    expect(h.store.outbox).toHaveLength(1);
    expect(h.store.outbox[0].ciphertext.startsWith('E2E1:')).toBe(true);
    expect(await peerDecrypt(peer, h.myPub, h.store.outbox[0].ciphertext)).toBe('rdv 18h');
    expect(h.toasts.join(' ')).not.toMatch(/programmé envoyé/);
    // la conv introuvable n'est pas perdue : le message reste programmé
    expect(h.store.ax_scheduled_msgs.map((s) => s.id)).toEqual(['s2']);
  });

  it('2d. message programmé sans clé → en attente de chiffrement, jamais en clair', async () => {
    const conv = dm('d_sch0' + (++seq));
    const h = await harness({ conv });
    h.store.ax_scheduled_msgs = [{ id: 's3', convId: conv.id, convName: 'L', text: 'clair ?', sendAt: 0 }];
    expect(await h.K._runScheduledDue()).toEqual(['pending']);
    expect(h.sent).toHaveLength(0);
    expect(h.store.outbox || []).toHaveLength(0);
    expect(h.store.pending_encrypt[0]).toMatchObject({ conv_id: conv.id, text: 'clair ?' });
  });

  it('2e. édition : sans session → jamais new_text en clair ; la file l\'envoie chiffrée dès que la clé arrive', async () => {
    const peer = await newPeer();
    const conv = dm('d_edit' + (++seq));
    const h = await harness({ conv, dom: { 'edit-msg-input': 'texte corrigé' } });
    h.K.messages[conv.id] = [{ id: 'srv-1', from: 'me', text: 'texte', ts: 1 }];
    expect(await h.K._saveEditMsg('srv-1')).toBe('pending');
    expect(h.sent).toHaveLength(0);
    expect(h.store.pending_encrypt[0]).toMatchObject({ kind: 'edit', message_id: 'srv-1' });
    // la clé du contact arrive → flush
    conv.peer_pubkey = peer.pub; h.K.__bundlePub = peer.pub;
    await h.K._flushPendingEncrypt(conv.id);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]).toMatchObject({ type: 'edit_message', message_id: 'srv-1' });
    expect(h.sent[0].new_text).toBeUndefined();
    expect(await peerDecrypt(peer, h.myPub, h.sent[0].ciphertext)).toBe('texte corrigé');
    expect(h.store.pending_encrypt).toHaveLength(0);
  });

  it('2f. édition hors-ligne avec session → chiffrée dans l\'outbox (rejouée en edit_message)', async () => {
    const peer = await newPeer();
    const conv = dm('d_edit2' + (++seq), { peer_pubkey: peer.pub });
    const h = await harness({ conv, bundlePub: peer.pub, wsOpen: false, dom: { 'edit-msg-input': 'v2' } });
    h.K.messages[conv.id] = [{ id: 'srv-2', from: 'me', text: 'v1', ts: 1 }];
    expect(await h.K._saveEditMsg('srv-2')).toBe('queued');
    expect(h.store.outbox[0]).toMatchObject({ kind: 'edit', message_id: 'srv-2' });
    h.K.ws.readyState = 1;
    expect(h.K._flushOutboxFor(conv.id)).toBe(1);
    expect(h.sent[0].type).toBe('edit_message');
    expect(await peerDecrypt(peer, h.myPub, h.sent[0].ciphertext)).toBe('v2');
  });

  it('2g. carte de contact et sondage : plus de trame en clair, chemin message chiffré, relu par le pair', async () => {
    const peer = await newPeer();
    const conv = dm('d_vc' + (++seq), { peer_pubkey: peer.pub });
    const h = await harness({ conv, bundlePub: peer.pub, dom: {
      'vc-name': 'Laurence S', 'vc-phone': '+33600000000', 'vc-email': '', 'vc-org': '',
      'poll-question': 'Ce soir ?', 'poll-multi': false, __pollOpts: ['oui', 'non'],
    } });
    expect(await h.K._sendContactCard()).toBe('sent');
    expect(await h.K._sendPoll()).toBe('sent');
    expect(h.sent.map((w) => w.type)).toEqual(['message', 'message']);
    const raw = JSON.stringify(h.sent);
    expect(raw).not.toContain('+33600000000');
    expect(raw).not.toContain('Ce soir');
    const vc = await peerDecrypt(peer, h.myPub, h.sent[0].ciphertext);
    expect(h.K._parseContactMarker(vc)).toMatchObject({ name: 'Laurence S', phone: '+33600000000' });
    const poll = await peerDecrypt(peer, h.myPub, h.sent[1].ciphertext);
    expect(h.K._markerFields(poll).poll).toMatchObject({ question: 'Ce soir ?', options: ['oui', 'non'] });
  });

  it('2h. position live : pas de coordonnées en clair dans un DM chiffré (groupe / E2E coupé : inchangé)', async () => {
    const h = await harness({ conv: dm('d_live') });
    expect(h.K._locationUpdateAllowed(dm('d_live'))).toBe(false);
    expect(h.K._locationUpdateAllowed({ id: 'g', type: 'group' })).toBe(true);
    const off = await harness({ conv: dm('d_live2'), e2e: false });
    expect(off.K._locationUpdateAllowed(dm('d_live2'))).toBe(true);
    // et la page passe bien par ce garde
    expect(readIndex()).toMatch(/if\(K\._locationUpdateAllowed\(conv\) && K\.ws && K\.ws\.readyState === 1\)\{\s*\n\s*try \{ K\.ws\.send\(JSON\.stringify\(\{ type: 'location_update'/);
  });

  it('2i. E2E coupé (opt-out explicite) : le chemin clair assumé fonctionne toujours (pas de régression d\'envoi)', async () => {
    const conv = dm('d_off' + (++seq));
    const h = await harness({ conv, e2e: false });
    h.K._sendLocationMsg(1, 2, 3, null);
    expect(await h.K._lastLocationSend).toBe('sent');
    expect(h.sent[0].ciphertext.startsWith('APXLOC1:')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('3. TOFU strict : jamais d\'adoption silencieuse d\'une nouvelle clé', () => {
  it('3a. 1ʳᵉ vue épinglée sans alerte (comportement conservé)', async () => {
    const peer = await newPeer();
    const conv = dm('d_t1' + (++seq), { peer_pubkey: peer.pub });
    const h = await harness({ conv });
    expect(await h.K._ensureSession(conv)).toBe(true);
    expect(h.localStorage.getItem('peerkey_' + conv.id)).toBe(peer.pub);
    expect(h.toasts).toHaveLength(0);
  });

  it('3b. clé du BUNDLE différente → la session reste sur la clé épinglée, alerte persistante', async () => {
    const old = await newPeer();
    const mitm = await newPeer();
    const conv = dm('d_t2' + (++seq), { peer_pubkey: old.pub });
    const h = await harness({ conv, bundlePub: old.pub });
    await h.K._ensureSession(conv);                          // épingle old
    h.K.__bundlePub = mitm.pub;                               // le serveur substitue une clé
    await h.K._ensureSession(conv, true);
    expect(h.localStorage.getItem('peerkey_' + conv.id)).toBe(old.pub);
    expect(h.localStorage.getItem('peerkey_pending_' + conv.id)).toBe(mitm.pub);
    // ce qui part est lisible par l'ANCIEN pair, pas par la clé substituée
    const ct = 'E2E1:' + await CC.encryptForConv(conv.id, 'test');
    expect(await peerDecrypt(old, h.myPub, ct)).toBe('test');
    await expect(peerDecrypt(mitm, h.myPub, ct)).rejects.toBeTruthy();
    const banner = h.K._renderKeyChangeBanner(conv);
    expect(banner).toContain('a changé');
    expect(banner).toContain('J\'ai vérifié, accepter la nouvelle clé');
    expect(h.toasts.filter((t) => /clé de sécurité/.test(t))).toHaveLength(1);
  });

  it('3c. clé de la LISTE des conversations différente → même protection (pas d\'alerte en double)', async () => {
    const old = await newPeer();
    const nw = await newPeer();
    const conv = dm('d_t3' + (++seq), { peer_pubkey: old.pub });
    const h = await harness({ conv });
    h.K._tofuCheckConvList([conv]);
    expect(h.localStorage.getItem('peerkey_' + conv.id)).toBe(old.pub);
    conv.peer_pubkey = nw.pub;                                // la liste rafraîchie apporte une autre clé
    h.K._tofuCheckConvList([conv]);
    h.K._tofuCheckConvList([conv]);
    expect(h.K._keyChangePending(conv)).toBe(true);
    expect(h.localStorage.getItem('peerkey_' + conv.id)).toBe(old.pub);
    expect(h.toasts.filter((t) => /clé de sécurité/.test(t))).toHaveLength(1);
    // et la session construite depuis conv.peer_pubkey utilise la clé épinglée
    await h.K._ensureSession(conv);
    const ct = 'E2E1:' + await CC.encryptForConv(conv.id, 'x');
    expect(await peerDecrypt(old, h.myPub, ct)).toBe('x');
  });

  it('3d. tant que non acceptée : rien n\'est envoyé (ni chiffré vers l\'ancienne clé, ni en clair) ; accepter → envoi chiffré vers la nouvelle', async () => {
    const old = await newPeer();
    const nw = await newPeer();
    const conv = dm('d_t4' + (++seq), { peer_pubkey: old.pub });
    const h = await harness({ conv, bundlePub: old.pub });
    await h.K._ensureSession(conv);
    conv.peer_pubkey = nw.pub; h.K.__bundlePub = nw.pub;
    h.K._tofuCheckConvList([conv]);
    h.input.value = 'message sensible';
    await h.K._sendMsg();
    expect(h.sent).toHaveLength(0);
    expect(h.store.pending_encrypt).toHaveLength(1);
    expect(h.toasts.join(' ')).toMatch(/Clé du contact changée/);
    await h.K._flushPendingEncrypt(conv.id);                  // un flush ne contourne pas l'attente
    expect(h.sent).toHaveLength(0);
    // L'utilisateur a comparé le numéro et accepte explicitement
    expect(await h.K._acceptPeerKeyChange(conv.id)).toBe(true);
    expect(h.localStorage.getItem('peerkey_' + conv.id)).toBe(nw.pub);
    expect(h.K._keyChangePending(conv)).toBe(false);
    expect(h.sent).toHaveLength(1);
    expect(await peerDecrypt(nw, h.myPub, h.sent[0].ciphertext)).toBe('message sensible');
    expect(h.store['verified_' + conv.id]).toBe(false);
  });

  it('3e. la clé reçue redevient l\'épinglée → l\'alerte disparaît d\'elle-même', async () => {
    const old = await newPeer();
    const nw = await newPeer();
    const conv = dm('d_t5' + (++seq), { peer_pubkey: old.pub });
    const h = await harness({ conv });
    h.K._tofuCheckConvList([conv]);
    conv.peer_pubkey = nw.pub; h.K._tofuCheckConvList([conv]);
    expect(h.K._keyChangePending(conv)).toBe(true);
    conv.peer_pubkey = old.pub; h.K._tofuCheckConvList([conv]);
    expect(h.K._keyChangePending(conv)).toBe(false);
  });

  it('3f. la page affiche le bandeau dans la conversation et le bouton dans la vérification', () => {
    const html = readIndex();
    expect(html).toContain('${K._renderKeyChangeBanner(conv)}');
    expect(extractDef(html, 'K._openSecurityVerification = async function(){')).toContain('K._acceptPeerKeyChange(');
    expect(extractDef(html, 'K._refreshConvs = async function(){')).toContain('K._tofuCheckConvList');
  });
});

// ---------------------------------------------------------------------------
describe('4. clair reçu dans un DM chiffré → marqueur visible « non chiffré »', () => {
  it('4a. DM + E2E ON : payload sans préfixe marqué ; chiffré valide non marqué', async () => {
    const peer = await newPeer();
    const conv = dm('d_u1' + (++seq), { peer_pubkey: peer.pub });
    const h = await harness({ conv, bundlePub: peer.pub });
    const clear = await h.K._decodeIncoming(conv.id, 'salut');
    expect(clear).toMatchObject({ text: 'salut', encrypted: false, unencrypted: true });
    expect(h.K._unencryptedBadge({ unencrypted: true })).toContain('non chiffré');
    // un vrai message chiffré du pair → pas de marqueur
    const pid = 'peer-send-' + (++seq);
    await CC.establishSession(pid, peer.keys.privateKey, await CC.importPublicKey(h.myPub));
    const ok = await h.K._decodeIncoming(conv.id, 'E2E1:' + await CC.encryptForConv(pid, 'chiffré'));
    expect(ok).toMatchObject({ text: 'chiffré', encrypted: true, unencrypted: false });
    expect(h.K._unencryptedBadge({ text: 'x' })).toBe('');
  });

  it('4b. groupe ou E2E coupé : pas de marqueur (le clair y est le mode assumé)', async () => {
    const g = await harness({ conv: { id: 'g_u', type: 'group' } });
    expect((await g.K._decodeIncoming('g_u', 'salut')).unencrypted).toBe(false);
    const off = await harness({ conv: dm('d_u2'), e2e: false });
    expect((await off.K._decodeIncoming('d_u2', 'salut')).unencrypted).toBe(false);
  });

  it('4c. les chemins de réception (live + historique) et la bulle utilisent ce décodage', () => {
    const html = readIndex();
    const handler = extractDef(html, { m: 'async function _handleWsMessage(data, convId){', end: '\n}\n' });
    expect(handler.match(/K\._decodeIncoming\(convId/g) || []).toHaveLength(2);
    expect(handler).toContain('unencrypted: true');
    expect(extractDef(html, 'K._renderBubble = function(m, conv, msgs){')).toContain('K._unencryptedBadge(m)');
  });
});

// ---------------------------------------------------------------------------
describe('resolvePeerKey (lib/crypto-core.js, pur)', () => {
  it('toutes les branches', () => {
    expect(CC.resolvePeerKey(null, null)).toEqual({ use: null, pin: null, pending: null, alert: false });
    expect(CC.resolvePeerKey('A', '')).toEqual({ use: 'A', pin: null, pending: null, alert: false });
    expect(CC.resolvePeerKey(null, 'A')).toEqual({ use: 'A', pin: 'A', pending: null, alert: false });
    expect(CC.resolvePeerKey('A', 'A')).toEqual({ use: 'A', pin: null, pending: null, alert: false });
    expect(CC.resolvePeerKey('A', 'B')).toEqual({ use: 'A', pin: null, pending: 'B', alert: true });
  });
});
