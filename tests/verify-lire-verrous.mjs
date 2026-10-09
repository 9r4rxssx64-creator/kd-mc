/* GARDE — lire-verrous.cjs lit l'état RÉEL des verrous Firebase et n'écrit JAMAIS (audit 30.09.2026, R5-R6)
 *
 *   1. le script ne contient aucun PUT / PATCH / DELETE / POST vers la base (lecture seule, mesure « avant ») ;
 *   2. le robot coffre-lire-verrous-firebase.yml se lance à la main, sans cron, borné, et reste au coffre ;
 *   3. logique : sur l'objet rules du FICHIER → depuis l'audit du 8.10.2026 le fichier PORTE lui-même les
 *      verrous boutiques (shops_lock=on, orders_read=on : products/logos/selection/orders au rôle admin),
 *      cmc_admin_lock=off, ecritures_lock=off, commandes clients « anonyme » ; après application du bloc
 *      _phase_shops_rolelock (comme deploy-rules.cjs SHOPS_LOCK=on + ORDERS_READ=on) → toujours on / on ;
 *      un cmcteams restructuré (write parent → $key, cmc_ov/cmc_t au rôle admin) → cmc_admin_lock=on, ecritures_lock=on ;
 *   4. sondes anonymes : fetch simulé → chaque chemin reçoit son statut, une erreur réseau ne plante pas ;
 *   5. SABOTAGE prouvé : un `method: 'PUT'` glissé dans le script → le contrôle 1 rougit.
 * node tests/verify-lire-verrous.mjs */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { lireVerrous, sonderAnonyme, SONDES } = require('../tools/firebase/lire-verrous.cjs');
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };

/* 1. lecture seule */
const src = readFileSync('tools/firebase/lire-verrous.cjs', 'utf8');
ok(!/method\s*:\s*['"](PUT|PATCH|DELETE|POST)['"]/i.test(src) && !/\.(put|patch|delete|post)\(/i.test(src), '1. lire-verrous.cjs : aucune écriture (PUT/PATCH/DELETE/POST) vers la base');
/* 2. le robot */
const wf = readFileSync('.github/workflows/coffre-lire-verrous-firebase.yml', 'utf8');
ok(/workflow_dispatch:/.test(wf) && !/schedule:/.test(wf) && /timeout-minutes:\s*\d+/.test(wf) && /lire-verrous\.cjs/.test(wf), '2a. robot à la main, sans cron, borné, lance le script');
const regles = JSON.parse(readFileSync('tools/depot-public/regles.json', 'utf8'));
ok(regles.workflows_prives.includes('.github/workflows/coffre-lire-verrous-firebase.yml'), '2b. le robot reste au coffre (workflows_prives)');

/* 3. logique */
const doc = JSON.parse(readFileSync('firebase-rules-apex.json', 'utf8'));
const clone = () => JSON.parse(JSON.stringify(doc.rules));
const a = lireVerrous(clone());
/* 8.10.2026 (audit) : le fichier nu ferme DÉJÀ les boutiques (lu tel quel : shops_lock=on, orders_read=on) ;
   les verrous CMCteams restent « off » dans le fichier (posés à la publication). Avant, « off » partout
   voulait dire : boutiques ouvertes à n'importe qui tant que le robot n'avait pas posé le bloc. */
ok(a.racine === 'deny' && a.shops_lock === 'on' && a.orders_read === 'on' && a.cmc_admin_lock === 'off' && a.ecritures_lock === 'off' && a.orders_write_clients === 'anonyme (attendu)', '3a. fichier nu → boutiques déjà fermées (shops_lock/orders_read = on), verrous CMCteams « off », commandes clients anonymes, racine deny', JSON.stringify(a));
const b = clone(); const L = doc._phase_shops_rolelock;
for (const p of Object.keys(L.writes)) { let n = b; for (const k of p.split('/')) { n[k] = n[k] || {}; n = n[k]; } n['.write'] = L.writes[p]; }
b.shops_admin_v1.orders['.read'] = L.orders_read;
const vb = lireVerrous(b);
ok(vb.shops_lock === 'on' && vb.orders_read === 'on' && vb.orders_write_clients === 'anonyme (attendu)', '3b. bloc _phase_shops_rolelock appliqué → shops_lock=on, orders_read=on, commandes clients toujours anonymes', JSON.stringify(vb));
const c = clone(); const E = doc._phase_cmc_ecritures; const A = doc._phase_cmc_adminlock;
delete c.cmcteams['.write']; c.cmcteams.$key['.write'] = E.key_write; c.cmcteams.cmc_motd = { '.write': A.role_admin }; c.cmcteams.cmc_admin_cfg = { '.write': A.role_admin };
for (const k of ['cmc_ov', 'cmc_t']) c.cmcteams[k] = Object.assign(c.cmcteams[k] || {}, { '.write': E.role_admin });
c.cmcteams.cmc_verif_codes = { '.validate': 'false' }; c.cmcteams.cmc_pw.$uid.h = { '.validate': 'false' };
const vc = lireVerrous(c);
ok(vc.cmc_admin_lock === 'on' && vc.ecritures_lock === 'on' && vc.secrets_lock === 'on', '3c. cmcteams restructuré (write au $key, planning au rôle admin, secrets verrouillés) → cmc_admin_lock/ecritures_lock/secrets_lock=on', JSON.stringify(vc));
const d = clone(); d['.read'] = true; const vd = lireVerrous(d);
ok(vd.racine === 'OUVERTE', '3d. racine lisible → « OUVERTE » (jamais masqué)');
ok(lireVerrous(null).racine === 'OUVERTE' && lireVerrous({}).shops_lock === 'off', '3e. règles absentes → rien ne plante, tout est dit « off / OUVERTE »');

/* 4. sondes anonymes */
const statuts = { '/shops_admin_v1/orders': 200, '/cmcteams': 401, '/cmcteams_prive': 401 };
const faux = async (url) => { const p = new URL(url).pathname.replace(/\.json$/, ''); if (p === '/arbre') throw new Error('réseau coupé'); return { status: statuts[p] || 401 }; };
const s = await sonderAnonyme(faux);
ok(SONDES.every((p) => p in s) && s['/shops_admin_v1/orders'] === 200 && s['/cmcteams'] === 401 && /erreur/.test(String(s['/arbre'])), `4. ${SONDES.length} chemins sondés, statuts rendus tels quels, une panne réseau ne plante pas`, JSON.stringify(s));

console.log(`\n${pass} OK / ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
