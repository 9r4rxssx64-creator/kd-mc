/* UN MAIL ENVOYÉ PAR LE DOMAINE AU NOM DE KEVIN — derrière son ✅ (Kevin 18.11 « parité totale » ; 19.11 : « Oui go pour Bee »).
 * Avant : Bee ne savait que préparer un brouillon (lien mailto:, Kevin l'envoyait lui-même). Maintenant le domaine ENVOIE, mais seulement :
 *   · à une personne qui a un COMPTE du domaine, à l'adresse rangée sur SA fiche (lue ici, jamais reçue de l'IA ni de la page : aucun mail à un inconnu) ;
 *   · avec la session admin prouvée (porte /__admin/mail-envoyer, comme toute la section admin) ;
 *   · PLAFOND_JOUR mails par jour (la messagerie gratuite du domaine en donne 200 par mois, partagés avec les inscriptions et les boutiques) ;
 *   · chaque envoi laisse une ligne au journal admin (objet + adresse masquée, jamais le texte).
 * GET  ?uid=  → { ok, name, email_masque, reste, pret }   (pour la carte que Kevin lit avant de confirmer — l'adresse entière ne sort jamais)
 * POST { uid, objet, corps } → { ok, email_masque, reste } | { ok:false, reason }
 * node services/kdmc-router/mail-admin.test.mjs */
import { envoyerMail, emailValide, masqueEmail, mailPret } from './mail-confirme.js';

export const PLAFOND_JOUR = 10;
export const LIM = { objet: 120, corps: 2000 };
const propre = (s, n, lignes) => String(s == null ? '' : s).replace(lignes ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, ' ').replace(lignes ? /[ \t]+/g : /\s+/g, ' ').trim().slice(0, n);
const cleJour = (now) => 'cfg:mail_admin:' + new Date(now).toISOString().slice(0, 10);

/** PURE : contrôle et nettoie l'objet et le texte. Rend { objet, corps } ou { erreur }. */
export function preparerMail(b) {
  const objet = propre(b && b.objet, LIM.objet, false), corps = propre(b && b.corps, LIM.corps, true);
  if (objet.length < 2) return { erreur: 'objet_requis' };
  if (corps.length < 2) return { erreur: 'texte_requis' };
  return { objet, corps };
}
async function compteur(env, now) { try { return Math.max(0, parseInt((await env.ACCOUNTS.get(cleJour(now))) || '0', 10) || 0); } catch { return 0; } }

/** deps : { accGet(env, uid), audLog(env, entree), J(obj, status) } — fournis par worker.js (session admin déjà prouvée par la section admin). */
export async function handleMailAdmin(request, url, env, deps, now) {
  const J = deps.J; now = now || Date.now();
  if (!env || !env.ACCOUNTS) return J({ ok: false, reason: 'registre indisponible' }, 503);
  let b = {};
  if (request.method === 'POST') { try { b = await request.json(); } catch { b = {}; } }
  else if (request.method !== 'GET') return J({ ok: false, reason: 'methode' }, 405);
  const uid = String((request.method === 'GET' ? url.searchParams.get('uid') : b.uid) || '').slice(0, 80).trim();
  if (!uid) return J({ ok: false, reason: 'uid requis' }, 400);
  const a = await deps.accGet(env, uid);
  if (!a) return J({ ok: false, reason: 'not_found' }, 404);
  const email = String((a.fiche && a.fiche.email) || '').trim();
  const fait = await compteur(env, now), reste = Math.max(0, PLAFOND_JOUR - fait);
  const base = { name: String(a.name || '').slice(0, 80), email_masque: emailValide(email) ? masqueEmail(email) : '', reste, pret: mailPret(env) };
  if (request.method === 'GET') return J(Object.assign({ ok: true }, base));
  if (!emailValide(email)) return J(Object.assign({ ok: false, reason: 'pas_d_adresse' }, base), 400);
  const m = preparerMail(b);
  if (m.erreur) return J(Object.assign({ ok: false, reason: m.erreur }, base), 400);
  if (!mailPret(env)) return J(Object.assign({ ok: false, reason: 'messagerie_non_branchee' }, base), 503);
  if (reste <= 0) return J(Object.assign({ ok: false, reason: 'plafond_du_jour' }, base), 429);
  /* le compteur monte AVANT l'envoi : deux confirmations en même temps ne peuvent pas dépasser le plafond de beaucoup, et un envoi raté compte quand même (prudence) */
  try { await env.ACCOUNTS.put(cleJour(now), String(fait + 1), { expirationTtl: 3 * 86400 }); } catch { return J({ ok: false, reason: 'registre indisponible' }, 503); }
  const parti = await envoyerMail(env, { email, title: m.objet, message: m.corps, fetchFn: deps.fetchFn });
  await deps.audLog(env, { ev: parti ? 'mail_envoye_admin' : 'mail_admin_echec', uid, detail: m.objet.slice(0, 80) + ' → ' + masqueEmail(email) });
  if (!parti) return J(Object.assign({ ok: false, reason: 'envoi_refuse' }, base, { reste: reste - 1 }), 502);
  return J({ ok: true, name: base.name, email_masque: base.email_masque, reste: reste - 1 });
}
