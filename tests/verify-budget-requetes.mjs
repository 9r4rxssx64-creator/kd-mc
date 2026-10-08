/* GARDE — les robots regardent le budget du jour avant de frapper le domaine (Kevin 8.10) — hors réseau
 *   1. sous le seuil → ok ; au seuil et au-dessus → pas ok, message qui donne le chiffre et la date de reprise ;
 *   2. API en refus ou sans jeton → LAISSE PASSER et le dit (un plafond n'est pas une panne) ;
 *   3. chaque workflow de ROBOTS porte l'étape `id: budget` ET conditionne au moins un coup sur ok == 'true' ;
 *   4. SABOTAGE : si `decider` comptait les sous-requêtes, une journée normale passerait pour plafonnée.
 * node tests/verify-budget-requetes.mjs */
import { readFileSync } from 'node:fs';
process.env.BUDGET_REQUETES_SELFTEST = '1'; process.env.MESURE_REQUETES_SELFTEST = '1';
const { decider, message, ROBOTS, SEUIL_PCT } = await import('../tools/ci/budget-requetes.mjs');
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };

const J = '2026-10-08';
const r = (n, sous) => ({ ok: true, parJour: { [J]: n }, sousReqParJour: { [J]: sous || 0 } });
const a = decider(r(13220), { jour: J });
ok(a.ok && a.mesurable && a.requetes === 13220 && a.pct === 13 && /peut frapper/.test(message(a)), '1a. 13 220 requêtes (13 %) → le robot peut frapper', JSON.stringify(a));
const b = decider(r(60000), { jour: J });
ok(!b.ok && /60000 requêtes[^\n]*60 %[^\n]*ne frappe pas[^\n]*00:00 UTC/.test(message(b)), '1b. 60 000 (= seuil 60 %) → ne frappe pas, chiffre + reprise à minuit UTC', message(b));
ok(!decider(r(99000), { jour: J }).ok && decider(r(59999), { jour: J }).ok, '1c. 99 000 → non ; 59 999 → oui');
ok(decider(r(70000), { jour: J, seuilPct: 80 }).ok && !decider(r(70000), { jour: J, seuilPct: 50 }).ok, '1d. le seuil est réglable (KDMC_BUDGET_ROBOTS_PCT)');
ok(SEUIL_PCT === 60, '1e. seuil par défaut 60 % : 40 % du plafond restent aux personnes');
ok(decider({ ok: true, parJour: { '2026-10-07': 99000 } }, { jour: J }).ok, '1f. le compteur est celui du JOUR (hier plafonné ne bloque pas aujourd\'hui)');

const c = decider({ ok: false, erreur: 'not authorized (code 1000)' }, { jour: J });
ok(c.ok && !c.mesurable && /non mesurable[^\n]*part sans compter/.test(message(c)), '2a. refus de droit → laisse passer et le dit');
ok(decider(null, { jour: J }).ok && !decider(null, { jour: J }).mesurable, '2b. réponse vide → laisse passer, non mesurable');

for (const f of ROBOTS) {
  let y = ''; try { y = readFileSync(new URL('../.github/workflows/' + f, import.meta.url), 'utf8'); } catch { /* */ }
  const etape = /id:\s*budget\b/.test(y) && /tools\/ci\/budget-requetes\.mjs/.test(y) && /CLOUDFLARE_API_TOKEN/.test(y);
  const cond = (y.match(/steps\.budget\.outputs\.ok == 'true'/g) || []).length;
  ok(etape && cond >= 1, `3. ${f} : étape budget + ${cond} coup(s) conditionné(s)`, y ? `étape=${etape} cond=${cond}` : 'fichier absent');
}
ok(ROBOTS.length >= 6, '3b. au moins 6 robots qui frappent le vrai domaine sont sous la garde');

/* 4. sabotage : une journée à 55 000 requêtes + 50 000 sous-requêtes est NORMALE (55 %) — compter les sous-requêtes la plafonnerait */
const s = decider(r(55000, 50000), { jour: J });
ok(s.ok && s.requetes === 55000, '4. SABOTAGE : les sous-requêtes ne comptent pas (55 000 + 50 000 sous-req → 55 %, passe)', JSON.stringify(s));

console.log(`\n${pass} OK / ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
