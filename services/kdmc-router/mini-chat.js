/* ═══ LE MINI-CHAT DIRECT KEVIN ⇄ CHAQUE PERSONNE (CMCteams et la light) ═══
 *
 * Kevin, 5.11.2026 : « Dans CMC Teams, je veux la possibilité d'envoyer un message à une personne qui s'affichera sur son application
 * quand elle l'ouvre à sa prochaine connexion, et qu'elle ait la possibilité de me répondre. Un mini chat direct avec moi et seulement
 * avec moi, de chaque personne. Que tout le monde puisse m'envoyer des messages, un petit historique qui reste, qu'on peut vider.
 * Toutes les fonctionnalités d'un chat. En cliquant sur une personne dans le planning, ou en la sélectionnant dans la liste, je lui
 * envoie un message, lu à sa prochaine connexion, et elle me répond. Toujours gratuit. »
 *
 * UN fil par personne, toujours entre CETTE personne et Kevin (jamais entre deux employés : un membre ne lit que SON fil).
 * OÙ C'EST RANGÉ : base D1 gratuite `kdmc-cercle` (comme la boîte), JAMAIS le KV (1 000 écritures/jour, déjà dépassées) et JAMAIS Firebase
 * (lisible par tout compte connecté : un fil privé n'y serait pas privé).
 *
 * QUI EST QUI (sécurité, rien n'est demandé à la page) :
 *   - Kevin = l'admin PROUVÉ par le domaine (outils.qui().admin), jamais un nom déclaré.
 *   - Une personne = une session du domaine dont le CODE est prouvé (outils.qui().prouve = code ou Face ID). Un nom simplement déclaré n'ouvre
 *     RIEN : sinon n'importe qui taperait « Laurence X » et lirait ses messages.
 *   - LA CLÉ DU FIL = les mots du NOM de la personne, sans accent ni majuscule, rangés par ordre alphabétique (donc « MORTER Laurent »,
 *     « Laurent Morter » et « Morter-Laurent » donnent le même fil). Jamais le matricule : la fiche du domaine laisse chacun écrire le
 *     matricule qu'il veut (lu en code, 5.11) — s'en servir permettrait de lire le fil d'un autre.
 *   - LE FIL EST LIÉ À UN COMPTE (revue sécurité 5.11) : « Léa Martin » et « Martin Léa » sont deux comptes pour le domaine mais une seule clé ici ;
 *     sans lien, un homonyme inscrit dans l'autre ordre lirait le fil. Le fil est donc lié à l'uid canonique du compte : posé quand Kevin écrit à un
 *     nom qui a déjà un compte (`outils.uidDe`), sinon au PREMIER compte vérifié et non en attente qui l'ouvre. Un autre compte = 403 `autre_compte`.
 *     Kevin voit si le fil est lié et peut le délier (`/admin/delier`). Un compte en attente de validation n'ouvre rien.
 *   - Écriture : origine *.kd-mc.com exigée (un site tiers ne peut pas écrire avec la session de la personne).
 *
 * GARDE-FOUS : 500 caractères max, 40 messages/jour/personne, 150 messages gardés par fil (les plus vieux partent), texte toujours nettoyé,
 * « vider » = chacun vide SA vue (l'autre garde la sienne), un message retiré est effacé des deux côtés, aucune ligne lue pour une autre clé.
 * COÛT D1 : le badge d'une personne = 1 ligne (clé primaire) ; son fil = 100 lignes au plus (index cle,id) ; la liste de Kevin = 200 lignes au
 * plus (une ligne par personne dans dm_fil, jamais un balayage de dm) ; jamais de COUNT(*) sur la table entière.
 * Tests : services/kdmc-router/mini-chat.test.mjs (D1 simulée sur SQLite). Règle : .claude/rules/mini-chat-direct.md */

export const LIMITES = { texteMax: 500, parJour: 40, historique: 150, vue: 100, filsAdmin: 200, nomMax: 60 };
export const REACTIONS = ['👍', '❤️', '😂', '🙏', '👀'];
const ORIGINE_DOMAINE = /^https:\/\/([a-z0-9-]+\.)*kd-mc\.com$/i;
const CLE_OK = /^[a-z0-9]+(-[a-z0-9]+){1,7}$/;

/* La clé du fil : mots du nom, minuscules, sans accent, ordre alphabétique. Moins de deux mots = pas de clé (un prénom seul n'identifie personne). */
export function cleDe(nom) {
  const mots = String(nom || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  if (mots.length < 2 || mots.length > 8) return '';
  const cle = mots.sort().join('-');
  return cle.length <= 80 ? cle : '';
}
export function nettoyer(t) {
  return String(t == null ? '' : t).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, LIMITES.texteMax);
}
function nomPropre(n) { return String(n || '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, LIMITES.nomMax); }

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS dm (id INTEGER PRIMARY KEY AUTOINCREMENT, cle TEXT NOT NULL, de TEXT NOT NULL, texte TEXT NOT NULL, cree INTEGER NOT NULL,
    lu INTEGER NOT NULL DEFAULT 0, lu_at INTEGER NOT NULL DEFAULT 0, cache_a INTEGER NOT NULL DEFAULT 0, cache_m INTEGER NOT NULL DEFAULT 0,
    retire INTEGER NOT NULL DEFAULT 0, reac_a TEXT NOT NULL DEFAULT '', reac_m TEXT NOT NULL DEFAULT '')`,
  `CREATE INDEX IF NOT EXISTS dm_cle ON dm (cle, id)`,
  `CREATE TABLE IF NOT EXISTS dm_fil (cle TEXT PRIMARY KEY, nom TEXT NOT NULL DEFAULT '', dernier TEXT NOT NULL DEFAULT '', dernier_de TEXT NOT NULL DEFAULT '',
    maj INTEGER NOT NULL DEFAULT 0, nonlus_a INTEGER NOT NULL DEFAULT 0, nonlus_m INTEGER NOT NULL DEFAULT 0, uid TEXT NOT NULL DEFAULT '')`,
];
const MIGRATIONS = [`ALTER TABLE dm_fil ADD COLUMN uid TEXT NOT NULL DEFAULT ''`];   /* base créée avant le lien au compte ; l'erreur « colonne déjà là » est normale */
const _prets = new WeakSet();
export async function schema(db) {
  if (_prets.has(db)) return;
  for (const sql of SCHEMA) await db.prepare(sql).run();
  for (const sql of MIGRATIONS) { try { await db.prepare(sql).run(); } catch { /* déjà faite */ } }
  _prets.add(db);
}
const un = async (db, sql, ...p) => db.prepare(sql).bind(...p).first();
const tous = async (db, sql, ...p) => (await db.prepare(sql).bind(...p).all()).results || [];
const faire = async (db, sql, ...p) => db.prepare(sql).bind(...p).run();

/* Recalcule la ligne « aperçu » du fil (celle que lit la liste de Kevin et le badge de la personne) : au plus 150 lignes lues, par l'index. */
async function majFil(db, cle, nom, now, uid) {
  const l = await tous(db, 'SELECT id, de, texte, retire, cree, lu, cache_a, cache_m FROM dm WHERE cle = ? ORDER BY id DESC LIMIT ?', cle, LIMITES.historique + 1);
  const visA = l.filter((x) => !x.cache_a);
  if (!visA.length) { await faire(db, 'DELETE FROM dm_fil WHERE cle = ?', cle); return; }
  const nonA = l.filter((x) => x.de === 'm' && !x.lu && !x.cache_a && !x.retire).length;
  const nonM = l.filter((x) => x.de === 'a' && !x.lu && !x.cache_m && !x.retire).length;
  const dernier = visA[0];
  await faire(db, `INSERT INTO dm_fil (cle, nom, dernier, dernier_de, maj, nonlus_a, nonlus_m, uid) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(cle) DO UPDATE SET nom = CASE WHEN ? != '' THEN ? ELSE dm_fil.nom END, dernier = excluded.dernier, dernier_de = excluded.dernier_de, maj = excluded.maj,
      nonlus_a = excluded.nonlus_a, nonlus_m = excluded.nonlus_m, uid = CASE WHEN dm_fil.uid = '' THEN excluded.uid ELSE dm_fil.uid END`,
    cle, nom || '', dernier.retire ? '' : dernier.texte.slice(0, 80), dernier.de, dernier.cree || now, nonA, nonM, uid || '', nom || '', nom || '');
}
function vue(m, cote) {   /* cote = 'a' (Kevin) ou 'm' (la personne) : « moi » est celui qui regarde */
  const autre = cote === 'a' ? 'm' : 'a';
  return { id: m.id, moi: m.de === cote, texte: m.retire ? '' : m.texte, retire: !!m.retire, cree: m.cree, lu: !!m.lu, lu_at: m.lu_at || 0,
    reac: { moi: m['reac_' + cote] || '', autre: m['reac_' + autre] || '' } };
}
async function fil(db, cle, cote) {
  const cache = cote === 'a' ? 'cache_a' : 'cache_m';
  const l = await tous(db, `SELECT id, de, texte, cree, lu, lu_at, retire, reac_a, reac_m FROM dm WHERE cle = ? AND ${cache} = 0 ORDER BY id DESC LIMIT ?`, cle, LIMITES.vue);
  return l.reverse().map((m) => vue(m, cote));
}
async function vider(db, cle, cote, now) {
  await faire(db, `UPDATE dm SET ${cote === 'a' ? 'cache_a' : 'cache_m'} = 1 WHERE cle = ?`, cle);
  await faire(db, 'DELETE FROM dm WHERE cle = ? AND cache_a = 1 AND cache_m = 1', cle);
  await majFil(db, cle, '', now);
}
async function ajouter(db, cle, cote, texte, nom, now) {
  const r = await faire(db, 'INSERT INTO dm (cle, de, texte, cree) VALUES (?, ?, ?, ?)', cle, cote, texte, now);
  /* seuls les 150 derniers messages restent : le plus vieux part (l'id du 151ᵉ en partant de la fin) */
  const borne = await un(db, 'SELECT id FROM dm WHERE cle = ? ORDER BY id DESC LIMIT 1 OFFSET ?', cle, LIMITES.historique);
  if (borne && borne.id) await faire(db, 'DELETE FROM dm WHERE cle = ? AND id <= ?', cle, borne.id);
  return r.meta.last_row_id;   /* un nouveau message est toujours visible des deux côtés, même si l'un avait vidé sa vue */
}

export async function handleDm(request, url, env, outils) {
  const origine = request.headers.get('origin') || '';
  const cors = ORIGINE_DOMAINE.test(origine) ? { 'Access-Control-Allow-Origin': origine, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' } : {};
  const J = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: Object.assign({ 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }, cors) });
  const db = env && env.CERCLE_DB;
  if (!db) return J({ ok: false, reason: 'chat_indisponible' });
  const now = (outils.now && outils.now()) || Date.now();
  const p = url.pathname.replace(/^\/__dm/, '') || '/';
  const m = request.method;
  try {
    if (m === 'OPTIONS') return new Response(null, { status: 204, headers: Object.assign({ 'Access-Control-Allow-Methods': 'GET,POST', 'Access-Control-Allow-Headers': 'content-type,authorization,x-kdmc-sso,x-kdmc-admin' }, cors) });
    if (m !== 'GET' && m !== 'POST') return J({ ok: false, reason: 'methode' }, 405);
    /* écrire = depuis une page du domaine seulement (un site tiers n'agit pas avec la session de la personne) */
    if (m === 'POST' && !ORIGINE_DOMAINE.test(origine)) return J({ ok: false, reason: 'origine' }, 403);
    const qui = await outils.qui(request).catch(() => null);
    if (!qui) return J({ ok: false, reason: 'connexion_requise' }, 401);
    let corps = {};
    if (m === 'POST' && Number(request.headers.get('content-length') || 0) > 4096) return J({ ok: false, reason: 'trop_gros' }, 413);
    if (m === 'POST') { try { corps = await request.json(); } catch { corps = {}; } if (!corps || typeof corps !== 'object') corps = {}; }
    await schema(db);

    /* ───────────── KEVIN ───────────── */
    if (p.startsWith('/admin/')) {
      if (!qui.admin) return J({ ok: false, reason: 'admin_requis' }, 401);
      const q = m === 'GET' ? Object.fromEntries(url.searchParams) : corps;
      const clePar = () => { const c = q.nom ? cleDe(q.nom) : String(q.cle || ''); return CLE_OK.test(c) ? c : ''; };
      if (p === '/admin/liste' && m === 'GET') {
        const l = await tous(db, 'SELECT cle, nom, dernier, dernier_de, maj, nonlus_a FROM dm_fil ORDER BY maj DESC LIMIT ?', LIMITES.filsAdmin);
        return J({ ok: true, fils: l.map((x) => ({ cle: x.cle, nom: x.nom, dernier: x.dernier, dernier_de: x.dernier_de, maj: x.maj, nonLus: x.nonlus_a })), nonLus: l.reduce((s, x) => s + (x.nonlus_a || 0), 0) });
      }
      const cle = clePar();
      if (!cle) return J({ ok: false, reason: 'personne_inconnue', aide: 'Il faut le nom ET le prénom de la personne.' }, 400);
      if (p === '/admin/fil' && m === 'GET') {
        const f = await un(db, 'SELECT nom, nonlus_a, uid FROM dm_fil WHERE cle = ?', cle);
        const connu = outils.connu ? await outils.connu(q.nom || (f && f.nom) || '').catch(() => null) : null;
        return J({ ok: true, cle, nom: (f && f.nom) || nomPropre(q.nom), nonLus: (f && f.nonlus_a) || 0, compte: connu, lie: !!(f && f.uid), messages: await fil(db, cle, 'a') });
      }
      if (p === '/admin/ecrire' && m === 'POST') {
        const texte = nettoyer(corps.texte);
        if (!texte) return J({ ok: false, reason: 'texte_vide' }, 400);
        const id = await ajouter(db, cle, 'a', texte, nomPropre(corps.nom), now);
        /* si ce nom a déjà un compte, le fil lui est lié tout de suite : un homonyme inscrit dans l'autre ordre ne pourra pas le lire */
        const uidCompte = outils.uidDe ? await outils.uidDe(q.nom || '').catch(() => '') : '';
        await majFil(db, cle, nomPropre(corps.nom), now, uidCompte || '');
        return J({ ok: true, id, messages: await fil(db, cle, 'a') });
      }
      if (p === '/admin/delier' && m === 'POST') {   /* le fil est lié au mauvais compte : le prochain compte vérifié qui l'ouvre le reprend */
        await faire(db, "UPDATE dm_fil SET uid = '' WHERE cle = ?", cle);
        return J({ ok: true });
      }
      if (p === '/admin/lu' && m === 'POST') {
        await faire(db, "UPDATE dm SET lu = 1, lu_at = ? WHERE cle = ? AND de = 'm' AND lu = 0", now, cle);
        await majFil(db, cle, '', now);
        return J({ ok: true });
      }
      if (p === '/admin/vider' && m === 'POST') { await vider(db, cle, 'a', now); return J({ ok: true, messages: [] }); }
      if (p === '/admin/retirer' && m === 'POST') {
        await faire(db, "UPDATE dm SET retire = 1, texte = '' WHERE id = ? AND cle = ? AND de = 'a'", Number(corps.id) || 0, cle);
        await majFil(db, cle, '', now);
        return J({ ok: true, messages: await fil(db, cle, 'a') });
      }
      if (p === '/admin/reagir' && m === 'POST') {
        const e = REACTIONS.indexOf(corps.emoji) >= 0 ? corps.emoji : '';
        const cur = await un(db, 'SELECT reac_a FROM dm WHERE id = ? AND cle = ?', Number(corps.id) || 0, cle);
        if (!cur) return J({ ok: false, reason: 'message_inconnu' }, 404);
        await faire(db, 'UPDATE dm SET reac_a = ? WHERE id = ? AND cle = ?', cur.reac_a === e ? '' : e, Number(corps.id) || 0, cle);
        return J({ ok: true, messages: await fil(db, cle, 'a') });
      }
      return J({ ok: false, reason: 'inconnu' }, 404);
    }

    /* ───────────── LA PERSONNE ───────────── */
    if (qui.admin) return J({ ok: true, admin: true });   /* Kevin n'a pas de fil avec lui-même : il passe par ses écrans */
    if (!qui.prouve) return J({ ok: false, reason: 'code_requis' }, 401);   /* un nom déclaré n'ouvre aucun fil */
    if (qui.attente) return J({ ok: false, reason: 'compte_en_attente', aide: 'Ton compte attend sa validation.' }, 403);   /* un compte pas encore validé n'écrit ni ne lit */
    const cle = cleDe(qui.nom);
    if (!cle) return J({ ok: false, reason: 'nom_incomplet', aide: 'Ton compte doit porter ton prénom ET ton nom.' }, 403);
    /* 1 seule ligne lue (clé primaire) : le fil, son état ET son propriétaire. Le sondage de fond coûte presque rien. */
    const f = await un(db, 'SELECT nonlus_m, uid FROM dm_fil WHERE cle = ?', cle);
    if (f && f.uid && f.uid !== qui.uid) return J({ ok: false, reason: 'autre_compte', aide: 'Cette conversation est liée à un autre compte.' }, 403);
    if (f && !f.uid && qui.uid) await faire(db, "UPDATE dm_fil SET uid = ? WHERE cle = ? AND uid = ''", qui.uid, cle);   /* le premier compte vérifié qui l'ouvre la prend */
    if (p === '/badge' && m === 'GET') return J({ ok: true, nonLus: (f && f.nonlus_m) || 0 });
    if (p === '/mon' && m === 'GET') {
      return J({ ok: true, cle, nonLus: (f && f.nonlus_m) || 0, messages: await fil(db, cle, 'm'), reactions: REACTIONS, texteMax: LIMITES.texteMax });
    }
    if (p === '/lu' && m === 'POST') {
      await faire(db, "UPDATE dm SET lu = 1, lu_at = ? WHERE cle = ? AND de = 'a' AND lu = 0", now, cle);
      await majFil(db, cle, '', now);
      return J({ ok: true });
    }
    if (p === '/envoyer' && m === 'POST') {
      const texte = nettoyer(corps.texte);
      if (!texte) return J({ ok: false, reason: 'texte_vide' }, 400);
      const recents = await tous(db, "SELECT id FROM dm WHERE cle = ? AND de = 'm' AND cree > ? ORDER BY id DESC LIMIT ?", cle, now - 86400000, LIMITES.parJour + 1);
      if (recents.length >= LIMITES.parJour) return J({ ok: false, reason: 'trop_de_messages', max: LIMITES.parJour }, 429);
      const avant = await un(db, 'SELECT nonlus_a FROM dm_fil WHERE cle = ?', cle);
      const id = await ajouter(db, cle, 'm', texte, '', now);
      await majFil(db, cle, nomPropre(qui.nom), now, qui.uid || '');
      /* Kevin est prévenu au premier message non lu seulement (pas une notification par phrase) */
      if (!avant || !avant.nonlus_a) { try { await outils.notifier('💬 ' + nomPropre(qui.nom), texte.slice(0, 120)); } catch { /* jamais bloquant */ } }
      return J({ ok: true, id, messages: await fil(db, cle, 'm') });
    }
    if (p === '/vider' && m === 'POST') { await vider(db, cle, 'm', now); return J({ ok: true, messages: [] }); }
    if (p === '/retirer' && m === 'POST') {
      await faire(db, "UPDATE dm SET retire = 1, texte = '' WHERE id = ? AND cle = ? AND de = 'm'", Number(corps.id) || 0, cle);
      await majFil(db, cle, '', now);
      return J({ ok: true, messages: await fil(db, cle, 'm') });
    }
    if (p === '/reagir' && m === 'POST') {
      const e = REACTIONS.indexOf(corps.emoji) >= 0 ? corps.emoji : '';
      const cur = await un(db, 'SELECT reac_m FROM dm WHERE id = ? AND cle = ?', Number(corps.id) || 0, cle);
      if (!cur) return J({ ok: false, reason: 'message_inconnu' }, 404);
      await faire(db, 'UPDATE dm SET reac_m = ? WHERE id = ? AND cle = ?', cur.reac_m === e ? '' : e, Number(corps.id) || 0, cle);
      return J({ ok: true, messages: await fil(db, cle, 'm') });
    }
    return J({ ok: false, reason: 'inconnu' }, 404);
  } catch (e) {
    try { console.error('mini-chat:', e && e.message); } catch { /* rien */ }
    return J({ ok: false, reason: 'chat_indisponible' });
  }
}
