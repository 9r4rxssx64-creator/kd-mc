/* BEE T'OUVRE N'IMPORTE QUELLE APP DU DOMAINE (Kevin 17.10.2026 : « j'ai demandé à Javis de me montrer l'arbre de Yann Lorenzi, il me dit qu'il n'a pas accès. Il doit
 * pouvoir m'ouvrir les applications, peu importe laquelle, dans laquelle je suis, même si je suis dans le domaine »).
 *
 * Avant : Bee savait LIRE une page (voir_page) et donner une adresse (apps_du_domaine), mais pas OUVRIR l'app sur ton écran. Elle répondait « je n'ai pas
 * accès » à « montre-moi l'arbre de Yann ». Maintenant l'outil `ouvrir` prépare l'ouverture : le widget affiche un gros bouton « Ouvrir » (44 px) et ouvre
 * lui-même l'app après 2 secondes (« Rester ici » l'arrête) — dans la même fenêtre, depuis n'importe quelle app du domaine.
 *
 * Ce que l'outil NE fait PAS (sécurité d'abord, règle Kevin) :
 *   · il n'ouvre QUE des adresses du domaine (liste exacte des hôtes du routeur, https) : jamais un site extérieur, jamais une porte technique (/__…) ;
 *   · il ne change rien : ouvrir = naviguer. Toute modification passe toujours par la carte ✅ (bee-agir) ;
 *   · le chemin est nettoyé (lettres, chiffres, - _ . /), sans « .. » ni « // » ; aucune requête (?…) n'est acceptée ;
 *   · réservé à Kevin : l'outil n'existe que derrière la session admin prouvée de /__javis/ai ; l'app ouverte garde SON propre verrou (Face ID / code) ;
 *   · interrupteur BEE_OUVRIR = '0' (bouton ON/OFF sur tout) ; 0 € : aucune clé, aucune écriture.
 * Pour l'ARBRE, le lien porte le nom de la personne (#personne=…) : l'app la cherche dans SA copie complète, donc même une fiche ajoutée au nuage hier
 * s'ouvre, que le domaine la connaisse déjà ou non (arbre v3.118).
 * node services/kdmc-router/bee-ouvrir.test.mjs */

export const MAX_OUVRIR = 3;
/** Une demande d'ouverture (ouvre, montre-moi, affiche, emmène-moi, va sur, fais-moi voir…) : l'outil est mis à sa disposition d'office. */
export const RE_OUVRIR = /\b(?:ouvr\w*|montre\w*|affiche\w*|emm[eè]ne\w*|am[eè]ne\w*|lance\w*|(?:va|vas|aller|allons)\s+(?:sur|dans|[àa]|vers)|naviguer?|fais[- ]moi\s+voir|je\s+(?:veux|voudrais)\s+voir|voir\s+(?:l|la|le|les|mon|ma|mes|un|une)\b|redirige\w*|bascule\w*|direction)\b/i;

export const REGLES_OUVRIR = ' Tu peux OUVRIR n\'importe quelle app du domaine sur l\'écran de Kevin avec l\'outil ouvrir (app = son nom, ex. « arbre », « lingua », « cmcteams », « apex chat », « admin » ; '
  + 'page = un chemin si besoin ; pour l\'ARBRE : personne = le prénom et le nom, ex. « Yann Lorenzi », ou famille = le nom de famille). '
  + 'Quand Kevin dit « ouvre », « montre-moi », « affiche », « emmène-moi », « va sur… », appelle ouvrir tout de suite, même s\'il est déjà dans une autre app : un bouton « Ouvrir » apparaît et l\'app s\'ouvre. '
  + 'Ne dis JAMAIS « je n\'ai pas accès » ni « c\'est Apex qui peut » : si une personne est introuvable dans ta lecture de l\'arbre, ouvre quand même l\'arbre sur son nom (l\'app la cherche dans sa copie complète). '
  + 'Si un outil te manque pour finir ce que Kevin demande : 1) regarde d\'abord avec mes_pouvoirs, voir_page, liens_kevin, lire_page ; 2) sinon dépose avec tache_code une consigne précise pour Claude Code qui construit l\'outil manquant, et dis-le à Kevin en une phrase. '
  + 'Reste dans la sécurité : tu n\'ouvres que le domaine, tu ne modifies rien sans la carte ✅.';

const sansAccent = (t) => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const norm = (t) => sansAccent(t).replace(/[’'`´]/g, ' ').replace(/[^a-z0-9.:/\- ]+/g, ' ').replace(/\s+/g, ' ').trim();
const propre = (t, n) => String(t == null ? '' : t).replace(/[\u0000-\u001f\u007f<>"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

/** Les surnoms que Kevin emploie → l'adresse (nom court ou hôte). */
export const ALIAS = {
  'light': 'departs', 'cmcteams light': 'departs', 'cmc light': 'departs', 'la light': 'departs', 'depart': 'departs', 'departs': 'departs',
  'cmc': 'cmcteams', 'teams': 'cmcteams', 'cmc teams': 'cmcteams', 'planning': 'cmcteams', 'plannings': 'cmcteams',
  'apex chat': 'apex-chat', 'apexchat': 'apex-chat', 'chat': 'apex-chat', 'messagerie': 'apex-chat', 'messages': 'apex-chat',
  'apex': 'apex-ai', 'apex ai': 'apex-ai', 'apex v13': 'apex-ai', 'ia': 'apex-ai',
  'portail': 'kd-mc.com', 'accueil': 'kd-mc.com', 'domaine': 'kd-mc.com', 'kdmc': 'kd-mc.com', 'kd mc': 'kd-mc.com',
  'admin': 'admin.kd-mc.com', 'administration': 'admin.kd-mc.com', 'comptes': 'admin.kd-mc.com', 'qui se connecte': 'admin.kd-mc.com',
  'javis': 'javis.kd-mc.com', 'bee': 'javis.kd-mc.com', 'bourricot': 'javis.kd-mc.com', 'jarvis': 'javis.kd-mc.com',
  'generalogie': 'arbre', 'genealogie': 'arbre', 'arbre genealogique': 'arbre', 'arbre de famille': 'arbre', 'famille': 'arbre',
  'detente': 'la-detente', 'la detente': 'la-detente', 'lolo': 'chez-lolo', 'chez lolo': 'chez-lolo', 'langues': 'lingua',
};

/** Retrouve l'hôte du domaine demandé. `hotes` = Set des hôtes du routeur ; `noms` = { hôte: nom court }. Rend { hote } ou { erreur, suggestions }. */
export function resoudreApp(q, hotes, noms) {
  const H = hotes instanceof Set ? hotes : new Set(hotes || []);
  const N = noms || {};
  const brut = propre(q, 200);
  if (!brut) return { erreur: 'Quelle app veux-tu ouvrir ?', suggestions: [] };
  /* une adresse entière : exactement un hôte du domaine, en https */
  if (/^https?:\/\//i.test(brut)) {
    let u; try { u = new URL(brut); } catch (_) { return { erreur: 'Cette adresse n\'est pas valable.', suggestions: [] }; }
    if (u.protocol !== 'https:' || !H.has(u.hostname.toLowerCase())) return { erreur: 'Je n\'ouvre que les apps du domaine (jamais un site extérieur).', suggestions: [] };
    return { hote: u.hostname.toLowerCase(), chemin: u.pathname };
  }
  const n = norm(brut).replace(/\b(?:l|la|le|les|un|une|mon|ma|mes|l app|app|application|appli|site|page|du|de|des|domaine kd mc)\b/g, ' ').replace(/\s+/g, ' ').trim() || norm(brut);
  const bareHost = n.replace(/\.kd-mc\.com$/, '');
  if (H.has(n)) return { hote: n };
  if (H.has(n + '.kd-mc.com')) return { hote: n + '.kd-mc.com' };
  if (H.has(bareHost + '.kd-mc.com')) return { hote: bareHost + '.kd-mc.com' };
  const viaAlias = ALIAS[n] || ALIAS[bareHost] || ALIAS[norm(brut)];
  if (viaAlias) {
    if (H.has(viaAlias)) return { hote: viaAlias };
    if (H.has(viaAlias + '.kd-mc.com')) return { hote: viaAlias + '.kd-mc.com' };
    const parNom = [...H].filter((h) => N[h] === viaAlias).sort((a, b) => a.length - b.length);
    if (parNom.length) return { hote: parNom[0] };
  }
  /* le nom court d'une app (« departs », « cuisine »…) : l'hôte le plus simple qui le porte */
  const parNom = [...H].filter((h) => norm(N[h]) === n || norm(N[h]).replace(/-/g, ' ') === n).sort((a, b) => a.length - b.length);
  if (parNom.length) return { hote: parNom[0] };
  /* un morceau reconnaissable (≥ 4 lettres) et UNIQUE */
  if (n.length >= 4) {
    const proches = [...H].filter((h) => h.replace(/\.kd-mc\.com$/, '').replace(/-/g, ' ').includes(n.replace(/-/g, ' ')) || norm(N[h]).includes(n));
    const uniques = [...new Set(proches.map((h) => h.replace(/\.kd-mc\.com$/, '')))];
    if (uniques.length === 1) return { hote: proches.sort((a, b) => a.length - b.length)[0] };
    if (uniques.length > 1) return { erreur: 'Plusieurs apps correspondent : ' + uniques.slice(0, 6).join(', ') + '. Laquelle ?', suggestions: uniques.slice(0, 6) };
  }
  return { erreur: 'Je ne trouve pas d\'app « ' + propre(q, 40) + ' » dans le domaine.', suggestions: [...new Set([...H].map((h) => h.replace(/\.kd-mc\.com$/, '') || 'portail'))].slice(0, 12) };
}

/** Un chemin sûr, ou '' : lettres, chiffres, - _ . / ; jamais « .. », « // », jamais une porte (/__…), jamais de requête. */
export function cheminSur(page) {
  let p = String(page == null ? '' : page).trim();
  if (!p || p === '/') return '/';
  p = p.replace(/^https?:\/\/[^/]+/i, '');
  if (/[?#]/.test(p)) p = p.split(/[?#]/)[0];
  if (!p.startsWith('/')) p = '/' + p;
  if (!/^\/[A-Za-z0-9._~\-\/]{0,160}$/.test(p) || /\.\.|\/\/|^\/__/.test(p)) return null;
  return p;
}

const ARBRE = 'arbre.kd-mc.com';

/** Fabrique l'adresse finale. Rend { url, libelle } ou { erreur }. */
export function adresse(a, hotes, noms) {
  const r = resoudreApp(a && a.app, hotes, noms);
  if (r.erreur) return r;
  const chemin = cheminSur((a && a.page) || r.chemin || '/');
  if (chemin === null) return { erreur: 'Ce chemin de page n\'est pas permis (je n\'ouvre que de vraies pages du domaine).' };
  let url = 'https://' + r.hote + chemin;
  let libelle = (noms && noms[r.hote]) ? noms[r.hote] : r.hote.replace(/\.kd-mc\.com$/, '') || 'portail';
  if (r.hote === ARBRE) {
    const personne = propre(a && a.personne, 80), famille = propre(a && a.famille, 60), fiche = propre(a && a.fiche, 60);
    if (personne) { url += '#personne=' + encodeURIComponent(personne); libelle = 'L\'arbre — ' + personne; }
    else if (fiche && /^[A-Za-z0-9_-]{1,60}$/.test(fiche)) { url += '#fiche=' + encodeURIComponent(fiche); libelle = 'L\'arbre — fiche ' + fiche; }
    else if (famille) { url += '#famille=' + encodeURIComponent(famille); libelle = 'L\'arbre — famille ' + famille; }
  }
  return { url, libelle: propre(a && a.libelle, 60) || libelle, hote: r.hote };
}

/** L'outil du cerveau de Bee. `o.hotes()` / `o.noms()` : ce que le routeur sert ; `sortie.ouvrir` reçoit les boutons à montrer. */
export function outilsOuvrir(o, sortie) {
  return {
    defs: [{
      name: 'ouvrir',
      description: 'OUVRE une app ou une page du domaine sur l\'écran de Kevin (un bouton « Ouvrir » apparaît, l\'app s\'ouvre dans la foulée). À utiliser dès qu\'il dit ouvre, montre-moi, affiche, emmène-moi, va sur… ; pour l\'arbre, donne personne (prénom et nom) ou famille (nom de famille). Domaine seulement. Ne modifie rien.',
      parameters: { type: 'object', properties: {
        app: { type: 'string', description: 'le nom de l\'app : arbre, lingua, cmcteams, light, apex chat, apex, admin, javis, portail… (ou son adresse du domaine)' },
        page: { type: 'string', description: 'facultatif : un chemin de page dans l\'app, ex. /liens/' },
        personne: { type: 'string', description: 'arbre seulement : prénom et nom de la personne à montrer, ex. « Yann Lorenzi »' },
        famille: { type: 'string', description: 'arbre seulement : un nom de famille à montrer, ex. « LORENZI »' },
        libelle: { type: 'string', description: 'facultatif : le texte du bouton' },
      }, required: ['app'] },
    }],
    exe: {
      ouvrir: async (a) => {
        const r = adresse(a || {}, o.hotes(), o.noms());
        if (r.erreur) throw new Error(r.erreur + (r.suggestions && r.suggestions.length ? ' (apps : ' + r.suggestions.join(', ') + ')' : ''));
        const liste = (sortie.ouvrir = sortie.ouvrir || []);
        if (liste.length < MAX_OUVRIR && !liste.some((x) => x.url === r.url)) liste.push({ url: r.url, libelle: r.libelle });
        return 'Ouverture prête : « ' + r.libelle + ' » (' + r.url + '). Un bouton « Ouvrir » est affiché à Kevin et l\'app s\'ouvre dans la foulée. Dis-lui en une phrase ce que tu ouvres ; ne dis pas que tu n\'as pas accès.';
      },
    },
  };
}
