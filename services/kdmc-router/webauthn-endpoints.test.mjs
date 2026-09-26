/* Test d'intégration des endpoints WebAuthn DU WORKER (pas juste le module) :
   issue session → register/options → register/verify (authentificateur simulé) →
   auth/options → auth/verify → whoami verified:true. Prouve le câblage complet
   (KV, session, origin, claim verified). node webauthn-endpoints.test.mjs */
import mod from './worker.js';
import { b64uDec, b64uEnc } from './webauthn.js';

const te = new TextEncoder();
const store = new Map();
const ACCOUNTS = { get: async (k) => (store.has(k) ? store.get(k) : null), put: async (k, v) => { store.set(k, v); } };
const env = { KDMC_SSO_SECRET: 'sec', ACCOUNTS };
const ORIGIN = 'https://kd-mc.com', RPID = 'kd-mc.com';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗ ' + m)); };
const REQ = (path, opt = {}) => new Request('https://kd-mc.com' + path, { method: opt.method || 'GET', headers: opt.headers || {}, body: opt.body });
const POST = (path, body, headers) => REQ(path, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, headers || {}), body: JSON.stringify(body) });

/* ---- mini CBOR + DER (authentificateur simulé) ---- */
function head(major, len) { if (len < 24) return Uint8Array.of((major << 5) | len); if (len < 256) return Uint8Array.of((major << 5) | 24, len); return Uint8Array.of((major << 5) | 25, len >> 8, len & 0xff); }
function cat(...a) { let n = 0; for (const x of a) n += x.length; const o = new Uint8Array(n); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; }
function enc(x) { if (typeof x === 'number') return x >= 0 ? head(0, x) : head(1, -1 - x); if (x instanceof Uint8Array) return cat(head(2, x.length), x); if (typeof x === 'string') { const b = te.encode(x); return cat(head(3, b.length), b); } throw new Error('enc'); }
function intDer(b) { let i = 0; while (i < b.length - 1 && b[i] === 0) i++; b = b.slice(i); const pre = (b[0] & 0x80) ? Uint8Array.of(0) : new Uint8Array(0); const body = cat(pre, b); return cat(Uint8Array.of(0x02, body.length), body); }
function rawToDer(raw) { const body = cat(intDer(raw.slice(0, 32)), intDer(raw.slice(32))); return cat(Uint8Array.of(0x30, body.length), body); }
async function sha256(b) { return new Uint8Array(await crypto.subtle.digest('SHA-256', b)); }
const cookieOf = (res) => ((res.headers.get('set-cookie') || '').match(/kdmc_sso=([^;]+)/) || [])[1];

const run = async () => {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pj = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const x = b64uDec(pj.x), y = b64uDec(pj.y);
  const credId = crypto.getRandomValues(new Uint8Array(32));
  const rpIdHash = await sha256(te.encode(RPID));

  /* 1) session (faible, nom+code) */
  let r = await mod.fetch(POST('/__sso/issue', { uid: 'kevin-desarzens', name: 'Kevin Desarzens', cgu: true }), env);
  const cookie = 'kdmc_sso=' + cookieOf(r);
  let j = await r.json(); ok(j.ok && j.verified !== true, 'issue → session faible (verified non true)');

  /* 2) register/options (avec session) */
  r = await mod.fetch(POST('/__sso/webauthn/register/options', {}, { cookie }), env);
  const ro = await r.json(); ok(ro.ok && ro.challenge && ro.rp.id === RPID, 'register/options → challenge + rp');

  /* sans session → refus */
  r = await mod.fetch(POST('/__sso/webauthn/register/options', {}), env);
  ok((await r.json()).ok === false, 'register/options sans session → refus');

  /* 3) register/verify (attestationObject simulé avec le challenge du worker) */
  const cose = cat(head(5, 5), enc(1), enc(2), enc(3), enc(-7), enc(-1), enc(1), enc(-2), enc(x), enc(-3), enc(y));
  const regAuthData = cat(rpIdHash, Uint8Array.of(0x45), Uint8Array.of(0, 0, 0, 0), new Uint8Array(16), Uint8Array.of(0, credId.length), credId, cose);
  const attObj = cat(head(5, 3), enc('fmt'), enc('none'), enc('attStmt'), head(5, 0), enc('authData'), enc(regAuthData));
  const regCD = te.encode(JSON.stringify({ type: 'webauthn.create', challenge: ro.challenge, origin: ORIGIN }));
  r = await mod.fetch(POST('/__sso/webauthn/register/verify', { attestationObject: b64uEnc(attObj), clientDataJSON: b64uEnc(regCD) }, { cookie }), env);
  const rv = await r.json();
  ok(rv.ok && rv.verified === true && typeof rv.token === 'string', 'register/verify → enregistré + token FORT (verified)');
  ok(store.has('pk:kevin-desarzens'), 'passkey stocké en KV (pk:<uid>)');

  /* 4) auth/options */
  r = await mod.fetch(POST('/__sso/webauthn/auth/options', { uid: 'kevin-desarzens' }), env);
  const ao = await r.json();
  ok(ao.ok && ao.allowCredentials.length === 1 && ao.allowCredentials[0].id === b64uEnc(credId), 'auth/options → 1 credential du user');

  /* 5) auth/verify (assertion signée) */
  async function assertion(challengeB64, tamper) {
    const ad = cat(rpIdHash, Uint8Array.of(0x05), Uint8Array.of(0, 0, 0, 1));
    const cd = te.encode(JSON.stringify({ type: 'webauthn.get', challenge: challengeB64, origin: ORIGIN }));
    const signed = cat(ad, await sha256(cd));
    const raw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, signed));
    if (tamper) raw[10] ^= 0xff;
    return { uid: 'kevin-desarzens', credId: b64uEnc(credId), clientDataJSON: b64uEnc(cd), authenticatorData: b64uEnc(ad), signature: b64uEnc(rawToDer(raw)) };
  }
  r = await mod.fetch(POST('/__sso/webauthn/auth/verify', await assertion(ao.challenge)), env);
  const av = await r.json();
  ok(av.ok && av.verified === true && typeof av.token === 'string', 'auth/verify (Face ID) → token FORT verified');

  /* 6) whoami avec le token fort → verified:true */
  r = await mod.fetch(REQ('/__sso/whoami', { headers: { authorization: 'Bearer ' + av.token } }), env);
  const w = await r.json();
  ok(w.ok && w.verified === true && w.uid === 'kevin-desarzens', 'whoami(token passkey) → verified:true');

  /* 7) négatif : signature falsifiée → refus */
  r = await mod.fetch(POST('/__sso/webauthn/auth/verify', await assertion((await (await mod.fetch(POST('/__sso/webauthn/auth/options', { uid: 'kevin-desarzens' }), env)).json()).challenge, true)), env);
  ok((await r.json()).ok === false, 'auth/verify signature falsifiée → REFUS');

  /* 8) anti-rejeu : rejouer la MÊME assertion → refus (challenge déjà consommé) ;
     valide aussi la progression du compteur (count 1→2 acceptée). */
  async function assertionN(challengeB64, count) {
    const ad = cat(rpIdHash, Uint8Array.of(0x05), Uint8Array.of(0, 0, 0, count));
    const cd = te.encode(JSON.stringify({ type: 'webauthn.get', challenge: challengeB64, origin: ORIGIN }));
    const raw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, cat(ad, await sha256(cd))));
    return { uid: 'kevin-desarzens', credId: b64uEnc(credId), clientDataJSON: b64uEnc(cd), authenticatorData: b64uEnc(ad), signature: b64uEnc(rawToDer(raw)) };
  }
  const aoR = await (await mod.fetch(POST('/__sso/webauthn/auth/options', { uid: 'kevin-desarzens' }), env)).json();
  const asr = await assertionN(aoR.challenge, 2);
  ok((await (await mod.fetch(POST('/__sso/webauthn/auth/verify', asr), env)).json()).ok === true, 'auth/verify count=2 → OK (compteur progresse)');
  ok((await (await mod.fetch(POST('/__sso/webauthn/auth/verify', asr), env)).json()).ok === false, 'rejeu de la MÊME assertion → REFUS (challenge consommé)');

  /* 9) SÉCU P0 (leçon #99) : pk:kevin-desarzens est désormais NON VIDE (Kevin enrôlé).
     Un ATTAQUANT qui déclare "kevin-desarzens" au portail (session faible, non vérifiée)
     NE DOIT PAS pouvoir greffer SON passkey sur le compte admin. */
  const kp2 = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pj2 = await crypto.subtle.exportKey('jwk', kp2.publicKey);
  const x2 = b64uDec(pj2.x), y2 = b64uDec(pj2.y);
  const credId2 = crypto.getRandomValues(new Uint8Array(32));
  let ra = await mod.fetch(POST('/__sso/issue', { uid: 'kevin-desarzens', name: 'Kevin Desarzens', cgu: true }), env);
  const cookieAtk = 'kdmc_sso=' + cookieOf(ra);
  const roA = await (await mod.fetch(POST('/__sso/webauthn/register/options', {}, { cookie: cookieAtk }), env)).json();
  const cose2 = cat(head(5, 5), enc(1), enc(2), enc(3), enc(-7), enc(-1), enc(1), enc(-2), enc(x2), enc(-3), enc(y2));
  const regAuthData2 = cat(rpIdHash, Uint8Array.of(0x45), Uint8Array.of(0, 0, 0, 0), new Uint8Array(16), Uint8Array.of(0, credId2.length), credId2, cose2);
  const attObj2 = cat(head(5, 3), enc('fmt'), enc('none'), enc('attStmt'), head(5, 0), enc('authData'), enc(regAuthData2));
  const regCD2 = te.encode(JSON.stringify({ type: 'webauthn.create', challenge: roA.challenge, origin: ORIGIN }));
  ra = await mod.fetch(POST('/__sso/webauthn/register/verify', { attestationObject: b64uEnc(attObj2), clientDataJSON: b64uEnc(regCD2) }, { cookie: cookieAtk }), env);
  const rvA = await ra.json();
  ok(rvA.ok === false && /admin protégé/i.test(rvA.reason || ''), 'attaquant (session faible) NE greffe PAS de passkey sur admin → REFUS');
  const pkList = JSON.parse(store.get('pk:kevin-desarzens') || '[]');
  ok(!pkList.some((k) => k.credId === b64uEnc(credId2)), 'le passkey de l\'attaquant n\'est PAS entré en KV');

  console.log(`WebAuthn endpoints test: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
};
run();
