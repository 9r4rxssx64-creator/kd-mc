/* Garde de la tâche 102 (première étape) : la classification « base vérifiée / éditions manuelles » ne perd JAMAIS une édition de Kevin.
 * SABOTAGE=1 : l'outil compte une édition comme « identique » → le test doit rougir. */
import { classerEditions } from '../tools/planning/classer-editions.mjs';
let ok = 0, ko = 0; const dis = (b, m) => { b ? ok++ : ko++; console.log(`  ${b ? '✅' : '❌'} ${m}`); };
const seed = { U1: { 1: 'M', 2: 'S', 3: 'R' }, U2: { 1: 'M' } };
const live = { U1: { 1: 'M', 2: 'CP' }, U3: { 5: 'M' }, U2: { 1: { code: 'M' } } };
let r = classerEditions(seed, live);
if (process.env.SABOTAGE === '1') r = { ...r, edition: 0, identique: r.identique + r.edition, a_garder: r.sans_base };
dis(r.identique === 2, `2 cases identiques au PDF (U1 j1, U2 j1 en forme objet) : ${r.identique}`);
dis(r.edition === 1, `1 édition manuelle (U1 j2 : S → CP) : ${r.edition}`);
dis(r.sans_base === 1, `1 case sans base (U3 j5 absent du PDF) : ${r.sans_base}`);
dis(r.base_seule === 1, `1 case du PDF absente de Firebase (U1 j3) : ${r.base_seule}`);
dis(r.a_garder === 2, `à garder = édition + sans base = 2 : ${r.a_garder}`);
dis(classerEditions({ ov: seed }, { ov: live }).a_garder === 2, 'accepte le format { ov: … } du seed');
dis(classerEditions({}, {}).a_garder === 0 && classerEditions(null, undefined).identique === 0, 'entrées vides sans erreur');
console.log(`\n${ok} ✅ / ${ko} ❌`); process.exit(ko ? 1 : 0);
