#!/usr/bin/env node
/* APPLE PRÊT ? (1.11.2026, Kevin : « prépare tout pour qu'on soit opérationnel, tout automatique »).
 * Vérifie, SANS rien modifier chez Apple et sans coût macOS, que la clé App Store Connect posée en secret marche vraiment :
 * clé lisible → jeton signé → API Apple répond → apps / identifiants d'app / certificats / profils comptés.
 * Journal : verdicts et nombres seulement (jamais la clé, jamais le jeton). Sortie 0 = tout bon, 1 = quelque chose manque (dit en français), 2 = manque un secret.
 * Secrets lus (noms réels posés par Kevin le 29.10 + anciens noms du workflow TestFlight) :
 *   clé : APPSTORE_API_KEY_BASE64 (fichier .p8 en base64) ou ASC_PRIVATE_KEY (PEM)
 *   Key ID : APPSTORE_API_KEY_ID ou ASC_KEY_ID · Issuer ID : APPSTORE_API_ISSUER ou ASC_ISSUER_ID · équipe : APPLE_TEAM_ID (défaut Y45767LAGC) */
import crypto from 'node:crypto';
const annot = (n, t, m) => console.log(`::${n} title=${t}::${m}`);
const E = process.env;
export const EQUIPE_PAR_DEFAUT = 'Y45767LAGC';
export function lireCle(env) {
  const b64 = String(env.APPSTORE_API_KEY_BASE64 || '').trim();
  let pem = String(env.ASC_PRIVATE_KEY || '').trim();
  if (!pem && b64) { try { pem = Buffer.from(b64, 'base64').toString('utf8').trim(); } catch { pem = ''; } }
  return pem;
}
export function jeton({ pem, keyId, issuer, maintenant = Math.floor(Date.now() / 1000) }) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const tete = b({ alg: 'ES256', kid: keyId, typ: 'JWT' }), corps = b({ iss: issuer, iat: maintenant, exp: maintenant + 600, aud: 'appstoreconnect-v1' });
  const sig = crypto.sign('sha256', Buffer.from(tete + '.' + corps), { key: pem, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return tete + '.' + corps + '.' + sig;
}
export function manque(env) {
  const m = [];
  if (!lireCle(env)) m.push('clé .p8 (APPSTORE_API_KEY_BASE64)');
  if (!(env.APPSTORE_API_KEY_ID || env.ASC_KEY_ID)) m.push('Key ID (APPSTORE_API_KEY_ID)');
  if (!(env.APPSTORE_API_ISSUER || env.ASC_ISSUER_ID)) m.push('Issuer ID (APPSTORE_API_ISSUER)');
  return m;
}
async function main() {
  const m = manque(E);
  if (m.length) { annot('error', 'Apple prêt ?', `il manque : ${m.join(' · ')}. L'Issuer ID se lit dans App Store Connect → Utilisateurs et accès → Intégrations (c'est un identifiant, pas un mot de passe).`); process.exit(2); }
  const pem = lireCle(E), keyId = E.APPSTORE_API_KEY_ID || E.ASC_KEY_ID, issuer = E.APPSTORE_API_ISSUER || E.ASC_ISSUER_ID;
  if (!/BEGIN (EC )?PRIVATE KEY/.test(pem)) { annot('error', 'Apple prêt ?', 'la clé posée n\'est pas un fichier .p8 lisible (il doit commencer par BEGIN PRIVATE KEY)'); process.exit(1); }
  let tok; try { tok = jeton({ pem, keyId, issuer }); } catch { annot('error', 'Apple prêt ?', 'la clé .p8 est illisible (copie tronquée ?) — la signature du jeton échoue'); process.exit(1); }
  annot('notice', 'Apple prêt ?', `clé lisible, jeton signé (Key ID ${keyId.slice(0, 2)}…${keyId.slice(-2)}), équipe ${E.APPLE_TEAM_ID || EQUIPE_PAR_DEFAUT}`);
  const get = async (p) => { const r = await fetch('https://api.appstoreconnect.apple.com' + p, { headers: { authorization: 'Bearer ' + tok } }); return { s: r.status, j: await r.json().catch(() => ({})) }; };
  let ko = 0;
  for (const [nom, p] of [['apps', '/v1/apps?limit=200&fields[apps]=name,bundleId'], ['identifiants d\'app', '/v1/bundleIds?limit=200&fields[bundleIds]=identifier,name,platform'], ['certificats', '/v1/certificates?limit=200&fields[certificates]=certificateType,expirationDate'], ['profils', '/v1/profiles?limit=200&fields[profiles]=name,profileState,expirationDate']]) {
    const { s, j } = await get(p);
    if (s === 401) { annot('error', 'Apple prêt ?', 'Apple refuse la clé (401) : Key ID ou Issuer ID ne correspondent pas à la clé, ou la clé a été révoquée'); process.exit(1); }
    if (s === 403) { annot('warning', 'Apple prêt ?', `${nom} : la clé n'a pas le droit (403) — créer une clé de rôle Admin ou App Manager`); ko++; continue; }
    if (s !== 200) { annot('warning', 'Apple prêt ?', `${nom} : réponse inattendue HTTP ${s}`); ko++; continue; }
    const d = j.data || [];
    annot('notice', 'Apple prêt ?', `${nom} : ${d.length}` + (nom === 'apps' ? ' — ' + (d.map((x) => x.attributes && (x.attributes.name + ' ' + x.attributes.bundleId)).join(' ; ') || 'aucune app créée dans App Store Connect pour l\'instant') : '') + (nom === 'certificats' || nom === 'profils' ? (d.length ? '' : ' (normal : la signature se crée automatiquement au premier envoi)') : ''));
  }
  annot(ko ? 'warning' : 'notice', 'Apple prêt ?', ko ? 'la clé marche mais certains droits manquent (voir plus haut)' : 'TOUT BON : la clé Apple marche, l\'API répond, rien d\'autre à fournir côté Apple pour construire et envoyer');
  process.exit(ko ? 1 : 0);
}
if (import.meta.url === 'file://' + process.argv[1]) await main();
