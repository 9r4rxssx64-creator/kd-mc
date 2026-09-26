/* Une REDIRECTION de l'hébergeur doit ramener le visiteur sur la BONNE page.
   node redirection-amont.test.mjs

   POURQUOI (mesuré 19/09/2026, runs 35458650075 puis 35460096029) : 11 pages du
   Kit IA — dont les pages de vente à 17/27/37/67 € — affichaient « version
   servie : v9.914 », c'est-à-dire l'app CMCteams, avec l'élément clé absent.
   L'hébergeur de production redirige « /page.html » vers « /page ». Le routeur
   réécrivait ce « Location » en ne connaissant QUE l'ancien rangement
   (« /CMCteams/… ») : le préfixe n'était pas retiré, l'adresse publique sortait
   DOUBLÉE, le routeur la re-préfixait, plus rien n'existait à cette adresse — et
   cet hébergeur répond « 200 + sa page d'accueil », qui est CMCteams. */
import mod from './worker.js';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log('  ❌ ' + m)); };

const PAGES = 'https://exemple.pages.dev';
/* Hébergeur qui sert à la racine ET qui redirige /x.html -> /x (comportement réel) */
async function ouOnAtterrit(env, url) {
  const vrai = globalThis.fetch;
  globalThis.fetch = async (req) => {
    const u = new URL(typeof req === 'string' ? req : req.url);
    if (/\.html$/.test(u.pathname)) {
      return new Response(null, { status: 308, headers: { location: u.pathname.replace(/\.html$/, '') } });
    }
    return new Response('<html><h1>page</h1></html>', { status: 200, headers: { 'content-type': 'text/html' } });
  };
  const res = await mod.fetch(new Request(url), env);
  globalThis.fetch = vrai;
  return { status: res.status, location: res.headers.get('location') };
}

console.log('\n== Redirection de l\'hébergeur : on doit atterrir sur la BONNE page ==\n');

const envPages = { UPSTREAM_BASE: PAGES, UPSTREAM_PREFIX: '' };
const r1 = await ouOnAtterrit(envPages, 'https://kit.kd-mc.com/bureau.html');
ok(r1.location === 'https://kit.kd-mc.com/bureau',
  'page de vente 37 € → ' + r1.location
  + (String(r1.location).includes('/shops/kit-ia/') ? '  (adresse DOUBLÉE = page d\'accueil de l\'hébergeur = CMCteams)' : ''));

const r2 = await ouOnAtterrit(envPages, 'https://kit.kd-mc.com/pour/plombier.html');
ok(r2.location === 'https://kit.kd-mc.com/pour/plombier', 'page métier → ' + r2.location);

/* Une redirection ABSOLUE venant de l'hébergeur configuré doit être acceptée
   (avant : jugée douteuse, le visiteur était renvoyé à la racine de l'app). */
const vrai = globalThis.fetch;
globalThis.fetch = async () => new Response(null, { status: 301, headers: { location: PAGES + '/shops/kit-ia/lire' } });
const r3 = await mod.fetch(new Request('https://kit.kd-mc.com/lire.html'), envPages);
globalThis.fetch = vrai;
ok(r3.headers.get('location') === 'https://kit.kd-mc.com/lire',
  'redirection absolue de l\'hébergeur → ' + r3.headers.get('location'));

/* FAIL-SECURE conservé : un domaine étranger reste refusé (anti open-redirect). */
const vrai2 = globalThis.fetch;
globalThis.fetch = async () => new Response(null, { status: 302, headers: { location: 'https://attaquant.example/vol' } });
const r4 = await mod.fetch(new Request('https://kit.kd-mc.com/lire.html'), envPages);
globalThis.fetch = vrai2;
ok(r4.headers.get('location') === 'https://kit.kd-mc.com/',
  'domaine étranger refusé (anti redirection ouverte) → ' + r4.headers.get('location'));

/* Hébergeur historique : rien ne doit changer. */
const r5 = await ouOnAtterrit({}, 'https://kit.kd-mc.com/bureau.html');
ok(r5.location === 'https://kit.kd-mc.com/bureau', 'hébergeur historique → ' + r5.location + ' (inchangé)');

console.log('\n' + (fail ? '❌' : '✅') + ' redirection-amont : ' + pass + ' OK / ' + fail + ' FAIL\n');
process.exit(fail ? 1 : 0);
