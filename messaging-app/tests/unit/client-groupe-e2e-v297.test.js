// @vitest-environment node
// Garde E2E de GROUPE v1.1.297 — les 3 trous restants côté client, sur le VRAI code
// (index.html extrait) de PLUSIEURS membres simulés et la VRAIE crypto (lib/crypto-core.js) :
//   1. édition LIÉE à l'id du message (le serveur ne peut pas rejouer le contenu d'un
//      message comme édition d'un autre, même émetteur, même époque) ;
//   2. pièces jointes de groupe chiffrées de bout en bout (octets) ;
//   3. authenticité de l'émetteur (signature ECDSA par appareil).
// Banc partagé : tests/unit/_support/groupe-e2e-harness.js.
// Discriminant : CLIENT_INDEX_PATH / CLIENT_CRYPTO_PATH = copie sabotée → le test concerné échoue.
import { describe, it, expect } from 'vitest';
import { resolveObjectURL } from 'node:buffer';
import { CC, CONV, trio, trioSigned, lastFrames, parse, makeServer, makeMember, fakeEl, dataAttrs } from './_support/groupe-e2e-harness.js';

const REFUSED = '⚠️ modification refusée — elle ne correspond pas à ce message';
const msgFrames = (srv, from) => lastFrames(srv, from).filter((f) => f.ciphertext.startsWith('E2EG1:'));

// A envoie X puis Y ; B les reçoit (ids serveur).
async function twoMessages() {
  const t = await trio();
  await t.A.send('contenu X');
  await t.srv.drain();
  await t.A.send('contenu Y');
  await t.srv.drain();
  const [X, Y] = t.srv.history.filter((r) => r.sender_id === 'alice' && r.ciphertext.startsWith('E2EG1:'));
  return { ...t, X, Y };
}

// ---------------------------------------------------------------------------
describe('1. édition liée à l\'identifiant du message', () => {
  it('1a. format : message lié à son id local (k:m, mid), édition liée à l\'id édité (k:e, sans mid)', async () => {
    const { srv, A, B, X } = await twoMessages();
    const body = parse(X.ciphertext).body;
    expect(body).toMatchObject({ b: 2, k: 'm' });
    expect(A.K.messages[CONV].map((m) => m.id)).toContain(body.mid);   // l'id local du message envoyé
    await A.K._sendSecure(A.conv, 'X corrigé', { edit: { message_id: X.id, edited_at: 7 } });
    const ed = srv.frames.at(-1);
    expect(ed.type).toBe('edit_message');
    expect(parse(ed.ciphertext).body).toMatchObject({ b: 2, k: 'e' });
    expect(parse(ed.ciphertext).body.mid).toBeUndefined();
    await srv.drain();
    expect(B.msg(X.id).text).toBe('X corrigé');
    expect(B.msg(X.id).edit_refused).toBeUndefined();
  });

  it('1b. le serveur rejoue le chiffré du message X comme ÉDITION de Y → refusée, Y inchangé', async () => {
    const { B, X, Y } = await twoMessages();
    await B.handle({ type: 'edit_message', message_id: Y.id, ciphertext: X.ciphertext, new_text: null, edited_at: 9, userId: 'alice' }, CONV);
    expect(B.msg(Y.id).text).toBe('contenu Y');
    expect(B.msg(Y.id).edit_refused).toBe(true);
    expect(B.shown()).toEqual(['contenu X', 'contenu Y']);
  });

  it('1c. une VRAIE édition de X rejouée sur Y → refusée ; sur X → acceptée', async () => {
    const { srv, A, B, X, Y } = await twoMessages();
    srv.drop = () => true;                                // rien livré : le serveur garde la trame
    await A.K._sendSecure(A.conv, 'X modifié', { edit: { message_id: X.id, edited_at: 8 } });
    const editX = srv.frames.at(-1);
    srv.queue = [];
    await B.handle({ type: 'edit_message', message_id: Y.id, ciphertext: editX.ciphertext, edited_at: 8, userId: 'alice' }, CONV);
    expect(B.msg(Y.id).text).toBe('contenu Y');
    expect(B.msg(Y.id).edit_refused).toBe(true);
    await B.handle({ type: 'edit_message', message_id: X.id, ciphertext: editX.ciphertext, edited_at: 8, userId: 'alice' }, CONV);
    expect(B.msg(X.id).text).toBe('X modifié');
  });

  it('1d. une édition rejouée comme NOUVEAU message → mention, jamais le texte', async () => {
    const { srv, A, B, X } = await twoMessages();
    await A.K._sendSecure(A.conv, 'texte de l\'édition', { edit: { message_id: X.id, edited_at: 8 } });
    const editX = srv.frames.at(-1);
    srv.queue = [];
    await B.handle({ type: 'message', id: 'srv_rejeu', sender_id: 'alice', ciphertext: editX.ciphertext, ts: 50 }, CONV);
    const m = B.msg('srv_rejeu');
    expect(m.text).not.toBe('texte de l\'édition');
    expect(m.encrypted).toBe(false);
  });

  it('1e. historique : la ligne éditée se relit ; la même édition collée sur une autre ligne → illisible', async () => {
    const { srv, A, B, X, Y } = await twoMessages();
    await A.K._sendSecure(A.conv, 'X v2', { edit: { message_id: X.id, edited_at: 8 } });
    await srv.drain();
    const B2 = await makeMember(srv, 'bob', { identity: B.keys, idb: B.idb, localStorage: B.localStorage });
    const hist = srv.history.map((r) => ({ ...r }));
    expect(parse(hist.find((r) => r.id === X.id).ciphertext).body.k).toBe('e');
    // serveur malveillant : il copie le contenu (édité) de X sur la ligne Y
    hist.find((r) => r.id === Y.id).ciphertext = hist.find((r) => r.id === X.id).ciphertext;
    await B2.handle({ type: 'history', messages: hist }, CONV);
    expect(B2.msg(X.id).text).toBe('X v2');
    expect(B2.msg(Y.id).text).not.toBe('X v2');
    expect(B2.msg(Y.id).encrypted).toBe(false);
  });

  it('1f. édition au format v1.1.296 (non liée) → refusée ; un MESSAGE v1.1.296 reste lisible', async () => {
    const { srv, A, B, X } = await twoMessages();
    const own = A.idb.kv('gown|' + CONV);
    const legacy = await CC.groupEncrypt(own.key, 'ancien format', { conv: CONV, from: 'alice', epoch: own.epoch, kid: own.kid });
    expect(parse(legacy).body.b).toBeUndefined();
    await B.handle({ type: 'edit_message', message_id: X.id, ciphertext: legacy, edited_at: 9, userId: 'alice' }, CONV);
    expect(B.msg(X.id).text).toBe('contenu X');
    expect(B.msg(X.id).edit_refused).toBe(true);
    await B.handle({ type: 'message', id: 'srv_ancien', sender_id: 'alice', ciphertext: legacy, ts: 60 }, CONV);
    expect(B.msg('srv_ancien')).toMatchObject({ text: 'ancien format', encrypted: true });
  });

  it('1g. édition attribuée à un autre que l\'auteur du message → refusée', async () => {
    const { srv, A, B, C } = await twoMessages();
    await B.send('message de Bob');
    await srv.drain();
    const bobRow = srv.history.find((r) => r.sender_id === 'bob' && r.ciphertext.startsWith('E2EG1:'));
    // Alice édite SON message ; le serveur prétend que c'est une édition du message de Bob
    await A.K._sendSecure(A.conv, 'détourné', { edit: { message_id: bobRow.id, edited_at: 9 } });
    const ed = srv.frames.at(-1);
    srv.queue = [];
    await C.handle({ type: 'edit_message', message_id: bobRow.id, ciphertext: ed.ciphertext, edited_at: 9, userId: 'alice' }, CONV);
    expect(C.msg(bobRow.id).text).toBe('message de Bob');
    expect(C.msg(bobRow.id).edit_refused).toBe(true);
  });

  it('1h. l\'édition en attente (file pending) reste liée à l\'id édité', async () => {
    const { srv, A, B, X } = await twoMessages();
    A.K._grpMembersCache = {};
    srv.membersDown = true;
    expect(await A.K._sendSecure(A.conv, 'X hors-ligne', { edit: { message_id: X.id, edited_at: 11 } })).toBe('pending');
    srv.membersDown = false;
    await A.K._flushPendingEncrypt(CONV);
    const ed = srv.frames.at(-1);
    expect(ed.type).toBe('edit_message');
    expect(parse(ed.ciphertext).body).toMatchObject({ b: 2, k: 'e' });
    await srv.drain();
    expect(B.msg(X.id).text).toBe('X hors-ligne');
    expect(msgFrames(srv, 'alice')).toHaveLength(2);
  });
});

describe('1. primitives (lib/crypto-core.js)', () => {
  const ctx = { conv: 'g1', from: 'alice', epoch: 1, kid: 'k1' };
  it('groupEncrypt lié : mid obligatoire ; groupBoundId : toutes les branches', async () => {
    const key = await CC.importGroupSenderKey(CC.newGroupSenderKey().raw);
    await expect(CC.groupEncrypt(key, 'x', { ...ctx, kind: 'm' })).rejects.toThrow(/identifiant/);
    await expect(CC.groupEncrypt(key, 'x', { ...ctx, kind: 'e', mid: '' })).rejects.toThrow(/identifiant/);
    expect(CC.groupBoundId({ v: 1 }, 'z')).toBeNull();
    expect(CC.groupBoundId({ b: 2, k: 'm', mid: 'm1' }, 'z')).toBe('m1');
    expect(CC.groupBoundId({ b: 2, k: 'e' }, 'srv_9')).toBe('srv_9');
    expect(() => CC.groupBoundId({ b: 2, k: 'e' }, null)).toThrow(/contexte/);
    expect(() => CC.groupBoundId({ b: 2, k: 'e' }, '')).toThrow(/contexte/);
    const e = CC.parseGroupWire(await CC.groupEncrypt(key, 'édité', { ...ctx, kind: 'e', mid: 'srv_1' })).body;
    expect(await CC.groupDecrypt(key, e, { conv: 'g1', from: 'alice', ctxId: 'srv_1' })).toBe('édité');
    await expect(CC.groupDecrypt(key, e, { conv: 'g1', from: 'alice', ctxId: 'srv_2' })).rejects.toThrow();
    await expect(CC.groupDecrypt(key, e, { conv: 'g1', from: 'alice' })).rejects.toThrow(/contexte/);
    const m = CC.parseGroupWire(await CC.groupEncrypt(key, 'msg', { ...ctx, kind: 'm', mid: 'm_1' })).body;
    expect(await CC.groupDecrypt(key, m, { conv: 'g1', from: 'alice', ctxId: 'peu importe' })).toBe('msg');
    // le mid fait partie de l'AAD : le changer dans le corps → refus
    await expect(CC.groupDecrypt(key, { ...m, mid: 'm_2' }, { conv: 'g1', from: 'alice' })).rejects.toThrow();
    // un message présenté comme édition (k changé) → refus
    await expect(CC.groupDecrypt(key, { ...m, k: 'e' }, { conv: 'g1', from: 'alice', ctxId: 'm_1' })).rejects.toThrow();
  });

  it('parseGroupWire : validation du format lié', () => {
    const enc = (o) => 'E2EG1:' + Buffer.from(JSON.stringify(o)).toString('base64');
    const base = { v: 1, epoch: 1, kid: 'k', iv: 'a', ct: 'b' };
    expect(CC.parseGroupWire(enc({ ...base, b: 2, k: 'm', mid: 'x' })).body.mid).toBe('x');
    expect(CC.parseGroupWire(enc({ ...base, b: 2, k: 'e' })).body.k).toBe('e');
    expect(CC.parseGroupWire(enc({ ...base, b: 2, k: 'm' })).body).toBeNull();
    expect(CC.parseGroupWire(enc({ ...base, b: 2, k: 'm', mid: '' })).body).toBeNull();
    expect(CC.parseGroupWire(enc({ ...base, b: 2, k: 'z' })).body).toBeNull();
    expect(CC.parseGroupWire(enc({ ...base, b: 3, k: 'e' })).body).toBeNull();
  });
});

// ---------------------------------------------------------------------------
//  2. Pièces jointes de groupe : octets chiffrés de bout en bout
// ---------------------------------------------------------------------------
const PLAIN = new TextEncoder().encode('%PDF-1.7 CONTRAT CONFIDENTIEL — ne doit jamais être lisible par le stockage. '.repeat(40));
const hasSub = (hay, needle) => Buffer.from(hay).indexOf(Buffer.from(needle)) >= 0;
const blobUrlOf = (h) => (h.match(/(?:href|src)="(blob:[^"]+)"/) || [])[1];
const readBlobUrl = async (u) => new Uint8Array(await resolveObjectURL(u).arrayBuffer());
// Rendu + hydratation RÉELS du message reçu (K._renderMediaEl → K._hydrateEncMedia).
async function hydrate(M, msg) {
  const html = M.K._renderMediaEl(msg);
  const el = fakeEl(dataAttrs(html));
  M.dom.els = [el];
  await M.K._hydrateEncMedia();
  M.dom.els = [];
  return { html, el };
}
async function duo(bobPublishes = true) {
  const srv = makeServer();
  srv.members = ['alice', 'bob'];
  const A = await makeMember(srv, 'alice');
  const B = await makeMember(srv, 'bob', { publish: bobPublishes });
  return { srv, A, B };
}

describe('2. pièces jointes de groupe chiffrées de bout en bout', () => {
  it('2a. le stockage ne reçoit QUE du chiffré ; le destinataire déchiffre des octets identiques', async () => {
    const { srv, A, B, C } = await trio();
    await A.send('premier');                                  // groupe chiffré de bout en bout
    await srv.drain();
    await A.K._uploadMedia(new File([PLAIN], 'contrat.pdf', { type: 'application/pdf' }));
    expect(srv.uploads).toHaveLength(1);
    const up = srv.uploads[0];
    expect(up.ctype).toBe('application/octet-stream');
    expect(hasSub(up.bytes, 'CONTRAT CONFIDENTIEL')).toBe(false);
    expect(hasSub(up.bytes, '%PDF')).toBe(false);
    expect(up.bytes.length).toBe(PLAIN.length + 16);          // AES-GCM : clair + tag, rien d'autre
    // le marqueur (URL, clé, IV, empreinte) part DANS un message de groupe chiffré
    const f = msgFrames(srv, 'alice').at(-1);
    expect(f.ciphertext.startsWith('E2EG1:')).toBe(true);
    expect(JSON.stringify(srv.frames)).not.toMatch(/APXMEDIA1|contrat\.pdf/);
    const mine = A.K.messages[CONV].at(-1);
    expect(mine.media_gk).toBeTruthy();
    expect(JSON.stringify(srv.frames)).not.toContain(mine.media_gk.k);
    await srv.drain();
    for (const M of [B, C]) {
      const got = M.K.messages[CONV].at(-1);
      expect(got).toMatchObject({ media_type: 'application/pdf', media_name: 'contrat.pdf', media_enc: true, encrypted: true });
      expect(got.media_gk).toEqual(mine.media_gk);
      const { html, el } = await hydrate(M, got);
      expect(html).toContain('data-enc-gk=');
      const u = blobUrlOf(el.innerHTML);
      expect(u).toBeTruthy();
      expect(Buffer.from(await readBlobUrl(u)).equals(Buffer.from(PLAIN))).toBe(true);
    }
    expect([...A.errors, ...B.errors, ...C.errors]).toEqual([]);
  });

  it('2b. une clé FRAÎCHE par fichier : deux envois du même fichier → chiffrés, clés et IV différents', async () => {
    const { srv, A } = await trio();
    await A.K._uploadMedia(new File([PLAIN], 'a.pdf', { type: 'application/pdf' }));
    await A.K._uploadMedia(new File([PLAIN], 'a.pdf', { type: 'application/pdf' }));
    expect(srv.uploads).toHaveLength(2);
    expect(Buffer.from(srv.uploads[0].bytes).equals(Buffer.from(srv.uploads[1].bytes))).toBe(false);
    const [m1, m2] = A.K.messages[CONV].slice(-2);
    expect(m1.media_gk.k).not.toBe(m2.media_gk.k);
    expect(m1.media_gk.i).not.toBe(m2.media_gk.i);
    expect(Buffer.from(m1.media_gk.k, 'base64').length).toBe(32);
  });

  it('2c. octets altérés dans le stockage → mention d\'erreur, aucun contenu affiché', async () => {
    const { srv, A, B } = await trio();
    await A.K._uploadMedia(new File([PLAIN], 'contrat.pdf', { type: 'application/pdf' }));
    await srv.drain();
    const [path, bytes] = [...srv.storage.entries()][0];
    const bad = bytes.slice(); bad[10] ^= 0x01;
    srv.storage.set(path, bad);
    const { el } = await hydrate(B, B.K.messages[CONV].at(-1));
    expect(el.innerHTML).toContain('Pièce jointe altérée ou illisible');
    expect(el.innerHTML).not.toContain('blob:');
    // remplacé par un AUTRE fichier chiffré valide (clé de l'attaquant) → refusé aussi
    const other = await CC.encryptGroupFile(new TextEncoder().encode('contenu de l\'attaquant'));
    srv.storage.set(path, new Uint8Array(other.ct));
    const { el: el2 } = await hydrate(B, B.K.messages[CONV].at(-1));
    expect(el2.innerHTML).toContain('Pièce jointe altérée ou illisible');
    expect(B.errors.join(' ')).toMatch(/empreinte/);
  });

  it('2d. image et message vocal de groupe : octets chiffrés eux aussi, relus à l\'identique', async () => {
    const { srv, A, B } = await trio();
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    await A.K._uploadMedia(new File([gif], 'chat.gif', { type: 'image/gif' }));
    A.K._voicePending = { blob: new Blob([new TextEncoder().encode('OggS audio secret')], { type: 'audio/webm' }), text: 'coucou' };
    await A.K._sendVoiceMessage();
    expect(srv.uploads.map((u) => u.ctype)).toEqual(['application/octet-stream', 'application/octet-stream']);
    expect(hasSub(srv.uploads[0].bytes, 'GIF89a')).toBe(false);
    expect(hasSub(srv.uploads[1].bytes, 'OggS')).toBe(false);
    await srv.drain();
    const [img, voice] = B.K.messages[CONV].slice(-2);
    expect(img.media_type).toBe('image/gif');
    expect(voice).toMatchObject({ media_type: 'audio/webm', text: '🎙️ coucou' });
    const h1 = await hydrate(B, img);
    expect(h1.el.innerHTML).toMatch(/^<img src="blob:/);
    expect(Buffer.from(await readBlobUrl(blobUrlOf(h1.el.innerHTML))).equals(Buffer.from(gif))).toBe(true);
    const h2 = await hydrate(B, voice);
    expect(new TextDecoder().decode(await readBlobUrl(blobUrlOf(h2.el.innerHTML)))).toBe('OggS audio secret');
  });

  it('2e. groupe déjà chiffré mais pas prêt (membres injoignables) → RIEN n\'est uploadé', async () => {
    const { srv, A } = await trio();
    await A.send('premier');
    A.K._grpMembersCache = {};
    srv.membersDown = true;
    await A.K._uploadMedia(new File([PLAIN], 'contrat.pdf', { type: 'application/pdf' }));
    expect(srv.uploads).toHaveLength(0);
    expect(A.toasts.at(-1)).toMatch(/pièce jointe NON envoyée/);
    // vocal : rien d'uploadé non plus (gardé sur l'appareil, l'utilisateur est prévenu)
    A.K._voicePending = { blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' }), text: 'v' };
    await A.K._sendVoiceMessage();
    expect(srv.uploads).toHaveLength(0);
    // chiffrement du fichier en échec → rien non plus (jamais de repli en clair)
    srv.membersDown = false;
    A.ApexCrypto.encryptGroupFile = async () => { throw new Error('panne'); };
    await A.K._uploadMedia(new File([PLAIN], 'contrat.pdf', { type: 'application/pdf' }));
    expect(srv.uploads).toHaveLength(0);
  });

  it('2f. une clé de fichier ne part JAMAIS en clair : groupe non prêt à l\'envoi → en attente', async () => {
    const { srv, A } = await duo(false);                      // bob sans clé → le texte passerait « en transit »
    const r = await A.K._sendMediaMessage({ url: '/api/media/f9', mime: 'application/pdf', name: 'x.pdf', size: 3, gk: { k: 'S0VZ', i: 'SVY=', h: 'SA==' } }, '');
    expect(r).toBe('pending');
    expect(srv.frames).toEqual([]);
    expect(A.store.pending_encrypt).toEqual([expect.objectContaining({ grp_e2e: true })]);
    await A.K._flushPendingEncrypt(CONV);
    expect(srv.frames).toEqual([]);                           // toujours rien en clair
  });

  it('2g. membre sans clé (chemin honnête « en transit ») : comportement d\'avant, pas de clé de fichier', async () => {
    const { srv, A } = await duo(false);
    await A.K._uploadMedia(new File([PLAIN], 'contrat.pdf', { type: 'application/pdf' }));
    expect(srv.uploads[0].ctype).toBe('application/pdf');    // comme avant (en-tête : « pas de bout en bout »)
    const marker = JSON.parse(srv.frames.at(-1).ciphertext.slice('APXMEDIA1:'.length));
    expect(marker.e).toBe(0);
    expect(marker.k).toBeUndefined();
  });

  it('2h. DM inchangé : octets chiffrés par la session 1:1 (e:1), aucune clé de fichier dans le marqueur', async () => {
    const { srv, A } = await duo();
    const peer = await CC.generateIdentityKeys();
    const dm = { id: 'dm1', type: 'dm', peer_id: 'bob', peer_pubkey: await CC.exportPublicKey(peer.publicKey), _peer_caps: 'media' };
    srv.keys.bob = dm.peer_pubkey;                            // le bundle du pair = sa vraie clé
    A.K.conversations.push(dm);
    A.K.viewData = dm;
    A.K._wsConvId = 'dm1';
    let grpCalled = 0;
    const orig = A.K._grpFileForUpload;
    A.K._grpFileForUpload = async (...a) => { grpCalled++; return orig(...a); };
    await A.K._uploadMedia(new File([PLAIN], 'dm.pdf', { type: 'application/pdf' }));
    expect(grpCalled).toBe(0);
    expect(srv.uploads[0].ctype).toBe('application/octet-stream');
    const wire = srv.frames.at(-1).ciphertext;
    expect(wire.startsWith('E2E1:')).toBe(true);
    await CC.establishSession('peer-dm1', peer.privateKey, await CC.importPublicKey(A.pub));
    const marker = JSON.parse((await CC.decryptForConv('peer-dm1', wire.slice(5))).slice('APXMEDIA1:'.length));
    expect(marker.e).toBe(1);
    expect(marker.k).toBeUndefined();
    const clear = new Uint8Array(await CC.decryptBytes('peer-dm1', srv.uploads[0].bytes.slice().buffer));
    expect(Buffer.from(clear).equals(Buffer.from(PLAIN))).toBe(true);
  });
});

describe('2. primitives (lib/crypto-core.js)', () => {
  it('encryptGroupFile / decryptGroupFile : clé fraîche, empreinte vérifiée, clé absente → refus', async () => {
    const a = await CC.encryptGroupFile(PLAIN);
    const b = await CC.encryptGroupFile(PLAIN);
    expect(a.k).not.toBe(b.k);
    expect(a.i).not.toBe(b.i);
    expect(Buffer.from(a.i, 'base64').length).toBe(12);
    expect(Buffer.from(new Uint8Array(await CC.decryptGroupFile(a.ct, a))).equals(Buffer.from(PLAIN))).toBe(true);
    await expect(CC.decryptGroupFile(a.ct, null)).rejects.toThrow(/absente/);
    await expect(CC.decryptGroupFile(a.ct, { k: a.k, i: a.i })).rejects.toThrow(/absente/);
    await expect(CC.decryptGroupFile(a.ct, { k: 1, i: a.i, h: a.h })).rejects.toThrow(/absente/);
    await expect(CC.decryptGroupFile(a.ct, { k: a.k, i: 2, h: a.h })).rejects.toThrow(/absente/);
    await expect(CC.decryptGroupFile(b.ct, a)).rejects.toThrow(/empreinte/);
    // bonne empreinte, mauvaise clé → le tag GCM refuse
    await expect(CC.decryptGroupFile(a.ct, { ...a, k: b.k })).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
//  3. Authenticité de l'émetteur : signature ECDSA par appareil
// ---------------------------------------------------------------------------
const UNAUTH = '⚠️ message non authentifié';
// Carol (membre légitime, elle DÉTIENT la clé d'envoi d'Alice) fabrique un message « d'Alice ».
async function carolForges(C, text, { kind = 'm', mid = 'forge_1', signer = null, legacy = false } = {}) {
  const k = C.idb.keys().filter((x) => x.startsWith('gsk|' + CONV + '|alice|')).sort().at(-1);
  const [, , , epoch, kid] = k.split('|');
  const rec = C.idb.kv(k);
  const ctx = { conv: CONV, from: 'alice', epoch: Number(epoch), kid };
  return legacy ? CC.groupEncrypt(rec.key, text, ctx) : CC.groupEncrypt(rec.key, text, { ...ctx, kind, mid }, signer);
}
async function signedTrioWithTraffic() {
  const t = await trioSigned();
  await t.A.send('bonjour signé');
  await t.srv.drain();
  return t;
}


describe('3. authenticité de l\'émetteur (signature par appareil)', () => {
  it('3a. clé de signature : privée NON extractible en IndexedDB, publiée « GSIG1: » + capacité gsig1', async () => {
    const { srv, A } = await trioSigned();
    const rec = A.idb.kv('grp_sig');
    expect(rec.priv.extractable).toBe(false);
    expect(rec.priv.algorithm).toMatchObject({ name: 'ECDSA', namedCurve: 'P-256' });
    await expect(crypto.subtle.exportKey('jwk', rec.priv)).rejects.toThrow();
    expect([...A.localStorage._m.keys()].some((x) => /sig/.test(x))).toBe(false);
    const post = srv.posts.find((p) => p.uid === 'alice');
    // v1.1.299 : publiée dans signing_key_pub (prekey_signed rendu à PQXDH, plus jamais écrit).
    expect(post.body.signing_key_pub).toBe(rec.pub);
    expect(post.body.signing_key_pub.startsWith('GSIG1:')).toBe(true);
    expect('prekey_signed' in post.body).toBe(false);
    expect(post.body.crypto_caps.split(',')).toEqual(expect.arrayContaining(['grp1', 'gsig1']));
    await A.K._publishPubkey();                                   // idempotent
    expect(srv.posts.filter((p) => p.uid === 'alice')).toHaveLength(1);
    A.store.crypto_sig_published = 'GSIG1:ancienne';               // clé changée → republiée
    await A.K._publishPubkey();
    expect(srv.posts.filter((p) => p.uid === 'alice')).toHaveLength(2);
  });

  it('3b. messages et distributions signés ; les membres lisent ; clé de l\'émetteur épinglée', async () => {
    const { srv, A, B, C } = await signedTrioWithTraffic();
    const [dist, msg] = lastFrames(srv, 'alice');
    expect(parse(dist.ciphertext).body.sg).toEqual(expect.any(String));
    expect(parse(msg.ciphertext).body.sg).toEqual(expect.any(String));
    expect(B.shown()).toEqual(['bonjour signé']);
    expect(C.shown()).toEqual(['bonjour signé']);
    expect(B.localStorage.getItem('gsigkey_alice')).toBe(srv.sig.alice);
    expect(B.idb.keys().filter((k) => k.startsWith('gsk|' + CONV + '|alice|')).map((k) => B.idb.kv(k).sg)).toEqual([true]);
    await B.send('réponse de Bob');
    await srv.drain();
    expect(A.shown()).toEqual(['bonjour signé', 'réponse de Bob']);
    expect([...A.errors, ...B.errors, ...C.errors]).toEqual([]);
  });

  it('3c. un membre qui détient la clé d\'Alice forge « un message d\'Alice » → non authentifié, jamais le texte', async () => {
    const { B, C } = await signedTrioWithTraffic();
    const cKeys = C.idb.kv('grp_sig');
    const forged = [
      await carolForges(C, 'FAUX 1 non signé', { mid: 'f1' }),
      await carolForges(C, 'FAUX 2 signé par Carol', { mid: 'f2', signer: cKeys.priv }),
      await carolForges(C, 'FAUX 3 ancien format', { legacy: true }),
    ];
    let i = 0;
    for (const w of forged) {
      await B.handle({ type: 'message', id: 'srv_forge_' + (++i), sender_id: 'alice', ciphertext: w, ts: 100 + i }, CONV);
    }
    expect(B.shown()).toEqual(['bonjour signé', UNAUTH, UNAUTH, UNAUTH]);
    expect(B.shown().join(' ')).not.toMatch(/FAUX/);
    for (const m of B.K.messages[CONV].slice(1)) expect(m.encrypted).toBe(false);
  });

  it('3d. signature d\'Alice recopiée sur un autre chiffré → non authentifié', async () => {
    const { srv, B, C } = await signedTrioWithTraffic();
    const real = parse(lastFrames(srv, 'alice').at(-1).ciphertext).body;
    const fake = parse(await carolForges(C, 'FAUX avec signature volée', { mid: real.mid })).body;
    const wire = 'E2EG1:' + Buffer.from(JSON.stringify({ ...fake, sg: real.sg })).toString('base64');
    await B.handle({ type: 'message', id: 'srv_vol', sender_id: 'alice', ciphertext: wire, ts: 200 }, CONV);
    expect(B.msg('srv_vol').text).toBe(UNAUTH);
  });

  it('3e. édition forgée par un membre (liée au bon id, non signée par Alice) → refusée', async () => {
    const { srv, B, C } = await signedTrioWithTraffic();
    const row = srv.history.find((r) => r.sender_id === 'alice' && r.ciphertext.startsWith('E2EG1:'));
    const w = await carolForges(C, 'FAUSSE ÉDITION', { kind: 'e', mid: row.id });
    await B.handle({ type: 'edit_message', message_id: row.id, ciphertext: w, edited_at: 5, userId: 'alice' }, CONV);
    expect(B.msg(row.id).text).toBe('bonjour signé');
    expect(B.msg(row.id).edit_refused).toBe(true);
    // une VRAIE édition d'Alice (signée) passe
    await srv.clients.alice.K._sendSecure(srv.clients.alice.conv, 'bonjour corrigé', { edit: { message_id: row.id, edited_at: 6 } });
    await srv.drain();
    expect(B.msg(row.id).text).toBe('bonjour corrigé');
  });

  it('3f. rétrogradation : le serveur cesse de servir la clé de signature d\'Alice → toujours exigée', async () => {
    const { srv, B, C } = await signedTrioWithTraffic();
    srv.sig.alice = null;
    srv.caps.alice = 'media,grp1';
    B.K._grpBundleCache = {};
    await B.handle({ type: 'message', id: 'srv_dg', sender_id: 'alice', ciphertext: await carolForges(C, 'FAUX après rétrogradation', { mid: 'dg' }), ts: 300 }, CONV);
    expect(B.msg('srv_dg').text).toBe(UNAUTH);
    // distribution d'Alice dépouillée de sa signature → clé NON adoptée (jamais de clair)
    const realDist = lastFrames(srv, 'alice')[0];
    const body = parse(realDist.ciphertext).body;
    delete body.sg;
    const B2 = await makeMember(srv, 'bob', { identity: B.keys, localStorage: B.localStorage });
    await B2.handle({ type: 'message', id: 'srv_k', sender_id: 'alice', ciphertext: 'E2EGK1:' + Buffer.from(JSON.stringify(body)).toString('base64'), ts: 1 }, CONV);
    expect(B2.idb.keys().filter((k) => k.startsWith('gsk|'))).toEqual([]);
  });

  it('3g. le serveur substitue la clé de signature d\'Alice → en attente (bandeau), Alice exclue de la distribution, ses vrais messages restent lisibles', async () => {
    const { srv, A, B, C } = await signedTrioWithTraffic();
    const mallory = await CC.generateSigningKeys();
    srv.sig.alice = await CC.exportSigningPublicKey(mallory.publicKey);
    B.K._grpBundleCache = {};
    await B.K._grpPrepare(B.conv, { check: true });
    expect(B.K._grpState[CONV].pendingKey).toEqual(['alice']);
    expect(B.K._grpRenderKeyBanner(B.conv)).toContain('a changé');
    await B.send('Bob parle');
    const d = lastFrames(srv, 'bob').filter((f) => f.ciphertext.startsWith('E2EGK1:')).at(-1);
    expect(parse(d.ciphertext).body.keys.map((e) => e.to)).toEqual(['carol']);
    srv.queue = [];
    // message signé par la clé substituée → refusé ; vrai message d'Alice → lisible
    const fake = await carolForges(C, 'FAUX signé Mallory', { mid: 'ml', signer: mallory.privateKey });
    await B.handle({ type: 'message', id: 'srv_ml', sender_id: 'alice', ciphertext: fake, ts: 400 }, CONV);
    expect(B.msg('srv_ml').text).toBe(UNAUTH);
    await A.send('Alice, toujours la vraie');
    await srv.drain();
    expect(B.shown().at(-1)).toBe('Alice, toujours la vraie');
  });

  it('3h. clé de signature changée (réinstallation, nouvelle époque) : distribution non adoptée tant que la nouvelle clé n\'est pas acceptée, puis relue', async () => {
    const { srv, A, B } = await signedTrioWithTraffic();
    // Alice « réinstalle » : nouvelle paire de signature, republiée
    A.K._grpMemCache.delete('grp_sig');
    A.K._grpSigP = null;
    const kp = await CC.generateSigningKeys();
    const nrec = { v: 1, priv: kp.privateKey, pub: await CC.exportSigningPublicKey(kp.publicKey), ts: 1 };
    await A.K._grpIdbPut('grp_sig', nrec);
    await A.K._publishPubkey();
    expect(srv.sig.alice).toBe(nrec.pub);
    A.K._grpMembersCache = {};
    srv.members = ['alice', 'bob'];                              // (rotation : nouvelle distribution signée)
    await A.send('après réinstallation');
    await srv.drain();
    expect(B.shown().at(-1)).not.toBe('après réinstallation');
    expect(B.localStorage.getItem('gsigkey_pending_alice')).toBe(nrec.pub);
    expect(await B.K._grpAcceptMemberKey('alice')).toBe(true);
    // la distribution refusée est redemandée → relue
    await B.handle({ type: 'message', id: 'redist', sender_id: 'alice', ciphertext: lastFrames(srv, 'alice').filter((f) => f.ciphertext.startsWith('E2EGK1:')).at(-1).ciphertext, ts: 1 }, CONV);
    expect(B.shown().at(-1)).toBe('après réinstallation');
    expect(B.K.messages[CONV].at(-1).encrypted).toBe(true);
  });

  it('3i. membre SANS la capacité (appli plus ancienne) : comportement d\'avant, lisible, aucun plantage', async () => {
    const { srv, A, B, C } = await trioSigned({ alice: { signing: false, oldApp: true } });
    expect(srv.sig.alice).toBeUndefined();
    await A.send('je n\'ai pas la signature');
    await srv.drain();
    expect(parse(lastFrames(srv, 'alice').at(-1).ciphertext).body.sg).toBeUndefined();
    expect(B.shown()).toEqual(['je n\'ai pas la signature']);
    expect(C.K.messages[CONV][0].encrypted).toBe(true);
    await B.send('moi oui');
    await srv.drain();
    expect(A.shown()).toEqual(['je n\'ai pas la signature', 'moi oui']);
    expect([...A.errors, ...B.errors, ...C.errors]).toEqual([]);
  });

  it('3j. passage v1.1.296 → v1.1.297 : nouvelle époque signée ; l\'historique d\'avant reste lisible', async () => {
    const { srv, A, B } = await trioSigned({ alice: { signing: false, oldApp: true } });
    await A.send('époque 1, non signée');
    await srv.drain();
    // Alice met à jour son appli : elle sait signer, publie, et ouvre une NOUVELLE époque
    A.ApexCrypto.generateSigningKeys = CC.generateSigningKeys;
    A.K._grpSigP = null;
    await A.K._publishPubkey();
    B.K._grpBundleCache = {};
    await A.send('époque 2, signée');
    await srv.drain();
    const ep = lastFrames(srv, 'alice').filter((f) => f.ciphertext.startsWith('E2EG1:')).map((f) => parse(f.ciphertext).body.epoch);
    expect(ep).toEqual([1, 2]);
    expect(B.shown()).toEqual(['époque 1, non signée', 'époque 2, signée']);
    const B2 = await makeMember(srv, 'bob', { identity: B.keys, idb: B.idb, localStorage: B.localStorage });
    await B2.handle({ type: 'history', messages: srv.history.map((r) => ({ ...r })) }, CONV);
    expect(B2.shown()).toEqual(['époque 1, non signée', 'époque 2, signée']);
  });

  it('3l. même époque, clé de signature changée : « non authentifié » (jamais le clair) puis relu après acceptation', async () => {
    const { srv, A, B } = await signedTrioWithTraffic();
    A.K._grpMemCache.delete('grp_sig');
    A.K._grpSigP = null;
    const kp = await CC.generateSigningKeys();
    const nrec = { v: 1, priv: kp.privateKey, pub: await CC.exportSigningPublicKey(kp.publicKey), ts: 1 };
    await A.K._grpIdbPut('grp_sig', nrec);
    await A.K._publishPubkey();
    await A.send('signé par la nouvelle clé');
    expect(lastFrames(srv, 'alice').filter((f) => f.ciphertext.startsWith('E2EGK1:'))).toHaveLength(1);   // pas de nouvelle époque
    await srv.drain();
    const m = B.K.messages[CONV].at(-1);
    expect(m.text).toBe(UNAUTH);
    expect(m.encrypted).toBe(false);
    expect(B.localStorage.getItem('gsigkey_pending_alice')).toBe(nrec.pub);   // bundle relu → en attente
    // un 2ᵉ échec dans la minute ne relit pas le bundle (borné)
    const calls = [];
    const api0 = B.K._api;
    B.K._api = async (...a) => { calls.push(a[1]); return api0(...a); };
    await B.handle({ type: 'message', id: 'srv_x2', sender_id: 'alice', ciphertext: lastFrames(srv, 'alice').at(-1).ciphertext, ts: 9 }, CONV);
    expect(calls).toEqual([]);
    expect(await B.K._grpAcceptMemberKey('alice')).toBe(true);
    expect(B.K.messages[CONV].at(-2)).toMatchObject({ text: 'signé par la nouvelle clé', encrypted: true });
    expect(B.K.messages[CONV].at(-2).grp_pending).toBeUndefined();
    expect(await B.K._grpAcceptMemberKey('alice')).toBe(false);                 // plus rien en attente
  });

  it('3m. IndexedDB indisponible : pas de clé de signature ni de capacité gsig1 annoncée (repli honnête), messages lus', async () => {
    const { srv, A, B } = await trioSigned({ alice: { noIdb: true } });
    expect(await A.K._grpSigKeys()).toBeNull();
    const post = srv.posts.find((p) => p.uid === 'alice');
    expect(post.body.prekey_signed).toBeUndefined();
    expect(post.body.crypto_caps.split(',')).not.toContain('gsig1');
    await A.send('sans signature');
    await srv.drain();
    expect(B.shown()).toEqual(['sans signature']);
  });

  it('3k. une clé d\'époque distribuée SIGNÉE n\'accepte plus aucun message non signé (même au format ancien)', async () => {
    const { B, C } = await signedTrioWithTraffic();
    await B.handle({ type: 'message', id: 'srv_old', sender_id: 'alice', ciphertext: await carolForges(C, 'FAUX format ancien', { legacy: true }), ts: 500 }, CONV);
    expect(B.msg('srv_old').text).toBe(UNAUTH);
  });
});

describe('3. primitives (lib/crypto-core.js)', () => {
  it('paire de signature, encodage canonique, vérification (toutes les branches)', async () => {
    const kp = await CC.generateSigningKeys();
    expect(kp.privateKey.extractable).toBe(false);
    const pubS = await CC.exportSigningPublicKey(kp.publicKey);
    expect(pubS.startsWith(CC.GROUP_SIG_PREFIX)).toBe(true);
    const pub = await CC.importSigningPublicKey(pubS);
    expect(() => CC.importSigningPublicKey('AAAA')).toThrow(/invalide/);
    expect(() => CC.importSigningPublicKey(null)).toThrow(/invalide/);
    expect(new TextDecoder().decode(CC.groupSigBytes(['m', 'g', 1]))).toBe('["apex-grp-sig-v1","m","g","1"]');
    const sig = await CC.groupSign(kp.privateKey, ['a', 'b']);
    expect(await CC.groupVerify(pub, sig, ['a', 'b'])).toBe(true);
    expect(await CC.groupVerify(pub, sig, ['a', 'c'])).toBe(false);
    expect(await CC.groupVerify(pub, '', ['a', 'b'])).toBe(false);
    expect(await CC.groupVerify(pub, undefined, ['a', 'b'])).toBe(false);
    const aes = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    expect(await CC.groupVerify(aes, sig, ['a', 'b'])).toBe(false);            // levée interne → false
  });

  it('messages signés : liés obligatoirement ; vérification par le contexte', async () => {
    const kp = await CC.generateSigningKeys();
    const key = await CC.importGroupSenderKey(CC.newGroupSenderKey().raw);
    const ctx = { conv: 'g1', from: 'alice', epoch: 1, kid: 'k1' };
    await expect(CC.groupEncrypt(key, 'x', ctx, kp.privateKey)).rejects.toThrow(/lié/);
    const m = CC.parseGroupWire(await CC.groupEncrypt(key, 'x', { ...ctx, kind: 'm', mid: 'm1' }, kp.privateKey)).body;
    expect(await CC.groupVerifyMsg(kp.publicKey, m, { conv: 'g1', from: 'alice' })).toBe(true);
    expect(await CC.groupVerifyMsg(kp.publicKey, m, { conv: 'g1', from: 'bob' })).toBe(false);
    expect(await CC.groupVerifyMsg(kp.publicKey, m, { conv: 'g2', from: 'alice' })).toBe(false);
    expect(await CC.groupVerifyMsg(kp.publicKey, { ...m, ct: m.ct.slice(1) }, { conv: 'g1', from: 'alice' })).toBe(false);
    expect(await CC.groupVerifyMsg(kp.publicKey, null, {})).toBe(false);
    expect(await CC.groupVerifyMsg(kp.publicKey, { v: 1 }, {})).toBe(false);
    const e = CC.parseGroupWire(await CC.groupEncrypt(key, 'x', { ...ctx, kind: 'e', mid: 'srv_1' }, kp.privateKey)).body;
    expect(await CC.groupVerifyMsg(kp.publicKey, e, { conv: 'g1', from: 'alice', ctxId: 'srv_1' })).toBe(true);
    expect(await CC.groupVerifyMsg(kp.publicKey, e, { conv: 'g1', from: 'alice', ctxId: 'srv_2' })).toBe(false);
    expect(await CC.groupVerifyMsg(kp.publicKey, e, { conv: 'g1', from: 'alice' })).toBe(false);   // contexte manquant
    expect(CC.groupMsgSigParts(m, { conv: 'g1', from: 'alice' })).toEqual(['m', 'g1', 'alice', 1, 'k1', 'm1', m.iv, m.ct]);
    const enc = (o) => 'E2EG1:' + Buffer.from(JSON.stringify(o)).toString('base64');
    expect(CC.parseGroupWire(enc({ ...m, sg: 5 })).body).toBeNull();
  });

  it('distributions signées : vérifiées par groupe ; entrées modifiées → refus ; taille < limite serveur', async () => {
    const kp = await CC.generateSigningKeys();
    const entry = (i) => ({ to: 'user_' + String(i).padStart(6, '0'), iv: 'A'.repeat(16), w: 'B'.repeat(64) });
    const wires = CC.buildGroupKeyMessages({ from: 'alice', epoch: 2, kid: 'k' }, Array.from({ length: 1500 }, (_, i) => entry(i)));
    const signed = await CC.signGroupKeyMessages(kp.privateKey, 'g1', wires);
    expect(signed).toHaveLength(wires.length);
    for (const w of signed) {
      expect(w.length).toBeLessThan(CC.GROUP_KEY_MSG_MAX + 256);
      const b = CC.parseGroupWire(w).body;
      expect(await CC.groupVerifyKey(kp.publicKey, b, 'g1')).toBe(true);
      expect(await CC.groupVerifyKey(kp.publicKey, b, 'g2')).toBe(false);
      expect(await CC.groupVerifyKey(kp.publicKey, { ...b, keys: b.keys.slice(1) }, 'g1')).toBe(false);
      expect(await CC.groupVerifyKey(kp.publicKey, { ...b, sg: undefined }, 'g1')).toBe(false);
    }
  });
});
