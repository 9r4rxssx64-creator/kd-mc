/**
 * GARDE « FAUX SUCCÈS » (capture de Kevin, 28.11.2026) : sur « Laurent Saint Poli est né en 1981 » (et sur « corrige la date de naissance de … »), le modèle gratuit a répondu
 * « ✅ Modification enregistrée dans le vault ; la fiche est synchronisée sur tous les services Apex », « Les données sont à jour dans le vault et propagées à tous les modules Apex »
 * et même inventé des liens d'export — alors qu'AUCUN outil n'avait écrit quoi que ce soit : une fiche de l'arbre ne se modifie qu'avec la carte ✅ de Kevin.
 *
 * Règle : si la demande de Kevin parle d'une fiche / d'une date / d'un lieu de naissance ou de décès / d'un métier / d'un téléphone, si AUCUN outil n'a tourné dans ce tour et si la
 * réponse annonce une écriture réussie (« enregistrée », « synchronisée », « à jour dans le vault », « propagées à tous les modules »), la réponse est REMPLACÉE par la vérité.
 * Fonction pure, sans réseau ; elle ne touche jamais une réponse produite après un outil ni une phrase ordinaire.
 */
const RE_DEMANDE_FICHE = /(?:\bfiche\b|\barbre\b|\bn[ée]e?\s+(?:en|le|à|a)\b|\bnaissance\b|\bd[ée]c[èe]s\b|\bd[ée]c[ée]d[ée]e?\b|\bm[ée]tier\b|\bt[ée]l[ée]phone\b|\be-?mail\b|\bmari[ée]e?\b|\b(?:p[èe]re|m[èe]re|conjoint\w*|enfant)\s+de\b)/i;
const RE_ANNONCE_ECRITURE = /(?:vault[^.\n]{0,80}(?:enregistr|synchronis|propag|mis(?:e|es)? à jour|à jour)|(?:enregistr|synchronis|propag|mis(?:e|es)? à jour)[^.\n]{0,80}vault|synchronis[ée]e?s?\s+sur\s+tous\s+les\s+(?:services|serveurs|modules)|propag[ée]e?s?\s+à\s+tous\s+les\s+(?:services|serveurs|modules)|modification\s+(?:appliqu[ée]e|enregistr[ée]e|effectu[ée]e)|mise?s?\s+à\s+jour\s+(?:effectu|faite|r[ée]ussie|appliqu)|aucun\s+autre\s+champ\s+modifi[ée]|(?:ajout[ée]|modifi[ée]|enregistr[ée]|reli[ée]|d[ée]clar[ée])e?s?\s+(?:comme|dans\s+la\s+fiche|à\s+la\s+fiche))/i;

export const MESSAGE_RIEN_MODIFIE = '⚠️ Je n\'ai rien modifié : ce que le modèle venait d\'écrire (« enregistré », « synchronisé ») était faux. Une fiche de l\'arbre ne change JAMAIS sans ta carte « ✅ Confirmer ».\n'
  + 'Pour la corriger, dis par exemple : « corrige la date de naissance de Prénom Nom (année de naissance actuelle) : JJ/MM/AAAA » — je te montre alors une carte, rien n\'est écrit avant ton ✅. '
  + 'Si plusieurs personnes portent le même nom, ajoute son année de naissance entre parenthèses.';

/** PURE : la réponse à afficher à la place, ou null si la réponse du modèle peut rester. */
export function fausseReussiteFiche(demande: string, reponse: string, nbOutils: number): string | null {
  if ((nbOutils ?? 0) > 0) return null;
  const d = String(demande ?? '');
  const r = String(reponse ?? '');
  if (!r || !RE_DEMANDE_FICHE.test(d)) return null;
  return RE_ANNONCE_ECRITURE.test(r) ? MESSAGE_RIEN_MODIFIE : null;
}
