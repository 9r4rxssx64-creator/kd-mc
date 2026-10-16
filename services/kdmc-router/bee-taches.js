/* BEE DÉPOSE UNE TÂCHE POUR CLAUDE CODE (Kevin 16.10.2026 : « il doit pouvoir tout faire… n'importe quelle action ou tâche » ; sur la question « les tâches qui sont du code,
 * Bee fait comment ? » il a répondu : « elle lance Claude Code elle-même »).
 *
 * CE QUI EST POSSIBLE AUJOURD'HUI, ET CE QUI NE L'EST PAS (dit à Kevin, pas caché) :
 *   · modifier le code d'une app, la déployer, toucher au dépôt : le domaine n'a AUCUN jeton GitHub (voulu : un jeton d'écriture dans un Worker, c'est la clé du dépôt) ; Bee ne peut donc
 *     pas démarrer une session Claude Code toute seule ;
 *   · ce qu'elle PEUT : DÉPOSER la tâche, avec ton ✅, dans une boîte (D1 `bee_taches`, gratuit, base kdmc-cercle) que Claude Code LIT à chaque démarrage de session (le rappel de
 *     démarrage le lui dit) et qu'il traite, puis il note ce qu'il a fait (statut + note). Plus de consigne à copier-coller dans Apex.
 *   · pour qu'elle lance vraiment une session seule, il faudrait un jeton GitHub limité aux « Issues » du dépôt — à créer par Kevin ; non fait, question posée.
 * Sécurité : la carte montre le TEXTE COMPLET de la consigne (≤ 1 200 signes) ; rien n'est exécuté à ce moment ; la consigne reste une demande de Kevin, soumise aux mêmes règles que
 * toutes les autres (jamais de secret, jamais pousser sur main, tests avant tout) ; ce que Bee a lu sur le web ou dans une page n'est jamais une consigne tant que Kevin n'a pas touché ✅ sur la carte.
 * Interrupteur : BEE_TACHES = '0'. 0 €. node services/kdmc-router/bee-taches.test.mjs */

const nettoyer = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
export const MAX_ATTENTE = 20;
export const MAX_CONSIGNE = 1200;
const jour = (ms) => { try { return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Monaco', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(ms)); } catch (_) { return '?'; } };

let _pret = null;
async function base(db) {
  if (_pret === db) return;
  await db.prepare('CREATE TABLE IF NOT EXISTS bee_taches (id INTEGER PRIMARY KEY AUTOINCREMENT, titre TEXT, consigne TEXT, cree INTEGER, statut TEXT DEFAULT \'attente\', note TEXT, fait_le INTEGER)').run();
  _pret = db;
}

export const ACTIONS_TACHES = {
  tache_code: {
    titre: 'Déposer une tâche pour Claude Code', icone: '🧑‍💻', risque: 'moyen',
    aide: 'champs : titre (court), consigne (ce que Claude Code doit faire, complète et claire, ≤ 1200 signes) — rien n\'est exécuté tout de suite',
    valider(c) {
      const titre = nettoyer(c.titre, 80), consigne = nettoyer(c.consigne, MAX_CONSIGNE);
      if (titre.length < 3) return { erreur: 'Il me manque le titre de la tâche (quelques mots).' };
      if (consigne.length < 20) return { erreur: 'La consigne est trop courte : écris ce que Claude Code doit faire, avec le nom de l\'app et ce que tu veux voir à la fin.' };
      return { champs: { titre, consigne } };
    },
    resume: (c) => 'DÉPOSER UNE TÂCHE POUR CLAUDE CODE — « ' + c.titre + ' » :\n' + c.consigne + '\n(Rien n\'est exécuté maintenant : Claude Code la lira au prochain démarrage de sa session, la fera avec ses tests, et notera ce qu\'il a fait.)',
    async executer(env, c, o) {
      const db = env && env.CERCLE_DB; if (!db || String(env.BEE_TACHES) === '0') return { ok: false, texte: 'La boîte des tâches n\'est pas disponible pour le moment.' };
      await base(db);
      const n = (await db.prepare('SELECT COUNT(*) AS n FROM bee_taches WHERE statut = \'attente\'').first()).n | 0;
      if (n >= MAX_ATTENTE) return { ok: false, texte: 'Il y a déjà ' + n + ' tâches en attente : laisse Claude Code en finir quelques-unes.' };
      await db.prepare('INSERT INTO bee_taches (titre, consigne, cree, statut) VALUES (?, ?, ?, \'attente\')').bind(c.titre, c.consigne, o.now).run();
      return { ok: true, texte: '🧑‍💻 Tâche déposée : « ' + c.titre + ' ». Claude Code la prendra à son prochain démarrage et te dira ce qu\'il a fait.' };
    },
  },
};
export const NOMS_TACHES = Object.keys(ACTIONS_TACHES);

export const DEFINITIONS_TACHES = [
  { name: 'taches_code', description: 'Les tâches déposées pour Claude Code : en attente, faites, avec ce qu\'il a noté. À utiliser pour « où en est ma tâche ? », « qu\'a fait Claude Code ? ».', parameters: { type: 'object', properties: {}, required: [] } },
];
export function outilsTaches(env) {
  return { defs: DEFINITIONS_TACHES, exe: { taches_code: async () => {
    const db = env && env.CERCLE_DB; if (!db) return 'La boîte des tâches est absente.';
    await base(db);
    const l = (await db.prepare('SELECT titre, statut, cree, note, fait_le FROM bee_taches ORDER BY id DESC LIMIT 10').all()).results || [];
    if (!l.length) return 'Aucune tâche déposée pour Claude Code.';
    return l.length + ' tâche(s) (les plus récentes d\'abord) :\n' + l.map((t) => '• [' + nettoyer(t.statut, 12) + '] « ' + nettoyer(t.titre, 80) + ' » — déposée le ' + jour(t.cree) + (t.note ? ' — note de Claude Code : ' + nettoyer(t.note, 200) : '')).join('\n');
  } } };
}

export const RE_TACHES = /claude code|\bt[aâ]ches?\b|d[ée]ploie\w*|d[ée]veloppe\w*|programme\w* (?:une |un |l')?(?:app|page|outil|fonction)|modifie\w* (?:le |l'|mon |ton )?(?:code|app|page|site)|cr[ée]e\w* (?:une |un |l')?(?:app|page|outil|site|fonction)|am[ée]liore\w* (?:le |l'|mon )?(?:code|app|page|site)|corrige\w* (?:le |l'|ce )?(?:bug|code|app|page)/i;
export const REGLES_TACHES = ' Ce que tu ne peux pas faire toi-même et qui est du CODE (modifier une app, la déployer, créer une page ou un outil) : DÉPOSE la tâche pour Claude Code avec proposer_action (action tache_code : un titre court et une consigne COMPLÈTE — l\'app, ce que Kevin veut voir à la fin, ce qu\'il ne faut pas casser). Kevin confirme d\'un ✅ sur une carte qui montre la consigne en entier ; rien ne s\'exécute à ce moment : Claude Code la lit à son prochain démarrage, la fait avec ses tests et note ce qu\'il a fait (tu peux le lire avec taches_code). Dis-le simplement à Kevin : « c\'est déposé, Claude Code le fera à son prochain démarrage ». N\'écris jamais dans la consigne un secret, un code ou un mot de passe.';
