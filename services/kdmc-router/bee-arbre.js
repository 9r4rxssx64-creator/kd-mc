/* BEE VOIT L'ARBRE : les fiches de la famille, en LECTURE, pour Kevin seul (Kevin 13.10.2026, capture : « fais en sorte de voir les
 * fiches dans l'arbre » → Bee répondait « je ne vois pas les fiches de l'arbre, c'est Apex qui peut »).
 *
 * Avant : Bee savait seulement DANS QUELLE app était Kevin (nom + titre de page). Maintenant, quand la question parle de la famille
 * (une personne, un parent, une date de naissance, un conjoint, des enfants…), son cerveau appelle l'outil `arbre`, que le DOMAINE exécute :
 * il lit la graine de l'arbre là où elle est déjà (KV `arbre:seed`, ou la base D1 de secours — la même lecture que l'app), cherche les
 * personnes demandées et ne rend que ce qui répond (4 fiches au plus, texte seulement, jamais de photo).
 *
 * Garde-fous :
 *   · réservé à Kevin : cet outil n'existe que dans handleBeeIa, derrière la session admin PROUVÉE (Face ID ou code) — comme toutes les mains de Bee ;
 *   · LECTURE seule : aucune écriture dans l'arbre (modifier une fiche reste à l'app de l'arbre) ;
 *   · le texte d'une fiche est une DONNÉE, jamais un ordre (encadré comme tel par la boucle d'outils) ;
 *   · confidentialité DITE à Kevin (ℹ️ du widget) : ce qui répond à sa question part à l'IA gratuite qui formule la réponse ;
 *   · interrupteur BEE_ARBRE = '0' (règle Kevin : un bouton ON/OFF sur tout) ;
 *   · 0 € : aucune clé payante, aucune écriture KV.
 * node services/kdmc-router/bee-arbre.test.mjs */

export const MAX_FICHES = 4;
export const MAX_NOTES = 280;

/** Une question qui parle de la famille (ou Kevin est dans l'app de l'arbre) : l'outil arbre est mis à sa disposition d'office. */
export const RE_ARBRE = /\b(?:arbre|fiches?|famille|g[ée]n[ée]alog\w*|anc[êe]tres?|ascendants?|descendants?|p[eè]re|m[eè]re|parents?|enfants?|fils|fille|fr[eè]res?|s[oœ]urs?|conjoint\w*|[ée]poux|[ée]pouse|mari|grand[- ]?(?:p[eè]re|m[eè]re|parents?)|grands-parents|oncle|tante|cousin\w*|neveu|ni[eè]ce|beau[- ]?(?:p[eè]re|fr[eè]re|fils)|belle[- ]?(?:m[eè]re|s[oœ]ur|fille)|n[ée]e?s?|naissance|d[ée]c[eè]s|d[ée]c[ée]d[ée]e?|mari[ée]e?|divorc\w*)\b/i;

export const REGLES_ARBRE = ' Tu vois aussi l\'ARBRE DE FAMILLE de Kevin avec l\'outil arbre : pour toute question sur une personne de la famille (qui est-ce, nés quand et où, parents, conjoints, enfants, métier, notes), '
  + 'appelle arbre avec le nom ou le prénom demandé, puis réponds avec CE QU\'IL RENVOIE. Ne dis jamais « je ne vois pas les fiches » : cherche. Si la personne n\'y est pas, dis-le simplement et n\'invente rien (ni date, ni lien de parenté). '
  + 'Chaque fiche porte son identifiant « [id : …] » : c\'est lui que tu donnes à proposer_action quand Kevin veut modifier une fiche (voir plus bas). Si les outils de modification ne sont pas disponibles, dis-lui où toucher dans l\'app de l\'arbre (arbre.kd-mc.com).';

/* ───────────────────────── recherche ───────────────────────── */
const norm = (t) => String(t == null ? '' : t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[-_'’.,;:!?()«»"]/g, ' ').replace(/\s+/g, ' ').trim();
const MOTS_VIDES = new Set(['le', 'la', 'les', 'de', 'du', 'des', 'd', 'l', 'un', 'une', 'et', 'ou', 'a', 'au', 'aux', 'en', 'sur', 'dans', 'pour', 'par', 'est', 'qui', 'que', 'quel', 'quelle', 'quels', 'quelles', 'mon', 'ma', 'mes', 'son', 'sa', 'ses', 'ne', 'ni', 'ce', 'cet', 'cette', 'fiche', 'fiches', 'arbre', 'famille', 'personne', 'info', 'infos', 'donne', 'moi', 'dis', 'cherche', 'trouve', 'montre', 'parle']);

export function nomComplet(p) { return ((p && p.prenom ? String(p.prenom) : '') + ' ' + (p && p.nom ? String(p.nom) : '')).trim() || '(sans nom)'; }

/** Les personnes qui correspondent à la demande, les meilleures d'abord. */
export function trouver(seed, requete, max) {
  const persons = seed && seed.persons && typeof seed.persons === 'object' ? seed.persons : {};
  const mots = norm(requete).split(' ').filter((m) => m && !MOTS_VIDES.has(m));
  if (!mots.length) return [];
  const res = [];
  for (const id of Object.keys(persons)) {
    const p = persons[id]; if (!p || typeof p !== 'object') continue;
    const prenom = norm(p.prenom), nom = norm(p.nom), tout = (prenom + ' ' + nom).trim();
    if (!tout) continue;
    const jetons = new Set(tout.split(' '));
    let touches = 0;
    for (const m of mots) { if (jetons.has(m)) touches += 2; else if (m.length >= 3 && tout.includes(m)) touches += 1; }
    if (!touches) continue;
    let score = touches / (mots.length * 2);
    if (norm(requete).includes(tout) || (mots.length >= 2 && mots.every((m) => jetons.has(m)))) score += 1;    // prénom + nom complets : la bonne personne d'abord
    if (id === String(requete).trim()) score += 2;
    res.push({ id, p, score });
  }
  res.sort((a, b) => b.score - a.score || nomComplet(a.p).localeCompare(nomComplet(b.p)));
  const top = res.length ? res[0].score : 0;
  /* quand une personne correspond en entier, on ne noie pas la réponse sous des homonymes partiels */
  return res.filter((r) => top < 1 || r.score >= 1).slice(0, max || MAX_FICHES);
}

const propre = (t, n) => String(t == null ? '' : t).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
function evt(e) {
  if (!e || typeof e !== 'object') return '';
  const d = propre(e.date, 40), l = propre(e.lieu, 60);
  return [d, l ? 'à ' + l : ''].filter(Boolean).join(' ');
}
const noms = (seed, ids) => (Array.isArray(ids) ? ids : []).map((i) => seed.persons[i]).filter(Boolean).map(nomComplet);

/** Une fiche en une phrase par ligne (texte seulement). */
export function fiche(seed, id) {
  const P = seed.persons, p = P[id]; if (!p) return '';
  const enfants = Object.keys(P).filter((k) => P[k] && (P[k].pere === id || P[k].mere === id)).map((k) => nomComplet(P[k]));
  const fratrie = Object.keys(P).filter((k) => k !== id && P[k] && ((p.pere && P[k].pere === p.pere) || (p.mere && P[k].mere === p.mere))).map((k) => nomComplet(P[k]));
  const L = [];
  L.push('• ' + nomComplet(p) + ' [id : ' + id + ']' + (p.sexe === 'F' ? ' (femme)' : p.sexe === 'M' ? ' (homme)' : '') + (p.vivant === false ? ' — décédé(e)' : p.vivant === true ? ' — vivant(e)' : ''));
  const n = evt(p.naissance); if (n) L.push('  né(e) : ' + n);
  const d = evt(p.deces); if (d) L.push('  décès : ' + d);
  if (p.metier) L.push('  métier : ' + propre(p.metier, 80));
  if (p.pere && P[p.pere]) L.push('  père : ' + nomComplet(P[p.pere]));
  if (p.mere && P[p.mere]) L.push('  mère : ' + nomComplet(P[p.mere]));
  const cj = noms(seed, p.conjoints); if (cj.length) L.push('  conjoint(s) : ' + cj.join(', '));
  if (enfants.length) L.push('  enfants : ' + enfants.slice(0, 12).join(', '));
  if (fratrie.length) L.push('  frères et sœurs : ' + fratrie.slice(0, 12).join(', '));
  const no = propre(p.notes, MAX_NOTES); if (no) L.push('  notes : ' + no + (String(p.notes).length > MAX_NOTES ? ' […]' : ''));
  return L.join('\n');
}

export function chercherDansArbre(seed, requete) {
  const persons = seed && seed.persons && typeof seed.persons === 'object' ? seed.persons : null;
  if (!persons) throw new Error('l\'arbre n\'est pas disponible pour le moment');
  const total = Object.keys(persons).length;
  const r = trouver(seed, requete);
  if (!r.length) return 'Aucune personne de l\'arbre ne correspond à « ' + propre(requete, 60) + ' » (l\'arbre compte ' + total + ' personnes). Ne l\'invente pas : dis que tu ne la trouves pas dans la copie du domaine — et si Kevin veut la VOIR, appelle quand même l\'outil ouvrir avec personne = ce nom : l\'app de l\'arbre cherche dans SA copie complète (une fiche ajoutée hier au nuage y est déjà).';
  return 'Arbre de famille de Kevin (' + total + ' personnes) — ' + r.length + ' fiche(s) trouvée(s) :\n' + r.map((x) => fiche(seed, x.id)).join('\n');
}

/** Les définitions + l'exécuteur à brancher dans la boucle d'outils de Bee. `lireSeed()` rend la graine de l'arbre (ou null). */
export function outilsArbre(lireSeed) {
  return {
    defs: [{
      name: 'arbre',
      description: 'Cherche une ou plusieurs personnes dans l\'ARBRE DE FAMILLE de Kevin et rend leurs fiches (naissance, décès, métier, parents, conjoints, enfants, frères et sœurs, notes). À utiliser pour TOUTE question sur la famille de Kevin.',
      parameters: { type: 'object', properties: { recherche: { type: 'string', description: 'prénom et/ou nom de la personne, ex. « Laurence SAINT-POLIT » ou « Luka »' } }, required: ['recherche'] },
    }],
    exe: {
      arbre: async (a) => {
        const requete = String((a && a.recherche) || '').slice(0, 120);
        if (!requete.trim()) throw new Error('quelle personne ?');
        const seed = await lireSeed();
        if (!seed) throw new Error('l\'arbre n\'est pas encore publié sur le domaine');
        return chercherDansArbre(seed, requete);
      },
    },
  };
}
