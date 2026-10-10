/* PROFIL DU CHARGEMENT — où part le temps CPU à l'ouverture (CMCteams ou light), profileur CDP.
 *   node tools/perf/profil-chargement.mjs cmc|cmcadmin|light|lightadmin [secondes=8]
 * Affiche les fonctions les plus coûteuses (temps propre + temps total inclusif). Aucune connexion au vrai domaine. */
import { readFileSync, existsSync } from 'node:fs';
import { chromium } from 'playwright';

const QUI = process.argv[2] || 'cmcadmin', SEC = +(process.argv[3] || 8), CPU = +(process.env.CPU || 1), RESEAU = +(process.env.RESEAU ?? 1500);
const browser = await chromium.launch(existsSync('/opt/pw-browsers/chromium') && process.env.PW_EXE ? { executablePath: process.env.PW_EXE } : {});
const light = QUI.startsWith('light');
const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.route('**/*', async (route) => {
  const u = new URL(route.request().url());
  if (/firebasedatabase|googleapis/.test(u.hostname) || (/kd-mc\.com$/.test(u.hostname) && u.pathname.startsWith('/__'))) { await new Promise((r) => setTimeout(r, RESEAU)); return route.fulfill({ contentType: 'application/json', body: /firebase/.test(u.hostname) ? 'null' : '{"ok":false}' }).catch(() => {}); }
  if (!/kd-mc\.com$/.test(u.hostname)) return route.abort().catch(() => {});
  let p = u.pathname.replace(/^\/CMCteams\//, '/');
  let f = light ? (p === '/' ? 'tools/departs/index.html' : 'tools/departs' + p) : (p === '/' ? 'index.html' : p.slice(1));
  if (!existsSync(f)) return route.fulfill({ status: 404, body: '' }).catch(() => {});
  return route.fulfill({ status: 200, contentType: f.endsWith('.js') ? 'application/javascript' : 'text/html; charset=utf-8', body: readFileSync(f) }).catch(() => {});
});
await ctx.addInitScript(([adm, light]) => { try {
  if (light) { if (adm) localStorage.setItem('cmc_dep_admin', '1'); else localStorage.setItem('cmc_dep_identity', JSON.stringify({ cgu: true, verif: 'code', ts: Date.now(), nom: 'TESTEUR FICTIF' })); }
  else if (adm) { localStorage.setItem('cmc_uid', 'U11804'); localStorage.setItem('cmc_lastact', String(Date.now())); }
  localStorage.setItem('cmc_seen_v10_678', '1'); localStorage.setItem('cmc_cookies_consent', JSON.stringify({ ts: Date.now(), ver: 't' }));
} catch (_) { /* */ } }, [QUI.endsWith('admin'), light]);
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
const ACTION = process.env.ACTION || '';
const URL0 = light ? 'https://cmcteams-light.kd-mc.com/' : 'https://cmcteams.kd-mc.com/index.html';
if (process.env.CHAUD) { await p.goto(URL0, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(12000); }   /* appareil déjà connu : on mesure la 2e ouverture */
if (!ACTION) await cdp.send('Profiler.start');
if (process.env.CHAUD && !ACTION) await p.reload({ waitUntil: 'domcontentloaded' }); else await p.goto(URL0, { waitUntil: 'domcontentloaded' });
if (ACTION) {   /* profil d'UNE action après le chargement (ex. ACTION="sv('planning')") */
  await p.waitForTimeout(6000);
  var TR = []; cdp.on('Tracing.dataCollected', (d) => TR.push(...d.value));
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline', transferMode: 'ReportEvents' });
  await cdp.send('Profiler.start');
  const t = await p.evaluate(async (a) => { const t0 = performance.now(); (0, eval)(a); const t1 = performance.now(); await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))); return { sync: Math.round(t1 - t0), image: Math.round(performance.now() - t0) }; }, ACTION);
  console.log('ACTION ' + ACTION + ' → sync ' + t.sync + ' ms, 1re image ' + t.image + ' ms');
}
await p.waitForTimeout(ACTION ? 2500 : SEC * 1000);
const { profile } = await cdp.send('Profiler.stop');
if (ACTION) {   /* trace : ce que fait le fil principal (script, style, mise en page, peinture) dans les 1,5 s après l'action */
  const fin = new Promise((r) => cdp.once('Tracing.tracingComplete', r)); await cdp.send('Tracing.end'); await fin;
  const ev = TR.filter((e) => e.ph === 'X' && e.dur);
  const run = ev.filter((e) => e.name === 'RunTask'); const tids = {}; run.forEach((e) => { tids[e.tid] = (tids[e.tid] || 0) + e.dur; });
  const main = +Object.entries(tids).sort((a, b) => b[1] - a[1])[0][0];
  const t0 = Math.min(...ev.filter((e) => e.tid === main && /EvaluateScript|FunctionCall|v8.callFunction/.test(e.name)).map((e) => e.ts));
  const agg = {}; const taches = [];
  for (const e of ev) { if (e.tid !== main || e.ts < t0 || e.ts > t0 + 1500000) continue; if (e.name === 'RunTask') taches.push([Math.round((e.ts - t0) / 1000), Math.round(e.dur / 1000)]); agg[e.name] = (agg[e.name] || 0) + e.dur; }
  console.log('— TRACE fil principal (1,5 s après l action) —');
  for (const [k, v] of Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 18)) console.log(String(Math.round(v / 1000)).padStart(7) + ' ms  ' + k);
  console.log('tâches > 8 ms [début, durée] : ' + JSON.stringify(taches.filter((t) => t[1] > 8)));
}
await browser.close();

const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const parent = new Map(); for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
const self = new Map(); const dt = profile.timeDeltas; let i = 0;
for (const s of profile.samples) { self.set(s, (self.get(s) || 0) + (dt[i++] || 0)); }
const cle = (n) => { const c = n.callFrame; return `${c.functionName || '(anonyme)'} ${c.url.split('/').pop()}:${c.lineNumber + 1}`; };
const propre = new Map(), total = new Map();
for (const [id, us] of self) {
  const n = byId.get(id); const k = cle(n); propre.set(k, (propre.get(k) || 0) + us);
  const vus = new Set(); let cur = id;
  while (cur != null) { const kk = cle(byId.get(cur)); if (!vus.has(kk)) { vus.add(kk); total.set(kk, (total.get(kk) || 0) + us); } cur = parent.get(cur); }
}
const top = (m, n) => [...m].filter(([k]) => !/^\((root|program|idle|garbage collector)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, n);
console.log(`PROFIL ${QUI} — CPU ×${CPU}, ${SEC} s\n— temps TOTAL (inclusif) —`);
for (const [k, us] of top(total, 45)) console.log(String(Math.round(us / 1000)).padStart(7) + ' ms  ' + k);
console.log('— temps PROPRE —');
for (const [k, us] of top(propre, 25)) console.log(String(Math.round(us / 1000)).padStart(7) + ' ms  ' + k);
const gc = [...self].filter(([id]) => /garbage/.test(byId.get(id).callFrame.functionName)).reduce((s, [, u]) => s + u, 0);
console.log('GC : ' + Math.round(gc / 1000) + ' ms');
