#!/usr/bin/env node
/* Arbre v3.118 — LIEN PROFOND (Kevin 17.10.2026 : « montre-moi l'arbre de Yann Lorenzi »). Bee ouvre l'app SUR la personne : #personne=<prénom nom> ·
   #fiche=<id> · #famille=<NOM>. LECTURE seule : ne change que l'affichage. Le nom est cherché dans la copie complète de l'appareil (une personne ajoutée au
   nuage hier est trouvée même si le domaine ne la connaît pas encore). Vrai Chromium, famille INVENTÉE (aucune donnée réelle). */
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), ARBRE = path.join(ROOT, 'arbre');
let n = 0, ko = 0; const ok = (c, l) => { n++; if (!c) ko++; console.log((c ? '  ✅ ' : '  ❌ ') + l); };
let pw; for (const m of ['playwright', 'playwright-core']) { try { pw = await import(m); break; } catch (e) { /* suivant */ } }
if (!pw) { console.log('  ⏭  playwright absent : ignoré'); process.exit(0); }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png' };
const srv = http.createServer((q, r) => { let f = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (f === '/') f = '/index.html'; const fp = path.join(ARBRE, f); if (!fp.startsWith(ARBRE) || !fs.existsSync(fp)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': MIME[path.extname(fp)] || 'application/octet-stream' }); r.end(fs.readFileSync(fp)); }).listen(0, '127.0.0.1');
await new Promise((r) => srv.on('listening', r)); const base = 'http://127.0.0.1:' + srv.address().port;
function chrome() { const b = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'; try { for (const d of fs.readdirSync(b).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse()) { const c = path.join(b, d, 'chrome-linux', 'chrome'); if (fs.existsSync(c)) return c; } } catch (e) { /* pas de dossier */ } return undefined; }
const br = await (pw.chromium || pw.default.chromium).launch({ executablePath: chrome() });
/* Famille inventée : MOI (ALPHA) ← père ALPHA (sa mère EPSILON) + mère BETA (sa mère ZETA) ; conjoint DELTA (ses parents DELTA + OMEGA) ; un enfant. */
let t = 1700000000000;
const mk = (id, prenom, nom, sexe, an, o) => Object.assign({ id, prenom, nom, sexe, naissance: { date: '1.01.' + an, lieu: 'Ville-Test' }, conjoints: [], photos: [], sources: [], comments: [], vivant: true, updatedAt: ++t }, o || {});
const pe = {
  moi: mk('moi', 'Zéa', 'ALPHA', 'F', 1985, { pere: 'pa', mere: 'ma', conjoints: ['co'] }),
  co: mk('co', 'Zob', 'DELTA', 'M', 1983, { pere: 'cp', mere: 'cm', conjoints: ['moi'] }),
  en: mk('en', 'Kid', 'ALPHA', 'M', 2012, { pere: 'co', mere: 'moi' }),
  pa: mk('pa', 'Pér', 'ALPHA', 'M', 1958, { mere: 'gp', conjoints: ['ma'] }), ma: mk('ma', 'Mér', 'BETA', 'F', 1960, { mere: 'gm', conjoints: ['pa'] }),
  gp: mk('gp', 'Gra', 'EPSILON', 'F', 1930, { vivant: false }), gm: mk('gm', 'Lia', 'ZETA', 'F', 1932, { vivant: false }),
  cp: mk('cp', 'Sir', 'DELTA', 'M', 1955, { conjoints: ['cm'] }), cm: mk('cm', 'Tam', 'OMEGA', 'F', 1957, { conjoints: ['cp'] }),
  /* une autre branche, sans lien : doit rester atteignable par « Autres » mais pas proposée d'office */
  lo: mk('lo', 'Lon', 'THETA', 'M', 1970, {}), lo2: mk('lo2', 'Lun', 'THETA', 'F', 1972, {}) };
const DB = JSON.stringify({ persons: pe, meta: { updatedAt: t } });
async function ouvrir(opt) {
  opt = opt || {};
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'fr-FR' });
  await ctx.route('**/*', (r) => { const u = r.request().url(); return u.startsWith(base) && !/\/sw\.js(\?|$)/.test(u) ? r.continue() : r.abort(); });
  await ctx.addInitScript((a) => { try { if (sessionStorage.getItem('_init')) return; sessionStorage.setItem('_init', '1'); } catch (e) { /* rien */ } localStorage.setItem('arbre_trust', '1'); localStorage.setItem('arbre_codehash', 'f'.repeat(64)); localStorage.setItem('arbre_upd_ts', String(Date.now())); localStorage.setItem('arbre_v2_text', a.db); if (a.me) localStorage.setItem('arbre_me', a.me); if (a.viewer) localStorage.setItem('arbre_viewer', a.viewer); }, { db: DB, me: opt.me === undefined ? 'zea alpha' : opt.me, viewer: opt.viewer || '' });
  const p = await ctx.newPage(); await p.goto(base + '/index.html' + (opt.hash || ''), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => { try { return Object.keys(DB.persons).length > 5 && !!document.querySelector('#wrap'); } catch (e) { return false; } }, null, { timeout: 20000 });
  await p.waitForTimeout(900);
  return { ctx, p };
}

const E = (p, f, a) => p.evaluate(f, a);
console.log('\n== 1. #personne= : l\'arbre s\'ouvre SUR la personne (nom sans accent, sans majuscule, ordre libre) ==');
let { ctx, p } = await ouvrir({ hash: '#personne=' + encodeURIComponent('mer beta') });
await p.waitForTimeout(500);
let o = await E(p, () => ({ proche: procheId(), vue: VIEW, hash: location.hash }));
ok(o.proche === 'ma' && o.vue === 'proche', '1. « mer beta » → la vue Famille est centrée sur Mér BETA');
ok(await E(p, () => /Mér/.test(document.getElementById('wrap').textContent)), '1b. son nom est affiché à l\'écran');
await ctx.close();
({ ctx, p } = await ouvrir({ hash: '#personne=' + encodeURIComponent('BETA Mér') }));
await p.waitForTimeout(500);
ok(await E(p, () => procheId()) === 'ma', '2. « BETA Mér » (nom d\'abord) → la même personne');
await ctx.close();

console.log('\n== 2. une personne DÉCÉDÉE se trouve aussi (contrairement à « c\'est moi ») ==');
({ ctx, p } = await ouvrir({ hash: '#personne=' + encodeURIComponent('Gra EPSILON') }));
await p.waitForTimeout(500);
ok(await E(p, () => procheId()) === 'gp', '3. une grand-mère décédée s\'ouvre');
await ctx.close();

console.log('\n== 3. #fiche= (identifiant) et #famille= (nom) ==');
({ ctx, p } = await ouvrir({ hash: '#fiche=co' }));
await p.waitForTimeout(500);
ok(await E(p, () => procheId()) === 'co', '4. #fiche=co → centrée sur Zob DELTA');
await ctx.close();
({ ctx, p } = await ouvrir({ hash: '#famille=THETA' }));
await p.waitForTimeout(500);
ok(/THETA/.test(await E(p, () => FAMKEY)), '5. #famille=THETA → la famille THETA est celle qu\'on voit (' + await E(p, () => FAMKEY) + ')');
await ctx.close();

console.log('\n== 4. inconnue ou piégée : on le dit, rien ne casse, rien n\'est écrit ==');
for (const [h, l] of [['#personne=' + encodeURIComponent('Personne Inconnue'), 'inconnue'], ['#personne=' + encodeURIComponent('<img src=x onerror=alert(1)>'), 'balise HTML'], ['#fiche=__proto__', '__proto__'], ['#personne=', 'vide']]) {
  ({ ctx, p } = await ouvrir({ hash: h }));
  const errs = []; p.on('pageerror', (e) => errs.push(String(e.message)));
  await p.waitForTimeout(600);
  const r = await E(p, () => ({ fam: FAMKEY, proche: PROCHE, n: Object.keys(DB.persons).length, xss: !!document.querySelector('img[src="x"]'), toast: (document.querySelector('.toast,#toast') || {}).textContent || '' }));
  ok(r.n === 11 && r.proche !== '__proto__' && !r.xss && !errs.length, '6. ' + l + ' : arbre intact (' + r.n + ' fiches), pas de balise injectée, pas d\'erreur JS' + (r.toast ? ' — « ' + r.toast.slice(0, 50) + ' »' : ''));
  await ctx.close();
}

console.log('\n== 5. l\'app déjà ouverte : un nouveau lien (hashchange) suffit ==');
({ ctx, p } = await ouvrir());
await E(p, () => { location.hash = '#personne=Gra%20EPSILON'; }); await p.waitForTimeout(700);
ok(await E(p, () => procheId()) === 'gp', '7. app ouverte → #personne= la déplace sur la personne, sans rechargement');
await ctx.close();

console.log('\n== 6. garde : lecture seule (aucune écriture au nuage ni au domaine) ==');
{ const src = fs.readFileSync(path.join(ARBRE, 'index.html'), 'utf8'); const a = src.indexOf('function ouvrirParLien'), b = src.indexOf('var _lienProfondPose');
  const corps = src.slice(a, b); ok(a > 0 && b > a && !/cloudPush|cloudDelete|saveLocal|fetch\(|XMLHttpRequest|idbSet|\.innerHTML\s*=/.test(corps), '8. ouvrirParLien ne contient ni écriture, ni réseau, ni innerHTML'); }

await br.close(); srv.close();
console.log('\n' + (n - ko) + ' ✅ / ' + ko + ' ❌ sur ' + n + '\n');
process.exit(ko ? 1 : 0);
