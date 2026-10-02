/* GARDE — inventaire KV « qui écrit ? » (2.10.2026)
 *   1. lecture seule : aucune écriture KV (pas de PUT/DELETE, pas de /values en écriture), robot à la main, sans cron, borné, au coffre ;
 *   2. grouper : chaque clé compte dans son préfixe, `anon:` garde le jour, tri décroissant ;
 *   3. bilan : visites anonymes du jour = somme des compteurs du jour SEULEMENT (hier exclu), ~2 écritures par visite,
 *      part des écritures mesurées calculée, sabotage : hier compté avec aujourd'hui → le chiffre serait faux.
 * node tests/verify-kv-inventaire.mjs */
import { readFileSync } from 'node:fs';
import { prefixe, grouper, bilan } from '../tools/audit/kv-inventaire.mjs';
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };

const src = readFileSync('tools/audit/kv-inventaire.mjs', 'utf8');
ok(!/method:\s*['"](PUT|POST|PATCH|DELETE)['"]/.test(src) && !/\.put\(|\.delete\(/.test(src) && /\/keys\?limit/.test(src), '1a. lecture seule : liste + lecture de valeurs, jamais d\'écriture');
const wf = readFileSync('.github/workflows/coffre-kv-inventaire.yml', 'utf8');
const regles = JSON.parse(readFileSync('tools/depot-public/regles.json', 'utf8'));
ok(/workflow_dispatch:/.test(wf) && !/schedule:/.test(wf) && /timeout-minutes:\s*\d+/.test(wf) && regles.workflows_prives.includes('.github/workflows/coffre-kv-inventaire.yml'), '1b. robot à la main, sans cron, borné, au coffre');

ok(prefixe('anonv:abc:498000') === 'anonv' && prefixe('anon:2026-10-02:lingua.kd-mc.com') === 'anon:2026-10-02' && prefixe('q:tts:xyz:1') === 'q' && prefixe('sansdeuxpoints') === 'sansdeuxpoints', '2a. préfixe : premier segment, anon: garde le jour');
const noms = ['anonv:a:1', 'anonv:b:1', 'anonv:c:1', 'q:tts:x:1', 'anon:2026-10-02:lingua.kd-mc.com', 'anon:2026-10-02:kd-mc.com', 'anon:2026-10-01:kd-mc.com', 'acc:u1', 'dep:2026-10-02:tts'];
const g = grouper(noms);
ok(g.total === 9 && g.parPrefixe[0][0] === 'anonv' && g.parPrefixe[0][1] === 3 && g.parPrefixe.find((x) => x[0] === 'anon:2026-10-02')[1] === 2, '2b. grouper : compte par préfixe, tri décroissant', JSON.stringify(g.parPrefixe));

const valeurs = { 'anon:2026-10-02:lingua.kd-mc.com': '300', 'anon:2026-10-02:kd-mc.com': '120', 'anon:2026-10-01:kd-mc.com': '999' };
const b = bilan(noms, valeurs, '2026-10-02', 1406);
ok(b.visites === 420 && b.anonv === 3 && b.duJour[0][0] === 'lingua.kd-mc.com', '3a. visites du jour = 300 + 120 (hier exclu), hôte le plus visité en tête', JSON.stringify(b.duJour));
ok(b.lignes.some((l) => /~840 écritures/.test(l)) && b.lignes.some((l) => /~60 %/.test(l)), '3b. ~2 écritures par visite, part des 1 406 mesurées (60 %)', b.lignes.join(' | '));
const sabote = bilan(noms, valeurs, '2026-10-0', 1406);   // préfixe trop court : prendrait hier avec aujourd'hui
ok(sabote.visites !== 420, '3c. sabotage : un jour mal borné donnerait un autre chiffre (ici ' + sabote.visites + ') — la garde le verrait');
ok(bilan([], {}, '2026-10-02', 0).lignes.length >= 3 && !bilan([], {}, '2026-10-02', 0).lignes.some((l) => /Écritures mesurées/.test(l)), '3d. sans chiffre Analytics, pas de pourcentage inventé');

console.log(`\n${pass} OK / ${fail} échec(s)`); process.exit(fail ? 1 : 0);
