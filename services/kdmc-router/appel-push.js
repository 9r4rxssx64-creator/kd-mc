/* 📞 L'APPEL DE BEE MÊME APP FERMÉE (Kevin 3.10.2026 : « Intègre », après « Bee ou Bourricot te téléphone
 * réellement… régulièrement »). Le téléphone reçoit une notification « 📞 Bee t'appelle » à l'heure choisie ;
 * un toucher ouvre Lingua sur l'écran d'appel qui sonne (#appel).
 *
 * GRATUIT, SANS NOUVEAU SECRET :
 *   · l'envoi passe par le service de notifications DÉJÀ en ligne (apex-push-worker, POST /web-push
 *     {subscription, payload}) avec le jeton que le routeur a déjà (KDMC_PUSH_TOKEN) ; le téléphone s'abonne
 *     avec la clé publique de CE service (lue sur son /health, publique par nature) ;
 *   · les abonnements vivent dans la base D1 du cercle (CERCLE_DB) — 0 écriture KV (quota saturé) ;
 *   · l'horloge : un Durable Object (plan gratuit, stockage SQLite) qui se réveille toutes les 3 minutes tant
 *     qu'il y a au moins un abonné — les 5 tâches planifiées gratuites du compte sont déjà prises.
 * L'heure est celle du TÉLÉPHONE (fuseau IANA envoyé par l'app, changement d'heure compris) ; une seule
 * sonnerie par jour ; pas de sonnerie le jour où l'appel est déjà fait (ou refusé) ; un abonnement mort
 * (404/410) est effacé. Seuls les services de notifications connus sont acceptés comme adresse d'envoi.
 */
export const REVEIL_MS = 3 * 60e3;
export const FENETRE_MIN = 45;            // on sonne entre l'heure choisie et 45 min après (téléphone éteint, réveil manqué)
export const MAX_ABONNES = 5000;
const SERVICES_PUSH = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com|[a-z0-9.-]+\.push\.apple\.com)\//i;
const ORIGINE_OK = /^https:\/\/([a-z0-9-]+\.)*kd-mc\.com$/i;
const LANGUES = /^[\p{L} '-]{0,30}$/u;

const SCHEMA = `CREATE TABLE IF NOT EXISTS appel_push (id TEXT PRIMARY KEY, sub TEXT NOT NULL, heure TEXT NOT NULL, tz TEXT NOT NULL,
  mascotte TEXT, langue TEXT, envoye TEXT, cree INTEGER, echecs INTEGER DEFAULT 0)`;
const pret = new WeakSet();
async function base(db) { if (!pret.has(db)) { await db.prepare(SCHEMA).run(); pret.add(db); } return db; }
const J = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
async function sha(t) { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join(''); }

/* L'heure et la date LOCALES d'un fuseau, maintenant. Fuseau invalide → null (l'abonnement est refusé). */
export function maintenantLocal(tz, now) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(now)).map((x) => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, minutes: (+p.hour) * 60 + (+p.minute) };
  } catch { return null; }
}
const enMinutes = (h) => { const m = String(h || '').match(/^([01]\d|2[0-3]):([0-5]\d)$/); return m ? (+m[1]) * 60 + (+m[2]) : -1; };
/* Faut-il sonner cet abonné maintenant ? (pure : testée sans réseau) */
export function aSonner(ligne, now) {
  const l = maintenantLocal(ligne.tz, now); const h = enMinutes(ligne.heure);
  if (!l || h < 0 || ligne.envoye === l.date) return false;
  return l.minutes >= h && l.minutes <= h + FENETRE_MIN;
}
export function messageAppel(ligne) {
  const nom = ligne.mascotte === 'donkey' ? 'Bourricot' : 'Bee';
  const lgn = String(ligne.langue || '').toLowerCase();
  const lg = lgn ? (/^[aeiouyéèh]/.test(lgn) ? " d'" : ' de ') + lgn : '';   /* « d'anglais », « de japonais » */
  return { title: `📞 ${nom} t'appelle`, body: `Ta petite leçon${lg} au téléphone — touche pour décrocher`, url: 'https://lingua.kd-mc.com/#appel', tag: 'lingua-appel', requireInteraction: true };
}

/* Un passage d'horloge : sonne ceux qui doivent l'être. Renvoie le nombre d'abonnés restants. */
export async function tickAppels(env, now = Date.now()) {
  const db = env && env.CERCLE_DB; if (!db) return 0;
  await base(db);
  const lignes = (await db.prepare('SELECT * FROM appel_push LIMIT ?').bind(MAX_ABONNES).all()).results || [];
  let restants = lignes.length;
  for (const l of lignes) {
    if (!aSonner(l, now)) continue;
    const loc = maintenantLocal(l.tz, now);
    /* noté AVANT l'envoi : une panne au milieu ne fait jamais sonner deux fois (leçon #386) */
    await db.prepare('UPDATE appel_push SET envoye = ? WHERE id = ?').bind(loc.date, l.id).run();
    let statut = 0;
    try {
      if (!env.KDMC_PUSH_URL || !env.KDMC_PUSH_TOKEN) throw new Error('push non configuré');
      const r = await fetch(env.KDMC_PUSH_URL.replace(/\/$/, '') + '/web-push', {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.KDMC_PUSH_TOKEN },
        body: JSON.stringify({ subscription: JSON.parse(l.sub), payload: messageAppel(l) }) });
      statut = r.status;
    } catch { statut = 0; }
    if (statut === 404 || statut === 410) { await db.prepare('DELETE FROM appel_push WHERE id = ?').bind(l.id).run(); restants--; }
    else if (statut >= 200 && statut < 300) await db.prepare('UPDATE appel_push SET echecs = 0 WHERE id = ?').bind(l.id).run();
    else {
      await db.prepare('UPDATE appel_push SET echecs = echecs + 1 WHERE id = ?').bind(l.id).run();
      if ((l.echecs | 0) + 1 >= 20) { await db.prepare('DELETE FROM appel_push WHERE id = ?').bind(l.id).run(); restants--; }
    }
  }
  return restants;
}

/* L'horloge : un seul Durable Object (« horloge »), réveillé toutes les 3 min tant qu'il reste des abonnés. */
export class AppelReveil {
  constructor(state, env) { this.state = state; this.env = env; }
  async fetch() {
    const a = await this.state.storage.getAlarm();
    if (a == null) await this.state.storage.setAlarm(Date.now() + 30e3);
    return J({ ok: true, alarme: a == null ? 'armée' : 'déjà armée' });
  }
  async alarm() {
    let restants = 1;
    try { restants = await tickAppels(this.env); } catch { restants = 1; }   /* une panne D1 ne doit pas arrêter l'horloge */
    if (restants > 0) await this.state.storage.setAlarm(Date.now() + REVEIL_MS);
  }
}
async function armer(env) {
  try { if (!env.APPEL_REVEIL) return; const id = env.APPEL_REVEIL.idFromName('horloge'); await env.APPEL_REVEIL.get(id).fetch('https://horloge/armer'); } catch { /* fail-open */ }
}

/* Routes /__lingua/appel-* (servies sur lingua.kd-mc.com) */
export async function handleAppelPush(request, url, env) {
  const p = url.pathname, m = request.method;
  if (p === '/__lingua/appel-cle' && m === 'GET') {
    /* la clé publique du service qui SIGNE réellement les envois (sinon Apple accepte puis jette) */
    try {
      const cache = typeof caches !== 'undefined' ? caches.default : null, cleCache = new Request('https://cache.kd-mc.com/appel-cle');
      const deja = cache && await cache.match(cleCache); if (deja) return new Response(deja.body, { headers: { 'content-type': 'application/json' } });
      if (!env.KDMC_PUSH_URL) return J({ ok: false, reason: 'push_absent' });
      const h = await (await fetch(env.KDMC_PUSH_URL.replace(/\/$/, '') + '/health')).json();
      if (!h || !h.vapidPublic) return J({ ok: false, reason: 'cle_absente' });
      const rep = J({ ok: true, cle: h.vapidPublic });
      if (cache) await cache.put(cleCache, new Response(JSON.stringify({ ok: true, cle: h.vapidPublic }), { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=86400' } }));
      return rep;
    } catch { return J({ ok: false, reason: 'push_injoignable' }); }
  }
  if (m !== 'POST') return J({ ok: false, reason: 'methode' }, 405);
  if (!ORIGINE_OK.test(request.headers.get('origin') || '')) return J({ ok: false, reason: 'origine_refusee' }, 403);
  const db = env && env.CERCLE_DB; if (!db) return J({ ok: false, reason: 'base_absente' });
  await base(db);
  let b = {}; try { b = await request.json(); } catch { return J({ ok: false, reason: 'json' }, 400); }
  const sub = b && b.sub, endpoint = sub && String(sub.endpoint || '');
  if (!SERVICES_PUSH.test(endpoint) || endpoint.length > 600 || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return J({ ok: false, reason: 'abonnement_invalide' }, 400);
  const id = await sha(endpoint);
  if (p === '/__lingua/appel-abonnement') {
    if (b.actif === false) { await db.prepare('DELETE FROM appel_push WHERE id = ?').bind(id).run(); return J({ ok: true, actif: false }); }
    const heure = String(b.heure || ''), tz = String(b.tz || '').slice(0, 60), langue = String(b.langue || '').slice(0, 30);
    if (enMinutes(heure) < 0) return J({ ok: false, reason: 'heure_invalide' }, 400);
    if (!maintenantLocal(tz, Date.now())) return J({ ok: false, reason: 'fuseau_invalide' }, 400);
    if (!LANGUES.test(langue)) return J({ ok: false, reason: 'langue_invalide' }, 400);
    const n = (await db.prepare('SELECT COUNT(*) AS n FROM appel_push').first()).n || 0;
    const existe = await db.prepare('SELECT 1 FROM appel_push WHERE id = ?').bind(id).first();
    if (!existe && n >= MAX_ABONNES) return J({ ok: false, reason: 'complet' }, 503);
    const clean = JSON.stringify({ endpoint, keys: { p256dh: String(sub.keys.p256dh).slice(0, 200), auth: String(sub.keys.auth).slice(0, 100) } });
    await db.prepare(`INSERT INTO appel_push (id, sub, heure, tz, mascotte, langue, envoye, cree, echecs) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 0)
                      ON CONFLICT(id) DO UPDATE SET sub = excluded.sub, heure = excluded.heure, tz = excluded.tz, mascotte = excluded.mascotte, langue = excluded.langue, echecs = 0`)
      .bind(id, clean, heure, tz, b.mascotte === 'donkey' ? 'donkey' : 'bee', langue, Date.now()).run();
    await armer(env);
    return J({ ok: true, actif: true, heure, tz });
  }
  if (p === '/__lingua/appel-fait') {
    /* appel fait (ou refusé) aujourd'hui depuis l'app → pas de notification ce jour-là */
    const l = await db.prepare('SELECT tz FROM appel_push WHERE id = ?').bind(id).first();
    if (!l) return J({ ok: true, abonne: false });
    const loc = maintenantLocal(l.tz, Date.now());
    await db.prepare('UPDATE appel_push SET envoye = ? WHERE id = ?').bind(loc.date, id).run();
    return J({ ok: true, abonne: true, jour: loc.date });
  }
  return J({ ok: false, reason: 'introuvable' }, 404);
}
