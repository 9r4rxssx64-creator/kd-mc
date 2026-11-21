/* LE MATRICULE SBM POSÉ PAR KEVIN DANS L'ADMIN (pont 2989, 21.11.2026).
 * Avant : la rubrique « 🪪 Identité » d'un compte AFFICHAIT le matricule SBM en texte seul — aucun champ, aucun bouton. Un matricule retrouvé et sûr
 * ne pouvait pas être rangé (compteur « sans matricule » de /__admin/comptes-cmcteams bloqué). Maintenant Kevin le tape et le domaine le range, mais seulement :
 *   · avec la session admin prouvée (section /__admin, comme toutes ses portes) et depuis une page du domaine ;
 *   · à la forme SBM exacte : U puis 3 à 6 chiffres (la même que ficheNettoyee et /__dep/membre) ; vide = effacer ;
 *   · jamais en double : un matricule déjà rangé sur la fiche d'un AUTRE compte est refusé (règle codes-comptes : rien en double) ;
 *   · chaque écriture laisse une ligne au journal admin : l'identifiant du compte et le matricule, JAMAIS le nom.
 * POST { uid, matricule } → { ok, uid, matricule } | { ok:false, reason }
 * node services/kdmc-router/matricule-admin.test.mjs */

export const RE_MATRICULE = /^U\d{3,6}$/;

/** PURE : nettoie ce que Kevin a tapé. Rend { matricule } ('' = effacer) ou { erreur }. */
export function preparerMatricule(v) {
  const m = String(v == null ? '' : v).replace(/\s+/g, '').toUpperCase().slice(0, 12);
  if (!m) return { matricule: '' };
  if (!RE_MATRICULE.test(m)) return { erreur: 'matricule_format' };
  return { matricule: m };
}

/** PURE : l'identifiant d'un AUTRE compte qui porte déjà ce matricule, ou ''. */
export function dejaPris(tous, uid, matricule) {
  if (!matricule) return '';
  for (const a of (tous || [])) {
    if (!a || !a.uid || a.uid === uid) continue;
    if (String((a.fiche && a.fiche.matricule) || '').toUpperCase() === matricule) return String(a.uid);
  }
  return '';
}

/** deps : { accGet(env, uid), accPut(env, acc, connu), audLog(env, entree), J(obj, status), tous(env), origineOk(request) } — fournis par worker.js. */
export async function handleMatriculeAdmin(request, env, deps, now) {
  const J = deps.J; now = now || Date.now();
  if (request.method !== 'POST') return J({ ok: false, reason: 'methode' }, 405);
  if (deps.origineOk && !deps.origineOk(request)) return J({ ok: false, reason: 'origine refusée' }, 403);
  if (!env || !env.ACCOUNTS) return J({ ok: false, reason: 'registre indisponible' }, 503);
  let b = {}; try { b = await request.json(); } catch { b = {}; }
  const uid = String((b && b.uid) || '').slice(0, 80).trim();
  if (!uid) return J({ ok: false, reason: 'uid requis' }, 400);
  const p = preparerMatricule(b && b.matricule);
  if (p.erreur) return J({ ok: false, reason: p.erreur, message: 'Un matricule SBM s\'écrit U puis 3 à 6 chiffres (exemple : U12345).' }, 400);
  const a = await deps.accGet(env, uid);
  if (!a) return J({ ok: false, reason: 'not_found' }, 404);
  const avant = String((a.fiche && a.fiche.matricule) || '').toUpperCase();
  if (avant === p.matricule) return J({ ok: true, uid, matricule: p.matricule, inchange: true });
  if (p.matricule) {
    const autre = dejaPris(await deps.tous(env), uid, p.matricule);
    if (autre) return J({ ok: false, reason: 'matricule_pris', message: 'Ce matricule est déjà rangé sur un autre compte.', autre_uid: autre }, 409);
  }
  const fiche = Object.assign({}, a.fiche || {});
  if (p.matricule) fiche.matricule = p.matricule; else delete fiche.matricule;
  fiche.maj = now;
  a.fiche = fiche;
  await deps.accPut(env, a, true);
  /* relu après écriture : on ne répond « fait » que si le registre le dit */
  const relu = await deps.accGet(env, uid);
  const lu = String((relu && relu.fiche && relu.fiche.matricule) || '').toUpperCase();
  if (lu !== p.matricule) return J({ ok: false, reason: 'ecriture_non_relue' }, 503);
  await deps.audLog(env, { ev: 'matricule_pose_admin', uid, detail: p.matricule ? ((avant ? avant + ' → ' : '') + p.matricule) : ((avant || '?') + ' → (effacé)') });
  return J({ ok: true, uid, matricule: p.matricule });
}
