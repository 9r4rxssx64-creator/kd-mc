/* LE FIL D'ACTIVITÉ PAR PERSONNE — « le même compte qui se connecte ne se multiplie pas, il s'ajoute dans sa fiche, remonte dans le fil »
 * (Kevin 4.10.2026 : « Affiche et organise intelligemment… Historique. Récupère infos+++, sites consultés, loc, modif, travail, questions, consultation, etc. »).
 *
 * UNE ligne par ÉVÉNEMENT dans la base D1 gratuite (jamais le KV : plafond d'écritures crevé chaque jour, leçon 394), RANGÉE PAR COMPTE :
 *   visite      une page consultée (app + chemin, sans paramètres)        lieu      un nouveau lieu de connexion
 *   connexion   une nouvelle session                                       appareil  un nouvel appareil
 *   question    une question posée à une IA du domaine (début du texte)    modif     une donnée enregistrée (progression, profil…)
 *   message     un message envoyé (Lingua, CMCteams)                       contact   un message écrit à l'admin
 * La boîte de l'admin en fait UNE carte par personne (la dernière activité la fait remonter), avec le fil et un résumé tiré de sa fiche.
 *
 * VIE PRIVÉE (conditions du domaine : durée limitée, admin seul) : 90 jours puis effacé ; jamais l'adresse IP ; une question n'est gardée que sur 160 caractères ;
 * un plafond par compte et par jour empêche qu'un robot ou une boucle remplisse la base. Tout est FAIL-OPEN : une panne d'écriture ne casse jamais une page. */
export const TYPES = {
  visite: '🌐 a consulté', connexion: '🔓 s\'est connecté', lieu: '📍 nouveau lieu', appareil: '📱 nouvel appareil',
  question: '❓ a posé une question', modif: '✏️ a enregistré', message: '💬 a écrit', contact: '✉️ a écrit à l\'admin',
};
export const LIM = { jourParCompte: 400, garde: 90 * 864e5, purgeMs: 36e5, detail: 200, question: 160, fil: 14 };
/* fenêtre anti-doublon par type : la même chose faite deux fois de suite ne s'ajoute pas (« ne se multiplie pas ») */
/* ce que le domaine note de lui-même à chaque page servie — compté à part de ce qu'une personne fait (plafond par classe) */
export const AUTOMATIQUES = ['visite', 'connexion', 'lieu', 'appareil'];
const DEDUP = { visite: 10 * 60e3, connexion: 30 * 60e3, lieu: 36e5, appareil: 36e5, question: 60e3, modif: 36e5, message: 0, contact: 0 };
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS activite (id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT, nom TEXT, ts INTEGER, type TEXT, app TEXT, detail TEXT, lieu TEXT, appareil TEXT)`,
  `CREATE INDEX IF NOT EXISTS act_uid ON activite (uid, ts)`,
  `CREATE INDEX IF NOT EXISTS act_ts ON activite (ts)`,
];
const prets = new WeakSet();
async function table(db) {
  if (prets.has(db)) return;
  await db.batch(SCHEMA.map((s) => db.prepare(s)));
  try { await db.prepare('ALTER TABLE activite ADD COLUMN appareil TEXT').run(); } catch { /* colonne déjà là */ }   // table créée avant l'ajout de l'appareil
  prets.add(db);
}
export const dispo = (env) => !!(env && env.CERCLE_DB && typeof env.CERCLE_DB.prepare === 'function');
const propre = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
let purgeLe = 0;

/** Note un événement. Rend 'ajoute' | 'doublon' | 'plafond' | 'ignore'. Ne lève JAMAIS. */
export async function noter(env, ev, now) {
  try {
    if (!dispo(env) || !ev || !ev.uid || !TYPES[ev.type]) return 'ignore';
    const db = env.CERCLE_DB; now = now || Date.now(); await table(db);
    const detail = propre(ev.detail, ev.type === 'question' ? LIM.question : LIM.detail), app = propre(ev.app, 60);
    const fen = DEDUP[ev.type] || 0;
    if (fen) {
      const d = await db.prepare('SELECT 1 AS o FROM activite WHERE uid = ? AND type = ? AND app = ? AND detail = ? AND ts > ? LIMIT 1').bind(ev.uid, ev.type, app, detail, now - fen).first();
      if (d) return 'doublon';
    }
    const j = new Date(now); j.setUTCHours(0, 0, 0, 0);
    /* 17.11 soir (robot verif-live-journal, run 44193027093 : la porte du journal répondait « plafond » sur 10 apps sur 10) : le compte admin avait ses 400 lignes
       du jour dès 04h09 UTC — 257 passages de robots d'affichage + 143 connexions / pages — et TOUT ce que Kevin a fait ensuite (17 h) a été jeté sans un mot.
       Le plafond se compte donc PAR CLASSE : ce que le domaine note tout seul (pages, connexions, lieux, appareils) ne peut plus étouffer ce qu'une personne
       fait (enregistrement, message, question) ; et les lignes d'un appareil de robot ne comptent que contre les robots. */
    const classe = AUTOMATIQUES.includes(ev.type) ? AUTOMATIQUES : Object.keys(TYPES).filter((t) => !AUTOMATIQUES.includes(t));
    const robot = estAppareilRobot(ev.appareil);
    const c = await db.prepare('SELECT COUNT(*) AS n FROM activite WHERE uid = ? AND ts >= ? AND type IN (' + classe.map(() => '?').join(',') + ') AND ' + (robot ? '' : 'NOT ') + '(' + ROBOT_SQL.map(() => "COALESCE(appareil, '') LIKE ?").join(' OR ') + ')')
      .bind(ev.uid, j.getTime(), ...classe, ...ROBOT_SQL).first();
    if (((c && c.n) || 0) >= LIM.jourParCompte) return 'plafond';
    await db.prepare('INSERT INTO activite (uid, nom, ts, type, app, detail, lieu, appareil) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(ev.uid, propre(ev.nom, 60), now, ev.type, app, detail, propre(ev.lieu, 80), propre(ev.appareil, 90)).run();
    if (now - purgeLe > LIM.purgeMs) { purgeLe = now; await db.prepare('DELETE FROM activite WHERE ts < ?').bind(now - LIM.garde).run().catch(() => {}); }
    return 'ajoute';
  } catch { return 'ignore'; }
}
export function _resetPurge() { purgeLe = 0; }

/** Le fil d'UNE personne, du plus ancien au plus récent (les `limite` derniers). */
export async function fil(db, uid, limite) {
  await table(db);
  const r = await db.prepare('SELECT ts, type, app, detail, lieu, appareil FROM activite WHERE uid = ? ORDER BY ts DESC, id DESC LIMIT ?').bind(uid, limite || LIM.fil).all();
  return ((r && r.results) || []).reverse();
}
/* ── LE FIL DE TOUT LE DOMAINE (Kevin 17.11 : « j'ai du mal à voir clairement les dernières infos, connexions, modifs, qui a fait quoi ou quand, de tout le domaine, chaque app ») ──
   Les mêmes lignes que les fiches, mais TOUTES PERSONNES CONFONDUES, de la plus récente à la plus ancienne, filtrables par type, par app et par personne.
   MESURÉ le 17.11 sur la vraie base : en 2 jours, 808 lignes sur le compte admin dont 616 écrites par les robots de vérification (navigateurs de test), contre 35 lignes
   pour les vraies personnes. Un robot n'est pas quelqu'un : ses lignes sont écartées ici (appareil de navigateur de test), et ne sont plus écrites à la source (worker.js). */
export const APPAREIL_ROBOT = /^(?:Linux · Linux · |Pixel 7 · Android 14 · Chrome |iPhone · iOS (?:10\.3|15\.0) · Safari 18|iPad · iOS 12\.2 · Safari 18)/;
/* la même liste pour la base (LIKE) : toute retouche se fait aux DEUX endroits (garde 9a/9c de activite.test.mjs) */
const ROBOT_SQL = ['Linux · Linux · %', 'Pixel 7 · Android 14 · Chrome %', 'iPhone · iOS 10.3 · Safari 18%', 'iPhone · iOS 15.0 · Safari 18%', 'iPad · iOS 12.2 · Safari 18%'];
export const estAppareilRobot = (appareil) => APPAREIL_ROBOT.test(String(appareil || ''));
export const TYPES_FIL = Object.keys(TYPES);
/** Le fil du domaine. o = { avant (ts exclusif), types [..], app, uid, sansUid (l'admin, pour « les autres »), robots (true = on les garde), limite ≤ 100 }. */
export async function filDomaine(db, o) {
  await table(db); o = o || {};
  const limite = Math.max(1, Math.min(100, Number(o.limite) || 60));
  const types = (Array.isArray(o.types) ? o.types : []).filter((t) => TYPES[t]);
  const cond = ['ts < ?'], args = [Number(o.avant) > 0 ? Number(o.avant) : 9e15];
  if (types.length) { cond.push('type IN (' + types.map(() => '?').join(',') + ')'); args.push(...types); }
  if (o.app) { const court = String(o.app).replace(/\.kd-mc\.com$/, ''); cond.push('(app = ? OR app = ? OR app = ?)'); args.push(String(o.app), court, court + '.kd-mc.com'); }
  if (o.uid) { cond.push('uid = ?'); args.push(String(o.uid)); }
  if (o.sansUid) { cond.push('uid != ?'); args.push(String(o.sansUid)); }
  /* les robots sont écartés DANS la requête (ils font les trois quarts des lignes : les écarter après coup viderait la page) */
  if (!o.robots) { cond.push('NOT (' + ROBOT_SQL.map(() => "COALESCE(appareil, '') LIKE ?").join(' OR ') + ')'); args.push(...ROBOT_SQL); }
  const r = await db.prepare('SELECT id, ts, uid, nom, type, app, detail, lieu, appareil FROM activite WHERE ' + cond.join(' AND ') + ' ORDER BY ts DESC, id DESC LIMIT ?').bind(...args, limite + 1).all();
  const lignes = (r && r.results) || [];
  const out = lignes.slice(0, limite);
  return { lignes: out, suite: lignes.length > limite ? out[out.length - 1].ts : 0 };
}
/** Chaque app du domaine : sa dernière activité, combien de lignes et de personnes depuis `depuis` (robots écartés). */
export async function parApp(db, depuis) {
  await table(db);
  const r = await db.prepare('SELECT app, appareil, uid, MAX(ts) AS dernier, COUNT(*) AS n FROM activite WHERE ts > ? GROUP BY app, appareil, uid').bind(depuis).all();
  const m = new Map();
  for (const l of (r && r.results) || []) {
    if (estAppareilRobot(l.appareil)) continue;
    const cle = String(l.app || 'domaine').replace(/\.kd-mc\.com$/, '') || 'domaine';
    const e = m.get(cle) || { app: cle, dernier: 0, n: 0, uids: new Set() };
    e.dernier = Math.max(e.dernier, l.dernier); e.n += l.n; e.uids.add(l.uid); m.set(cle, e);
  }
  return [...m.values()].map((e) => ({ app: e.app, dernier: e.dernier, n: e.n, personnes: e.uids.size })).sort((x, y) => y.dernier - x.dernier);
}
/** Les personnes actives depuis `depuis` : { uid, nom, dernier, n }, la plus récente d'abord. */
export async function actives(db, depuis, limite) {
  await table(db);
  const r = await db.prepare('SELECT uid, MAX(nom) AS nom, MAX(ts) AS dernier, COUNT(*) AS n FROM activite WHERE ts > ? GROUP BY uid ORDER BY dernier DESC LIMIT ?').bind(depuis, limite || 20).all();
  return (r && r.results) || [];
}
/** Résumé d'une personne : compte par type, apps et pages les plus consultées, lieux, dernière question. */
export async function resume(db, uid, depuis) {
  await table(db);
  const tous = ((await db.prepare('SELECT type, app, detail, lieu, ts FROM activite WHERE uid = ? AND ts > ? ORDER BY ts DESC LIMIT 500').bind(uid, depuis).all()).results) || [];
  const parType = {}, apps = {}, pages = {}, lieux = new Set();
  for (const e of tous) {
    parType[e.type] = (parType[e.type] || 0) + 1;
    if (e.type === 'visite') { apps[e.app] = (apps[e.app] || 0) + 1; const k = e.app + e.detail; pages[k] = (pages[k] || 0) + 1; }
    if (e.lieu) lieux.add(e.lieu);
  }
  const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
  const q = tous.find((e) => e.type === 'question');
  return { total: tous.length, parType, apps: top(apps, 5), pages: top(pages, 5), lieux: [...lieux].slice(0, 5), derniereQuestion: q ? { ts: q.ts, app: q.app, texte: q.detail } : null };
}

/** Ce que la personne a fait, APPAREIL PAR APPAREIL : { appareil, n, dernier }, le plus récemment utilisé d'abord. */
export async function parAppareil(db, uid, depuis) {
  await table(db);
  const r = await db.prepare("SELECT appareil, COUNT(*) AS n, MAX(ts) AS dernier FROM activite WHERE uid = ? AND ts > ? AND appareil != '' AND appareil IS NOT NULL GROUP BY appareil ORDER BY dernier DESC LIMIT 6").bind(uid, depuis).all();
  return (r && r.results) || [];
}
/** « iPhone · iOS 18.0 · Safari 18 » → « iPhone · iOS 18.0 » : de quoi reconnaître l'appareil dans une ligne de fil. */
export const appareilCourt = (a) => String(a || '').split(' · ').slice(0, 2).join(' · ');
