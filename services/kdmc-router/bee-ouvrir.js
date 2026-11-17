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
  + 'Fiche sans app nommée : l\'app où Kevin est (CMCteams, light, arbre), sinon l\'arbre. '
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
  } else if (noms && (noms[r.hote] === 'cmcteams' || noms[r.hote] === 'departs')) {
    /* CMCteams et la light : la fiche d'une personne s'ouvre aussi par #personne= (Kevin 17.11 : « Dans cmcteams » après l'arbre de Davy Carpinelli) */
    const personne = propre(a && a.personne, 80);
    if (personne) { url += '#personne=' + encodeURIComponent(personne); libelle = (noms[r.hote] === 'departs' ? 'CMCteams light' : 'CMCteams') + ' — ' + personne; }
  }
  return { url, libelle: propre(a && a.libelle, 60) || libelle, hote: r.hote };
}

/* ───────── LA VOIE DIRECTE : « ouvre… », « montre-moi… », « va sur… » ne dépendent PAS de l'IA ─────────
 * Mesuré en RÉEL le 17.10 (robot « Bee comme Kevin », run 39034152527) : « montre-moi l'arbre de Yann Lorenzi » → l'IA gratuite répondait « Je n'ai pas accès » et
 * « va sur apex chat » → « je ne peux pas ouvrir d'applications » : un modèle gratuit n'appelle pas toujours l'outil. Une demande d'ouverture claire (verbe + app) est donc
 * comprise ICI, sans IA : instantanée, gratuite, identique à chaque fois. Tout ce qui n'est pas net (question, phrase composée) continue d'aller à l'IA et à l'outil. */
const FILLER = '(?:m|me|bee|javis|jarvis|bourricot|stp|svp|ok|alors|dis|maintenant|s il te plait|peux tu|pourrais tu|tu peux|voudrais tu|veux tu)';
const RE_DIRECT = new RegExp('^(?:' + FILLER + '\\s+)*(ouvre|ouvrez|ouvrir|montre|montrez|affiche|affichez|emmene|amene|va|vas|aller|allons|lance|lancez|naviguer|fais moi voir|je veux voir|je voudrais voir|je veux aller|je voudrais aller|je veux ouvrir|je voudrais ouvrir|redirige|bascule)(?:\\s+(?:moi|nous))?\\s+(.+)$');
const COMPOSEE = /\b(?:et|puis|ensuite|qui|que|quoi|combien|comment|pourquoi|quand|dis|explique|raconte|parle|cherche|compare)\b/;
const titre = (t) => t.split(' ').filter(Boolean).map((w) => (/^(?:de|du|des|d|la|le|les|von|van|y)$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');

/** Une demande d'ouverture NETTE → { url, libelle, texte } ; sinon null (l'IA s'en occupe). `hotes` / `noms` : ce que le routeur sert. */
export function intentionOuvrir(message, hotes, noms) {
  let n = sansAccent(message).replace(/[’'`´]/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!n || n.split(' ').length > 14) return null;
  const m = n.match(RE_DIRECT); if (!m) return null;
  let cible = m[2].replace(/\s+(?:s il te plait|stp|svp|maintenant|tout de suite|merci)$/, '').trim();
  cible = cible.replace(/^(?:(?:sur|dans|vers|a|au|aux|en|le|la|les|l|un|une|mon|ma|mes|moi|nous|app|application|appli|site|page)\s+)+/, '').trim();
  if (!cible) return null;
  /* l'arbre : « l'arbre », « l'arbre de Yann Lorenzi », « la famille Lorenzi » */
  const arbre = cible.match(/^(arbre(?:\s+genealogique)?(?:\s+de\s+famille)?|famille)(?:\s+(?:de|d|du|des|a|pour)\b)?\s*(.*)$/);
  if (arbre) {
    const reste = arbre[2].replace(/^(?:la|le|les|l)\s+/, '').trim();
    const fam = arbre[1] === 'famille' ? reste : (reste.match(/^famille\s+(.+)$/) || [])[1];
    if (COMPOSEE.test(reste)) return null;
    const a = fam ? { app: 'arbre', famille: titre(fam).toUpperCase() } : reste ? { app: 'arbre', personne: titre(reste) } : { app: 'arbre' };
    const r = adresse(a, hotes, noms); if (r.erreur) return null;
    return { url: r.url, libelle: r.libelle, texte: a.personne ? 'Je t\'ouvre l\'arbre sur ' + a.personne + '.' : a.famille ? 'Je t\'ouvre l\'arbre sur la famille ' + a.famille + '.' : 'Je t\'ouvre l\'arbre.' };
  }
  if (COMPOSEE.test(cible)) return null;
  const r0 = resoudreApp(cible, hotes, noms); if (r0.erreur || !r0.hote) return null;
  const r = adresse({ app: r0.hote }, hotes, noms); if (r.erreur) return null;
  return { url: r.url, libelle: r.libelle, texte: 'Je t\'ouvre « ' + r.libelle + ' ».' };
}

/* ───────── LA FICHE D'UNE PERSONNE : « ouvre la fiche de Davy » (Kevin 17.11) ─────────
 * Kevin était dans CMCteams, a dit « ouvre la fiche de Davy » et Bee a ouvert l'ARBRE. Règle : sans app nommée, on reste dans l'app où il est
 * (CMCteams, la light ou l'arbre) ; ailleurs (portail, Lingua…) on garde l'arbre. Une app nommée à la fin (« … dans l'arbre », « … sur la light ») gagne toujours.
 * `ou` = le nom court de l'app où Kevin se trouve (celui que la page envoie : « cmcteams », « departs », « cmcteams-light », « arbre »…). */
const APPS_FICHE = new Set(['cmcteams', 'departs', 'arbre']);
const RE_FICHE = /^(?:(?:la|le|une|un|sa|son|ma|mon)\s+)?(?:fiche|profil|personne|dossier)\s+(?:de\s+|d\s+|du\s+|des\s+)?(?:(?:la|le|l)\s+)?(.+)$/;
/** Le nom court d'une app (« cmcteams », « departs », « arbre ») pour une adresse ou un nom de page ; '' si ce n'est pas une des trois qui montrent des fiches. */
export function appDeFiche(ou, hotes, noms) {
  const brut = sansAccent(ou).replace(/[^a-z0-9.\-]+/g, '').replace(/\.kd-mc\.com$/, '');
  if (!brut) return '';
  const r = resoudreApp(brut, hotes, noms);
  if (r.erreur || !r.hote) return '';
  const nom = r.hote === ARBRE ? 'arbre' : (noms && noms[r.hote]) || '';
  return APPS_FICHE.has(nom) ? nom : '';
}
/** « ouvre la fiche de Davy [dans CMCteams] » → { personne, appExplicite } ; sinon null. */
export function lireDemandeFiche(message) {
  const n = sansAccent(message).replace(/[’'`´]/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!n || n.split(' ').length > 14) return null;
  const m = n.match(RE_DIRECT); if (!m) return null;
  let cible = m[2].replace(/\s+(?:s il te plait|stp|svp|maintenant|tout de suite|merci)$/, '').trim();
  cible = cible.replace(/^(?:(?:sur|dans|vers|a|au|aux|en|le|la|les|l|un|une|mon|ma|mes|moi|nous)\s+)+/, '').trim();
  const f = cible.match(RE_FICHE); if (!f) return null;
  let reste = f[1].trim(), appExplicite = '';
  const fin = reste.match(/^(.+?)\s+(?:dans|sur|de|en|vers)\s+(?:(?:l|la|le|les|mon|ma|mes|cmc|app|application|appli)\s+)*(arbre(?:\s+genealogique)?|cmc\s*teams?(?:\s+light)?|cmcteams?(?:\s+light)?|la\s+light|light|departs|planning)$/);
  if (fin) { reste = fin[1].trim(); appExplicite = /arbre/.test(fin[2]) ? 'arbre' : /light|departs/.test(fin[2]) ? 'departs' : 'cmcteams'; }
  if (!reste || COMPOSEE.test(reste) || reste.split(' ').length > 5 || /^famille\b/.test(reste)) return null;   /* « la fiche de la famille X » : une famille, pas une personne (c'est la route de l'arbre) */
  return { personne: titre(reste), appExplicite };
}
/** La demande de fiche → { app, personne } (app = l'app visée : explicite > celle où Kevin est > l'arbre) ; sinon null. */
export function intentionFiche(message, ou, hotes, noms) {
  const d = lireDemandeFiche(message); if (!d) return null;
  const courante = appDeFiche(ou, hotes, noms);
  return { personne: d.personne, app: d.appExplicite || courante || 'arbre', courante, explicite: !!d.appExplicite };
}
/** Les noms de l'arbre qui correspondent à `personne` (liste de { id, nom } ; `trouver` vient de bee-arbre.js, `seed` = la copie de l'arbre). */
export function homonymesArbre(seed, personne, trouver, nomComplet) {
  let res = [];
  try { res = trouver(seed, personne, 4) || []; } catch (_) { res = []; }
  /* seules les vraies correspondances (tous les mots de la demande dans le nom) : pas un « Davy » qui ne ressemble qu'à moitié */
  const mots = sansAccent(personne).split(' ').filter(Boolean);
  return res.filter((r) => r && r.p).map((r) => ({ id: r.id, nom: nomComplet(r.p) }))
    .filter((r) => { const jetons = new Set(sansAccent(r.nom).replace(/[-']/g, ' ').split(' ')); return mots.every((m) => jetons.has(m)); });
}
/** La réponse de Bee pour une fiche : texte + boutons. `arbre` = { cherche: bool, trouves: [{id,nom}] } (la recherche dans l'arbre, déjà faite par le serveur). */
export function reponseFiche(f, hotes, noms, arbre) {
  const vers = (app, personne) => adresse({ app, personne }, hotes, noms);
  const nomApp = (a) => (a === 'departs' ? 'CMCteams light' : a === 'cmcteams' ? 'CMCteams' : 'l\'arbre');
  const trouves = arbre && Array.isArray(arbre.trouves) ? arbre.trouves : [];
  const boutons = [];
  const principal = vers(f.app, f.personne);
  if (principal.erreur) return null;
  /* L'arbre est visé : on sait si la personne y est. Une seule personne trouvée → son nom complet ; aucune → on le dit, sans ouvrir une page vide. */
  if (f.app === 'arbre' && arbre && arbre.cherche) {
    if (!trouves.length) return { texte: 'Je ne trouve personne qui s\'appelle « ' + f.personne + ' » dans l\'arbre. Dis-moi son nom de famille, ou donne-moi un autre prénom, et je cherche encore.', ouvrir: [] };
    if (trouves.length === 1) { const r = vers('arbre', trouves[0].nom); return r.erreur ? null : { texte: 'Je t\'ouvre l\'arbre sur ' + trouves[0].nom + '.', ouvrir: [{ url: r.url, libelle: r.libelle }] }; }
    const noms2 = trouves.slice(0, 3).map((t) => t.nom);
    return { texte: 'Il y a plusieurs « ' + f.personne + ' » dans l\'arbre : ' + noms2.join(', ') + '. Je t\'ouvre le premier ; dis-moi lequel si ce n\'est pas lui.', ouvrir: noms2.map((n) => { const r = vers('arbre', n); return r.erreur ? null : { url: r.url, libelle: r.libelle }; }).filter(Boolean) };
  }
  /* CMCteams / la light : on ouvre la fiche DANS l'app où Kevin est ; la page dit elle-même si la personne n'y est pas, et l'arbre est proposé à côté. */
  boutons.push({ url: principal.url, libelle: principal.libelle });
  let texte = 'Je t\'ouvre ' + nomApp(f.app) + ' sur ' + f.personne + '.';
  if (arbre && arbre.cherche) {
    if (trouves.length) {
      for (const t of trouves.slice(0, 2)) { const r = vers('arbre', t.nom); if (!r.erreur) boutons.push({ url: r.url, libelle: r.libelle }); }
      texte += ' Dans l\'arbre, il y a aussi : ' + trouves.slice(0, 2).map((t) => t.nom).join(', ') + '.';
    } else texte += ' Je n\'ai personne qui s\'appelle « ' + f.personne + ' » dans l\'arbre non plus.';
  }
  return { texte, ouvrir: boutons.slice(0, MAX_OUVRIR) };
}

/* ───────── LA SUITE : « Dans cmcteams » juste après « Je t'ouvre l'arbre sur Davy Carpinelli. » (Kevin 17.11) ─────────
 * Un message court sans verbe garde le sujet de la réponse qui le précède : même personne, autre app. Sans IA, gratuit, identique à chaque fois.
 * Le sujet vient UNIQUEMENT de la réponse juste avant (jamais deviné plus loin) ; un message long ou composé continue d'aller à l'IA. */
const RE_SUJET_DIRECT = /Je t['’]ouvre l['’]arbre sur (?!la famille)(.{2,80}?)\.\s*$/i;
const RE_SUJET_LIBELLE = /Je t['’]ouvre\s+«\s*L['’]arbre\s+—\s+(?!famille |fiche )(.{2,80}?)\s*»/i;
const RE_SUJET_APP = /Je t['’]ouvre CMCteams(?: light)? sur (.{2,80}?)\.\s*$/i;
const DEBUT_SUITE = /^(?:(?:et|non|plutot|alors|ok|aussi|maintenant|ouvre|ouvrez|montre|montres|affiche|emmene|va|vas|ca|la|le|les|l|moi|dans|sur|vers|a|au|en|app|application|appli)\s+)+/;
const lastTexte = (m) => (m && typeof m.content === 'string' ? m.content : '');

function sujetPrecedent(messages) {
  const av = messages[messages.length - 2];
  if (!av || av.role !== 'assistant') return '';
  const t = lastTexte(av);
  const m = t.match(RE_SUJET_DIRECT) || t.match(RE_SUJET_LIBELLE) || t.match(RE_SUJET_APP);
  return m ? propre(m[1], 80) : '';
}

/** Vrai quand le dernier message est court et suit juste une réponse « Je t'ouvre… » : l'outil `ouvrir` doit être offert à l'IA. */
export function estSuiteOuverture(messages) {
  if (!Array.isArray(messages) || messages.length < 2) return false;
  const dern = messages[messages.length - 1], av = messages[messages.length - 2];
  if (!dern || dern.role !== 'user' || !av || av.role !== 'assistant') return false;
  if (!/Je t['’]ouvre/i.test(lastTexte(av))) return false;
  return lastTexte(dern).trim().split(/\s+/).filter(Boolean).length <= 12;
}

/** Un message court qui nomme seulement une autre app, juste après une ouverture sur une personne → { url, libelle, texte } ; sinon null. */
export function intentionSuite(messages, hotes, noms) {
  if (!Array.isArray(messages) || messages.length < 2) return null;
  const dern = messages[messages.length - 1];
  if (!dern || dern.role !== 'user') return null;
  let n = sansAccent(lastTexte(dern)).replace(/[’'`´]/g, ' ').replace(/[^a-z0-9.:/ \-]+/g, ' ').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  n = n.replace(/\s+(?:s il te plait|stp|svp|merci|maintenant|tout de suite)$/, '').trim();
  if (!n || n.split(' ').length > 7) return null;
  const cible = n.replace(DEBUT_SUITE, '').trim();
  if (!cible || COMPOSEE.test(cible)) return null;
  const r0 = resoudreApp(cible, hotes, noms);
  if (r0.erreur || !r0.hote || r0.hote === ARBRE) return null;
  const personne = sujetPrecedent(messages);
  if (!personne) return null;
  const r = adresse({ app: r0.hote, personne }, hotes, noms); if (r.erreur) return null;
  const nom = noms && noms[r0.hote] === 'departs' ? 'CMCteams light' : noms && noms[r0.hote] === 'cmcteams' ? 'CMCteams' : '';
  return { url: r.url, libelle: r.libelle, texte: r.url.includes('#personne=') && nom ? 'Je t\'ouvre ' + nom + ' sur ' + personne + '.' : 'Je t\'ouvre « ' + r.libelle + ' ».' };
}

/** Quand un lien d'ouverture est prêt, la phrase de l'IA ne doit jamais dire « je n'ai pas accès » : on la remplace par la vérité. */
export function corrigerTexte(texte, ouvrir) {
  const liste = Array.isArray(ouvrir) ? ouvrir : [];
  if (!liste.length) return texte;
  if (!/n['’ ]ai pas (?:acc[eè]s|la possibilit|de moyen)|pas acc[eè]s|ne peux pas (?:ouvrir|acc[eé]der|afficher|naviguer)|impossible d['’ ]ouvrir|c['’ ]est apex qui/i.test(String(texte || ''))) return texte;
  return liste.length === 1 ? 'Je t\'ouvre « ' + liste[0].libelle + ' ».' : 'Je t\'ouvre ça : ' + liste.map((x) => '« ' + x.libelle + ' »').join(', ') + '.';
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
