/* CONFIRMATION D'IDENTITÉ PAR TÉLÉPHONE — WhatsApp « inversé », gratuit (Kevin 9.10).
 *
 * Pourquoi « inversé » : envoyer un code par SMS coûte (aucun fournisseur gratuit),
 * et un message WhatsApp « modèle » d'authentification se paie aussi. En revanche,
 * quand c'est LA PERSONNE qui écrit en premier, la réponse dans les 24 h est gratuite
 * (message de service). Donc :
 *
 *   1. la page demande une confirmation         → POST /tel/demande {code}
 *      le worker crée une demande (8 caractères) et rend un lien wa.me prérempli
 *   2. la personne appuie, WhatsApp s'ouvre, elle envoie « KDMC XXXXXXXX »
 *      → Meta appelle POST /webhook/whatsapp (signature HMAC vérifiée)
 *      → le worker tire un code à 6 chiffres et le RÉPOND sur WhatsApp (gratuit)
 *   3. la personne tape les 6 chiffres          → POST /tel/verifie {r, code}
 *      10 minutes, 5 essais. C'est le WORKER qui juge, jamais la page.
 *
 * Ce que ça prouve : le message arrive de SON numéro (Meta le garantit), et le code
 * revient sur CE numéro. La fiche du code d'accès garde alors la trace de ce téléphone (empreinte + masque) :
 * la PREMIÈRE confirmation fait foi, elle n'est jamais écrasée (une 2e demande est refusée : deja_lie).
 * Ce n'est pas (encore) un verrou : /contenu ne la regarde pas. C'est une preuve d'identité, consultable.
 *
 * Ce qu'on garde : jamais le code en clair (empreinte SHA-256 salée par la demande),
 * jamais le numéro en clair (HMAC avec le secret de l'app Meta + forme masquée « +33 6•• •• •• 78 »).
 *
 * Secrets (absents = la route le DIT : whatsapp_pas_pret, rien ne casse) :
 *   WA_ACCESS_TOKEN     jeton de l'app Meta (WhatsApp Cloud API)
 *   WA_PHONE_NUMBER_ID  identifiant du numéro qui répond
 *   WA_APP_SECRET       secret de l'app : signe chaque appel du webhook
 *   WA_VERIFY_TOKEN     mot choisi pour l'abonnement du webhook (étape « Vérifier »)
 *   WA_NUMERO_PUBLIC    le numéro WhatsApp affiché (chiffres, ex. 377…) — pas un secret
 */

import { whatsappPret, aleatoire, codeSixChiffres, sha256, egalConstant, masqueTel, empreinteTel, compteur, signatureMetaValide,
  abonnementMeta, messagesTexte, demandeDuTexte, envoieWhatsApp, TEXTE_CODE, lienWaMe, ALPHA_DEMANDE } from '../_shared/whatsapp-otp.js';
export { whatsappPret, codeSixChiffres, egalConstant, masqueTel };

export const TEL_TTL_DEMANDE = 15 * 60;     // la demande ET son code valent 15 min depuis la demande (page et worker comptent pareil)
export const TEL_MAX_ENVOIS = 3;            // une demande renvoie son code 3 fois au plus
const TTL_ACCES = 60 * 60 * 24 * 365 * 2;
export const TEL_ESSAIS = 5;
export const TEL_MAX_DEMANDES_HEURE = 5;    // par code d'accès
/* Les demandes de la vente commencent par « V » : un seul webhook Meta (celui du domaine,
   /__tel/webhook) reçoit tout et renvoie ici, signature intacte, ce qui commence par V. */
export const PREFIXE_VENTE = 'V';

/* ── 1. La page demande une confirmation ─────────────────────────────────── */
export async function telDemande(env, corps) {
  if (!whatsappPret(env)) {
    return { status: 503, corps: { ok: false, error: 'whatsapp_pas_pret', step: 'tel_config',
      detail: 'La confirmation par WhatsApp n’est pas encore branchée. Ton accès marche quand même.' } };
  }
  const code = String((corps && corps.code) || '').trim().toUpperCase().slice(0, 40);
  if (!code) return { status: 400, corps: { ok: false, error: 'code', detail: 'code d’accès absent', step: 'tel_code' } };
  const ficheBrute = await env.VENTES.get('code:' + code);
  if (!ficheBrute) {
    return { status: 404, corps: { ok: false, error: 'invalide', detail: 'code d’accès inconnu', step: 'tel_code_inconnu' } };
  }
  let fiche = null; try { fiche = JSON.parse(ficheBrute); } catch (_) { fiche = null; }
  if (fiche && fiche.tel) {
    return { status: 409, corps: { ok: false, error: 'deja_lie', tel_masque: fiche.tel.masque, detail: 'Ce code est déjà confirmé par un téléphone.', step: 'tel_deja_lie' } };
  }
  /* anti-rafale : 5 demandes par heure et par code d'accès */
  const cleN = 'tel:n:' + code;
  const n = Number(await env.VENTES.get(cleN)) || 0;
  if (n >= TEL_MAX_DEMANDES_HEURE) {
    return { status: 429, corps: { ok: false, error: 'trop_de_tentatives', detail: 'Trop de demandes. Réessaie dans une heure.', step: 'tel_rafale' } };
  }
  await env.VENTES.put(cleN, String(n + 1), { expirationTtl: 3600 });
  const r = PREFIXE_VENTE + aleatoire(7, ALPHA_DEMANDE);
  /* jeton : connu de la seule page qui demande (pas dans le message WhatsApp) → validation automatique par /tel/statut */
  const jeton = aleatoire(24, ALPHA_DEMANDE);
  await env.VENTES.put('tel:r:' + r, JSON.stringify({ code, etat: 'attente', cree: Date.now(), jeton_empreinte: await sha256(jeton) }), { expirationTtl: TEL_TTL_DEMANDE });
  return { status: 200, corps: { ok: true, demande: r, jeton, auto: true,
    lien: lienWaMe(env, r),
    validite_s: TEL_TTL_DEMANDE, essais: TEL_ESSAIS } };
}

/* ── 2. Meta nous transmet le message de la personne ─────────────────────── */
export function telWebhookAbonnement(env, url) { return abonnementMeta(env, url); }

export async function telWebhook(env, corpsBrut, signature) {
  /* Toujours 200 vers Meta (sinon il réessaie en boucle) — mais rien n'est fait sans signature. */
  if (!await signatureMetaValide(env, corpsBrut, signature)) return { traite: 0, ignore: 'signature' };
  let j; try { j = JSON.parse(corpsBrut); } catch (_) { return { traite: 0, ignore: 'json' }; }
  let traite = 0;
  for (const m of messagesTexte(j)) {
    const id = demandeDuTexte(m.texte);
    if (!id || id[0] !== PREFIXE_VENTE) continue;
    const cle = 'tel:r:' + id;
    const brut = await env.VENTES.get(cle);
    if (!brut) continue;
    let d; try { d = JSON.parse(brut); } catch (_) { continue; }
    if (Date.now() - d.cree > TEL_TTL_DEMANDE * 1000) continue;
    /* doublon de Meta, renvoi trop rapide ou trop de renvois : pas de nouvel envoi, pas d'écriture (quota KV) */
    if (d.etat === 'bloque' || Date.now() - (d.dernier || 0) < 30000 || (d.envois || 0) >= TEL_MAX_ENVOIS) continue;
    if (!(await compteur('tel-num:' + (await empreinteTel(env, m.de)), 5, 3600)).ok) continue;
    const code6 = codeSixChiffres();
    const expire = d.cree + TEL_TTL_DEMANDE * 1000;
    /* on envoie D'ABORD : si WhatsApp refuse, rien n'est écrit et la demande reste « en attente » */
    const envoi = await envoieWhatsApp(env, m.de, '✅ Ton téléphone est confirmé : retourne sur la page, la suite se fait toute seule.\n\n' + TEXTE_CODE(code6, Math.ceil((expire - Date.now()) / 60000)).replace('Ton code KD-MC', 'Si la page est fermée, ton code KD-MC'));
    if (!envoi.ok) { console.log('tel: envoi WhatsApp refusé', envoi.status || envoi.detail || ''); continue; }
    d.etat = 'code_envoye';
    d.empreinte = await sha256(id + ':' + code6);
    d.tel_empreinte = await empreinteTel(env, m.de);
    d.tel_masque = masqueTel(m.de);
    d.expire = expire;
    d.essais = TEL_ESSAIS;
    d.envois = (d.envois || 0) + 1;
    d.dernier = Date.now();
    await env.VENTES.put(cle, JSON.stringify(d), { expirationTtl: TEL_TTL_DEMANDE + 60 });
    traite++;
  }
  return { traite };
}

/* La fiche du code d'accès garde la trace de ce téléphone — la PREMIÈRE confirmation fait foi, jamais écrasée.
   → null si c'est fait, ou la réponse « déjà lié » à rendre. */
async function lierAuCode(env, d, cle) {
  const cleCode = 'code:' + d.code;
  const fiche = await env.VENTES.get(cleCode);
  if (fiche) {
    let f; try { f = JSON.parse(fiche); } catch (_) { f = null; }
    if (f && f.tel) { await env.VENTES.delete(cle); return { status: 409, corps: { ok: false, error: 'deja_lie', tel_masque: f.tel.masque, detail: 'Ce code est déjà confirmé par un téléphone.', step: 'tel_deja_lie' } }; }
    if (f) {
      f.tel = { empreinte: d.tel_empreinte, masque: d.tel_masque, ts_iso: new Date().toISOString() };
      /* même fin d'accès qu'avant : confirmer son téléphone ne rallonge jamais un accès. Une fiche d'avant expire_iso
         part de sa date de création (f.ts), jamais de « maintenant » (relecture 9.10). */
      const fin = Date.parse(f.expire_iso || '') || ((Number(f.ts) || Date.now()) + TTL_ACCES * 1000);
      const reste = Math.max(60, Math.floor((fin - Date.now()) / 1000));
      await env.VENTES.put(cleCode, JSON.stringify(f), { expirationTtl: reste });
    }
  }
  return null;
}

/* VALIDATION AUTOMATIQUE (Kevin 10.10) : la page demande toutes les quelques secondes si le message WhatsApp est arrivé.
   Lecture seule tant que rien n'est arrivé ; dès qu'il l'est, le code d'accès est lié et la demande consommée. */
export async function telStatut(env, corps) {
  const r = String((corps && corps.r) || '').trim().toUpperCase();
  const jeton = String((corps && corps.jeton) || '');
  if (!/^[A-Z0-9]{8}$/.test(r) || !jeton) return { status: 400, corps: { ok: false, error: 'demande', step: 'tel_statut' } };
  const cle = 'tel:r:' + r;
  let d = null; try { d = JSON.parse((await env.VENTES.get(cle)) || 'null'); } catch (_) { d = null; }
  if (!d) return { status: 200, corps: { ok: true, confirme: false, encore: false } };
  if (!d.jeton_empreinte || !egalConstant(await sha256(jeton), d.jeton_empreinte)) return { status: 403, corps: { ok: false, error: 'jeton', step: 'tel_statut_jeton' } };
  if (d.etat !== 'code_envoye') return { status: 200, corps: { ok: true, confirme: false, encore: Date.now() - d.cree < TEL_TTL_DEMANDE * 1000 } };
  if (Date.now() > d.expire) return { status: 200, corps: { ok: true, confirme: false, encore: false } };
  const lie = await lierAuCode(env, d, cle);
  if (lie) return lie;
  await env.VENTES.delete(cle);
  return { status: 200, corps: { ok: true, confirme: true, tel_masque: d.tel_masque, detail: 'Identité confirmée.' } };
}

/* ── 3. La personne tape les 6 chiffres : le worker juge ─────────────────── */
export async function telVerifie(env, corps) {
  const r = String((corps && corps.r) || '').trim().toUpperCase();
  const code6 = String((corps && corps.code) || '').replace(/\D/g, '');
  if (!/^[A-Z0-9]{8}$/.test(r)) return { status: 400, corps: { ok: false, error: 'demande', detail: 'demande absente', step: 'tel_r' } };
  if (code6.length !== 6) return { status: 400, corps: { ok: false, error: 'format', detail: 'il faut 6 chiffres', step: 'tel_format' } };
  const cle = 'tel:r:' + r;
  const brut = await env.VENTES.get(cle);
  let d = null; try { d = brut && JSON.parse(brut); } catch (_) { d = null; }
  if (!d) return { status: 410, corps: { ok: false, error: 'expire', detail: 'Demande expirée. Recommence.', step: 'tel_expire' } };
  if (d.etat === 'bloque') return { status: 410, corps: { ok: false, error: 'expire', detail: 'Plus d’essai sur cette demande. Recommence.', step: 'tel_bloque' } };
  if (d.etat !== 'code_envoye') {
    return { status: 409, corps: { ok: false, error: 'pas_encore', detail: 'Envoie d’abord le message WhatsApp, le code arrive en réponse.', step: 'tel_attente' } };
  }
  if (Date.now() > d.expire) {
    await env.VENTES.delete(cle);
    return { status: 410, corps: { ok: false, error: 'expire', detail: 'Code expiré. Demande-en un nouveau.', step: 'tel_expire' } };
  }
  if (!egalConstant(await sha256(r + ':' + code6), d.empreinte)) {
    d.essais = (d.essais || 0) - 1;
    if (d.essais <= 0) {
      /* bloquée, PAS effacée : sinon un nouveau message WhatsApp sur la même demande redonnait 5 essais */
      d.etat = 'bloque'; await env.VENTES.put(cle, JSON.stringify(d), { expirationTtl: TEL_TTL_DEMANDE + 60 });
      return { status: 429, corps: { ok: false, error: 'trop_essais', essais_restants: 0, detail: 'Plus d’essai. Demande un nouveau code.', step: 'tel_essais' } };
    }
    await env.VENTES.put(cle, JSON.stringify(d), { expirationTtl: TEL_TTL_DEMANDE + 60 });
    return { status: 401, corps: { ok: false, error: 'code_faux', essais_restants: d.essais, detail: 'Code incorrect.', step: 'tel_faux' } };
  }
  const lie = await lierAuCode(env, d, cle);
  if (lie) return lie;
  await env.VENTES.delete(cle);
  return { status: 200, corps: { ok: true, tel_masque: d.tel_masque, detail: 'Identité confirmée.' } };
}
