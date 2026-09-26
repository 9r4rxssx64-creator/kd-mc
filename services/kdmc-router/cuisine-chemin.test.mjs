/* kd-mc.com/cujina/ — l'adresse demandée à l'hébergeur doit suivre la BASCULE.
   node cuisine-chemin.test.mjs

   POURQUOI (mesuré 19/09/2026, run 35458650075) : kd-mc.com/cujina/ servait
   « version servie : v9.914 » — l'app CMCteams — au lieu du livre de cuisine.
   Cause : ce chemin fabriquait l'adresse amont avec « /CMCteams/… » EN DUR,
   sans appliquer UPSTREAM_PREFIX comme le fait le chemin normal. Depuis la
   bascule vers un hébergeur qui sert à la RACINE, il demandait une adresse
   inexistante — et cet hébergeur répond « 200 + page d'accueil » quand il ne
   trouve rien, donc l'erreur ne se voyait pas. */
import mod from './worker.js';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log('  ❌ ' + m)); };

async function adresseDemandee(env) {
  let vue = null;
  const vrai = globalThis.fetch;
  globalThis.fetch = async (req) => {
    vue = typeof req === 'string' ? req : req.url;
    return new Response('<html>livre</html>', { status: 200, headers: { 'content-type': 'text/html' } });
  };
  await mod.fetch(new Request('https://kd-mc.com/cujina/'), env);
  globalThis.fetch = vrai;
  return vue;
}

console.log('\n== kd-mc.com/cujina/ : adresse demandée à l\'hébergeur ==\n');

/* Hébergeur qui sert à la RACINE (la bascule d'aujourd'hui) */
const aRacine = await adresseDemandee({ UPSTREAM_BASE: 'https://exemple.pages.dev', UPSTREAM_PREFIX: '' });
ok(aRacine === 'https://exemple.pages.dev/tools/cuisine/',
  'hébergeur à la racine → ' + aRacine + (aRacine && aRacine.includes('/CMCteams/') ? '  (préfixe /CMCteams laissé = mauvaise page)' : ''));

/* RIEN DE RÉGLÉ (le cas de l'incident du 23.09.2026 : une branche déployée sans
   UPSTREAM_BASE). Le worker doit retomber sur l'hébergeur qui sert VRAIMENT, et
   à la racine — pas sur github.io/CMCteams, éteint depuis que le dépôt est privé. */
const sansRien = await adresseDemandee({});
ok(/^https:\/\/[a-z0-9-]+\.pages\.dev\/tools\/cuisine\/$/.test(sansRien || ''),
  'rien de réglé → ' + sansRien + (String(sansRien).includes('github.io') ? '  (github.io = domaine éteint)' : ''));

/* Hébergeur historique EXPLICITEMENT demandé : il range sous /CMCteams, on le suit. */
const avecPrefixe = await adresseDemandee({ UPSTREAM_BASE: 'https://9r4rxssx64-creator.github.io' });
ok(avecPrefixe === 'https://9r4rxssx64-creator.github.io/CMCteams/tools/cuisine/',
  'github.io demandé explicitement → ' + avecPrefixe + ' (préfixe /CMCteams conservé)');

console.log('\n' + (fail ? '❌' : '✅') + ' cuisine-chemin : ' + pass + ' OK / ' + fail + ' FAIL\n');
process.exit(fail ? 1 : 0);
