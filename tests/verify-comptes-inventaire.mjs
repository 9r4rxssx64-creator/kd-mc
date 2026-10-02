/* GARDE — l'inventaire des comptes KDMC classe juste (Kevin 2.10 : « chacun 1 seul compte »).
 * node tests/verify-comptes-inventaire.mjs */
import { analyser, estRobot, estKevin } from '../tools/audit/comptes-inventaire.mjs';
import { readFileSync } from 'node:fs';
let ok = 0, ko = 0;
const dit = (c, t) => { if (c) { ok++; console.log('  ✅ ' + t); } else { ko++; console.log('  ❌ ' + t); } };
const f = [
  { uid: 'kdmc_admin', name: 'Kevin Desarzens' },
  { uid: 'kevin-desarzens', name: 'Kevin Desarzens' },
  { uid: 'old', name: 'Kevin Desarzens', merged_into: 'kdmc_admin' },
  { uid: 'ci_smoke', name: 'CI Smoke' },
  { uid: 'audit-lingua', name: 'Audit Lingua' },
  { uid: 'u1', name: 'Marie Dupont' }, { uid: 'u2', name: 'marie  DUPONT' },
  { uid: 'u3', name: 'Ronan Desarzens' }, { uid: 'u4', name: 'Léa' },
  { uid: 'u5', name: 'Batiste Martin' },
];
const b = analyser(f);
dit(b.actives === 9 && b.renvois === 1, `actifs 9, renvois 1 (lu ${b.actives}/${b.renvois})`);
dit(b.kevin.length === 2, 'Kevin a 2 comptes actifs dans cet exemple → signalé');
dit(!estKevin({ uid: 'u3', name: 'Ronan Desarzens' }), 'Ronan Desarzens n\'est PAS Kevin');
dit(b.robots.map((r) => r.uid).sort().join() === 'audit-lingua,ci_smoke', 'robots : ci_smoke et audit-lingua, rien d\'autre');
dit(!estRobot({ uid: 'u5', name: 'Batiste Martin' }), 'un vrai nom n\'est pas pris pour un robot');
dit(b.doublons.some((d) => d.nom === 'marie dupont' && d.comptes.length === 2), 'Marie Dupont × 2 (casse et espaces ignorés)');
dit(b.doublons.some((d) => d.nom === 'kevin desarzens'), 'les doublons de Kevin apparaissent aussi');
dit(b.sansNomComplet.length === 1, 'un compte à un seul mot est compté à part');
const wf = readFileSync(new URL('../.github/workflows/coffre-comptes-inventaire.yml', import.meta.url), 'utf8');
dit(/workflow_dispatch/.test(wf) && !/schedule:/.test(wf), 'le robot se lance à la main, jamais de cron');
dit(!/kv key (put|delete)|method:\s*'(PUT|DELETE|POST)'/i.test(wf + readFileSync(new URL('../tools/audit/comptes-inventaire.mjs', import.meta.url), 'utf8')), 'LECTURE SEULE : aucune écriture ni suppression dans le robot ou le script');
console.log(`\n${ok} OK · ${ko} échec(s)`); process.exit(ko ? 1 : 0);
