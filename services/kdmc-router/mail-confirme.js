/* CONFIRMATION PAR MAIL POUR TOUTES LES INSCRIPTIONS DU DOMAINE (Kevin 17.10.2026 : « B », après « Non pas d'autre num »).
 *
 * WhatsApp exige un deuxième numéro que Kevin n'a pas. À la place : à l'inscription (/__sso/issue, la porte unique de toutes les apps),
 * la personne donne son e-mail ; le domaine lui envoie UN mail avec un bouton « Confirmer mon compte ». Le bouton ouvre
 *   GET /__sso/mail/confirmer?t=<jeton signé>
 * et le compte s'ouvre TOUT SEUL — exactement ce que faisait « ✅ Ouvrir » dans l'admin (la marque validé est posée sur la fiche,
 * la ligne d'attente est vidée, le journal garde la trace). Kevin n'a plus rien à toucher ; il reste prévenu (push) et peut toujours
 * ouvrir ou refuser à la main : la validation manuelle n'est pas retirée, elle devient le secours.
 *
 * Gratuit : EmailJS (même service et gabarit que les boutiques et kdmc-vente, 200 mails/mois), clé privée EMAILJS_PRIVATE_KEY poussée par
 * le déploiement du routeur. Interrupteur : KDMC_MAIL_CONFIRME = '0' coupe l'envoi (la personne attend Kevin, comme avant).
 *
 * Sécurité : le jeton = {uid, e-mail, expiration 48 h} signé HMAC-SHA256 avec la clé des sessions (KDMC_SSO_SECRET) — une page ne juge
 * jamais rien (règle d'or n° 8) ; un jeton forgé, expiré ou d'un autre compte n'ouvre rien ; un compte REFUSÉ par l'admin ou banni
 * n'est jamais rouvert par un mail ; le lien ne contient ni code ni session. Le jeton n'est jamais journalisé.
 * Garde : node services/kdmc-router/mail-confirme.test.mjs (sabotage : sans vérification de signature, un jeton forgé ouvre → rouge). */

const EMAILJS = { service: 'service_4s16z8l', template: 'template_fzva9uf', user: 'nUso3vcsGadvrWTtC', url: 'https://api.emailjs.com/api/v1.0/email/send' };
export const MAIL_TTL_MS = 48 * 3600 * 1000;

export const emailValide = (e) => { const s = String(e || '').trim(); return s.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s); };
export const normaliseEmail = (e) => String(e || '').trim().toLowerCase().slice(0, 120);
/** « k…n@kd-mc.com » (forme masquée) : assez pour se reconnaître, pas assez pour écrire à quelqu'un. */
export function masqueEmail(e) {
  const s = normaliseEmail(e); const i = s.indexOf('@'); if (i < 1) return '';
  const u = s.slice(0, i), d = s.slice(i + 1);
  return (u.length <= 2 ? u[0] + '…' : u[0] + '…' + u[u.length - 1]) + '@' + d;
}
export const mailPret = (env) => !!(env && env.EMAILJS_PRIVATE_KEY) && String((env && env.KDMC_MAIL_CONFIRME) || '') !== '0';

const b64url = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const b64urlStr = (str) => b64url(new TextEncoder().encode(str));
const b64urlToStr = (s) => { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return atob(s); };
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg))));
}
const memeChaine = (a, b) => { a = String(a); b = String(b); if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

/** Le jeton du lien : charge utile signée. */
export async function jetonConfirmation(secret, uid, email, now = Date.now()) {
  const charge = b64urlStr(JSON.stringify({ u: String(uid), e: normaliseEmail(email), x: now + MAIL_TTL_MS }));
  return charge + '.' + await hmac(secret, 'mail-confirme:' + charge);
}
/** → { uid, email } si la signature est juste et le jeton pas expiré ; sinon null. */
export async function lireJeton(secret, t, now = Date.now()) {
  const s = String(t || ''); const i = s.indexOf('.');
  if (!secret || i < 1 || s.length > 600) return null;
  const charge = s.slice(0, i), sig = s.slice(i + 1);
  if (!memeChaine(sig, await hmac(secret, 'mail-confirme:' + charge))) return null;
  let o; try { o = JSON.parse(b64urlToStr(charge)); } catch { return null; }
  if (!o || typeof o.u !== 'string' || typeof o.e !== 'string' || typeof o.x !== 'number' || o.x < now) return null;
  return { uid: o.u, email: o.e };
}

/** Le mail (EmailJS, best-effort : true/false, ne lève jamais). */
export async function envoyerMailConfirmation(env, { email, name, lien, fetchFn }) {
  if (!mailPret(env) || !emailValide(email) || !lien) return false;
  const f = fetchFn || fetch;
  /* 6 s au plus : une messagerie lente ne doit jamais retarder l'inscription (la personne attend Kevin si le mail n'est pas parti). */
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const minuteur = ctrl ? setTimeout(() => ctrl.abort(), 6000) : null;
  try {
    const r = await f(EMAILJS.url, {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: ctrl ? ctrl.signal : undefined,
      body: JSON.stringify({
        service_id: EMAILJS.service, template_id: EMAILJS.template, user_id: EMAILJS.user, accessToken: env.EMAILJS_PRIVATE_KEY,
        template_params: {
          to_email: normaliseEmail(email), store: 'kd-mc.com', name: 'kd-mc.com', from_name: 'kd-mc.com', from_email: 'no-reply@kd-mc.com', reply_to: 'no-reply@kd-mc.com',
          title: 'Confirme ton compte kd-mc.com',
          message: 'Bonjour ' + String(name || '').slice(0, 80) + ',\n\nTon compte kd-mc.com est créé. Pour l’ouvrir, touche ce lien (il marche 48 heures) :\n'
            + lien + '\n\nSi tu n’es pas à l’origine de cette inscription, ignore ce message : rien ne s’ouvrira.\n\nkd-mc.com',
        },
      }),
    });
    return !!(r && r.ok);
  } catch { return false; } finally { if (minuteur) clearTimeout(minuteur); }
}

const esc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function page({ emoji, titre, texte, bouton, lien, status = 200 }) {
  const html = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    + '<meta name="robots" content="noindex"><meta name="theme-color" content="#0b1409"><title>' + esc(titre) + ' — kd-mc.com</title>'
    + '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b1409;color:#f3f0e6;font:15px/1.5 -apple-system,sans-serif;padding:max(24px,env(safe-area-inset-top)) max(24px,env(safe-area-inset-right)) max(24px,env(safe-area-inset-bottom)) max(24px,env(safe-area-inset-left));text-align:center}'
    + '.c{max-width:340px;width:100%}h1{font-size:19px;color:#f6d97a;margin:8px 0 6px}p{margin:0 0 14px;color:#cfd8cc}'
    + 'a.b{display:block;width:100%;box-sizing:border-box;margin-top:12px;min-height:50px;line-height:50px;padding:0 20px;border-radius:13px;background:#e8b830;color:#11160c;font-weight:700;text-decoration:none}</style></head>'
    + '<body><div class="c"><div style="font-size:44px">' + emoji + '</div><h1>' + esc(titre) + '</h1><p>' + esc(texte) + '</p>'
    + (bouton ? '<a class="b" href="' + esc(lien || 'https://kd-mc.com/') + '">' + esc(bouton) + '</a>' : '') + '</div></body></html>';
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin', 'x-kdmc-porte': 'mail-confirme',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" } });
}

/**
 * GET /__sso/mail/confirmer?t=… — le bouton du mail. `deps` : { accGet(uid), accPut(acc), audLog(e), notifyPush(titre, corps), estBanni(uid, name), viderDemande(uid) }.
 * Rend une page HTML lisible sur iPhone, jamais de JSON brut à la personne. null si ce n'est pas cette route.
 */
export async function handleMailConfirme(request, url, env, secret, deps) {
  if (url.pathname !== '/__sso/mail/confirmer') return null;
  if (request.method !== 'GET' && request.method !== 'HEAD') return page({ emoji: '🤔', titre: 'Lien incomplet', texte: 'Ouvre le lien reçu par mail depuis ton téléphone.', status: 405 });
  const t = url.searchParams.get('t') || '';
  const j = await lireJeton(secret, t);
  if (!j) return page({ emoji: '⌛', titre: 'Ce lien ne marche plus', texte: 'Il a expiré (48 heures) ou il est incomplet. Reconnecte-toi sur kd-mc.com : l’administrateur peut ouvrir ton compte, ou tu peux te réinscrire.', bouton: 'Aller sur kd-mc.com', lien: 'https://kd-mc.com/', status: 410 });
  const acc = await deps.accGet(j.uid);
  if (!acc) return page({ emoji: '🤔', titre: 'Compte introuvable', texte: 'Ce compte n’existe plus. Tu peux te réinscrire sur kd-mc.com.', bouton: 'Aller sur kd-mc.com', lien: 'https://kd-mc.com/', status: 404 });
  const mc = acc.mail_confirmation || {};
  if (mc.email_hash && mc.email_hash !== await sha256Hex(j.email)) return page({ emoji: '🤔', titre: 'Ce lien n’est pas pour ce compte', texte: 'Le mail de confirmation a été envoyé à une autre adresse. Reconnecte-toi sur kd-mc.com.', bouton: 'Aller sur kd-mc.com', lien: 'https://kd-mc.com/', status: 409 });
  if (acc.attente_admin === 'refuse') return page({ emoji: '🚫', titre: 'Compte non validé', texte: 'L’administrateur n’a pas validé ce compte. Un mail ne peut pas l’ouvrir : demande-lui directement.', status: 403 });
  if (deps.estBanni && await deps.estBanni(acc.uid, acc.name)) return page({ emoji: '🚫', titre: 'Compte non validé', texte: 'Ce compte ne peut pas être ouvert.', status: 403 });
  if (!acc.attente_admin) return page({ emoji: '✅', titre: 'Ton compte est déjà ouvert', texte: (acc.name || 'Ton compte') + ', tu peux entrer dans les apps du domaine.', bouton: 'Entrer sur kd-mc.com', lien: 'https://kd-mc.com/' });
  delete acc.attente_admin;
  acc.valide_mail_at = Date.now();
  acc.mail_confirmation = Object.assign({}, mc, { confirme_at: Date.now() });
  await deps.accPut(acc);
  if (deps.viderDemande) { try { await deps.viderDemande(acc.uid); } catch { /* table absente : rien à vider */ } }
  if (deps.audLog) { try { await deps.audLog({ ev: 'compte_ouvert_mail', uid: acc.uid, name: acc.name, detail: 'mail confirmé (' + masqueEmail(j.email) + ')' }); } catch { /* journal best-effort */ } }
  if (deps.notifyPush) { try { await deps.notifyPush('✅ KDMC — compte ouvert par mail', (acc.name || acc.uid) + ' a confirmé son adresse : son compte est ouvert tout seul.'); } catch { /* push best-effort */ } }
  return page({ emoji: '🎉', titre: 'Ton compte est ouvert', texte: (acc.name || 'Ton compte') + ', c’est confirmé. Retourne sur kd-mc.com : la page s’ouvre toute seule.', bouton: 'Entrer sur kd-mc.com', lien: 'https://kd-mc.com/' });
}

export async function sha256Hex(str) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(str)));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
