/* GARDE — « le corps de Bee ne bouge pas » (Kevin 29.10.2026, mesuré dans SON Chrome par le Lenovo : 0 canvas, 0 élément animé, alors que la
   marionnette se dit active).
   node services/kdmc-router/rig-cors.test.mjs
   Cause MESURÉE : la marionnette pose l'image du dessin (…/bee/v2/rig/base.webp, hébergée par Lingua) sur un maillage. Pour la lire depuis une autre
   adresse du domaine (javis., arbre., le portail…) le navigateur la demande en CORS « anonymous » : SANS cookie. La porte du domaine répondait alors
   401 (« Connexion au domaine requise », depuis le 3.10), et depuis la bascule du 15.10 aucune réponse ne portait plus Access-Control-Allow-Origin.
   Image refusée → pas de texture → pas de canvas : on gardait le dessin plat (« l'image d'avant »).
   Avec le VRAI routeur, SANS session, depuis une autre adresse du domaine :
     1. les images du dessin des mascottes (bee/donkey … /rig/*.webp) sont servies (200) avec Access-Control-Allow-Origin ;
     2. tout le reste de l'app Lingua reste fermé (401) : on n'ouvre que le dessin, pas un autre fichier, pas un chemin voisin ;
     3. une page de Lingua montre toujours la porte. */
import mod from './worker.js';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}`); };
const env = { KDMC_SSO_SECRET: 'sec', ACCOUNTS: { get: async () => null, put: async () => {}, delete: async () => {} } };
globalThis.fetch = async (input) => { const u = typeof input === 'string' ? input : input.url; return new Response('CONTENU ' + new URL(u).pathname, { status: 200, headers: { 'content-type': 'image/webp' } }); };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const demande = async (hote, chemin, dest) => {
  const r = await mod.fetch(new Request('https://' + hote + chemin, { headers: { 'user-agent': UA, origin: 'https://javis.kd-mc.com', 'sec-fetch-mode': 'cors', 'sec-fetch-site': 'same-site', ...(dest ? { 'sec-fetch-dest': dest } : {}) } }), env, { waitUntil() {} });
  return { st: r.status, t: await r.text(), acao: r.headers.get('access-control-allow-origin') || '', corp: r.headers.get('cross-origin-resource-policy') || '' };
};
const base = await demande('lingua.kd-mc.com', '/bee/v2/rig/base.webp', 'image');
const aile = await demande('lingua.kd-mc.com', '/bee/v2/rig/wing-l.webp', 'image');
const ane = await demande('lingua.kd-mc.com', '/donkey/rig/base.webp', 'image');   /* le VRAI chemin de Bourricot (mesuré en ligne : pas de « v2 ») */
const ancienne = await demande('lingua.kd-mc.com', '/bee/rig/wing-r.webp', 'image');
const ailleurs = await demande('javis.kd-mc.com', '/bee/v2/rig/base.webp', 'image');
ok(base.st === 200 && /CONTENU .*\/bee\/v2\/rig\/base\.webp/.test(base.t), '1a. base.webp de Bee servie sans session (200)');
ok(base.acao === '*', '1b. … avec Access-Control-Allow-Origin (' + (base.acao || 'absent') + ')');
ok(aile.st === 200 && aile.acao === '*', '1c. une aile (wing-l.webp) : 200 + CORS');
ok(ane.st === 200 && ane.acao === '*', '1d. le dessin de Bourricot : 200 + CORS');
ok(ancienne.st === 200 && ancienne.acao === '*', '1d2. l\'ancien dossier de Bee (bee/rig/, sans v2) : 200 + CORS');
ok(ailleurs.st === 200 && ailleurs.acao === '*', '1e. même chose depuis javis.kd-mc.com (le widget l\'y lit aussi)');
ok(!/^same-site$/.test(base.corp), '1f. pas de cross-origin-resource-policy qui l\'interdise à une autre adresse du domaine (' + (base.corp || 'absent') + ')');
const appjs = await demande('lingua.kd-mc.com', '/app.js', 'script');
const voisin = await demande('lingua.kd-mc.com', '/bee/v2/rig/../../app.js', 'image');
const autre = await demande('lingua.kd-mc.com', '/bee/v2/rig/notes.txt', 'image');
const donnees = await demande('lingua.kd-mc.com', '/data.js', 'script');
const page = await demande('lingua.kd-mc.com', '/', 'document');
ok(appjs.st === 401 && donnees.st === 401, '2a. app.js et data.js restent fermés sans session (401)');
ok(voisin.st === 401 || !/CONTENU .*app\.js/.test(voisin.t), '2b. « rig/../../app.js » n\'ouvre pas app.js');
ok(autre.st === 401, '2c. un fichier du dossier rig qui n\'est pas une image du dessin reste fermé (401)');
ok(page.st === 200 && !/CONTENU/.test(page.t), '3. la page de l\'app montre la porte, pas le contenu');
console.log('SABOTAGE');
const src = (await import('node:fs')).readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
ok(/DESSIN_MASCOTTE/.test(src), 'S1. la règle du dessin des mascottes est dans le routeur');
ok(!/DESSIN_MASCOTTE/.test(src.replace(/DESSIN_MASCOTTE/g, 'X')), 'S2. sans la règle → la garde la détecterait');
console.log(`\n${pass} OK / ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
