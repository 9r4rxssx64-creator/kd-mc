/* BEE ÉCRIT À UNE PERSONNE DANS CMCteams / LA LIGHT (Kevin 18.11.2026 : « il doit pouvoir agir partout, chaque app de mon domaine… faire tout ce que je lui demande »).
 * Même mécanique que toutes les mains de Bee : l'IA PROPOSE → le domaine fabrique la carte → Kevin touche ✅ → le domaine exécute AVEC LES DROITS DE KEVIN.
 * Ici l'exécution appelle la porte EXISTANTE du mini-chat (`/__dm/admin/ecrire`, admin prouvé seulement) : Bee n'a aucun droit de plus que le bouton
 * « 💬 Écrire » de la fiche de CMCteams. La personne lira le message à sa prochaine ouverture de l'app et pourra répondre (règle mini-chat-direct.md).
 * Jamais : un message sans ✅, un message à « tout le monde », un lien javascript:/data:, plus de 500 signes (limite du mini-chat), un seul mot comme nom
 * (prénom ET nom : deux personnes ne partagent jamais un fil). Fermable : BEE_MESSAGES_DIRECTS=0. */
const propre = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const sansLiensDangereux = (t) => !/(?:javascript|data|vbscript):/i.test(t);
export const MAX_MESSAGE = 500;

export const ACTIONS_MESSAGES_DIRECTS = {
  message_direct: {
    titre: 'Écrire à une personne', icone: '✉️', risque: 'moyen',
    aide: 'champs : nom (prénom ET nom de la personne, comme dans CMCteams), texte (≤ 500 signes) — la personne le lira à sa prochaine ouverture de CMCteams ou de la light et pourra répondre',
    valider(c) {
      const nom = propre(c.nom, 80), texte = propre(c.texte, MAX_MESSAGE);
      if (nom.split(/[\s-]+/).filter((m) => m.length > 0).length < 2) return { erreur: 'Il me faut le prénom ET le nom de la personne.' };
      if (texte.length < 1) return { erreur: 'Il manque le message à envoyer.' };
      if (!sansLiensDangereux(texte)) return { erreur: 'Ce message contient un lien interdit.' };
      return { champs: { nom, texte } };
    },
    resume: (c) => 'Écrire à ' + c.nom + ' : « ' + c.texte + ' ». (Elle ou il le lira à la prochaine ouverture de CMCteams ou de la light, et pourra te répondre.)',
    async executer(env, c, o) {
      if (String(env && env.BEE_MESSAGES_DIRECTS) === '0') return { ok: false, texte: 'L\'envoi de messages par Bee est coupé pour le moment.' };
      const r = await o.appeler('/__dm/admin/ecrire', { method: 'POST', json: { nom: c.nom, texte: c.texte } });
      return r && r.ok ? { ok: true, texte: '✉️ Message déposé pour ' + c.nom + '. Il s\'affichera à sa prochaine ouverture de l\'app.' }
        : { ok: false, texte: 'Le message n\'est pas parti (' + ((r && (r.reason || r.status)) || 'erreur') + ').' };
    },
  },
};

/* Quand la demande parle d'écrire à quelqu'un : Bee prend le chemin « outils » d'office. */
export const RE_MESSAGES_DIRECTS = /[ée]cris[- ]?(?:lui|leur|\u00e0)|[ée]cr(?:ire|is) \u00e0|envoie[- ]?(?:lui|leur)|envoyer (?:un )?(?:petit )?(?:message|mot)|dis[- ]?(?:lui|leur)|dis \u00e0 [A-ZÉ]|pr[ée]viens[- ]?(?:le|la|les)\b|message (?:direct|\u00e0)|mini[- ]?chat/i;
export const REGLES_MESSAGES_DIRECTS = ' Pour ÉCRIRE à une personne dans CMCteams ou la light (« écris à Davy que… », « dis à Marie que… »), utilise proposer_action avec l\'action message_direct : nom = son prénom ET son nom (cherche-les avec comptes_domaine si Kevin ne donne que le prénom, ne les devine jamais), texte = le message, court, tel que Kevin le dicte (500 signes au plus, sans lien suspect). Kevin confirme d\'un ✅ ; la personne le lira à sa prochaine ouverture de l\'app et pourra répondre. Ne dis jamais « envoyé » avant le ✅. Jamais de code, de mot de passe ni de secret dans le message.';
