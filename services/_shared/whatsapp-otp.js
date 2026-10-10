/* MOTEUR PARTAGÉ — confirmation par WhatsApp « inversé », gratuite (Kevin 9.10).
 *
 * Utilisé par le domaine (services/kdmc-router/tel-inscription.js : toutes les inscriptions)
 * et par la vente (services/kdmc-vente/tel.js : lier un code d'accès à un téléphone).
 * Une seule façon de tirer un code, de le garder (empreinte, jamais en clair), de vérifier
 * une signature Meta et d'envoyer la réponse : un correctif ici vaut pour les deux.
 *
 * Gratuit parce que c'est la PERSONNE qui écrit en premier (lien wa.me prérempli) : la réponse
 * dans les 24 h est un message de service, non facturé. Pas de SMS (aucun gratuit), pas de
 * message « modèle » d'authentification (payant).
 */

/* Version de l'API Graph : v20.0 est retirée depuis le 24.09.2026 (changelog Meta, vu par la relecture du 9.10).
   Réglable sans toucher au code (WA_GRAPH_VERSION) le jour où celle-ci vieillit à son tour. */
export const GRAPH_VERSION_DEFAUT = 'v23.0';
export const grapheWhatsApp = (env) => 'https://graph.facebook.com/' + ((env && env.WA_GRAPH_VERSION) || GRAPH_VERSION_DEFAUT);
export const ALPHA_DEMANDE = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/* Les 4 secrets sans lesquels rien ne part (WA_VERIFY_TOKEN ne sert qu'à l'abonnement). */
export function whatsappPret(env) {
  return Boolean(env && env.WA_ACCESS_TOKEN && env.WA_PHONE_NUMBER_ID && env.WA_APP_SECRET && env.WA_NUMERO_PUBLIC);
}

export function aleatoire(n, alphabet) {
  const o = crypto.getRandomValues(new Uint8Array(n));
  let s = '';
  for (let i = 0; i < n; i++) s += alphabet[o[i] % alphabet.length];
  return s;
}
/* 6 chiffres sans biais (rejet au-delà du plus grand multiple de 10^6). */
export function codeSixChiffres() {
  const lim = Math.floor(0xFFFFFFFF / 1e6) * 1e6;
  for (;;) {
    const v = crypto.getRandomValues(new Uint32Array(1))[0];
    if (v < lim) return String(v % 1e6).padStart(6, '0');
  }
}
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export async function sha256(txt) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt)));
}
export async function hmac256(secret, corps) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(corps)));
}
export function egalConstant(a, b) {
  a = String(a); b = String(b);
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}
/* Indicatifs à 3 chiffres les plus proches de nous (Monaco 377 d'abord) ; 1 et 7 en ont 1 ; le reste, 2. */
const INDICATIFS_3 = /^(35[0-9]|37[0-9]|38[0-9]|42[0-3])/;
function longueurIndicatif(c) { return INDICATIFS_3.test(c) ? 3 : /^[17]/.test(c) ? 1 : 2; }
/* « 33612345678 » → « +33 6•• •• •• 78 », « 37761234567 » → « +377 6•• •• •• 67 » : assez pour se reconnaître, pas pour appeler. */
export function masqueTel(chiffres) {
  const c = String(chiffres || '').replace(/\D/g, '');
  if (c.length < 6) return '•••';
  const n = longueurIndicatif(c);
  return '+' + c.slice(0, n) + ' ' + c.slice(n, n + 1) + '•• •• •• ' + c.slice(-2);
}
/* L'empreinte d'un numéro : une HMAC avec le secret de l'app Meta (présent dans les deux workers), pas un simple
   SHA-256 — les numéros d'un pays tiennent en ~10⁹ essais, une empreinte sans secret se retrouve en minutes. */
export function empreinteTel(env, chiffres) { return hmac256(String((env && env.WA_APP_SECRET) || ''), 'kdmc-tel:' + String(chiffres || '').replace(/\D/g, '')); }

/* Compteur anti-rafale SANS écriture KV (le quota gratuit est de 1 000 écritures/jour pour tout le domaine) : le cache
   Cloudflare du point de présence (gratuit, illimité) ; hors Cloudflare (tests), une mémoire locale. */
const _memoire = new Map();
export async function compteur(cle, max, ttlSec) {
  const url = 'https://compteur.kdmc.invalid/' + encodeURIComponent(cle);
  try {
    if (typeof caches !== 'undefined' && caches.default) {
      const r = await caches.default.match(url);
      const n = r ? Number(await r.text()) || 0 : 0;
      if (n >= max) return { ok: false, n };
      await caches.default.put(url, new Response(String(n + 1), { headers: { 'cache-control': 'max-age=' + ttlSec } }));
      return { ok: true, n: n + 1 };
    }
  } catch (_) { /* cache indisponible : on retombe sur la mémoire */ }
  const now = Date.now(), e = _memoire.get(url);
  const v = e && e.fin > now ? e : { n: 0, fin: now + ttlSec * 1000 };
  if (v.n >= max) return { ok: false, n: v.n };
  v.n++; _memoire.set(url, v);
  return { ok: true, n: v.n };
}

/* Le webhook ne vaut que signé par Meta (X-Hub-Signature-256 = HMAC du corps BRUT). */
export async function signatureMetaValide(env, corpsBrut, entete) {
  if (!env || !env.WA_APP_SECRET || !entete) return false;
  const attendu = 'sha256=' + await hmac256(env.WA_APP_SECRET, corpsBrut);
  return egalConstant(attendu, String(entete).trim());
}
/* Abonnement du webhook (étape « Vérifier » chez Meta) : seul le bon mot rend le défi. */
export function abonnementMeta(env, url) {
  const ok = url.searchParams.get('hub.mode') === 'subscribe' && env && env.WA_VERIFY_TOKEN
    && egalConstant(url.searchParams.get('hub.verify_token') || '', env.WA_VERIFY_TOKEN);
  return ok ? { status: 200, texte: String(url.searchParams.get('hub.challenge') || '') } : { status: 403, texte: 'non' };
}
/* Les messages texte d'un appel Meta (entry[].changes[].value.messages[]), 10 au plus. */
export function messagesTexte(j) {
  const out = [];
  for (const e of ((j && j.entry) || [])) for (const c of (e.changes || [])) for (const m of ((c.value && c.value.messages) || [])) {
    if (m && m.type === 'text' && m.from) out.push({ de: String(m.from).replace(/\D/g, ''), texte: String((m.text && m.text.body) || '') });
  }
  return out.slice(0, 10);
}
/* « KDMC XXXXXXXX » dans le message → l'identifiant de demande (8 à 10 caractères), ou null. */
export function demandeDuTexte(texte) {
  const t = String(texte || '').toUpperCase().match(/KDMC\s+([A-Z0-9]{8,10})\b/);
  return t ? t[1] : null;
}
export async function envoieWhatsApp(env, a, texte) {
  try {
    const r = await fetch(grapheWhatsApp(env) + '/' + env.WA_PHONE_NUMBER_ID + '/messages', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + env.WA_ACCESS_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: a, type: 'text', text: { body: texte } }),
      signal: AbortSignal.timeout(8000),
    });
    return { ok: r.ok, status: r.status };
  } catch (e) { return { ok: false, detail: String((e && e.message) || e).slice(0, 80) }; }
}
export const TEXTE_CODE = (code6, minutes) => 'Ton code KD-MC : ' + code6 + '\nIl vaut encore ' + Math.max(1, minutes || 1) + ' min. Ne le donne à personne : on ne te le demandera jamais par téléphone.';
export function lienWaMe(env, demande) {
  return 'https://wa.me/' + String(env.WA_NUMERO_PUBLIC).replace(/\D/g, '') + '?text=' + encodeURIComponent('KDMC ' + demande);
}
