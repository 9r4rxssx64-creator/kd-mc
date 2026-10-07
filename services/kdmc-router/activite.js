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
    const c = await db.prepare('SELECT COUNT(*) AS n FROM activite WHERE uid = ? AND ts >= ?').bind(ev.uid, j.getTime()).first();
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
