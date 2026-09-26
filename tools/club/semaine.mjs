#!/usr/bin/env node
/* Club IA au Boulot — la consigne de la semaine, publiée SANS Kevin.
 *
 * Ce que fait ce script, chaque lundi (lancé par le workflow club-semaine.yml,
 * lui-même déclenché par la routine Claude Code Remote « Club IA — contenu de
 * la semaine ») :
 *   1. lit en base D1 (kdmc-contenu) les titres déjà publiés (kit + club) pour
 *      ne jamais se répéter ;
 *   2. fait écrire par l'API Anthropic UNE consigne-outil nouvelle (HTML
 *      fragment, mêmes règles que le Kit : tutoiement, zéro jargon, zéro
 *      émoji, rien d'inventé, renvoi service-public.fr pour tout point légal) ;
 *   3. la CONTRÔLE par script (balises autorisées, 2 consignes prêtes à copier
 *      avec exemple, pièges, checklist, accents présents, pas de « prompt »,
 *      pas de trou [À COMPLÉTER]) — 3 essais, sinon on ne publie RIEN ;
 *   4. l'insère dans `contenu` (produit 'club-ia', id 'sAAAA-SS' = semaine ISO,
 *      paramètres liés, jamais de SQL concaténé) et relit la ligne ;
 *   5. prévient chaque abonné actif (table `abonnes`) par EmailJS, un par un ;
 *   6. envoie le point de la semaine à Kevin et imprime « SEMAINE PUBLIÉE ».
 *
 * Idempotent : si la semaine est déjà en base, on ne réécrit rien et on le dit.
 * DRY_RUN=true : tout sauf l'insertion et les e-mails (mais la LECTURE D1 est
 * faite pour de vrai → prouve que le jeton Cloudflare a le droit D1).
 *
 * Aucun secret n'est imprimé. Les codes d'accès ne sont jamais envoyés à
 * quelqu'un d'autre que l'abonné concerné (ici : aucun code n'est envoyé du
 * tout, seulement l'annonce du nouveau contenu).
 *
 *   node tools/club/semaine.mjs            (DRY_RUN=true par défaut hors CI)
 *   DRY_RUN=false node tools/club/semaine.mjs
 */
import { pathToFileURL } from 'node:url';

export const DB_ID = 'd28c6ec0-21e4-46b8-a3dc-49f282e3a036';   // kdmc-contenu (pas un secret)
export const PRODUIT = 'club-ia';
export const KIT = 'kit-ia';
export const EMAILJS = { service: 'service_4s16z8l', template: 'template_fzva9uf', user: 'nUso3vcsGadvrWTtC' };
export const LIRE = 'https://kit.kd-mc.com/lire.html';
export const EMAIL_KEVIN = 'kevin.desarzens@gmail.com';
export const MODELE_DEFAUT = 'claude-opus-5';

/* Variété garantie : métier et thème tournent sur 26 semaines sans se croiser
   deux fois de la même façon (deux listes de longueurs premières entre elles). */
export const METIERS = ['coiffeur', 'plombier', 'photographe', 'coach sportif', 'graphiste', 'restaurateur',
  'agent immobilier', 'fleuriste', 'électricien', 'esthéticienne', 'traiteur', 'professeur particulier',
  'ostéopathe', 'menuisier', 'boulanger', 'décoratrice', 'vendeur sur les marchés', 'kiné',
  'paysagiste', 'consultant', 'couturière', 'chauffeur VTC', 'peintre en bâtiment'];
export const THEMES = ['préparer un rendez-vous client en 5 minutes', 'répondre à un avis négatif sans s\'énerver',
  'écrire une offre de saison qui donne envie', 'relancer un devis resté sans réponse', 'faire le point du mois en 10 minutes',
  'préparer une réunion ou un appel difficile', 'transformer une question fréquente en fiche prête à envoyer',
  'préparer un message d\'absence ou de congés', 'trier et prioriser sa journée', 'rédiger une annonce de recrutement simple',
  'expliquer un tarif ou une hausse de prix', 'préparer une visite ou un chantier', 'créer une check-list métier',
  'remercier un client et demander un avis', 'préparer un partenariat avec un autre commerçant', 'écrire la page « à propos » de son site',
  'répondre à une demande floue en posant les bonnes questions', 'préparer un événement ou une porte ouverte', 'gérer un retard ou un imprévu',
  'traduire un message pour un client étranger', 'faire un résumé d\'une longue conversation', 'organiser sa semaine avec des créneaux',
  'préparer un argumentaire pour un nouveau service', 'rédiger un mode d\'emploi pour ses clients', 'apprendre une nouveauté de son métier en 15 minutes',
  'vérifier un texte avant de l\'envoyer', 'préparer les questions à poser à un fournisseur', 'écrire un message de fin d\'année',
  'décrire un produit ou une prestation pour une fiche', 'préparer une réponse à une réclamation'];

/* ── Semaine ISO ─────────────────────────────────────────────────────────── */
export function semaineISO(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const jour = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - jour);
  const an = t.getUTCFullYear();
  const debut = new Date(Date.UTC(an, 0, 1));
  const n = Math.ceil(((t - debut) / 86400000 + 1) / 7);
  return { an, n, id: 's' + an + '-' + String(n).padStart(2, '0') };
}
export function lundiDe(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const jour = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() - (jour - 1));
  return t;
}
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export function dateFr(d) { return d.getUTCDate() + ' ' + MOIS[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }

/* ── Contrôle du contenu (la porte de vérité, déterministe) ──────────────── */
const AUTORISEES = new Set(['h2', 'h3', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'pre', 'div', 'table', 'tr', 'td', 'th', 'br', 'thead', 'tbody']);
export function nettoieSortie(s) {
  return String(s || '').replace(/^\s*```(?:html)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}
export function titreDepuis(html) {
  const m = String(html).match(/<h2>\s*(?:Semaine[^—<]*—\s*)?([^<]+?)\s*<\/h2>/);
  return m ? m[1].trim() : '';
}
export function valide(html, { titresExistants = [] } = {}) {
  const h = String(html || '');
  const erreurs = [];
  const tags = [...h.matchAll(/<\/?([a-zA-Z0-9]+)/g)].map((m) => m[1].toLowerCase());
  const interdites = [...new Set(tags.filter((t) => !AUTORISEES.has(t)))];
  if (interdites.length) erreurs.push('balises interdites : ' + interdites.join(', '));
  if (/<script|javascript:|\son[a-z]+\s*=|<a\s|<img|<iframe/i.test(h)) erreurs.push('script, lien, image ou gestionnaire d\'événement interdit');
  if (!/^\s*<h2>Semaine du [^<]+ — [^<]+<\/h2>/.test(h)) erreurs.push('doit commencer par <h2>Semaine du … — Titre</h2>');
  if (!/<p class="promesse">/.test(h)) erreurs.push('<p class="promesse"> manquante');
  const consignes = (h.match(/<pre class="consigne">/g) || []).length;
  if (consignes < 2) erreurs.push('il faut 2 consignes prêtes à copier (trouvé ' + consignes + ')');
  if (consignes > 3) erreurs.push('au plus 3 consignes (trouvé ' + consignes + ')');
  const exemples = (h.match(/<div class="exemple">/g) || []).length;
  if (exemples < consignes) erreurs.push('chaque consigne doit avoir son <div class="exemple"> (' + exemples + '/' + consignes + ')');
  if ((h.match(/<div class="attention">/g) || []).length !== 1) erreurs.push('exactement un <div class="attention">');
  if ((h.match(/<div class="check">/g) || []).length !== 1) erreurs.push('exactement un <div class="check">');
  if (!/☐/.test(h)) erreurs.push('la checklist doit avoir des cases ☐');
  if (/\bprompts?\b/i.test(h)) erreurs.push('le mot « prompt » est interdit (dire « consigne »)');
  if (/\[(A|À) (COMPLETER|COMPLÉTER|REMPLIR)\]/i.test(h)) erreurs.push('trou [À COMPLÉTER] laissé dans le texte');
  const emoji = (h.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || []).filter((e) => e !== '☐');
  if (emoji.length) erreurs.push('émoji interdit (' + emoji.length + ')');
  const texte = h.replace(/<pre class="consigne">[\s\S]*?<\/pre>/g, ' ').replace(/<[^>]+>/g, ' ');
  const mots = texte.split(/\s+/).filter(Boolean).length;
  if (mots < 350) erreurs.push('trop court : ' + mots + ' mots hors consignes (350 minimum)');
  if (mots > 1300) erreurs.push('trop long : ' + mots + ' mots hors consignes (1300 maximum)');
  const accents = (texte.match(/[àâäéèêëîïôöùûüçœ]/gi) || []).length;
  if (accents < 20) erreurs.push('accents absents ou trop rares (' + accents + ') : le texte a été écrit sans accents');
  if (/\b(\d{1,3}\s?%|TVA|URSSAF|article L\.?\s?\d)/.test(texte) && !/service-public\.fr/.test(h)) {
    erreurs.push('un chiffre ou un point légal est cité sans renvoi à service-public.fr');
  }
  const titre = titreDepuis(h);
  if (!titre) erreurs.push('titre introuvable');
  const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  if (titre && titresExistants.some((t) => norm(t) === norm(titre))) erreurs.push('titre déjà publié : ' + titre);
  return { ok: erreurs.length === 0, erreurs, mots, consignes, titre };
}

/* ── D1 par l'API REST (le runner CI a le réseau ; l'agent, non) ─────────── */
export async function d1(env, sql, params = []) {
  const url = 'https://api.cloudflare.com/client/v4/accounts/' + env.CLOUDFLARE_ACCOUNT_ID + '/d1/database/' + (env.CLUB_DB_ID || DB_ID) + '/query';
  const r = await fetch(url, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + env.CLOUDFLARE_API_TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.success) {
    const cause = (j.errors || []).map((e) => e.code + ' ' + e.message).join(' ; ') || ('HTTP ' + r.status);
    throw new Error('D1 refuse la requête : ' + cause + (r.status === 403 || r.status === 401 ? ' — le jeton CLOUDFLARE_API_TOKEN n\'a sans doute pas le droit « D1 : modifier »' : ''));
  }
  return (j.result && j.result[0] && j.result[0].results) || [];
}

/* ── Rédaction par l'API Anthropic ───────────────────────────────────────── */
export function consigneRedaction({ semaine, metier, theme, titresExistants }) {
  return [
    'Tu écris la consigne-outil de la semaine du Club IA au Boulot, pour un indépendant / artisan / commerçant',
    'francophone, PAS technicien, qui lit sur son iPhone. Tutoiement. Français simple avec TOUS les accents.',
    'Zéro jargon : jamais « prompt », « LLM », « token » — dire « consigne », « assistant IA ». Outils : ChatGPT, Claude,',
    'Gemini en version gratuite.',
    '',
    'THÈME DE LA SEMAINE : ' + theme + '. MÉTIER D\'EXEMPLE : ' + metier + ' (mais la méthode doit marcher pour tous).',
    'Titres déjà publiés (ne pas refaire) : ' + titresExistants.map((t) => '« ' + t + ' »').join(', ') + '.',
    '',
    'FORMAT = UN SEUL FRAGMENT HTML (pas de <html>/<head>/<body>, pas de ``` autour), balises autorisées :',
    'h2, h3, p, ul, ol, li, strong, em, pre (class="consigne"), div (class="exemple" | "attention" | "check"). Aucun lien, aucune image.',
    '1. Commencer par : <h2>Semaine du ' + semaine + ' — Titre court et concret</h2> puis <p class="promesse"> d\'une phrase :',
    '   ce que le lecteur SAIT FAIRE à la fin.',
    '2. Pourquoi ça change ta semaine : 3 à 5 lignes concrètes (temps gagné, situation vécue).',
    '3. La méthode pas à pas : <ol> de 4 à 6 étapes, chaque étape = ce qu\'il tape ou touche sur son téléphone.',
    '4. LES CONSIGNES PRÊTES À COPIER : exactement 2, chacune précédée d\'un <h3> qui dit le résultat obtenu, dans',
    '   <pre class="consigne"> … </pre> avec des crochets [à remplacer] pour les variables ; sous chacune un',
    '   <div class="exemple"> avec un exemple RÉEL de résultat pour le métier ' + metier + ' (4 à 8 lignes).',
    '5. <div class="attention"> : 3 pièges (jamais coller de numéro de carte, de mot de passe, de données de santé',
    '   d\'un client ; relire avant d\'envoyer ; l\'IA peut inventer un chiffre).',
    '6. <div class="check"> : checklist de 4 à 6 cases commençant par ☐.',
    'Longueur : 450 à 900 mots hors consignes. Zéro émoji (sauf ☐). Pas de titre « Conclusion ».',
    'VÉRITÉ ABSOLUE : rien d\'inventé, aucun conseil juridique, fiscal ou médical affirmatif ; si un point touche la loi,',
    'écrire « vérifie sur service-public.fr » et ne citer AUCUN chiffre de mémoire. Pas de nom de personne réelle,',
    'pas de marque de client. Aucun trou du type [À COMPLÉTER] : le texte est fini.',
    'Réponds UNIQUEMENT par le fragment HTML.',
  ].join('\n');
}
/* opts.max_tokens : plafond de sortie (4000 par défaut = une consigne de semaine ; un module de kit
   complet, 12-16 Ko de HTML, en demande ~8000). opts.surArret(stop_reason) : appelé avec la raison
   d'arrêt du modèle — 'max_tokens' = réponse TRONQUÉE, ce qui coupe précisément la fin (pièges +
   checklist). Leçon du 17.09 : 42 refus « attention/check manquants » = 42 réponses coupées. */
export const JETONS_DEFAUT = 4000;
export async function redige(env, prompt, retour, opts = {}) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: env.CLUB_MODEL || MODELE_DEFAUT,
      max_tokens: opts.max_tokens || JETONS_DEFAUT,
      system: 'Tu es le rédacteur du Club IA au Boulot. Tu écris en français impeccable, accents compris, sans jamais inventer un fait.',
      messages: retour
        ? [{ role: 'user', content: prompt }, { role: 'assistant', content: retour.html }, { role: 'user', content: 'Ta réponse a été refusée par le contrôle automatique pour ces raisons : ' + retour.erreurs.join(' ; ') + '. Réécris le fragment HTML complet en corrigeant tout, sans commentaire.' }]
        : [{ role: 'user', content: prompt }],
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Anthropic refuse : HTTP ' + r.status + ' ' + ((j.error && j.error.message) || '').slice(0, 200));
  if (typeof opts.surArret === 'function') opts.surArret(j.stop_reason || 'inconnu', j.usage || {});
  return nettoieSortie((j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n'));
}

/* ── E-mails (EmailJS, côté serveur, au mieux — jamais bloquant) ─────────── */
export async function envoieEmail(env, { to, message, title }, log = () => {}) {
  if (!env.EMAILJS_PRIVATE_KEY) return false;
  try {
    const r = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ service_id: EMAILJS.service, template_id: EMAILJS.template, user_id: EMAILJS.user,
        accessToken: env.EMAILJS_PRIVATE_KEY, template_params: { to_email: to, store: 'kd-mc.com', name: 'kd-mc.com', from_name: 'kd-mc.com', title: title || 'Club IA au Boulot', message } }),
    });
    if (!r.ok) {
      /* Cause EXACTE dans le journal (jamais la clé) : EmailJS répond en texte clair
         (ex. « API calls are disabled for non-browser applications » = réglage du compte). */
      const corps = (await r.text().catch(() => '')).slice(0, 200);
      log('EmailJS refuse l\'envoi à ' + to.replace(/^(.).*@/, '$1…@') + ' : HTTP ' + r.status + ' ' + corps);
    }
    return r.ok;
  } catch (e) { log('EmailJS injoignable : ' + (e && e.message ? e.message : e)); return false; }
}
export function messageAbonne({ titre }) {
  return 'Nouveau au Club IA au Boulot : « ' + titre + ' ».\n' +
    'Deux consignes prêtes à copier, l\'exemple, les pièges et la checklist t\'attendent dans ton espace :\n' + LIRE + '\n' +
    'Ton code d\'accès est celui que tu as reçu à l\'achat (il ouvre le kit complet et toutes les consignes de la semaine).';
}

export const JOURS_RELANCE = 14;
export function messageRelance({ expire }) {
  return 'Ton accès au Club IA au Boulot se termine le ' + dateFr(new Date(expire)) + '.\n' +
    'Pour garder le kit complet et recevoir encore un an de consignes-outils (une par semaine) : https://kit.kd-mc.com/#club (59 €).\n' +
    'Rien n\'est prélevé automatiquement : si tu ne fais rien, ton accès s\'arrête simplement à cette date, sans frais.\n' +
    'Après paiement, récupère ton nouveau code sur la même page avec l\'adresse e-mail utilisée pour payer.';
}
/* Relances J-14 : un abonné dont l'accès expire dans les 14 jours reçoit UN
   rappel (colonne `relance` = date d'envoi, jamais deux fois). Lecture même à
   blanc (prouve la colonne) ; envoi + marquage seulement en réel. Un e-mail qui
   échoue n'est pas marqué : il repartira au prochain lundi. */
export async function relances(env, { dry, maintenant }, log = () => {}) {
  const de = maintenant.toISOString();
  const a = new Date(maintenant.getTime() + JOURS_RELANCE * 86400000).toISOString();
  const lignes = await d1(env, 'SELECT code, email, expire FROM abonnes WHERE produit = ?1 AND email IS NOT NULL AND email <> \'\' AND expire > ?2 AND expire <= ?3 AND (relance IS NULL OR relance = \'\') ORDER BY expire', [PRODUIT, de, a]);
  log('Relances J-' + JOURS_RELANCE + ' : ' + lignes.length + ' abonné(s) dont l\'accès expire d\'ici le ' + dateFr(new Date(a)) + (dry && lignes.length ? ' (à blanc : rien n\'est envoyé)' : ''));
  if (dry) return { a_relancer: lignes.length, relances: 0 };
  let relancees = 0;
  for (const l of lignes) {
    const ok = await envoieEmail(env, { to: l.email, message: messageRelance({ expire: l.expire }) }, log);
    if (ok) { await d1(env, 'UPDATE abonnes SET relance = ?1 WHERE code = ?2', [de, l.code]); relancees++; }
    await new Promise((r) => setTimeout(r, 300));
  }
  if (lignes.length) log('Relances envoyées : ' + relancees + '/' + lignes.length);
  return { a_relancer: lignes.length, relances: relancees };
}

/* ── Le déroulé ──────────────────────────────────────────────────────────── */
export async function principal(env = process.env, log = console.log) {
  const dry = String(env.DRY_RUN ?? 'true').toLowerCase() !== 'false';
  for (const k of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'ANTHROPIC_API_KEY']) {
    if (!env[k]) throw new Error('secret manquant : ' + k + ' (à poser dans les secrets GitHub, jamais dans le dépôt)');
  }
  const maintenant = env.CLUB_DATE ? new Date(env.CLUB_DATE) : new Date();
  /* Essai d'e-mail (à blanc seulement) : AVANT tout, pour qu'il tourne même si la
     semaine est déjà en base (mesuré le 16.09 : l'essai était sauté par ce raccourci). */
  if (dry && String(env.TEST_EMAIL || '').toLowerCase() === 'true') {
    const okMail = await envoieEmail(env, { to: env.EMAIL_KEVIN || EMAIL_KEVIN,
      message: 'Club IA au Boulot — essai d\'envoi (aucune consigne publiée). Si tu lis ceci, les e-mails du Club partent bien.' }, log);
    log('Essai d\'e-mail à Kevin : ' + (okMail ? 'ENVOYÉ' : (env.EMAILJS_PRIVATE_KEY ? 'ÉCHEC (cause ci-dessus)' : 'IMPOSSIBLE, EMAILJS_PRIVATE_KEY absent')));
  }
  const sem = semaineISO(maintenant);
  const lundi = dateFr(lundiDe(maintenant));
  log('Semaine ' + sem.id + ' (lundi ' + lundi + ') · ' + (dry ? 'ESSAI À BLANC (rien n\'est écrit, rien n\'est envoyé)' : 'PUBLICATION RÉELLE'));

  /* 1. état de la base (lecture réelle même à blanc : prouve le droit D1) */
  const lignes = await d1(env, 'SELECT produit, id, ordre, titre FROM contenu WHERE produit IN (?1, ?2) ORDER BY ordre', [KIT, PRODUIT]);
  const titres = lignes.map((l) => l.titre);
  const clubs = lignes.filter((l) => l.produit === PRODUIT);
  log('En base : ' + lignes.length + ' contenus (' + clubs.length + ' consignes du Club déjà publiées)');
  const rel = await relances(env, { dry, maintenant }, log);
  if (clubs.some((l) => l.id === sem.id)) {
    log('SEMAINE DÉJÀ PUBLIÉE : ' + sem.id + ' est en base, rien à refaire.');
    return { ok: true, deja: true, id: sem.id };
  }
  const ordre = Math.max(0, ...lignes.map((l) => Number(l.ordre) || 0)) + 1;
  const numero = clubs.length + 1;
  const metier = METIERS[numero % METIERS.length];
  const theme = THEMES[numero % THEMES.length];
  log('Consigne n° ' + numero + ' · thème « ' + theme + ' » · métier d\'exemple : ' + metier + ' · ordre ' + ordre);

  /* 2-3. rédaction + contrôle, 3 essais */
  const prompt = consigneRedaction({ semaine: lundi, metier, theme, titresExistants: titres });
  let html = '', verdict = null, retour = null;
  for (let essai = 1; essai <= 3; essai++) {
    html = await redige(env, prompt, retour);
    verdict = valide(html, { titresExistants: titres });
    log('Essai ' + essai + ' : ' + verdict.mots + ' mots, ' + verdict.consignes + ' consignes → ' + (verdict.ok ? 'ACCEPTÉ' : 'REFUSÉ : ' + verdict.erreurs.join(' ; ')));
    if (verdict.ok) break;
    retour = { html, erreurs: verdict.erreurs };
  }
  if (!verdict.ok) throw new Error('contenu refusé 3 fois par le contrôle — RIEN n\'est publié (mieux vaut rien qu\'un faux). Dernières raisons : ' + verdict.erreurs.join(' ; '));
  log('Titre : ' + verdict.titre);

  if (dry) {
    log('--- extrait ---\n' + html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 500) + '…');
    log('SEMAINE SIMULÉE : tout est prêt, rien n\'a été écrit ni envoyé (essai à blanc).');
    return { ok: true, dry: true, id: sem.id, titre: verdict.titre };
  }

  /* 4. insertion + relecture */
  await d1(env, 'INSERT INTO contenu (produit, id, ordre, titre, html, gratuit, maj) VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6)',
    [PRODUIT, sem.id, ordre, verdict.titre, html, new Date().toISOString()]);
  const relu = await d1(env, 'SELECT id, ordre, titre, length(html) AS taille FROM contenu WHERE produit = ?1 AND id = ?2', [PRODUIT, sem.id]);
  if (!relu.length || relu[0].taille !== html.length) throw new Error('relecture après insertion : la ligne ' + sem.id + ' est absente ou tronquée');
  log('En base : ' + sem.id + ' · ordre ' + relu[0].ordre + ' · ' + relu[0].taille + ' caractères');

  /* 5. abonnés actifs, un par un */
  const abonnes = await d1(env, 'SELECT DISTINCT email FROM abonnes WHERE produit = ?1 AND email IS NOT NULL AND email <> \'\' AND expire > ?2', [PRODUIT, new Date().toISOString()]);
  let envoyes = 0, rates = 0;
  if (!env.EMAILJS_PRIVATE_KEY) log('EMAILJS_PRIVATE_KEY absent : ' + abonnes.length + ' abonné(s) actif(s), AUCUN e-mail envoyé (le contenu est quand même en ligne dans leur espace).');
  for (const a of abonnes) {
    const ok = await envoieEmail(env, { to: a.email, message: messageAbonne({ titre: verdict.titre }) }, log);
    if (ok) envoyes++; else rates++;
    await new Promise((r) => setTimeout(r, 300));
  }
  log('Abonnés actifs : ' + abonnes.length + ' · prévenus : ' + envoyes + ' · échecs : ' + rates);

  /* 6. le point à Kevin (5 lignes, aucun code, aucune adresse d'abonné) */
  const point = ['Club IA au Boulot — point du lundi ' + lundi,
    'Consigne n° ' + numero + ' publiée : « ' + verdict.titre + ' » (' + verdict.mots + ' mots, ' + verdict.consignes + ' consignes).',
    'Abonnés actifs : ' + abonnes.length + ' · e-mails envoyés : ' + envoyes + (rates ? ' · échecs : ' + rates : '') + '.',
    'Accès qui expirent sous ' + JOURS_RELANCE + ' jours : ' + rel.a_relancer + ' · rappels envoyés : ' + rel.relances + '.',
    'Espace membres : ' + LIRE, 'Rien à faire de ton côté.'].join('\n');
  const kevinOk = await envoieEmail(env, { to: env.EMAIL_KEVIN || EMAIL_KEVIN, message: point }, log);
  log((kevinOk ? 'Point envoyé à Kevin.' : 'Point à Kevin NON envoyé (EmailJS absent ou en panne) — il est dans ce journal :') + '\n' + point);
  log('SEMAINE PUBLIÉE : ' + sem.id + ' · « ' + verdict.titre + ' » · ' + envoyes + ' abonné(s) prévenu(s)');
  return { ok: true, id: sem.id, titre: verdict.titre, abonnes: abonnes.length, envoyes, rates, relances: rel.relances };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().catch((e) => { console.error('ÉCHEC : ' + (e && e.message ? e.message : e)); process.exit(1); });
}
