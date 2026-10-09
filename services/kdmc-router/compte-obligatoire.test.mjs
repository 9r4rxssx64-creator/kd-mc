/* AUCUNE CONSULTATION SANS COMPTE, NULLE PART (Kevin 3.10.2026 : « Aucune consultation sans compte nulle part »).
   Avant : 9 adresses sur 31 demandaient la fiche ; les 22 autres (boutiques, Lingua, Apex, arbre…) s'ouvraient à n'importe qui,
   simplement COMPTÉ. Ce test passe par le VRAI routeur (worker.js), hébergeur simulé, sur TOUTES les adresses lues dans ROUTES, et prouve :
     · un inconnu voit la porte (et jamais la page) sur chaque adresse, sauf le portail (c'est LA porte) ;
     · pages juridiques, fichiers d'installation, scripts/données : inchangés ;
     · un compte non révoqué entre partout ; révoqué, falsifié, bloqué ici : non ;
     · la sonde du domaine passe SEULEMENT avec l'en-tête ET depuis un centre de données (Azure) ;
     · plus aucun compteur anonyme : un inconnu n'écrit RIEN dans le stockage ;
     · le retour arrière (KDMC_PORTE_TOTALE=0) existe ;
     · le branchement est dans le chemin du routeur (sabotage : sans l'appel, ce test est rouge).
   node compte-obligatoire.test.mjs */
import mod from './worker.js';
import { createHmac, createHash } from 'crypto';
import { readFileSync } from 'node:fs';

const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const signe = (uid, v, iat) => { const p = b64u(JSON.stringify({ u: uid, n: uid, c: 1, v: v ? 1 : 0, iat: iat || Date.now(), exp: Date.now() + 1e9 })); return p + '.' + b64u(createHmac('sha256', 'sec').update(p).digest()); };
let ecritures = 0; const kv = new Map();
const ACCOUNTS = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { ecritures++; kv.set(k, v); }, delete: async (k) => { kv.delete(k); } };
const env = { KDMC_SSO_SECRET: 'sec', KDMC_CODE_OBLIGATOIRE: '0' /* 8.10 : ce test ne porte pas sur le code du compte — le blocage « crée ton code » (codeManquant) est prouvé dans code-attente.test.mjs § 7 */, KDMC_ADMIN_PIN_SHA256: createHash('sha256').update('424242').digest('hex'), ACCOUNTS };
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };
const realFetch = globalThis.fetch;
globalThis.fetch = async (input) => { const u = typeof input === 'string' ? input : input.url;
  if (!/(^|\.)kd-mc\.com$/i.test(new URL(u).hostname)) return new Response('CONTENU ' + new URL(u).pathname, { status: 200, headers: { 'content-type': 'text/html' } });
  return realFetch(input); };
const attente = [];
const va = async (url, extra, asn, e) => {
  const rq = new Request(url, { headers: Object.assign({ 'sec-fetch-dest': 'document', accept: 'text/html' }, extra || {}) });
  if (asn) Object.defineProperty(rq, 'cf', { value: { asn } });
  const r = await mod.fetch(rq, e || env, { waitUntil: (p) => attente.push(p) }); await Promise.all(attente.splice(0));
  const t = r.status >= 300 && r.status < 400 ? '' : await r.text();
  return { st: r.status, t, servi: /^CONTENU /.test(t), porte: r.headers.get('x-kdmc-porte') || '' };
};
const SRC = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
const HOTES = [...SRC.match(/const ROUTES\s*=\s*\{[\s\S]*?\n\};/)[0].matchAll(/'([a-z0-9.-]+\.kd-mc\.com)':/g)].map((x) => x[1]).filter((h) => h !== 'admin.kd-mc.com');
const PORTAIL = ['kd-mc.com', 'www.kd-mc.com'];
const ADMIN_SEUL = ['beatbot.kd-mc.com', 'autorisations.kd-mc.com'];   /* verrou « admin » (code / Face ID), plus strict que la fiche */
ok(HOTES.length >= 30, 'adresses lues dans ROUTES : ' + HOTES.length);

/* 1. Un inconnu : la porte sur CHAQUE adresse (sauf le portail), jamais la page. */
{ const fuites = [], vides = [];
  for (const h of HOTES) {
    if (PORTAIL.includes(h)) continue;
    const r = await va('https://' + h + '/'); if (r.servi) fuites.push(h); else if (r.porte !== 'fiche' && !ADMIN_SEUL.includes(h)) vides.push(h + ' (' + r.st + ')');
  }
  ok(!fuites.length, 'adresses qui servent encore leur page à un inconnu : ' + fuites.join(', '));
  ok(!vides.length, 'adresses sans porte « fiche » : ' + vides.join(', ')); }
/* La porte se montre aussi sur une page profonde, pas seulement à la racine. */
for (const u of ['https://shops.kd-mc.com/commande/42.html', 'https://lingua.kd-mc.com/index.html', 'https://arbre.kd-mc.com/arbre.html', 'https://chez-lolo.kd-mc.com/menu/']) {
  const r = await va(u); ok(!r.servi && r.porte === 'fiche', 'page profonde : porte pour un inconnu : ' + u);
}

/* 2. Ce qui reste ouvert, et pourquoi. */
for (const h of PORTAIL) { const r = await va('https://' + h + '/'); ok(r.servi, 'le portail reste ouvert (LA porte : inscription, connexion) : ' + h); }
for (const u of ['https://shops.kd-mc.com/privacy.html', 'https://lingua.kd-mc.com/cgu.html', 'https://apex-chat.kd-mc.com/privacy.html']) { const r = await va(u); ok(r.servi, 'page juridique lisible avant inscription : ' + u); }
for (const u of ['https://shops.kd-mc.com/manifest.json', 'https://lingua.kd-mc.com/sw.js', 'https://arbre.kd-mc.com/icon-192.png']) { const r = await va(u, { 'sec-fetch-dest': '' , accept: '*/*' }); ok(r.servi, 'installation possible : ' + u); }
/* « Ni voir le code ni quoi que ce soit » (Kevin 3.10) : scripts, styles, images et données sont fermés aussi — 401 sec, sans contenu. */
for (const u of ['https://shops.kd-mc.com/app.js', 'https://lingua.kd-mc.com/data.json', 'https://arbre.kd-mc.com/style.css', 'https://apex-ai.kd-mc.com/chunks/x.js', 'https://kd-mc.com/CMCteams/shops/app.js', 'https://kd-mc.com/apps.json', 'https://kd-mc.com/CMCteams/kdmc-home/apps.json', 'https://kd-mc.com/CMCteams/kdmc-home/osint/data.json']) {
  for (const [dest, acc] of [['script', '*/*'], ['', '*/*'], ['empty', 'application/json']]) {
    const r = await va(u, { 'sec-fetch-dest': dest, accept: acc }); ok(!r.servi && r.st === 401, 'sans compte, rien à lire (' + (dest || 'curl') + ') : ' + u + ' [' + r.st + ']');
  }
}
{ const r = await va('https://shops.kd-mc.com/app.js', { 'sec-fetch-dest': 'script', accept: '*/*', cookie: 'kdmc_sso=' + signe('anne-martin', 0) }); kv.set('acc:anne-martin', JSON.stringify({ uid: 'anne-martin', name: 'Anne Martin' })); const r2 = await va('https://shops.kd-mc.com/app.js', { 'sec-fetch-dest': 'script', accept: '*/*', cookie: 'kdmc_sso=' + signe('anne-martin', 0) }); ok(r2.servi, 'avec un compte, le script se charge normalement'); }
/* Le portail : sa page et les fichiers qu'elle charge avant connexion, RIEN d'autre. */
for (const u of ['https://kd-mc.com/CMCteams/kdmc-home/kdmc-portal.js', 'https://kd-mc.com/CMCteams/kdmc-home/kdmc-sso.js', 'https://kd-mc.com/CMCteams/kdmc-home/design-system.css', 'https://kd-mc.com/CMCteams/tools/shared/version-badge-pwa.js']) {
  const r = await va(u, { 'sec-fetch-dest': 'script', accept: '*/*' }); ok(r.servi, 'fichier de la page de connexion du portail, ouvert : ' + u);
}

/* Les chemins d'API servis par le routeur avant les adresses : plus anonymes non plus. */
for (const [m, u] of [['GET', 'https://arbre.kd-mc.com/__arbre/status'], ['GET', 'https://kd-mc.com/__deces?q=a'], ['POST', 'https://kd-mc.com/__deces'], ['POST', 'https://rotaplan.kd-mc.com/__demande']]) {
  const r = await mod.fetch(new Request(u, { method: m, headers: { origin: new URL(u).origin, 'content-type': 'application/x-www-form-urlencoded' }, body: m === 'POST' ? 'prenom=Ab' : undefined }), env, { waitUntil() {} });
  ok(r.status === 401 && (await r.text()).includes('compte_requis'), 'API sans compte : 401 compte_requis : ' + m + ' ' + u + ' [' + r.status + ']');
}
{ kv.set('acc:anne-martin', JSON.stringify({ uid: 'anne-martin', name: 'Anne Martin' }));
  const r = await mod.fetch(new Request('https://kd-mc.com/__deces?q=a', { headers: { cookie: 'kdmc_sso=' + signe('anne-martin', 0) } }), env, { waitUntil() {} }); ok(r.status !== 401, 'avec un compte, la recherche répond (pas 401) [' + r.status + ']'); }

/* 3. Comptes. */
kv.set('acc:anne-martin', JSON.stringify({ uid: 'anne-martin', name: 'Anne Martin' }));
const anne = signe('anne-martin', 0);
{ const nok = []; for (const h of HOTES) { if (PORTAIL.includes(h) || ADMIN_SEUL.includes(h)) continue; const r = await va('https://' + h + '/', { cookie: 'kdmc_sso=' + anne }); if (!r.servi) nok.push(h + ' ' + r.st + ' ' + r.porte); }
  ok(!nok.length, 'un compte du domaine entre sur CHAQUE adresse : ' + nok.join(', ')); }
{ const r = await va('https://shops.kd-mc.com/', { authorization: 'Bearer ' + anne }); ok(r.servi, 'reconnu aussi par laissez-passer (app installée)'); }
kv.set('acc:paul-roche', JSON.stringify({ uid: 'paul-roche', name: 'Paul Roche', revoked_at: Date.now() }));
{ const r = await va('https://shops.kd-mc.com/', { cookie: 'kdmc_sso=' + signe('paul-roche', 0, Date.now() - 60000) }); ok(!r.servi && r.porte === 'fiche', 'session RÉVOQUÉE → porte'); }
{ const r = await va('https://shops.kd-mc.com/', { cookie: 'kdmc_sso=faux.' + anne.split('.')[1] }); ok(!r.servi && r.porte === 'fiche', 'jeton FALSIFIÉ → porte'); }
kv.set('acc:lea-noir', JSON.stringify({ uid: 'lea-noir', name: 'Léa Noir', bloque: ['chez-lolo'] }));
{ const r = await va('https://chez-lolo.kd-mc.com/', { cookie: 'kdmc_sso=' + signe('lea-noir', 0) }); ok(!r.servi && r.st === 403, 'compte bloqué sur cette app → page claire (403), pas la page  [' + r.st + ']'); }
{ const r = await va('https://shops.kd-mc.com/', { cookie: 'kdmc_sso=' + signe('lea-noir', 0) }); ok(r.servi, '… et ailleurs, il entre'); }

/* 4. Sonde du domaine : en-tête ET centre de données. */
{ const s1 = await va('https://shops.kd-mc.com/', { 'x-kdmc-sonde': 't' }, 8075); ok(s1.servi, 'sonde (en-tête + Azure 8075) : passe');
  const s2 = await va('https://shops.kd-mc.com/', { 'x-kdmc-sonde': 't' }, 3215); ok(!s2.servi && s2.porte === 'fiche', 'en-tête posé depuis un vrai réseau d\'accès (Orange 3215) : n\'ouvre RIEN');
  const s3 = await va('https://shops.kd-mc.com/', {}, 8075); ok(!s3.servi && s3.porte === 'fiche', 'centre de données SANS l\'en-tête : porte (un navigateur de test doit se déclarer)');
  const s4 = await va('https://shops.kd-mc.com/', { 'x-kdmc-sonde': 't' }); ok(!s4.servi, 'en-tête sans aucun réseau connu : porte'); }

/* 5. Plus aucun compteur anonyme. */
{ ecritures = 0; for (const h of ['shops.kd-mc.com', 'lingua.kd-mc.com', 'arbre.kd-mc.com']) await va('https://' + h + '/', { 'cf-connecting-ip': '198.51.100.' + h.length }, 3215);
  ok(ecritures === 0, 'un inconnu n\'écrit RIEN dans le stockage (aucun compteur anonyme) : ' + ecritures + ' écriture(s)');
  ok(![...kv.keys()].some((k) => /^anon/.test(k)), 'aucune clé anon: / anonv:'); }

/* 6. Retour arrière sans toucher au code : KDMC_PORTE_TOTALE=0. */
{ const e0 = { KDMC_SSO_SECRET: 'sec', KDMC_PORTE_TOTALE: '0', ACCOUNTS }; const r = await va('https://shops.kd-mc.com/', {}, 3215, e0); ok(r.servi, 'interrupteur KDMC_PORTE_TOTALE=0 : l\'ancien comportement revient'); }
{ const e1 = { ACCOUNTS }; const r = await va('https://shops.kd-mc.com/', {}, 3215, e1); ok(r.servi, 'domaine sans SSO (test) : ouvert, comme les autres portes'); }

/* 7. Câblage : l'appel est dans le chemin du routeur (une fonction que personne n'appelle ne protège rien). */
ok(/if \(!g\) return porteGenerale\(request, url, env, cheminCMC\);/.test(SRC), 'porteFermee appelle porteGenerale quand l\'adresse n\'a pas de porte propre');
ok(/const ferme = await porteFermee\(request, url, env, cheminCMC\);/.test(SRC), 'le routeur appelle porteFermee pour TOUTE adresse');

console.log(`\n${pass} OK · ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
