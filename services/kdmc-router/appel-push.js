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
import { tickRappels } from './bee-agir.js';   // les rappels de Bee sonnent avec la même horloge
export const REVEIL_MS = 3 * 60e3;
export const FENETRE_MIN = 45;            // on sonne entre l'heure choisie et 45 min après (téléphone éteint, réveil manqué)
export const MAX_ABONNES = 5000;
const SERVICES_PUSH = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com|[a-z0-9.-]+\.push\.apple\.com)\//i;
const ORIGINE_OK = /^https:\/\/([a-z0-9-]+\.)*kd-mc\.com$/i;
const LANGUES = /^[\p{L} '-]{0,30}$/u;

const SCHEMA = `CREATE TABLE IF NOT EXISTS appel_push (id TEXT PRIMARY KEY, sub TEXT NOT NULL, heure TEXT NOT NULL, tz TEXT NOT NULL,
  mascotte TEXT, langue TEXT, envoye TEXT, cree INTEGER, echecs INTEGER DEFAULT 0)`;
const pret = new WeakSet();
async function base(db) {
  if (!pret.has(db)) { await db.prepare(SCHEMA).run();
    /* 4.10 : créneaux et pause choisis par chacun — ajoutés à une table qui existe déjà en ligne */
    for (const col of ['plan TEXT', 'pause TEXT']) { try { await db.prepare('ALTER TABLE appel_push ADD COLUMN ' + col).run(); } catch { /* déjà là */ } }
    pret.add(db); }
  return db; }
const J = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
async function sha(t) { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join(''); }

/* L'heure et la date LOCALES d'un fuseau, maintenant. Fuseau invalide → null (l'abonnement est refusé). */
const JOURS = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
export function maintenantLocal(tz, now) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(now)).map((x) => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, minutes: (+p.hour) * 60 + (+p.minute), jour: JOURS[p.weekday] || 0 };
  } catch { return null; }
}
const enMinutes = (h) => { const m = String(h || '').match(/^([01]\d|2[0-3]):([0-5]\d)$/); return m ? (+m[1]) * 60 + (+m[2]) : -1; };
/* CHACUN SES HORAIRES (Kevin 4.10 : « chacun choisit ses horaires d'appel, disponibilités ») : jusqu'à 4 créneaux
   { jours: [1..7] (lundi = 1), heure: "HH:MM" }, et une pause « pas d'appels jusqu'au AAAA-MM-JJ » (vacances).
   Sans créneaux (abonnement d'avant) : l'heure unique, tous les jours. */
export const MAX_CRENEAUX = 4;
export function creneauxDe(ligne) {
  let plan = null; try { plan = ligne.plan ? JSON.parse(ligne.plan) : null; } catch { plan = null; }
  return Array.isArray(plan) && plan.length ? plan : [{ jours: [1, 2, 3, 4, 5, 6, 7], heure: ligne.heure }];
}
export function planValide(plan) {
  if (!Array.isArray(plan) || !plan.length || plan.length > MAX_CRENEAUX) return null;
  const out = [];
  for (const c of plan) {
    const jours = Array.isArray(c && c.jours) ? [...new Set(c.jours.map((j) => j | 0))].filter((j) => j >= 1 && j <= 7).sort() : [];
    if (!jours.length || enMinutes(c.heure) < 0) return null;
    out.push({ jours, heure: String(c.heure) });
  }
  return out;
}
/* « envoye » = la date locale + les heures déjà sonnées ce jour-là : « 2026-10-04|07:00,18:30 » */
const dejaSonnes = (ligne, date) => { const [d, hs] = String(ligne.envoye || '').split('|'); return d === date ? (hs || (d ? '*' : '')).split(',').filter(Boolean) : []; };
/* Le créneau à sonner maintenant (« HH:MM »), ou null. (pure : testée sans réseau) */
export function aSonner(ligne, now) {
  const l = maintenantLocal(ligne.tz, now); if (!l) return null;
  if (ligne.pause && l.date <= ligne.pause) return null;
  const faits = dejaSonnes(ligne, l.date); if (faits.includes('*')) return null;
  for (const c of creneauxDe(ligne)) {
    const h = enMinutes(c.heure);
    if (h < 0 || !c.jours.includes(l.jour) || faits.includes(c.heure)) continue;
    if (l.minutes >= h && l.minutes <= h + FENETRE_MIN) return c.heure;
  }
  return null;
}
const noter = (ligne, date, heures) => date + '|' + [...new Set(dejaSonnes(ligne, date).filter((h) => h !== '*').concat(heures))].join(',');
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
    const creneau = aSonner(l, now); if (!creneau) continue;
    const loc = maintenantLocal(l.tz, now);
    /* noté AVANT l'envoi : une panne au milieu ne fait jamais sonner deux fois (leçon #386) */
    await db.prepare('UPDATE appel_push SET envoye = ? WHERE id = ?').bind(noter(l, loc.date, [creneau]), l.id).run();
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
    /* les rappels de Bee (bee-agir.js) rejoignent la même horloge : aucun cron de plus (les 5 gratuits sont pris) */
    try { restants += await tickRappels(this.env); } catch { restants = Math.max(restants, 1); }
    if (restants > 0) await this.state.storage.setAlarm(Date.now() + REVEIL_MS);
  }
}
export async function armer(env) {
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
    const tz = String(b.tz || '').slice(0, 60), langue = String(b.langue || '').slice(0, 30);
    const plan = b.plan != null ? planValide(b.plan) : (enMinutes(b.heure) >= 0 ? [{ jours: [1, 2, 3, 4, 5, 6, 7], heure: String(b.heure) }] : null);
    if (!plan) return J({ ok: false, reason: 'horaires_invalides' }, 400);
    const heure = plan[0].heure;
    const pause = b.pause ? String(b.pause) : '';
    if (pause && !/^\d{4}-\d{2}-\d{2}$/.test(pause)) return J({ ok: false, reason: 'pause_invalide' }, 400);
    if (!maintenantLocal(tz, Date.now())) return J({ ok: false, reason: 'fuseau_invalide' }, 400);
    if (!LANGUES.test(langue)) return J({ ok: false, reason: 'langue_invalide' }, 400);
    const n = (await db.prepare('SELECT COUNT(*) AS n FROM appel_push').first()).n || 0;
    const existe = await db.prepare('SELECT 1 FROM appel_push WHERE id = ?').bind(id).first();
    if (!existe && n >= MAX_ABONNES) return J({ ok: false, reason: 'complet' }, 503);
    const clean = JSON.stringify({ endpoint, keys: { p256dh: String(sub.keys.p256dh).slice(0, 200), auth: String(sub.keys.auth).slice(0, 100) } });
    await db.prepare(`INSERT INTO appel_push (id, sub, heure, tz, mascotte, langue, envoye, cree, echecs, plan, pause) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 0, ?, ?)
                      ON CONFLICT(id) DO UPDATE SET sub = excluded.sub, heure = excluded.heure, tz = excluded.tz, mascotte = excluded.mascotte, langue = excluded.langue, echecs = 0, plan = excluded.plan, pause = excluded.pause`)
      .bind(id, clean, heure, tz, b.mascotte === 'donkey' ? 'donkey' : 'bee', langue, Date.now(), JSON.stringify(plan), pause || null).run();
    await armer(env);
    return J({ ok: true, actif: true, heure, tz, plan, pause: pause || null });
  }
  if (p === '/__lingua/appel-fait') {
    /* appel fait (ou refusé) aujourd'hui depuis l'app → pas de notification ce jour-là */
    const l = await db.prepare('SELECT * FROM appel_push WHERE id = ?').bind(id).first();
    if (!l) return J({ ok: true, abonne: false });
    const loc = maintenantLocal(l.tz, Date.now());
    /* l'appel du moment est fait : les créneaux d'aujourd'hui déjà passés ou dans les 2 h ne sonnent plus ; ceux de plus tard, si */
    const couverts = creneauxDe(l).filter((c) => c.jours.includes(loc.jour) && enMinutes(c.heure) <= loc.minutes + 120).map((c) => c.heure);
    await db.prepare('UPDATE appel_push SET envoye = ? WHERE id = ?').bind(noter(l, loc.date, couverts.length ? couverts : ['*']), id).run();
    return J({ ok: true, abonne: true, jour: loc.date, couverts });
  }
  return J({ ok: false, reason: 'introuvable' }, 404);
}
