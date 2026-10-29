/* GARDE — mesure des quotas gratuits : résumé D1 par base/jour, verdict orange/rouge, lecture sans droit, plafonds écrits. `npm run test:mesure-quotas` · SABOTAGE=1 : seuil rouge à 100 % → doit rougir. */
import { resumerD1, resumerIA, texte, etat, P } from '../tools/audit/mesure-quotas.mjs';
import { readFileSync } from 'node:fs';
let ko = 0; const ok = (n, c, d = '') => { console.log((c ? '  ✓ ' : '  ✗ ') + n + (d ? ' — ' + d : '')); if (!c) ko++; };
const pl = JSON.parse(readFileSync(new URL('../tools/quotas/plafonds.json', import.meta.url), 'utf8'));
ok('plafonds écrits : D1 5 M lues / 100 k écrites, Workers 100 k, KV 1 000 écritures, Workers AI 10 000', P.d1_lignes_lues_par_jour === 5e6 && P.d1_lignes_ecrites_par_jour === 1e5 && P.workers_requetes_par_jour === 1e5 && P.kv_ecritures_par_jour === 1000 && P.workers_ai_neurones_par_jour === 1e4);
ok('seuils : orange 50 %, rouge 80 %', pl.seuil_orange === 0.5 && pl.seuil_rouge === 0.8);
const json = { data: { viewer: { accounts: [{ d1AnalyticsAdaptiveGroups: [
  { sum: { rowsRead: 3000000, rowsWritten: 500, readQueries: 1000, writeQueries: 10 }, dimensions: { databaseId: 'aaa', date: '2026-10-25' } },
  { sum: { rowsRead: 2500000, rowsWritten: 100, readQueries: 100, writeQueries: 5 }, dimensions: { databaseId: 'bbb', date: '2026-10-25' } },
  { sum: { rowsRead: 1000, rowsWritten: 20, readQueries: 100, writeQueries: 1 }, dimensions: { databaseId: 'aaa', date: '2026-10-26' } }] }] } } };
const r = resumerD1(json, { aaa: 'kdmc-pont', bbb: 'apex-chat-main' });
ok('D1 : lignes par base et par jour, la plus grosse en premier', r.ok && r.bases[0].base === 'kdmc-pont' && r.bases[0].lues === 3000000 && r.bases[1].base === 'apex-chat-main');
ok('D1 : total du jour = somme des bases', r.jours['2026-10-25'].lues === 5500000);
const t = texte(r, { ok: true, jours: { '2026-10-25': 9000 } });
ok('verdict : 5,5 M lues = 🔴 DÉPASSÉ, 1 000 lues = ✅, lignes par requête affichées', /🔴 DÉPASSÉ 2026-10-25|🔴 DÉPASSÉ\s*2026-10-25|DÉPASSÉ/.test(t) && /✅ 2026-10-26/.test(t) && /3000 lignes lues par requête/.test(t));
ok('Workers AI 90 % = 🔴', /🔴 2026-10-25 : 9000 neurones/.test(t));
const rouge = process.env.SABOTAGE === '1' ? 1 : undefined;   // sabotage : le seuil rouge est repoussé à 100 %
const seuil = etat(4100000, 5e6, rouge);
ok('seuils : 82 % = rouge, 55 % = orange, 10 % = vert', seuil === '🔴' && etat(2750000, 5e6) === '🟠' && etat(500000, 5e6) === '✅');
const refus = resumerD1({ errors: [{ message: 'not authorized to access this resource' }] });
ok('jeton sans droit : le dit au lieu de deviner', !refus.ok && refus.droit && /refuse/.test(texte(refus, { ok: false, erreur: 'x' })));
ok('jeu de données absent : jamais fatal', !resumerIA({ errors: [{ message: 'unknown field aiInferenceAdaptiveGroups' }] }).ok);
console.log('\n' + (ko ? '❌ ' + ko + ' échec(s)' : '✅ Mesure des quotas : par base et par jour, orange 50 %, rouge 80 %, sans droit = dit'));
process.exit(ko ? 1 : 0);
