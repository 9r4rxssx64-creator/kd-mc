/* CODES DES COMPTES : l'admin voit / pose / réinitialise ; la personne qui a oublié son code le réinitialise par un lien e-mail
 * (Kevin 7.11.2026, décision « Code posé par l'admin, relisible » ; précision 8.11 : côté personnes, UNE seule option, « Code oublié ? »).
 *
 * Deux sortes de code, une seule vérité de connexion (l'empreinte PBKDF2 `cred:<uid>`, jugée par le domaine) :
 *   · code POSÉ PAR L'ADMIN (POST /__admin/code-poser, /__admin/compte-invite) : en plus de l'empreinte, une copie CHIFFRÉE
 *     (AES-GCM 256, clé dérivée par HKDF du secret des sessions KDMC_SSO_SECRET avec l'étiquette dédiée ci-dessous, uid en donnée associée)
 *     en KV `credv:<uid>` — relisible par l'admin SEUL (GET /__admin/code-voir) ;
 *   · code CHOISI PAR LA PERSONNE (création, réinitialisation par mail, code proposé accepté) : empreinte seulement, illisible ;
 *     la copie relisible `credv:` est EFFACÉE au même moment (credSet du routeur le fait toujours).
 * Jamais dans un journal (audLog), jamais dans le pont, jamais pour l'identité admin (Face ID / code admin : refusé partout ici).
 *
 * « Code oublié ? » : POST /__sso/code/oublie {name} → réponse TOUJOURS identique (que le compte existe, ait un e-mail ou non) ;
 * si la fiche a un e-mail, un mail part avec un lien signé (HMAC, 1 h, usage unique : le nonce est rangé en KV `crr:<uid>` et effacé
 * AVANT de poser le code ; un nouveau lien annule l'ancien). GET /__sso/code/reinit?t= → petite page (375 px) nouveau code + confirmation ;
 * POST /__sso/code/reinit → pose le code (empreinte), efface `credv:`, invalide le jeton, remet le compteur d'essais à zéro.
 * Gardes : node services/kdmc-router/codes-comptes.test.mjs (SABOTAGE=signature|credv|unique|journal rouge). */

import { envoyerMail, masqueEmail, emailValide, mailPret } from './mail-confirme.js';

export const REINIT_TTL_MS = 3600 * 1000;
export const ETIQUETTE_CREDV = 'kdmc-credv-v1:copie-chiffree-des-codes-poses-par-admin';
const SABOTAGE = (typeof process !== 'undefined' && process.env && process.env.SABOTAGE) || '';

const enc = (s) => new TextEncoder().encode(String(s));
const b64url = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const deB64url = (s) => { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const b = atob(s); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
const memeChaine = (a, b) => { a = String(a); b = String(b); if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc(msg))));
}
async function sha256(s) { return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc(s)))); }

/* ---- Copie chiffrée (credv) ---- */
async function cleCredv(secret) {
  const ikm = await crypto.subtle.importKey('raw', enc(secret), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: enc('kd-mc.com'), info: enc(ETIQUETTE_CREDV) }, ikm, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
/** → l'enregistrement à ranger en KV `credv:<uid>` (jamais le code en clair). */
export async function chiffrerCode(secret, uid, code) {
  if (!secret) throw new Error('secret absent');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc('credv:' + uid) }, await cleCredv(secret), enc(code));
  return { v: 1, iv: b64url(iv), ct: b64url(new Uint8Array(ct)), at: Date.now(), par: 'admin' };
}
/** → le code, ou null (secret faux, enregistrement d'un autre compte, abîmé). */
export async function dechiffrerCode(secret, uid, rec) {
  try {
    if (!secret || !rec || rec.v !== 1) return null;
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64url(rec.iv), additionalData: enc('credv:' + uid) }, await cleCredv(secret), deB64url(rec.ct));
    return new TextDecoder().decode(pt);
  } catch { return null; }
}
/** 8 chiffres tirés au hasard (crypto, sans biais de modulo). Facile à dicter au téléphone, accepté partout (≥ 6 caractères). */
export function codeAuHasard() {
  let s = '';
  while (s.length < 8) { const b = crypto.getRandomValues(new Uint8Array(1))[0]; if (b < 250) s += String(b % 10); }
  return s;
}

/* ---- Jeton du lien « Code oublié ? » ---- */
export async function jetonReinit(secret, uid, nonce, now = Date.now()) {
  const charge = b64url(enc(JSON.stringify({ u: String(uid), n: String(nonce), x: now + REINIT_TTL_MS })));
  return charge + '.' + await hmac(secret, 'code-reinit:' + charge);
}
/** → { uid, nonce } si la signature est juste et le jeton pas expiré (l'usage unique est vérifié à part, avec `crr:`). */
export async function lireJetonReinit(secret, t, now = Date.now()) {
  const s = String(t || ''); const i = s.indexOf('.');
  if (!secret || i < 1 || s.length > 600) return null;
  const charge = s.slice(0, i), sig = s.slice(i + 1);
  if (SABOTAGE !== 'signature' && !memeChaine(sig, await hmac(secret, 'code-reinit:' + charge))) return null;
  let o; try { o = JSON.parse(new TextDecoder().decode(deB64url(charge))); } catch { return null; }
  if (!o || typeof o.u !== 'string' || typeof o.n !== 'string' || typeof o.x !== 'number' || o.x < now) return null;
  return { uid: o.u, nonce: o.n };
}

/* ---- La petite page (iPhone 375 px) ---- */
const esc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function pageReinit({ emoji, titre, texte, formulaire, jeton, erreur, status = 200 }) {
  const form = formulaire
    ? '<form method="post" action="/__sso/code/reinit" autocomplete="off">'
      + '<input type="hidden" name="t" value="' + esc(jeton) + '">'
      + '<label for="n1">Nouveau code (6 chiffres ou plus)</label><input id="n1" name="nouveau" type="password" inputmode="numeric" autocomplete="new-password" minlength="6" maxlength="64" required>'
      + '<label for="n2">Encore une fois</label><input id="n2" name="confirme" type="password" inputmode="numeric" autocomplete="new-password" minlength="6" maxlength="64" required>'
      + (erreur ? '<p class="e" role="alert">' + esc(erreur) + '</p>' : '')
      + '<button type="submit">Enregistrer</button></form>'
    : '<a class="b" href="https://kd-mc.com/">Aller sur kd-mc.com</a>';
  const html = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    + '<meta name="robots" content="noindex"><meta name="referrer" content="no-referrer"><meta name="theme-color" content="#0b1409"><title>' + esc(titre) + ' — kd-mc.com</title>'
    + '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b1409;color:#f3f0e6;font:16px/1.5 -apple-system,sans-serif;padding:max(20px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(20px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));box-sizing:border-box}'
    + '.c{max-width:343px;width:100%;text-align:center}h1{font-size:20px;color:#f6d97a;margin:8px 0 6px}p{margin:0 0 14px;color:#cfd8cc}form{text-align:left}'
    + 'label{display:block;font-size:14px;color:#cfd8cc;margin:12px 0 4px}input{width:100%;box-sizing:border-box;min-height:48px;padding:0 14px;border-radius:12px;border:1px solid #3d4a36;background:#121c10;color:#f3f0e6;font-size:18px}'
    + 'button,a.b{display:block;width:100%;box-sizing:border-box;margin-top:16px;min-height:50px;line-height:50px;padding:0 16px;border:0;border-radius:13px;background:#e8b830;color:#11160c;font-weight:700;font-size:16px;text-align:center;text-decoration:none}'
    + '.e{color:#ffb4a8;margin:10px 0 0}</style></head>'
    + '<body><div class="c"><div style="font-size:44px">' + emoji + '</div><h1>' + esc(titre) + '</h1><p>' + esc(texte) + '</p>' + form + '</div></body></html>';
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer', 'x-kdmc-porte': 'code-reinit',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'" } });
}

const ORIGINE_DOMAINE = /^https:\/\/([a-z0-9-]+\.)*kd-mc\.com$/i;
export const REPONSE_OUBLIE = { ok: true, message: 'Si ce compte existe et qu\'une adresse e-mail est enregistrée, un lien vient de partir (valable 1 heure). Regarde aussi dans les indésirables. Pas d\'e-mail ? Demande à l\'administrateur.' };
const LIEN_MORT = { emoji: '⌛', titre: 'Ce lien ne marche plus', texte: 'Il a expiré ou il a déjà servi. Sur kd-mc.com, touche « Code oublié ? » pour en recevoir un autre.', status: 410 };

/**
 * Routes /__sso/code/* (rien d'autre). `deps` :
 *  { J, accGet(uid), accPut(acc), trouverCompte(name) → uid|'', estAdmin(uid, acc) → bool, credSet(uid, code) (efface aussi credv),
 *    credReussite(uid), audLog(e), ipHash(request), enFond(promesse), fetchFn? }
 * null si ce n'est pas une de ces routes.
 */
export async function handleCodesComptes(request, url, env, secret, deps) {
  const path = url.pathname;
  if (!path.startsWith('/__sso/code/')) return null;
  const { J } = deps;
  const KV = env && env.ACCOUNTS;

  if (path === '/__sso/code/oublie') {
    if (request.method !== 'POST') return J({ ok: false, reason: 'methode' }, undefined, 405);
    if (!ORIGINE_DOMAINE.test(request.headers.get('origin') || '')) return J({ ok: false, reason: 'origine refusée' }, undefined, 403);
    if (!KV || !secret) return J({ ok: false, reason: 'indisponible' }, undefined, 503);
    /* Débit par adresse : 5 demandes / heure. Fermé en cas de doute (registre illisible = refus). */
    const ip = await deps.ipHash(request);
    const cle = 'cro:' + ip + ':' + Math.floor(Date.now() / 3600e3);
    let n = 0; try { n = parseInt((await KV.get(cle)) || '0', 10) || 0; } catch { return J({ ok: false, reason: 'trop_essais', message: 'Réessaie dans un moment.' }, undefined, 429); }
    if (n >= 5) return J({ ok: false, reason: 'trop_essais', message: 'Trop de demandes. Réessaie dans une heure.' }, undefined, 429);
    try { await KV.put(cle, String(n + 1), { expirationTtl: 3700 }); } catch { return J({ ok: false, reason: 'trop_essais', message: 'Réessaie dans un moment.' }, undefined, 429); }
    let b = {}; try { b = await request.json(); } catch { /* corps vide */ }
    const name = String(b.name || '').slice(0, 80).trim();
    /* Tout le travail qui dépend du compte part EN FOND : même réponse, même durée, que le compte existe ou non. */
    const travail = (async () => {
      if (name.split(/\s+/).filter(Boolean).length < 2) return;
      const uid = await deps.trouverCompte(name);
      if (!uid) return;
      const acc = await deps.accGet(uid);
      if (!acc || deps.estAdmin(uid, acc)) return;   // jamais le compte de l'administrateur
      const email = acc.fiche && acc.fiche.email;
      if (!emailValide(email) || !mailPret(env)) return;
      /* au plus un mail toutes les 10 minutes par compte (anti-harcèlement de la boîte de la personne) */
      let prec = null; try { prec = JSON.parse((await KV.get('crr:' + uid)) || 'null'); } catch { return; }
      if (prec && prec.at && Date.now() - prec.at < 600e3) return;
      const nonce = b64url(crypto.getRandomValues(new Uint8Array(24)));
      await KV.put('crr:' + uid, JSON.stringify({ h: await sha256(nonce), at: Date.now() }), { expirationTtl: 3700 });
      const lien = 'https://kd-mc.com/__sso/code/reinit?t=' + encodeURIComponent(await jetonReinit(secret, uid, nonce));
      const parti = await envoyerMail(env, { email, fetchFn: deps.fetchFn, title: 'Ton code kd-mc.com',
        message: 'Bonjour ' + String(acc.name || '').slice(0, 80) + ',\n\nTu as demandé à changer ton code kd-mc.com. Touche ce lien (il marche 1 heure, une seule fois) et choisis ton nouveau code :\n'
          + lien + '\n\nSi tu n’as rien demandé, ignore ce message : ton code actuel ne change pas.\n\nkd-mc.com' });
      await deps.audLog({ ev: 'code_oublie_mail', uid, name: acc.name, detail: (parti ? 'lien envoyé à ' : 'envoi échoué vers ') + masqueEmail(email) });
    })().catch(() => {});
    await deps.enFond(travail);
    return J(REPONSE_OUBLIE);
  }

  if (path === '/__sso/code/reinit') {
    if (request.method === 'GET' || request.method === 'HEAD') {
      const t = url.searchParams.get('t') || '';
      const j = await lireJetonReinit(secret, t);
      if (!j || !(await nonceValide(KV, j))) return pageReinit(LIEN_MORT);
      return pageReinit({ emoji: '🔑', titre: 'Choisis ton nouveau code', texte: 'Il marchera dans toutes les apps.', formulaire: true, jeton: t });
    }
    if (request.method !== 'POST') return pageReinit({ ...LIEN_MORT, status: 405 });
    if (!ORIGINE_DOMAINE.test(request.headers.get('origin') || '')) return pageReinit({ emoji: '🚫', titre: 'Demande refusée', texte: 'Ouvre le lien reçu par e-mail directement.', status: 403 });
    let f; try { f = await request.formData(); } catch { f = null; }
    const t = f ? String(f.get('t') || '') : '';
    const nouveau = f ? String(f.get('nouveau') || '') : '';
    const confirme = f ? String(f.get('confirme') || '') : '';
    const j = await lireJetonReinit(secret, t);
    if (!j || !KV || !(await nonceValide(KV, j))) return pageReinit(LIEN_MORT);
    const form = (erreur) => pageReinit({ emoji: '🔑', titre: 'Choisis ton nouveau code', texte: 'Il marchera dans toutes les apps.', formulaire: true, jeton: t, erreur, status: 400 });
    if (nouveau.length < 6 || nouveau.length > 64) return form('Il faut au moins 6 chiffres.');
    if (nouveau !== confirme) return form('Les deux codes ne sont pas pareils.');
    const acc = await deps.accGet(j.uid);
    if (!acc || deps.estAdmin(j.uid, acc)) return pageReinit(LIEN_MORT);
    /* usage UNIQUE : le jeton meurt AVANT que le code change (un 2e envoi du formulaire ne fait rien) */
    if (SABOTAGE !== 'unique') { try { await KV.delete('crr:' + j.uid); } catch { return pageReinit({ emoji: '⚠️', titre: 'Réessaie dans un instant', texte: 'Le registre ne répond pas.', status: 503 }); } }
    await deps.credSet(j.uid, nouveau);   // empreinte PBKDF2 + effacement de credv (code choisi par la personne = illisible)
    await deps.credReussite(j.uid);
    acc.code_at = Date.now(); delete acc.revoked_at_code;
    await deps.accPut(acc);
    await deps.audLog({ ev: 'code_reinit_mail', uid: j.uid, name: acc.name, detail: 'nouveau code choisi par la personne (lien e-mail)' });
    return pageReinit({ emoji: '✅', titre: 'C\'est fait', texte: 'Ton nouveau code est prêt. Connecte-toi avec ton prénom, ton nom et ce code.' });
  }
  return J({ ok: false, reason: 'inconnu' }, undefined, 404);
}
async function nonceValide(KV, j) {
  if (!KV) return false;
  let r; try { r = JSON.parse((await KV.get('crr:' + j.uid)) || 'null'); } catch { return false; }
  return !!(r && r.h && memeChaine(r.h, await sha256(j.nonce)));
}
