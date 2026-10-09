/* kdmc-router — émission de tokens Firebase custom (RÔLE) pour le lockdown shops.
 *
 * Mission : derrière le GRANT admin du domaine (lesson #99, /__admin/login prouve
 * le PIN sha256), mint un id_token Firebase portant la claim { role:'admin' } pour
 * que les règles RTDB shops_admin_v1/(products|logos) + shops_sourcing_v1/selection
 * puissent exiger `auth.token.role === 'admin'` → seuls Kevin/Lolo écrivent.
 *
 * Code de signature RS256 + échange repris VERBATIM de apex-auth-worker (éprouvé).
 * FAIL-SAFE : si les secrets FB ne sont pas posés (FIREBASE_PRIVATE_KEY /
 * FIREBASE_CLIENT_EMAIL / FIREBASE_WEB_API_KEY) → renvoie null. Le client fail-open
 * (pas de ?auth=) → comportement actuel inchangé, jamais de blocage pendant le rollout.
 *
 * Secrets requis (posés par .github/workflows/deploy-kdmc-router.yml depuis les
 * secrets GitHub déjà existants) :
 *   - FIREBASE_PRIVATE_KEY   (PEM service account kdmc-clients)
 *   - FIREBASE_CLIENT_EMAIL  (firebase-adminsdk-...@...iam.gserviceaccount.com)
 *   - FIREBASE_WEB_API_KEY   (clé Web PUBLIQUE — échange custom_token → id_token)
 */

export function fbB64urlEncode(input) {
  let str;
  if (typeof input === 'string') str = btoa(input);
  else str = btoa(String.fromCharCode.apply(null, input));
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function fbImportPrivateKey(pem) {
  const body = String(pem || '')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\\n/g, '')
    .replace(/\s+/g, '');
  const binary = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8',
    binary,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

/* Construit + signe un custom token Firebase (RS256) avec claims de rôle. */
export async function fbSignCustomToken(env, uid, claims) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: env.FIREBASE_CLIENT_EMAIL,
    sub: env.FIREBASE_CLIENT_EMAIL,
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    iat: now,
    exp: now + 3600,
    uid: uid,
    claims: claims || {}
  };
  const enc = new TextEncoder();
  const signingInput = fbB64urlEncode(JSON.stringify(header)) + '.' + fbB64urlEncode(JSON.stringify(payload));
  const key = await fbImportPrivateKey(env.FIREBASE_PRIVATE_KEY);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(signingInput));
  return signingInput + '.' + fbB64urlEncode(new Uint8Array(sig));
}

/* Échange custom_token → id_token via la clé Web publique. Renvoie null en fail-open. */
export async function fbExchangeForIdToken(customToken, env) {
  if (!env.FIREBASE_WEB_API_KEY) return null;
  try {
    const r = await fetch(
      'https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=' +
        encodeURIComponent(env.FIREBASE_WEB_API_KEY),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: customToken, returnSecureToken: true })
      }
    );
    if (!r.ok) return null;
    const d = await r.json();
    return { idToken: d.idToken, refreshToken: d.refreshToken, expiresIn: parseInt(d.expiresIn, 10) || 3600 };
  } catch (_) {
    return null;
  }
}

/* Point d'entrée : mint un id_token role:admin pour les écritures shops.
 * Renvoie { ok, id_token, expires_in } ou { ok:false, reason } (fail-safe). */
export async function mintShopsAdminIdToken(env) {
  if (!env || !env.FIREBASE_PRIVATE_KEY || !env.FIREBASE_CLIENT_EMAIL) {
    return { ok: false, reason: 'fb_not_configured' };
  }
  let customToken;
  try {
    customToken = await fbSignCustomToken(env, 'kdmc_admin', { role: 'admin', scope: 'shops' });
  } catch (e) {
    return { ok: false, reason: 'sign_failed', detail: (e && e.message) || String(e) };
  }
  const idt = await fbExchangeForIdToken(customToken, env);
  if (!idt || !idt.idToken) {
    // Échange indispo (clé web absente / Auth non activé) → renvoie le custom_token,
    // le client pourra tenter l'échange lui-même s'il a la clé publique. Fail-open.
    return { ok: true, custom_token: customToken, id_token: null, expires_in: 3600, exchanged: false };
  }
  return { ok: true, id_token: idt.idToken, refresh_token: idt.refreshToken, expires_in: idt.expiresIn, exchanged: true };
}
