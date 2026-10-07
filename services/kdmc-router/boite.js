/* LA BOÎTE UNIQUE DE L'ADMIN — tous les messages de toutes les apps du domaine, au même endroit, avec réponse directe
 * (Kevin 3.10.2026 : « Intègre dans la nouvelle fenêtre des messages tous les messages que je peux recevoir de n'importe
 *  quelle app du domaine sur ma vue admin, pour avoir un visuel permanent, ne rien rater, je peux répondre directement par
 *  là, j'ai toutes les infos. Va plus loin »).
 *
 * PRINCIPE : on ne recopie RIEN. Chaque app garde ses messages là où elle les range ; la boîte les LIT à la demande
 * (adaptateurs) et les met dans une forme commune. Lire ne coûte pas d'écriture KV (le plafond gratuit de 1 000 écritures
 * par jour est déjà crevé tous les jours — leçon 394) : les seules écritures sont en D1 (gratuite) ou dans Firebase.
 *
 *   lingua    Cercle Lingua (D1)              réponse directe  → message de « Admin KDMC » dans le cercle
 *   cmcteams  Messages des employés (Firebase) réponse directe  → même fil que la page « Messages employés »
 *   depots    TOUTE autre app, présente ou future : POST /__boite/deposer (D1)   réponse directe, l'expéditeur la relit
 *   rotaplan  Demandes de démonstration (KV, lecture)   réponse par e-mail (lien prêt)
 *   arbre     Corrections de l'arbre (KV, lecture)      lecture + lien vers le journal
 *   alertes   Nouvelles connexions, nouveaux appareils, anomalies (KV, lecture)  — comptées à part, jamais rouge à tort
 *
 * SÉCURITÉ : tout ce qui est /admin est réservé à la session admin PROUVÉE par le domaine (outils.qui), jamais déclarée par
 * la page. Les écritures exigent une origine du domaine. Le dépôt public est limité (5 par heure et par appareil, 200 par
 * jour au total, texte 1 000 caractères, champ piège pour les robots, gardé 90 jours).
 * node services/kdmc-router/boite.test.mjs */
import { ADMIN, LIMITES as LIM_CERCLE, texteOk, schema as schemaCercle } from './cercle.js';
import { BOUTON_JS } from './boite-bouton.js';

export const LIMITES = { alerteFraicheur: 48 * 36e5, liste: 60, fil: 8, convs: 20, depotHeure: 5, depotJour: 200, texte: 1000, reponse: 2000, garde: 90 * 864e5, memoMs: 20000 };
export const FB_URL = 'https://cmcteams-c16ab-default-rtdb.europe-west1.firebasedatabase.app/cmcteams';

export const SOURCES = {
  lingua:   { nom: 'Lingua',               icone: '🐝', lien: 'https://lingua.kd-mc.com/#admin' },
  cmcteams: { nom: 'CMCteams · employés',  icone: '📅', lien: 'https://cmcteams.kd-mc.com/tools/messages/' },
  depots:   { nom: 'Autres apps',          icone: '📨', lien: '' },
  rotaplan: { nom: 'Rotaplan · demandes',  icone: '🗓️', lien: 'https://kd-mc.com/__demandes' },
  arbre:    { nom: 'Arbre · corrections',  icone: '🌳', lien: 'https://arbre.kd-mc.com/#journal' },
  /* 6.10 (Kevin « lien ne fonctionne pas ») : admin.kd-mc.com ne montre PAS ces alertes (il les retire) et, sur iPhone, s'ouvre hors
     de l'app du portail (redemande le code). Le journal qui les montre est sur la MÊME adresse que le portail : /admin/, ouvert à #journal. */
  alertes:  { nom: 'Alertes du domaine',   icone: '🔔', lien: 'https://kd-mc.com/admin/#journal' },
};
/* Les alertes (connexions, appareils) se lisent mais ne font PAS monter le compteur rouge : il y en a des dizaines par jour. */
export const SOURCES_MESSAGES = ['lingua', 'cmcteams', 'depots', 'rotaplan', 'arbre'];

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS boite (id INTEGER PRIMARY KEY AUTOINCREMENT, app TEXT, nom TEXT, texte TEXT, contact TEXT, ip TEXT,
     suivi TEXT, cree INTEGER, lu INTEGER DEFAULT 0, reponse TEXT, repondu INTEGER, uid TEXT, page TEXT, appareil TEXT, pays TEXT)`,
  `CREATE INDEX IF NOT EXISTS boite_cree ON boite (cree)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS boite_suivi ON boite (suivi)`,
  `CREATE TABLE IF NOT EXISTS boite_lu (cle TEXT PRIMARY KEY, ts INTEGER)`,
];
const pret = new WeakSet();
/* La table existait déjà sans ces colonnes (boîte en ligne depuis le 3.10 au soir) : on les ajoute, une erreur « colonne déjà là » est normale. */
const COLONNES = ['uid', 'page', 'appareil', 'pays'];
async function schema(db) {
  if (pret.has(db)) return;
  await schemaCercle(db); await db.batch(SCHEMA.map((s) => db.prepare(s)));
  for (const c of COLONNES) { try { await db.prepare('ALTER TABLE boite ADD COLUMN ' + c + ' TEXT').run(); } catch { /* déjà présente */ } }
  await db.prepare('CREATE INDEX IF NOT EXISTS boite_uid ON boite (uid, cree)').run();
  pret.add(db);
}
/* « iPhone · Safari », « Windows · Chrome » : de quoi reconnaître l'appareil, rien de plus (pas de User-Agent brut conservé). */
export function appareilDe(ua) {
  const u = String(ua || '');
  const sys = /iPhone|iPad/.test(u) ? 'iPhone' : /Android/.test(u) ? 'Android' : /Windows/.test(u) ? 'Windows' : /Macintosh|Mac OS/.test(u) ? 'Mac' : /Linux/.test(u) ? 'Linux' : 'appareil inconnu';
  const nav = /Edg\//.test(u) ? 'Edge' : /Firefox|FxiOS/.test(u) ? 'Firefox' : /CriOS|Chrome/.test(u) ? 'Chrome' : /Safari/.test(u) ? 'Safari' : 'navigateur inconnu';
  return sys + ' · ' + nav;
}
const un = async (db, sql, ...p) => db.prepare(sql).bind(...p).first();
const tous = async (db, sql, ...p) => ((await db.prepare(sql).bind(...p).all()).results) || [];
const faire = async (db, sql, ...p) => db.prepare(sql).bind(...p).run();

const propre = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b-\u001f\u007f]+/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, n);
const apercu = (v, n) => propre(v, 4000).replace(/\s+/g, ' ').slice(0, n);

/* Mémo de 20 s par instance : une page ouverte relit toutes les minutes, plusieurs onglets ne multiplient pas les lectures. */
const memo = new Map();
async function memoise(cle, now, fn) {
  const m = memo.get(cle);
  if (m && now - m.t < LIMITES.memoMs) return m.v;
  const v = await fn(); memo.set(cle, { t: now, v }); return v;
}
export function _viderMemo() { memo.clear(); }

/* ── adaptateur : Lingua (D1) ─────────────────────────────────────────────────────────────────────────────── */
async function lireLingua(db) {
  const convs = await tous(db, `SELECT m.de AS uid, MAX(m.id) AS dernier, SUM(CASE WHEN m.lu = 0 THEN 1 ELSE 0 END) AS nl
      FROM messages m WHERE m.a = ? AND m.de != 'systeme' GROUP BY m.de ORDER BY dernier DESC LIMIT ?`, ADMIN, LIMITES.convs);
  const items = [];
  for (const c of convs) {
    const p = await un(db, 'SELECT nom FROM profils WHERE uid = ?', c.uid);
    const fil = (await tous(db, `SELECT de, type, corps, cree FROM messages WHERE (a = ? AND de = ?) OR (a = ? AND de = ?) ORDER BY id DESC LIMIT ?`,
      ADMIN, c.uid, c.uid, ADMIN, LIMITES.fil)).reverse().map((m) => ({ moi: m.de === ADMIN, texte: m.corps || (m.type === 'cadeau' ? '🎁 un cadeau' : '…'), ts: m.cree }));
    const dernierEux = [...fil].reverse().find((m) => !m.moi);
    items.push({ cle: 'lingua:' + c.uid, source: 'lingua', app: 'lingua.kd-mc.com', de: (p && p.nom) || 'Membre Lingua', ts: fil.length ? fil[fil.length - 1].ts : 0,
      texte: dernierEux ? dernierEux.texte : fil.length ? fil[fil.length - 1].texte : '', nonLus: c.nl || 0, lu: !c.nl, repondre: 'direct', fil });
  }
  return items;
}

/* ── adaptateur : CMCteams (Firebase) ─────────────────────────────────────────────────────────────────────── */
async function fb(outils, chemin, methode, corps) {
  const f = outils.fetch || fetch;
  let jeton = ''; try { jeton = (outils.fbToken && (await outils.fbToken())) || ''; } catch { jeton = ''; }
  const r = await f(FB_URL + '/' + chemin.split('/').map(encodeURIComponent).join('/') + '.json' + (jeton ? '?auth=' + encodeURIComponent(jeton) : ''), {
    method: methode || 'GET', headers: { 'content-type': 'application/json' }, body: corps === undefined ? undefined : JSON.stringify(corps), signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('firebase ' + r.status);
  return r.json();
}
const liste = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : []).filter((x) => x && typeof x === 'object');
async function lireCmcteams(outils) {
  const [boite, rep, lus] = await Promise.all([fb(outils, 'cmc_kevin_inbox'), fb(outils, 'cmc_dep_reply').catch(() => null), fb(outils, 'cmc_dep_read').catch(() => null)]);
  const g = new Map();
  for (const m of liste(boite)) {
    const dk = String(m.dkey || m.from || '?' + (m.name || '')).trim() || '?';
    if (!g.has(dk)) g.set(dk, { dk, nom: m.name || dk, equipe: m.team || '', msgs: [] });
    const c = g.get(dk); if (m.name) c.nom = m.name; if (m.team) c.equipe = m.team;
    c.msgs.push({ moi: false, texte: apercu(m.text, 600) + (m.hasImg ? ' 📷' : ''), ts: +m.ts || 0 });
  }
  for (const [dk, arr] of Object.entries(rep && typeof rep === 'object' ? rep : {})) {
    if (!g.has(dk)) g.set(dk, { dk, nom: dk, equipe: '', msgs: [] });
    for (const r of liste(arr)) if (r.text) g.get(dk).msgs.push({ moi: true, texte: apercu(r.text, 600), ts: +r.ts || 0 });
  }
  const items = [];
  for (const c of g.values()) {
    c.msgs.sort((a, b) => a.ts - b.ts);
    const lu = parseInt((lus && lus[c.dk]) || 0, 10) || 0;
    const nl = c.msgs.filter((m) => !m.moi && m.ts > lu).length;
    const dernierEux = [...c.msgs].reverse().find((m) => !m.moi);
    items.push({ cle: 'cmc:' + c.dk, source: 'cmcteams', app: 'cmcteams.kd-mc.com', de: c.nom + (c.equipe ? ' · ' + c.equipe : ''), ts: c.msgs.length ? c.msgs[c.msgs.length - 1].ts : 0,
      texte: dernierEux ? dernierEux.texte : '', nonLus: nl, lu: !nl, repondre: 'direct', fil: c.msgs.slice(-LIMITES.fil) });
  }
  return items.sort((a, b) => b.ts - a.ts).slice(0, LIMITES.convs);
}

/* ── adaptateurs KV (lecture seule) + état « lu » en D1 ───────────────────────────────────────────────────── */
async function luesD1(db, cles) {
  if (!cles.length) return new Set();
  const r = await tous(db, `SELECT cle FROM boite_lu WHERE cle IN (${cles.map(() => '?').join(',')})`, ...cles);
  return new Set(r.map((x) => x.cle));
}
async function lireRotaplan(env, db) {
  if (!env.ACCOUNTS) return [];
  const idx = JSON.parse((await env.ACCOUNTS.get('demandes:idx')) || '[]').slice(-15).reverse();
  const out = [];
  for (const k of idx) { const v = await env.ACCOUNTS.get(k); if (v) { try { out.push({ k, d: JSON.parse(v) }); } catch { /* ligne illisible : ignorée */ } } }
  const lues = await luesD1(db, out.map((x) => 'demande:' + x.k));
  return out.map(({ k, d }) => ({ cle: 'demande:' + k, source: 'rotaplan', app: 'rotaplan.kd-mc.com', de: propre((d.prenom || '') + ' ' + (d.nom || ''), 80) || 'Demande', ts: d.ts || 0,
    texte: apercu([d.etablissement, d.fonction, d.effectif && 'effectif ' + d.effectif, d.rotations].filter(Boolean).join(' · '), 500), contact: propre(d.email, 120),
    nonLus: lues.has('demande:' + k) ? 0 : 1, lu: lues.has('demande:' + k), repondre: 'mailto',
    mailto: d.email ? 'mailto:' + encodeURIComponent(d.email).replace(/%40/g, '@') + '?subject=' + encodeURIComponent('Rotaplan — ta demande de démonstration') : '', fil: [] }));
}
async function lireArbre(env, db) {
  if (!env.ACCOUNTS) return [];
  let j = []; try { j = JSON.parse((await env.ACCOUNTS.get('arbre:journal')) || '[]'); } catch { j = []; }
  j = (Array.isArray(j) ? j : []).filter((e) => e && e.ts).slice(0, 15);
  const cles = j.map((e) => 'arbre:' + e.ts + '-' + propre(e.id, 20));
  const lues = await luesD1(db, cles);
  return j.map((e, i) => ({ cle: cles[i], source: 'arbre', app: 'arbre.kd-mc.com', de: propre(e.par, 60) || 'Un membre de la famille', ts: e.ts,
    texte: apercu(propre(e.type, 20) + ' · ' + propre(e.qui, 80) + ' — ' + (Array.isArray(e.champs) ? e.champs.slice(0, 3).map((c) => c.c + ' : ' + (c.avant || '∅') + ' → ' + (c.apres || '∅')).join(' · ') : ''), 400),
    nonLus: lues.has(cles[i]) ? 0 : 1, lu: lues.has(cles[i]), repondre: null, fil: [] }));
}
const EV_ALERTES = { nouvelle_connexion: '🆕 Nouvelle connexion', nouvel_inscrit: '🆕 Nouvel inscrit', new_device: '🔐 Nouvel appareil', geo_anomaly: '⚠️ Connexion suspecte',
  quota_inscriptions_atteint: '🛑 Inscriptions suspendues', admin_login_fail: '🚫 Code admin refusé', matricule_refuse: '🪪 Matricule SBM refusé',
  pointage_loin: '📍 Pointage loin du casino', inscription_refusee: '🚫 Inscription refusée' };
/* « TOUTES LES INFOS POSSIBLES » (Kevin 4.10) : une alerte se déplie en lignes lisibles — qui, où, quel appareil, quel réseau, pourquoi. */
export function infosAlerte(e) {
  const l = [];
  if (e.name || e.uid) l.push('👤 ' + (e.name || '?') + (e.uid ? ' (' + e.uid + ')' : ''));
  if (e.app) l.push('📱 ' + e.app + (e.page || ''));
  if (e.device) l.push('🖥️ ' + e.device + (e.os && !String(e.device).includes(e.os) ? ' · ' + e.os : ''));
  if (e.place) l.push('🌍 ' + e.place);
  if (e.ev === 'geo_anomaly') l.push('↔️ Avant : ' + (e.lieu_precedent || e.pays_precedent || '?') + (e.isp_precedent ? ' · ' + e.isp_precedent + (e.asn_precedent ? ' (AS' + e.asn_precedent + ')' : '') : '') + ' — il y a ' + (e.mins != null ? e.mins : '?') + ' min');
  if (e.isp) l.push('🛰️ ' + e.isp + (e.asn ? ' (AS' + e.asn + ')' : '') + (e.vpn ? ' · VPN/hébergeur' : ''));
  if (e.lang || e.tz) l.push('🗣️ ' + [e.lang, e.tz].filter(Boolean).join(' · '));
  if (e.arrivee) l.push('🚪 Arrivé par : ' + e.arrivee);
  if (e.ev === 'geo_anomaly') l.push('ℹ️ Même compte vu dans deux pays à moins d\'une heure, par des réseaux ordinaires (ni Relais privé iCloud, ni VPN) : à vérifier.');
  return l;
}
/* 6.10 (Kevin, capture « Code admin refusé » ×5 sans texte, bulle vide) : chaque alerte dit en clair ce qui s'est passé, depuis où,
   et les répétitions (même événement, même appareil, à moins de 30 min d'écart) ne font qu'UNE carte « ×5 ». */
const GROUPE_MS = 30 * 6e4;
export function texteAlerte(e) {
  const base = e.detail || e.text || e.name || (e.ev === 'admin_login_fail' ? 'Un mauvais code admin a été tapé' : '');
  const ou = [e.app && e.app !== 'domaine' ? 'depuis ' + e.app : '', e.pays ? 'pays ' + e.pays : '', e.uid ? 'compte ' + e.uid : '',
    e.ip ? 'appareil n° ' + String(e.ip).slice(0, 6) : ''].filter(Boolean).join(' · ');
  return apercu(base + (base && ou ? ' — ' : '') + ou, 300);
}
export function grouperAlertes(liste) {
  const out = [];
  for (const e of liste) {
    const g = out.at(-1);
    const meme = g && (g.ev || g.type) === (e.ev || e.type) && (g.ip || g.uid || '') === (e.ip || e.uid || '') && (g.app || '') === (e.app || '');
    if (meme && g._dernier - e.ts <= GROUPE_MS) { g._n++; g._dernier = e.ts; continue; }
    out.push({ ...e, _n: 1, _dernier: e.ts });
  }
  return out;
}
async function lireAlertes(env, db, now) {
  if (!env.ACCOUNTS) return [];
  let j = []; try { j = JSON.parse((await env.ACCOUNTS.get('aud:log')) || '[]'); } catch { j = []; }
  /* Les changements de pays enregistrés AVANT le 4.10 n'ont pas de réseau noté : impossible de dire si c'était le Relais privé iCloud → écartés. */
  j = grouperAlertes((Array.isArray(j) ? j : []).filter((e) => e && e.ts && EV_ALERTES[e.ev || e.type] && !((e.ev === 'geo_anomaly') && (e.asn === undefined || e.masque))).slice(0, 40)).slice(0, 15);
  const cles = j.map((e) => 'alerte:' + e.ts + '-' + (e.ev || e.type));
  const lues = await luesD1(db, cles);
  /* Une alerte de plus de 48 h est lue d'office : elle reste visible (historique) mais ne fait plus de rouge — mesuré par Kevin le 4.10 :
     14 alertes de 6 jours « non lues » passaient devant ses vrais messages. */
  return j.map((e, i) => { const vue = lues.has(cles[i]) || now - e.ts > LIMITES.alerteFraicheur;
    const n = e._n > 1 ? ' ×' + e._n : '';
    const duree = e._n > 1 ? ' (' + e._n + ' fois en ' + Math.max(1, Math.round((e.ts - e._dernier) / 6e4)) + ' min)' : '';
    return { cle: cles[i], source: 'alertes', app: e.app || 'domaine', de: EV_ALERTES[e.ev || e.type] + n, ts: e.ts,
      texte: texteAlerte(e) + duree, infos: infosAlerte(e), nonLus: vue ? 0 : 1, lu: vue, repondre: null, fil: [] }; });
}
/* ── adaptateur : dépôts des autres apps (D1) ─────────────────────────────────────────────────────────────── */
async function lireDepots(db) {
  const rows = await tous(db, 'SELECT * FROM boite ORDER BY id DESC LIMIT ?', LIMITES.convs);
  return rows.map((r) => ({ cle: 'depot:' + r.id, source: 'depots', app: r.app + '.kd-mc.com', de: (r.nom || 'Anonyme') + (r.uid ? '' : ' (non connecté)'), ts: r.cree, texte: apercu(r.texte, 600), contact: r.contact || '',
    nonLus: r.lu ? 0 : 1, lu: !!r.lu, repondre: 'direct',
    /* « j'ai toutes les infos » : qui (compte), depuis quelle app et quelle page, quel appareil, d'où */
    infos: [r.uid ? '👤 Compte : ' + (r.nom || '?') + ' (' + r.uid + ')' : '👤 Non connecté', '📱 ' + r.app + '.kd-mc.com' + (r.page || ''), r.appareil ? '🖥️ ' + r.appareil + (r.pays ? ' · ' + r.pays : '') : '', r.contact ? '✉️ ' + r.contact : ''].filter(Boolean),
    fil: [{ moi: false, texte: apercu(r.texte, 600), ts: r.cree }].concat(r.reponse ? [{ moi: true, texte: apercu(r.reponse, 600), ts: r.repondu || r.cree }] : []) }));
}

/* ── INSCRIPTIONS EN ATTENTE (Kevin 7.10.2026 : « Je dois voir les inscriptions etc en attente dans le domaine en dessous des messages
   et dans light. Je débloque de partout où j'ai envie. J'ai une alerte visuelle d'un message ou inscription en attente. ») ──────────
   MESURÉ avant : CMCteams montrait « 1 code à valider » sur une carte SANS bouton, et la fonction de validation n'était reliée à aucun
   écran ; une inscription INCOMPLÈTE (sans les renseignements qui la valident seule, v9.927) restait bloquée à la connexion (« En attente
   de validation par Kevin ») sans que Kevin puisse rien faire. Ici, lues dans CMCteams (Firebase, jeton admin du domaine) :
     - une fiche (cmc_reg) ni validée ni rattachée à une équipe du planning, créée il y a moins de 60 jours ;
     - un code d'inscription (cmcteams_secret/codes) encore valable, pas utilisé.
   Valider = la fiche passe « validée par Kevin » + le code est marqué utilisé. La personne entre à sa prochaine connexion. */
export const INSCRIPTIONS_JOURS = 60;
const ID_INSCRIT = /^[A-Za-z0-9_-]{2,40}$/;
const FB_RACINE = FB_URL.replace(/\/cmcteams$/, '');
async function fbRacine(outils, chemin, methode, corps) {
  const f = outils.fetch || fetch;
  let jeton = ''; try { jeton = (outils.fbToken && (await outils.fbToken())) || ''; } catch { jeton = ''; }
  const r = await f(FB_RACINE + '/' + chemin.split('/').map(encodeURIComponent).join('/') + '.json' + (jeton ? '?auth=' + encodeURIComponent(jeton) : ''), {
    method: methode || 'GET', headers: { 'content-type': 'application/json' }, body: corps === undefined ? undefined : JSON.stringify(corps), signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('firebase ' + r.status);
  return r.json();
}
const valide = (r) => r && (r.verified === true || r.verifiedByAdmin === true);
/* PURE : la liste des inscriptions en attente (la plus récente d'abord, 30 au plus). */
export function enAttente(reg, codes, employes, now) {
  const equipe = new Set(liste(employes).filter((e) => e.id && e.team && e.team !== '?').map((e) => String(e.id)));
  const R = reg && typeof reg === 'object' ? reg : {}, out = new Map();
  const nomDe = (x, id) => propre(((x.prenom || '') + ' ' + (x.nom || '')).trim(), 80) || id;
  for (const [id, r] of Object.entries(R)) {
    if (!r || typeof r !== 'object' || !ID_INSCRIT.test(id) || valide(r) || r.refuse || equipe.has(id)) continue;
    const ts = +r.createdAt || 0;
    if (!ts || now - ts > INSCRIPTIONS_JOURS * 864e5) continue;
    out.set(id, { id, nom: nomDe(r, id), matricule: propre(r.matricule || '', 10), ts, code: false });
  }
  for (const [id, c] of Object.entries(codes && typeof codes === 'object' ? codes : {})) {
    if (!c || typeof c !== 'object' || c.used || !(+c.expiresAt > now) || !ID_INSCRIT.test(id) || valide(R[id])) continue;
    const x = out.get(id) || { id, nom: nomDe(c, id), matricule: propre((R[id] && R[id].matricule) || '', 10), ts: +c.createdAt || now, code: true };
    x.code = true; out.set(id, x);
  }
  return [...out.values()].sort((a, b) => b.ts - a.ts).slice(0, 30);
}
async function lireInscriptions(outils, now) {
  const [reg, codes, employes] = await Promise.all([fb(outils, 'cmc_reg'), fbRacine(outils, 'cmcteams_secret/codes').catch(() => null), fb(outils, 'cmc_e').catch(() => null)]);
  return enAttente(reg, codes, employes, now);
}
async function validerInscription(outils, id, now) {
  if (!ID_INSCRIT.test(id)) return { ok: false, reason: 'inscription_invalide' };
  const r = await fb(outils, 'cmc_reg/' + id).catch(() => null);
  if (!r || typeof r !== 'object') return { ok: false, reason: 'inscription_introuvable' };
  if (!valide(r)) await fb(outils, 'cmc_reg/' + id, 'PATCH', { verified: true, verifiedAt: now, verifiedByAdmin: true, updatedAt: now });
  await fbRacine(outils, 'cmcteams_secret/codes/' + id, 'PATCH', { used: true, usedAt: now, validatedByAdmin: true }).catch(() => null);
  memo.delete('inscriptions');
  return { ok: true, nom: propre(((r.prenom || '') + ' ' + (r.nom || '')).trim(), 80) || id };
}

/* ── la réponse unique ────────────────────────────────────────────────────────────────────────────────────── */
export async function lireBoite(env, outils, now) {
  const db = env.CERCLE_DB;
  if (db) await schema(db);   // idempotent : les tables existent aussi quand on lit sans être passé par la route
  const essais = {
    lingua: () => lireLingua(db), cmcteams: () => lireCmcteams(outils), depots: () => lireDepots(db),
    rotaplan: () => lireRotaplan(env, db), arbre: () => lireArbre(env, db), alertes: () => lireAlertes(env, db, now),
  };
  const noms = Object.keys(essais);
  const res = await Promise.allSettled(noms.map((n) => memoise(n, now, essais[n])));
  const sources = {}; let messages = [];
  noms.forEach((n, i) => {
    const r = res[i];
    if (r.status === 'fulfilled') { sources[n] = Object.assign({ id: n, etat: 'ok', total: r.value.length, nonLus: r.value.reduce((s, x) => s + (x.nonLus || 0), 0) }, SOURCES[n]); messages = messages.concat(r.value); }
    else sources[n] = Object.assign({ id: n, etat: 'indisponible', total: 0, nonLus: 0, raison: String(r.reason && r.reason.message || r.reason).slice(0, 80) }, SOURCES[n]);
  });
  const rang = (x) => (x.nonLus ? (x.source === 'alertes' ? 1 : 2) : 0);   // les vrais messages non lus d'abord, puis les alertes non lues
  messages.sort((a, b) => rang(b) - rang(a) || b.ts - a.ts);
  const nonLus = SOURCES_MESSAGES.reduce((s, n) => s + sources[n].nonLus, 0);
  let inscriptions = [], inscriptionsEtat = 'ok';
  try { inscriptions = await memoise('inscriptions', now, () => lireInscriptions(outils, now)); } catch (e) { inscriptionsEtat = 'indisponible'; }
  const connectes = db ? ((await un(db, 'SELECT COUNT(*) AS n FROM profils WHERE vu > ? AND uid != ?', now - LIM_CERCLE.enLigneMs, ADMIN).catch(() => null)) || {}).n || 0 : 0;
  return { ok: true, nonLus, nonLusAlertes: sources.alertes.nonLus, connectes, sources: Object.values(sources), messages: messages.slice(0, LIMITES.liste),
    inscriptions, inscriptionsEtat, lienInscriptions: 'https://cmcteams.kd-mc.com/', maj: now };
}

/* ── marquer lu / répondre ────────────────────────────────────────────────────────────────────────────────── */
const CLE_FB = /^[^./$#\[\]\s][^./$#\[\]]{0,119}$/;   // une clé Firebase ne contient ni « / » ni « . » ni « $ # [ ] » : jamais un chemin glissé
async function marquerLu(env, outils, cle, now) {
  const db = env.CERCLE_DB; const i = cle.indexOf(':'); const t = cle.slice(0, i), id = cle.slice(i + 1);
  if (t === 'cmc' && !CLE_FB.test(id)) return false;
  if (t === 'lingua') await faire(db, 'UPDATE messages SET lu = 1 WHERE a = ? AND de = ?', ADMIN, id);
  else if (t === 'cmc') await fb(outils, 'cmc_dep_read/' + id, 'PUT', now);
  else if (t === 'depot') await faire(db, 'UPDATE boite SET lu = 1 WHERE id = ?', +id || 0);
  else if (['demande', 'arbre', 'alerte'].includes(t)) await faire(db, 'INSERT OR REPLACE INTO boite_lu (cle, ts) VALUES (?, ?)', cle.slice(0, 120), now);
  else return false;
  memo.clear(); return true;
}
async function repondre(env, outils, cle, texte, now) {
  const db = env.CERCLE_DB; const i = cle.indexOf(':'); const t = cle.slice(0, i), id = cle.slice(i + 1);
  if (t === 'cmc' && !CLE_FB.test(id)) return { ok: false, reason: 'conversation_invalide' };
  if (t === 'lingua') {
    const ck = texteOk(texte, true); if (!ck.ok) return { ok: false, reason: ck.raison };
    if (!(await un(db, 'SELECT 1 AS o FROM messages WHERE de = ? AND a = ?', id, ADMIN))) return { ok: false, reason: 'conversation_introuvable' };
    if (await un(db, 'SELECT 1 AS o FROM blocages WHERE qui = ? AND bloque = ?', id, ADMIN)) return { ok: false, reason: 'bloque' };
    await faire(db, 'INSERT INTO messages (de, a, type, corps, cadeau, cree) VALUES (?, ?, ?, ?, ?, ?)', ADMIN, id, 'texte', ck.texte, null, now);
  } else if (t === 'cmc') {
    const rid = 'r_' + now + '_' + Math.random().toString(36).slice(2, 6);
    const cur = liste(await fb(outils, 'cmc_dep_reply/' + id).catch(() => null));
    cur.push({ id: rid, text: texte, ts: now });
    await fb(outils, 'cmc_dep_reply/' + id, 'PUT', cur.slice(-50));
  } else if (t === 'depot') {
    const r = await faire(db, 'UPDATE boite SET reponse = ?, repondu = ? WHERE id = ?', texte, now, +id || 0);
    if (!r || !r.meta || r.meta.changes !== 1) return { ok: false, reason: 'message_introuvable' };
  } else if (t === 'demande') return { ok: false, reason: 'reponse_par_email' };
  else return { ok: false, reason: 'pas_de_reponse_directe' };
  await marquerLu(env, outils, cle, now);
  return { ok: true };
}

/* ── le routeur ───────────────────────────────────────────────────────────────────────────────────────────── */
const ORIGINE_DOMAINE = /^https:\/\/([a-z0-9-]+\.)*kd-mc\.com$/i;
async function empreinte(txt) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 24);
}
export async function handleBoite(request, url, env, outils) {
  const origine = request.headers.get('origin') || '';
  const cors = ORIGINE_DOMAINE.test(origine) ? { 'Access-Control-Allow-Origin': origine, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' } : {};
  const J = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: Object.assign({ 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }, cors) });
  const db = env && env.CERCLE_DB;
  if (!db) return J({ ok: false, reason: 'boite_indisponible' });
  const now = (outils.now && outils.now()) || Date.now();
  const p = url.pathname.replace(/^\/__boite/, '') || '/';
  const m = request.method;
  try {
    if (m === 'OPTIONS') return new Response(null, { status: 204, headers: Object.assign({ 'Access-Control-Allow-Methods': 'GET,POST', 'Access-Control-Allow-Headers': 'content-type,authorization' }, cors) });
    await schema(db);
    /* Le bouton « Écrire à l'admin », servi à TOUTES les apps (le routeur l'ajoute à chaque page). */
    if (p === '/bouton.js' && m === 'GET') return new Response(BOUTON_JS, { status: 200, headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'public, max-age=600', 'x-content-type-options': 'nosniff' } });
    /* « Ouvrir ma boîte » depuis le bouton de n'importe quelle app : vers la boîte du portail (le bouton ne porte aucune adresse extérieure). */
    if (p === '/ouvrir' && m === 'GET') return new Response(null, { status: 302, headers: { location: 'https://kd-mc.com/#messages', 'cache-control': 'no-store' } });
    /* « Mes messages » : ceux du compte connecté (toutes apps) + ceux d'un visiteur non connecté (ses suivis secrets). L'admin est reconnu : le bouton se retire. */
    if (p === '/mes' && m === 'GET') {
      const qui = await outils.qui(request).catch(() => null);
      /* L'admin : pas de « écrire à l'admin », mais SES compteurs (messages non lus + inscriptions en attente) pour la pastille de chaque app. */
      if (qui && qui.admin) {
        const bo = await lireBoite(env, outils, now).catch(() => null);
        return J({ ok: true, admin: true, connecte: true, messages: [], nonLus: (bo && bo.nonLus) || 0, inscriptions: (bo && bo.inscriptions) || [] });
      }
      const suivis = String(url.searchParams.get('s') || '').split(',').filter((x) => /^[0-9a-f]{24}$/.test(x)).slice(0, 5);
      const rows = [];
      if (qui && qui.uid) rows.push(...await tous(db, 'SELECT app, texte, cree, reponse, repondu FROM boite WHERE uid = ? AND cree > ? ORDER BY id DESC LIMIT 10', qui.uid, now - LIMITES.garde));
      /* plus de lecture « par suivi » sans compte (3.10) : les anciens messages anonymes ne se relisent plus, l'admin les voit toujours */
      rows.sort((a, b) => b.cree - a.cree);
      /* 7.10 (Kevin : « CGU une seule fois par compte, valables dans tout le domaine ; aucune connexion sans accord ») : un compte
         connecté qui n'a pas accepté les conditions EN COURS les reçoit ici — le bouton de chaque page les montre, une fois. */
      const cgu = qui && qui.uid && qui.cgu === false && outils.cgu ? Object.assign({ requise: true }, outils.cgu) : null;
      return J({ ok: true, admin: false, connecte: !!(qui && qui.uid), nom: (qui && qui.nom) || '', cgu, messages: rows.slice(0, 10).map((r) => ({ app: r.app, texte: apercu(r.texte, 600), ts: r.cree, reponse: r.reponse || '', repondu: r.repondu || 0 })) });
    }
    /* La réponse relue par l'expéditeur d'un dépôt : seulement avec SON compte (aucune consultation sans compte, Kevin 3.10) et le suivi secret de CE message. */
    if (p === '/reponse' && m === 'GET') {
      const qui = await outils.qui(request).catch(() => null);
      if (!qui || !qui.uid || qui.admin) return J({ ok: false, reason: 'compte_requis' }, 401);
      const s = propre(url.searchParams.get('suivi'), 40);
      const r = s.length >= 16 ? await un(db, 'SELECT reponse, repondu FROM boite WHERE suivi = ? AND uid = ?', s, qui.uid) : null;
      return J(r ? { ok: true, repondu: !!r.reponse, reponse: r.reponse || '', ts: r.repondu || 0 } : { ok: false, reason: 'introuvable' }, r ? 200 : 404);
    }
    /* Dépôt : n'importe quelle app du domaine (présente ou future) écrit à l'admin avec UN appel. */
    if (p === '/deposer' && m === 'POST') {
      if (!ORIGINE_DOMAINE.test(origine)) return J({ ok: false, reason: 'origine_refusee' }, 403);
      /* Aucune consultation ni message sans compte (Kevin 3.10) : l'identité vient de la SESSION du domaine, jamais de la page. */
      const qui = await outils.qui(request).catch(() => null);
      const connecte = qui && qui.uid && !qui.admin;
      if (!connecte) return J({ ok: false, reason: 'compte_requis' }, 401);
      let b = {}; try { b = await request.json(); } catch { return J({ ok: false, reason: 'json_illisible' }, 400); }
      if (propre(b.site, 10)) return J({ ok: true, suivi: 'x'.repeat(24) });                 // champ piège rempli = robot : on ne dit rien
      const texte = propre(b.texte, LIMITES.texte);
      if (texte.length < 2) return J({ ok: false, reason: 'message_vide' }, 400);
      const app = propre(b.app || new URL(origine).hostname.split('.')[0], 30).toLowerCase().replace(/[^a-z0-9-]/g, '') || 'domaine';
      const ip = await empreinte((request.headers.get('CF-Connecting-IP') || '') + '|boite');
      if (((await un(db, 'SELECT COUNT(*) AS n FROM boite WHERE ip = ? AND cree > ?', ip, now - 36e5)).n || 0) >= LIMITES.depotHeure) return J({ ok: false, reason: 'trop_de_messages' }, 429);
      if (((await un(db, 'SELECT COUNT(*) AS n FROM boite WHERE cree > ?', now - 864e5)).n || 0) >= LIMITES.depotJour) return J({ ok: false, reason: 'boite_pleine_aujourd_hui' }, 429);
      const suivi = [...crypto.getRandomValues(new Uint8Array(12))].map((x) => x.toString(16).padStart(2, '0')).join('');
      /* L'identité vient de la SESSION du domaine, jamais de la page : une personne connectée ne peut pas écrire sous le nom d'une autre. */
      const nom = propre(qui.nom, 60) || 'Compte', contact = '';
      const page = propre(b.page, 120).replace(/^(?!\/)/, '/').slice(0, 120);
      await faire(db, 'INSERT INTO boite (app, nom, texte, contact, ip, suivi, cree, uid, page, appareil, pays) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        app, nom, texte, contact, ip, suivi, now, qui.uid, page, appareilDe(request.headers.get('user-agent')), propre(request.cf && request.cf.country, 3));
      await faire(db, 'DELETE FROM boite WHERE cree < ?', now - LIMITES.garde);
      memo.delete('depots');
      if (outils.notifier) await outils.notifier('📨 ' + app + ' — ' + nom, texte.slice(0, 140));
      return J({ ok: true, suivi });
    }
    /* Tout le reste : l'admin, prouvé par le domaine. */
    if (!p.startsWith('/admin')) return J({ ok: false, reason: 'introuvable' }, 404);
    const qui = await outils.qui(request);
    if (!qui || !qui.admin) return J({ ok: false, reason: 'admin_requis' }, 401);
    if (m !== 'GET' && origine && !ORIGINE_DOMAINE.test(origine)) return J({ ok: false, reason: 'origine_refusee' }, 403);
    if (p === '/admin' && m === 'GET') return J(await lireBoite(env, outils, now));
    let b = {}; if (m === 'POST') { try { b = await request.json(); } catch { b = {}; } }
    if (p === '/admin/lu' && m === 'POST') {
      const cles = (Array.isArray(b.cles) ? b.cles : []).map((c) => propre(c, 120)).filter((c) => c.includes(':')).slice(0, 100);
      let n = 0; for (const c of cles) { if (await marquerLu(env, outils, c, now).catch(() => false)) n++; }
      return J({ ok: true, n });
    }
    if (p === '/admin/valider' && m === 'POST') {
      const r = await validerInscription(outils, propre(b.id, 40), now);
      return J(r, r.ok ? 200 : 400);
    }
    if (p === '/admin/repondre' && m === 'POST') {
      const texte = propre(b.texte, LIMITES.reponse);
      if (texte.length < 1) return J({ ok: false, reason: 'reponse_vide' }, 400);
      const r = await repondre(env, outils, propre(b.cle, 120), texte, now);
      return J(r, r.ok ? 200 : 400);
    }
    return J({ ok: false, reason: 'introuvable' }, 404);
  } catch (e) { return J({ ok: false, reason: 'erreur', detail: String(e && e.message || e).slice(0, 120) }, 500); }
}
