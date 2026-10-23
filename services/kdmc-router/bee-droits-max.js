/* BEE, LA SUITE DE LA SUITE (Kevin 23.10.2026 : « Go oui tout » — après « je veux qu'il soit partout et qu'il puisse agir à ma place partout… modifier, déplacer, ajouter,
 * retirer, bloquer »). Même mécanique que bee-droits.js : l'IA PROPOSE, le domaine fabrique la carte, Kevin touche ✅, le domaine appelle la porte avec SA session admin.
 *
 * CE QUI S'OUVRE :
 *   · CRÉER UN COMPTE (compte_creer) — jusqu'ici fermé parce que « le code taperait dans la conversation ». Ici le code n'est JAMAIS tapé ni envoyé à l'IA : le domaine
 *     le TIRE AU HASARD au moment du ✅ et l'affiche UNE SEULE FOIS sur la carte de Kevin (la réponse de /__javis/agir ne va qu'à son écran ; l'historique de la conversation
 *     ne garde que le résumé, jamais le texte du résultat). La personne devra l'accepter avec les conditions à sa première connexion.
 *   · RÉGLER LE ROBOT (robot_reglage) : cryptos suivies, cadence, risque par trade, taille max, perte du jour max, perte totale max — les bornes sont celles du domaine
 *     (botValidateConfig) et le robot reste en TESTNET : cette porte ne peut pas toucher au mode réel.
 *   · LIRE : le réglage actuel (robot_config) (le contrôle de passage au réel `/__bot/reel` n'est PAS ouvert : budget de jetons des IA gratuites, et Kevin ne veut pas d'infos sensibles).
 *
 * CE QUI RESTE IMPOSSIBLE, et pourquoi (ce ne sont plus des refus, ce sont des faits) :
 *   · le coffre : il est chiffré SUR TON APPAREIL avec ton mot de passe ; le domaine n'en garde qu'un bloc illisible — aucune IA ne peut l'ouvrir, Bee pas plus qu'une autre ;
 *   · le code admin : « il ne s'écrit nulle part » (règle de sécurité du dépôt public) ;
 *   · basculer le robot en argent réel : AUCUNE porte du domaine ne le fait (TESTNET « non modifiable » à la conception) — le contrôle de Bee ne fait que lire si le robot est prêt ;
 *   · le planning et l'arbre (supprimer / publier) : pas de porte serveur à ouvrir (le planning s'écrit dans l'app, l'arbre a ses gardes « rien ne se perd »).
 * Les portes ajoutées sont listées UNE PAR UNE dans PORTES_BEE (worker.js) et dans le test. node services/kdmc-router/bee-droits-max.test.mjs */

import { compact } from './bee-droits-plus.js';

const nettoyer = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const echec = (r, quoi) => ({ ok: false, texte: quoi + ' (' + (r && (r.reason || r.detail || r.status) || 'erreur') + ').' });
const RE_TEL = /^\+?[0-9 .()-]{6,24}$/;
const lettres = (t) => /\p{L}.*\p{L}/u.test(t);
/* Sans 0/O, 1/I/l : un code qu'on recopie à la main ne se lit pas de travers. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function codeAuHasard(n = 8) {
  const lim = 256 - (256 % ALPHABET.length);   // on jette les valeurs qui fausseraient le tirage
  let s = '';
  while (s.length < n) { const b = new Uint8Array(16); crypto.getRandomValues(b); for (const v of b) if (v < lim && s.length < n) s += ALPHABET[v % ALPHABET.length]; }
  return s;
}
const REGLAGES = {   // le nom que donne l'IA → le champ de /__bot/config → le nom de la variable du robot, son libellé et son unité
  symboles: { champ: 'symbols', env: 'SYMBOLS', libelle: 'cryptos suivies', unite: '' },
  cadence: { champ: 'timeframe', env: 'TIMEFRAME', libelle: 'cadence des bougies', unite: '' },
  risque_pct: { champ: 'risk', env: 'RISK_PER_TRADE_PCT', libelle: 'risque par trade', unite: ' %' },
  position_max_pct: { champ: 'maxpos', env: 'MAX_POSITION_PCT', libelle: 'taille maximale d\'une position', unite: ' %' },
  perte_jour_pct: { champ: 'dailyloss', env: 'DAILY_LOSS_CAP_PCT', libelle: 'perte maximale du jour', unite: ' %' },
  perte_max_pct: { champ: 'maxdd', env: 'MAX_DRAWDOWN_PCT', libelle: 'perte maximale totale', unite: ' %' },
};

export const DROITS_MAX = {
  compte_creer: {
    titre: 'Créer un compte pour une personne', icone: '🆕', risque: 'eleve',
    aide: 'champs : prenom, nom, telephone — le code est tiré au hasard par le domaine et affiché UNE fois à Kevin ; ne demande JAMAIS de code à Kevin et n\'en invente pas',
    valider(c) {
      const prenom = nettoyer(c.prenom, 40), nom = nettoyer(c.nom, 50), tel = nettoyer(c.telephone, 24);
      if (!lettres(prenom) || !lettres(nom)) return { erreur: 'Il me faut le prénom ET le nom de la personne.' };
      if (!RE_TEL.test(tel) || tel.replace(/\D/g, '').length < 6) return { erreur: 'Il me faut aussi son numéro de téléphone (le domaine l\'exige pour tout nouveau compte).' };
      return { champs: { prenom, nom, telephone: tel } };
    },
    resume: (c) => 'CRÉER le compte de « ' + c.prenom + ' ' + c.nom + ' » (téléphone ' + c.telephone + ') : accès à tout le domaine public, jamais à ta partie admin. '
      + 'Je tire un code au hasard et je te l\'affiche UNE seule fois ici — toi seul le vois, il ne passe jamais par l\'IA. La personne acceptera les conditions à sa première connexion.',
    async executer(env, c, o) {
      const code = codeAuHasard(8);
      const r = await o.appeler('/__admin/compte-invite', { method: 'POST', json: { prenom: c.prenom, nom: c.nom, code, telephone: c.telephone, tel_mode: 'saisi' } });
      if (!r.ok) {
        const m = { deja_existe: 'Ce nom existe déjà : aucun compte n\'a été créé.', nom_reserve: 'Ce nom est réservé : aucun compte n\'a été créé.', telephone_invalide: 'Le numéro de téléphone n\'est pas valide : aucun compte n\'a été créé.', prenom_nom_requis: 'Le prénom et le nom ne sont pas valides : aucun compte n\'a été créé.' }[r && r.reason];
        return m ? { ok: false, texte: m } : echec(r, 'Le compte n\'a pas été créé');
      }
      return { ok: true, texte: '🆕 Le compte de ' + c.prenom + ' ' + c.nom + ' est créé.\n\n🔑 CODE : ' + code + '\n\nRecopie-le MAINTENANT et donne-le à la personne : je ne peux plus le redire (il n\'est écrit nulle part).' };
    },
  },
  robot_reglage: {
    titre: 'Régler le robot de trading (testnet)', icone: '🎚️', risque: 'eleve',
    aide: 'champs (au moins un) : symboles (ex. ["BTC/USDT","ETH/USDT"], 1 à 8), cadence (5m, 15m, 30m, 1h, 4h), risque_pct (0,1–5), position_max_pct (5–90), perte_jour_pct (1–20), perte_max_pct (3–40) — lis d\'abord robot_config ; jamais le mode réel',
    valider(c) {
      const champs = {}; const vus = [];
      for (const [cle, d] of Object.entries(REGLAGES)) {
        if (c[cle] === undefined || c[cle] === null || c[cle] === '') continue;
        if (cle === 'symboles') { const l = (Array.isArray(c[cle]) ? c[cle] : String(c[cle]).split(',')).map((x) => nettoyer(x, 20)).filter(Boolean); if (!l.length) continue; champs[cle] = l.slice(0, 8); }
        else if (cle === 'cadence') champs[cle] = nettoyer(c[cle], 6);
        else { const n = Number(String(c[cle]).replace(',', '.')); if (!isFinite(n)) return { erreur: 'Le réglage « ' + d.libelle + ' » doit être un nombre.' }; champs[cle] = n; }
        vus.push(cle);
      }
      return vus.length ? { champs } : { erreur: 'Dis-moi quel réglage changer : cryptos, cadence, risque par trade, taille max, perte du jour max ou perte totale max.' };
    },
    async enrichir(c, ctx) {   // le domaine relit le réglage actuel ET refuse tout de suite une valeur hors bornes (la même vérification que l'exécution)
      if (!ctx || typeof ctx.appeler !== 'function') return { erreur: 'Je ne peux pas lire le réglage actuel du robot.' };
      const r = await ctx.appeler('/__bot/config', { method: 'GET' });
      if (!r.ok) return { erreur: 'Je ne peux pas lire le réglage actuel du robot (' + (r.reason || r.status || 'erreur') + ').' };
      const avant = {}; for (const [cle, d] of Object.entries(REGLAGES)) if (c[cle] !== undefined && r.config && r.config[d.env] != null) avant[cle] = nettoyer(r.config[d.env], 80);
      return { champs: Object.assign({}, c, { _avant: avant, _live: r.live === true }) };
    },
    resume: (c) => 'RÉGLER LE ROBOT (testnet, jamais l\'argent réel) : ' + Object.keys(REGLAGES).filter((k) => c[k] !== undefined).map((k) => {
      const d = REGLAGES[k]; const v = Array.isArray(c[k]) ? c[k].join(', ') : c[k];
      return d.libelle + ' : ' + (c._avant && c._avant[k] != null ? c._avant[k] + ' → ' : '') + v + d.unite;
    }).join(' · ') + '. Le robot redémarre pour appliquer.' + (c._live ? ' ⚠️ Il tourne actuellement en mode RÉEL : ce changement s\'applique à de l\'argent réel.' : ''),
    async executer(env, c, o) {
      const corps = {}; for (const [cle, d] of Object.entries(REGLAGES)) if (c[cle] !== undefined) corps[d.champ] = c[cle];
      const r = await o.appeler('/__bot/config', { method: 'POST', json: corps });
      if (!r.ok) return r.reason === 'reglage_invalide' ? { ok: false, texte: 'Réglage refusé : ' + nettoyer(r.detail, 160) + '. Rien n\'a changé.' } : echec(r, 'Le réglage n\'est pas passé');
      return { ok: true, texte: '🎚️ Le robot est réglé (' + compact(r.set, 300) + ') et redémarre.' };
    },
  },
};
export const ACTIONS_DROITS_MAX = Object.keys(DROITS_MAX);

export function outilsLectureMax(o) {
  const defs = [
    { name: 'robot_config', description: 'Le réglage actuel du robot (cryptos, cadence, risque, pertes max) et son mode testnet/réel. Lecture seule.', parameters: { type: 'object', properties: {}, required: [] } },
  ];
  const lire = async (chemin, f, quoi) => { const r = await o.appeler(chemin, { method: 'GET' }); return r.ok ? f(r) : quoi + ' est illisible (' + (r.reason || r.detail || r.status || 'erreur') + ').'; };
  const exe = {
    robot_config: () => lire('/__bot/config', (r) => 'Réglage du robot : ' + compact(r.config, 900) + ' · mode ' + (r.live ? 'RÉEL' : 'testnet (argent fictif)') + '.', 'Le réglage'),
  };
  return { defs, exe };
}

/** Une demande qui parle de créer un compte ou de régler le robot : les mains de Bee sont prises d'office. */
export const RE_DROITS_MAX = /cr[ée]e\w*.{0,30}(?:compte|acc[èe]s)|nouveau compte|(?:r[ée]gl\w*|chang\w*|met(?:s|tre)?|baiss\w*|mont\w*|augment\w*|diminu\w*|r[ée]duis\w*|suis|suivre)\b.{0,40}(?:risque|cadence|position|taille max|perte|crypto|symboles?|robot|\bbot\b|\bbtc\b|\beth\b)|risque par|testnet|pass\w*.{0,20}r[ée]el/i;
