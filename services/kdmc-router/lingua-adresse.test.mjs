/* GARDE — Lingua n'a qu'UNE adresse : lingua.kd-mc.com (Kevin 27.09 soir).
 *
 * « L'icône envoie toujours sur CMCteams. Il ne reconnaît pas mon code sauf en passant
 * par mon domaine. » Mesuré dans worker.js : depuis kd-mc.com, /CMCteams/lingua/ servait
 * Lingua sur une DEUXIÈME origine (autre mémoire locale → compte absent, code « inconnu »),
 * et /lingua/ demandait à l'hébergeur un dossier inexistant, auquel il répond « 200 + page
 * d'accueil » (CMCteams au dernier relevé, 19/09). Une icône posée depuis l'une de ces
 * adresses donne exactement les deux symptômes.
 *
 * Ce test passe par le VRAI routeur, hébergeur simulé, et prouve :
 *   · chaque chemin de Lingua sur kd-mc.com / www.kd-mc.com part en 301 vers
 *     lingua.kd-mc.com, en gardant le reste du chemin (et sa casse) et la requête ;
 *   · lingua.kd-mc.com elle-même n'est PAS touchée (sinon boucle) ;
 *   · /__lingua/… (voix, mémoire en ligne) n'est pas touché ;
 *   · un autre dossier du domaine (cuisine, portail) n'est pas touché ;
 *   · la redirection est durcie comme toute réponse (HSTS, nosniff) et non mise en cache.
 *
 * node services/kdmc-router/lingua-adresse.test.mjs
 */
import mod from './worker.js';

const kv = new Map();
const ACCOUNTS = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } };
const env = { KDMC_SSO_SECRET: 'sec', ACCOUNTS };
const ctx = { waitUntil() {} };

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } };

/* Hébergeur simulé : tout ce qui n'est pas kd-mc.com répond « CONTENU <chemin> ». */
const realFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
  const u = typeof input === 'string' ? input : input.url;
  if (!/(^|\.)kd-mc\.com$/i.test(new URL(u).hostname)) return new Response('CONTENU ' + new URL(u).pathname, { status: 200, headers: { 'content-type': 'text/html' } });
  return realFetch(input);
};
const va = async (url) => {
  const r = await mod.fetch(new Request(url, { headers: { 'sec-fetch-dest': 'document', accept: 'text/html' } }), env, ctx);
  return { st: r.status, loc: r.headers.get('location') || '', h: r.headers, t: r.status >= 300 && r.status < 400 ? '' : await r.text() };
};

/* 1. Les chemins fautifs partent tous vers la belle adresse. */
const CAS = [
  ['https://kd-mc.com/CMCteams/lingua/', 'https://lingua.kd-mc.com/'],
  ['https://kd-mc.com/CMCteams/lingua', 'https://lingua.kd-mc.com/'],
  ['https://kd-mc.com/CMCteams/lingua/index.html', 'https://lingua.kd-mc.com/index.html'],
  ['https://kd-mc.com/CMCteams/lingua/index.html?_upd=1', 'https://lingua.kd-mc.com/index.html?_upd=1'],
  ['https://kd-mc.com/lingua/', 'https://lingua.kd-mc.com/'],
  ['https://kd-mc.com/lingua', 'https://lingua.kd-mc.com/'],
  ['https://kd-mc.com/lingua/manifest.webmanifest', 'https://lingua.kd-mc.com/manifest.webmanifest'],
  ['https://www.kd-mc.com/CMCteams/lingua/', 'https://lingua.kd-mc.com/'],
  ['https://kd-mc.com/cmcteams/LINGUA/bee/Wave.webp', 'https://lingua.kd-mc.com/bee/Wave.webp'],   // dossier reconnu sans la casse, fichier gardé tel quel
];
for (const [de, vers] of CAS) {
  const r = await va(de);
  ok(r.st === 301 && r.loc === vers, `${de} → 301 ${vers}${r.st === 301 && r.loc === vers ? '' : ` (obtenu ${r.st} ${r.loc || '(rien)'})`}`);
}

/* 2. La redirection est une vraie réponse du domaine : durcie, jamais mise en cache. */
{
  const r = await va('https://kd-mc.com/CMCteams/lingua/');
  ok(/max-age/.test(r.h.get('strict-transport-security') || ''), 'la redirection porte HSTS (durcie comme toute réponse)');
  ok(r.h.get('x-content-type-options') === 'nosniff', 'la redirection porte nosniff');
  ok(/no-store/.test(r.h.get('cache-control') || ''), 'la redirection n\'est pas mise en cache (une icône ne doit pas la figer)');
}

/* 3. Ce qui ne doit PAS bouger. */
{
  const r = await va('https://lingua.kd-mc.com/');
  ok(r.st === 200 && /^CONTENU \/lingua\//.test(r.t), 'lingua.kd-mc.com/ est servie normalement (pas de boucle)');
}
{
  const r = await va('https://lingua.kd-mc.com/index.html');
  ok(r.st === 200 && /^CONTENU \/lingua\/index\.html/.test(r.t), 'lingua.kd-mc.com/index.html est servie normalement');
}
{
  const r = await mod.fetch(new Request('https://kd-mc.com/__lingua/load?k=abcdef0123456789'), env, ctx);
  ok(r.status === 200 && r.headers.get('content-type')?.includes('json'), '/__lingua/load (mémoire en ligne) reste servi par le domaine, pas redirigé');
}
{
  const r = await va('https://kd-mc.com/');
  ok(r.st !== 301 || !/lingua\.kd-mc\.com/.test(r.loc), 'le portail kd-mc.com/ n\'est pas envoyé vers Lingua');
}
{
  const r = await va('https://kd-mc.com/CMCteams/lingual/');
  ok(!(r.st === 301 && /lingua\.kd-mc\.com/.test(r.loc)), 'un dossier qui COMMENCE par « lingua » (lingual) n\'est pas confondu');
}
{
  const r = await va('https://kd-mc.com/CMCteams/tools/lingua/');
  ok(!(r.st === 301 && /lingua\.kd-mc\.com/.test(r.loc)), 'un sous-dossier ailleurs (/tools/lingua) n\'est pas confondu');
}

console.log(`\n${pass} OK · ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
