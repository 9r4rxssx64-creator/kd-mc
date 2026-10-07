/* LA RÈGLE DES DÉPARTS DE KEVIN, en ORACLE indépendant (7.10.2026 soir : « 4235-4235… non ; 4235-2351-3514-… ») :
 *   - dans une SÉRIE de jours de travail de l'équipe (jours qui se suivent), chacun avance d'UN cran par jour ;
 *   - chaque nouvelle série commence UN cran après le DÉBUT de la série précédente ;
 *   - une série coupée par le 1er du mois (plus courte que la série habituelle) est la FIN de la série d'avant :
 *     son début « virtuel » est (longueur habituelle − longueur vue) crans plus tôt.
 * Utilisé par test:departs-render, test:verif-live-robot (contrôle D) et test:absence-courte-repos. Écrit SANS lire le code
 * des apps : si une app s'en écarte, ces tests rougissent. workDays = jours croissants ; `premier` dit si le 1er du mois vaut 0 ou 1. */
export function series(workDays, premier = 1) {   /* premier = numéro du 1er jour du mois dans workDays (0 si les jours comptent depuis 0) */
  const runs = [];
  let s = 0;
  for (let i = 1; i <= workDays.length; i++) if (i === workDays.length || workDays[i] - workDays[i - 1] > 1) { runs.push({ debut: s, long: i - s }); s = i; }
  const milieu = runs.length > 2 ? runs.slice(1, -1) : runs, cpt = {};
  let habituelle = 0;
  for (const r of milieu) { cpt[r.long] = (cpt[r.long] || 0) + 1; if (!habituelle || cpt[r.long] > cpt[habituelle] || (cpt[r.long] === cpt[habituelle] && r.long > habituelle)) habituelle = r.long; }
  const premierJour = workDays[0] === premier;
  runs.forEach((r, k) => { r.decalage = (k === 0 && premierJour && runs.length > 1 && r.long < habituelle) ? habituelle - r.long : 0; });
  const serieDe = new Array(workDays.length);
  runs.forEach((r, k) => { for (let i = r.debut; i < r.debut + r.long; i++) serieDe[i] = k; });
  return { runs, serieDe, habituelle };
}
/* Index attendu dans la suite le jour workDays[i], connaissant l'index de la veille de travail (i-1) et celui du début de la
   série précédente. Renvoie { attendu, regle } ; regle = 'meme_serie' | 'nouvelle_serie'. */
export function attendu(S, i, idxVeille, idxDebutSeriePrec, taille) {
  const k = S.serieDe[i];
  if (k === S.serieDe[i - 1]) return { attendu: (idxVeille + 1) % taille, regle: 'meme_serie' };
  const prec = S.runs[k - 1];
  return { attendu: ((idxDebutSeriePrec - prec.decalage + 1) % taille + taille) % taille, regle: 'nouvelle_serie' };
}
