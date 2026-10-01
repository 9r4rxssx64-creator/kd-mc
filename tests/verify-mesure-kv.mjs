/* GARDE — la mesure des écritures KV ne peut pas mentir (hors réseau)
 *   1. une réponse Analytics réelle (forme GraphQL) → écritures par jour exactes, plafond signalé 🔴 à 1 000 ;
 *   2. un refus de droit (« not authorized ») → message qui NOMME le droit à donner, jamais un faux zéro ;
 *   3. une réponse vide → échec dit, pas « 0 écriture » ;
 *   4. la requête filtre bien sur le compte et la fenêtre ;
 *   5. SABOTAGE : si `resumer` ignorait le type d'opération, les lectures passeraient pour des écritures (prouvé).
 * node tests/verify-mesure-kv.mjs */
process.env.MESURE_KV_SELFTEST = '1';
const { resumer, requete, texte } = await import('../tools/audit/mesure-kv.mjs');
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };

const ligne = (h, ns, type, n) => ({ dimensions: { datetimeHour: h, namespaceId: ns, actionType: type }, sum: { requests: n } });
const reel = { data: { viewer: { accounts: [{ kvOperationsAdaptiveGroups: [
  ligne('2026-10-01T08:00:00Z', 'ns-a', 'write', 600), ligne('2026-10-01T09:00:00Z', 'ns-a', 'write', 450),
  ligne('2026-10-01T09:00:00Z', 'ns-a', 'read', 9000), ligne('2026-09-30T20:00:00Z', 'ns-a', 'write', 300),
  ligne('2026-09-30T21:00:00Z', 'ns-b', 'write', 50), ligne('2026-09-30T21:00:00Z', 'ns-b', 'delete', 7),
] }] } } };
const r = resumer(reel);
ok(r.ok && r.ecrituresParJour['2026-10-01'] === 1050 && r.ecrituresParJour['2026-09-30'] === 350, '1a. écritures par jour exactes (1 050 et 350), lectures et suppressions exclues', JSON.stringify(r.ecrituresParJour));
const t = texte(r, 2);
ok(/🔴 2026-10-01 : 1050 écritures — PLAFOND ATTEINT/.test(t) && /✅ 2026-09-30 : 350/.test(t), '1b. le jour au-dessus de 1 000 est marqué 🔴 PLAFOND, l\'autre ✅', t);
ok(/ns-b\s+write\s+50/.test(t) && /ns-a\s+read\s+9000/.test(t), '1c. le tableau donne chaque espace et chaque type');
ok(r.heuresChargees[0][0] === '2026-10-01T08' && r.heuresChargees[0][1] === 600, '1d. l\'heure la plus chargée est la bonne (08h UTC, 600)');

const refus = resumer({ errors: [{ message: 'not authorized to access this account (code 1000)' }] });
ok(!refus.ok && refus.droit && /Analytics du compte → Lire/.test(texte(refus, 2)), '2. refus de droit → le message nomme le droit à donner au jeton');
const vide = resumer(null);
ok(!vide.ok && /Lecture impossible/.test(texte(vide, 2)) && !/0 écritures/.test(texte(vide, 2)), '3. réponse vide → échec dit, jamais « 0 écriture »');
const q = requete('cpt', '2026-09-30T00:00:00Z', '2026-10-01T10:00:00Z');
ok(/kvOperationsAdaptiveGroups/.test(q.query) && q.variables.compte === 'cpt' && /datetimeHour_geq/.test(q.query) && /actionType/.test(q.query), '4. la requête vise le jeu KV, le compte, la fenêtre et le type d\'opération');

/* 5. sabotage : un résumé qui ne distingue pas le type compterait 10 407 pour le 1.10 */
const sansType = (json) => { const l = json.data.viewer.accounts[0].kvOperationsAdaptiveGroups; return l.filter((x) => x.dimensions.datetimeHour.startsWith('2026-10-01')).reduce((s, x) => s + x.sum.requests, 0); };
ok(sansType(reel) === 10050 && r.ecrituresParJour['2026-10-01'] === 1050, '5. SABOTAGE : sans le type, le 1.10 ferait 10 050 « écritures » (lectures comprises) — le résumé en compte 1 050');

console.log(`\n${pass} OK / ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
