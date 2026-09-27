/* Jeton Google du SERVICE ACCOUNT Firebase (secrets FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY).
   Sorti de deploy-rules.cjs le 27.09.2026 pour être partagé avec fiches-privees-migrer.cjs
   (une seule copie de ce code délicat : PEM, JSON complet, DER pkcs8). */
const crypto = require('node:crypto');

const b64url = (buf) => Buffer.from(buf).toString('base64url');

/* Le secret peut être : la clé PEM, la même avec des « \n » écrits en toutes lettres, ou le JSON
   complet du service account (on en extrait private_key, et client_email s'il manque). */
function lireSecrets() {
  let email = process.env.FIREBASE_CLIENT_EMAIL;
  let raw = (process.env.FIREBASE_PRIVATE_KEY || '').trim();
  if (!email || !raw) throw new Error('Secrets manquants : FIREBASE_CLIENT_EMAIL et/ou FIREBASE_PRIVATE_KEY');
  const q = raw[0];
  if ((q === '"' || q === "'") && raw.endsWith(q)) raw = raw.slice(1, -1);
  if (raw.startsWith('{')) {
    try {
      const j = JSON.parse(raw);
      if (j.private_key) raw = j.private_key;
      if (j.client_email && !email) email = j.client_email;
    } catch (_) { /* pas du JSON valide : on le traite comme une clé brute */ }
  }
  return { email, raw: raw.replaceAll('\\r', '').replaceAll('\\n', '\n') };
}

/* MÉTHODE FIDÈLE au worker qui marche (apex-auth-worker importPrivateKey) :
   PEM d'abord ; sinon armure retirée + tout caractère non-base64 → DER → pkcs8. */
function clePrivee(raw) {
  if (raw.includes('-----BEGIN')) {
    try { return { cle: crypto.createPrivateKey(raw), how: 'pem' }; } catch (_) { /* on tente le DER ci-dessous */ }
  }
  let b64 = raw.replace(/-----BEGIN[^-]*-----/g, '').replace(/-----END[^-]*-----/g, '').replace(/[^A-Za-z0-9+/]/g, '');
  while (b64.length % 4) b64 += '=';
  try {
    const der = Buffer.from(b64, 'base64');
    return { cle: crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' }), how: 'der-pkcs8(b64=' + b64.length + ' der=' + der.length + ')' };
  } catch (e) {
    return { cle: null, how: 'der KO: ' + e.message };
  }
}

async function getAccessToken() {
  const { email, raw } = lireSecrets();
  const { cle, how } = clePrivee(raw);
  console.log('   clé: ' + (cle ? 'OK ' : 'ÉCHEC ') + how);
  if (!cle) throw new Error('FIREBASE_PRIVATE_KEY illisible (PEM + DER pkcs8 échoués) — ' + how);
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: email,
    scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600
  }));
  const signed = crypto.createSign('RSA-SHA256').update(header + '.' + claim).sign(cle);
  const jwt = header + '.' + claim + '.' + b64url(signed);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + encodeURIComponent(jwt)
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.access_token) throw new Error('OAuth token KO : HTTP ' + r.status + ' ' + JSON.stringify(j));
  return j.access_token;
}

module.exports = { getAccessToken };
