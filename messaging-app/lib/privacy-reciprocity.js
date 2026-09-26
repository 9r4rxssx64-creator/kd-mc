// privacy-reciprocity.js — Réciprocité de confidentialité (parité Signal/WhatsApp).
//
// Règle : si TU désactives un signal (accusés de lecture, indicateur de saisie,
// statut en ligne / vu à…), tu ne dois PLUS VOIR celui des autres non plus.
// L'app respectait déjà le côté ÉMISSION (ne pas envoyer). Ici on ajoute le
// côté RÉCEPTION : masquer le signal entrant quand l'utilisateur a coupé le sien.
//
// Cœur PUR (100 % testable). Le câblage (cases WS `read`/`typing`, libellé de
// présence) vit dans index.html et n'affecte QUE l'affichage — jamais la
// livraison des messages eux-mêmes.

/**
 * Lit les préférences de confidentialité avec valeurs par défaut sûres
 * (tout activé = comportement historique).
 * @param {object} [prefs]
 * @returns {{readReceipts:boolean, typingIndicator:boolean, onlineStatus:boolean}}
 */
export function normPrivacy(prefs) {
  const p = prefs && typeof prefs === 'object' ? prefs : {};
  return {
    readReceipts: p.readReceipts !== false,
    typingIndicator: p.typingIndicator !== false,
    onlineStatus: p.onlineStatus !== false,
  };
}

/** Peut-on VOIR les accusés de lecture des autres ? (réciprocité) */
export function canSeeReadReceipts(prefs) {
  return normPrivacy(prefs).readReceipts;
}

/** Peut-on VOIR l'indicateur de saisie des autres ? (réciprocité) */
export function canSeeTyping(prefs) {
  return normPrivacy(prefs).typingIndicator;
}

/** Peut-on VOIR le statut en ligne / « vu à… » des autres ? (réciprocité) */
export function canSeePresence(prefs) {
  return normPrivacy(prefs).onlineStatus;
}

export default { normPrivacy, canSeeReadReceipts, canSeeTyping, canSeePresence };

// Compat navigateur : expose window.ApexPrivacy pour index.html.
if (typeof window !== 'undefined') {
  window.ApexPrivacy = { normPrivacy, canSeeReadReceipts, canSeeTyping, canSeePresence };
}
