/* Test ANTI-DÉRIVE des apps du domaine kd-mc.com (source unique = kdmc-home/apps.json).
   Échoue si l'ensemble des sous-domaines diverge entre :
   - kdmc-home/apps.json (SOURCE UNIQUE)
   - services/kdmc-router/worker.js  (ROUTES du routeur)
   - services/kdmc-router/wrangler.toml (routes custom_domain)
   - kdmc-home/kdmc-portal.js (repli APP_NM)
   - kdmc-home/admin/admin.js (repli APP_NAMES)
   + vérifie que les liens de kdmc-home/liens/liens.js ne pointent que vers des hosts connus.
   node apps-consistency.test.mjs */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗ ' + m)); };
const S = (arr) => JSON.stringify([...new Set(arr)].sort());
/* tous les hosts *.kd-mc.com d'un texte (mots entiers) */
const hostsIn = (txt) => (txt.match(/\b(?:[a-z0-9-]+\.)?kd-mc\.com\b/g) || []);

/* 1) SOURCE UNIQUE */
const apps = JSON.parse(read('kdmc-home/apps.json')).apps;
const appsHosts = Object.keys(apps);
ok(appsHosts.length >= 10, 'apps.json contient les apps du domaine (≥10)');

/* 2) worker ROUTES — extrait le bloc const ROUTES = { ... } */
const worker = read('services/kdmc-router/worker.js');
const routesBlock = (worker.match(/const ROUTES = \{[\s\S]*?\};/) || [''])[0];
const routesHosts = hostsIn(routesBlock);
ok(S(routesHosts) === S(appsHosts), 'apps.json ≡ ROUTES du worker (' + S(routesHosts) + ')');

/* 3) wrangler.toml routes custom_domain */
const wrangler = read('services/kdmc-router/wrangler.toml');
const wranglerHosts = hostsIn((wrangler.match(/routes = \[[\s\S]*?\]/) || [''])[0]);
ok(S(wranglerHosts) === S(appsHosts), 'apps.json ≡ routes wrangler.toml');

/* 4) repli portail APP_NM */
const portal = read('kdmc-home/kdmc-portal.js');
const apnmHosts = hostsIn((portal.match(/var APP_NM = \{[\s\S]*?\};/) || [''])[0]);
ok(S(apnmHosts) === S(appsHosts), 'apps.json ≡ repli APP_NM du portail');

/* 5) repli admin APP_NAMES */
const admin = read('kdmc-home/admin/admin.js');
const apnamesHosts = hostsIn((admin.match(/var APP_NAMES = \{[\s\S]*?\};/) || [''])[0]);
ok(S(apnamesHosts) === S(appsHosts), 'apps.json ≡ repli APP_NAMES de l\'admin');

/* 6) liens.js : aucun host kd-mc.com inconnu (sous-ensemble d'apps.json) */
const liens = read('kdmc-home/liens/liens.js');
const known = new Set(appsHosts);
const unknown = [...new Set(hostsIn(liens))].filter((h) => !known.has(h));
ok(unknown.length === 0, 'liens.js ne pointe que vers des hosts connus (inconnus: ' + JSON.stringify(unknown) + ')');

/* 7) chaque app a un nom + une icône non vides */
ok(appsHosts.every((h) => apps[h].name && apps[h].icon), 'chaque app a un nom + une icône');

console.log(`Apps consistency test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
