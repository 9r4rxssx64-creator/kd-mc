/* GARDE — QUI EST EN LIGNE, DANS TOUTES LES APPS DU DOMAINE (Kevin 14.10.2026 : « CMCteams et light en même temps. Aussi les autres apps du domaine. »)
 * D1 simulée par le SQLite de Node. Prouve : le battement de /__sso/whoami (déjà envoyé par chaque app ouverte toutes les 60 s) est rangé en D1, une
 * ligne par personne ; un battement trop rapproché n'écrit RIEN (économie des lignes gratuites) ; changer d'app écrit tout de suite ; « en ligne » =
 * moins de 2 min 30 ; l'admin n'est pas compté ; la boîte rend la liste (qui, quelle app) et le nombre ; le routeur appelle bien la présence dans
 * whoami, sans jamais casser la connexion ; zéro écriture KV.
 * node services/kdmc-router/presence-domaine.test.mjs */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { presenceBattre, presenceListe, lireBoite, PRESENCE_MS, PRESENCE_PAS, _viderMemo } from './boite.js';
import { ADMIN, schema as schemaCercle } from './cercle.js';

let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d !== undefined ? '  → ' + JSON.stringify(d).slice(0, 240) : ''}`); };
function d1() {
  const s = new DatabaseSync(':memory:');
  const stmt = (sql, p = []) => ({ bind: (...x) => stmt(sql, x), first: async () => s.prepare(sql).get(...p) ?? null, all: async () => ({ results: s.prepare(sql).all(...p) }),
    run: async () => { const r = s.prepare(sql).run(...p); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }, _exec: () => s.prepare(sql).run(...p) });
  return { prepare: (sql) => stmt(sql), batch: async (l) => { for (const x of l) x._exec(); return []; }, _s: s };
}
const db = d1(); await schemaCercle(db);
const T0 = Date.parse('2026-10-14T12:00:00Z');
console.log('\nLa présence du domaine\n');

ok(await presenceBattre(db, 'max-roux', 'Max Roux', 'cmcteams-light', T0) === true, '1. premier battement : une ligne écrite');
ok(await presenceBattre(db, 'max-roux', 'Max Roux', 'cmcteams-light', T0 + 20000) === false, '2. 20 s plus tard, même app : RIEN n\'est écrit (pas de ligne gaspillée)');
ok(await presenceBattre(db, 'max-roux', 'Max Roux', 'arbre', T0 + 25000) === true, '3. la personne passe dans une autre app : écrit tout de suite');
ok(await presenceBattre(db, 'max-roux', 'Max Roux', 'arbre', T0 + 25000 + PRESENCE_PAS) === true, '4. 45 s après : le battement est rafraîchi');
await presenceBattre(db, 'lea-martin', 'Léa Martin', 'lingua', T0 + 30000);
await presenceBattre(db, ADMIN, 'Admin KDMC', 'admin', T0 + 30000);
await presenceBattre(db, 'vieux-v', 'Vieux V', 'lingua', T0 - 600000);
await presenceBattre(db, '', 'Sans uid', 'x', T0);
const l = await presenceListe(db, T0 + 60000);
ok(l.length === 2 && l.map((x) => x.nom).sort().join() === 'Léa Martin,Max Roux', '5. en ligne = battement de moins de 2 min 30 ; ni le vieux battement, ni l\'admin lui-même, ni une ligne sans identité', l);
ok(l.find((x) => x.nom === 'Max Roux').app === 'arbre' && l.every((x) => x.ts > T0 + 60000 - PRESENCE_MS), '6. chacun avec son app du moment et son heure');
ok((await presenceListe(db, T0 + 25000 + PRESENCE_PAS + PRESENCE_MS + 1000)).length === 0, '7. 2 min 30 plus tard sans battement : plus personne en ligne');
ok((await db.prepare('SELECT COUNT(*) AS n FROM presence_domaine').first()).n === 4, '8. une seule ligne par personne (ni doublon, ni ligne sans identité)');
const sale = await presenceBattre(db, 'x-y', 'N\u0000om\n\tbizarre' + 'z'.repeat(200), 'a'.repeat(300), T0);
const r = await db.prepare('SELECT nom, app FROM presence_domaine WHERE uid = ?').bind('x-y').first();
ok(sale && r.nom.length <= 80 && r.app.length <= 60 && !/[\u0000\n\t]/.test(r.nom), '9. nom et app sont nettoyés et bornés');

/* 16.10 (Kevin, capture « 1 en ligne maintenant — CI Smoke · apex chat ») : un robot (uid ci_…) n'est jamais une personne présente */
ok(await presenceBattre(db, 'ci_smoke', 'CI Smoke', 'apex-chat', T0 + 50000) === false, '10. le robot des vérifications (ci_smoke) n\'écrit aucune présence');
await db.prepare('INSERT INTO presence_domaine (uid, nom, app, ts) VALUES (?, ?, ?, ?)').bind('ci_vieux', 'CI Vieux', 'lingua', T0 + 50000).run();
const l2 = await presenceListe(db, T0 + 60000);
ok(!l2.some((x) => /^ci_/.test(x.uid) || /^CI /.test(x.nom)), '11. même une ancienne ligne de robot n\'apparaît pas dans « en ligne »', l2.map((x) => x.nom));
ok(l2.every((x) => x.uid), '12. chaque personne en ligne porte son identifiant (le nom devient cliquable vers sa carte)');

/* la boîte rend la liste */
let kvEcrit = 0;
const env = { CERCLE_DB: db, ACCOUNTS: { get: async () => null, put: async () => { kvEcrit++; } } };
const outils = { now: () => T0, fetch: async () => new Response('null', { status: 200 }), fbToken: async () => 'j', qui: async () => null, notifier: async () => {} };
_viderMemo();
const b = await lireBoite(env, outils, T0 + 60000);
ok(Array.isArray(b.enLigne) && ['Max Roux', 'Léa Martin'].every((n) => b.enLigne.some((x) => x.nom === n)) && b.connectes >= 2, '10. la boîte de l\'admin rend « enLigne » (qui, quelle app) et le nombre de connectés', { n: b.enLigne && b.enLigne.length, connectes: b.connectes });
ok(kvEcrit === 0, '11. zéro écriture KV (le plafond gratuit de 1 000/jour est déjà crevé)');

/* le routeur envoie le battement dans whoami, sans jamais casser la connexion */
const w = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
ok(/import \{[^}]*presenceBattre[^}]*\} from '\.\/boite\.js'/.test(w), '12. le routeur importe la présence');
ok(/await enrich\(env, request, s\.uid, s\.name, s\.cgu, acc\);\s*\n\s*try \{ await presenceBattre\(env\.CERCLE_DB, s\.uid, s\.name, app, Date\.now\(\)\); \} catch/.test(w), '13. /__sso/whoami (le battement de chaque app ouverte) range la présence, en « try » : une panne de D1 ne casse jamais une connexion');
const portail = readFileSync(new URL('../../kdmc-home/kdmc-boite.js', import.meta.url), 'utf8');
ok(/D\.enLigne/.test(portail) && /en ligne maintenant/.test(portail) && /data-enligne/.test(portail), '14. la fenêtre « Mes messages » du portail affiche la liste');
console.log(`\n${pass} OK / ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
