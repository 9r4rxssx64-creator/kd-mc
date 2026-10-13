/* ⚡ LA PORTE ET L'HÉBERGEUR EN MÊME TEMPS (Kevin 10.10.2026 : « Vérifie la réactivité… on attend bcp trop avant l'exécution »).
   Mesuré avant : le routeur faisait DEUX attentes à la suite pour chaque page et chaque fichier d'une app — la porte (jeton +
   lecture du compte dans le KV), PUIS la demande à l'hébergeur. Lingua mettait 0,65 s avant son premier octet.
   Ce test passe par le VRAI routeur (worker.js), stockage et hébergeur simulés LENTS (200 ms chacun), et prouve — par la
   STRUCTURE, pas par un seuil de temps fragile sous charge :
     1. compte reconnu, page d'app : la demande à l'hébergeur PART AVANT que la lecture du compte soit finie ;
     2. idem pour un fichier (script) de l'app ;
     3. sécurité inchangée : un inconnu voit la porte, JAMAIS le contenu (même si l'hébergeur a répondu entre-temps) ;
     4. une écriture (POST) n'est JAMAIS envoyée d'avance à l'hébergeur ;
     5. le portail (kd-mc.com) garde son chemin d'avant ;
     6. le contenu servi est bien celui de l'hébergeur (même adresse demandée qu'avant).
   Sabotage (prouvé le 10.10) : sans `prechargeAmont`, 1 et 2 rougissent.
   node services/kdmc-router/porte-parallele.test.mjs */
import mod from './worker.js';
import { createHmac } from 'crypto';

const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const signe = (uid) => { const p = b64u(JSON.stringify({ u: uid, n: uid, c: 1, v: 0, iat: Date.now(), exp: Date.now() + 1e9 })); return p + '.' + b64u(createHmac('sha256', 'sec').update(p).digest()); };
const dort = (ms) => new Promise((r) => setTimeout(r, ms));
const journal = [];
const kv = new Map([['acc:anne-martin', JSON.stringify({ uid: 'anne-martin', name: 'Anne Martin', code_at: 1 })]]);
const ACCOUNTS = {
  get: async (k) => { journal.push(['kv-debut', k]); await dort(200); journal.push(['kv-fin', k]); return kv.has(k) ? kv.get(k) : null; },
  put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); },
};
const env = { KDMC_SSO_SECRET: 'sec', ACCOUNTS };
globalThis.fetch = async (input, init) => {
  const u = new URL(typeof input === 'string' ? input : input.url);
  const m = (init && init.method) || (typeof input === 'string' ? 'GET' : input.method);
  journal.push(['amont-debut', m + ' ' + u.pathname]);
  await dort(200);
  journal.push(['amont-fin', u.pathname]);
  const ct = /\.js$/.test(u.pathname) ? 'text/javascript' : 'text/html; charset=utf-8';
  return new Response('CONTENU ' + u.pathname, { status: 200, headers: { 'content-type': ct } });
};
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log('  ❌ ' + m + (d ? '  → ' + d : ''))); };
const va = async (url, { methode = 'GET', cookie = '', dest = 'document' } = {}) => {
  journal.length = 0;
  const attente = [];
  const h = { 'sec-fetch-dest': dest, accept: dest === 'document' ? 'text/html' : '*/*', 'user-agent': 'Mozilla/5.0 (iPhone)' };
  if (cookie) h.cookie = cookie;
  let r;
  /* Node (pas Cloudflare) refuse de relayer un corps de requête sans l'option « duplex » : pour le POST, seul l'ORDRE des appels compte ici. */
  try { r = await mod.fetch(new Request(url, { method: methode, headers: h, body: methode === 'POST' ? '{}' : undefined }), env, { waitUntil: (p) => attente.push(p) }); }
  catch (e) { if (methode !== 'POST') throw e; return { st: 0, t: '', porte: '', j: journal.slice() }; }
  const t = r.status >= 300 && r.status < 400 ? '' : await r.text();
  await Promise.all(attente.map((p) => p.catch(() => {})));
  return { st: r.status, t, porte: r.headers.get('x-kdmc-porte') || '', j: journal.slice() };
};
const idx = (j, quoi) => j.findIndex((e) => e[0] === quoi);
const avant = (j) => { const a = idx(j, 'amont-debut'), k = j.findIndex((e) => e[0] === 'kv-fin' && /^acc:/.test(e[1])); return a >= 0 && k >= 0 && a < k; };
const COOKIE = 'kdmc_sso=' + signe('anne-martin');

console.log('\n== compte reconnu : la demande part pendant que la porte décide ==');
{ const r = await va('https://lingua.kd-mc.com/', { cookie: COOKIE });
  ok(r.st === 200 && /^CONTENU \/(CMCteams\/)?lingua\/(<|\s|$)/.test(r.t), '6. la page de Lingua est servie (contenu de l\'hébergeur, même adresse qu\'avant)', r.st + ' ' + r.t.slice(0, 60));
  ok(avant(r.j), '1. page : la demande à l\'hébergeur part AVANT la fin de la lecture du compte (avant : après)', JSON.stringify(r.j)); }
{ const r = await va('https://lingua.kd-mc.com/app.js?v=v2.139.0', { cookie: COOKIE, dest: 'script' });
  ok(r.st === 200 && /CONTENU .*app\.js/.test(r.t), '6b. le script est servi', r.st + ' ' + r.t.slice(0, 60));
  ok(avant(r.j), '2. fichier : idem, la demande à l\'hébergeur part pendant la porte', JSON.stringify(r.j)); }
{ const r = await va('https://kit.kd-mc.com/index.html', { cookie: COOKIE });
  ok(r.st === 200 && avant(r.j), '2b. même gain pour les boutiques (kit.kd-mc.com)', JSON.stringify(r.j)); }

console.log('\n== sécurité inchangée ==');
for (const u of ['https://lingua.kd-mc.com/', 'https://arbre.kd-mc.com/', 'https://croupier.kd-mc.com/entrainement.html']) {
  const r = await va(u);
  ok(!/^CONTENU /.test(r.t) && r.porte === 'fiche', '3. un inconnu voit la porte, jamais le contenu : ' + u, r.st + ' ' + r.porte + ' ' + r.t.slice(0, 40));
  ok(idx(r.j, 'amont-debut') < 0, '3c. sans aucun jeton (inconnu, robot), rien n\'est demandé d\'avance à l\'hébergeur : ' + u, JSON.stringify(r.j));
}
{ const r = await va('https://lingua.kd-mc.com/', { cookie: 'kdmc_sso=faux.jeton' });
  ok(!/^CONTENU /.test(r.t) && r.porte === 'fiche', '3d. jeton falsifié : la porte, jamais le contenu (même si l\'hébergeur a répondu pendant la porte)', r.st + ' ' + r.porte + ' ' + r.t.slice(0, 40)); }
{ const r = await va('https://lingua.kd-mc.com/app.js', { dest: 'script' });
  ok(r.st === 401 && !/^CONTENU /.test(r.t), '3b. un inconnu ne lit pas le script (401), même si l\'hébergeur a déjà répondu', r.st + ' ' + r.t.slice(0, 40)); }
{ const r = await va('https://rotaplan.kd-mc.com/merci.html', { methode: 'POST', cookie: COOKIE });
  const posts = r.j.filter((e) => e[0] === 'amont-debut' && /^POST /.test(e[1]));
  const k = r.j.findIndex((e) => e[0] === 'kv-fin' && /^acc:/.test(e[1]));
  const a = r.j.findIndex((e) => e[0] === 'amont-debut' && /^POST /.test(e[1]));
  ok(!posts.length || (k >= 0 && a > k), '4. une écriture (POST) n\'est jamais envoyée avant que la porte ait dit oui', JSON.stringify(r.j)); }
{ const r = await va('https://kd-mc.com/', { cookie: COOKIE });
  ok(r.st === 200, '5. le portail répond comme avant', r.st); }

console.log(`\n${pass} OK / ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
