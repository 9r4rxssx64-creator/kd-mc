/* VÉRIFICATION RÉELLE DES LIENS EXTERNES des pages publiques du domaine (audit 1533, pont-check, 30.10.2026).
 * Le robot « liens cliquables partout » (verif-live-liens) ouvre les liens INTERNES ; les liens vers l'extérieur (App Store, archives,
 * Wikipédia, PayPal, sites officiels…) n'étaient ouverts par personne : 30 liens morts vers l'ancien GitHub Pages dormaient dans 8 pages.
 *
 * Ce qu'il fait : lit les sources HTML des pages publiques du dépôt (pas les archives, tests, pages de recherche de l'arbre, outils
 * d'administration ; attention : écrire ici le chemin du dossier de l'arbre ou d'un fichier privé rendrait ce test PRIVÉ pour
 * l'exporteur du dépôt public, et le robot ne partirait pas — vu le 30.10), relève chaque href=https://… qui ne pointe pas vers kd-mc.com, l'ouvre (HEAD puis GET, format iPhone) et classe :
 *   OK (2xx/3xx) · PORTE (401/403/429/503, anti-robot ou site en panne : constat) · PRIVÉ (dépôt GitHub privé : 404 pour un anonyme, normal)
 *   · MORT (404/410/autre 4xx/5xx : ÉCHEC) · RÉSEAU (DNS, délai, TLS : constat).
 * Sont ignorés : <link rel="preconnect|dns-prefetch|preload|modulepreload"> (racines d'API, jamais des liens à cliquer), schema.org, w3.org,
 * ogp.me, polices Google (préchargement).
 * Nombres et adresses publiques seulement, jamais un texte de page.
 *   node tests/verif-liens-externes.mjs              (réseau ; sort 1 s'il y a un lien MORT)
 *   node tests/verif-liens-externes.mjs --selftest   (sans réseau : la classification et les exclusions, rouge si elles dérivent) */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export const EXCL = /node_modules|\/tests?\/|\/archives?\/|_archive|\/audit\/|\/dist\/|\/\.git\/|\/backups?\/|\/old\/|arbre\/research|tools\/pont|tools\/cloudflare|tools\/firebase|tools\/apex-ios|iRemoteHub\/docs|apex-ai\/v13\/|staging|pipeline|scratch/i;
export const IGNORE_URL = /kd-mc\.com|localhost|127\.0\.0\.1|example\.|schema\.org|w3\.org\/\d|ogp\.me|googleapis\.com\/css|fonts\.gstatic|fonts\.googleapis\.com$/i;
export const PRIVE = /^https:\/\/github\.com\/9r4rxssx64-creator\/cmcteams(\/|$)/i;
const TAG = /<(a|link|area)\b[^>]*>/gi;

/* Les liens d'un document : {url, rel} — on saute les balises de préchargement. */
export function liensDe(html) {
  const out = [];
  for (const m of html.matchAll(TAG)) {
    const tag = m[0];
    const rel = (tag.match(/\brel=["']([^"']*)["']/i) || [, ''])[1].toLowerCase();
    if (/\b(preconnect|dns-prefetch|preload|modulepreload|prefetch)\b/.test(rel)) continue;
    const h = tag.match(/\bhref=["'](https?:\/\/[^"'\s<>]+)["']/i);
    if (!h) continue;
    const u = h[1].replace(/&amp;/g, '&');
    if (IGNORE_URL.test(u)) continue;
    out.push(u);
  }
  return out;
}
export function classer(u, r) {
  if (PRIVE.test(u)) return 'prive';
  if (r.s === 0) return 'reseau';
  if (r.s === 401 || r.s === 403 || r.s === 429 || r.s === 503) return 'porte';
  if (r.s >= 200 && r.s < 400) return 'ok';
  return 'mort';
}

if (process.argv.includes('--selftest')) {
  let ko = 0; const ok = (c, m) => { console.log(`  ${c ? '✅' : '❌'} ${m}`); if (!c) ko++; };
  const html = '<link rel="preconnect" href="https://api.example-api.test"><a href="https://exemple.org/page?a=1&amp;b=2">x</a><link rel="stylesheet" href="https://cdn.truc.test/s.css"><a href="https://dossiers.kd-mc.com/">i</a><a href="https://github.com/9r4rxssx64-creator/cmcteams/pull/1">p</a>';
  const l = liensDe(html);
  ok(!l.some((u) => u.includes('example-api')), 'preconnect ignoré (racine d\'API, pas un lien)');
  ok(l.includes('https://exemple.org/page?a=1&b=2'), '&amp; décodé, lien externe relevé');
  ok(l.includes('https://cdn.truc.test/s.css'), 'feuille de style externe relevée (une CSS morte casse la page)');
  ok(!l.some((u) => u.includes('kd-mc.com')), 'liens internes laissés au robot verif-live-liens');
  ok(classer('https://github.com/9r4rxssx64-creator/cmcteams/pull/1', { s: 404 }) === 'prive', 'dépôt privé en 404 anonyme = privé, pas mort');
  ok(classer('https://x.test/', { s: 404 }) === 'mort' && classer('https://x.test/', { s: 500 }) === 'mort', '404 et 500 = mort');
  ok(classer('https://x.test/', { s: 403 }) === 'porte' && classer('https://x.test/', { s: 0 }) === 'reseau' && classer('https://x.test/', { s: 301 }) === 'ok', '403 porte, 0 réseau, 3xx ok');
  ok(EXCL.test(['arbre','research','x.html'].join('/')) && EXCL.test(['_archive_v12','a.html'].join('/')) && !EXCL.test('tools/tor/index.html') && !EXCL.test('kdmc-home/outils/index.html'), 'exclusions : recherche de l\'arbre et archives dehors, Tor et Outils dedans');
  console.log(`\n${ko ? '❌' : '✅'} selftest liens externes : ${ko} KO`); process.exit(ko ? 1 : 0);
}

const ROOT = process.cwd();
const files = [];
(function walk(d) { for (const n of readdirSync(d)) { const p = join(d, n); if (EXCL.test(p + '/')) continue; let s; try { s = statSync(p); } catch { continue; } if (s.isDirectory()) walk(p); else if (/\.html?$/i.test(n) || /page\.mjs$/.test(n)) files.push(p); } })(ROOT);
const liens = new Map();
for (const f of files) { let t; try { t = readFileSync(f, 'utf8'); } catch { continue; } for (const u of liensDe(t)) { if (!liens.has(u)) liens.set(u, new Set()); liens.get(u).add(relative(ROOT, f)); } }
console.log(`fichiers HTML lus : ${files.length} · liens externes distincts : ${liens.size}`);
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
async function verif(u) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 15000);
  const H = { 'user-agent': UA, accept: 'text/html,*/*;q=0.8', 'accept-language': 'fr-FR,fr;q=0.9' };
  try {
    let r = await fetch(u, { method: 'HEAD', redirect: 'follow', signal: ctl.signal, headers: H });
    if (r.status === 405 || r.status === 403 || r.status === 400 || r.status >= 500) r = await fetch(u, { method: 'GET', redirect: 'follow', signal: ctl.signal, headers: H });
    return { s: r.status, f: r.redirected ? new URL(r.url).host : '' };
  } catch (e) { return { s: 0, err: String((e && e.cause && e.cause.code) || (e && e.name) || e).slice(0, 40) }; } finally { clearTimeout(t); }
}
const urls = [...liens.keys()]; const res = new Map(); let i = 0;
await Promise.all(Array.from({ length: 10 }, async () => { while (i < urls.length) { const u = urls[i++]; res.set(u, await verif(u)); } }));
const cat = { ok: [], porte: [], prive: [], mort: [], reseau: [] };
for (const [u, r] of res) cat[classer(u, r)].push({ u, ...r, pages: [...liens.get(u)] });
const ligne = (r) => `${r.s}${r.err ? ' ' + r.err : ''}${r.f ? ' → ' + r.f : ''}  ${r.u}  [${r.pages.slice(0, 3).join(', ')}${r.pages.length > 3 ? ' +' + (r.pages.length - 3) : ''}]`;
for (const k of ['mort', 'reseau', 'porte', 'prive']) { if (!cat[k].length) continue; console.log(`\n== ${k} (${cat[k].length})`); for (const r of cat[k].sort((a, b) => a.u.localeCompare(b.u))) console.log(ligne(r)); }
console.log(`\n=== ${urls.length} liens externes · OK ${cat.ok.length} · porte/anti-robot ${cat.porte.length} · privé ${cat.prive.length} · RÉSEAU ${cat.reseau.length} · MORTS ${cat.mort.length}`);
console.log(cat.mort.length ? '❌ des liens externes sont morts : à corriger (qui constate corrige)' : '✅ aucun lien externe mort');
process.exit(cat.mort.length ? 1 : 0);
