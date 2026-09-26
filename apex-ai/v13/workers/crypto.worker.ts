/**
 * APEX v13 — Crypto Web Worker
 *
 * Off-main-thread PBKDF2 200k + AES-GCM-256 (Web Crypto natif).
 *
 * Pourquoi un worker dédié :
 * - PBKDF2 200k SHA-256 bloque le main thread ~80-150ms par hash → UI freeze visible
 *   au login (Kevin règle "fluidité comme Claude.ai").
 * - AES-GCM ponctuel (~5-15ms par chiffrement) reste OK main thread mais on offloade
 *   par cohérence (1 worker = 1 surface crypto).
 *
 * Lazy-init obligatoire (pas chargé au boot) : services/auth.ts l'instancie au 1er
 * appel hashPin afin de ne pas pénaliser LCP.
 *
 * Backward-compat : auth.ts garde sa version main thread `hashPin()`. Si Worker
 * indispo (browser sans support, sandbox CSP) → fallback sync transparent.
 *
 * Sécurité :
 * - Aucun secret persistant en mémoire worker (cleanup après chaque op).
 * - postMessage typé strict (pas de RCE via payload non validé).
 * - WebCrypto natif uniquement (pas de polyfill / lib externe).
 */

/// <reference lib="webworker" />

export interface CryptoWorkerHashPinReq {
  type: 'hashPin';
  id: number;
  pin: string;
  salt: string;
  iterations?: number;
}

export interface CryptoWorkerEncryptReq {
  type: 'encrypt';
  id: number;
  plaintext: string;
  passphrase: string;
}

export interface CryptoWorkerDecryptReq {
  type: 'decrypt';
  id: number;
  payload: string; /* base64 IV+salt+ciphertext */
  passphrase: string;
}

export type CryptoWorkerRequest =
  | CryptoWorkerHashPinReq
  | CryptoWorkerEncryptReq
  | CryptoWorkerDecryptReq;

export interface CryptoWorkerOk {
  type: 'ok';
  id: number;
  result: string;
}

export interface CryptoWorkerErr {
  type: 'err';
  id: number;
  error: string;
}

export type CryptoWorkerResponse = CryptoWorkerOk | CryptoWorkerErr;

const PBKDF2_DEFAULT_ITERATIONS = 200_000;
const AES_KEY_BITS = 256;
const AES_NAME = 'AES-GCM';
const SALT_BYTES = 16;
const IV_BYTES = 12;

const enc = new TextEncoder();
const dec = new TextDecoder();

function bytesToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function bytesToBase64(buf: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < buf.byteLength; i++) bin += String.fromCharCode(buf[i] ?? 0);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hashPin(pin: string, salt: string, iterations: number): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return bytesToHex(bits);
}

/* TS strict (lib es2024+) : Uint8Array est generic sur ArrayBufferLike (peut SharedArrayBuffer).
 * crypto.subtle attend strictement ArrayBuffer. On cast via unknown pour signaler que
 * c'est OK en runtime (toutes nos sources sont ArrayBuffer non-SAB). */
function asBuf(u: Uint8Array): ArrayBuffer {
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
}

async function deriveAesKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    asBuf(enc.encode(passphrase)),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: asBuf(salt), iterations: PBKDF2_DEFAULT_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: AES_NAME, length: AES_KEY_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptString(plaintext: string, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveAesKey(passphrase, salt);
  const ct = await crypto.subtle.encrypt(
    { name: AES_NAME, iv: asBuf(iv) },
    key,
    asBuf(enc.encode(plaintext)),
  );
  /* Format: salt(16) || iv(12) || ciphertext */
  const merged = new Uint8Array(salt.length + iv.length + ct.byteLength);
  merged.set(salt, 0);
  merged.set(iv, salt.length);
  merged.set(new Uint8Array(ct), salt.length + iv.length);
  return bytesToBase64(merged);
}

async function decryptString(payload: string, passphrase: string): Promise<string> {
  const buf = base64ToBytes(payload);
  if (buf.length < SALT_BYTES + IV_BYTES + 1) throw new Error('payload_too_short');
  const salt = buf.slice(0, SALT_BYTES);
  const iv = buf.slice(SALT_BYTES, SALT_BYTES + IV_BYTES);
  const ct = buf.slice(SALT_BYTES + IV_BYTES);
  const key = await deriveAesKey(passphrase, salt);
  const pt = await crypto.subtle.decrypt({ name: AES_NAME, iv: asBuf(iv) }, key, asBuf(ct));
  return dec.decode(pt);
}

function isRequest(v: unknown): v is CryptoWorkerRequest {
  if (!v || typeof v !== 'object') return false;
  const r = v as { type?: unknown; id?: unknown };
  if (typeof r.id !== 'number') return false;
  return r.type === 'hashPin' || r.type === 'encrypt' || r.type === 'decrypt';
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const ctx: DedicatedWorkerGlobalScope = self as any;

ctx.addEventListener('message', (event: MessageEvent<unknown>) => {
  void (async (): Promise<void> => {
    const data = event.data;
    if (!isRequest(data)) {
      const id =
        typeof (data as { id?: unknown })?.id === 'number'
          ? ((data as { id: number }).id)
          : -1;
      const errMsg: CryptoWorkerErr = { type: 'err', id, error: 'invalid_request' };
      ctx.postMessage(errMsg);
      return;
    }
    try {
      let result: string;
      if (data.type === 'hashPin') {
        const iterations = data.iterations ?? PBKDF2_DEFAULT_ITERATIONS;
        if (iterations < 10_000) throw new Error('iterations_too_low');
        result = await hashPin(data.pin, data.salt, iterations);
      } else if (data.type === 'encrypt') {
        result = await encryptString(data.plaintext, data.passphrase);
      } else {
        result = await decryptString(data.payload, data.passphrase);
      }
      const ok: CryptoWorkerOk = { type: 'ok', id: data.id, result };
      ctx.postMessage(ok);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const errResp: CryptoWorkerErr = { type: 'err', id: data.id, error: msg };
      ctx.postMessage(errResp);
    }
  })();
});

/* Heartbeat ready (utile pour debug + tests : permet à l'host de vérifier alive) */
ctx.postMessage({ type: 'ready' });
