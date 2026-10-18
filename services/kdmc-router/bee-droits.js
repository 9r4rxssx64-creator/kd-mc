/* LES DROITS DE BEE : TOUT CE QUE KEVIN PEUT FAIRE SUR SON DOMAINE, ELLE PEUT LE PROPOSER — ET C'EST SON BOUTON ✅ QUI DÉCIDE
 * (Kevin 13.10.2026 : « Donne-lui tous les droits pour moi »).
 *
 * Le principe de bee-agir.js ne change PAS : l'IA PROPOSE, le serveur contrôle les champs et fabrique lui-même le résumé que Kevin lit,
 * la proposition est signée (5 min, une seule fois), Kevin touche ✅, et le domaine exécute avec SA session admin prouvée (Face ID ou code).
 * « Tous les droits » veut dire : toutes les portes admin que Kevin utilise déjà à la main pour GÉRER son domaine —
 *   · fermer / rouvrir des apps pour tout le monde, ou pour une ou plusieurs personnes ;
 *   · régler le périmètre d'une personne (tout le domaine public ou seulement quelques apps, rôles) ;
 *   · effacer le code oublié d'une personne, la déconnecter de tous ses appareils ;
 *   · redémarrer le robot (l'arrêter existait déjà) ;
 *   · LIRE : les comptes, les apps fermées, le journal du domaine.
 *
 * CE QUI RESTE FERMÉ, et pourquoi (ce sont des règles de Kevin, pas un refus) :
 *   · le coffre et les clés (/__fin/vault, secrets) : « une clé en clair, jamais » — un secret lu par Bee partirait à une IA et dans le fil de conversation ;
 *   · le code admin et la connexion admin : « le code admin ne s'écrit nulle part » ;
 *   · créer un compte avec un code (/__admin/compte-invite) : le code taperait dans la conversation, donc serait écrit ; reste au formulaire de l'admin ;
 *   · l'ARGENT RÉEL du robot (/__bot/reel, /__bot/config) : le bouton d'une IA ne passe pas du papier au réel ;
 *   · publier l'arbre (/__arbre/*) : cette porte reste fermée ; Bee ne modifie l'arbre que par SA propre voie (bee-arbre-ecrire.js : ajouter / compléter une fiche champ par champ, copie avant, jamais de suppression) ;
 *   · déployer, modifier du code : le domaine n'a aucun jeton GitHub — Bee écrit la consigne pour Claude Code.
 * (16.10 : Kevin a ouvert « lire plus », « gérer les comptes » et « régler le robot » — voir bee-droits-plus.js ; la liste ci-dessus des portes FERMÉES est inchangée, sauf la création de compte avec un code qui reste fermée.)
 * Ces portes restent hors de PORTES_BEE (worker.js) et le test les nomme une à une : en ouvrir une est une décision de Kevin, pas un oubli.
 * node services/kdmc-router/bee-droits.test.mjs */

const nettoyer = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const norm = (t) => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[-_'’.,;:!?()«»"]/g, ' ').replace(/\s+/g, ' ').trim();
const UID_ADMIN = 'kdmc_admin';
const RE_UID = /^[\p{L}\p{N}_.:@-]{2,80}$/u;
const RE_APP = /^[a-z0-9-]{2,30}$/;

/** Une liste d'apps : tableau ou « lingua, arbre », sans doublon, au plus 20. */
function listeApps(v) {
  const brut = Array.isArray(v) ? v : String(v == null ? '' : v).split(/[,;\s]+/);
  return [...new Set(brut.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean))].slice(0, 20);
}
const modeDe = (v) => (/^(fermer|ferme|bloquer|bloque)$/i.test(String(v || '').trim()) ? 'fermer' : /^(rouvrir|rouvre|ouvrir|ouvre|debloquer|débloquer|debloque|débloque)$/i.test(String(v || '').trim()) ? 'rouvrir' : '');
const echec = (r, quoi) => ({ ok: false, texte: quoi + ' (' + (r && (r.reason || r.status) || 'erreur') + ').' });
const nomAffiche = (c) => '« ' + c.nom + ' »';

/** Retrouve la personne par son identifiant : le NOM vient du domaine, jamais de l'IA (le résumé que Kevin lit doit être vrai). */
async function personne(c, ctx) {
  const uid = nettoyer(c.uid, 80);
  if (!RE_UID.test(uid)) return { erreur: 'Il me manque l\'identifiant de la personne : cherche-la d\'abord avec comptes_domaine.' };
  if (uid === UID_ADMIN) return { erreur: 'C\'est ton propre compte : il n\'est jamais fermé, effacé ni déconnecté par moi.' };
  if (!ctx || typeof ctx.appeler !== 'function') return { erreur: 'Je ne peux pas vérifier cette personne pour le moment.' };
  const r = await ctx.appeler('/__admin/acces?uid=' + encodeURIComponent(uid), { method: 'GET' });
  if (!r.ok || !r.name) return { erreur: 'Je ne connais aucun compte avec cet identifiant (' + uid + ').' };
  return { uid, nom: nettoyer(r.name, 90), apps: Array.isArray(r.apps) ? r.apps : [] };
}

export const DROITS = {
  apps_fermer: {
    titre: 'Fermer ou rouvrir des apps pour tout le monde', icone: '🚪', risque: 'eleve',
    aide: 'champs : apps (liste, ex. « lingua, arbre »), mode (« fermer » ou « rouvrir ») — pour TOUT LE MONDE, toi tu entres toujours',
    valider(c) {
      const apps = listeApps(c.apps), mode = modeDe(c.mode);
      if (!apps.length) return { erreur: 'Dis-moi quelle(s) app(s) (par exemple : lingua, arbre).' };
      if (apps.some((a) => !RE_APP.test(a))) return { erreur: 'Un nom d\'app n\'est pas valide : utilise les noms de apps_du_domaine.' };
      if (!mode) return { erreur: 'Dis-moi si c\'est « fermer » ou « rouvrir ».' };
      return { champs: { apps, mode } };
    },
    resume: (c) => c.mode === 'fermer'
      ? 'FERMER pour tout le monde : ' + c.apps.join(', ') + '. Personne d\'autre que toi ne pourra les ouvrir, jusqu\'à ce que tu les rouvres.'
      : 'ROUVRIR pour tout le monde : ' + c.apps.join(', ') + '.',
    async executer(env, c, o) {
      const g = await o.appeler('/__admin/apps-fermees', { method: 'GET' });
      if (!g.ok) return echec(g, 'Je n\'arrive pas à lire les apps fermées');
      const connues = new Set(g.apps || []);
      const inconnues = c.apps.filter((a) => !connues.has(a));
      if (inconnues.length) return { ok: false, texte: 'Je ne connais pas : ' + inconnues.join(', ') + '. (Le portail ne se ferme jamais.) Apps possibles : ' + [...connues].join(', ') + '.' };
      const liste = new Set(g.fermees || []);
      for (const a of c.apps) { if (c.mode === 'fermer') liste.add(a); else liste.delete(a); }
      const r = await o.appeler('/__admin/apps-fermees', { method: 'POST', json: { apps: [...liste] } });
      if (!r.ok) return echec(r, 'Le changement n\'est pas passé');
      const f = Array.isArray(r.fermees) ? r.fermees : [...liste];
      return { ok: true, texte: (c.mode === 'fermer' ? '🚪 Fermé pour tout le monde : ' : '🔓 Rouvert pour tout le monde : ') + c.apps.join(', ') + '. Fermées en ce moment : ' + (f.length ? f.join(', ') : 'aucune') + '.' };
    },
  },
  apps_fermer_personne: {
    titre: 'Fermer ou rouvrir des apps à une personne', icone: '🔒', risque: 'eleve',
    aide: 'champs : uid (l\'identifiant, cherche-le avec comptes_domaine), apps (liste), mode (« fermer » ou « rouvrir »)',
    valider(c) {
      const apps = listeApps(c.apps), mode = modeDe(c.mode);
      if (!apps.length || apps.some((a) => !RE_APP.test(a))) return { erreur: 'Dis-moi quelle(s) app(s) (par exemple : lingua, arbre).' };
      if (!mode) return { erreur: 'Dis-moi si c\'est « fermer » ou « rouvrir ».' };
      return { champs: { uid: nettoyer(c.uid, 80), apps, mode } };
    },
    enrichir: async (c, ctx) => { const p = await personne(c, ctx); return p.erreur ? p : { champs: Object.assign({}, c, { nom: p.nom }) }; },
    resume: (c) => (c.mode === 'fermer' ? 'FERMER à ' : 'ROUVRIR à ') + nomAffiche(c) + ' : ' + c.apps.join(', ') + '. Ses autres réglages ne changent pas.',
    async executer(env, c, o) {
      const r = await o.appeler('/__admin/acces-lot', { method: 'POST', json: { uids: [c.uid], apps: c.apps, action: c.mode } });
      if (!r.ok) return echec(r, 'Le changement n\'est pas passé');
      if (!Array.isArray(r.faits) || !r.faits.includes(c.uid)) return { ok: false, texte: 'Rien n\'a changé pour ' + c.nom + (r.admin && r.admin.length ? ' (un compte admin n\'est jamais fermé).' : '.') };
      return { ok: true, texte: (c.mode === 'fermer' ? '🔒 Fermé à ' : '🔓 Rouvert à ') + c.nom + ' : ' + c.apps.join(', ') + '.' };
    },
  },
  perimetre_personne: {
    titre: 'Régler ce qu\'une personne peut ouvrir', icone: '🧭', risque: 'eleve',
    aide: 'champs : uid, portee (« domaine » = tout le domaine public, ou « app » = seulement les apps de acces), acces (liste d\'apps, obligatoire si portee « app »)',
    valider(c) {
      const portee = /^app/i.test(String(c.portee || '')) ? 'app' : /^domaine/i.test(String(c.portee || '')) ? 'domaine' : '';
      if (!portee) return { erreur: 'Dis-moi la portée : « domaine » (tout le domaine public) ou « app » (seulement quelques apps).' };
      const acces = listeApps(c.acces);
      if (acces.some((a) => !RE_APP.test(a))) return { erreur: 'Un nom d\'app n\'est pas valide.' };
      if (portee === 'app' && !acces.length) return { erreur: 'Pour « app », dis-moi lesquelles (sinon la personne n\'aurait accès à rien).' };
      return { champs: { uid: nettoyer(c.uid, 80), portee, acces } };
    },
    enrichir: async (c, ctx) => { const p = await personne(c, ctx); return p.erreur ? p : { champs: Object.assign({}, c, { nom: p.nom }) }; },
    resume: (c) => 'RÉGLER ' + nomAffiche(c) + ' : ' + (c.portee === 'app' ? 'seulement ' + c.acces.join(', ') + ' (rien d\'autre)' : 'tout le domaine public' + (c.acces.length ? ' (+ ' + c.acces.join(', ') + ')' : '')) + '.',
    async executer(env, c, o) {
      const json = { uid: c.uid, portee: c.portee, acces: c.acces };
      const r = await o.appeler('/__admin/acces', { method: 'POST', json });
      if (!r.ok) return echec(r, 'Le réglage n\'est pas passé');
      return { ok: true, texte: '🧭 Réglé pour ' + c.nom + ' : ' + (r.portee === 'app' ? 'seulement ' + (r.acces || []).join(', ') : 'tout le domaine public') + '.' };
    },
  },
  code_oublie: {
    titre: 'Effacer le code oublié d\'une personne', icone: '🗝️', risque: 'moyen',
    aide: 'champs : uid (l\'identifiant, cherche-le avec comptes_domaine) — la personne en choisira un nouveau à sa prochaine connexion',
    valider(c) { return { champs: { uid: nettoyer(c.uid, 80) } }; },
    enrichir: async (c, ctx) => { const p = await personne(c, ctx); return p.erreur ? p : { champs: Object.assign({}, c, { nom: p.nom }) }; },
    resume: (c) => 'EFFACER le code de ' + nomAffiche(c) + '. Son compte et ses données restent ; elle ou il en choisira un nouveau à sa prochaine connexion. (Je ne vois et n\'écris jamais aucun code.)',
    async executer(env, c, o) {
      const r = await o.appeler('/__admin/code', { method: 'POST', json: { uid: c.uid } });
      return r.ok ? { ok: true, texte: '🗝️ Le code de ' + c.nom + ' est effacé : un nouveau sera demandé à sa prochaine connexion.' } : echec(r, 'Le code n\'a pas été effacé');
    },
  },
  deconnecter_partout: {
    titre: 'Déconnecter une personne de tous ses appareils', icone: '📵', risque: 'moyen',
    aide: 'champs : uid (l\'identifiant, cherche-le avec comptes_domaine)',
    valider(c) { return { champs: { uid: nettoyer(c.uid, 80) } }; },
    enrichir: async (c, ctx) => { const p = await personne(c, ctx); return p.erreur ? p : { champs: Object.assign({}, c, { nom: p.nom }) }; },
    resume: (c) => 'DÉCONNECTER ' + nomAffiche(c) + ' de tous ses appareils. Son compte reste intact : elle ou il se reconnecte avec son code ou Face ID.',
    async executer(env, c, o) {
      const r = await o.appeler('/__admin/revoke', { method: 'POST', json: { uid: c.uid } });
      return r.ok ? { ok: true, texte: '📵 ' + c.nom + ' est déconnecté(e) de tous ses appareils.' } : echec(r, 'La déconnexion n\'est pas passée');
    },
  },
  bot_demarrer: {
    titre: 'Redémarrer le robot de trading', icone: '▶️', risque: 'eleve',
    aide: 'aucun champ (retire le coupe-circuit ; le mode réel / papier ne change PAS)',
    valider() { return { champs: {} }; },
    resume: () => 'REDÉMARRER le robot de trading : je retire le coupe-circuit et il se relance. Il pourra de nouveau passer des ordres selon son réglage actuel (je ne change jamais son mode papier / réel).',
    async executer(env, c, o) {
      const r = await o.appeler('/__bot/start', { method: 'POST', json: {} });
      return r.ok ? { ok: true, texte: '▶️ Le robot est relancé (son réglage n\'a pas bougé).' } : echec(r, 'Je n\'ai pas pu le relancer');
    },
  },
};
export const ACTIONS_DROITS = Object.keys(DROITS);

/* ───────────────────────── les LECTURES qui permettent de proposer sans deviner ───────────────────────── */
const jour = (ms) => { try { return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Monaco', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(ms)); } catch (_) { return '?'; } };

/** Comptes du domaine : uniquement ce qui sert à agir (identifiant, nom, portée, fermetures, dernière visite) — jamais un code, une empreinte, un numéro, un appareil. */
export function resumeComptes(r, recherche) {
  const tous = Array.isArray(r && r.accounts) ? r.accounts : [];
  const mots = norm(recherche).split(' ').filter(Boolean);
  const bons = mots.length ? tous.filter((a) => { const t = norm((a.name || '') + ' ' + (a.uid || '')); return mots.every((m) => t.includes(m)); }) : tous;
  if (!bons.length) return 'Aucun compte' + (mots.length ? ' ne correspond à « ' + nettoyer(recherche, 40) + ' »' : '') + ' (le domaine en compte ' + tous.length + ').';
  const L = bons.slice(0, 12).map((a) => '• ' + nettoyer(a.name || '(sans nom)', 60) + ' — identifiant : ' + nettoyer(a.uid, 80) + ' — ' + (a.portee === 'app' ? 'seulement : ' + (a.acces || []).join(', ') : 'tout le domaine public')
    + ((a.bloque || []).length ? ' — fermé : ' + a.bloque.join(', ') : '') + ((a.roles || []).length ? ' — rôles : ' + a.roles.join(', ') : '') + (a.last_seen ? ' — vu le ' + jour(a.last_seen) : ''));
  return bons.length + ' compte(s) sur ' + tous.length + (bons.length > 12 ? ' (12 premiers)' : '') + ' :\n' + L.join('\n');
}

const CLES_JOURNAL = ['ev', 'uid', 'detail', 'apps', 'ok'];
/** Journal du domaine : l'événement, la personne, le détail — jamais l'adresse IP, l'appareil ni le lieu. */
export function resumeJournal(r, n) {
  const log = Array.isArray(r && r.log) ? r.log : [];
  if (!log.length) return 'Le journal est vide.';
  const k = Math.max(1, Math.min(15, parseInt(n, 10) || 10));
  return 'Les ' + Math.min(k, log.length) + ' derniers événements du domaine :\n' + log.slice(0, k).map((e) => '• ' + jour(e.ts) + ' — ' + CLES_JOURNAL.filter((c) => e[c] != null && e[c] !== '').map((c) => c + ' : ' + nettoyer(Array.isArray(e[c]) ? e[c].join(',') : e[c], 90)).join(' ; ')).join('\n');
}

export function outilsLectureDroits(o) {
  const defs = [
    { name: 'comptes_domaine', description: 'Les comptes du domaine (nom, identifiant, ce qu\'ils peuvent ouvrir, ce qui leur est fermé, dernière visite). À utiliser pour trouver l\'identifiant d\'une personne avant de proposer une action sur elle, ou pour « qui a un compte ? ».',
      parameters: { type: 'object', properties: { recherche: { type: 'string', description: 'une partie du nom (facultatif)' } }, required: [] } },
    { name: 'apps_fermees', description: 'Les apps du domaine et celles qui sont fermées pour tout le monde en ce moment.', parameters: { type: 'object', properties: {}, required: [] } },
    { name: 'journal_domaine', description: 'Les derniers événements du domaine (connexions, changements de périmètre, fermetures, robot…), sans adresse IP ni appareil.',
      parameters: { type: 'object', properties: { n: { type: 'integer', minimum: 1, maximum: 15 } }, required: [] } },
  ];
  const exe = {
    comptes_domaine: async (a) => {
      const r = await o.appeler('/__admin/accounts?limit=500', { method: 'GET' });
      return r.ok ? resumeComptes(r, a && a.recherche) : 'Les comptes sont illisibles (' + (r.reason || r.status || 'erreur') + ').';
    },
    apps_fermees: async () => {
      const r = await o.appeler('/__admin/apps-fermees', { method: 'GET' });
      if (!r.ok) return 'Les apps fermées sont illisibles (' + (r.reason || r.status || 'erreur') + ').';
      const f = Array.isArray(r.fermees) ? r.fermees : [];
      return 'Fermées pour tout le monde : ' + (f.length ? f.join(', ') : 'aucune') + '. Apps du domaine : ' + (Array.isArray(r.apps) ? r.apps.join(', ') : '?') + '.';
    },
    journal_domaine: async (a) => {
      const r = await o.appeler('/__admin/audit', { method: 'GET' });
      return r.ok ? resumeJournal(r, a && a.n) : 'Le journal est illisible (' + (r.reason || r.status || 'erreur') + ').';
    },
  };
  return { defs, exe };
}

/** Une demande qui parle de gérer le domaine : les mains de Bee sont prises d'office. */
export const RE_DROITS = /\blimit\w*|restrein\w*|autoris\w*|interdi\w*|\bferme\w*|rouvr\w*|\bouvre\b|bloqu\w*|d[ée]bloqu\w*|\bacc[eè]s\b|p[ée]rim[eè]tre|\bdroits?\b|\bcomptes?\b|d[ée]connect\w*|connexions?|journal|code (?:oubli|perdu|effac)|effac\w* (?:le |son |mon )?code|supprim\w* (?:le |son |mon )?code|r[ée]initialis\w*|oubli[ée] (?:son|mon|le) code|d[ée]marre|relance|red[ée]marre|qui (?:a (?:acc[eè]s|des droits|le droit|essay\w*|tent\w*|[ée]t[ée] (?:banni|bloqu\w*)|un compte|ouvert un compte)|s'est|est connect\w*)|qui peut/i;
