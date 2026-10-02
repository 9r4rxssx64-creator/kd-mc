/* GARDE — mesurer-taille.cjs mesure le poids de la base en LECTURE SEULE (coûts, 1.10.2026)
 *   1. aucune écriture (PUT/PATCH/POST/DELETE) dans le script ; 2. robot à la main, sans cron, borné, au coffre ;
 *   3. logique (fetch simulé) : poids en octets UTF-8, tri du plus lourd au plus léger, une clé refusée → -1 sans planter.
 * SABOTAGE prouvé : un method 'PUT' glissé → le contrôle 1 rougit.  node tests/verify-mesurer-taille-firebase.mjs */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { poids, cles, detail } = require('../tools/firebase/mesurer-taille.cjs');
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d ? '  → ' + d : ''}`); };
const src = readFileSync('tools/firebase/mesurer-taille.cjs', 'utf8');
ok(!/method\s*:\s*['"](PUT|PATCH|DELETE|POST)['"]/i.test(src), '1. aucune écriture vers la base');
const wf = readFileSync('.github/workflows/coffre-mesure-firebase-poids.yml', 'utf8');
const regles = JSON.parse(readFileSync('tools/depot-public/regles.json', 'utf8'));
ok(/workflow_dispatch:/.test(wf) && !/schedule:/.test(wf) && /timeout-minutes:\s*\d+/.test(wf) && regles.workflows_prives.includes('.github/workflows/coffre-mesure-firebase-poids.yml'), '2. robot à la main, sans cron, borné, au coffre');
const base = { '/cmcteams/cmc_e': '{"a":"é"}', '/cmcteams/cmc_photos': 'x'.repeat(5000) };
const faux = async (url) => { const u = new URL(url); const p = u.pathname.replace(/\.json$/, '');
  if (u.searchParams.get('shallow')) return { ok: true, json: async () => ({ cmc_e: true, cmc_photos: true, cmc_refus: true }) };
  if (p === '/cmcteams/cmc_refus') return { ok: false, status: 401 };
  return { ok: true, status: 200, text: async () => base[p] || '' }; };
const k = await cles(faux, 't', '/cmcteams');
const r = []; for (const x of k) r.push(await poids(faux, 't', '/cmcteams/' + x)); r.sort((a, b) => b.octets - a.octets);
ok(k.length === 3 && r[0].chemin === '/cmcteams/cmc_photos' && r[0].octets === 5000 && r.find((x) => x.chemin.endsWith('cmc_e')).octets === Buffer.byteLength('{"a":"é"}') && r.find((x) => x.chemin.endsWith('refus')).octets === -1, '3. poids UTF-8, tri du plus lourd, clé refusée = -1 sans planter', JSON.stringify(r));
/* 4. détail d'une clé (phase 2) : entrées triées du plus lourd, le champ qui pèse est nommé, le nom tronqué, rien recopié */
const docs = [{ id: 'd1', name: 'Règlement intérieur très long nom de fichier.pdf', mime: 'application/pdf', cat: 'reglements', shared: true, dataUrl: 'data:application/pdf;base64,' + 'A'.repeat(4000) }, { id: 'd2', name: 'note.txt', mime: 'text/plain', shared: false, dataUrl: 'x'.repeat(100), notes: 'y'.repeat(300) }];
const faux2 = async (url) => ({ ok: true, status: 200, json: async () => docs });
const d = await detail(faux2, 't', 'cmc_docs');
ok(d.entrees.length === 2 && d.entrees[0].id === 'd1' && d.entrees[0].shared === true && /^dataUrl /.test(d.entrees[0].champs) && d.entrees[0].nom.length === 28 && !JSON.stringify(d).includes('AAAA'), '4. détail : trié, champ lourd nommé (dataUrl), nom tronqué à 28, contenu jamais recopié', JSON.stringify(d).slice(0, 300));
ok(/DETAIL: \$\{\{ github\.event\.inputs\.detail \}\}/.test(wf), '5. le robot accepte une clé à détailler (input detail)');
console.log(`\n${pass} OK / ${fail} échec(s)`); process.exit(fail ? 1 : 0);
