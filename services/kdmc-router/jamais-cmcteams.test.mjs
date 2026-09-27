/* CMCteams ne s'ouvre QU'À SON ADRESSE — jamais par accident.   node jamais-cmcteams.test.mjs

   POURQUOI (Kevin 27.09 nuit, capture iPhone) : une icône de l'écran d'accueil ouvrait
   « kd-mc.com » et montrait la connexion CMCteams. MESURÉ en vrai (Zapier, requête d'iPhone) :
   https://kd-mc.com/tools/cuisine/index.html → 200 + CMCteams v9.926. L'hébergeur ne connaît
   pas /kdmc-home/tools/cuisine/ et répond par SA page d'accueil — CMCteams — avec un 200.
   Règle de Kevin : « Personne ne doit atterrir sur CMCteams ou light sans se connecter ou
   s'inscrire complètement ». Ce test verrouille :
     A. une PAGE d'app ouverte sous kd-mc.com part vers sa belle adresse (301) ;
     B. les fichiers que le portail charge depuis ces dossiers (script, image) ne sont PAS redirigés ;
     C. hors de cmcteams.kd-mc.com, une réponse « CMCteams » de l'hébergeur n'est jamais servie
        (404 honnête), sauf l'accueil de CMCteams demandé exprès → vers cmcteams.kd-mc.com ;
     D. les vraies pages (portail, light, cuisine) passent intactes, CMCteams à son adresse aussi. */
import mod, { belleAdresseDe, estPageCmcteams } from './worker.js';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log('  ❌ ' + m)); };

/* Les VRAIES pages quand elles sont là (coffre). Le dépôt public n'a ni CMCteams ni la light
   (gardés privés) : on prend alors leur en-tête exact, ce que la signature regarde. */
const lire = (chemin, secours) => { try { return readFileSync(resolve(RACINE, chemin), 'utf8'); } catch { return secours; } };
const VRAIE_CMCTEAMS = lire('index.html', '<!doctype html><html><head><title>CMCteams — Planning & gestion d\'équipes Casino de Monaco (SBM)</title><script>var APP_VER="v9.926";</script></head><body>connexion</body></html>');
const LIGHT = lire('tools/departs/index.html', '<!doctype html><html><head><title>CMCteams light — Départs &amp; équipes</title><script>var APP_VER="v1.58";</script></head><body>CMCteams light</body></html>');
const PORTAIL = lire('kdmc-home/index.html', '<!doctype html><html><head><title>KDMC APEX — Mon univers</title></head><body>KDMC APEX</body></html>');
const CUISINE = lire('tools/cuisine/index.html', '<!doctype html><html><head><title>A Cüjina de Mùnegu</title></head><body>livre</body></html>');

/* Hébergeur « monopage », comme le vrai : tout chemin inconnu → 200 + la page d'accueil (CMCteams). */
const CONNUS = {
  '/kdmc-home/': PORTAIL, '/kdmc-home/index.html': PORTAIL,
  '/tools/departs/': LIGHT, '/tools/departs/index.html': LIGHT,
  '/tools/cuisine/': CUISINE, '/tools/cuisine/index.html': CUISINE,
  '/': VRAIE_CMCTEAMS, '/index.html': VRAIE_CMCTEAMS,
};
const vus = [];
globalThis.fetch = async (req) => {
  const u = new URL(typeof req === 'string' ? req : req.url);
  vus.push(u.pathname);
  if (/\.js$/.test(u.pathname)) return new Response('/* script */', { status: 200, headers: { 'content-type': 'text/javascript' } });
  const corps = CONNUS[u.pathname] ?? VRAIE_CMCTEAMS;
  return new Response(corps, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
};
const env = { UPSTREAM_BASE: 'https://hebergeur.test', UPSTREAM_PREFIX: '' };   // sans secret SSO : pas de porte « fiche »
const ctx = { waitUntil() {} };
const page = { 'sec-fetch-dest': 'document', accept: 'text/html' };
async function va(url, entetes = page) {
  const r = await mod.fetch(new Request(url, { headers: entetes }), env, ctx);
  const t = r.status === 200 ? await r.text() : await r.text().catch(() => '');
  return { status: r.status, loc: r.headers.get('location') || '', texte: t, cmc: estPageCmcteams(t) };
}

console.log('\n=== 0. La signature ne vise QUE la page principale de CMCteams ===');
ok(estPageCmcteams(VRAIE_CMCTEAMS), 'la vraie page CMCteams (index.html) est reconnue');
ok(!estPageCmcteams(LIGHT), 'la light (« CMCteams light ») n\'est PAS prise pour CMCteams');
ok(!estPageCmcteams(PORTAIL) && !estPageCmcteams(CUISINE), 'ni le portail, ni le livre de cuisine');

console.log('\n=== A. Une page d\'app ouverte sous kd-mc.com → sa belle adresse ===');
{ const r = await va('https://kd-mc.com/tools/cuisine/index.html');
  ok(r.status === 301 && r.loc === 'https://cuisine.kd-mc.com/index.html', 'LE CAS DE LA CAPTURE : kd-mc.com/tools/cuisine/index.html → cuisine.kd-mc.com/index.html  [' + r.status + ' ' + r.loc + ']'); }
{ const r = await va('https://kd-mc.com/CMCteams/tools/cuisine/?x=1');
  ok(r.status === 301 && r.loc === 'https://cuisine.kd-mc.com/?x=1', 'avec /CMCteams/ devant et une requête : même destination, requête gardée'); }
{ const r = await va('https://kd-mc.com/tools/departs/');
  ok(r.status === 301 && /^https:\/\/(departs|cmcteams-light)\.kd-mc\.com\/$/.test(r.loc), 'la light ouverte sous le portail → sa propre adresse  [' + r.loc + ']'); }
ok(belleAdresseDe('/worldmonitor/') === '' && belleAdresseDe('/cujina/') === '' && belleAdresseDe('/') === '',
  'les chemins propres au portail (/worldmonitor/, /cujina/, /) ne sont pas touchés');

console.log('\n=== B. Les fichiers chargés par le portail ne sont pas redirigés ===');
{ const r = await mod.fetch(new Request('https://kd-mc.com/CMCteams/tools/shared/version-badge-pwa.js'), env, ctx);
  ok(r.status === 200, 'script partagé chargé par le portail : servi (200), pas de redirection'); }
{ const r = await mod.fetch(new Request('https://kd-mc.com/tools/cuisine/img/7.jpg', { headers: { 'sec-fetch-dest': 'image' } }), env, ctx);
  ok(r.status !== 301, 'image d\'un dossier d\'app demandée par une page : pas redirigée'); }

console.log('\n=== C. Le repli « CMCteams » de l\'hébergeur n\'est jamais servi ailleurs ===');
{ const r = await va('https://kd-mc.com/page-qui-n-existe-pas.html');
  ok(r.status === 404 && !r.cmc && /n’existe pas/.test(r.texte), 'kd-mc.com, page inconnue → 404 honnête, PAS CMCteams  [' + r.status + ']'); }
{ const r = await va('https://la-detente.kd-mc.com/perdu.html');
  ok(r.status === 404 && !r.cmc, 'une boutique, page inconnue → 404, PAS CMCteams'); }
{ const r = await va('https://kd-mc.com/cujina/nimporte.html');
  ok(r.status === 404 && !r.cmc, 'chemin du livre sur le portail, page inconnue → 404, PAS CMCteams'); }
{ const r = await va('https://kd-mc.com/CMCteams/');
  ok(r.status === 301 && r.loc === 'https://cmcteams.kd-mc.com/', 'l\'accueil CMCteams demandé sous le portail → cmcteams.kd-mc.com (sa connexion à lui)'); }

console.log('\n=== D. Les vraies pages passent intactes ===');
{ const r = await va('https://kd-mc.com/');
  ok(r.status === 200 && /KDMC APEX/.test(r.texte), 'le portail kd-mc.com : servi tel quel'); }
{ const r = await va('https://cmcteams-light.kd-mc.com/');
  ok(r.status === 200 && /CMCteams light/.test(r.texte), 'la light à son adresse : servie'); }
{ const r = await va('https://cmcteams.kd-mc.com/');
  ok(r.status === 200 && r.cmc, 'CMCteams à SON adresse : servi (il y a son propre écran de connexion)'); }
{ const r = await va('https://kd-mc.com/cujina/');
  ok(r.status === 200 && !r.cmc, 'le livre sur le chemin du portail : servi'); }

console.log(`\nJamais CMCteams par accident : ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
