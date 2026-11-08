/* CONFIRMATION PAR TÉLÉPHONE POUR TOUTES LES INSCRIPTIONS DU DOMAINE (Kevin 9.10 :
 * « OTP pour toutes inscriptions au domaine, app etc »).
 *
 * Toutes les apps créent leurs comptes par la même porte (/__sso/issue, appelée par le portail
 * kd-mc.com). C'est donc là, et nulle part ailleurs, qu'on exige le téléphone : une fois pour
 * toutes les apps, présentes et futures.
 *
 *   POST /__sso/tel/demande            → lien wa.me prérempli « KDMC DXXXXXXXXX » (identifiant signé, AUCUNE écriture ; 10 / heure / connexion)
 *   POST /__sso/tel/webhook  (Meta)    → signature vérifiée ; on RÉPOND un code à 6 chiffres (gratuit)
 *                                         les demandes « V… » (vente) sont renvoyées à kdmc-vente, signature intacte
 *   GET  /__sso/tel/webhook  (Meta)    → abonnement (mot WA_VERIFY_TOKEN)
 *   POST /__sso/tel/statut             → { r, jeton } : la page voit TOUTE SEULE que le message est arrivé → preuve (validation automatique)
 *   POST /__sso/tel/verifie            → 15 min depuis la demande, 5 essais ; juste = une PREUVE signée (30 min, usage unique)
 *   GET  /__sso/tel/etat               → { pret, obligatoire } : le portail sait s'il doit montrer l'étape
 *
 * La preuve est signée avec la clé des sessions du domaine (KDMC_SSO_SECRET) : la page la porte
 * jusqu'à /__sso/issue, qui la vérifie. Une page ne juge jamais un code (règle d'or n° 8).
 *
 * Interrupteur : tant que les secrets WA_* manquent, rien n'est exigé (personne n'est bloqué
 * dehors par une fonction pas encore branchée). KDMC_TEL_OBLIGATOIRE=0 coupe l'exigence d'un coup
 * (bouton ON/OFF, règle de Kevin) sans retirer la confirmation facultative.
 */
import { whatsappPret, aleatoire, codeSixChiffres, sha256, hmac256, egalConstant, masqueTel, empreinteTel, compteur,
  signatureMetaValide, abonnementMeta, messagesTexte, demandeDuTexte, envoieWhatsApp, TEXTE_CODE, lienWaMe, ALPHA_DEMANDE } from '../_shared/whatsapp-otp.js';

export const PREFIXE_DOMAINE = 'D';
export const TTL_DEMANDE = 15 * 60;          // une demande (et son code) vaut 15 min DEPUIS LA DEMANDE : la page et le domaine comptent pareil
export const ESSAIS = 5;
export const MAX_DEMANDES_HEURE = 10;       // par connexion (compteur en cache : aucune écriture KV)
export const MAX_CODES_TEL_HEURE = 5;       // codes envoyés à un même numéro par heure
export const MAX_ENVOIS_DEMANDE = 3;        // une demande renvoie son code 3 fois au plus (message renvoyé, doublon de Meta)
export const VALIDITE_PREUVE_MS = 30 * 60 * 1000;
export const MAX_COMPTES_PAR_TEL = 3;       // une famille sur un téléphone, pas une fabrique de comptes
const VENTE_WEBHOOK = 'https://kdmc-vente.9r4rxssx64.workers.dev/webhook/whatsapp';

export function telPret(env) { return whatsappPret(env) && !!(env && env.ACCOUNTS); }
export function telObligatoire(env) { return telPret(env) && String(env.KDMC_TEL_OBLIGATOIRE || '1') !== '0'; }

/* L'identifiant de demande se VÉRIFIE sans rien stocker : D + minute (2) + hasard (4) + contrôle (3) = 10 caractères.
   Une demande ne coûte donc AUCUNE écriture KV (relecture 9.10 : 2 écritures par demande, sans compte, épuisaient le
   quota gratuit du domaine en une journée avec 3 adresses IP). Le contrôle est une HMAC avec la clé des sessions. */
const A = ALPHA_DEMANDE, NA = A.length, CYCLE = NA * NA;   // 961 minutes ≈ 16 h, largement plus que 15 min
const minuteDe = (ms) => Math.floor(ms / 60000) % CYCLE;
const enc2 = (n) => A[Math.floor(n / NA) % NA] + A[n % NA];
const dec2 = (s) => A.indexOf(s[0]) * NA + A.indexOf(s[1]);
async function controle(secret, corps) { const h = await hmac256(secret, 'demande|' + corps); return h.slice(0, 3).split('').map((c) => A[parseInt(c, 16) % NA]).join(''); }
export async function nouvelleDemande(secret, maintenant = Date.now()) {
  const corps = enc2(minuteDe(maintenant)) + aleatoire(4, A);
  return PREFIXE_DOMAINE + corps + await controle(secret, corps);
}
/* → { ok, cree } : signature juste et demande de moins de 15 min (cree = début de la minute de la demande). */
export async function lireDemande(secret, id, maintenant = Date.now()) {
  if (!/^D[A-Z0-9]{9}$/.test(String(id || ''))) return { ok: false };
  const corps = id.slice(1, 7);
  if (!egalConstant(await controle(secret, corps), id.slice(7))) return { ok: false };
  const m = dec2(corps), age = (minuteDe(maintenant) - m + CYCLE) % CYCLE;
  if (m < 0 || age > TTL_DEMANDE / 60) return { ok: false };
  return { ok: true, cree: (Math.floor(maintenant / 60000) - age) * 60000 };
}

/* Le JETON de la demande : seul l'appareil qui a demandé le connaît (il n'est PAS dans le message WhatsApp). C'est lui
   qui permet de récupérer la confirmation AUTOMATIQUE (/__sso/tel/statut) : sans lui, connaître l'identifiant ne sert à rien. */
export async function jetonDe(secret, id) { return (await hmac256(secret, 'jeton|' + id)).slice(0, 32); }

const b64u = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64u = (s) => { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return decodeURIComponent(escape(atob(s))); };

export async function signePreuve(secret, { empreinte, masque }) {
  /* n = numéro unique : la preuve ne sert qu'UNE fois (relecture 9.10 : réutilisable 30 min, elle ouvrait plusieurs comptes) */
  const corps = b64u(JSON.stringify({ e: empreinte, m: masque, x: Date.now() + VALIDITE_PREUVE_MS, n: aleatoire(12, ALPHA_DEMANDE) }));
  return corps + '.' + await hmac256(secret, 'tel|' + corps);
}
export async function verifiePreuve(secret, preuve) {
  const [corps, sig] = String(preuve || '').split('.');
  if (!corps || !sig || !secret) return { ok: false };
  if (!egalConstant(await hmac256(secret, 'tel|' + corps), sig)) return { ok: false };
  let p; try { p = JSON.parse(deB64u(corps)); } catch (_) { return { ok: false }; }
  if (!p || !p.e || !p.n || !(p.x > Date.now())) return { ok: false };
  return { ok: true, empreinte: p.e, masque: p.m, nonce: p.n };
}
/* Combien de comptes ce téléphone a-t-il déjà ouverts ? (index « tel:idx:<empreinte> ») */
export async function comptesDuTel(env, empreinte) {
  try { const l = JSON.parse((await env.ACCOUNTS.get('tel:idx:' + empreinte)) || '[]'); return Array.isArray(l) ? l : []; } catch (_) { return []; }
}
/* Usage unique : la preuve est « brûlée » au moment où elle sert (une écriture, expire avec elle). */
export async function preuveDejaUtilisee(env, preuve) { return !!(await env.ACCOUNTS.get('tel:usee:' + preuve.nonce)); }
export async function bruleePreuve(env, preuve) { await env.ACCOUNTS.put('tel:usee:' + preuve.nonce, '1', { expirationTtl: Math.ceil(VALIDITE_PREUVE_MS / 1000) + 60 }); }
export async function lierTel(env, uid, preuve) {
  const l = await comptesDuTel(env, preuve.empreinte);
  if (!l.includes(uid)) { l.push(uid); await env.ACCOUNTS.put('tel:idx:' + preuve.empreinte, JSON.stringify(l.slice(-20))); }
}

export async function handleTel(request, url, env, secret, { J, originOk }) {
  const path = url.pathname;

  if (path === '/__sso/tel/etat' && request.method === 'GET') {
    return J({ ok: true, pret: telPret(env), obligatoire: telObligatoire(env) });
  }

  if (path === '/__sso/tel/webhook' && request.method === 'GET') {
    const r = abonnementMeta(env, url);
    return new Response(r.texte, { status: r.status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  }

  if (path === '/__sso/tel/webhook' && request.method === 'POST') {
    const brut = await request.text();
    const signature = request.headers.get('X-Hub-Signature-256');
    if (!await signatureMetaValide(env, brut, signature)) return J({ ok: true, traite: 0, ignore: 'signature' });
    let j; try { j = JSON.parse(brut); } catch (_) { return J({ ok: true, traite: 0, ignore: 'json' }); }
    let traite = 0, pourVente = false;
    for (const m of messagesTexte(j)) {
      const id = demandeDuTexte(m.texte);
      if (!id) continue;
      if (id[0] !== PREFIXE_DOMAINE) { pourVente = true; continue; }
      const dem = await lireDemande(secret, id);
      if (!dem.ok) continue;                                           /* inventée ou périmée : aucune écriture */
      const cle = 'tel:r:' + id;
      let d = null; try { d = JSON.parse((await env.ACCOUNTS.get(cle)) || 'null'); } catch (_) { d = null; }
      /* doublon de Meta, message renvoyé trop vite, ou trop de renvois : on ne retire pas un nouveau code */
      if (d && (d.etat === 'bloque' || Date.now() - (d.dernier || 0) < 30000 || (d.envois || 0) >= MAX_ENVOIS_DEMANDE)) continue;
      if (!(await compteur('tel-num:' + (await empreinteTel(env, m.de)), MAX_CODES_TEL_HEURE, 3600)).ok) continue;
      const code6 = codeSixChiffres();
      const expire = dem.cree + TTL_DEMANDE * 1000;
      /* on envoie D'ABORD : si WhatsApp refuse (jeton expiré…), rien n'est écrit et la demande reste « en attente » */
      /* VALIDATION AUTOMATIQUE (Kevin 10.10 « automatise la validation WhatsApp ») : le message reçu de CE numéro prouve déjà le
         téléphone (Meta garantit l'expéditeur). La page qui a fait la demande le voit toute seule (/__sso/tel/statut) ; le code
         ne sert plus que de secours (page fermée, autre appareil). */
      const envoi = await envoieWhatsApp(env, m.de, '✅ Ton téléphone est confirmé : retourne sur la page, la suite se fait toute seule.\n\n' + TEXTE_CODE(code6, Math.ceil((expire - Date.now()) / 60000)).replace('Ton code KD-MC', 'Si la page est fermée, ton code KD-MC'));
      if (!envoi.ok) { console.log('tel: envoi WhatsApp refusé', envoi.status || envoi.detail || ''); continue; }
      d = { etat: 'code_envoye', cree: dem.cree, expire, essais: ESSAIS, envois: ((d && d.envois) || 0) + 1, dernier: Date.now(),
        empreinte: await sha256(id + ':' + code6), tel_empreinte: await empreinteTel(env, m.de), tel_masque: masqueTel(m.de) };
      await env.ACCOUNTS.put(cle, JSON.stringify(d), { expirationTtl: TTL_DEMANDE + 60 });
      traite++;
    }
    /* Un seul webhook chez Meta : ce qui appartient à la vente lui est renvoyé tel quel
       (corps brut + signature d'origine) — elle vérifie elle-même, rien n'est cru sur parole. */
    if (pourVente) {
      try {
        await fetch(env.KDMC_VENTE_WEBHOOK || VENTE_WEBHOOK, { method: 'POST', body: brut,
          headers: { 'content-type': 'application/json', 'X-Hub-Signature-256': signature }, signal: AbortSignal.timeout(8000) });
      } catch (_) { /* la vente injoignable ne doit pas faire réessayer Meta en boucle */ }
    }
    return J({ ok: true, traite, renvoye_vente: pourVente });
  }

  if (path === '/__sso/tel/demande' && request.method === 'POST') {
    /* Origine OBLIGATOIRE ici (une page du domaine l'envoie toujours) ; le plafond par connexion est en cache. */
    const origine = request.headers.get('origin');
    if (!origine || !originOk(origine, url.host)) return J({ ok: false, reason: 'origine refusée' }, undefined, 403);
    if (!telPret(env)) return J({ ok: false, reason: 'whatsapp_pas_pret', message: 'La confirmation par WhatsApp n’est pas encore branchée.' }, undefined, 503);
    const ip = await sha256((request.headers.get('CF-Connecting-IP') || '') + '|kdmc-tel');
    if (!(await compteur('tel-ip:' + ip.slice(0, 32), MAX_DEMANDES_HEURE, 3600)).ok) {
      return J({ ok: false, reason: 'trop_de_demandes', message: 'Trop de demandes depuis cette connexion. Réessaie dans une heure.' }, undefined, 429);
    }
    const id = await nouvelleDemande(secret);
    return J({ ok: true, demande: id, jeton: await jetonDe(secret, id), lien: lienWaMe(env, id), validite_s: TTL_DEMANDE, essais: ESSAIS, auto: true });
  }

  /* La page demande « est-ce confirmé ? » toutes les quelques secondes : LECTURE seule tant que rien n'est arrivé. Dès que le
     message WhatsApp est reçu, elle reçoit la preuve signée (la demande est consommée : une seule fois). */
  if (path === '/__sso/tel/statut' && request.method === 'POST') {
    const origineS = request.headers.get('origin');
    if (!origineS || !originOk(origineS, url.host)) return J({ ok: false, reason: 'origine refusée' }, undefined, 403);
    let b = {}; try { b = await request.json(); } catch (_) { /* vide */ }
    const id = String(b.r || '').trim().toUpperCase();
    if (!/^D[A-Z0-9]{9}$/.test(id) || !egalConstant(await jetonDe(secret, id), String(b.jeton || ''))) return J({ ok: false, reason: 'jeton' }, undefined, 403);
    const cle = 'tel:r:' + id;
    let d = null; try { d = JSON.parse((await env.ACCOUNTS.get(cle)) || 'null'); } catch (_) { d = null; }
    if (!d) return J({ ok: true, confirme: false, encore: (await lireDemande(secret, id)).ok });
    if (d.etat !== 'code_envoye' || Date.now() > d.expire) return J({ ok: true, confirme: false, encore: false });
    await env.ACCOUNTS.delete(cle);
    if ((await comptesDuTel(env, d.tel_empreinte)).length >= MAX_COMPTES_PAR_TEL) {
      return J({ ok: false, reason: 'tel_plein', message: 'Ce téléphone a déjà ouvert ' + MAX_COMPTES_PAR_TEL + ' comptes. Demande à l’administrateur.' }, undefined, 409);
    }
    return J({ ok: true, confirme: true, tel_masque: d.tel_masque, preuve: await signePreuve(secret, { empreinte: d.tel_empreinte, masque: d.tel_masque }) });
  }

  if (path === '/__sso/tel/verifie' && request.method === 'POST') {
    const origineV = request.headers.get('origin');
    if (!origineV || !originOk(origineV, url.host)) return J({ ok: false, reason: 'origine refusée' }, undefined, 403);
    let b = {}; try { b = await request.json(); } catch (_) { /* vide */ }
    const id = String(b.r || '').trim().toUpperCase();
    const code6 = String(b.code || '').replace(/\D/g, '');
    if (!/^D[A-Z0-9]{9}$/.test(id)) return J({ ok: false, reason: 'demande', message: 'Demande absente.' }, undefined, 400);
    if (code6.length !== 6) return J({ ok: false, reason: 'format', message: 'Il faut 6 chiffres.' }, undefined, 400);
    const cle = 'tel:r:' + id;
    let d = null; try { d = JSON.parse((await env.ACCOUNTS.get(cle)) || 'null'); } catch (_) { d = null; }
    if (!d) {
      /* pas de fiche : soit le message WhatsApp n'est pas encore arrivé (demande valide), soit c'est fini */
      if ((await lireDemande(secret, id)).ok) return J({ ok: false, reason: 'pas_encore', message: 'Envoie d’abord le message WhatsApp : le code arrive en réponse.' }, undefined, 409);
      return J({ ok: false, reason: 'expire', message: 'Demande expirée. Recommence.' }, undefined, 410);
    }
    if (d.etat === 'bloque') return J({ ok: false, reason: 'expire', message: 'Plus d’essai sur cette demande. Recommence.' }, undefined, 410);
    if (d.etat !== 'code_envoye') return J({ ok: false, reason: 'pas_encore', message: 'Envoie d’abord le message WhatsApp : le code arrive en réponse.' }, undefined, 409);
    if (Date.now() > d.expire) { await env.ACCOUNTS.delete(cle); return J({ ok: false, reason: 'expire', message: 'Code expiré. Demande-en un nouveau.' }, undefined, 410); }
    if (!egalConstant(await sha256(id + ':' + code6), d.empreinte)) {
      d.essais = (d.essais || 0) - 1;
      /* bloquée, PAS effacée : effacée, un nouveau message WhatsApp sur la même demande redonnait 5 essais */
      if (d.essais <= 0) { d.etat = 'bloque'; await env.ACCOUNTS.put(cle, JSON.stringify(d), { expirationTtl: TTL_DEMANDE + 60 }); return J({ ok: false, reason: 'trop_essais', essais_restants: 0, message: 'Plus d’essai. Demande un nouveau code.' }, undefined, 429); }
      await env.ACCOUNTS.put(cle, JSON.stringify(d), { expirationTtl: TTL_DEMANDE + 60 });
      return J({ ok: false, reason: 'code_faux', essais_restants: d.essais, message: 'Code incorrect.' }, undefined, 401);
    }
    await env.ACCOUNTS.delete(cle);
    if ((await comptesDuTel(env, d.tel_empreinte)).length >= MAX_COMPTES_PAR_TEL) {
      return J({ ok: false, reason: 'tel_plein', message: 'Ce téléphone a déjà ouvert ' + MAX_COMPTES_PAR_TEL + ' comptes. Demande à l’administrateur.' }, undefined, 409);
    }
    return J({ ok: true, tel_masque: d.tel_masque, preuve: await signePreuve(secret, { empreinte: d.tel_empreinte, masque: d.tel_masque }) });
  }
  return null;
}
