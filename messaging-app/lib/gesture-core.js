// gesture-core.js — Décisions de gestes tactiles (parité WhatsApp).
//
// « Balayer vers la droite pour répondre » (swipe-to-reply) est LE geste
// WhatsApp qui manquait. La DÉCISION (ce balayage doit-il déclencher une
// réponse ? quelle progression visuelle afficher ?) est une fonction PURE,
// testable à 100 %, sans DOM ni réseau. Les écouteurs tactiles + la
// translation de la bulle vivent dans index.html et sont prouvés au
// navigateur réel (Playwright).
//
// Convention : dx > 0 = doigt vers la DROITE (geste réponse WhatsApp).
// dy = déplacement vertical (pour ne pas voler le scroll de la liste).

/**
 * @typedef {Object} SwipeReplyDecision
 * @property {boolean} trigger    — le balayage doit déclencher « répondre ».
 * @property {number}  progress   — 0..1, avancement pour l'indicateur visuel.
 * @property {number}  translate  — pixels de translation à appliquer à la bulle (borné).
 * @property {boolean} horizontal — le geste est franchement horizontal (vs scroll vertical).
 * @property {boolean} rightward  — le doigt va vers la droite.
 */

/**
 * Décide si un balayage horizontal sur une bulle doit déclencher la réponse,
 * et renvoie l'état visuel (progression + translation bornée).
 *
 * @param {number} dx — déplacement horizontal (px). > 0 = vers la droite.
 * @param {number} dy — déplacement vertical (px).
 * @param {Object} [opts]
 * @param {number} [opts.threshold=56]   — distance de déclenchement (px).
 * @param {number} [opts.maxVertical=45] — au-delà, c'est un scroll → jamais de réponse.
 * @param {number} [opts.dirRatio=1.5]   — |dx| doit dépasser |dy|*ratio pour être « horizontal ».
 * @param {number} [opts.maxTranslate]   — translation max (défaut = threshold + 12).
 * @returns {SwipeReplyDecision}
 */
export function swipeReplyDecision(dx, dy, opts = {}) {
  const o = opts || {};
  const threshold = Number.isFinite(o.threshold) ? o.threshold : 56;
  const maxVertical = Number.isFinite(o.maxVertical) ? o.maxVertical : 45;
  const dirRatio = Number.isFinite(o.dirRatio) ? o.dirRatio : 1.5;
  const maxTranslate = Number.isFinite(o.maxTranslate) ? o.maxTranslate : threshold + 12;

  const x = Number.isFinite(dx) ? dx : 0;
  const y = Number.isFinite(dy) ? dy : 0;
  const ax = Math.abs(x);
  const ay = Math.abs(y);

  const rightward = x > 0;
  const horizontal = ax > ay * dirRatio && ay <= maxVertical;

  // Progression uniquement sur un déplacement vers la droite ET horizontal.
  const effective = rightward && horizontal ? x : 0;
  const progress = Math.max(0, Math.min(1, effective / threshold));
  const translate = Math.max(0, Math.min(maxTranslate, effective));
  const trigger = rightward && horizontal && x >= threshold;

  return { trigger, progress, translate, horizontal, rightward };
}

/**
 * Faut-il annuler le timer d'appui long parce que le doigt commence à glisser ?
 * Vrai dès qu'on bouge au-delà d'un petit seuil dans N'IMPORTE quelle direction
 * (le long-press WhatsApp ne se déclenche que si le doigt reste immobile).
 *
 * @param {number} dx
 * @param {number} dy
 * @param {number} [slop=10] — tolérance de tremblement (px).
 * @returns {boolean}
 */
export function shouldCancelLongPress(dx, dy, slop = 10) {
  const s = Number.isFinite(slop) ? slop : 10;
  const x = Number.isFinite(dx) ? dx : 0;
  const y = Number.isFinite(dy) ? dy : 0;
  return Math.abs(x) > s || Math.abs(y) > s;
}

export default { swipeReplyDecision, shouldCancelLongPress };

// Compat navigateur : expose window.ApexGesture pour le code <script> d'index.html.
if (typeof window !== 'undefined') {
  window.ApexGesture = { swipeReplyDecision, shouldCancelLongPress };
}
