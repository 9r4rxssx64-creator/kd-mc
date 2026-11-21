/* « ouvre l'arbre en vue plan / trié par naissance » pour Apex AI (parité Bee, ligne 4 de la matrice) — la porte /__admin/ouvrir.
   node services/kdmc-router/ouvrir-admin.test.mjs */
import { readFileSync } from 'node:fs';
import mod from './worker.js';
import { intentionOuvrir } from './bee-ouvrir.js';
let pass = 0, fail = 0; const ok = (c, t, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${t}${!c && d !== undefined ? '  → ' + JSON.stringify(d).slice(0, 200) : ''}`); };
const kv = new Map();
const env = { KDMC_SSO_SECRET: 's', KDMC_ADMIN_PIN_SHA256: 'x'.repeat(64), ACCOUNTS: { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); } } };
const rep = await mod.fetch(new Request('https://kd-mc.com/__admin/ouvrir?q=' + encodeURIComponent('ouvre l\'arbre en vue plan'), { headers: { host: 'kd-mc.com' } }), env, { waitUntil() {} });
ok(rep.status === 401 || rep.status === 403, '1. fermée sans session admin', rep.status);
ok(!/arbre\.kd-mc\.com/.test(await rep.text()), '2. aucune adresse dans le refus');
const src = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
ok(/path === '\/__admin\/ouvrir'/.test(src) && /intentionOuvrir\(q, new Set\(Object\.keys\(ROUTES\)\), APPS\)/.test(src), '3. la porte utilise EXACTEMENT la décision de Bee (intentionOuvrir)');
/* la décision de Bee elle-même, sur les phrases que Kevin dira à Apex AI */
const hotes = new Set(['arbre.kd-mc.com', 'lingua.kd-mc.com']); const noms = { 'arbre.kd-mc.com': 'arbre', 'lingua.kd-mc.com': 'lingua' };
const a = intentionOuvrir('ouvre l\'arbre en vue plan', hotes, noms);
ok(a && /^https:\/\/arbre\.kd-mc\.com\/.*#.*vue=plan/.test(a.url), '4. « ouvre l\'arbre en vue plan » → arbre + #vue=plan', a);
const b = intentionOuvrir('montre-moi l\'arbre trié par naissance', hotes, noms);
ok(b && /tri=naissance/.test(b.url), '5. « l\'arbre trié par naissance » → #tri=naissance', b);
ok(intentionOuvrir('bonjour, comment vas-tu ?', hotes, noms) === null && intentionOuvrir('ouvre l\'arbre et dis-moi qui est né en 1880', hotes, noms) === null, '6. une phrase qui n\'est pas une ouverture nette → null (le modèle répond)');
ok(/adresseOuvrir\(a, new Set\(Object\.keys\(ROUTES\)\), APPS\)/.test(src) && /for \(const k of \['app', 'page', 'personne', 'famille', 'vue', 'tri', 'libelle'\]\)/.test(src), '7. forme structurée (app, personne, famille, vue, tri…) câblée sur la fonction `adresse` de Bee');
const { adresse } = await import('./bee-ouvrir.js');
const c = adresse({ app: 'arbre', vue: 'plan', tri: 'nom' }, hotes, noms);
ok(c.url && /vue=plan/.test(c.url) && !/tri=/.test(c.url), '8. la vue l\'emporte sur le tri (même règle que Bee)', c);
console.log(`\n${pass} OK · ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
