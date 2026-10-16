/* BEE, LA SUITE DES DROITS (Kevin 16.10.2026 : « Il doit pouvoir tout faire dans n'importe quelle app du domaine et du domaine pour moi. N'importe quelle action
 * ou tâche »). Question posée à Kevin (à un choix) puis réponses : il ouvre « Lire plus », « Gérer les comptes » et « Régler le robot » ; il GARDE FERMÉ le coffre et les
 * clés, le code admin, créer un compte avec un code, l'argent réel du robot, publier l'arbre. Même mécanique que bee-droits.js : l'IA PROPOSE, le domaine fabrique la carte
 * (vrai nom de la personne, jamais le texte de l'IA), Kevin touche ✅, le domaine appelle la porte existante AVEC SA SESSION (une porte fermée à Kevin reste fermée à Bee).
 *
 * LIRE PLUS (sans ✅, lecture seule, texte borné, aucun secret) : le robot (l'IA pilote, la flotte, le bilan, le marché, les liens, le scan, l'analyse), les demandes Rotaplan
 *   (nom, établissement, date — jamais l'e-mail), les personnes attendues, les personnes bannies. NON ouvert, par la règle « aucun nom de collègue vers l'IA » : les matricules du planning.
 * GÉRER LES COMPTES (✅) : ouvrir un compte en attente · supprimer un compte (copie gardée 30 jours, le nom redevient libre, ban facultatif ; jamais l'admin) · autoriser de nouveau
 *   une personne bannie · ajouter/retirer une personne attendue.
 * RÉGLER LE ROBOT (✅) : l'IA pilote en auto / à l'arrêt, la lancer maintenant, annuler l'essai en cours (les anciens réglages reviennent). Jamais le mode réel (l'argent).
 * Les portes ajoutées sont listées UNE PAR UNE dans PORTES_BEE (worker.js) et dans le test. node services/kdmc-router/bee-droits-plus.test.mjs */

const nettoyer = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const UID_ADMIN = 'kdmc_admin';
const RE_UID = /^[\p{L}\p{N}_.:@-]{2,80}$/u;
const RE_ID_BAN = /^[\p{L}\p{N}_.:@-]{2,80}@\d{10,14}$/u;
const echec = (r, quoi) => ({ ok: false, texte: quoi + ' (' + (r && (r.reason || r.detail || r.status) || 'erreur') + ').' });
const nomAffiche = (c) => '« ' + c.nom + ' »';
const jour = (ms) => { try { return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Monaco', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(ms)); } catch (_) { return '?'; } };

/** Une réponse de porte, rendue sans ses champs techniques ni rien qui ressemble à un secret, bornée en taille. */
export function compact(r, max) {
  const SECRET = /key|token|secret|code|hash|passw|cookie|jeton|apikey|api_|(?:^|_)pin(?:_|$)|(?:^|_)cl[eé](?:_|$)/i;
  const nettoyerObj = (v, d) => {
    if (d > 5) return '…';
    if (Array.isArray(v)) return v.slice(0, 40).map((x) => nettoyerObj(x, d + 1));
    if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) { if (SECRET.test(k) || k === 'ok' || k === 'status') continue; o[k] = nettoyerObj(v[k], d + 1); } return o; }
    return typeof v === 'string' ? nettoyer(v, 240) : v;
  };
  const s = JSON.stringify(nettoyerObj(r, 0));
  return s.length > (max || 1800) ? s.slice(0, (max || 1800) - 1) + '…' : s;
}

/** Retrouve la personne par son identifiant : le NOM vient du domaine, jamais de l'IA. */
async function personne(c, ctx) {
  const uid = nettoyer(c.uid, 80);
  if (!RE_UID.test(uid)) return { erreur: 'Il me manque l\'identifiant de la personne : cherche-la d\'abord avec comptes_domaine.' };
  if (uid === UID_ADMIN) return { erreur: 'C\'est ton propre compte : je ne l\'ouvre, ne l\'efface ni ne le bannis jamais.' };
  if (!ctx || typeof ctx.appeler !== 'function') return { erreur: 'Je ne peux pas vérifier cette personne pour le moment.' };
  const r = await ctx.appeler('/__admin/acces?uid=' + encodeURIComponent(uid), { method: 'GET' });
  if (!r.ok || !r.name) return { erreur: 'Je ne connais aucun compte avec cet identifiant (' + uid + ').' };
  return { uid, nom: nettoyer(r.name, 90) };
}
const vrai = (v) => v === true || /^(oui|true|1|yes)$/i.test(String(v || '').trim());

export const DROITS_PLUS = {
  compte_ouvrir: {
    titre: 'Ouvrir le compte d\'une personne en attente', icone: '🔓', risque: 'moyen',
    aide: 'champs : uid (l\'identifiant, cherche-le avec comptes_domaine) — retire l\'attente de ta validation ; ne touche ni au code ni au périmètre',
    valider(c) { return { champs: { uid: nettoyer(c.uid, 80) } }; },
    enrichir: async (c, ctx) => { const p = await personne(c, ctx); return p.erreur ? p : { champs: Object.assign({}, c, { nom: p.nom }) }; },
    resume: (c) => 'OUVRIR le compte de ' + nomAffiche(c) + ' : tu le valides, elle ou il entre à sa prochaine connexion. Son code et ses accès ne changent pas.',
    async executer(env, c, o) {
      const r = await o.appeler('/__admin/compte-ouvrir', { method: 'POST', json: { uid: c.uid } });
      return r.ok ? { ok: true, texte: '🔓 Le compte de ' + c.nom + ' est ouvert : ' + (r.etait && r.etait !== 'ouvert' ? 'il était en attente de ta validation.' : 'il l\'était déjà, c\'est confirmé.') } : echec(r, 'Le compte n\'a pas été ouvert');
    },
  },
  compte_supprimer: {
    titre: 'Supprimer le compte d\'une personne', icone: '🗑️', risque: 'eleve',
    aide: 'champs : uid (l\'identifiant, cherche-le avec comptes_domaine), bannir (true SEULEMENT si Kevin demande de la bannir)',
    valider(c) { return { champs: { uid: nettoyer(c.uid, 80), bannir: vrai(c.bannir) } }; },
    enrichir: async (c, ctx) => { const p = await personne(c, ctx); return p.erreur ? p : { champs: Object.assign({}, c, { nom: p.nom }) }; },
    resume: (c) => 'SUPPRIMER le compte de ' + nomAffiche(c) + ' : sa fiche, son code et ses demandes en attente sont effacés ; son nom redevient libre (elle ou il pourra se réinscrire). Une copie de la fiche, sans code, reste 30 jours.'
      + (c.bannir ? ' ET la BANNIR : elle ou il ne pourra plus se réinscrire tant que tu ne l\'autorises pas de nouveau.' : '') + ' Ton compte, lui, n\'est jamais touché.',
    async executer(env, c, o) {
      const r = await o.appeler('/__admin/compte-supprimer', { method: 'POST', json: { uid: c.uid, confirmer: true, bannir: c.bannir === true } });
      if (!r.ok) return echec(r, 'Le compte n\'a pas été supprimé');
      return { ok: true, texte: '🗑️ Le compte de ' + c.nom + ' est supprimé' + (r.banni ? ' et la personne est bannie' : '') + '. Une copie reste 30 jours.' };
    },
  },
  compte_debannir: {
    titre: 'Autoriser de nouveau une personne bannie', icone: '✅', risque: 'moyen',
    aide: 'champs : id (l\'identifiant du bannissement, donné par personnes_bannies)',
    valider(c) { const id = nettoyer(c.id, 120); return RE_ID_BAN.test(id) ? { champs: { id } } : { erreur: 'Il me manque l\'identifiant du bannissement : regarde d\'abord personnes_bannies.' }; },
    async enrichir(c, ctx) {
      if (!ctx || typeof ctx.appeler !== 'function') return { erreur: 'Je ne peux pas lire la liste des bannis.' };
      const r = await ctx.appeler('/__admin/bannis', { method: 'GET' });
      const e = r.ok && Array.isArray(r.bannis) ? r.bannis.find((x) => x && x.id === c.id) : null;
      return e ? { champs: Object.assign({}, c, { nom: nettoyer(e.nom || e.uid, 80) }) } : { erreur: 'Je ne trouve aucun banni avec cet identifiant.' };
    },
    resume: (c) => 'AUTORISER DE NOUVEAU ' + nomAffiche(c) + ' : elle ou il pourra se réinscrire. Son ancien compte, lui, n\'est pas rendu.',
    async executer(env, c, o) {
      const r = await o.appeler('/__admin/debannir', { method: 'POST', json: { id: c.id } });
      return r.ok ? { ok: true, texte: '✅ ' + c.nom + ' n\'est plus banni(e).' } : echec(r, 'Le bannissement n\'est pas levé');
    },
  },
  personne_attendue: {
    titre: 'Ajouter ou retirer une personne attendue', icone: '📋', risque: 'faible',
    aide: 'champs : nom (prénom ET nom), retirer (true pour la retirer de la liste)',
    valider(c) {
      const nom = nettoyer(c.nom, 80);
      if (nom.split(' ').filter(Boolean).length < 2) return { erreur: 'Il me faut le prénom ET le nom de la personne attendue.' };
      return { champs: { nom, retirer: vrai(c.retirer) } };
    },
    resume: (c) => c.retirer ? 'RETIRER « ' + c.nom + ' » de la liste des personnes attendues.' : 'AJOUTER « ' + c.nom + ' » à la liste des personnes attendues (elle ou il sera reconnu(e) à l\'inscription).',
    async executer(env, c, o) {
      const r = await o.appeler('/__admin/attendus', { method: 'POST', json: { nom: c.nom, retirer: c.retirer === true } });
      return r.ok ? { ok: true, texte: (c.retirer ? '📋 Retirée de la liste : ' : '📋 Ajoutée à la liste : ') + c.nom + '.' } : echec(r, 'La liste n\'a pas changé');
    },
  },
  robot_ia_mode: {
    titre: 'Mettre l\'IA pilote du robot en auto ou à l\'arrêt', icone: '🎛️', risque: 'moyen',
    aide: 'champs : mode (« auto » ou « off »)',
    valider(c) {
      const m = /^(auto|marche|on|active|allume)/i.test(String(c.mode || '').trim()) ? 'auto' : /^(off|arret|arrêt|stop|eteint|éteint|coupe|pause)/i.test(String(c.mode || '').trim()) ? 'off' : '';
      return m ? { champs: { mode: m } } : { erreur: 'Dis-moi « auto » (elle décide seule sur les robots papier) ou « off » (elle s\'arrête).' };
    },
    resume: (c) => c.mode === 'auto' ? 'METTRE L\'IA PILOTE EN AUTO : elle reprend ses décisions sur les robots PAPIER (jamais l\'argent réel).' : 'METTRE L\'IA PILOTE À L\'ARRÊT : elle ne décide plus rien sur les robots tant que tu ne la remets pas en auto.',
    async executer(env, c, o) {
      const r = await o.appeler('/__bot/ia/mode', { method: 'POST', json: { mode: c.mode } });
      return r.ok ? { ok: true, texte: c.mode === 'auto' ? '🎛️ L\'IA pilote est en AUTO (robots papier).' : '🎛️ L\'IA pilote est à l\'ARRÊT.' } : echec(r, 'Le réglage n\'est pas passé');
    },
  },
  robot_ia_lancer: {
    titre: 'Lancer une décision de l\'IA pilote maintenant', icone: '⚡', risque: 'moyen',
    aide: 'aucun champ',
    valider() { return { champs: {} }; },
    resume: () => 'LANCER UNE DÉCISION de l\'IA pilote maintenant : elle regarde les robots PAPIER et peut changer leurs réglages pour un essai (réversible : « annuler l\'essai » remet les anciens réglages). Jamais l\'argent réel.',
    async executer(env, c, o) {
      const r = await o.appeler('/__bot/ia/tick', { method: 'POST', json: {} });
      return r.ok ? { ok: true, texte: '⚡ L\'IA pilote a pris sa décision : ' + compact(r, 500) } : echec(r, 'La décision n\'est pas partie');
    },
  },
  robot_ia_annuler: {
    titre: 'Annuler l\'essai en cours de l\'IA pilote', icone: '↩️', risque: 'moyen',
    aide: 'aucun champ',
    valider() { return { champs: {} }; },
    resume: () => 'ANNULER L\'ESSAI EN COURS de l\'IA pilote : les anciens réglages du robot papier concerné sont remis.',
    async executer(env, c, o) {
      const r = await o.appeler('/__bot/ia/annuler', { method: 'POST', json: {} });
      return r.ok ? { ok: true, texte: '↩️ L\'essai est annulé : les anciens réglages sont remis.' } : echec(r, r && r.reason === 'aucun_essai' ? 'Aucun essai n\'est en cours' : 'L\'essai n\'a pas été annulé');
    },
  },
};
export const ACTIONS_DROITS_PLUS = Object.keys(DROITS_PLUS);

/* ───────────────────────── LIRE PLUS ───────────────────────── */
export function resumeScan(r) {
  const l = Array.isArray(r && r.results) ? r.results : [];
  if (!l.length) return 'Le scan ne rend rien pour le moment.';
  return 'Scan de ' + (r.scanned || l.length) + ' paires (les plus intéressantes d\'abord) :\n' + l.slice(0, 8).map((x) => '• ' + nettoyer(x.symbol || x.pair || x.s, 20) + ' — ' + nettoyer(x.cat, 20) + (x.ci != null ? ' · compression ' + Math.round(x.ci * 100) / 100 : '') + (x.ci_delta != null ? ' · variation ' + Math.round(x.ci_delta * 100) / 100 : '')).join('\n');
}
export function resumeDemandes(r) {
  const l = Array.isArray(r && r.demandes) ? r.demandes : [];
  if (!l.length) return 'Aucune demande de démonstration reçue.';
  return l.length + ' demande(s) Rotaplan (les plus récentes d\'abord ; je ne montre pas les e-mails — ils sont dans la page admin) :\n' + l.slice(0, 10).map((d) => '• ' + nettoyer((d.prenom || '') + ' ' + (d.nom || ''), 60) + ' — ' + nettoyer(d.fonction, 40) + (d.fonction ? ' — ' : '') + nettoyer(d.etablissement, 60) + ' — ' + (d.ts ? jour(d.ts) : '?')).join('\n');
}

export function outilsLecturePlus(o) {
  const lire = async (chemin, f, quoi) => { const r = await o.appeler(chemin, { method: 'GET' }); return r.ok ? f(r) : quoi + ' est illisible (' + (r.reason || r.detail || r.status || 'erreur') + ').'; };
  const defs = [
    { name: 'robot_ia', description: 'L\'IA PILOTE du robot de trading : en auto ou à l\'arrêt, son dernier essai, ses dernières décisions. Lecture seule.', parameters: { type: 'object', properties: {}, required: [] } },
    { name: 'robot_flotte', description: 'Le classement des robots (le robot principal et les robots papier) : résultats réalisés. Lecture seule.', parameters: { type: 'object', properties: {}, required: [] } },
    { name: 'robot_bilan', description: 'Le bilan durable des robots (gains et pertes depuis le début). Lecture seule.', parameters: { type: 'object', properties: {}, required: [] } },
    { name: 'robot_marche', description: 'Les marchés en direct (prix, tendances) suivis par le robot. Lecture seule.', parameters: { type: 'object', properties: {}, required: [] } },
    { name: 'robot_liens', description: 'Les liens d\'analyse du robot. Lecture seule.', parameters: { type: 'object', properties: {}, required: [] } },
    { name: 'robot_scan', description: 'Le scan des 24 paires crypto : lesquelles sortent du calme, lesquelles sont comprimées. Lecture seule, ne change AUCUN réglage.', parameters: { type: 'object', properties: {}, required: [] } },
    { name: 'robot_analyse', description: 'L\'analyse technique (achat / vente) par crypto, calculée depuis les vraies bougies. Lecture seule.', parameters: { type: 'object', properties: { tf: { type: 'string', enum: ['1h', '4h', '1d'] } }, required: [] } },
    { name: 'demandes_rotaplan', description: 'Les demandes de démonstration Rotaplan reçues (prénom, nom, fonction, établissement, date — jamais l\'e-mail).', parameters: { type: 'object', properties: {}, required: [] } },
    { name: 'personnes_attendues', description: 'La liste des personnes attendues à l\'inscription.', parameters: { type: 'object', properties: {}, required: [] } },
    { name: 'personnes_bannies', description: 'Les personnes bannies (nom, identifiant du bannissement, date) — pour proposer de les autoriser de nouveau.', parameters: { type: 'object', properties: {}, required: [] } },
  ];
  const exe = {
    robot_ia: () => lire('/__bot/ia', (r) => 'IA pilote : ' + (r.mode === 'auto' ? 'EN AUTO' : r.mode === 'off' ? 'À L\'ARRÊT' : nettoyer(r.mode, 20)) + '. ' + compact({ enCours: r.enCours, derniereDecision: r.derniereDecision, dernierTick: r.dernierTick, dernier: r.dernier, journal: (r.journal || []).slice(0, 5) }, 1500), 'L\'IA pilote'),
    robot_flotte: () => lire('/__bot/fleet', (r) => 'Flotte : ' + compact(r.bots, 1800), 'La flotte'),
    robot_bilan: () => lire('/__bot/history', (r) => 'Bilan : ' + compact(r.bilan, 1800), 'Le bilan'),
    robot_marche: () => lire('/__bot/marche', (r) => 'Marchés : ' + compact(r, 1800), 'Les marchés'),
    robot_liens: () => lire('/__bot/liens', (r) => 'Liens du robot : ' + compact(r, 1800), 'Les liens'),
    robot_scan: () => lire('/__bot/scan', resumeScan, 'Le scan'),
    robot_analyse: (a) => lire('/__bot/analysis?tf=' + (['1h', '4h', '1d'].includes(a && a.tf) ? a.tf : '1h'), (r) => 'Analyse : ' + compact(r.results || r.analyses || r, 1800), 'L\'analyse'),
    demandes_rotaplan: () => lire('/__demandes', resumeDemandes, 'Les demandes'),
    personnes_attendues: () => lire('/__admin/attendus', (r) => { const l = Array.isArray(r.attendus) ? r.attendus : []; return l.length ? l.length + ' personne(s) attendue(s) : ' + l.slice(0, 30).map((x) => nettoyer(x.nom, 60)).join(', ') + '.' : 'Aucune personne attendue dans la liste.'; }, 'La liste des attendus'),
    personnes_bannies: () => lire('/__admin/bannis', (r) => { const l = Array.isArray(r.bannis) ? r.bannis : []; return l.length ? l.length + ' banni(s) :\n' + l.slice(0, 20).map((x) => '• ' + nettoyer(x.nom || x.uid, 60) + ' — identifiant du bannissement : ' + nettoyer(x.id, 120) + ' — le ' + jour(x.at)).join('\n') : 'Personne n\'est banni.'; }, 'La liste des bannis'),
  };
  return { defs, exe };
}

/** Une demande qui parle de comptes à supprimer, de bannis, d'attendus, de demandes, du robot en détail : les mains de Bee sont prises d'office. */
export const RE_DROITS_PLUS = /supprim\w*|retir\w*|lanc\w*|annul\w*|d[ée]cision|essai|banni\w*|d[ée]banni\w*|attend(?:u|s|re|ons)\w*|l[eè]ve\w* (?:le |son |ce )?ban\w*|demandes?\b|rotaplan|\bouvre\b.*\bcompte|valid\w* (?:le |son |un )?compte|\bscan\w*|march[ée]s?\b|flotte|analyse|bilan du robot|ia pilote|pilote/i;
