/* GARDE — tâche 80 du pont (29.10.2026, pc-config 970 / cloud-installer 1162) : favicons et journal du domaine.
 *
 *  1. FAVICON PRÉSENT (dossiers, Tor en clair, Créa Studio) : chaque page déclare <link rel="icon"> dans son <head>.
 *     Sans lui, le navigateur demande /favicon.ico, le routeur répond 404 à chaque ouverture (mesuré le 24.10 dans le
 *     Chrome admin de Kevin : « dossiers 3, studio 3, tor 7 » requêtes en échec). dossiers et tor : icône SVG en data:
 *     (CSP img-src data: déjà permis, aucun fichier ni requête en plus) ; studio : icon-192.png déjà dans le manifeste.
 *  2. JOURNAL DU DOMAINE (Apex Chat → admin.kd-mc.com/log) : l'envoi passe par K._accessEnvoi, qui demande le pass au
 *     domaine (K._domainePass, /__sso/pass) quand il manque, N'APPELLE PAS sans pass (plus de 401 quand il n'y a pas de
 *     session du domaine) et redemande UN pass frais sur 401. Plus aucun fetch direct de l'adresse hors de ce point.
 *  3. VERSIONS COHÉRENTES : Créa Studio APP_VER = CACHE_VERSION du sw.js ; Apex Chat index = package.json = sw = API.
 *  --sabotage : chaque règle est rejouée sur une copie cassée et DOIT rougir (prouvée discriminante).
 * node tests/verify-favicons-journal.mjs [--sabotage]
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(ROOT, f), 'utf8');
const SABOTAGE = process.argv.includes('--sabotage');
let pass = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else fails.push(m); console.log(`  ${c ? '✅' : '❌'} ${m}`); };

/* ───── règles pures (rejouées telles quelles sous --sabotage) ───── */
export function regleFavicon(html) {
  const head = (html.match(/<head[\s\S]*?<\/head>/i) || [''])[0];
  const lien = head.match(/<link[^>]+rel=["']icon["'][^>]*>/i);
  return {
    present: !!lien,
    hrefSain: !!lien && /href=["'](data:image\/svg\+xml,|[A-Za-z0-9_./-]+\.(png|svg|ico))/.test(lien[0]),
  };
}
export function regleJournal(src) {
  const bloc = (src.match(/K\._accessEnvoi = function\(corps\)\{[\s\S]*?\n\};\n/) || [''])[0];
  const horsBloc = src.replace(bloc, '');
  return {
    'K._accessEnvoi existe': bloc.length > 0,
    'il demande le pass au domaine (K._accessPassFrais → K._domainePass) quand il manque': /K\._accessPassFrais\(\)/.test(bloc) && /K\._accessPassFrais = function\(\)\{[\s\S]*?K\._domainePass/.test(src),
    "sans pass : aucun appel (return null avant l'envoi)": /if\(!t\) return null/.test(bloc),
    'sur 401 : un pass frais, puis un seul nouvel envoi': /status === 401[\s\S]*?K\._accessPassFrais\(\)[\s\S]*?envoi\(t2\)/.test(bloc),
    'aucun autre fetch direct vers admin.kd-mc.com/log': !/fetch\(['"]https:\/\/admin\.kd-mc\.com\/log/.test(horsBloc),
    'K._accessLog passe par K._accessEnvoi': /K\._accessEnvoi\(\{app:'apex-chat'/.test(horsBloc),
  };
}
export function regleVersions({ studioHtml, studioSw, apexHtml, apexPkg, apexSw, apexApi }) {
  const app = (studioHtml.match(/var APP_VER='(v[\d.]+)'/) || [])[1];
  const cache = (studioSw.match(/CACHE_VERSION = 'crea-studio-(v[\d.]+)'/) || [])[1];
  const ax = (apexHtml.match(/const __APEX_CHAT_VERSION__ = 'v([\d.]+)'/) || [])[1];
  const pkg = (apexPkg.match(/"version": "([\d.]+)"/) || [])[1];
  const sw = (apexSw.match(/CACHE_VERSION = 'apex-chat-v([\d.]+)'/) || [])[1];
  const api = (apexApi.match(/API_VERSION = '([\d.]+)'/) || [])[1];
  return {
    'Créa Studio : APP_VER = cache du sw.js': !!app && app === cache,
    'Apex Chat : index = package.json = sw-handlers = API_VERSION': !!ax && ax === pkg && ax === sw && ax === api,
  };
}

/* ───── lecture réelle ───── */
const PAGES = { 'dossiers/index.html': 'Dossiers', 'tools/tor/index.html': 'Tor en clair', 'tools/crea-studio/index.html': 'Créa Studio' };
const src = Object.fromEntries(Object.keys(PAGES).map((p) => [p, lire(p)]));
const apex = lire('messaging-app/index.html');
const versions = {
  studioHtml: src['tools/crea-studio/index.html'], studioSw: lire('tools/crea-studio/sw.js'),
  apexHtml: apex, apexPkg: lire('messaging-app/package.json'), apexSw: lire('messaging-app/lib/sw-handlers.js'), apexApi: lire('messaging-app/workers/api-worker.js'),
};

if (!SABOTAGE) {
  console.log('Garde tâche 80 — favicons + journal du domaine');
  for (const [p, nom] of Object.entries(PAGES)) {
    const r = regleFavicon(src[p]);
    ok(r.present, `${nom} : <link rel="icon"> présent dans <head> (${p})`);
    ok(r.hrefSain, `${nom} : l'icône est un data: SVG ou un fichier image du dossier`);
  }
  for (const [m, c] of Object.entries(regleJournal(apex))) ok(c, 'Apex Chat journal : ' + m);
  for (const [m, c] of Object.entries(regleVersions(versions))) ok(c, m);
} else {
  console.log('Garde tâche 80 — SABOTAGE : chaque règle doit rougir sur une copie cassée');
  const sansIcone = src['tools/tor/index.html'].replace(/<link[^>]+rel="icon"[^>]*>\n?/i, '');
  ok(!regleFavicon(sansIcone).present, 'tor sans <link rel="icon"> → rouge');
  const hrefExterne = src['dossiers/index.html'].replace(/href="data:image\/svg\+xml,[^"]*"/, 'href="https://ailleurs.example/icone.png"');
  ok(!regleFavicon(hrefExterne).hrefSain, 'icône servie par un domaine étranger → rouge');
  const ancien = apex.replace(/K\._accessEnvoi = function\(corps\)\{[\s\S]*?\n\};\n/, '')
    .replace(/K\._accessEnvoi\(\{app:'apex-chat'[^\n]*\n/, "    fetch('https://admin.kd-mc.com/log',{method:'POST'}).catch(function(){});\n");
  const rj = regleJournal(ancien);
  ok(!rj['K._accessEnvoi existe'], 'Apex Chat sans K._accessEnvoi (ancien code, fetch direct) → rouge');
  ok(!rj['aucun autre fetch direct vers admin.kd-mc.com/log'], 'fetch direct de admin.kd-mc.com/log → rouge');
  const sansGarde = apex.replace(/(K\._accessEnvoi = function\(corps\)\{[\s\S]*?)if\(!t\) return null;/, '$1if(!t) t = "";');
  ok(!regleJournal(sansGarde)["sans pass : aucun appel (return null avant l'envoi)"], 'envoi même sans pass → rouge');
  const sansRetry = apex.replace(/status === 401/, 'status === 599');
  ok(!regleJournal(sansRetry)['sur 401 : un pass frais, puis un seul nouvel envoi'], 'plus de nouvel essai sur 401 → rouge');
  const swDecale = { ...versions, studioSw: versions.studioSw.replace(/crea-studio-v[\d.]+/, 'crea-studio-v0.0.0') };
  ok(!regleVersions(swDecale)['Créa Studio : APP_VER = cache du sw.js'], 'sw.js du Studio en retard sur APP_VER → rouge');
  const apiDecale = { ...versions, apexApi: versions.apexApi.replace(/API_VERSION = '[\d.]+'/, "API_VERSION = '0.0.0'") };
  ok(!regleVersions(apiDecale)['Apex Chat : index = package.json = sw-handlers = API_VERSION'], 'API_VERSION d\'Apex Chat en retard → rouge');
}

console.log(`\n${fails.length ? '❌' : '✅'} ${pass} OK, ${fails.length} KO${SABOTAGE ? ' (sabotage)' : ''}`);
if (fails.length) { for (const f of fails) console.log('   - ' + f); process.exit(1); }
