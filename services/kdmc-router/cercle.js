/* ═══ LE CERCLE LINGUA — invitations, amis, présence, messages, cadeaux, quêtes à deux ═══
 *
 * Kevin, 2.10.2026 : « qu'on puisse envoyer un lien d'invitation… il fera partie du cercle d'amis de la
 * personne qui a envoyé le lien… qu'on puisse s'envoyer des cadeaux, des récompenses… des petits messages,
 * des encouragements… dans mon compte admin je veux voir toutes les personnes connectées… chaque personne
 * voit les connectés de SON cercle uniquement… ils peuvent voir quand je suis connecté et m'envoyer un
 * message même si je ne suis pas connecté… je reçois une notification… je reste anonyme. »
 *
 * OÙ C'EST RANGÉ : base D1 gratuite `kdmc-cercle` (100 000 écritures/jour), JAMAIS le KV (1 000/jour,
 * saturé le 27.09 et le 2.10). Les tables se créent seules au premier appel.
 *
 * QUI EST QUI : la session du domaine (cookie, ou jeton en Bearer pour l'app installée), ramenée au
 * dossier CANONIQUE de la personne (un compte par personne). Sans compte KDMC, pas de Cercle.
 *
 * L'ADMIN RESTE ANONYME : partout côté membres, Kevin s'appelle « Admin KDMC » 🛡️ — jamais son nom.
 * Tout le monde voit quand l'admin est en ligne et peut lui écrire ; lui seul voit tous les connectés.
 *
 * GARDE-FOUS : un membre ne voit QUE son cercle ; messages limités par jour ; pas de lien dans un texte
 * (hameçonnage) ; un compte en mode enfant n'échange que des encouragements tout faits (sauf avec l'admin) ;
 * bloquer / retirer / signaler ; un cadeau ne se réclame qu'une fois, par son destinataire.
 *
 * Tests : services/kdmc-router/cercle.test.mjs (D1 simulée sur SQLite).
 */

export const ADMIN = 'kdmc_admin';
export const LIMITES = {
  invitationsJour: 10, inviteJours: 14, inviteMax: 5,
  messagesJour: 60, cadeauxJour: 3, cadeauxRecusJour: 3, texteMax: 300,
  enLigneMs: 150000,            // vu il y a moins de 2 min 30 → en ligne (l'app bat toutes les 45 s)
  ecritureMs: 120000,           // une présence sans changement ne s'écrit qu'une fois toutes les 2 min
};
export const QUETE = { objectif: 300, gemmes: 30 };   // quête à deux : 300 XP à deux dans la semaine
export const BIENVENUE = { gemmes: 20 };              // cadeau d'arrivée, pour l'invité ET celui qui invite
/* CADEAU DU JOUR (recherche 2.10 : plus loin que Duolingo, où offrir coûte ses gemmes) : offrir ne coûte RIEN
   à celui qui offre — donc rien à tricher côté téléphone. Le destinataire peut dire « Merci ! » : celui qui a
   offert reçoit alors MERCI_GEMMES (une fois par cadeau). */
export const CADEAU_DU_JOUR = { gemmes: { type: 'gemmes', n: 10 }, boost: { type: 'boost', minutes: 15 }, gel: { type: 'gel' } };
export const MERCI_GEMMES = 5;
export const ENCOURAGEMENTS = [
  ['bravo', '👏 Bravo !'], ['continue', '💪 Continue comme ça !'], ['fier', '🌟 Je suis fier·e de toi !'],
  ['serie', '🔥 Quelle série !'], ['ensemble', '🤝 On apprend ensemble ?'], ['defi', '⚡ Je te lance un défi !'],
  ['courage', '🍀 Courage, tu vas y arriver !'], ['merci', '🙏 Merci pour le cadeau !'], ['coucou', '👋 Coucou !'],
  ['champion', '🏆 Champion·ne !'], ['lecon', '📚 Une petite leçon aujourd\'hui ?'], ['revient', '🐝 Tu nous manques, reviens !'],
  ['super', '😄 Super progrès !'], ['bisous', '💛 Plein de courage !'], ['top', '🚀 Au top !'], ['bientot', '⏰ À tout à l\'heure !'],
];
const ENC = Object.fromEntries(ENCOURAGEMENTS);
export const STICKERS = ['🐝', '🦊', '🐰', '🐼', '🦁', '🐸', '🦄', '🌈', '⭐', '🎉', '🍯', '🌻'];

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS profils (uid TEXT PRIMARY KEY, nom TEXT, avatar TEXT, enfant INTEGER DEFAULT 0,
     cours TEXT, xp_sem INTEGER DEFAULT 0, sem TEXT, serie INTEGER DEFAULT 0, xp_total INTEGER DEFAULT 0,
     jour_lecon TEXT, vu INTEGER DEFAULT 0, cree INTEGER, invisible INTEGER DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS liens (a TEXT, b TEXT, depuis INTEGER, via TEXT, PRIMARY KEY (a, b))`,
  `CREATE TABLE IF NOT EXISTS invitations (jeton TEXT PRIMARY KEY, de TEXT, cree INTEGER, expire INTEGER, utilise INTEGER DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, de TEXT, a TEXT, type TEXT, corps TEXT,
     cadeau TEXT, cree INTEGER, lu INTEGER DEFAULT 0, recu INTEGER DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS msg_a ON messages (a, id)`,
  `CREATE INDEX IF NOT EXISTS msg_de ON messages (de, cree)`,
  `CREATE TABLE IF NOT EXISTS blocages (qui TEXT, bloque TEXT, PRIMARY KEY (qui, bloque))`,
  `CREATE TABLE IF NOT EXISTS signalements (id INTEGER PRIMARY KEY AUTOINCREMENT, de TEXT, contre TEXT, msg INTEGER, raison TEXT, cree INTEGER)`,
  `CREATE TABLE IF NOT EXISTS duos (a TEXT, b TEXT, serie INTEGER DEFAULT 0, jour TEXT, PRIMARY KEY (a, b))`,
  `CREATE TABLE IF NOT EXISTS quetes (uid TEXT, ami TEXT, sem TEXT, PRIMARY KEY (uid, ami, sem))`,
  /* JOURNAL DES CONNEXIONS (Kevin 2.10 : « note-moi toutes les informations des connectés, des connexions »).
     Une ligne par personne et par jour : 1re et dernière présence, nombre de visites, minutes passées, app.
     Gardé 90 jours (conditions du domaine : durée limitée), lu par l'admin seul. */
  `CREATE TABLE IF NOT EXISTS connexions (uid TEXT, jour TEXT, premiere INTEGER, derniere INTEGER, visites INTEGER DEFAULT 1,
     minutes INTEGER DEFAULT 0, app TEXT, PRIMARY KEY (uid, jour))`,
  `CREATE INDEX IF NOT EXISTS cx_jour ON connexions (jour, derniere)`,
];
const pret = new WeakSet();
export async function schema(db) {
  if (pret.has(db)) return;
  await db.batch(SCHEMA.map((s) => db.prepare(s)));
  pret.add(db);
}

/* ---------- petites fonctions pures (testées) ---------- */
export function semaine(t) {
  const d = new Date(t); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const an = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return d.getUTCFullYear() + '-S' + String(Math.ceil(((d - an) / 864e5 + 1) / 7)).padStart(2, '0');
}
export const jour = (t) => new Date(t).toISOString().slice(0, 10);
/* Côté membres : prénom + initiale (« Léa M. ») — jamais le nom complet, jamais celui de l'admin. */
export function nomCourt(nom, uid) {
  if (uid === ADMIN) return 'Admin KDMC';
  const m = String(nom || '').trim().split(/\s+/);
  return m[0] ? m[0] + (m[1] ? ' ' + m[1][0].toUpperCase() + '.' : '') : 'Ami·e';
}
/* Un texte libre ne transporte ni lien, ni téléphone, ni e-mail (hameçonnage, prise de contact hors app). */
export function texteOk(t, admin) {
  let s = String(t || '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim();
  if (!admin) s = s.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[e-mail masqué]').replace(/(\+?\d[\d .-]{7,}\d)/g, '[numéro masqué]');
  if (!s) return { ok: false, raison: 'vide' };
  if (s.length > LIMITES.texteMax) return { ok: false, raison: 'trop_long' };
  if (!admin && /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|fr|io|ru|xyz|top|link|ly)\b)/i.test(s)) return { ok: false, raison: 'lien_interdit' };
  return { ok: true, texte: s };
}
export function cadeauOk(c) {
  if (!c) return null;
  if (c.type === 'sticker') return STICKERS.indexOf(c.id) >= 0 ? { type: 'sticker', id: c.id } : null;
  return CADEAU_DU_JOUR[c.type] ? Object.assign({}, CADEAU_DU_JOUR[c.type]) : null;   /* valeur fixée par le serveur, jamais par le client */
}
const enLigne = (vu, now) => !!vu && now - vu < LIMITES.enLigneMs;
const jeton = () => { const b = new Uint8Array(12); crypto.getRandomValues(b); return Array.from(b, (x) => x.toString(36).padStart(2, '0')).join('').slice(0, 20); };

/* ---------- requêtes ---------- */
const un = (db, sql, ...p) => db.prepare(sql).bind(...p).first();
const tous = async (db, sql, ...p) => ((await db.prepare(sql).bind(...p).all()).results || []);
const faire = (db, sql, ...p) => db.prepare(sql).bind(...p).run();

async function amisDe(db, uid) {
  return tous(db, `SELECT p.* FROM liens l JOIN profils p ON p.uid = l.b WHERE l.a = ?
                   AND NOT EXISTS (SELECT 1 FROM blocages x WHERE x.qui = l.a AND x.bloque = l.b)`, uid);
}
async function sontAmis(db, a, b) { return !!(await un(db, 'SELECT 1 AS o FROM liens WHERE a = ? AND b = ?', a, b)); }
async function lier(db, a, b, via, now) {
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO liens (a, b, depuis, via) VALUES (?, ?, ?, ?)').bind(a, b, now, via),
    db.prepare('INSERT OR IGNORE INTO liens (a, b, depuis, via) VALUES (?, ?, ?, ?)').bind(b, a, now, via),
  ]);
}
async function envoyerSysteme(db, a, corps, cadeau, now) {
  await faire(db, 'INSERT INTO messages (de, a, type, corps, cadeau, cree) VALUES (?, ?, ?, ?, ?, ?)',
    'systeme', a, cadeau ? 'cadeau' : 'systeme', corps, cadeau ? JSON.stringify(cadeau) : null, now);
}

function vueMessage(m, moi, admin) {
  const out = { id: m.id, de: m.de, a: m.a, type: m.type, corps: m.corps, cadeau: m.cadeau ? JSON.parse(m.cadeau) : null,
    cree: m.cree, lu: !!m.lu, recu: (m.recu % 2) === 1, remercie: m.recu >= 2, moi: m.de === moi };
  if (!admin) { if (out.de === ADMIN) out.de = 'admin'; if (out.a === ADMIN) out.a = 'admin'; }
  return out;
}
/* Vie privée : qui a choisi « invisible » apparaît hors ligne à son cercle — l'admin, lui, voit toujours (Kevin 2.10). */
function vueProfil(p, now, admin) {
  const cache = !admin && p.invisible;
  return { uid: p.uid === ADMIN && !admin ? 'admin' : p.uid, nom: admin ? (p.nom || '') : nomCourt(p.nom, p.uid),
    avatar: p.uid === ADMIN ? '🛡️' : (p.avatar || '🙂'), enLigne: !cache && enLigne(p.vu, now), vu: cache ? 0 : (p.vu || 0), invisible: !!p.invisible,
    cours: p.cours || '', serie: p.serie || 0, xpSem: p.sem === semaine(now) ? (p.xp_sem || 0) : 0, enfant: !!p.enfant };
}

async function etat(db, moi, admin, now) {
  const sem = semaine(now);
  const amis = (await amisDe(db, moi)).filter((p) => p.uid !== ADMIN);
  const adm = await un(db, 'SELECT vu FROM profils WHERE uid = ?', ADMIN);
  const msgs = await tous(db, 'SELECT * FROM messages WHERE a = ? OR de = ? ORDER BY id DESC LIMIT 60', moi, moi);
  const nonLus = (await un(db, 'SELECT COUNT(*) AS n FROM messages WHERE a = ? AND lu = 0', moi)).n || 0;
  const mien = await un(db, 'SELECT * FROM profils WHERE uid = ?', moi);
  const reclamees = new Set((await tous(db, 'SELECT ami FROM quetes WHERE uid = ? AND sem = ?', moi, sem)).map((r) => r.ami));
  const duos = Object.fromEntries((await tous(db, 'SELECT * FROM duos WHERE a = ? OR b = ?', moi, moi))
    .map((d) => [d.a === moi ? d.b : d.a, { serie: d.jour >= jour(now - 864e5) ? d.serie : 0, jour: d.jour }]));
  const monXp = mien && mien.sem === sem ? mien.xp_sem || 0 : 0;
  const vAmis = amis.map((p) => {
    const v = vueProfil(p, now, admin);
    v.quete = { objectif: QUETE.objectif, total: monXp + v.xpSem, gemmes: QUETE.gemmes, reclamee: reclamees.has(p.uid) };
    v.duo = duos[p.uid] || { serie: 0 };
    return v;
  }).sort((x, y) => (y.enLigne - x.enLigne) || (y.vu - x.vu));
  return { ok: true, moi: { uid: admin ? ADMIN : moi, admin, xpSem: monXp }, semaine: sem,
    admin: { uid: 'admin', nom: 'Admin KDMC', avatar: '🛡️', enLigne: enLigne(adm && adm.vu, now), vu: (adm && adm.vu) || 0 },
    amis: vAmis, nonLus, messages: msgs.map((m) => vueMessage(m, moi, admin)),
    encouragements: ENCOURAGEMENTS, stickers: STICKERS, limites: LIMITES, quete: QUETE, cadeaux: CADEAU_DU_JOUR, merciGemmes: MERCI_GEMMES };
}

/* ---------- point d'entrée ---------- */
/* outils = { qui(request) → {uid, nom, admin} | null, notifier(titre, texte), now? } — fournis par le routeur. */
export async function handleCercle(request, url, env, outils) {
  const J = (o, st, extra) => new Response(JSON.stringify(o), { status: st || 200,
    headers: Object.assign({ 'content-type': 'application/json', 'cache-control': 'no-store' }, extra || {}) });
  const db = env && env.CERCLE_DB;
  if (!db) return J({ ok: false, reason: 'cercle_indisponible' });
  const now = (outils.now && outils.now()) || Date.now();
  const p = url.pathname.replace(/^\/__cercle/, '') || '/';
  const m = request.method;
  try {
    await schema(db);
    /* Page d'invitation : seule route SANS compte (elle dit juste qui invite, au prénom). */
    if (p === '/invitation' && m === 'GET') {
      const inv = await un(db, 'SELECT * FROM invitations WHERE jeton = ?', String(url.searchParams.get('j') || '').slice(0, 40));
      if (!inv || inv.expire < now || inv.utilise >= LIMITES.inviteMax) return J({ ok: false, reason: 'invitation_expiree' });
      const de = await un(db, 'SELECT nom FROM profils WHERE uid = ?', inv.de);
      return J({ ok: true, de: nomCourt(de && de.nom, inv.de) });
    }
    /* Toute écriture vient d'une page du domaine (pas de formulaire posté par un site tiers). */
    if (m !== 'GET') {
      const o = request.headers.get('origin') || '';
      if (o && !/^https:\/\/([a-z0-9-]+\.)*kd-mc\.com$/i.test(o)) return J({ ok: false, reason: 'origine_refusee' }, 403);
    }
    const qui = await outils.qui(request);
    /* Boîte de l'admin lue depuis admin.kd-mc.com (bandeau « messages ») : CORS limité à cette page. */
    if (p === '/admin/boite') {
      const cors = { 'Access-Control-Allow-Origin': 'https://admin.kd-mc.com', 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' };
      if (m === 'OPTIONS') return new Response(null, { status: 204, headers: Object.assign({ 'Access-Control-Allow-Methods': 'GET' }, cors) });
      if (!qui || !qui.admin) return J({ ok: false, reason: 'admin_requis' }, 401, cors);
      const nonLus = (await un(db, 'SELECT COUNT(*) AS n FROM messages WHERE a = ? AND lu = 0', ADMIN)).n || 0;
      const derniers = await tous(db, `SELECT m.id, m.type, m.corps, m.cree, m.lu, p.nom FROM messages m LEFT JOIN profils p ON p.uid = m.de
                                        WHERE m.a = ? ORDER BY m.id DESC LIMIT 10`, ADMIN);
      const connectes = (await un(db, 'SELECT COUNT(*) AS n FROM profils WHERE vu > ? AND uid != ?', now - LIMITES.enLigneMs, ADMIN)).n || 0;   /* sans l'admin lui-même */
      return J({ ok: true, nonLus, connectes, derniers }, 200, cors);
    }
    if (!qui) return J({ ok: false, reason: 'compte_kdmc_requis' }, 401);
    const moi = qui.admin ? ADMIN : qui.uid;
    let b = {}; if (m === 'POST') { try { b = await request.json(); } catch { b = {}; } }

    if (p === '/battement' && m === 'POST') {
      const sem = semaine(now), auj = jour(now);
      const av = await un(db, 'SELECT * FROM profils WHERE uid = ?', moi);
      const n = { nom: String(qui.nom || '').slice(0, 60), avatar: String(b.avatar || '').slice(0, 8), enfant: b.enfant ? 1 : 0,
        cours: String(b.cours || '').slice(0, 8), xp_sem: Math.max(0, Math.min(1e6, b.sem === sem ? +b.xpSem || 0 : 0)), sem,
        serie: Math.max(0, Math.min(1e5, +b.serie || 0)), xp_total: Math.max(0, Math.min(1e8, +b.xpTotal || 0)),
        jour_lecon: b.leconAujourdhui ? auj : (av && av.jour_lecon) || null, invisible: b.invisible ? 1 : 0 };
      const change = !av || ['nom', 'avatar', 'enfant', 'cours', 'xp_sem', 'sem', 'serie', 'xp_total', 'jour_lecon', 'invisible'].some((k) => String(av[k] ?? '') !== String(n[k] ?? ''));
      if (change || now - ((av && av.vu) || 0) > LIMITES.ecritureMs) {
        await faire(db, `INSERT INTO profils (uid, nom, avatar, enfant, cours, xp_sem, sem, serie, xp_total, jour_lecon, vu, cree, invisible)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                         ON CONFLICT(uid) DO UPDATE SET nom=excluded.nom, avatar=excluded.avatar, enfant=excluded.enfant, cours=excluded.cours,
                         xp_sem=excluded.xp_sem, sem=excluded.sem, serie=excluded.serie, xp_total=excluded.xp_total, jour_lecon=excluded.jour_lecon, vu=excluded.vu, invisible=excluded.invisible`,
          moi, n.nom, n.avatar, n.enfant, n.cours, n.xp_sem, n.sem, n.serie, n.xp_total, n.jour_lecon, now, now, n.invisible);
        /* même cadence que la présence (≤ 1 écriture / 2 min / personne) : visite neuve après 10 min d'absence */
        const ecart = av && av.vu ? now - av.vu : Infinity;
        const suite = ecart < 10 * 60e3;
        const app = String((request.headers.get('origin') || '').replace(/^https:\/\//, '').split('.')[0] || 'lingua').slice(0, 20);
        await faire(db, `INSERT INTO connexions (uid, jour, premiere, derniere, visites, minutes, app) VALUES (?, ?, ?, ?, 1, 0, ?)
                         ON CONFLICT(uid, jour) DO UPDATE SET derniere = excluded.derniere,
                         visites = visites + ?, minutes = minutes + ?`,
          moi, auj, now, now, app, suite ? 0 : 1, suite ? Math.round(ecart / 60e3) : 0);
      }
      /* SÉRIE À DEUX : le jour où les DEUX ont fait une leçon, la série du duo avance (une fois par jour). */
      if (b.leconAujourdhui && !(av && av.jour_lecon === auj)) {
        for (const a of await amisDe(db, moi)) {
          if (a.jour_lecon !== auj || a.uid === ADMIN) continue;
          const [x, y] = [moi, a.uid].sort();
          const d = await un(db, 'SELECT * FROM duos WHERE a = ? AND b = ?', x, y);
          if (d && d.jour === auj) continue;
          const serie = d && d.jour === jour(now - 864e5) ? d.serie + 1 : 1;
          await faire(db, 'INSERT INTO duos (a, b, serie, jour) VALUES (?, ?, ?, ?) ON CONFLICT(a, b) DO UPDATE SET serie=excluded.serie, jour=excluded.jour', x, y, serie, auj);
        }
      }
      return J(await etat(db, moi, qui.admin, now));
    }
    if (p === '/etat' && m === 'GET') return J(await etat(db, moi, qui.admin, now));

    if (p === '/inviter' && m === 'POST') {
      const n = (await un(db, 'SELECT COUNT(*) AS n FROM invitations WHERE de = ? AND cree > ?', moi, now - 864e5)).n || 0;
      if (n >= LIMITES.invitationsJour) return J({ ok: false, reason: 'trop_d_invitations', max: LIMITES.invitationsJour });
      const j = jeton();
      await faire(db, 'INSERT INTO invitations (jeton, de, cree, expire) VALUES (?, ?, ?, ?)', j, moi, now, now + LIMITES.inviteJours * 864e5);
      return J({ ok: true, jeton: j, url: 'https://lingua.kd-mc.com/?cercle=' + j, expire: now + LIMITES.inviteJours * 864e5 });
    }
    if (p === '/accepter' && m === 'POST') {
      const inv = await un(db, 'SELECT * FROM invitations WHERE jeton = ?', String(b.j || '').slice(0, 40));
      if (!inv || inv.expire < now || inv.utilise >= LIMITES.inviteMax) return J({ ok: false, reason: 'invitation_expiree' });
      if (inv.de === moi) return J({ ok: false, reason: 'ta_propre_invitation' });
      const deja = await sontAmis(db, moi, inv.de);
      await lier(db, moi, inv.de, 'invitation', now);
      if (!deja) {
        await faire(db, 'UPDATE invitations SET utilise = utilise + 1 WHERE jeton = ?', inv.jeton);
        const prenom = nomCourt(qui.nom, moi);
        await envoyerSysteme(db, inv.de, `🎉 ${prenom} a rejoint ton cercle grâce à ton invitation ! Voici ${BIENVENUE.gemmes} 💎 pour te remercier.`, { type: 'gemmes', n: BIENVENUE.gemmes }, now);
        await envoyerSysteme(db, moi, `🐝 Bienvenue dans le cercle ! Voici ${BIENVENUE.gemmes} 💎 pour bien commencer.`, { type: 'gemmes', n: BIENVENUE.gemmes }, now);
      }
      const de = await un(db, 'SELECT nom FROM profils WHERE uid = ?', inv.de);
      return J({ ok: true, ami: nomCourt(de && de.nom, inv.de), deja });
    }

    if (p === '/message' && m === 'POST') {
      let a = String(b.a || ''); if (a === 'admin') a = ADMIN;
      if (!a || a === moi) return J({ ok: false, reason: 'destinataire' });
      const versAdmin = a === ADMIN;
      if (!qui.admin && !versAdmin && !(await sontAmis(db, moi, a))) return J({ ok: false, reason: 'pas_dans_ton_cercle' }, 403);
      if (await un(db, 'SELECT 1 AS o FROM blocages WHERE qui = ? AND bloque = ?', a, moi)) return J({ ok: false, reason: 'bloque' }, 403);
      const debut = now - 864e5;
      if (!qui.admin) {
        const nb = (await un(db, 'SELECT COUNT(*) AS n FROM messages WHERE de = ? AND cree > ?', moi, debut)).n || 0;
        if (nb >= LIMITES.messagesJour) return J({ ok: false, reason: 'trop_de_messages', max: LIMITES.messagesJour });
      }
      const exp = await un(db, 'SELECT enfant FROM profils WHERE uid = ?', moi);
      const dest = await un(db, 'SELECT enfant FROM profils WHERE uid = ?', a);
      const protege = !qui.admin && !versAdmin && ((exp && exp.enfant) || (dest && dest.enfant));
      const type = ['texte', 'encouragement', 'cadeau', 'felicitations', 'sticker'].indexOf(b.type) >= 0 ? b.type : 'texte';
      let corps = '', cadeau = null;
      if (type === 'encouragement' || type === 'felicitations') {
        if (!ENC[b.code]) return J({ ok: false, reason: 'encouragement_inconnu' });
        corps = ENC[b.code];
      } else if (type === 'sticker') {
        if (STICKERS.indexOf(b.id) < 0) return J({ ok: false, reason: 'sticker_inconnu' });
        corps = b.id;
      } else if (type === 'cadeau') {
        cadeau = cadeauOk(b.cadeau); if (!cadeau) return J({ ok: false, reason: 'cadeau_invalide' });
        if (!qui.admin) {
          const nc = (await un(db, "SELECT COUNT(*) AS n FROM messages WHERE de = ? AND type = 'cadeau' AND cree > ? AND cadeau NOT LIKE '%\"merci\":true%'", moi, debut)).n || 0;
          if (nc >= LIMITES.cadeauxJour) return J({ ok: false, reason: 'trop_de_cadeaux', max: LIMITES.cadeauxJour });
          const nr = (await un(db, "SELECT COUNT(*) AS n FROM messages WHERE a = ? AND type = 'cadeau' AND de != 'systeme' AND cree > ? AND cadeau NOT LIKE '%\"merci\":true%'", a, debut)).n || 0;
          if (nr >= LIMITES.cadeauxRecusJour) return J({ ok: false, reason: 'boite_pleine_aujourd_hui', max: LIMITES.cadeauxRecusJour });
        }
        if (b.corps) { const ck = protege ? { ok: false } : texteOk(b.corps, qui.admin); corps = ck.ok ? ck.texte : ''; }
      } else {
        /* Texte libre : jamais avec un enfant (des deux côtés), sauf avec l'admin. */
        if (protege) return J({ ok: false, reason: 'mode_enfant_encouragements_seulement' }, 403);
        const ck = texteOk(b.corps, qui.admin); if (!ck.ok) return J({ ok: false, reason: ck.raison });
        corps = ck.texte;
      }
      const r = await faire(db, 'INSERT INTO messages (de, a, type, corps, cadeau, cree) VALUES (?, ?, ?, ?, ?, ?)',
        moi, a, type, corps, cadeau ? JSON.stringify(cadeau) : null, now);
      if (outils.noter) await outils.noter({ uid: moi, nom: qui.nom, type: 'message', app: 'lingua', detail: versAdmin ? 'à l\'admin' : 'à un ami', appareil: outils.appareilDe ? outils.appareilDe(request) : '' });   // fil d'activité : jamais le texte
      if (versAdmin && outils.notifier) {
        const p2 = await un(db, 'SELECT nom FROM profils WHERE uid = ?', moi);
        await outils.notifier('💬 Lingua — ' + ((p2 && p2.nom) || qui.nom || 'un membre'), (corps || (cadeau ? '🎁 un cadeau' : '')).slice(0, 140));
      }
      return J({ ok: true, id: (r && r.meta && r.meta.last_row_id) || null });
    }
    if (p === '/lu' && m === 'POST') {
      const ids = (Array.isArray(b.ids) ? b.ids : []).map((x) => +x).filter((x) => x > 0).slice(0, 100);
      if (ids.length) await faire(db, `UPDATE messages SET lu = 1 WHERE a = ? AND id IN (${ids.map(() => '?').join(',')})`, moi, ...ids);
      return J({ ok: true });
    }
    if (p === '/reclamer' && m === 'POST') {
      const id = +b.id || 0;
      const r = await faire(db, "UPDATE messages SET recu = recu + 1, lu = 1 WHERE id = ? AND a = ? AND type = 'cadeau' AND recu % 2 = 0", id, moi);
      if (!r || !r.meta || r.meta.changes !== 1) return J({ ok: false, reason: 'deja_recu_ou_introuvable' });
      const msg = await un(db, 'SELECT cadeau FROM messages WHERE id = ?', id);
      return J({ ok: true, cadeau: JSON.parse(msg.cadeau) });
    }
    /* « Merci ! » sur un cadeau reçu : un mot pour celui qui a offert, et MERCI_GEMMES pour lui (une fois). */
    if (p === '/merci' && m === 'POST') {
      const id = +b.id || 0;
      const msg = await un(db, "SELECT * FROM messages WHERE id = ? AND a = ? AND type = 'cadeau' AND de != 'systeme'", id, moi);
      if (!msg) return J({ ok: false, reason: 'cadeau_introuvable' });
      const r = await faire(db, "UPDATE messages SET recu = recu + 2 WHERE id = ? AND recu < 2", id);   /* recu ≥ 2 = déjà remercié */
      if (!r || !r.meta || r.meta.changes !== 1) return J({ ok: false, reason: 'deja_remercie' });
      await faire(db, 'INSERT INTO messages (de, a, type, corps, cadeau, cree) VALUES (?, ?, ?, ?, ?, ?)',
        moi, msg.de, 'cadeau', ENC.merci, JSON.stringify({ type: 'gemmes', n: MERCI_GEMMES, merci: true }), now);
      return J({ ok: true, gemmes: MERCI_GEMMES });
    }
    if (p === '/quete' && m === 'POST') {
      const ami = String(b.ami || ''); const sem = semaine(now);
      if (!(await sontAmis(db, moi, ami))) return J({ ok: false, reason: 'pas_dans_ton_cercle' }, 403);
      const xs = await tous(db, 'SELECT uid, xp_sem, sem FROM profils WHERE uid IN (?, ?)', moi, ami);
      const total = xs.reduce((s, x) => s + (x.sem === sem ? x.xp_sem || 0 : 0), 0);
      if (total < QUETE.objectif) return J({ ok: false, reason: 'pas_encore', total, objectif: QUETE.objectif });
      const r = await faire(db, 'INSERT OR IGNORE INTO quetes (uid, ami, sem) VALUES (?, ?, ?)', moi, ami, sem);
      if (!r || !r.meta || r.meta.changes !== 1) return J({ ok: false, reason: 'deja_reclamee' });
      return J({ ok: true, gemmes: QUETE.gemmes });
    }
    if (p === '/bloquer' && m === 'POST') { await faire(db, 'INSERT OR IGNORE INTO blocages (qui, bloque) VALUES (?, ?)', moi, String(b.uid || '')); return J({ ok: true }); }
    if (p === '/debloquer' && m === 'POST') { await faire(db, 'DELETE FROM blocages WHERE qui = ? AND bloque = ?', moi, String(b.uid || '')); return J({ ok: true }); }
    if (p === '/retirer' && m === 'POST') {
      const u = String(b.uid || '');
      await db.batch([db.prepare('DELETE FROM liens WHERE a = ? AND b = ?').bind(moi, u), db.prepare('DELETE FROM liens WHERE a = ? AND b = ?').bind(u, moi)]);
      return J({ ok: true });
    }
    if (p === '/signaler' && m === 'POST') {
      const msg = await un(db, 'SELECT * FROM messages WHERE id = ? AND a = ?', +b.id || 0, moi);
      if (!msg) return J({ ok: false, reason: 'message_introuvable' });
      await faire(db, 'INSERT INTO signalements (de, contre, msg, raison, cree) VALUES (?, ?, ?, ?, ?)', moi, msg.de, msg.id, String(b.raison || '').slice(0, 200), now);
      if (outils.notifier) await outils.notifier('🚩 Lingua — signalement', 'Un message a été signalé : « ' + String(msg.corps || '').slice(0, 100) + ' »');
      return J({ ok: true });
    }

    /* ---------- ADMIN : tout le monde, en temps réel ---------- */
    if (p.startsWith('/admin/') && !qui.admin) return J({ ok: false, reason: 'admin_requis' }, 403);
    if (p === '/admin/journal' && m === 'GET') {
      if (!qui.admin) return J({ ok: false, reason: 'admin_requis' }, 403);
      await faire(db, 'DELETE FROM connexions WHERE jour < ?', jour(now - 90 * 864e5));   /* 90 jours, pas plus */
      await faire(db, 'DELETE FROM messages WHERE cree < ?', now - 365 * 864e5);           /* messages : 12 mois (privacy.html) */
      const jours = Math.max(1, Math.min(90, +url.searchParams.get('jours') || 14));
      const lignes = await tous(db, `SELECT c.*, p.nom FROM connexions c LEFT JOIN profils p ON p.uid = c.uid
                                     WHERE c.jour >= ? ORDER BY c.jour DESC, c.derniere DESC LIMIT 2000`, jour(now - (jours - 1) * 864e5));
      const parJour = {};
      for (const l of lignes) { if (l.uid === ADMIN) continue; const d = parJour[l.jour] || (parJour[l.jour] = { jour: l.jour, personnes: 0, visites: 0, minutes: 0 }); d.personnes++; d.visites += l.visites || 0; d.minutes += l.minutes || 0; }
      return J({ ok: true, maintenant: now, jours, resume: Object.values(parJour),
        lignes: lignes.filter((l) => l.uid !== ADMIN).map((l) => ({ uid: l.uid, nom: l.nom || l.uid, jour: l.jour, premiere: l.premiere, derniere: l.derniere, visites: l.visites, minutes: l.minutes, app: l.app })) });
    }
    if (p === '/admin/tous' && m === 'GET') {
      const ps = await tous(db, 'SELECT * FROM profils ORDER BY vu DESC LIMIT 500');
      const act = Object.fromEntries((await tous(db, `SELECT uid, COUNT(*) AS jours, SUM(visites) AS visites, SUM(minutes) AS minutes
                                                     FROM connexions WHERE jour >= ? GROUP BY uid`, jour(now - 29 * 864e5))).map((r) => [r.uid, r]));
      const nbAmis = Object.fromEntries((await tous(db, 'SELECT a, COUNT(*) AS n FROM liens GROUP BY a')).map((r) => [r.a, r.n]));
      const signal = await tous(db, 'SELECT * FROM signalements ORDER BY id DESC LIMIT 20');
      return J({ ok: true, maintenant: now, personnes: ps.filter((x) => x.uid !== ADMIN).map((x) => Object.assign(vueProfil(x, now, true), { amis: nbAmis[x.uid] || 0, xpTotal: x.xp_total || 0, inscrit: x.cree || 0, dernier: x.vu || 0, jours30: (act[x.uid] || {}).jours || 0, visites30: (act[x.uid] || {}).visites || 0, minutes30: (act[x.uid] || {}).minutes || 0 })),
        connectes: ps.filter((x) => x.uid !== ADMIN && enLigne(x.vu, now)).length, signalements: signal });
    }
    return J({ ok: false, reason: 'introuvable' }, 404);
  } catch (e) {
    return J({ ok: false, reason: 'erreur', detail: String((e && e.message) || e).slice(0, 160) });
  }
}
