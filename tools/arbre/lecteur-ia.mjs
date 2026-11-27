#!/usr/bin/env node
/* LECTEUR IA CONFIDENTIEL — lit UNE page publique (texte déjà capté par le navigateur du Lenovo) pour UNE fiche, sans jamais dire à l'IA qui est cherché.
 *   · fiche fermée → modèle LOCAL seulement (si absent : « en attente », jamais le nuage) ;
 *   · fiche ouverte → local d'abord, puis OmniRoute (IA gratuites du nuage), avec la garde de sortie ;
 *   · l'IA liste toutes les personnes de la page ; le rapprochement et la preuve mot pour mot sont faits ICI.
 * Rend { statut, voie, trouvailles:[{niveauCertitude, extrait, destination}] } ; jamais d'exception. */
import { CONSIGNE_EXTRACTION, gardeSortie, lireExtraits, verifierExtraits, correspond, niveau, destination, voiesPermises } from './confidentialite.mjs';
import { TOUTES_VOIES } from '../delegue/omniroute.mjs';

export async function lirePagePourFiche({ page, fiche, fichesFermees = [], voies = TOUTES_VOIES, env = process.env, now = new Date(), seulement = null, modele = null }) {
  const permises = voiesPermises(fiche, now).filter((v) => !seulement || v === seulement);   // seulement = la voie du travailleur de l'essaim (jamais plus large que ce que la fiche permet)
  const messages = [{ role: 'system', content: 'Tu extrais fidèlement des données d\'un texte. Tu ne réponds que par du JSON.' }, { role: 'user', content: CONSIGNE_EXTRACTION + '\n\n=== PAGE ===\n' + String(page.texte || '').slice(0, 60000) }];
  const essais = [];
  for (const voie of permises) {
    if (voie !== 'local') { const refus = gardeSortie(messages[1].content, fichesFermees); if (refus) { essais.push({ voie, refus }); continue; } }
    try {
      const brut = await voies[voie](messages, { env, ...(modele ? { modele } : {}) });
      const extraits = verifierExtraits(lireExtraits(brut), page.texte);
      const trouvailles = extraits.map((e) => ({ e, c: correspond(e, fiche) })).filter((x) => x.c).map(({ e, c }) => ({ certitude: c, extrait: e.extrait, nom: e.nom, prenoms: e.prenoms, naissance: e.naissance, lieu: e.lieu, parents: e.parents, evenement: e.evenement, source: page.url, destination: destination(fiche, now) }));
      return { statut: 'lu', voie, niveau: niveau(fiche, now), lues: extraits.length, trouvailles, essais };
    } catch (err) { essais.push({ voie, echec: String(err.message).slice(0, 100) }); }
  }
  return { statut: permises.length === 1 ? 'en_attente_modele_local' : 'echec', niveau: niveau(fiche, now), lues: 0, trouvailles: [], essais };
}
