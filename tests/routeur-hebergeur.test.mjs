/* Le routeur ne doit JAMAIS pouvoir éteindre le domaine.
 *
 * Incident du 23.09.2026, mesuré : `deploy-kdmc-router.yml` s'est lancé depuis
 * une branche de travail dont le wrangler.toml n'avait pas encore UPSTREAM_BASE.
 * Or `wrangler deploy` REMPLACE les variables du worker par celles de SON
 * wrangler.toml — le worker est donc reparti sur son défaut, qui pointait
 * encore sur github.io, éteint depuis que le dépôt est privé. Les 26 adresses
 * du domaine ont répondu 404 pendant ~50 minutes (12/12 KO sur kit.kd-mc.com).
 *
 * Cette garde tient les deux morceaux de la règle :
 *   1. le DÉFAUT du code pointe sur l'hébergeur qui sert vraiment ;
 *   2. le préfixe de sortie se DÉDUIT de cet hébergeur au lieu d'être supposé.
 * Le point 2 est vérifié en EXÉCUTANT la fonction, pas en relisant le source.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const racine = new URL('../', import.meta.url);
const worker = readFileSync(fileURLToPath(new URL('services/kdmc-router/worker.js', racine)), 'utf8');
const toml = readFileSync(fileURLToPath(new URL('services/kdmc-router/wrangler.toml', racine)), 'utf8');

const lireDefaut = () => (worker.match(/const UPSTREAM_DEFAUT = '([^']+)'/) || [])[1];
const lireToml = () => (toml.match(/^\s*UPSTREAM_BASE\s*=\s*"([^"]+)"/m) || [])[1];

test('le défaut du code ne pointe pas sur un hébergeur éteint (github.io)', () => {
  const d = lireDefaut();
  assert.ok(d, 'UPSTREAM_DEFAUT introuvable dans worker.js');
  assert.ok(!/github\.io/i.test(d),
    'UPSTREAM_DEFAUT pointe sur github.io : GitHub Pages est éteint depuis que le dépôt est privé — '
    + 'une branche sans UPSTREAM_BASE éteindrait tout le domaine (incident 23.09.2026)');
});

test('wrangler.toml pose UPSTREAM_BASE, et la même adresse que le défaut', () => {
  const t = lireToml();
  assert.ok(t, 'UPSTREAM_BASE absent de wrangler.toml [vars] : un déploiement effacerait la variable du worker');
  assert.equal(t, lireDefaut(),
    'wrangler.toml et le défaut du code désignent deux hébergeurs différents — une seule vérité, sinon on ne sait plus lequel sert');
});

test("le préfixe d'ENTRÉE reste celui écrit dans ROUTES", () => {
  const p = (worker.match(/const PAGES_PREFIX_DEFAUT = '([^']*)'/) || [])[1];
  assert.equal(p, '/CMCteams',
    "PAGES_PREFIX_DEFAUT est le préfixe présent DANS les valeurs de ROUTES (/CMCteams/…), pas le préfixe de sortie : "
    + "le mettre à '' fait correspondre toutes les adresses (p.startsWith('/') est toujours vrai)");
});

test('le préfixe de SORTIE se déduit de l’hébergeur (exécuté, pas relu)', async () => {
  const { prefixeSortie } = await import(new URL('services/kdmc-router/worker.js', racine).href);
  // réglé à la main : on obéit, en nettoyant
  assert.equal(prefixeSortie('https://x.pages.dev', ''), '');
  assert.equal(prefixeSortie('https://x.pages.dev', ' /kd-mc-sites/ '), '/kd-mc-sites');
  // rien de réglé : l'ancien hébergeur rangeait sous /CMCteams…
  assert.equal(prefixeSortie('https://9r4rxssx64-creator.github.io', undefined), '/CMCteams');
  // …le nouveau sert à la racine → surtout pas /CMCteams, sinon 404 partout
  assert.equal(prefixeSortie('https://kdmc-site-bj5.pages.dev', undefined), '');
  assert.equal(prefixeSortie('https://kd-mc-sites.example.com', null), '');
  // adresse illisible : on ne devine pas un préfixe
  assert.equal(prefixeSortie('pas-une-url', undefined), '');
});
