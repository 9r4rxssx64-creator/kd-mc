/* GARDE — PERSONNE N'ENTRE SANS ÊTRE FICHÉ
 * =========================================
 * Kevin, 22.09.2026 : « vérifie les connexions au domaine, les logins etc.
 * Sois sûr que personne ne puisse entrer dans être fiché. »
 *
 * MESURÉ CE JOUR-LÀ, avant ce correctif : sur 28 apps du domaine, **16 ne
 * demandaient JAMAIS** au domaine « qui es-tu ? » (Lingua, la Détente, le coffre,
 * World Monitor, OSINT, le robot de piscine, les boutiques…). Quelqu'un pouvait y
 * passer une heure sans apparaître une seule fois dans « Qui se connecte ».
 *
 * Le correctif ne touche AUCUNE app : c'est le ROUTEUR qui fiche, parce qu'il sert
 * toutes les pages. Cette garde l'EXÉCUTE sur les 32 adresses réelles (une garde
 * qui se contente de relire le code ne prouve rien — leçons #99/#101) :
 *
 *   1. une personne reconnue est fichée sur CHAQUE adresse, sans exception ;
 *   2. un visiteur anonyme est COMPTÉ (on ne peut pas le nommer, mais son
 *      passage ne doit plus être invisible) ;
 *   3. une image ou un script ne déclenche RIEN (sinon on paierait des écritures
 *      pour chaque fichier d'une page, et le journal serait du bruit) ;
 *   4. une session révoquée (« Déconnecter partout ») ne fiche plus rien ;
 *   5. une panne du stockage ne casse JAMAIS la page — juste une ligne de journal
 *      en moins.
 *
 * node --test services/kdmc-router/fiche-visite.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import mod from './worker.js';

const SECRET = 'secret-de-test';
const b64url = (s) => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function jeton(uid, nom, iat) {
  const p = b64url(JSON.stringify({ u: uid, n: nom, c: 1, v: 0, iat: iat || Date.now(), exp: Date.now() + 3600000 }));
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(p));
  return p + '.' + Buffer.from(sig).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const kv = () => {
  const m = new Map();
  return { m,
    get: async (k) => (m.has(k) ? m.get(k) : null),
    put: async (k, v) => { m.set(k, v); },
    delete: async (k) => { m.delete(k); } };
};
/* Pas de vrai réseau : l'amont renvoie une page quelconque. On ne teste pas le
   contenu servi, on teste ce que le routeur ÉCRIT au passage. */
const envNeuf = () => ({
  KDMC_SSO_SECRET: SECRET,
  ACCOUNTS: kv(),
  ASSETS: { fetch: async () => new Response('<html>page</html>', { status: 200, headers: { 'content-type': 'text/html' } }) },
});

globalThis.fetch = async () => new Response('<html>page</html>', { status: 200, headers: { 'content-type': 'text/html' } });

/* ⚠️ PIÈGE DE MESURE : le routeur fiche EN ARRIÈRE-PLAN (`waitUntil`) pour ne pas
   ralentir la page. Cloudflare attend ces promesses ; un test qui ne les attend pas
   lit le stockage AVANT l'écriture et conclut « rien n'est fiché » — un faux rouge
   (et, si on avait inversé l'assertion, un faux vert). On les collecte et on les
   attend explicitement : c'est ce que fait la vraie plateforme. */
function ctxTest() { const p = []; return { waitUntil: (x) => p.push(x), fini: () => Promise.all(p) }; }
async function servir(req, env) { const c = ctxTest(); const r = await mod.fetch(req, env, c); await c.fini(); return r; }

const page = (host, tok) => new Request('https://' + host + '/', {
  headers: Object.assign({ 'sec-fetch-dest': 'document', accept: 'text/html' },
    tok ? { cookie: 'kdmc_sso=' + tok } : {}),
});

/* Les 32 adresses réelles, lues DANS le routeur : si Kevin en ajoute une 33e,
   elle entre automatiquement dans cette garde — pas de liste à maintenir à côté
   qui prendrait du retard en silence. */
const SRC = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
const HOSTS = [...SRC.match(/const ROUTES\s*=\s*\{[\s\S]*?\n\};/)[0].matchAll(/'([a-z0-9.-]+\.kd-mc\.com)':/g)].map((m) => m[1]);

test('les 32 adresses du domaine sont bien toutes couvertes', () => {
  assert.ok(HOSTS.length >= 30, 'adresses trouvées : ' + HOSTS.length);
});

test('une personne reconnue est fichée sur CHAQUE adresse, sans exception', async () => {
  const tok = await jeton('u_marie', 'Marie Dupont');
  const oublis = [];
  for (const h of HOSTS) {
    const env = envNeuf();
    await servir(page(h, tok), env);
    const fiche = [...env.ACCOUNTS.m.keys()].filter((k) => String(k).startsWith('acc:'));
    if (!fiche.length) oublis.push(h);
  }
  assert.deepEqual(oublis, [], 'adresses où la personne reste INVISIBLE : ' + oublis.join(', '));
});

test('la fiche contient bien de quoi reconnaître la personne', async () => {
  const env = envNeuf();
  await servir(page('lingua.kd-mc.com', await jeton('u_marie', 'Marie Dupont')), env);
  const cle = [...env.ACCOUNTS.m.keys()].find((k) => String(k).startsWith('acc:'));
  const f = JSON.parse(env.ACCOUNTS.m.get(cle));
  assert.equal(f.name, 'Marie Dupont');
  assert.ok(f.last_seen > 0, 'la date de passage est enregistrée');
  assert.equal(f.last_app, 'lingua.kd-mc.com', 'on sait DANS QUELLE APP elle était');
});

test('un visiteur anonyme est COMPTÉ (son passage n’est plus invisible)', async () => {
  const env = envNeuf();
  await servir(page('cuisine.kd-mc.com'), env);
  const cles = [...env.ACCOUNTS.m.keys()].filter((k) => String(k).startsWith('anon:'));
  assert.equal(cles.length, 1, 'clés anonymes : ' + JSON.stringify(cles));
  assert.ok(cles[0].endsWith(':cuisine.kd-mc.com'), 'comptée sur la bonne app : ' + cles[0]);
  assert.equal(env.ACCOUNTS.m.get(cles[0]), '1');
  /* Vie privée : on compte, on ne nomme pas — aucune fiche créée pour un inconnu. */
  assert.equal([...env.ACCOUNTS.m.keys()].filter((k) => String(k).startsWith('acc:')).length, 0);
});

test('on compte des VISITEURS, pas des pages (sinon le quota d’écritures saute)', async () => {
  /* Le stockage gratuit autorise ~1 000 écritures par jour. Compter chaque page
     ferait sauter ce plafond sur une boutique visitée — et ce sont les FICHES des
     vraies personnes qui cesseraient de s'enregistrer. Un mécanisme de surveillance
     qui casse ce qu'il surveille est pire que pas de surveillance. */
  const env = envNeuf();
  for (let i = 0; i < 12; i++) await servir(page('cuisine.kd-mc.com'), env);
  const cle = [...env.ACCOUNTS.m.keys()].find((k) => String(k).startsWith('anon:'));
  assert.equal(env.ACCOUNTS.m.get(cle), '1', '12 pages du même visiteur = 1 seule visite comptée');
  /* Un visiteur DIFFÉRENT compte bien pour un de plus. */
  const env2 = envNeuf();
  await servir(page('cuisine.kd-mc.com'), env2);
  const r2 = new Request('https://cuisine.kd-mc.com/', { headers: { 'sec-fetch-dest': 'document', 'CF-Connecting-IP': '9.9.9.9' } });
  const c2 = ctxTest(); await mod.fetch(r2, env2, c2); await c2.fini();
  const cle2 = [...env2.ACCOUNTS.m.keys()].find((k) => String(k).startsWith('anon:'));
  assert.equal(env2.ACCOUNTS.m.get(cle2), '2', 'deux visiteurs distincts = 2');
});

test('PLAFOND KV (mesuré 2.10 : 514 visites anonymes = ~1 028 écritures = 73 % du jour) : un visiteur compte UNE fois PAR JOUR (plus par heure), un robot déclaré n’écrit RIEN', async () => {
  const env = envNeuf();
  const jour = new Date().toISOString().slice(0, 10);
  await servir(page('shops.kd-mc.com'), env);
  const marqueur = [...env.ACCOUNTS.m.keys()].find((k) => String(k).startsWith('anonv:'));
  assert.ok(marqueur && marqueur.endsWith(':' + jour), 'le marqueur du visiteur est daté du JOUR, pas de l’heure : ' + marqueur);
  assert.equal(env.ACCOUNTS.m.size, 2, 'une visite = 2 écritures (marqueur + compteur), pas plus');
  for (let i = 0; i < 5; i++) await servir(page('shops.kd-mc.com'), env);
  assert.equal(env.ACCOUNTS.m.size, 2, 'le même visiteur, le même jour : plus aucune écriture');
  /* robots d'internet déclarés (ce sont eux qui balaient les 33 adresses) : rien, ni marqueur ni compteur */
  /* + les NÔTRES, mesurés le 3.10 comme ~53 % des écritures du jour : « kdmc-sonde/1 » (publication), « kdmc-sonde-servi/2 »
     (déguisé en iPhone), Lighthouse (Apex CI), kd-mc-linkcheck — aucun n'avait de mot de la liste. */
  for (const ua of ['Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'curl/8.4.0', 'python-requests/2.31', 'Mozilla/5.0 (compatible; AhrefsBot/7.0)', 'Go-http-client/1.1',
    'kdmc-sonde/1', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) kdmc-sonde-servi/2', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Chrome-Lighthouse', 'Mozilla/5.0 (compatible; kd-mc-linkcheck/1.0; +https://kd-mc.com)', 'kdmc-uptime/1.0 (+https://kd-mc.com)']) {
    const envR = envNeuf();
    await servir(new Request('https://shops.kd-mc.com/', { headers: { 'sec-fetch-dest': 'document', accept: 'text/html', 'user-agent': ua, 'CF-Connecting-IP': '5.5.5.5' } }), envR);
    assert.equal(envR.ACCOUNTS.m.size, 0, 'robot « ' + ua.slice(0, 30) + ' » : aucune écriture');
  }
  /* un vrai navigateur (iPhone) compte, lui */
  const envN = envNeuf();
  await servir(new Request('https://shops.kd-mc.com/', { headers: { 'sec-fetch-dest': 'document', accept: 'text/html', 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', 'CF-Connecting-IP': '6.6.6.6' } }), envN);
  assert.equal(envN.ACCOUNTS.m.size, 2, 'un iPhone compte (2 écritures)');
  /* CENTRES DE DONNÉES (mesuré 3.10 : 632 + 570 écritures à 00h-01h UTC = 9 publications + robots en vrai navigateur depuis
     GitHub Actions = Azure, réseau 8075) : un vrai Chrome qui arrive d'un nuage n'est pas un visiteur → rien. */
  for (const asn of [8075, 16509, 15169, 24940, 16276]) {
    const envA = envNeuf();
    const rq = new Request('https://shops.kd-mc.com/', { headers: { 'sec-fetch-dest': 'document', accept: 'text/html', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', 'CF-Connecting-IP': '20.0.0.' + (asn % 200) } });
    Object.defineProperty(rq, 'cf', { value: { asn } });
    await servir(rq, envA);
    assert.equal(envA.ACCOUNTS.m.size, 0, 'réseau ' + asn + ' (centre de données) : aucune écriture');
  }
  /* …mais le Relais privé iCloud (Cloudflare 13335, Akamai 20940) et les vrais opérateurs (Orange 3215, Monaco Telecom 6758) comptent */
  for (const asn of [13335, 20940, 3215, 6758]) {
    const envB = envNeuf();
    const rq = new Request('https://shops.kd-mc.com/', { headers: { 'sec-fetch-dest': 'document', accept: 'text/html', 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', 'CF-Connecting-IP': '7.0.0.' + (asn % 200) } });
    Object.defineProperty(rq, 'cf', { value: { asn } });
    await servir(rq, envB);
    assert.equal(envB.ACCOUNTS.m.size, 2, 'réseau ' + asn + ' (iPhone, relais privé ou opérateur) : compté');
  }
  /* sabotage, dans la source : le filtre est bien BRANCHÉ (une liste sans appel ne protège rien — leçon #315 c) */
  assert.match(SRC, /if \(ASN_NUAGES\.has\(asn\)\) return;/, 'le filtre des centres de données est appelé dans ficheLaVisite');
  assert.match(SRC, /ASN_NUAGES = new Set\(\[8075,/, 'Azure (GitHub Actions) est le premier réseau de la liste');
  /* sabotage, dans la source : la clé est bâtie avec le jour et le marqueur vit ≥ 24 h */
  assert.match(SRC, /'anonv:' \+ \(await sha256Hex\(ip \+ '\|' \+ host\)\)\.slice\(0, 20\) \+ ':' \+ jour/, 'marqueur par JOUR');
  assert.match(SRC, /put\(dejaVu, '1', \{ expirationTtl: 90000 \}\)/, 'marqueur gardé 25 h');
  assert.ok(!/':' \+ heure/.test(SRC), 'plus aucun marqueur par heure');
});

test('une image ou un script n’écrit RIEN (pas de bruit, pas de coût)', async () => {
  for (const dest of ['image', 'script', 'style', 'font']) {
    const env = envNeuf();
    await servir(new Request('https://lingua.kd-mc.com/logo.png', {
      headers: { 'sec-fetch-dest': dest, cookie: 'kdmc_sso=' + (await jeton('u_marie', 'Marie Dupont')) },
    }), env);
    assert.equal(env.ACCOUNTS.m.size, 0, dest + ' a écrit dans le journal alors qu’il ne devrait pas');
  }
});

test('250 employés qui arrivent ne font PAS 250 notifications à Kevin', async () => {
  /* DANGER CRÉÉ LE 22.09 : les deux apps déclarent maintenant leur utilisateur au
     domaine. Les ~250 employés sans session vont arriver « nouveaux » au fil de
     leurs prises de poste. Sans frein, c'est 250 notifications sur son iPhone — et
     une alerte qu'on finit par ignorer ne protège plus rien (règle anti-spam). */
  const env = envNeuf();
  const envois = [];
  env.KDMC_PUSH_URL = 'https://push.exemple'; env.KDMC_PUSH_TOKEN = 'jeton';
  const vrai = globalThis.fetch;
  globalThis.fetch = async (u, o) => {
    if (String(u).indexOf('push.exemple') >= 0) { envois.push(JSON.parse(o.body || '{}')); return new Response('{}', { status: 200 }); }
    return new Response('<html>page</html>', { status: 200, headers: { 'content-type': 'text/html' } });
  };
  for (let i = 0; i < 25; i++) {
    await servir(page('cmcteams.kd-mc.com', await jeton('u_' + i, 'Prenom' + i + ' Nom' + i)), env);
  }
  globalThis.fetch = vrai;
  /* Depuis le compte unique (27.09) : un nouvel inscrit n'attend plus de décision → ZÉRO
     notification (il y en avait 1 par heure quand l'arrivant restait enfermé). */
  assert.equal(envois.length, 0, '25 arrivées → ' + envois.length + ' notification(s) (0 attendue)');
  /* …mais le JOURNAL, lui, garde TOUT : aucune arrivée ne se perd. */
  const journal = [...env.ACCOUNTS.m.keys()].filter((k) => String(k).startsWith('acc:'));
  assert.equal(journal.length, 25, 'les 25 fiches sont bien créées (' + journal.length + ')');
});

test('une session révoquée (« Déconnecter partout ») ne fiche plus rien', async () => {
  const env = envNeuf();
  const vieux = Date.now() - 60000;
  env.ACCOUNTS.m.set('acc:u_marie', JSON.stringify({ uid: 'u_marie', name: 'Marie Dupont', revoked_at: Date.now() }));
  const avant = env.ACCOUNTS.m.get('acc:u_marie');
  await servir(page('lingua.kd-mc.com', await jeton('u_marie', 'Marie Dupont', vieux)), env);
  assert.equal(env.ACCOUNTS.m.get('acc:u_marie'), avant, 'la fiche a été touchée malgré la révocation');
});

test('une panne du stockage ne casse JAMAIS la page', async () => {
  const env = envNeuf();
  env.ACCOUNTS = { get: async () => { throw new Error('KV en panne'); }, put: async () => { throw new Error('KV en panne'); } };
  const r = await servir(page('lingua.kd-mc.com', await jeton('u_marie', 'Marie Dupont')), env);
  assert.ok(r.status < 500, 'la page répond quand même (statut ' + r.status + ')');
});
