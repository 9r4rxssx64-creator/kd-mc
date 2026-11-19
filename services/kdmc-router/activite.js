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
  notif: '🔔 a reçu une notification',
};
export const LIM = { jourParCompte: 400, garde: 90 * 864e5, purgeMs: 36e5, detail: 200, question: 160, fil: 14 };
/* fenêtre anti-doublon par type : la même chose faite deux fois de suite ne s'ajoute pas (« ne se multiplie pas ») */
/* ce que le domaine note de lui-même à chaque page servie — compté à part de ce qu'une personne fait (plafond par classe) */
export const AUTOMATIQUES = ['visite', 'connexion', 'lieu', 'appareil'];
const DEDUP = { visite: 10 * 60e3, connexion: 30 * 60e3, lieu: 36e5, appareil: 36e5, question: 60e3, modif: 36e5, message: 0, contact: 0, notif: 60e3 };
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS activite (id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT, nom TEXT, ts INTEGER, type TEXT, app TEXT, detail TEXT, lieu TEXT, appareil TEXT)`,
  `CREATE INDEX IF NOT EXISTS act_uid ON activite (uid, ts)`,
  `CREATE INDEX IF NOT EXISTS act_ts ON activite (ts)`,
  /* 19.11 (Kevin : « j'ai reçu une facture Cloudflare, regarde qui consomme ») — MESURÉ (mesure-quotas, run 44544601627, 7 jours) : « qui a été actif ? » relisait
     TOUTE la table à chaque ouverture de la boîte admin (11,6 millions de lignes lues en 7 jours, 7 279 par appel : 64 % des lectures de tout le compte ; le 17.11 le
     plafond gratuit de 5 millions par jour a été dépassé). La dernière activité de chaque personne est donc RANGÉE à part, une ligne par personne. */
  `CREATE TABLE IF NOT EXISTS activite_dernier (uid TEXT PRIMARY KEY, nom TEXT, dernier INTEGER)`,
];
const prets = new WeakSet();
async function table(db) {
  if (prets.has(db)) return;
  await db.batch(SCHEMA.map((s) => db.prepare(s)));
  try { await db.prepare('ALTER TABLE activite ADD COLUMN appareil TEXT').run(); } catch { /* colonne déjà là */ }   // table créée avant l'ajout de l'appareil
  /* la table des dernières activités se remplit UNE fois depuis l'historique (elle est vide le jour où elle apparaît) */
  try { const v = await db.prepare('SELECT COUNT(*) AS n FROM activite_dernier').first();
    if (!v || !v.n) await db.prepare("INSERT OR IGNORE INTO activite_dernier (uid, nom, dernier) SELECT uid, MAX(nom), MAX(ts) FROM activite WHERE type != 'notif' GROUP BY uid").run();
  } catch { /* fail-open : « qui a été actif » sera vide plutôt que faux */ }
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
    /* 18.11 (capture de Kevin : « nouveau lieu » 3 fois et « s'est connecté » 3 fois à la même seconde pour la même personne) : une page lance plusieurs
       requêtes ENSEMBLE ; chacune lisait « pas encore noté » avant que l'autre n'écrive. Le contrôle du doublon et l'écriture se font donc en UNE instruction. */
    if (fen) {
      var w = await db.prepare('INSERT INTO activite (uid, nom, ts, type, app, detail, lieu, appareil) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM activite WHERE uid = ? AND type = ? AND app = ? AND detail = ? AND ts > ?)')
        .bind(ev.uid, propre(ev.nom, 60), now, ev.type, app, detail, propre(ev.lieu, 80), propre(ev.appareil, 90), ev.uid, ev.type, app, detail, now - fen).run();
      if (w && w.meta && w.meta.changes === 0) return 'doublon';
    } else await db.prepare('INSERT INTO activite (uid, nom, ts, type, app, detail, lieu, appareil) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(ev.uid, propre(ev.nom, 60), now, ev.type, app, detail, propre(ev.lieu, 80), propre(ev.appareil, 90)).run();
    /* une notification REÇUE n'est pas une action de la personne : elle ne la rend pas « active » */
    if (ev.type !== 'notif') await db.prepare("INSERT INTO activite_dernier (uid, nom, dernier) VALUES (?, ?, ?) ON CONFLICT(uid) DO UPDATE SET nom = CASE WHEN excluded.nom != '' THEN excluded.nom ELSE activite_dernier.nom END, dernier = MAX(activite_dernier.dernier, excluded.dernier)")
      .bind(ev.uid, propre(ev.nom, 60), now).run().catch(() => {});
    if (now - purgeLe > LIM.purgeMs) { purgeLe = now; await db.prepare('DELETE FROM activite WHERE ts < ?').bind(now - LIM.garde).run().catch(() => {}); await db.prepare('DELETE FROM activite_dernier WHERE dernier < ?').bind(now - LIM.garde).run().catch(() => {}); }
    return 'ajoute';
  } catch { return 'ignore'; }
}
export function _resetPurge() { purgeLe = 0; }

/** 18.11 (audit des tableaux de bord : « aucune trace des notifications envoyées ») : note qu'une notification est PARTIE vers une personne — son titre seulement,
    jamais son texte. Le nom est repris de la dernière ligne connue de cette personne. Ne lève JAMAIS : une panne ici n'empêche aucun envoi. */
export async function noterNotif(env, uid, titre, url, now) {
  try {
    if (!dispo(env) || !uid || !titre) return 'ignore';
    await table(env.CERCLE_DB);
    const d = await env.CERCLE_DB.prepare("SELECT nom FROM activite WHERE uid = ? AND COALESCE(nom, '') != '' ORDER BY ts DESC LIMIT 1").bind(String(uid)).first();
    let app = 'domaine'; try { app = new URL(String(url || '')).hostname || 'domaine'; } catch { app = 'domaine'; }
    return await noter(env, { uid: String(uid), nom: (d && d.nom) || '', type: 'notif', app, detail: titre }, now);
  } catch { return 'ignore'; }
}

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
  const r = await db.prepare('SELECT app, appareil, uid, MAX(ts) AS dernier, COUNT(*) AS n FROM activite WHERE ts > ? AND type != \'notif\' GROUP BY app, appareil, uid').bind(depuis).all();
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
/* une notification REÇUE n'est pas quelque chose que la personne a fait : elle ne la rend ni « active » ni « en alerte » (boîte), et ne fait pas « bouger » une app */
export async function actives(db, depuis, limite) {
  await table(db);
  /* une ligne par personne (activite_dernier) : au plus quelques dizaines de lignes lues, au lieu de toute la table */
  const r = await db.prepare('SELECT uid, nom, dernier FROM activite_dernier WHERE dernier > ? ORDER BY dernier DESC LIMIT ?').bind(depuis, limite || 20).all();
  return (r && r.results) || [];
}
/** Résumé d'une personne : compte par type, apps et pages les plus consultées, lieux, dernière question. */
export async function resume(db, uid, depuis) {
  await table(db);
  /* 19.11 : UNE lecture au lieu de deux — « appareil par appareil » se calcule ici, sur les mêmes lignes (la requête à part lisait 448 lignes par appel,
     3,5 millions en 7 jours). 300 lignes au plus : de quoi résumer 7 jours sans relire tout l'historique d'un compte très actif. */
  const tous = ((await db.prepare('SELECT type, app, detail, lieu, ts, appareil FROM activite WHERE uid = ? AND ts > ? ORDER BY ts DESC LIMIT 300').bind(uid, depuis).all()).results) || [];
  const parType = {}, apps = {}, pages = {}, lieux = new Set(), parApp_ = new Map();
  for (const e of tous) { if (!e.appareil) continue; const a = parApp_.get(e.appareil) || { appareil: e.appareil, n: 0, dernier: 0 }; a.n++; a.dernier = Math.max(a.dernier, e.ts); parApp_.set(e.appareil, a); }
  for (const e of tous) {
    parType[e.type] = (parType[e.type] || 0) + 1;
    if (e.type === 'visite') { apps[e.app] = (apps[e.app] || 0) + 1; const k = e.app + e.detail; pages[k] = (pages[k] || 0) + 1; }
    if (e.lieu) lieux.add(e.lieu);
  }
  const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
  const q = tous.find((e) => e.type === 'question');
  return { total: tous.length, parType, apps: top(apps, 5), pages: top(pages, 5), lieux: [...lieux].slice(0, 5), derniereQuestion: q ? { ts: q.ts, app: q.app, texte: q.detail } : null,
    appareils: [...parApp_.values()].sort((a, b) => b.dernier - a.dernier).slice(0, 6) };
}

/** Ce que la personne a fait, APPAREIL PAR APPAREIL : { appareil, n, dernier }, le plus récemment utilisé d'abord. */
export async function parAppareil(db, uid, depuis) {
  await table(db);
  const r = await db.prepare("SELECT appareil, COUNT(*) AS n, MAX(ts) AS dernier FROM activite WHERE uid = ? AND ts > ? AND appareil != '' AND appareil IS NOT NULL GROUP BY appareil ORDER BY dernier DESC LIMIT 6").bind(uid, depuis).all();
  return (r && r.results) || [];
}
/** « iPhone · iOS 18.0 · Safari 18 » → « iPhone · iOS 18.0 » : de quoi reconnaître l'appareil dans une ligne de fil. */
export const appareilCourt = (a) => String(a || '').split(' · ').slice(0, 2).join(' · ');
