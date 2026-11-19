/* BEE ENVOIE UN MAIL POUR KEVIN, DERRIÈRE SON ✅ (Kevin 18.11 « parité totale… envoyer un message pour moi à telle ou telle personne » ; 19.11 « Oui go pour Bee »).
 * Même mécanique que bee-droits.js : l'IA PROPOSE (identifiant de la personne, objet, texte), le DOMAINE fabrique la carte (vrai nom et adresse MASQUÉE lus chez lui,
 * jamais le texte de l'IA pour dire à qui), Kevin touche ✅, le domaine appelle la porte /__admin/mail-envoyer AVEC SA SESSION. L'adresse entière ne passe jamais par
 * l'IA ni par la page. Aucun mail à un inconnu : seulement à une personne qui a un compte et une adresse sur sa fiche. Plafond par jour tenu par la porte.
 * `brouillon_mail` (bee-atelier.js) reste pour écrire à quelqu'un qui n'a PAS de compte : Kevin l'envoie alors lui-même.
 * node services/kdmc-router/bee-droits-mail.test.mjs */
const nettoyer = (s, max, lignes) => String(s == null ? '' : s).replace(lignes ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/g : /[\u0000-\u001f\u007f<>]/g, ' ').replace(lignes ? /[ \t]+/g : /\s+/g, ' ').trim().slice(0, max);
const RE_UID = /^[\p{L}\p{N}_.:@-]{2,80}$/u;
const RAISONS = { pas_d_adresse: 'cette personne n\'a pas d\'adresse e-mail sur sa fiche', plafond_du_jour: 'le plafond de mails du jour est atteint', messagerie_non_branchee: 'la messagerie du domaine n\'est pas branchée',
  envoi_refuse: 'la messagerie a refusé l\'envoi', not_found: 'compte introuvable', objet_requis: 'il manque l\'objet', texte_requis: 'il manque le texte' };
const dire = (r) => RAISONS[r && r.reason] || (r && (r.reason || r.status)) || 'erreur';

export const DROITS_MAIL = {
  mail_envoyer: {
    titre: 'Envoyer un mail à une personne du domaine', icone: '✉️', risque: 'moyen',
    aide: 'uid, libelle (objet), texte',
    valider(c) {
      const uid = nettoyer(c.uid, 80), objet = nettoyer(c.libelle || c.objet, 120), corps = nettoyer(c.texte || c.corps, 2000, true);
      if (!RE_UID.test(uid)) return { erreur: 'Il me manque l\'identifiant de la personne : cherche-la d\'abord avec comptes_domaine.' };
      if (objet.length < 2) return { erreur: 'Il me manque l\'objet du mail (champ libelle).' };
      if (corps.length < 2) return { erreur: 'Il me manque le texte du mail (champ texte).' };
      return { champs: { uid, objet, corps } };
    },
    /* le NOM, l'adresse masquée et ce qu'il reste à envoyer aujourd'hui viennent du domaine */
    enrichir: async (c, ctx) => {
      if (!ctx || typeof ctx.appeler !== 'function') return { erreur: 'Je ne peux pas vérifier cette personne pour le moment.' };
      const r = await ctx.appeler('/__admin/mail-envoyer?uid=' + encodeURIComponent(c.uid), { method: 'GET' });
      if (!r.ok || !r.name) return { erreur: 'Je ne connais aucun compte avec cet identifiant (' + c.uid + ').' };
      if (!r.email_masque) return { erreur: nettoyer(r.name, 90) + ' n\'a pas d\'adresse e-mail sur sa fiche : je ne peux pas lui envoyer de mail. Je peux te préparer un brouillon si tu me donnes son adresse.' };
      if (r.pret === false) return { erreur: 'La messagerie du domaine n\'est pas branchée : je peux seulement te préparer un brouillon.' };
      if (!(r.reste > 0)) return { erreur: 'Le plafond de mails du jour est atteint : réessaie demain, ou je te prépare un brouillon.' };
      return { champs: Object.assign({}, c, { nom: nettoyer(r.name, 90), masque: nettoyer(r.email_masque, 80), reste: r.reste | 0 }) };
    },
    resume: (c) => 'ENVOYER un mail à « ' + c.nom + ' » (' + c.masque + '), de la part de kd-mc.com. Objet : « ' + c.objet + ' ». Texte : « ' + c.corps + ' ». Il part dès que tu confirmes ; il te restera ' + Math.max(0, (c.reste | 0) - 1) + ' mail(s) aujourd\'hui.',
    async executer(env, c, o) {
      const r = await o.appeler('/__admin/mail-envoyer', { method: 'POST', json: { uid: c.uid, objet: c.objet, corps: c.corps } });
      return r.ok ? { ok: true, texte: '✉️ Mail envoyé à ' + c.nom + ' (' + (r.email_masque || c.masque) + '). Il te reste ' + (r.reste | 0) + ' mail(s) aujourd\'hui.' } : { ok: false, texte: 'Le mail n\'est pas parti : ' + dire(r) + '.' };
    },
  },
};
/* une demande qui parle d'envoyer un mail prend le chemin « outils » d'office */
export const RE_DROITS_MAIL = /\b(?:e-?mails?|mails?|courriels?)\b/i;
/* pas de consigne en plus dans la tête de Bee : son budget de jetons est compté (bee-allege.test.mjs) ; l'aide de l'action suffit. */
