/* GARDE — la mesure des requêtes Workers (plafond gratuit 100 000/jour, la coupure du 27.09) ne peut pas mentir (hors réseau)
 *   1. une réponse Analytics réelle → requêtes par jour exactes, plafond signalé 🔴 à 100 000, 🟠 dès 70 % ;
 *   2. un refus de droit → message qui NOMME le droit à donner, jamais un faux zéro ;
 *   3. une réponse vide → échec dit ;
 *   4. la requête vise le jeu Workers, le compte et la fenêtre ;
 *   5. SABOTAGE : si `resumer` additionnait les sous-requêtes aux requêtes, le 8.10 passerait pour plafonné (prouvé).
 * node tests/verify-mesure-requetes.mjs */
process.env.MESURE_REQUETES_SELFTEST = '1';
const { resumer, requete, texte, PLAFOND_REQUETES } = await import('../tools/audit/mesure-requetes.mjs');
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };

const ligne = (h, w, n, sub, err) => ({ dimensions: { datetimeHour: h, scriptName: w }, sum: { requests: n, subrequests: sub || 0, errors: err || 0 } });
const reel = { data: { viewer: { accounts: [{ workersInvocationsAdaptive: [
  ligne('2026-10-08T10:00:00Z', 'kdmc-router', 60000, 55000, 12), ligne('2026-10-08T11:00:00Z', 'kdmc-router', 12000, 11000, 0),
  ligne('2026-10-08T11:00:00Z', 'kdmc-live', 500, 900, 1), ligne('2026-10-07T21:00:00Z', 'kdmc-router', 99000, 1, 0),
  ligne('2026-10-07T22:00:00Z', 'kdmc-router', 2000, 0, 2000),
] }] } } };
const r = resumer(reel);
ok(r.ok && r.parJour['2026-10-08'] === 72500 && r.parJour['2026-10-07'] === 101000, '1a. requêtes par jour exactes (72 500 et 101 000), sous-requêtes à part', JSON.stringify(r.parJour));
const t = texte(r, 2);
ok(/🔴 2026-10-07 : 101000 requêtes \(101 % du plafond\)[^\n]*PLAFOND ATTEINT/.test(t) && /🟠 2026-10-08 : 72500 requêtes \(73 % du plafond\)/.test(t), '1b. le jour au-dessus de 100 000 est 🔴 PLAFOND, celui à 73 % est 🟠', t);
ok(/2026-10-08  kdmc-router\s+72000/.test(t) && /2026-10-08  kdmc-live\s+500/.test(t), '1c. le tableau donne chaque worker, le plus gourmand en premier');
ok(r.heuresChargees[0][0] === '2026-10-07T21' && r.heuresChargees[0][1] === 99000, '1d. l\'heure la plus chargée est la bonne (21h UTC, 99 000)');
ok(r.erreursParJour['2026-10-07'] === 2000 && /2000 erreurs/.test(t), '1e. les erreurs du jour (les 429 du 27.09 en seraient) sont comptées et affichées');

const refus = resumer({ errors: [{ message: 'not authorized to access this account (code 1000)' }] });
ok(!refus.ok && refus.droit && /Analytics du compte → Lire/.test(texte(refus, 2)), '2. refus de droit → le message nomme le droit à donner au jeton');
const vide = resumer(null);
ok(!vide.ok && /Lecture impossible/.test(texte(vide, 2)) && !/0 requêtes/.test(texte(vide, 2)), '3. réponse vide → échec dit, jamais « 0 requête »');
const q = requete('cpt', '2026-10-07T00:00:00Z', '2026-10-08T12:00:00Z');
ok(/workersInvocationsAdaptive/.test(q.query) && q.variables.compte === 'cpt' && /datetime_geq/.test(q.query) && /scriptName/.test(q.query) && /subrequests/.test(q.query), '4. la requête vise le jeu Workers, le compte, la fenêtre, par worker, avec les sous-requêtes');
ok(PLAFOND_REQUETES === 100000, '4b. le plafond est celui du plan gratuit (100 000/jour)');

/* 5. sabotage : un résumé qui ajouterait les sous-requêtes ferait passer le 8.10 (72 500) pour plafonné (139 400) */
const avecSous = reel.data.viewer.accounts[0].workersInvocationsAdaptive.filter((x) => x.dimensions.datetimeHour.startsWith('2026-10-08')).reduce((s, x) => s + x.sum.requests + x.sum.subrequests, 0);
ok(avecSous === 139400 && r.parJour['2026-10-08'] === 72500 && /🟠 2026-10-08/.test(t), '5. SABOTAGE : avec les sous-requêtes, le 8.10 ferait 139 400 (🔴) — le résumé compte 72 500 (🟠)');

console.log(`\n${pass} OK / ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
