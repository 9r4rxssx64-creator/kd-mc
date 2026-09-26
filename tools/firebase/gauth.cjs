#!/usr/bin/env node
/**
 * gauth.cjs — Mint un access_token Google OAuth2 (service account) pour la RTDB
 * cmcteams-c16ab et l'imprime sur stdout. Utilisé par les workflows qui lisent
 * /apex ou /cmcteams (durcis auth != null) : handoff-sync, firebase-backup.
 *
 * Usage : TOKEN=$(node tools/firebase/gauth.cjs)   # '' si secrets absents (fail-open)
 * Env   : FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY (secrets GitHub existants).
 *
 * Même logique de parsing de clé que tools/firebase/deploy-rules.cjs (PEM ou DER
 * pkcs8, JSON service-account complet accepté). Cause exacte sur stderr en cas
 * d'échec (règle CLAUDE.md « détailler les erreurs »), stdout reste vide → les
 * curl appelants tombent en mode non-authentifié (comportement d'avant).
 */
const crypto = require('crypto');

function b64url(buf) { return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }

async function main() {
  let email = process.env.FIREBASE_CLIENT_EMAIL;
  let raw = (process.env.FIREBASE_PRIVATE_KEY || '').trim();
  if (!email || !raw) { console.error('[gauth] secrets absents (FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY) — token vide (fail-open)'); return ''; }
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) raw = raw.slice(1, -1);
  let raw2 = raw;
  if (raw2.startsWith('{')) { try { const j = JSON.parse(raw2); if (j.private_key) raw2 = j.private_key; if (j.client_email && !email) email = j.client_email; } catch (_) { /* ignore */ } }
  raw2 = raw2.replace(/\\r/g, '').replace(/\\n/g, '\n');

  let keyObj = null, how = '';
  if (/-----BEGIN/.test(raw2)) { try { keyObj = crypto.createPrivateKey(raw2); how = 'pem'; } catch (_) { /* ignore */ } }
  if (!keyObj) {
    let b64 = raw2.replace(/-----BEGIN[^-]*-----/g, '').replace(/-----END[^-]*-----/g, '').replace(/[^A-Za-z0-9+/]/g, '');
    while (b64.length % 4) b64 += '=';
    try { const der = Buffer.from(b64, 'base64'); keyObj = crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' }); how = 'der-pkcs8'; }
    catch (e) { how = 'der KO: ' + e.message; }
  }
  if (!keyObj) { console.error('[gauth] FIREBASE_PRIVATE_KEY illisible — ' + how); return ''; }

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: email,
    scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  }));
  const signed = crypto.createSign('RSA-SHA256').update(header + '.' + claim).sign(keyObj);
  const jwt = header + '.' + claim + '.' + b64url(signed);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + encodeURIComponent(jwt),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || !j.access_token) { console.error('[gauth] OAuth KO : HTTP ' + r.status + ' ' + JSON.stringify(j).slice(0, 200)); return ''; }
  return j.access_token;
}

main().then((t) => { process.stdout.write(t); }).catch((e) => { console.error('[gauth] ' + e.message); process.stdout.write(''); });
