/* INSTALLER L'APPLICATION + NOTIFICATIONS PARTOUT (Kevin 22.10.2026 : « toutes mes applications doivent avoir un bouton pour installer l'application sur l'écran d'accueil… toutes les
 * autorisations acceptées, notifications reçues application fermée, écran éteint »). Couche partagée, comme ✉️ : le routeur ajoute le script à chaque page HTML (worker.js, BOUTON_TAG).
 *
 *   /__installer/installer.js · manifest.webmanifest (par adresse) · sw.js (service worker de repli) · icon-192.png · icon-512.png · maskable-512.png · apple-touch-icon.png
 *   /__push/cle (clé publique) · abonner · desabonner · moi · test · envoyer (admin)
 *
 * GRATUIT, SANS NOUVEAU SECRET : l'envoi passe par le service de notifications déjà en ligne (apex-push-worker, POST /web-push) avec le jeton que le routeur a déjà (KDMC_PUSH_TOKEN) ;
 * les abonnements vivent dans D1 (CERCLE_DB), 0 écriture KV. Un abonnement = un appareil d'un compte. Mort (404/410) = effacé.
 * Les service workers des apps reçoivent, EN PLUS, le gestionnaire « push » (ajouterPushAuSW) si leur propre fichier n'en a pas : ni modifier 25 fichiers, ni doublon. */
import { INSTALLER_JS } from './installer-client.js';
import { ICON192_B64, ICON512_B64, APPLE180_B64, MASKABLE512_B64 } from './installer-icones.js';

export { INSTALLER_JS };
export const INSTALLER_TAG = '<script src="/__installer/installer.js" defer></script>';
export const MAX_ABONNES = 20000;
export const PAR_COMPTE = 8;                       // appareils par compte
const SERVICES_PUSH = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com|[a-z0-9.-]+\.push\.apple\.com)\//i;
const ORIGINE_OK = /^https:\/\/([a-z0-9-]+\.)*kd-mc\.com$/i;
const NOMS = { 'kd-mc.com': 'KDMC', 'www.kd-mc.com': 'KDMC', cmcteams: 'CMCteams', 'cmcteams-light': 'CMCteams light', departs: 'Départs', 'apex-ai': 'Apex AI', 'apex-chat': 'Apex Chat', 'la-detente': 'La Détente', 'chez-lolo': 'Chez Lolo',
  dashboard: 'Tableau boutiques', sourcing: 'Sourcing', coffre: 'Coffre', bot: 'Bot', beatbot: 'PoolPilot', autorisations: 'Autorisations', arbre: 'Arbre familial', lingua: 'Lingua', studio: 'Studio', cuisine: 'Cuisine',
  worldmonitor: 'World Monitor', osint: 'OSINT', ia: 'IA', outils: 'Outils', shops: 'Boutiques', kit: 'Kit', dossiers: 'Dossiers', tor: 'Tor', rotaplan: 'Rotaplan', croupier: 'Croupier', javis: 'Javis' };
export const nomApp = (host) => { const h = String(host || '').toLowerCase().replace(/:.*$/, ''); return NOMS[h] || NOMS[h.replace(/\.kd-mc\.com$/, '')] || 'KDMC'; };

const J = (o, s, extra) => new Response(JSON.stringify(o), { status: s || 200, headers: Object.assign({ 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }, extra || {}) });
const b64 = (s) => { const r = atob(s), o = new Uint8Array(r.length); for (let i = 0; i < r.length; i++) o[i] = r.charCodeAt(i); return o; };
const png = (s, immuable) => new Response(b64(s), { status: 200, headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=' + (immuable ? 604800 : 3600), 'x-content-type-options': 'nosniff' } });
async function sha(t) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return Array.from(new Uint8Array(d)).map((x) => x.toString(16).padStart(2, '0')).join(''); }

/* Le gestionnaire de notifications ajouté à un service worker qui n'en a pas : affiche, et un toucher ouvre la bonne page. */
export const PUSH_SNIPPET = `
;(function(){try{if(self.__kdmcPush)return;self.__kdmcPush=1;
self.addEventListener('push',function(e){var d={};try{d=e.data?e.data.json():{};}catch(x){try{d={body:e.data.text()};}catch(y){}}
var o={body:d.body||'',tag:d.tag||'kdmc',data:{url:d.url||'/'},icon:d.icon||'/__installer/icon-192.png',badge:'/__installer/icon-192.png',requireInteraction:!!d.requireInteraction,vibrate:[200,100,200]};
if(d.tag)o.renotify=true;e.waitUntil(self.registration.showNotification(d.title||'KDMC',o));});
self.addEventListener('notificationclick',function(e){e.notification.close();var u=(e.notification.data&&e.notification.data.url)||'/';
e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(function(l){var a=u.split('#')[0];for(var i=0;i<l.length;i++){if(l[i].url.split('#')[0]===a&&'focus' in l[i])return l[i].focus();}return clients.openWindow(u);}));});
}catch(x){}})();
`;
export const SW_REPLI = '/* KDMC — service worker de repli : notifications seulement, aucune mise en cache. */\nself.addEventListener("install",function(){self.skipWaiting();});\nself.addEventListener("activate",function(e){e.waitUntil(self.clients.claim());});\n' + PUSH_SNIPPET;
/* Ajoute le gestionnaire « push » à un script de service worker, sauf s'il en a déjà un (jamais deux notifications) ou sur Apex Chat (ses propres notifications). */
export function ajouterPushAuSW(texte, host) {
  const t = String(texte || '');
  if (/^apex-chat\./i.test(String(host || ''))) return t;
  if (/addEventListener\(\s*['"]push['"]|onpush\s*=|__kdmcPush/.test(t)) return t;
  return t + '\n' + PUSH_SNIPPET;
}
export function manifestPour(host) {
  const nom = nomApp(host);
  return { name: nom, short_name: nom.length > 12 ? nom.slice(0, 12) : nom, description: nom + ' — kd-mc.com', start_url: '/', scope: '/', id: '/', display: 'standalone', orientation: 'any',
    background_color: '#0b1409', theme_color: '#0b1409', lang: 'fr',
    icons: [{ src: '/__installer/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: '/__installer/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }, { src: '/__installer/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }] };
}

const SCHEMA = 'CREATE TABLE IF NOT EXISTS push_domaine (id TEXT PRIMARY KEY, uid TEXT NOT NULL, sub TEXT NOT NULL, app TEXT, installee INTEGER DEFAULT 0, ua TEXT, cree INTEGER, vu INTEGER, echecs INTEGER DEFAULT 0, test_at INTEGER DEFAULT 0)';
const pret = new WeakSet();
async function base(db) { if (!pret.has(db)) { await db.prepare(SCHEMA).run(); await db.prepare('CREATE INDEX IF NOT EXISTS push_domaine_uid ON push_domaine (uid)').run(); pret.add(db); } }

/* Envoie une notification à des abonnements. Renvoie { envoyes, morts, echecs }. Un abonnement mort (404/410) est effacé ; 20 échecs d'affilée aussi. */
export async function pousser(env, lignes, payload, fetchFn) {
  const out = { envoyes: 0, morts: 0, echecs: 0 }, db = env && env.CERCLE_DB, f = fetchFn || fetch;
  if (!env || !env.KDMC_PUSH_URL || !env.KDMC_PUSH_TOKEN) return Object.assign(out, { echecs: lignes.length, raison: 'push_non_configure' });
  const corps = { title: String(payload.title || 'KDMC').slice(0, 80), body: String(payload.body || '').slice(0, 240), url: /^https:\/\/([a-z0-9-]+\.)*kd-mc\.com(\/|$)/i.test(String(payload.url || '')) ? payload.url : 'https://kd-mc.com/', tag: String(payload.tag || 'kdmc').slice(0, 40), requireInteraction: !!payload.requireInteraction };
  for (const l of lignes) {
    let st = 0;
    try { const r = await f(env.KDMC_PUSH_URL.replace(/\/$/, '') + '/web-push', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.KDMC_PUSH_TOKEN }, body: JSON.stringify({ subscription: JSON.parse(l.sub), payload: corps }) }); st = r.status; } catch { st = 0; }
    if (st >= 200 && st < 300) { out.envoyes++; if (db) await db.prepare('UPDATE push_domaine SET echecs = 0, vu = ? WHERE id = ?').bind(Date.now(), l.id).run().catch(() => {}); }
    else if (st === 404 || st === 410) { out.morts++; if (db) await db.prepare('DELETE FROM push_domaine WHERE id = ?').bind(l.id).run().catch(() => {}); }
    else { out.echecs++; if (db) { await db.prepare('UPDATE push_domaine SET echecs = echecs + 1 WHERE id = ?').bind(l.id).run().catch(() => {}); if ((l.echecs | 0) + 1 >= 20) await db.prepare('DELETE FROM push_domaine WHERE id = ?').bind(l.id).run().catch(() => {}); } }
  }
  return out;
}
/* Notification à UN compte (tous ses appareils). Jamais d'exception : une panne de notification ne casse rien. */
export async function pousserA(env, uid, payload, fetchFn) {
  try { const db = env && env.CERCLE_DB; if (!db || !uid) return { envoyes: 0, morts: 0, echecs: 0, raison: 'rien' }; await base(db);
    const lignes = (await db.prepare('SELECT id, sub, echecs FROM push_domaine WHERE uid = ? LIMIT ?').bind(String(uid), PAR_COMPTE).all()).results || [];
    return lignes.length ? await pousser(env, lignes, payload, fetchFn) : { envoyes: 0, morts: 0, echecs: 0, raison: 'aucun_appareil' };
  } catch { return { envoyes: 0, morts: 0, echecs: 0, raison: 'erreur' }; }
}

/* Les ressources statiques de /__installer/ */
export function handleInstaller(request, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return J({ ok: false, reason: 'methode' }, 405);
  const p = url.pathname, host = (request.headers.get('host') || url.hostname || '').toLowerCase();
  const js = (t, extra) => new Response(t, { status: 200, headers: Object.assign({ 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff' }, extra || {}) });
  if (p === '/__installer/installer.js') return js(INSTALLER_JS);
  if (p === '/__installer/sw.js') return js(SW_REPLI, { 'service-worker-allowed': '/', 'cache-control': 'no-cache' });
  if (p === '/__installer/manifest.webmanifest') return new Response(JSON.stringify(manifestPour(host)), { status: 200, headers: { 'content-type': 'application/manifest+json; charset=utf-8', 'cache-control': 'public, max-age=3600', 'x-content-type-options': 'nosniff' } });
  if (p === '/__installer/icon-192.png') return png(ICON192_B64, true);
  if (p === '/__installer/icon-512.png') return png(ICON512_B64, true);
  if (p === '/__installer/maskable-512.png') return png(MASKABLE512_B64, true);
  if (p === '/__installer/apple-touch-icon.png') return png(APPLE180_B64, true);
  return J({ ok: false, reason: 'introuvable' }, 404);
}

/* L'API /__push/ */
export async function handlePush(request, url, env, outils) {
  const p = url.pathname.replace(/^\/__push/, '') || '/', m = request.method;
  const origine = request.headers.get('origin') || '';
  const cors = ORIGINE_OK.test(origine) ? { 'access-control-allow-origin': origine, 'access-control-allow-credentials': 'true', vary: 'Origin' } : {};
  const R = (o, s) => J(o, s, cors);
  if (m === 'OPTIONS') return new Response(null, { status: 204, headers: Object.assign({ 'access-control-allow-methods': 'GET,POST', 'access-control-allow-headers': 'content-type,authorization' }, cors) });
  try {
    if (p === '/cle' && m === 'GET') {
      if (!env.KDMC_PUSH_URL) return R({ ok: false, reason: 'push_absent' });
      const cache = typeof caches !== 'undefined' ? caches.default : null, ck = new Request('https://cache.kd-mc.com/push-domaine-cle');
      const deja = cache && await cache.match(ck); if (deja) return R(await deja.json());
      const h = await (await fetch(env.KDMC_PUSH_URL.replace(/\/$/, '') + '/health')).json();
      if (!h || !h.vapidPublic) return R({ ok: false, reason: 'cle_absente' });
      const rep = { ok: true, cle: h.vapidPublic };
      if (cache) await cache.put(ck, new Response(JSON.stringify(rep), { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=86400' } }));
      return R(rep);
    }
    const db = env && env.CERCLE_DB; if (!db) return R({ ok: false, reason: 'base_absente' });
    await base(db);
    const qui = await outils.qui(request).catch(() => null);
    if (m === 'POST' && !ORIGINE_OK.test(origine)) return R({ ok: false, reason: 'origine_refusee' }, 403);
    if (!qui || !qui.uid) return R({ ok: false, reason: 'connexion_requise' }, 401);
    if (p === '/moi' && m === 'GET') { const n = (await db.prepare('SELECT COUNT(*) AS n FROM push_domaine WHERE uid = ?').bind(qui.uid).first()).n || 0; return R({ ok: true, appareils: n }); }
    if (m !== 'POST') return R({ ok: false, reason: 'methode' }, 405);
    let b = {}; try { b = await request.json(); } catch { b = {}; }
    if (p === '/abonner') {
      const sub = b && b.sub, endpoint = sub && String(sub.endpoint || '');
      if (!SERVICES_PUSH.test(endpoint) || endpoint.length > 600 || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return R({ ok: false, reason: 'abonnement_invalide' }, 400);
      const id = await sha(endpoint);
      const existe = await db.prepare('SELECT uid FROM push_domaine WHERE id = ?').bind(id).first();
      if (!existe) {
        const n = (await db.prepare('SELECT COUNT(*) AS n FROM push_domaine').first()).n || 0; if (n >= MAX_ABONNES) return R({ ok: false, reason: 'complet' }, 503);
        const mien = (await db.prepare('SELECT COUNT(*) AS n FROM push_domaine WHERE uid = ?').bind(qui.uid).first()).n || 0;
        if (mien >= PAR_COMPTE) await db.prepare('DELETE FROM push_domaine WHERE id IN (SELECT id FROM push_domaine WHERE uid = ? ORDER BY vu ASC, cree ASC LIMIT ?)').bind(qui.uid, mien - PAR_COMPTE + 1).run();   // le plus ancien cède la place
      }
      const clean = JSON.stringify({ endpoint, keys: { p256dh: String(sub.keys.p256dh).slice(0, 200), auth: String(sub.keys.auth).slice(0, 100) } });
      await db.prepare('INSERT INTO push_domaine (id, uid, sub, app, installee, ua, cree, vu, echecs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0) ON CONFLICT(id) DO UPDATE SET uid = excluded.uid, sub = excluded.sub, app = excluded.app, installee = excluded.installee, ua = excluded.ua, vu = excluded.vu, echecs = 0')
        .bind(id, qui.uid, clean, String(b.app || '').slice(0, 60), b.installee ? 1 : 0, String(request.headers.get('user-agent') || '').slice(0, 160), Date.now(), Date.now()).run();
      return R({ ok: true, actif: true });
    }
    if (p === '/desabonner') { const e = String(b.endpoint || ''); if (e) await db.prepare('DELETE FROM push_domaine WHERE id = ? AND uid = ?').bind(await sha(e), qui.uid).run(); return R({ ok: true, actif: false }); }
    if (p === '/test') {
      const lignes = (await db.prepare('SELECT id, sub, echecs, test_at FROM push_domaine WHERE uid = ? LIMIT ?').bind(qui.uid, PAR_COMPTE).all()).results || [];
      if (!lignes.length) return R({ ok: false, reason: 'aucun_appareil' });
      if (lignes.some((l) => Date.now() - (Number(l.test_at) || 0) < 15000)) return R({ ok: false, reason: 'trop_vite' }, 429);
      await db.prepare('UPDATE push_domaine SET test_at = ? WHERE uid = ?').bind(Date.now(), qui.uid).run();
      const r = await pousser(env, lignes, { title: '🔔 Notification de test', body: 'Ça marche : tu me reçois même application fermée.', url: 'https://' + (request.headers.get('host') || 'kd-mc.com') + '/', tag: 'kdmc-test' });
      return R({ ok: r.envoyes > 0, envoyes: r.envoyes, morts: r.morts, echecs: r.echecs, reason: r.envoyes > 0 ? undefined : (r.raison || 'non_livree') });
    }
    if (p === '/envoyer') {
      if (!qui.admin) return R({ ok: false, reason: 'admin_requis' }, 403);
      const titre = String(b.title || '').trim(), texte = String(b.body || '').trim();
      if (!titre || !texte) return R({ ok: false, reason: 'titre_et_texte_requis' }, 400);
      if (!b.uid && b.tous !== true) return R({ ok: false, reason: 'destinataire_requis' }, 400);
      const lignes = b.tous === true ? ((await db.prepare('SELECT id, sub, echecs FROM push_domaine LIMIT ?').bind(MAX_ABONNES).all()).results || [])
        : ((await db.prepare('SELECT id, sub, echecs FROM push_domaine WHERE uid = ? LIMIT ?').bind(String(b.uid), PAR_COMPTE).all()).results || []);
      const r = await pousser(env, lignes, { title: titre, body: texte, url: b.url, tag: b.tag });
      return R({ ok: true, destinataires: lignes.length, envoyes: r.envoyes, morts: r.morts, echecs: r.echecs });
    }
    return R({ ok: false, reason: 'introuvable' }, 404);
  } catch { return R({ ok: false, reason: 'erreur' }, 500); }
}
