// @vitest-environment node
/**
 * Lot 2 — I (capsule), M (types → 400), P (jeton / % mal formés), Q (SSO Apex
 * exp+iat ≤ 300 s), R (codes sans biais), S (pseudo « - » + avatar validé),
 * T (interrupteurs en liste blanche), V (média lié à SA conversation),
 * W (soins par utilisateur), X (collision de pseudo SSO kd-mc), Y (Firebase JWK
 * + numéro normalisé). Vrai schéma (node:sqlite).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker, { verifyJWT, verifyFirebaseIdToken } from '../../workers/api-worker.js';
import { ENV, makeJWT, makeRequest, makeKV, makeR2 } from './api-worker-helpers.js';
import { d1Reel } from './_support/d1-sqlite.js';

const CTX = { waitUntil() {} };
beforeEach(() => { vi.restoreAllMocks(); globalThis.fetch = vi.fn(async () => new Response('{}')); });

let n = 0;
function seedUser(db, id, extra = {}) {
  n++;
  db.raw.prepare(`INSERT INTO users (id,pseudo,real_name,phone,phone_hash,created_at,identity_key_pub,pq_key_pub,prekey_signed,status,is_admin,last_seen,source)
    VALUES (?,?,?,?,?,1,'k','k','k','active',?,?,?)`).run(id, extra.pseudo || 'p_' + id, extra.real_name || 'Nom ' + id,
    extra.phone || '+3368' + String(1000000 + n), 'h_' + id, extra.admin ? 1 : 0, extra.last_seen ?? null, extra.source || null);
}
function seedConv(db, id, type, members) {
  db.raw.prepare(`INSERT INTO conversations (id,type,created_by,created_at,sharded_to_do) VALUES (?,?,?,1,?)`).run(id, type, members[0][0], 'do_' + id);
  for (const [u, r] of members) db.raw.prepare(`INSERT INTO conversation_members (conv_id,user_id,role,joined_at) VALUES (?,?,?,1)`).run(id, u, r);
}
const tok = (sub) => makeJWT({ sub, iat: Math.floor(Date.now() / 1000) - 5 });
const call = async (env, method, path, sub, body, extraHeaders) =>
  worker.fetch(makeRequest({ method, path, body, token: sub ? await tok(sub) : undefined, extraHeaders }), env, CTX);

describe('M — champ du mauvais type → 400 (jamais 500)', () => {
  it('conversation, story, signalement, sondage, lettre, invitation, création de conversation', async () => {
    const DB = d1Reel();
    seedUser(DB, 'own'); seedUser(DB, 'b');
    seedConv(DB, 'g1', 'group', [['own', 'owner'], ['b', 'member']]);
    const env = ENV({ APEX_CHAT_DB: DB });
    const cases = [
      ['PATCH', '/api/conversations/g1', { name: { x: 1 } }],
      ['PATCH', '/api/conversations/g1', { description: ['a'] }],
      ['POST', '/api/stories', { ciphertext: { x: 1 } }],
      ['POST', '/api/signalements', { target_user_id: { id: 'b' }, reason: 'spam' }],
      ['POST', '/api/signalements', { target_user_id: 'b', reason: ['spam'] }],
      ['POST', '/api/polls', { conv_id: 'g1', msg_id: 'm', question: { q: 1 }, options: ['a', 'b'] }],
      ['POST', '/api/letters', { conv_id: 'g1', ciphertext: { c: 1 } }],
      ['POST', '/api/invitations', { phone: '+33611111111', name: { n: 1 } }],
      ['POST', '/api/conversations', { type: 'group', members: [{ id: 'b' }] }],
    ];
    for (const [m, p, body] of cases) {
      const r = await call(env, m, p, 'own', body);
      expect(r.status, m + ' ' + p + ' ' + JSON.stringify(body)).toBe(400);
    }
  });
});

describe('I — capsule temporelle', () => {
  const capsule = (o) => ({ recipient_id: 'dest', ciphertext: 'c', open_at: Date.now() + 86400000, ...o });
  it('open_at non numérique / non fini → 400 ; destinataire inexistant → 404 ; aperçu borné', async () => {
    const DB = d1Reel();
    seedUser(DB, 'exp'); seedUser(DB, 'dest');
    const env = ENV({ APEX_CHAT_DB: DB });
    for (const open_at of ['abc', '12abc', 'Infinity', { t: 1 }, 1.5e400]) {
      const r = await call(env, 'POST', '/api/time-capsules', 'exp', capsule({ open_at }));
      expect(r.status, String(open_at)).toBe(400);
    }
    expect((await call(env, 'POST', '/api/time-capsules', 'exp', capsule({ recipient_id: 'fantome' }))).status).toBe(404);
    expect((await call(env, 'POST', '/api/time-capsules', 'exp', capsule({ preview: 'x'.repeat(5000) }))).status).toBe(400);
    expect(DB.raw.prepare('SELECT COUNT(*) c FROM time_capsules').get().c).toBe(0);
    const ok = await call(env, 'POST', '/api/time-capsules', 'exp', capsule({ preview: 'Bon anniversaire' }));
    expect(ok.status).toBe(200);
  });
});

describe('P — jeton et « % » mal formés', () => {
  it('verifyJWT : base64 invalide → null (pas d\'exception) ; via la route → 401', async () => {
    await expect(verifyJWT('a.b.@@@', 'k')).resolves.toBeNull();
    await expect(verifyJWT('a.@@@.c', 'k')).resolves.toBeNull();
    const env = ENV({ APEX_CHAT_DB: d1Reel() });
    const r = await worker.fetch(makeRequest({ path: '/api/users/me', extraHeaders: { Authorization: 'Bearer x.y.%%%' } }), env, CTX);
    expect(r.status).toBe(401);
  });

  it('x-file-name et identifiant de contact avec « % » mal formé → jamais 500', async () => {
    const DB = d1Reel();
    seedUser(DB, 'u1');
    const env = ENV({ APEX_CHAT_DB: DB, APEX_CHAT_MEDIA: makeR2() });
    const up = await worker.fetch(new Request('https://api.apex/api/media', {
      method: 'POST', body: new Uint8Array([1, 2, 3]),
      headers: { Authorization: 'Bearer ' + await tok('u1'), 'content-type': 'image/png', 'x-file-name': 'photo%E0%A4%A.png' },
    }), env, CTX);
    expect(up.status).toBe(200);
    expect((await up.json()).name).toMatch(/\.png$/);
    const c = await call(env, 'GET', '/api/contact/%E0%A4%A', 'u1');
    expect(c.status).toBe(400);
  });
});

describe('Q — SSO Apex : exp et iat obligatoires, durée ≤ 300 s', () => {
  const KEY = 'apex-sso-key';
  const sso = async (env, payload) => worker.fetch(makeRequest({
    method: 'POST', path: '/api/auth/sso-from-apex', body: { apex_token: await makeJWT(payload, KEY), apex_uid: 'apx1', name: 'Marie' },
  }), env, CTX);
  it('sans exp, sans iat, ou valable 1 h → 401 ; 5 min → 200', async () => {
    const env = ENV({ APEX_CHAT_DB: d1Reel(), APEX_SSO_SIGN_KEY: KEY });
    const now = Math.floor(Date.now() / 1000);
    expect((await sso(env, { sub: 'apx1', iat: now })).status).toBe(401);
    expect((await sso(env, { sub: 'apx1', exp: now + 200 })).status).toBe(401);
    expect((await sso(env, { sub: 'apx1', iat: now, exp: now + 3600 })).status).toBe(401);
    expect((await sso(env, { sub: 'apx1', iat: now, exp: now + 300 })).status).toBe(200);
  });
});

describe('R — codes d\'invitation sans biais', () => {
  it('le 31e caractère de l\'alphabet (« 9 ») sort aussi (avant : jamais)', async () => {
    const DB = d1Reel();
    seedUser(DB, 'boss', { admin: true });
    const env = ENV({ APEX_CHAT_DB: DB });
    const t = await tok('boss');
    let chars = '';
    for (let i = 0; i < 120; i++) {
      const r = await worker.fetch(makeRequest({ method: 'POST', path: '/api/admin/invite-magic', token: t,
        body: { phone: '+3369' + String(1000000 + i), name: 'Ami ' + i } }), env, CTX);
      const j = await r.json();
      expect(j.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
      chars += j.code;
    }
    // 960 tirages uniformes sur 31 symboles : P(aucun « 9 ») ≈ e^-31.
    expect(chars).toContain('9');
  });
});

describe('S — profil : pseudo avec tiret, avatar validé', () => {
  it('PATCH /api/users/me et /api/contact/:id', async () => {
    const DB = d1Reel();
    seedUser(DB, 'u1');
    const env = ENV({ APEX_CHAT_DB: DB });
    expect((await call(env, 'PATCH', '/api/users/me', 'u1', { pseudo: 'jean-paul' })).status).toBe(200);
    expect(DB.raw.prepare("SELECT pseudo FROM users WHERE id='u1'").get().pseudo).toBe('jean-paul');
    expect((await call(env, 'PATCH', '/api/contact/u1', 'u1', { pseudo: 'jean-pierre' })).status).toBe(200);
    for (const bad of ['javascript:alert(1)', 'https://evil.example/x.png', { x: 1 }, 'data:image/' + 'A'.repeat(210 * 1024)]) {
      const r = await call(env, 'PATCH', '/api/users/me', 'u1', { avatar_url: bad });
      expect([400, 413], typeof bad === 'string' ? bad.slice(0, 30) : 'objet').toContain(r.status);
      const r2 = await call(env, 'PATCH', '/api/contact/u1', 'u1', { avatar_url: bad });
      expect([400, 413]).toContain(r2.status);
    }
    const img = 'data:image/png;base64,' + 'A'.repeat(2000);
    expect((await call(env, 'PATCH', '/api/users/me', 'u1', { avatar_url: img })).status).toBe(200);
    expect(DB.raw.prepare("SELECT avatar_url FROM users WHERE id='u1'").get().avatar_url).toBe(img);   // plus tronqué à 500
  });
});

describe('T — interrupteurs par utilisateur en liste blanche', () => {
  it('nom de fonction inconnu → 400, rien écrit dans system_config', async () => {
    const DB = d1Reel();
    seedUser(DB, 'u1');
    const env = ENV({ APEX_CHAT_DB: DB });
    for (const feature of ['ADMIN_MODE', '../../x', 'anything_goes']) {
      const r = await call(env, 'POST', '/api/admin/user-toggles', 'u1', { feature, value: true });
      expect(r.status, feature).toBe(400);
    }
    expect(DB.raw.prepare("SELECT COUNT(*) c FROM system_config WHERE key LIKE 'user_toggle:%'").get().c).toBe(0);
    expect((await call(env, 'POST', '/api/admin/user-toggles', 'u1', { feature: 'stories', value: false })).status).toBe(200);
  });
});

describe('V — média lisible seulement par les membres de SA conversation', () => {
  it('photo d\'un DM : un membre d\'un AUTRE groupe commun avec l\'auteur n\'y accède plus', async () => {
    const DB = d1Reel();
    for (const u of ['alice', 'bob', 'carol']) seedUser(DB, u);
    seedConv(DB, 'dm1', 'dm', [['alice', 'owner'], ['bob', 'member']]);
    seedConv(DB, 'grp', 'group', [['alice', 'owner'], ['carol', 'member']]);
    const env = ENV({ APEX_CHAT_DB: DB, APEX_CHAT_MEDIA: makeR2() });
    const upload = async (who, conv) => worker.fetch(new Request('https://api.apex/api/media' + (conv ? '?conv_id=' + conv : ''), {
      method: 'POST', body: new Uint8Array([9, 9, 9]),
      headers: { Authorization: 'Bearer ' + await tok(who), 'content-type': 'image/png', 'x-file-name': 'p.png' },
    }), env, CTX);
    const up = await upload('alice', 'dm1');
    expect(up.status).toBe(200);
    const id = (await up.json()).id;
    expect(DB.raw.prepare('SELECT conv_id FROM media WHERE id=?').get(id).conv_id).toBe('dm1');
    expect((await call(env, 'GET', '/api/media/' + id, 'carol')).status).toBe(403);
    expect((await call(env, 'GET', '/api/media/' + id, 'bob')).status).toBe(200);
    expect((await call(env, 'GET', '/api/media/' + id, 'alice')).status).toBe(200);
    // on ne rattache pas un média à une conversation dont on n'est pas membre
    expect((await upload('carol', 'dm1')).status).toBe(403);
    // ancien média sans conv_id : ancienne règle (conversation partagée avec l'auteur)
    const legacy = await upload('alice', null);
    const lid = (await legacy.json()).id;
    expect((await call(env, 'GET', '/api/media/' + lid, 'carol')).status).toBe(200);
  });
});

describe('W — soins de la liste de conversations : verrou par utilisateur', () => {
  it('le verrou global déjà pris ne bloque plus la réparation PROPRE à un autre utilisateur', async () => {
    const DB = d1Reel();
    seedUser(DB, 'marie', { real_name: 'Marie Dupont', pseudo: 'marie_d', phone: '+33612000000', last_seen: Date.now() });
    seedUser(DB, 'marie_brouillon', { real_name: 'Marie Dupont', pseudo: 'mariedupont', phone: 'PENDING_X', source: 'core_pair' });
    const KV = makeKV({ 'heal:convlist': String(Date.now()) });   // un autre utilisateur vient de passer
    const env = ENV({ APEX_CHAT_DB: DB, APEX_CHAT_KV: KV });
    expect((await call(env, 'GET', '/api/conversations', 'marie')).status).toBe(200);
    const stub = DB.raw.prepare("SELECT status, merged_into FROM users WHERE id='marie_brouillon'").get();
    expect(stub).toEqual({ status: 'deleted', merged_into: 'marie' });
  });
});

describe('X — SSO kd-mc.com : pseudo déjà pris', () => {
  it('homonyme existant → compte créé avec un pseudo suffixé (avant : 500 à chaque connexion), aucun droit admin du client', async () => {
    const DB = d1Reel();
    seedUser(DB, 'autre', { pseudo: 'marie' });
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, verified: true, uid: 'kd42', name: 'Marie', admin: false })));
    const env = ENV({ APEX_CHAT_DB: DB });
    const r = await worker.fetch(makeRequest({ method: 'POST', path: '/api/auth/sso-from-kdmc', body: { kdmc_token: 't' } }), env, CTX);
    const j = await r.json();
    expect(r.status, JSON.stringify(j)).toBe(200);
    expect(j.user.id).toBe('kdmc_kd42');
    expect(j.user.pseudo).toMatch(/^marie_[a-z0-9]{6}$/);
    expect(j.user.is_admin).toBe(0);
    // reconnexion : même compte
    const r2 = await worker.fetch(makeRequest({ method: 'POST', path: '/api/auth/sso-from-kdmc', body: { kdmc_token: 't' } }), env, CTX);
    expect((await r2.json()).user.id).toBe('kdmc_kd42');
  });
});

describe('Y — Firebase : clés JWK réelles + numéro normalisé', () => {
  const b64u = (bytes) => Buffer.from(bytes).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const enc = (o) => b64u(Buffer.from(JSON.stringify(o)));
  async function rig() {
    const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ keys: [{ ...jwk, kid: 'k1', alg: 'RS256', use: 'sig' }] })));
    const sign = async (payload, kid = 'k1') => {
      const data = enc({ alg: 'RS256', kid, typ: 'JWT' }) + '.' + enc(payload);
      const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, new TextEncoder().encode(data));
      return data + '.' + b64u(new Uint8Array(sig));
    };
    return { sign };
  }
  const claims = (o = {}) => {
    const now = Math.floor(Date.now() / 1000);
    return { sub: 'fb-uid', aud: 'apex-proj', iss: 'https://securetoken.google.com/apex-proj', iat: now, exp: now + 3600, phone_number: '+33612345678', ...o };
  };

  it('jeton signé par une vraie clé RSA publiée en JWK → accepté ; altéré / sans exp → refusé', async () => {
    const { sign } = await rig();
    const env = { FIREBASE_PROJECT_ID: 'apex-proj', APEX_CHAT_CACHE: makeKV() };
    const good = await sign(claims());
    expect((await verifyFirebaseIdToken(good, env)).sub).toBe('fb-uid');
    const tampered = good.slice(0, good.lastIndexOf('.')) + '.' + b64u(new Uint8Array(256));
    await expect(verifyFirebaseIdToken(tampered, env)).rejects.toThrow();
    const { exp, ...noExp } = claims();
    void exp;
    await expect(verifyFirebaseIdToken(await sign(noExp), env)).rejects.toThrow();
  });

  it('verify-otp par Firebase : 0612… (saisi) = +33612… (jeton) → connexion', async () => {
    const { sign } = await rig();
    const env = ENV({ APEX_CHAT_DB: d1Reel(), FIREBASE_PROJECT_ID: 'apex-proj', APEX_CHAT_CACHE: makeKV(), ALLOW_TEST_OTP: 'false' });
    const r = await worker.fetch(makeRequest({ method: 'POST', path: '/api/auth/verify-otp',
      body: { phone: '06 12 34 56 78', name: 'Marie Dupont', pseudo: 'marie-d', firebase_id_token: await sign(claims()) } }), env, CTX);
    const j = await r.json();
    expect(r.status, JSON.stringify(j)).toBe(200);
    expect(j.token).toBeTruthy();
    // un AUTRE numéro reste refusé
    const r2 = await worker.fetch(makeRequest({ method: 'POST', path: '/api/auth/verify-otp',
      body: { phone: '0699999999', name: 'Marie Dupont', pseudo: 'marie-e', firebase_id_token: await sign(claims()) } }), env, CTX);
    expect(r2.status).toBe(401);
  });
});
