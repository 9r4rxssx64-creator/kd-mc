/* PARITÉ DE BEE (Kevin 18.11.2026, règle « Parité totale : Bee et Apex AI font pour Kevin tout ce qu'il demande, dans tout le domaine ») :
 *   · `lien_externe`    « ouvre-moi cette page internet » : une carte avec un bouton que KEVIN touche (jamais de navigation automatique, https seulement) ;
 *   · `comptes_cmcteams` « la liste de tous ceux qui ont un compte CMCteams, avec leur identifiant SBM » : la carte est FABRIQUÉE PAR LE DOMAINE
 *                        (`/__admin/comptes-cmcteams`) et affichée à Kevin ; l'IA ne reçoit que « liste prête (N comptes) » ;
 *   · `appeler`          « appelle <nom> » : une carte « 📞 Appeler » avec un lien tel: lu par le DOMAINE dans la fiche du compte (`/__admin/appel`) ;
 *                        Kevin touche, l'iPhone compose — 0 €, aucune téléphonie payante, jamais le numéro donné à l'IA.
 * GARDE-FOUS : (1) noms, matricules, numéros ne partent JAMAIS à une IA gratuite : ces outils ne lui rendent que des phrases sans donnée de personne ;
 * (2) rien ne s'exécute tout seul : tout passe par un bouton que Kevin touche ; (3) ces outils ne s'ouvrent que dans /__javis/ai (session admin PROUVÉE) ;
 * le widget REVÉRIFIE chaque carte (https, tel:, textContent). Interrupteur BEE_PARITE = '0'. node services/kdmc-router/bee-parite-outils.test.mjs */

export const MAX_CARTES = 4;
export const MAX_COMPTES = 400;
export const RE_PARITE = /(?<![A-Za-z0-9À-ſ])(?:https?:\/\/|www\.|[a-z0-9-]+\.(?:com|org|net|fr|ch|mc|io|eu|info)\b|page (?:internet|web)|site (?:web|internet)|comptes?\s+(?:\w+\s+){0,2}?(?:cmc\s?teams|light|sbm)|liste (?:des|de tous(?: les)?) comptes?|inscrit\w*|matricule\w*|sbm|identifiants? sbm|appelle\w*|appeler|t[eé]l[eé]phon\w*|num[eé]ro|composer|joindre|sonne\w*)(?![A-Za-z0-9À-ſ])/i;   // étroit exprès : « ouvre l'arbre », « mes comptes bannis » ne portent PAS ce lot (poids du prompt, bee-allege.test.mjs)

export const REGLES_PARITE = ' PARITÉ : page hors domaine → `lien_externe` (Kevin touche le bouton) ; liste des comptes CMCteams + identifiant SBM → `comptes_cmcteams` '
  + '(le domaine l\'affiche à Kevin, tu ne la vois pas : dis qu\'elle est prête) ; « appelle <nom> » → `appeler` (bouton 📞, Kevin touche). '
  + 'Tu ne connais JAMAIS un nom de collègue, un matricule ni un numéro : n\'en invente pas, ne les demande pas. Jamais « je ne peux pas ouvrir / appeler / lister ».';

const s = (v, n) => String(v == null ? '' : v).slice(0, n);

/* PURE : une adresse qu'on propose d'ouvrir. https seulement, jamais d'identifiants dans l'adresse, un vrai nom d'hôte, pas de réseau interne. */
export function adresseExterne(u) {
  const brut = String(u == null ? '' : u).trim();
  if (!brut || brut.length > 2000) return null;
  let x; try { x = new URL(/^[a-z][a-z0-9+.-]*:/i.test(brut) ? brut : 'https://' + brut); } catch (_) { return null; }
  if (x.protocol !== 'https:') return null;
  if (x.username || x.password) return null;
  const h = x.hostname.toLowerCase();
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(h)) return null;     // un nom avec au moins un point, pas d'IP nue, pas de crochets
  if (/^\d+(\.\d+){3}$/.test(h)) return null;
  if (/(^|\.)(localhost|local|internal|lan|home|corp)$/.test(h)) return null;
  return x.toString();
}
/* PURE : un lien tel: sûr (chiffres, + au début). */
export const TEL = /^tel:\+?[0-9]{6,20}$/;
export const telValide = (t) => TEL.test(String(t || ''));

function ajouter(sortie, carte) {
  const l = (sortie.cartes = sortie.cartes || []);
  if (l.length >= MAX_CARTES) throw new Error('assez de pièces pour cette réponse (' + MAX_CARTES + ' au plus) : propose le reste ensuite');
  l.push(carte);
}

/* o.appeler : (chemin) => Promise<{ok, ...}> — appel INTERNE d'une porte du domaine avec la session de Kevin (liste fermée PORTES_BEE). */
export function outilsParite(o, sortie) {
  const defs = [
    { name: 'lien_externe', description: 'Bouton « Ouvrir » vers une page https hors du domaine : Kevin le touche, tu n\'ouvres rien.',
      parameters: { type: 'object', properties: { url: { type: 'string', description: 'adresse https complète' }, libelle: { type: 'string', description: 'texte court du bouton' } }, required: ['url'] } },
    { name: 'comptes_cmcteams', description: 'Liste des comptes CMCteams avec identifiant SBM : le domaine l\'affiche à Kevin, tu ne la reçois pas.',
      parameters: { type: 'object', properties: {} } },
    { name: 'appeler', description: 'Bouton « 📞 Appeler » pour une personne ayant un compte : le domaine lit le numéro, Kevin touche. Tu ne vois jamais le numéro.',
      parameters: { type: 'object', properties: { nom: { type: 'string', description: 'prénom et nom, comme Kevin les a dits' } }, required: ['nom'] } },
  ];
  const exe = {
    lien_externe: async (a) => {
      const url = adresseExterne(a && a.url);
      if (!url) throw new Error('adresse refusée : il faut une adresse https complète d\'un site (pas de http, pas de mot de passe dans l\'adresse, pas d\'adresse interne)');
      const hote = new URL(url).hostname;
      ajouter(sortie, { t: 'externe', url, libelle: s(a && a.libelle, 60).trim() || 'Ouvrir ' + hote });
      return 'Bouton prêt pour ' + hote + '. Kevin le touche pour ouvrir la page (tu n\'ouvres rien). Dis-lui en une phrase ce qu\'il va trouver.';
    },
    comptes_cmcteams: async () => {
      const r = await o.appeler('/__admin/comptes-cmcteams');
      if (!r || !r.ok) throw new Error('le domaine n\'a pas pu lire la liste des comptes pour l\'instant (' + s(r && (r.reason || r.status), 40) + ') : réessaie dans une minute');
      const liste = Array.isArray(r.comptes) ? r.comptes : [];
      const lignes = liste.slice(0, MAX_COMPTES).map((c) => ({ nom: s(c && c.nom, 80), matricule: /^U\d{3,6}$/.test(String(c && c.matricule)) ? String(c.matricule) : '', apps: Array.isArray(c && c.apps) ? c.apps.filter((x) => x === 'CMCteams' || x === 'light') : [] }));
      ajouter(sortie, { t: 'liste_comptes', titre: 'Comptes CMCteams', lignes, total: Number(r.total) || lignes.length, avec_matricule: Number(r.avec_matricule) || 0, sans_matricule: Number(r.sans_matricule) || 0 });
      return 'Liste prête : ' + (Number(r.total) || lignes.length) + ' comptes (' + (Number(r.avec_matricule) || 0) + ' avec identifiant SBM). Elle est affichée à Kevin, que tu ne vois pas : dis-lui seulement qu\'elle est là, sans inventer aucun nom.';
    },
    appeler: async (a) => {
      const nom = s(a && a.nom, 80).trim();
      if (nom.length < 2) throw new Error('dis-moi qui appeler (prénom et nom)');
      const r = await o.appeler('/__admin/appel?q=' + encodeURIComponent(nom));
      if (!r || !r.ok) throw new Error('le domaine n\'a pas pu chercher ce numéro pour l\'instant (' + s(r && (r.reason || r.status), 40) + ') : réessaie dans une minute');
      const appels = (Array.isArray(r.trouves) ? r.trouves : []).filter((x) => x && telValide(x.tel)).slice(0, 5).map((x) => ({ nom: s(x.nom, 80), tel: x.tel }));
      if (!appels.length) {
        if (Number(r.correspondances) > 0) return 'Je connais ' + Number(r.correspondances) + ' compte(s) à ce nom, mais aucun numéro n\'est dans la fiche. Dis-le à Kevin et propose-lui de le demander à la personne (message direct).';
        return 'Aucun compte à ce nom dans le domaine. Dis-le à Kevin et demande-lui d\'écrire le prénom et le nom comme sur le compte.';
      }
      ajouter(sortie, { t: 'appel', appels });
      return appels.length === 1 ? 'Bouton « 📞 Appeler » prêt. Kevin le touche, son iPhone compose (tu ne vois pas le numéro). Dis-lui qu\'il est là.'
        : appels.length + ' personnes correspondent : un bouton « 📞 Appeler » par personne est affiché à Kevin, qui choisit. Dis-lui seulement de toucher la bonne.';
    },
  };
  return { defs, exe };
}
