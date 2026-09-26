/* kdmc-vente — encaisser, VÉRIFIER, livrer. Worker ISOLÉ (règle d'isolation Kevin).
 *
 * LE PROBLÈME QU'IL RÉSOUT (mesuré le 16.09.2026 sur les 6 boutiques) :
 * `processOrder()` se déclenche au CLIC sur PayPal, pas au PAIEMENT. Le stock est
 * décrémenté, la commande « confirmée », l'e-mail parti — même si le client ferme
 * l'onglet sans payer un centime. RIEN ne vérifie jamais qu'un euro est arrivé.
 *
 * TROIS CHEMINS, du plus automatique au plus manuel. Chacun marche SEUL :
 *   1. WEBHOOK PayPal  → instantané, 0 action. Le chemin normal.
 *   2. RECHERCHE PayPal → le client réclame, on interroge l'API. Rattrape un webhook
 *      perdu. ⚠️ L'API de recherche PayPal a un délai officiel de ~3 h : ce chemin
 *      ne délivre donc PAS dans la minute (c'est écrit au client, on ne ment pas).
 *   3. FILE MANUELLE   → Revolut, virement, ou PayPal non configuré. Kevin valide
 *      en 1 clic depuis admin.kd-mc.com.
 * Sans AUCUN secret PayPal, le worker fonctionne encore : tout tombe en file
 * manuelle. Une vente n'est JAMAIS bloquée par une config absente (fail-open vers
 * le manuel, jamais vers la livraison gratuite).
 *
 * ANTI-REJEU (le piège qui coûte cher) : une transaction PayPal ne délivre QU'UNE
 * fois. Sans ça, un client donne son e-mail à dix amis et ils se servent tous.
 *
 * Diagnostic exact partout (règle Kevin) : chaque échec renvoie {ok:false, detail, step}.
 */

const ALLOW_ORIGINS = [
  'https://kd-mc.com', 'https://www.kd-mc.com',
  'http://127.0.0.1:8731', 'http://localhost:8731',
];

/* ── Catalogue ───────────────────────────────────────────────────────────────
   Ajouter un produit = UNE entrée ici. `livre` est l'adresse que reçoit l'acheteur,
   le code est ajouté par le worker. Le prix sert à la VÉRIFICATION (on refuse un
   paiement de 1 € pour un produit à 39 €), avec une tolérance de 1 centime pour
   les arrondis de change. */
const PRODUITS = {
  'croupier-pro': {
    nom: 'Croupier Pro — entraînement complet aux paiements',
    prix: 39, devise: 'EUR',
    livre: 'https://croupier.kd-mc.com/entrainement.html',
    /* Ce que le code déverrouille. Servi par /contenu, JAMAIS écrit dans la page :
       un verrou en JavaScript dans un fichier public ne protège rien du tout. */
    contenu: ['roulette-combinee', 'blackjack', 'punto'],
  },
  'croupier-entretien': {
    nom: "Croupier — réussir l'entretien et les tests d'embauche",
    prix: 19, devise: 'EUR',
    livre: 'https://croupier.kd-mc.com/entretien.html',
    contenu: ['entretien'],
  },
  /* Kit IA de l'indépendant (Kevin 2026-09-16 : produit numérique NEUF, niche
     « compétences IA pour non-techniciens »). Le contenu payant vit dans la base
     D1 `kdmc-contenu` (binding CONTENU), JAMAIS dans le dépôt public : /lire le
     sert module par module contre un code valide, /apercu ne sert que le module
     marqué gratuit. */
  'kit-ia': {
    nom: "Kit IA de l'indépendant — 7 modules + 57 consignes prêtes à copier",
    prix: 47, devise: 'EUR',
    livre: 'https://kit.kd-mc.com/lire.html',
    contenu: ['kit-ia'],
  },
  /* Club IA au Boulot (Kevin 2026-09-16 « un business automatisé qui rapporte
     régulièrement ») : abonnement ANNUEL. Le kit complet + chaque semaine une
     nouvelle consigne-outil, ajoutée en base (produit 'club-ia') par la routine
     hebdomadaire. Le code dure 1 an (ttlJours), pas 2. */
  'club-ia': {
    nom: 'Club IA au Boulot — 1 an : le kit complet + une nouvelle consigne chaque semaine',
    prix: 59, devise: 'EUR',
    livre: 'https://kit.kd-mc.com/lire.html',
    contenu: ['kit-ia', 'club-ia'],
    ttlJours: 365,
  },
  /* Fabrique de produits (Kevin 2026-09-17 « d'autres niches ») : chaque fiche
     vit dans tools/produits/catalogue.json, son contenu est écrit en D1 par
     tools/produits/fabrique.mjs (CI). Prix tous DIFFÉRENTS : la caisse reconnaît
     un paiement PayPal par son montant. Même lecteur (lire.html?produit=…). */
  'bureau-ia': {
    nom: 'Kit IA au bureau — 7 modules pour les salariés qui veulent finir plus tôt',
    prix: 37, devise: 'EUR',
    livre: 'https://kit.kd-mc.com/lire.html?produit=bureau-ia',
    contenu: ['bureau-ia'],
  },
  'etudiant-ia': {
    nom: "Kit IA de l'étudiant — réviser, comprendre et rendre mieux, sans tricher",
    prix: 27, devise: 'EUR',
    livre: 'https://kit.kd-mc.com/lire.html?produit=etudiant-ia',
    contenu: ['etudiant-ia'],
  },
  'avis-ia': {
    nom: '40 réponses aux avis clients, prêtes à adapter — Google, Facebook, TripAdvisor',
    prix: 17, devise: 'EUR',
    livre: 'https://kit.kd-mc.com/lire.html?produit=avis-ia',
    contenu: ['avis-ia'],
  },
  'immo-ia': {
    nom: "Kit IA de l'agent immobilier — annonces, prospection, visites, suivi",
    prix: 67, devise: 'EUR',
    livre: 'https://kit.kd-mc.com/lire.html?produit=immo-ia',
    contenu: ['immo-ia'],
  },
};

const JOURS_RECHERCHE = 14;      // fenêtre de réclamation
const TTL_CODE = 60 * 60 * 24 * 365 * 2;  // un accès acheté dure 2 ans
const TTL_DEMANDE = 60 * 60 * 24 * 60;    // une demande en attente : 60 jours
const MAX_RECLAM_PAR_HEURE = 10;          // anti-balayage d'e-mails

/* ── Tableau de bord Commerce (kd-mc.com/admin/commerce.html, 17.09) ──────────
   Les workflows que Kevin peut LANCER depuis le tableau de bord, et les seuls
   champs qu'il peut leur passer. Liste FERMÉE : un jeton GitHub côté worker ne
   doit jamais permettre de lancer n'importe quoi. Le jeton (secret
   GITHUB_DISPATCH_TOKEN, poussé par deploy-kdmc-vente.yml depuis APEX_GITHUB_PAT)
   est OPTIONNEL : absent, le tableau de bord affiche le lien GitHub à la place
   du bouton, il ne ment pas. */
const DEPOT = '9r4rxssx64-creator/cmcteams';
const WORKFLOWS = {
  'produit-fabrique.yml': { nom: 'Fabrique de produits — écrire un kit en base', champs: ['produit', 'dry_run', 'refaire'] },
  'pub-videos.yml': { nom: 'Pub — vidéos et posts-liens', champs: ['videos', 'publier', 'nouveaux', 'programmer', 'lien', 'programmer_lien', 'branche'] },
  'club-semaine.yml': { nom: 'Club IA — consigne de la semaine', champs: ['dry_run', 'tester_email'] },
  'audit-live.yml': { nom: 'Audit LIVE (vraies pages kd-mc.com)', champs: [] },
  'deploy-kdmc-vente.yml': { nom: 'Déployer la caisse (kdmc-vente)', champs: [] },
};
const MAX_CODES_TABLEAU = 2000;           // au-delà, on le DIT (tronque:true)

/* ── Utilitaires ─────────────────────────────────────────────────────────── */
/* Une origine du domaine = n'importe quel sous-domaine HTTPS de kd-mc.com (les pages
   de vente vivent sur kit.kd-mc.com, croupier.kd-mc.com…). Mesuré le 16.09 : sans
   ça, la liste fixe renvoyait « https://kd-mc.com » à une page servie depuis un
   sous-domaine → le navigateur bloquait l'appel (CORS), la page disait « pas de réseau ». */
function origineDuDomaine(origin) {
  return /^https:\/\/([a-z0-9-]+\.)*kd-mc\.com$/.test(String(origin || ''));
}
function cors(origin) {
  const ok = ALLOW_ORIGINS.includes(origin) || origineDuDomaine(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : ALLOW_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cors(origin) },
  });
}
function nettoieEmail(v) {
  return String(v || '').trim().toLowerCase().slice(0, 160);
}
function emailPlausible(v) {
  return /^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(v);
}
/* Code lisible au téléphone : pas de 0/O ni 1/I/L, qu'on confond en dictant. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function nouveauCode() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  let s = '';
  for (let i = 0; i < 16; i++) {
    if (i === 4 || i === 8 || i === 12) s += '-';
    s += ALPHABET[b[i] % ALPHABET.length];
  }
  return s;
}
function memeMontant(paye, attendu) {
  return Math.abs(Number(paye) - Number(attendu)) <= 0.01;
}

/* ── PayPal REST (côté serveur — le secret ne quitte jamais le worker) ─────── */
const PP_BASE = 'https://api-m.paypal.com';

async function ppToken(env) {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_SECRET) throw new Error('paypal_non_configure');
  const basic = btoa(env.PAYPAL_CLIENT_ID + ':' + env.PAYPAL_SECRET);
  const r = await fetch(PP_BASE + '/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + basic, 'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!r.ok) throw new Error('token HTTP ' + r.status);
  const j = await r.json();
  if (!j.access_token) throw new Error('token sans access_token');
  return j.access_token;
}

/* Cherche une transaction RÉUSSIE de cet e-mail, du bon montant, dans la fenêtre.
   Renvoie {trouve:true, tx} ou {trouve:false, raison}. Ne lève jamais pour un
   simple « pas trouvé » — seulement pour une vraie panne. */
async function ppChercheTransaction(env, email, produit) {
  const token = await ppToken(env);
  const fin = new Date();
  const debut = new Date(fin.getTime() - JOURS_RECHERCHE * 864e5);
  const q = new URLSearchParams({
    start_date: debut.toISOString().replace(/\.\d+Z$/, 'Z'),
    end_date: fin.toISOString().replace(/\.\d+Z$/, 'Z'),
    fields: 'transaction_info,payer_info',
    transaction_status: 'S',
    page_size: '100',
  });
  const r = await fetch(PP_BASE + '/v1/reporting/transactions?' + q, {
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
  });
  if (!r.ok) throw new Error('recherche HTTP ' + r.status);
  const j = await r.json();
  const lignes = (j && j.transaction_details) || [];
  let vuEmail = false;
  for (const l of lignes) {
    const info = l.transaction_info || {};
    const payeur = (l.payer_info && l.payer_info.email_address) || '';
    if (nettoieEmail(payeur) !== email) continue;
    vuEmail = true;
    const montant = Math.abs(Number((info.transaction_amount && info.transaction_amount.value) || 0));
    const devise = (info.transaction_amount && info.transaction_amount.currency_code) || '';
    if (devise !== produit.devise) continue;
    if (!memeMontant(montant, produit.prix)) continue;
    return { trouve: true, tx: { id: info.transaction_id, montant, devise, date: info.transaction_initiation_date } };
  }
  return { trouve: false, raison: vuEmail ? 'montant_ne_correspond_pas' : 'aucun_paiement_a_ce_nom' };
}

/* Vérifie la signature d'un webhook auprès de PayPal (jamais de confiance aveugle :
   sans ça, n'importe qui poste un faux « payé » et se sert). */
async function ppVerifieWebhook(env, req, corps) {
  if (!env.PAYPAL_WEBHOOK_ID) return { ok: false, detail: 'PAYPAL_WEBHOOK_ID absent', step: 'webhook_config' };
  let token;
  try { token = await ppToken(env); }
  catch (e) { return { ok: false, detail: String(e.message || e), step: 'webhook_token' }; }
  const h = (n) => req.headers.get(n) || '';
  const r = await fetch(PP_BASE + '/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify({
      auth_algo: h('paypal-auth-algo'),
      cert_url: h('paypal-cert-url'),
      transmission_id: h('paypal-transmission-id'),
      transmission_sig: h('paypal-transmission-sig'),
      transmission_time: h('paypal-transmission-time'),
      webhook_id: env.PAYPAL_WEBHOOK_ID,
      webhook_event: corps,
    }),
  });
  if (!r.ok) return { ok: false, detail: 'verify HTTP ' + r.status, step: 'webhook_verify' };
  const j = await r.json();
  if (j.verification_status !== 'SUCCESS') return { ok: false, detail: 'signature ' + j.verification_status, step: 'webhook_signature' };
  return { ok: true };
}

/* ── CAISSE (PayPal Orders v2) — Kevin 2026-09-18 « tout est prévu jusqu'à
   l'encaissement ? » ─────────────────────────────────────────────────────────
   AVANT : le bouton ouvrait paypal.me dans un AUTRE onglet. Rien ne ramenait
   l'acheteur, rien côté serveur ne savait qu'il avait voulu acheter, et le
   produit devait être DEVINÉ par le montant (d'où des prix tous différents).
   Un client qui fermait l'onglet était perdu — et on ne savait même pas qu'il
   avait existé.
   MAINTENANT : la commande est créée ICI (montant, produit et référence fixés
   par nous), PayPal renvoie sur notre page de retour, et on CAPTURE nous-mêmes.
   Le produit n'est plus deviné : il est écrit dans custom_id.
   FAIL-OPEN : sans clés PayPal, /caisse/commande répond ok:false et la page
   garde les boutons paypal.me — aucune régression. */
/* Le texte exact que l'acheteur coche. On le RANGE avec la commande : en cas de
   contestation, ce qui compte n'est pas la case mais la preuve horodatée de ce
   qui a été accepté, mot pour mot. */
export const CONSENTEMENT = "Je demande que mon accès soit ouvert tout de suite, et je reconnais qu'une fois ouvert je ne peux plus me rétracter.";

/* Reçu numéroté — un justificatif d'achat, pas une facture fiscale (KDMC n'est
   pas assujetti à la TVA ici ; le dire est plus honnête que d'imprimer « TVA 0 »
   sans le justifier). Numéro continu : KDMC-<année>-<compteur>. */
async function ecritRecu(env, { cmd, cap, produit, code }) {
  try {
    const an = new Date().getUTCFullYear();
    const cle = 'compteur:recu:' + an;
    const n = Number((await env.VENTES.get(cle)) || 0) + 1;
    await env.VENTES.put(cle, String(n));
    const numero = 'KDMC-' + an + '-' + String(n).padStart(4, '0');
    const recu = {
      numero, date_iso: new Date().toISOString(),
      vendeur: VENDEUR,
      acheteur: { email: cmd.email || cap.email || null },
      article: { produit: cmd.produit, libelle: produit.nom, prix: produit.prix, devise: produit.devise },
      total: { montant: cap.montant, devise: cap.devise },
      paiement: { moyen: 'PayPal', transaction: cap.txId, reference: cmd.ref },
      acces: { code, page: produit.livre },
      consentement: cmd.consentement || null,
      mention: "Prix TTC. KDMC ne facture pas de TVA (article 293 B du CGI / régime équivalent à Monaco).",
    };
    await env.VENTES.put('recu:' + numero, JSON.stringify(recu), { expirationTtl: 60 * 60 * 24 * 365 * 10 });
    return numero;
  } catch (_) { return null; }   // best-effort : jamais bloquer une livraison payée
}

/* Identité du vendeur — affichée sur le reçu ET sur les mentions légales. Une
   vente à distance sans identité ni contact n'est pas légale. */
export const VENDEUR = { nom: 'KDMC', responsable: 'Kevin DESARZENS', lieu: 'Monaco', contact: 'kevind@monaco.mc', site: 'https://kit.kd-mc.com/' };

const TTL_CMD = 60 * 60 * 24 * 30;          // une commande en attente vit 30 jours
const RETOUR = 'https://kit.kd-mc.com/merci.html';

export function nouvelleRef() {
  /* Référence courte, lisible au téléphone, sans caractères confondables. */
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const t = new Uint8Array(8); crypto.getRandomValues(t);
  return 'K' + Array.from(t, (x) => A[x % A.length]).join('');
}

/* ── PAYPAL PERSO — l'INTENTION (Kevin 2026-09-18 « Pour l'instant utilise mon
   PayPal comme ça. perso ») ──────────────────────────────────────────────────
   Kevin garde son PayPal personnel : pas d'application PayPal, donc pas de
   clés, donc pas de capture automatique. Le lien paypal.me EST le chemin réel,
   et il avait un trou : on ouvrait un onglet et on ne savait plus RIEN — ni qui
   voulait acheter, ni quoi, ni où le joindre. Quelqu'un qui payait puis fermait
   l'onglet était invisible des deux côtés : Kevin voyait un montant sans nom,
   l'acheteur n'avait rien à citer.
   L'intention bouche ce trou SANS aucune clé : on range la commande (produit,
   montant, e-mail, consentement horodaté) AVANT d'ouvrir PayPal, et on rend une
   référence courte que l'acheteur recopie dans le message PayPal. Kevin la
   retrouve dans son tableau de bord même si l'acheteur ne revient jamais.
   Le montant vient de NOTRE catalogue, jamais du navigateur. */
export const PAYPAL_ME = 'https://paypal.me/kdmc';

/* ── LES TROIS MOYENS DE KEVIN (18.09, « Aussi mon Revolut et IBAN. Trouve des
   solutions pour automatiser comme ça ») ─────────────────────────────────────
   PayPal perso, Revolut perso, virement sur son IBAN. AUCUN des trois n'a d'API
   qui laisse vérifier un paiement : il faudrait un compte PROFESSIONNEL. Le dire
   franchement vaut mieux que promettre une vérification qui n'existe pas.
   Ce qui EST automatisé, et qui change tout : le panier est rangé AVANT le
   paiement, la référence sert de libellé/message, et Kevin livre en un doigt.
   Le virement est même le mieux loti des trois : le libellé d'un virement
   arrive tel quel sur le relevé — la référence y est lisible à coup sûr. */
export const MOYENS = ['paypal', 'revolut', 'virement'];
export const REVOLUT_ME = 'https://revolut.me/kdmc';

export function lienRevolutMe(produit) {
  const m = Number(produit.prix);
  if (!isFinite(m) || m <= 0) return REVOLUT_ME;
  return REVOLUT_ME + '/' + String(m).replace(',', '.') + String(produit.devise || 'EUR').toLowerCase();
}

/* Ce que l'acheteur doit faire, moyen par moyen. Fonction PURE : elle se teste en
   l'EXÉCUTANT. `conf` vient du coffre du worker (KV), jamais du dépôt : un IBAN
   écrit dans un dépôt public serait moissonné le jour même. */
export function instructionsPaiement(moyen, produit, ref, conf) {
  const c = conf || {};
  const base = { moyen, montant: produit.prix, devise: produit.devise, libelle: ref };
  if (moyen === 'paypal') {
    return { ...base, lien: lienPaypalMe(produit), consigne: 'Écris ' + ref + ' dans le message PayPal.' };
  }
  if (moyen === 'revolut') {
    return { ...base, lien: lienRevolutMe(produit), consigne: 'Écris ' + ref + ' dans la note Revolut.' };
  }
  if (moyen === 'virement') {
    /* Pas d'IBAN rangé → on ne propose PAS le virement. Mieux vaut un moyen en
       moins qu'un bouton qui envoie l'acheteur dans le vide. */
    if (!c.iban) return null;
    return { ...base, iban: c.iban, bic: c.bic || null, titulaire: c.titulaire || 'KDMC',
      consigne: 'Mets ' + ref + ' en libellé du virement : c\'est ce qui relie ton paiement à ton accès.' };
  }
  return null;
}

/* Un IBAN se vérifie sans réseau (norme ISO 13616, clé 97) : une faute de frappe
   au moment où Kevin le range enverrait tous ses virements nulle part. */
export function ibanValide(v) {
  const x = String(v || '').toUpperCase().replace(/[\s-]/g, '');
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(x)) return false;
  const tourne = x.slice(4) + x.slice(0, 4);
  let reste = 0;
  for (const ch of tourne) {
    const n = ch >= 'A' && ch <= 'Z' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of n) reste = (reste * 10 + Number(d)) % 97;
  }
  return reste === 1;
}
export function normaliseIban(v) { return String(v || '').toUpperCase().replace(/[\s-]/g, ''); }

async function lireBanque(env) {
  try { const v = await env.VENTES.get('reglage:banque'); return v ? JSON.parse(v) : {}; }
  catch (_) { return {}; }
}

export function lienPaypalMe(produit) {
  /* paypal.me n'accepte que le montant : la référence, c'est l'acheteur qui
     l'écrit dans le message. On ne peut pas la mettre dans l'URL. */
  const m = Number(produit.prix);
  if (!isFinite(m) || m <= 0) return PAYPAL_ME;
  return PAYPAL_ME + '/' + String(m).replace(',', '.') + (produit.devise === 'EUR' ? 'EUR' : String(produit.devise || ''));
}

/* Ce que Kevin voit dans son tableau de bord : les paniers ouverts. Une
   intention LIVRÉE n'en est plus une — elle est déjà dans les ventes. Fonction
   PURE : elle se teste en l'exécutant, pas en relisant le fichier. */
export function resumeIntentions(cmds, maintenant) {
  const now = Number(maintenant) || Date.now();
  const ouvertes = (cmds || []).filter((c) => c && c.etat && c.etat !== 'livre');
  ouvertes.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const age = (c) => Math.round((now - (c.ts || now)) / 36e5);
  return {
    n: ouvertes.length,
    dit_paye: ouvertes.filter((c) => c.etat === 'dit_paye').length,
    /* Combien de relances partiraient si Kevin touchait le bouton : abandonnés
       depuis plus de 2 h, avec un e-mail, jamais relancés. Le chiffre doit être
       VRAI avant le clic — sinon le bouton ment. */
    relancables: ouvertes.filter((c) => c.etat === 'intention' && c.email && !c.relance_iso && age(c) >= 2).length,
    ca_potentiel: Math.round(ouvertes.reduce((t, c) => t + (Number(c.montant) || 0), 0) * 100) / 100,
    liste: ouvertes.slice(0, 50).map((c) => ({
      ref: c.ref, produit: c.produit, email: c.email, montant: c.montant, devise: c.devise,
      etat: c.etat, moyen: c.moyen || 'paypal', ts_iso: c.ts_iso,
      relance_iso: c.relance_iso || null,
      heures: age(c),
    })),
  };
}

async function lireIntentions(env) {
  const { noms } = await listeToutes(env.VENTES, 'cmd:', 200);
  const cmds = [];
  for (const nom of noms) {
    const v = await env.VENTES.get(nom);
    if (!v) continue;
    try { cmds.push(JSON.parse(v)); } catch (_) { /* ligne illisible : ignorée, jamais un tableau cassé */ }
  }
  return resumeIntentions(cmds);
}

async function ppCreeCommande(env, { produitId, produit, ref, email }) {
  const token = await ppToken(env);
  const r = await fetch(PP_BASE + '/v2/checkout/orders', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'content-type': 'application/json', 'PayPal-Request-Id': ref },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: ref,
        custom_id: produitId + '|' + ref,          // le produit ne se devine plus
        description: String(produit.nom).slice(0, 127),
        amount: { currency_code: produit.devise, value: produit.prix.toFixed(2) },
      }],
      payment_source: { paypal: { experience_context: {
        brand_name: 'kd-mc.com', locale: 'fr-FR', shipping_preference: 'NO_SHIPPING',
        user_action: 'PAY_NOW', landing_page: 'NO_PREFERENCE',
        return_url: RETOUR + '?ref=' + ref, cancel_url: RETOUR + '?ref=' + ref + '&annule=1',
      } } },
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.id) throw new Error('commande HTTP ' + r.status + ' ' + JSON.stringify(j).slice(0, 200));
  const lien = (j.links || []).find((l) => l.rel === 'payer' || l.rel === 'approve');
  if (!lien) throw new Error('commande sans lien de paiement');
  return { id: j.id, approbation: lien.href };
}

async function ppCapture(env, orderId) {
  const token = await ppToken(env);
  const r = await fetch(PP_BASE + '/v2/checkout/orders/' + encodeURIComponent(orderId) + '/capture', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'content-type': 'application/json', 'PayPal-Request-Id': 'cap-' + orderId },
  });
  const j = await r.json().catch(() => ({}));
  /* Une commande DÉJÀ capturée (client qui recharge la page) n'est pas une erreur. */
  const deja = r.status === 422 && JSON.stringify(j).indexOf('ORDER_ALREADY_CAPTURED') >= 0;
  if (!r.ok && !deja) throw new Error('capture HTTP ' + r.status + ' ' + JSON.stringify(j).slice(0, 200));
  if (deja) {
    const g = await fetch(PP_BASE + '/v2/checkout/orders/' + encodeURIComponent(orderId), { headers: { Authorization: 'Bearer ' + token } });
    const gj = await g.json().catch(() => ({}));
    return lisCapture(gj);
  }
  return lisCapture(j);
}

/* Le contrôle qui protège l'argent, sorti en fonction PURE : on ne fait jamais
   confiance au navigateur, et une garde qui se contente de LIRE le code ne voit
   pas qu'on l'a neutralisée (mesuré : `if (false && …)` passait au vert).
   Celle-ci est exécutée par le test avec de vrais cas. */
export function controleCapture(cmd, cap, produit, memeMontantFn) {
  const eq = memeMontantFn || memeMontant;
  if (!cmd || !cap || !produit) return { ok: false, raison: 'donnees_manquantes' };
  if (cap.statut !== 'COMPLETED') return { ok: false, raison: 'non_paye', detail: 'statut PayPal : ' + (cap.statut || 'inconnu') };
  if (cap.produitId !== cmd.produit) return { ok: false, raison: 'incoherent', detail: 'produit payé ' + cap.produitId + ', commandé ' + cmd.produit };
  if (cap.devise !== produit.devise) return { ok: false, raison: 'incoherent', detail: 'devise ' + cap.devise + ' au lieu de ' + produit.devise };
  if (!eq(cap.montant, produit.prix)) return { ok: false, raison: 'incoherent', detail: 'payé ' + cap.montant + ' au lieu de ' + produit.prix };
  return { ok: true };
}

export function lisCapture(j) {
  const u = ((j && j.purchase_units) || [])[0] || {};
  const c = (((u.payments || {}).captures) || [])[0] || {};
  const custom = String(c.custom_id || u.custom_id || '');
  return {
    statut: String(c.status || j.status || ''),
    txId: c.id || j.id || null,
    montant: Number((c.amount && c.amount.value) || 0),
    devise: (c.amount && c.amount.currency_code) || '',
    produitId: custom.split('|')[0] || null,
    ref: custom.split('|')[1] || u.reference_id || null,
    email: nettoieEmail((j.payer && j.payer.email_address) || ''),
  };
}

/* ── Délivrance ──────────────────────────────────────────────────────────── */
/* Anti-rejeu : si cette transaction a déjà délivré, on renvoie LE MÊME code
   (le client qui recharge sa page ne doit pas être puni) mais on n'en crée pas
   un second. */
async function delivre(env, { produitId, email, source, txId }) {
  const produit = PRODUITS[produitId];
  if (!produit) return { ok: false, status: 404, detail: 'produit inconnu: ' + produitId, step: 'catalogue' };

  if (txId) {
    const deja = await env.VENTES.get('tx:' + txId);
    if (deja) return { ok: true, code: deja, deja_delivre: true, livre: produit.livre };
  }
  const code = nouveauCode();
  const ttl = produit.ttlJours ? produit.ttlJours * 86400 : TTL_CODE;
  const fiche = {
    produit: produitId, email: email || null, source,
    tx: txId || null, ts: Date.now(), ts_iso: new Date().toISOString(),
    expire_iso: new Date(Date.now() + ttl * 1000).toISOString(),
  };
  await env.VENTES.put('code:' + code, JSON.stringify(fiche), { expirationTtl: ttl });
  if (txId) await env.VENTES.put('tx:' + txId, code, { expirationTtl: ttl });
  /* Le code arrive aussi par e-mail (sinon un client qui ferme l'onglet le perd),
     et la fiche abonné va en base D1 : c'est elle que la routine hebdomadaire lit
     pour prévenir les abonnés du Club. Les deux sont best-effort : une panne
     d'e-mail ou de base ne bloque JAMAIS une livraison payée. */
  const email_envoye = email ? await envoieCode(env, { email, produit, code }) : false;
  await noteAbonne(env, { code, email, produitId, source, fiche, email_envoye });
  return { ok: true, code, deja_delivre: false, livre: produit.livre, email_envoye };
}

/* EmailJS (clé privée EMAILJS_PRIVATE_KEY poussée par le workflow ; le service et le
   gabarit sont ceux déjà utilisés par les boutiques). Renvoie true/false, ne lève jamais. */
const EMAILJS = { service: 'service_4s16z8l', template: 'template_fzva9uf', user: 'nUso3vcsGadvrWTtC' };
async function envoieCode(env, { email, produit, code }) {
  if (!env.EMAILJS_PRIVATE_KEY) return false;
  try {
    const r = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        service_id: EMAILJS.service, template_id: EMAILJS.template, user_id: EMAILJS.user,
        accessToken: env.EMAILJS_PRIVATE_KEY,
        template_params: {
          to_email: email, store: 'kd-mc.com', name: 'kd-mc.com', from_name: 'kd-mc.com',
          title: 'Ton accès : ' + produit.nom,
          message: 'Merci pour ton achat : ' + produit.nom + '.\nTon code d\'accès : ' + code +
            '\nOuvre ton accès ici : ' + produit.livre + (produit.livre.indexOf('?') >= 0 ? '&' : '?') + 'c=' + code +
            '\nGarde ce message : le code ouvre ton accès sur tous tes appareils.',
        },
      }),
    });
    return r.ok;
  } catch (_) { return false; }
}
/* Relance d'un panier non payé. C'est la seule VRAIE automatisation possible
   sur des comptes personnels : on ne peut pas constater le paiement, mais on
   peut rattraper celui qui s'est interrompu. Un panier abandonné n'est pas un
   client perdu tant que personne ne lui a reparlé. */
async function envoieRelance(env, { email, produit, ref, instr }) {
  if (!env.EMAILJS_PRIVATE_KEY) return false;
  const ou = instr && instr.lien ? '\nReprendre ici : ' + instr.lien
    : (instr && instr.iban ? '\nIBAN : ' + instr.iban + (instr.bic ? '\nBIC : ' + instr.bic : '') : '');
  try {
    const r = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        service_id: EMAILJS.service, template_id: EMAILJS.template, user_id: EMAILJS.user,
        accessToken: env.EMAILJS_PRIVATE_KEY,
        template_params: {
          to_email: email, store: 'kd-mc.com', name: 'kd-mc.com', from_name: 'kd-mc.com',
          title: 'Tu n\'as pas fini : ' + produit.nom,
          message: 'Tu as commencé à prendre « ' + produit.nom + ' » (' + produit.prix + ' ' + produit.devise + ') et le paiement n\'est pas arrivé.'
            + '\n\nTa référence : ' + ref + ' — mets-la en message/libellé, c\'est elle qui relie ton paiement à ton accès.'
            + ou
            + '\n\nTu as déjà payé ? Réponds à ce message avec ta référence, on ouvre ton accès tout de suite.'
            + '\nTu as changé d\'avis ? Ignore ce message, il n\'y en aura pas d\'autre.',
        },
      }),
    });
    return r.ok;
  } catch (_) { return false; }
}

async function noteAbonne(env, { code, email, produitId, source, fiche, email_envoye }) {
  if (!env.CONTENU || typeof env.CONTENU.prepare !== 'function') return false;
  try {
    await env.CONTENU.prepare('INSERT OR REPLACE INTO abonnes (code, email, produit, source, ts, expire, email_envoye) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
      .bind(code, email || null, produitId, source || null, fiche.ts_iso, fiche.expire_iso, email_envoye ? 1 : 0).run();
    return true;
  } catch (_) { return false; }
}

/* ── Garde-fou de débit (anti-balayage d'e-mails sur /reclamer) ───────────── */
async function tropDeTentatives(env, ip) {
  const cle = 'debit:' + ip + ':' + Math.floor(Date.now() / 36e5);
  const n = Number((await env.VENTES.get(cle)) || 0);
  if (n >= MAX_RECLAM_PAR_HEURE) return true;
  await env.VENTES.put(cle, String(n + 1), { expirationTtl: 7200 });
  return false;
}

/* ── SSO admin vérifié (même modèle que kdmc-balances, leçon #99) ─────────── */
async function requireAdmin(req) {
  const auth = req.headers.get('Authorization') || '';
  if (!/^Bearer\s+\S/.test(auth)) return { ok: false, status: 401, detail: 'pass SSO manquant', step: 'auth_header' };
  try {
    const r = await fetch('https://kd-mc.com/__sso/whoami', { headers: { Authorization: auth }, cache: 'no-store' });
    if (!r.ok) return { ok: false, status: 502, detail: 'whoami HTTP ' + r.status, step: 'whoami_fetch' };
    const j = await r.json();
    if (!j || !j.ok) return { ok: false, status: 401, detail: 'session invalide', step: 'whoami_session' };
    if (!j.admin || !j.verified) return { ok: false, status: 403, detail: 'réservé admin vérifié', step: 'whoami_admin' };
    return { ok: true, name: j.name };
  } catch (e) {
    return { ok: false, status: 502, detail: String((e && e.message) || e).slice(0, 120), step: 'whoami_exc' };
  }
}

/* ── Contenu payant (D1) ─────────────────────────────────────────────────
   Table `contenu` (produit, id, ordre, titre, html, gratuit, maj). Le HTML est
   rédigé par nous, jamais par un client : il est servi tel quel. Sans binding
   CONTENU (worker déployé sans la base), on le DIT au lieu de servir du vide. */
async function lireContenu(env, produitId, { gratuitSeulement }) {
  if (!env.CONTENU || typeof env.CONTENU.prepare !== 'function') {
    return { ok: false, status: 503, error: 'contenu_indisponible', detail: 'base de contenu non branchée (binding CONTENU absent)', step: 'contenu_binding' };
  }
  try {
    /* Un produit peut débloquer plusieurs contenus (le Club = le kit + les
       consignes hebdomadaires). Chaque id de contenu est un produit en base. */
    const prod = PRODUITS[produitId];
    const cles = (prod && prod.contenu && prod.contenu.length) ? prod.contenu : [produitId];
    const marques = cles.map((_, i) => '?' + (i + 1)).join(', ');
    const sql = 'SELECT produit, id, ordre, titre, html, gratuit FROM contenu WHERE produit IN (' + marques + ')' + (gratuitSeulement ? ' AND gratuit = 1' : '') + ' ORDER BY ordre';
    const res = await env.CONTENU.prepare(sql).bind(...cles).all();
    const lignes = (res && res.results) || [];
    const somm = await env.CONTENU.prepare('SELECT produit, id, ordre, titre, gratuit FROM contenu WHERE produit IN (' + marques + ') ORDER BY ordre').bind(...cles).all();
    return {
      ok: true,
      modules: lignes.map((l) => ({ id: l.id, ordre: l.ordre, titre: l.titre, html: l.html, gratuit: !!l.gratuit, source: l.produit })),
      sommaire: ((somm && somm.results) || []).map((l) => ({ id: l.id, ordre: l.ordre, titre: l.titre, gratuit: !!l.gratuit, source: l.produit })),
    };
  } catch (e) {
    return { ok: false, status: 500, error: 'contenu_lecture', detail: String((e && e.message) || e).slice(0, 160), step: 'contenu_sql' };
  }
}

/* ── Tableau de bord : agrégats de ventes (lecture seule) ─────────────────
   Une vente = une clé `code:<CODE>` dans VENTES. Rien d'autre ne compte les
   ventes nulle part (mesuré le 17.09 : aucune route ne listait `code:*`).
   L'e-mail est MASQUÉ avant de sortir (k***@domaine) : le tableau de bord
   n'a pas besoin de l'adresse entière pour compter. */
function masqueEmail(e) {
  const v = String(e || '');
  const i = v.indexOf('@');
  if (i < 1) return v ? '***' : '';
  return v.charAt(0) + '***' + v.slice(i);
}
/* On montre les 4 premiers et les 4 derniers : assez pour que Kevin reconnaisse
   son compte, pas assez pour qu'un écran partagé le donne. */
export function masqueIban(v) {
  const x = normaliseIban(v);
  if (x.length < 10) return x ? '***' : '';
  return x.slice(0, 4) + ' ' + '*'.repeat(Math.max(1, x.length - 8)) + ' ' + x.slice(-4);
}
async function listeToutes(kv, prefix, max) {
  const noms = [];
  let cursor;
  let tronque = false;
  for (;;) {
    const res = await kv.list(cursor ? { prefix, limit: 1000, cursor } : { prefix, limit: 1000 });
    for (const k of (res.keys || [])) { noms.push(k.name); if (noms.length >= max) { tronque = true; break; } }
    if (tronque || res.list_complete !== false || !res.cursor) break;
    cursor = res.cursor;
  }
  return { noms, tronque };
}
export function agregeVentes(fiches) {
  const parProduit = {}, parSource = {}, parMois = {};
  let n = 0, ca = 0;
  const plus = (o, k, prix) => { const x = o[k] || (o[k] = { n: 0, ca: 0 }); x.n += 1; x.ca += prix; };
  for (const f of fiches) {
    const prod = PRODUITS[f.produit];
    const prix = prod ? Number(prod.prix) || 0 : 0;
    n += 1; ca += prix;
    plus(parProduit, f.produit || '?', prix);
    plus(parSource, String(f.source || '?').split(':')[0], prix);
    plus(parMois, String(f.ts_iso || '').slice(0, 7) || '?', prix);
  }
  const dernieres = [...fiches].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 20)
    .map((f) => ({ produit: f.produit, source: f.source, ts_iso: f.ts_iso, expire_iso: f.expire_iso, email: masqueEmail(f.email) }));
  return { n, ca: Math.round(ca * 100) / 100, parProduit, parSource, parMois, dernieres };
}
async function lireVentes(env) {
  const { noms, tronque } = await listeToutes(env.VENTES, 'code:', MAX_CODES_TABLEAU);
  const fiches = [];
  for (const nom of noms) {
    const v = await env.VENTES.get(nom);
    if (!v) continue;
    try { fiches.push(JSON.parse(v)); } catch (_) { /* fiche illisible : ignorée, on ne casse pas le tableau */ }
  }
  return { ...agregeVentes(fiches), tronque };
}
async function lireFile(env) {
  const liste = await env.VENTES.list({ prefix: 'demande:', limit: 200 });
  const demandes = [];
  for (const k of liste.keys) {
    const v = await env.VENTES.get(k.name);
    if (!v) continue;
    try { demandes.push(JSON.parse(v)); } catch (_) { /* idem */ }
  }
  demandes.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return demandes;
}
/* D1 : Club (abonnés actifs, expirations à 14 j) + inventaire du contenu par
   produit. Sans base branchée → `null` et la cause, jamais un zéro trompeur. */
async function lireBase(env) {
  if (!env.CONTENU || typeof env.CONTENU.prepare !== 'function') {
    return { club: null, contenu: null, detail: 'base de contenu non branchée (binding CONTENU absent)' };
  }
  const now = new Date();
  const j14 = new Date(now.getTime() + 14 * 864e5);
  const out = { club: null, contenu: null, detail: null };
  try {
    const c = await env.CONTENU.prepare("SELECT COUNT(*) AS actifs, SUM(CASE WHEN expire <= ?2 THEN 1 ELSE 0 END) AS expirent14j, SUM(CASE WHEN relance IS NOT NULL AND relance <> '' THEN 1 ELSE 0 END) AS relances FROM abonnes WHERE produit = 'club-ia' AND expire > ?1")
      .bind(now.toISOString(), j14.toISOString()).all();
    const r = (c && c.results && c.results[0]) || {};
    const t = await env.CONTENU.prepare('SELECT COUNT(*) AS n FROM abonnes').bind().all();
    out.club = { actifs: Number(r.actifs) || 0, expirent14j: Number(r.expirent14j) || 0, relances: Number(r.relances) || 0, abonnes_total: Number(((t && t.results && t.results[0]) || {}).n) || 0 };
  } catch (e) { out.detail = 'abonnes: ' + String((e && e.message) || e).slice(0, 120); }
  try {
    const q = await env.CONTENU.prepare('SELECT produit, COUNT(*) AS n, SUM(gratuit) AS gratuits, MAX(maj) AS maj FROM contenu GROUP BY produit').bind().all();
    out.contenu = {};
    for (const l of ((q && q.results) || [])) out.contenu[l.produit] = { n: Number(l.n) || 0, gratuits: Number(l.gratuits) || 0, maj: l.maj || null };
  } catch (e) { out.detail = (out.detail ? out.detail + ' · ' : '') + 'contenu: ' + String((e && e.message) || e).slice(0, 120); }
  return out;
}
/* Chaque page de livraison est SONDÉE (HEAD) : une vente qui livre vers une
   page absente est une vente qui coûte un remboursement. Mesuré le 17.09 :
   croupier-entretien livrait vers une page inexistante. `null` = non vérifié. */
async function sondeLivraisons() {
  const out = {};
  await Promise.all(Object.entries(PRODUITS).map(async ([id, p]) => {
    try {
      const r = await fetch(p.livre, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(4000) });
      out[id] = r.status;
    } catch (_) { out[id] = null; }
  }));
  return out;
}
function enTetesGitHub(env) {
  const h = { Accept: 'application/vnd.github+json', 'User-Agent': 'kdmc-vente-tableau' };
  if (env.GITHUB_DISPATCH_TOKEN) h.Authorization = 'Bearer ' + env.GITHUB_DISPATCH_TOKEN;
  return h;
}
/* Dernier passage de chaque workflow du tableau : lu sur l'API GitHub (dépôt
   public → lisible sans jeton, avec jeton on a plus de marge). Fail-open par
   workflow : un GitHub muet donne `null`, pas une page cassée. */
async function lireRuns(env) {
  const out = {};
  await Promise.all(Object.keys(WORKFLOWS).map(async (w) => {
    try {
      const r = await fetch('https://api.github.com/repos/' + DEPOT + '/actions/workflows/' + w + '/runs?per_page=1', { headers: enTetesGitHub(env), signal: AbortSignal.timeout(6000) });
      if (!r.ok) { out[w] = { erreur: 'GitHub HTTP ' + r.status }; return; }
      const j = await r.json();
      const run = (j.workflow_runs || [])[0];
      out[w] = run ? { id: run.id, status: run.status, conclusion: run.conclusion, url: run.html_url, cree: run.created_at, maj: run.updated_at, branche: run.head_branch } : { vide: true };
    } catch (e) { out[w] = { erreur: String((e && e.message) || e).slice(0, 80) }; }
  }));
  return out;
}
export function nettoieInputs(workflow, inputs) {
  const def = WORKFLOWS[workflow];
  if (!def) return null;
  const out = {};
  for (const k of def.champs) {
    if (inputs && inputs[k] != null && inputs[k] !== '') out[k] = String(inputs[k]).slice(0, 200).replace(/[^\w.,:+\/\- ]/g, '');
  }
  return out;
}

/* ── Routes ──────────────────────────────────────────────────────────────── */
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin') || '';
    const p = url.pathname;
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });

    /* --- Santé : dit la VÉRITÉ sur ce qui est configuré ------------------- */
    if (p === '/health') {
      const banque = await lireBanque(env);
      return json({
        contenu_prive: !!(env.CONTENU && typeof env.CONTENU.prepare === 'function'),
        email_code: Boolean(env.EMAILJS_PRIVATE_KEY),
        ok: true, service: 'kdmc-vente',
        caisse: Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_SECRET),   // vraie caisse (Orders v2) : commande + capture + livraison immédiate
        encaissement: (env.PAYPAL_CLIENT_ID && env.PAYPAL_SECRET) ? 'paypal-api' : 'paypal-perso',  // perso = lien paypal.me + panier enregistré + validation par Kevin
        paypal_me: PAYPAL_ME,
        /* Les moyens réellement ouverts : le virement n'apparaît que si l'IBAN
           est rangé dans le coffre du worker (jamais dans le dépôt public). */
        moyens: MOYENS.filter((m) => m !== 'virement' || Boolean(banque.iban)),
        paypal_recherche: Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_SECRET),
        paypal_webhook: Boolean(env.PAYPAL_WEBHOOK_ID),
        produits: Object.keys(PRODUITS),
      }, 200, origin);
    }

    /* --- Catalogue public ------------------------------------------------- */
    if (p === '/produits') {
      return json({
        ok: true,
        produits: Object.entries(PRODUITS).map(([id, v]) => ({ id, nom: v.nom, prix: v.prix, devise: v.devise })),
      }, 200, origin);
    }

    /* --- Webhook PayPal : le chemin INSTANTANÉ ---------------------------- */
    if (p === '/webhook/paypal' && req.method === 'POST') {
      let corps;
      try { corps = await req.json(); }
      catch (e) { return json({ ok: false, error: 'json', detail: String(e.message || e), step: 'webhook_body' }, 400, origin); }

      const v = await ppVerifieWebhook(env, req, corps);
      /* Un webhook non vérifiable est IGNORÉ (200 pour que PayPal ne réessaie pas
         en boucle) mais jamais honoré : on ne délivre pas sur parole. */
      if (!v.ok) return json({ ok: false, ignore: true, detail: v.detail, step: v.step }, 200, origin);

      const t = corps.event_type || '';
      if (t !== 'PAYMENT.CAPTURE.COMPLETED' && t !== 'CHECKOUT.ORDER.APPROVED') {
        return json({ ok: true, ignore: true, detail: 'événement non traité: ' + t, step: 'webhook_type' }, 200, origin);
      }
      const res = corps.resource || {};
      const txId = res.id || null;
      const montant = Number((res.amount && res.amount.value) || 0);
      const devise = (res.amount && res.amount.currency_code) || '';
      const email = nettoieEmail((res.payer && res.payer.email_address) || (corps.summary || ''));

      /* Quel produit ? Le montant + la devise suffisent tant que deux produits
         n'ont pas le même prix (vérifié par un test). */
      const trouve = Object.entries(PRODUITS).find(([, v]) => v.devise === devise && memeMontant(montant, v.prix));
      if (!trouve) {
        await env.VENTES.put('demande:' + (txId || crypto.randomUUID()), JSON.stringify({
          produit: null, email: email || null, methode: 'paypal-webhook', montant, devise,
          etat: 'a_trier', detail: 'montant sans produit correspondant',
          ts: Date.now(), ts_iso: new Date().toISOString(),
        }), { expirationTtl: TTL_DEMANDE });
        return json({ ok: true, en_attente: true, detail: 'montant ' + montant + ' ' + devise + ' sans produit — mis en file', step: 'webhook_produit' }, 200, origin);
      }
      const d = await delivre(env, { produitId: trouve[0], email: email || null, source: 'paypal-webhook', txId });
      if (!d.ok) return json(d, d.status || 500, origin);
      return json({ ok: true, produit: trouve[0], deja_delivre: d.deja_delivre }, 200, origin);
    }

    /* --- CAISSE : créer la commande (le bouton « Payer ») ----------------- */
    if (p === '/caisse/commande' && req.method === 'POST') {
      let b; try { b = await req.json(); } catch (e) { return json({ ok: false, error: 'json', detail: String(e.message || e), step: 'cmd_body' }, 400, origin); }
      const produitId = String((b && b.produit) || '');
      const produit = PRODUITS[produitId];
      if (!produit) return json({ ok: false, error: 'produit_inconnu', detail: produitId, step: 'cmd_produit' }, 400, origin);
      const email = nettoieEmail((b && b.email) || '');
      if (!email) return json({ ok: false, error: 'email', detail: 'e-mail requis pour recevoir l\'accès', step: 'cmd_email' }, 400, origin);
      /* Contenu numérique livré tout de suite : la loi exige le consentement
         EXPRÈS à l'exécution immédiate + la reconnaissance de perdre le droit de
         rétractation. On le stocke HORODATÉ — c'est la preuve, pas la case. */
      if (!(b && b.consentement === true)) return json({ ok: false, error: 'consentement', detail: 'consentement à la livraison immédiate requis', step: 'cmd_consentement' }, 400, origin);
      if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_SECRET) {
        return json({ ok: false, error: 'caisse_absente', detail: 'PayPal non configuré — la page garde les liens de paiement simples', step: 'cmd_config' }, 200, origin);
      }
      const ref = nouvelleRef();
      let cmd;
      try { cmd = await ppCreeCommande(env, { produitId, produit, ref, email }); }
      catch (e) { return json({ ok: false, error: 'paypal', detail: String(e.message || e).slice(0, 200), step: 'cmd_paypal' }, 502, origin); }
      await env.VENTES.put('cmd:' + ref, JSON.stringify({
        ref, produit: produitId, email, montant: produit.prix, devise: produit.devise,
        order: cmd.id, etat: 'en_attente',
        consentement: { donne: true, texte: CONSENTEMENT, ts_iso: new Date().toISOString(), ip: req.headers.get('CF-Connecting-IP') || null },
        ts: Date.now(), ts_iso: new Date().toISOString(),
      }), { expirationTtl: TTL_CMD });
      return json({ ok: true, ref, approbation: cmd.approbation }, 200, origin);
    }

    /* --- CAISSE : l'intention (PayPal perso, sans clé) -------------------- */
    /* Appelée AVANT d'ouvrir paypal.me. Aucune clé requise : c'est le chemin
       réel tant que Kevin reste sur son PayPal personnel. */
    if (p === '/caisse/intention' && req.method === 'POST') {
      let b; try { b = await req.json(); } catch (e) { return json({ ok: false, error: 'json', detail: String(e.message || e), step: 'int_body' }, 400, origin); }
      const produitId = String((b && b.produit) || '');
      const produit = PRODUITS[produitId];
      if (!produit) return json({ ok: false, error: 'produit_inconnu', detail: produitId, step: 'int_produit' }, 400, origin);
      const email = nettoieEmail((b && b.email) || '');
      if (!emailPlausible(email)) return json({ ok: false, error: 'email', detail: 'e-mail requis pour recevoir l\'accès', step: 'int_email' }, 400, origin);
      if (!(b && b.consentement === true)) return json({ ok: false, error: 'consentement', detail: 'consentement à la livraison immédiate requis', step: 'int_consentement' }, 400, origin);
      const moyen = String((b && b.moyen) || 'paypal').toLowerCase();
      if (MOYENS.indexOf(moyen) < 0) return json({ ok: false, error: 'moyen_inconnu', detail: moyen, step: 'int_moyen' }, 400, origin);
      const banque = await lireBanque(env);
      if (!instructionsPaiement(moyen, produit, 'X', banque)) return json({ ok: false, error: 'moyen_indisponible', detail: moyen + ' pas encore ouvert — utilise PayPal ou Revolut', step: 'int_moyen_conf' }, 200, origin);
      const ref = nouvelleRef();
      await env.VENTES.put('cmd:' + ref, JSON.stringify({
        ref, produit: produitId, email, montant: produit.prix, devise: produit.devise,
        etat: 'intention', moyen,
        consentement: { donne: true, texte: CONSENTEMENT, ts_iso: new Date().toISOString(), ip: req.headers.get('CF-Connecting-IP') || null },
        ts: Date.now(), ts_iso: new Date().toISOString(),
      }), { expirationTtl: TTL_CMD });
      return json({ ok: true, ref, produit: produitId, ...instructionsPaiement(moyen, produit, ref, banque) }, 200, origin);
    }

    /* --- CAISSE : l'acheteur revient de PayPal → on capture et on livre ---- */
    if (p === '/caisse/capture' && req.method === 'POST') {
      let b; try { b = await req.json(); } catch (e) { return json({ ok: false, error: 'json', detail: String(e.message || e), step: 'cap_body' }, 400, origin); }
      const ref = String((b && b.ref) || '').toUpperCase();
      const brut = ref ? await env.VENTES.get('cmd:' + ref) : null;
      if (!brut) return json({ ok: false, error: 'commande_inconnue', detail: 'référence ' + ref, step: 'cap_ref' }, 404, origin);
      const cmd = JSON.parse(brut);
      if (cmd.etat === 'livre' && cmd.code) return json({ ok: true, code: cmd.code, deja_delivre: true, livre: PRODUITS[cmd.produit].livre, recu: cmd.recu || null }, 200, origin);
      let cap;
      try { cap = await ppCapture(env, cmd.order); }
      catch (e) { return json({ ok: false, error: 'capture', detail: String(e.message || e).slice(0, 200), step: 'cap_paypal' }, 502, origin); }
      /* On ne fait JAMAIS confiance au navigateur : le produit, la devise et le
         montant viennent de la réponse PayPal et doivent correspondre à la commande. */
      const produit = PRODUITS[cmd.produit];
      const ctrl = controleCapture(cmd, cap, produit);
      if (!ctrl.ok) return json({ ok: false, error: ctrl.raison, detail: ctrl.detail, step: 'cap_controle' }, ctrl.raison === 'non_paye' ? 402 : 409, origin);
      const d = await delivre(env, { produitId: cmd.produit, email: cmd.email || cap.email || null, source: 'caisse-paypal', txId: cap.txId });
      if (!d.ok) return json(d, d.status || 500, origin);
      const recu = await ecritRecu(env, { cmd, cap, produit, code: d.code });
      cmd.etat = 'livre'; cmd.code = d.code; cmd.tx = cap.txId; cmd.recu = recu; cmd.livre_iso = new Date().toISOString();
      await env.VENTES.put('cmd:' + ref, JSON.stringify(cmd), { expirationTtl: TTL_CODE });
      return json({ ok: true, code: d.code, deja_delivre: d.deja_delivre, livre: produit.livre, email_envoye: d.email_envoye, recu }, 200, origin);
    }

    /* --- Reçu (justificatif d'achat, numéroté) ---------------------------- */
    if (p === '/recu') {
      const n = String(url.searchParams.get('n') || '');
      const brut = n ? await env.VENTES.get('recu:' + n) : null;
      if (!brut) return json({ ok: false, error: 'recu_inconnu', detail: n, step: 'recu' }, 404, origin);
      return json({ ok: true, recu: JSON.parse(brut) }, 200, origin);
    }

    /* --- Réclamation client : « j'ai payé » ------------------------------- */
    if (p === '/reclamer' && req.method === 'POST') {
      let b;
      try { b = await req.json(); }
      catch (e) { return json({ ok: false, error: 'json', detail: String(e.message || e), step: 'reclam_body' }, 400, origin); }

      /* Le débit passe AVANT toute lecture : une référence valide rend le code
         d'accès à celui qui la présente (c'est voulu — l'acheteur qui a perdu son
         code). Sans débit ici, on pourrait essayer des références en rafale. */
      const ip = req.headers.get('CF-Connecting-IP') || 'inconnue';
      if (await tropDeTentatives(env, ip)) {
        return json({ ok: false, error: 'trop_de_tentatives', detail: 'trop d\'essais dans l\'heure, réessaie plus tard', step: 'reclam_debit' }, 429, origin);
      }

      /* Référence d'intention (PayPal perso) : elle porte déjà le produit,
         l'e-mail et le consentement horodaté. L'acheteur n'a qu'à la recopier —
         c'est le fil qui relie son paiement à son accès. */
      const refInt = String(b.ref || '').trim().toUpperCase();
      let intention = null;
      if (refInt) {
        const bi = await env.VENTES.get('cmd:' + refInt);
        if (bi) { try { intention = JSON.parse(bi); } catch (_) { intention = null; } }
      }
      if (refInt && !intention) return json({ ok: false, error: 'reference_inconnue', detail: 'référence ' + refInt, step: 'reclam_ref' }, 404, origin);
      if (intention && intention.etat === 'livre' && intention.code) {
        return json({ ok: true, verifie: true, deja_delivre: true, code: intention.code, livre: PRODUITS[intention.produit] && PRODUITS[intention.produit].livre }, 200, origin);
      }

      const produitId = String(b.produit || (intention && intention.produit) || '');
      const produit = PRODUITS[produitId];
      if (!produit) return json({ ok: false, error: 'produit', detail: 'produit inconnu: ' + produitId, step: 'reclam_produit' }, 404, origin);

      const methode = String(b.methode || 'paypal').toLowerCase();
      const email = nettoieEmail(b.email || (intention && intention.email) || '');
      if (!emailPlausible(email)) {
        return json({ ok: false, error: 'email', detail: 'adresse e-mail incomplète', step: 'reclam_email' }, 400, origin);
      }

      /* Chemin automatique : seulement PayPal, seulement si configuré. */
      if (methode === 'paypal' && env.PAYPAL_CLIENT_ID && env.PAYPAL_SECRET) {
        try {
          const rech = await ppChercheTransaction(env, email, produit);
          if (rech.trouve) {
            const d = await delivre(env, { produitId, email, source: 'paypal-recherche', txId: rech.tx.id });
            if (!d.ok) return json(d, d.status || 500, origin);
            return json({ ok: true, verifie: true, code: d.code, livre: d.livre, deja_delivre: d.deja_delivre, email_envoye: !!d.email_envoye }, 200, origin);
          }
          /* Pas trouvé ≠ pas payé : l'API PayPal a ~3 h de retard. On le DIT. */
          const id = crypto.randomUUID();
          await env.VENTES.put('demande:' + id, JSON.stringify({
            id, produit: produitId, email, methode, etat: 'en_attente',
            detail: rech.raison, ts: Date.now(), ts_iso: new Date().toISOString(),
          }), { expirationTtl: TTL_DEMANDE });
          return json({
            ok: true, verifie: false, en_attente: true, demande: id,
            detail: rech.raison === 'montant_ne_correspond_pas'
              ? 'un paiement à ce nom existe mais pas du bon montant — Kevin vérifie'
              : 'paiement pas encore visible (PayPal met jusqu\'à 3 h à publier ses transactions) — tu recevras ton accès dès qu\'il apparaît',
            step: 'reclam_non_trouve',
          }, 200, origin);
        } catch (e) {
          /* Panne PayPal → file manuelle. Une vente n'est jamais perdue. */
          const id = crypto.randomUUID();
          await env.VENTES.put('demande:' + id, JSON.stringify({
            id, produit: produitId, email, methode, etat: 'en_attente',
            detail: 'panne vérification: ' + String(e.message || e).slice(0, 120),
            ts: Date.now(), ts_iso: new Date().toISOString(),
          }), { expirationTtl: TTL_DEMANDE });
          return json({ ok: true, verifie: false, en_attente: true, demande: id, detail: 'vérification indisponible — Kevin valide à la main sous peu', step: 'reclam_panne' }, 200, origin);
        }
      }

      /* Revolut, virement, ou PayPal non configuré → file manuelle. */
      const id = crypto.randomUUID();
      await env.VENTES.put('demande:' + id, JSON.stringify({
        id, produit: produitId, email, methode, etat: 'en_attente',
        reference: refInt || String(b.reference || '').slice(0, 80),
        /* Le consentement voyage avec la demande : Kevin livre à la main, il
           doit voir ce que l'acheteur a accepté, mot pour mot et daté. */
        montant: intention ? intention.montant : null,
        devise: intention ? intention.devise : null,
        consentement: intention ? intention.consentement : null,
        detail: intention
          ? 'panier ouvert le ' + intention.ts_iso + ' — paiement annoncé par l\'acheteur'
          : (methode === 'paypal' ? 'vérification PayPal non configurée' : 'méthode sans vérification automatique'),
        ts: Date.now(), ts_iso: new Date().toISOString(),
      }), { expirationTtl: TTL_DEMANDE });
      if (intention) {
        intention.etat = 'dit_paye'; intention.demande = id; intention.dit_paye_iso = new Date().toISOString();
        await env.VENTES.put('cmd:' + refInt, JSON.stringify(intention), { expirationTtl: TTL_CMD });
      }
      return json({ ok: true, verifie: false, en_attente: true, demande: id, ref: refInt || null, detail: 'demande enregistrée — Kevin valide et tu reçois ton accès', step: 'reclam_manuel' }, 200, origin);
    }

    /* --- Accès : le client présente son code ------------------------------ */
    if (p === '/acces') {
      const code = String(url.searchParams.get('c') || '').trim().toUpperCase();
      if (!code) return json({ ok: false, error: 'code', detail: 'code absent', step: 'acces_code' }, 400, origin);
      const brut = await env.VENTES.get('code:' + code);
      if (!brut) return json({ ok: false, error: 'invalide', detail: 'code inconnu ou expiré', step: 'acces_inconnu' }, 404, origin);
      let f; try { f = JSON.parse(brut); } catch (_) { f = null; }
      if (!f || !PRODUITS[f.produit]) return json({ ok: false, error: 'invalide', detail: 'fiche illisible', step: 'acces_fiche' }, 500, origin);
      const prod = PRODUITS[f.produit];
      return json({ ok: true, produit: f.produit, nom: prod.nom, livre: prod.livre, depuis: f.ts_iso }, 200, origin);
    }

    /* --- Contenu payant : servi UNIQUEMENT contre un code valide ---------- */
    if (p === '/contenu') {
      const code = String(url.searchParams.get('c') || '').trim().toUpperCase();
      if (!code) return json({ ok: false, error: 'code', detail: 'code absent', step: 'contenu_code' }, 400, origin);
      const brut = await env.VENTES.get('code:' + code);
      if (!brut) return json({ ok: false, error: 'invalide', detail: 'code inconnu ou expiré', step: 'contenu_inconnu' }, 404, origin);
      let f; try { f = JSON.parse(brut); } catch (_) { f = null; }
      const prod = f && PRODUITS[f.produit];
      if (!prod) return json({ ok: false, error: 'invalide', detail: 'fiche illisible', step: 'contenu_fiche' }, 500, origin);
      return json({ ok: true, produit: f.produit, debloque: prod.contenu || [] }, 200, origin);
    }

    /* --- Aperçu gratuit : les modules marqués gratuits, sans code --------- */
    if (p === '/apercu') {
      const produitId = String(url.searchParams.get('produit') || '');
      if (!PRODUITS[produitId]) return json({ ok: false, error: 'produit', detail: 'produit inconnu: ' + produitId, step: 'apercu_produit' }, 404, origin);
      const r = await lireContenu(env, produitId, { gratuitSeulement: true });
      if (!r.ok) return json(r, r.status || 500, origin);
      return json({ ok: true, produit: produitId, nom: PRODUITS[produitId].nom, prix: PRODUITS[produitId].prix, modules: r.modules, sommaire: r.sommaire }, 200, origin);
    }

    /* --- Lecture payante : TOUT le produit, contre un code valide --------- */
    if (p === '/lire') {
      const code = String(url.searchParams.get('c') || '').trim().toUpperCase();
      if (!code) return json({ ok: false, error: 'code', detail: 'code absent', step: 'lire_code' }, 400, origin);
      const brut = await env.VENTES.get('code:' + code);
      if (!brut) return json({ ok: false, error: 'invalide', detail: 'code inconnu ou expiré', step: 'lire_inconnu' }, 404, origin);
      let f; try { f = JSON.parse(brut); } catch (_) { f = null; }
      const prod = f && PRODUITS[f.produit];
      if (!prod) return json({ ok: false, error: 'invalide', detail: 'fiche illisible', step: 'lire_fiche' }, 500, origin);
      const r = await lireContenu(env, f.produit, { gratuitSeulement: false });
      if (!r.ok) return json(r, r.status || 500, origin);
      return json({ ok: true, produit: f.produit, nom: prod.nom, modules: r.modules, sommaire: r.sommaire }, 200, origin);
    }

    /* --- Admin : la file d'attente --------------------------------------- */
    if (p === '/admin/file') {
      const g = await requireAdmin(req);
      if (!g.ok) return json({ ok: false, error: 'forbidden', detail: g.detail, step: g.step }, g.status, origin);
      const liste = await env.VENTES.list({ prefix: 'demande:', limit: 200 });
      const demandes = [];
      for (const k of liste.keys) {
        const v = await env.VENTES.get(k.name);
        if (!v) continue;
        try { demandes.push(JSON.parse(v)); } catch (_) { /* ligne illisible : on l'ignore, on ne casse pas la file */ }
      }
      demandes.sort((a, b) => (b.ts || 0) - (a.ts || 0));
      return json({ ok: true, demandes }, 200, origin);
    }

    /* --- Admin : valider en 1 clic ---------------------------------------- */
    if (p === '/admin/valider' && req.method === 'POST') {
      const g = await requireAdmin(req);
      if (!g.ok) return json({ ok: false, error: 'forbidden', detail: g.detail, step: g.step }, g.status, origin);
      let b; try { b = await req.json(); }
      catch (e) { return json({ ok: false, error: 'json', detail: String(e.message || e), step: 'valider_body' }, 400, origin); }
      const id = String(b.demande || '');
      const brut = await env.VENTES.get('demande:' + id);
      if (!brut) return json({ ok: false, error: 'introuvable', detail: 'demande inconnue: ' + id, step: 'valider_demande' }, 404, origin);
      let d; try { d = JSON.parse(brut); } catch (_) { d = null; }
      if (!d) return json({ ok: false, error: 'illisible', detail: 'fiche demande illisible', step: 'valider_parse' }, 500, origin);

      if (b.refuser) {
        await env.VENTES.delete('demande:' + id);
        return json({ ok: true, refuse: true }, 200, origin);
      }
      const produitId = String(b.produit || d.produit || '');
      const dd = await delivre(env, { produitId, email: d.email, source: 'admin:' + g.name, txId: null });
      if (!dd.ok) return json(dd, dd.status || 500, origin);
      /* Le panier correspondant se ferme : sinon il resterait « en attente »
         dans le tableau de bord alors que Kevin vient de livrer. */
      if (d.reference) {
        const bi = await env.VENTES.get('cmd:' + d.reference);
        if (bi) {
          try {
            const c = JSON.parse(bi);
            c.etat = 'livre'; c.code = dd.code; c.livre_iso = new Date().toISOString(); c.livre_par = 'admin:' + g.name;
            await env.VENTES.put('cmd:' + d.reference, JSON.stringify(c), { expirationTtl: TTL_CODE });
          } catch (_) { /* panier illisible : la livraison reste valable */ }
        }
      }
      await env.VENTES.delete('demande:' + id);
      return json({ ok: true, code: dd.code, livre: dd.livre, produit: produitId, email_envoye: !!dd.email_envoye }, 200, origin);
    }

    /* --- Admin : relancer les paniers abandonnés -------------------------- */
    /* UNE seule relance par panier (`relance_iso`) : au-delà, ce n'est plus une
       relance, c'est du harcèlement — et ça finit en signalement spam. */
    if (p === '/admin/relancer' && req.method === 'POST') {
      const g = await requireAdmin(req);
      if (!g.ok) return json({ ok: false, error: 'forbidden', detail: g.detail, step: g.step }, g.status, origin);
      if (!env.EMAILJS_PRIVATE_KEY) return json({ ok: false, error: 'email_absent', detail: 'pas de service e-mail configuré : aucune relance ne partirait', step: 'rel_conf' }, 200, origin);
      let b; try { b = await req.json(); } catch (_) { b = {}; }
      const heures = Math.max(1, Math.min(Number((b && b.heures) || 2), 720));
      const limite = Date.now() - heures * 36e5;
      const banque = await lireBanque(env);
      const { noms } = await listeToutes(env.VENTES, 'cmd:', 200);
      let envoyees = 0, vus = 0, echecs = 0;
      for (const nom of noms) {
        const v = await env.VENTES.get(nom);
        if (!v) continue;
        let c; try { c = JSON.parse(v); } catch (_) { continue; }
        if (!c || c.etat !== 'intention' || c.relance_iso || !c.email) continue;
        if ((c.ts || 0) > limite) continue;
        const produit = PRODUITS[c.produit];
        if (!produit) continue;
        vus += 1;
        const ok = await envoieRelance(env, { email: c.email, produit, ref: c.ref, instr: instructionsPaiement(c.moyen || 'paypal', produit, c.ref, banque) });
        if (ok) { envoyees += 1; c.relance_iso = new Date().toISOString(); await env.VENTES.put(nom, JSON.stringify(c), { expirationTtl: TTL_CMD }); }
        else echecs += 1;
      }
      return json({ ok: true, candidats: vus, envoyees, echecs, apres_heures: heures }, 200, origin);
    }

    /* --- Admin : ranger ses coordonnées bancaires ------------------------- */
    /* L'IBAN de Kevin ne doit JAMAIS entrer dans le dépôt (il est PUBLIC : un
       IBAN y serait moissonné le jour même). Il vit ici, dans le coffre du
       worker, posé UNE fois depuis son tableau de bord. Il n'est rendu qu'à
       quelqu'un qui a ouvert un panier — donc jamais sur une page moissonnable. */
    if (p === '/admin/reglages') {
      const g = await requireAdmin(req);
      if (!g.ok) return json({ ok: false, error: 'forbidden', detail: g.detail, step: g.step }, g.status, origin);
      const banque = await lireBanque(env);
      if (req.method !== 'POST') {
        /* Lecture : on montre l'IBAN masqué. Kevin doit pouvoir vérifier que
           c'est le bon sans que l'écran l'expose en entier. */
        return json({ ok: true, banque: { iban: banque.iban ? masqueIban(banque.iban) : null, bic: banque.bic || null, titulaire: banque.titulaire || null, pose_iso: banque.pose_iso || null } }, 200, origin);
      }
      let b; try { b = await req.json(); } catch (e) { return json({ ok: false, error: 'json', detail: String(e.message || e), step: 'reg_body' }, 400, origin); }
      if (b && b.effacer) {
        await env.VENTES.delete('reglage:banque');
        return json({ ok: true, efface: true }, 200, origin);
      }
      const iban = normaliseIban(b && b.iban);
      /* Clé 97 vérifiée ICI : une faute de frappe enverrait tous les virements
         de Kevin nulle part, et on ne s'en apercevrait qu'en cherchant l'argent. */
      if (!ibanValide(iban)) return json({ ok: false, error: 'iban', detail: 'IBAN invalide (clé de contrôle) — vérifie la saisie', step: 'reg_iban' }, 400, origin);
      const bic = String((b && b.bic) || '').toUpperCase().replace(/\s/g, '').slice(0, 11);
      if (bic && !/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic)) return json({ ok: false, error: 'bic', detail: 'BIC invalide', step: 'reg_bic' }, 400, origin);
      const fiche = { iban, bic: bic || null, titulaire: String((b && b.titulaire) || 'KDMC').slice(0, 80), pose_iso: new Date().toISOString(), pose_par: g.name };
      await env.VENTES.put('reglage:banque', JSON.stringify(fiche));
      return json({ ok: true, banque: { iban: masqueIban(iban), bic: fiche.bic, titulaire: fiche.titulaire, pose_iso: fiche.pose_iso } }, 200, origin);
    }

    /* --- Admin : livrer un panier en un doigt (PayPal perso) -------------- */
    /* Kevin voit le paiement dans SON PayPal. Ici il retrouve le panier (qui, quoi,
       combien, consentement daté) et envoie l'accès sans rien retaper. C'est le
       maillon qui manquait tant qu'il n'y a pas de capture automatique. */
    if (p === '/admin/livrer-panier' && req.method === 'POST') {
      const g = await requireAdmin(req);
      if (!g.ok) return json({ ok: false, error: 'forbidden', detail: g.detail, step: g.step }, g.status, origin);
      let b; try { b = await req.json(); } catch (e) { return json({ ok: false, error: 'json', detail: String(e.message || e), step: 'lp_body' }, 400, origin); }
      const ref = String((b && b.ref) || '').trim().toUpperCase();
      const brut = ref ? await env.VENTES.get('cmd:' + ref) : null;
      if (!brut) return json({ ok: false, error: 'panier_inconnu', detail: 'référence ' + ref, step: 'lp_ref' }, 404, origin);
      let c; try { c = JSON.parse(brut); } catch (_) { c = null; }
      if (!c || !PRODUITS[c.produit]) return json({ ok: false, error: 'illisible', detail: 'panier illisible', step: 'lp_parse' }, 500, origin);
      /* Déjà livré : on rend le MÊME code. Personne ne reçoit deux accès pour un
         paiement, et Kevin ne peut pas livrer deux fois par erreur. */
      if (c.etat === 'livre' && c.code) return json({ ok: true, deja_delivre: true, code: c.code, livre: PRODUITS[c.produit].livre }, 200, origin);
      if (b && b.abandonner) {
        await env.VENTES.delete('cmd:' + ref);
        return json({ ok: true, abandonne: true }, 200, origin);
      }
      const d = await delivre(env, { produitId: c.produit, email: c.email, source: 'panier:' + g.name, txId: null });
      if (!d.ok) return json(d, d.status || 500, origin);
      const recu = await ecritRecu(env, {
        cmd: c, produit: PRODUITS[c.produit], code: d.code,
        cap: { statut: 'COMPLETED', montant: c.montant, devise: c.devise, txId: String((b && b.transaction) || '').slice(0, 60) || null, email: c.email },
      });
      c.etat = 'livre'; c.code = d.code; c.recu = recu; c.livre_iso = new Date().toISOString(); c.livre_par = 'admin:' + g.name;
      await env.VENTES.put('cmd:' + ref, JSON.stringify(c), { expirationTtl: TTL_CODE });
      return json({ ok: true, code: d.code, livre: PRODUITS[c.produit].livre, email: c.email, email_envoye: !!d.email_envoye, recu }, 200, origin);
    }

    /* --- Admin : le tableau de bord Commerce en UN appel ------------------ */
    if (p === '/admin/tableau') {
      const g = await requireAdmin(req);
      if (!g.ok) return json({ ok: false, error: 'forbidden', detail: g.detail, step: g.step }, g.status, origin);
      const [ventes, demandes, base, livraisons, runs, intentions, banque] = await Promise.all([lireVentes(env), lireFile(env), lireBase(env), sondeLivraisons(), lireRuns(env), lireIntentions(env), lireBanque(env)]);
      return json({
        ok: true, quand: new Date().toISOString(), admin: g.name,
        produits: Object.entries(PRODUITS).map(([id, v]) => ({ id, nom: v.nom, prix: v.prix, devise: v.devise, livre: v.livre, contenu: v.contenu || [], ttlJours: v.ttlJours || 730, livre_http: livraisons[id] })),
        ventes, file: { n: demandes.length, demandes: demandes.slice(0, 50) },
        /* Paniers ouverts : qui a voulu acheter, quoi, et depuis combien de
           temps — même s'il n'est jamais revenu. C'est ce que le lien paypal.me
           seul ne permettait pas de savoir. */
        intentions,
        /* IBAN MASQUÉ, même pour Kevin : un écran partagé ne doit pas le donner.
           La valeur complète ne sort du coffre que vers un acheteur qui a ouvert
           un panier — jamais sur une page moissonnable. */
        banque: { iban: banque.iban ? masqueIban(banque.iban) : null, bic: banque.bic || null, titulaire: banque.titulaire || null, pose_iso: banque.pose_iso || null },
        club: base.club, contenu: base.contenu, base_detail: base.detail,
        config: { paypal_webhook: Boolean(env.PAYPAL_WEBHOOK_ID), paypal_recherche: Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_SECRET), email_code: Boolean(env.EMAILJS_PRIVATE_KEY), contenu_prive: !!(env.CONTENU && typeof env.CONTENU.prepare === 'function'), commandes: Boolean(env.GITHUB_DISPATCH_TOKEN) },
        workflows: Object.entries(WORKFLOWS).map(([id, w]) => ({ id, nom: w.nom, champs: w.champs, url: 'https://github.com/' + DEPOT + '/actions/workflows/' + id, run: runs[id] || null })),
      }, 200, origin);
    }

    /* --- Admin : lancer un workflow (liste fermée, jeton côté worker) ------ */
    if (p === '/admin/lancer' && req.method === 'POST') {
      const g = await requireAdmin(req);
      if (!g.ok) return json({ ok: false, error: 'forbidden', detail: g.detail, step: g.step }, g.status, origin);
      let b; try { b = await req.json(); }
      catch (e) { return json({ ok: false, error: 'json', detail: String(e.message || e), step: 'lancer_body' }, 400, origin); }
      const w = String(b.workflow || '');
      if (!WORKFLOWS[w]) return json({ ok: false, error: 'workflow', detail: 'workflow hors liste: ' + w, step: 'lancer_liste' }, 400, origin);
      if (!env.GITHUB_DISPATCH_TOKEN) return json({ ok: false, error: 'token_non_configure', detail: 'secret GITHUB_DISPATCH_TOKEN absent du worker — lance-le depuis GitHub', url: 'https://github.com/' + DEPOT + '/actions/workflows/' + w, step: 'lancer_token' }, 503, origin);
      const inputs = nettoieInputs(w, b.inputs);
      try {
        const r = await fetch('https://api.github.com/repos/' + DEPOT + '/actions/workflows/' + w + '/dispatches', {
          method: 'POST', headers: { ...enTetesGitHub(env), 'content-type': 'application/json' },
          body: JSON.stringify({ ref: 'main', inputs }), signal: AbortSignal.timeout(8000),
        });
        if (r.status !== 204) {
          const txt = await r.text().catch(() => '');
          return json({ ok: false, error: 'github', detail: 'GitHub HTTP ' + r.status + ' : ' + txt.slice(0, 160), step: 'lancer_dispatch' }, 502, origin);
        }
        return json({ ok: true, workflow: w, inputs, url: 'https://github.com/' + DEPOT + '/actions/workflows/' + w, par: g.name }, 200, origin);
      } catch (e) {
        return json({ ok: false, error: 'reseau', detail: String((e && e.message) || e).slice(0, 120), step: 'lancer_reseau' }, 502, origin);
      }
    }

    return json({ ok: false, error: 'not_found', detail: 'route inconnue: ' + p, step: 'routage' }, 404, origin);
  },
};

/* Export pour les tests hors-ligne (le worker n'en dépend pas). */
export const __test = { PRODUITS, WORKFLOWS, masqueEmail, nouveauCode, memeMontant, nettoieEmail, emailPlausible, ALPHABET, origineDuDomaine, lireContenu, envoieCode, EMAILJS };
