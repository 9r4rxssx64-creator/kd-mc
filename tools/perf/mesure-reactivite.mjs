/* MESURE DE RÉACTIVITÉ — CMCteams (index.html) ET light (tools/departs/index.html).
 * Kevin 2026-10-10 : « Vérifie la réactivité des boutons, fonctions, etc partout… On attend bcp trop avant l'exécution. »
 *
 * Conditions (déterministes) : vrai Chromium, écran 390×844, CPU ralenti ×4 (CDP), +1500 ms sur CHAQUE appel réseau
 * (Firebase, /__*, googleapis). Les pages sont servies depuis le dépôt (aucune connexion au vrai domaine).
 * Pour chaque action : délai jusqu'au PREMIER changement visible (première image peinte après la première mutation du
 * DOM), durée du gestionnaire synchrone, et fin (plus aucune mutation pendant 1,2 s). Au chargement : tâches longues,
 * temps jusqu'à l'écran utilisable, nombre de rendus complets.
 *
 *   node tools/perf/mesure-reactivite.mjs            → tableau lisible
 *   node tools/perf/mesure-reactivite.mjs --json     → JSON brut
 *   CPU=1 RESEAU=0 node tools/perf/mesure-reactivite.mjs   → sans ralentissement
 */
import { readFileSync, existsSync } from 'node:fs';
import { chromium } from 'playwright';

const CPU = +(process.env.CPU || 4), RESEAU = +(process.env.RESEAU ?? 1500), JSONOUT = process.argv.includes('--json');
const QUOI = (process.env.QUOI || 'cmc,cmcadmin,light,lightadmin').split(',');
const exe = existsSync('/opt/pw-browsers/chromium') && process.env.PW_EXE !== '' ? (process.env.PW_EXE || undefined) : undefined;
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const MIME = (f) => f.endsWith('.js') ? 'application/javascript' : f.endsWith('.json') ? 'application/json' : f.endsWith('.txt') ? 'text/plain' : 'text/html; charset=utf-8';
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

function fichier(hote, chemin) {
  const p = chemin.replace(/^\/CMCteams\//, '/');
  if (hote.startsWith('cmcteams-light')) {
    if (p === '/' || p === '/index.html') return process.env.LIGHT || 'tools/departs/index.html';
    const f = 'tools/departs' + p; return existsSync(f) ? f : null;
  }
  if (p === '/' || p === '/index.html') return process.env.INDEX || 'index.html';   /* INDEX=chemin : mesurer une autre version (avant/après) */
  const f = p.slice(1); return f && existsSync(f) ? f : null;
}

/* Instrumentation posée AVANT tout script de la page. */
const INSTRU = () => {
  const P = window.__perf = { lt: [], fn: {}, t0: performance.now() };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) P.lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch (_) { /* */ }
  P.envelopper = (noms) => { for (const n of noms) { const o = window[n]; if (typeof o !== 'function' || o.__env) continue;
    const w = function () { const t = performance.now(); try { return o.apply(this, arguments); } finally { const d = performance.now() - t; const r = P.fn[n] || (P.fn[n] = { n: 0, ms: 0, max: 0 }); r.n++; r.ms += d; r.max = Math.max(r.max, d); } };
    w.__env = true; w.__orig = o; window[n] = w; } };
  P.raz = () => { P.fn = {}; P.lt = []; };
  /* Clic mesuré : t0 → fin du gestionnaire synchrone → 1re mutation → 1re image peinte après elle → calme (1,2 s sans mutation). */
  P.cliquer = (el, cible) => new Promise((resolve) => {
    let premiere = null, image = null, derniere = null; const racine = cible ? document.querySelector(cible) || document.body : document.body;
    let imgFin = null, rafEnCours = false;
    const mo = new MutationObserver(() => { const t = performance.now(); derniere = t; if (premiere == null) { premiere = t; requestAnimationFrame(() => { image = performance.now(); }); }
      if (!rafEnCours) { rafEnCours = true; requestAnimationFrame(() => { rafEnCours = false; imgFin = performance.now(); }); } });
    mo.observe(racine, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'open', 'hidden', 'disabled', 'value'] });
    const t0 = performance.now(); let err = null;
    try { el.click(); } catch (e) { err = String(e && e.message || e); }
    const tSync = performance.now();
    const fin = () => { mo.disconnect(); resolve({ sync: Math.round(tSync - t0), visible: image != null ? Math.round(image - t0) : (premiere != null ? Math.round(premiere - t0) : null), fin: imgFin != null ? Math.round(imgFin - t0) : (derniere != null ? Math.round(derniere - t0) : null), err }); };
    const debut = performance.now();
    (function calme() { const t = performance.now(); if (t - debut > 15000) return fin(); if ((derniere == null && t - debut > 4000) || (derniere != null && t - derniere > 1200 && image != null && !rafEnCours)) return fin(); setTimeout(calme, 100); })();
  });
};

async function appareil(hote, { admin = false, ident = null, uid = null } = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const reseau = [];
  await ctx.route('**/*', async (route) => {
    const q = route.request(), u = new URL(q.url());
    const t = Date.now();
    if (/firebasedatabase\.app$|googleapis\.com$|firebaseio\.com$/.test(u.hostname) || (/kd-mc\.com$/.test(u.hostname) && u.pathname.startsWith('/__'))) {
      reseau.push({ u: u.hostname.split('.')[0] + u.pathname.slice(0, 60), t });
      await attendre(RESEAU);
      if (/firebasedatabase/.test(u.hostname) && q.method() === 'GET' && u.searchParams.get('shallow')) return route.fulfill({ contentType: 'application/json', body: 'null' }).catch(() => {});
      if (u.pathname.startsWith('/__sso/whoami')) return route.fulfill({ contentType: 'application/json', body: admin && hote.startsWith('cmcteams-light') ? '{"ok":true,"verified":true,"admin":true,"name":"Kevin Desarzens"}' : '{"ok":false}' }).catch(() => {});
      return route.fulfill({ contentType: 'application/json', body: /firebasedatabase/.test(u.hostname) ? 'null' : '{"ok":false}' }).catch(() => {});
    }
    if (!/kd-mc\.com$/.test(u.hostname)) return route.abort().catch(() => {});
    const f = fichier(u.hostname, u.pathname);
    if (!f) return route.fulfill({ status: 404, body: '' }).catch(() => {});
    return route.fulfill({ status: 200, contentType: MIME(f), body: readFileSync(f) }).catch(() => {});
  });
  await ctx.addInitScript(([adm, id, uid]) => { try {
    if (adm) localStorage.setItem('cmc_dep_admin', '1');
    if (id) localStorage.setItem('cmc_dep_identity', JSON.stringify(Object.assign({ cgu: true, verif: 'code', ts: Date.now() }, id)));
    if (uid) { localStorage.setItem('cmc_uid', uid); localStorage.setItem('cmc_lastact', String(Date.now())); }
    localStorage.setItem('cmc_seen_v10_678', '1'); localStorage.setItem('cmc_cookies_consent', JSON.stringify({ ts: Date.now(), ver: 't' }));
  } catch (_) { /* */ } }, [admin, ident, uid]);
  await ctx.addInitScript(INSTRU);
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  p.on('dialog', (d) => d.dismiss().catch(() => {}));
  const cdp = await ctx.newCDPSession(p);
  if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  return { ctx, p, errs, reseau };
}

const R = { conditions: { cpu: CPU, reseau_ms: RESEAU, ecran: '390x844' }, apps: {} };

/* ─── CMCteams ─────────────────────────────────────────────────────────────── */
async function mesurerCmc(admin) {
  const nom = admin ? 'CMCteams (admin)' : 'CMCteams (employé)';
  /* 1er passage : récupérer un matricule d'employé quelconque (aucun nom écrit nulle part). */
  let uid = 'U11804';
  if (!admin) {
    const o = await appareil('cmcteams.kd-mc.com');
    await o.p.goto('https://cmcteams.kd-mc.com/index.html', { waitUntil: 'domcontentloaded' });
    await o.p.waitForFunction(() => window.A && Array.isArray(A.employees) && A.employees.length > 50, null, { timeout: 120000 });
    uid = await o.p.evaluate(() => { const y = new Date().getFullYear(), m = new Date().getMonth(); const pl = (typeof gpl === 'function' && gpl(y, m)) || {}; const e = A.employees.find((x) => x.id !== AID && pl[x.id] && Object.keys(pl[x.id]).length > 10 && !x.chef); return e ? e.id : A.employees[1].id; });
    await o.ctx.close();
  }
  const o = await appareil('cmcteams.kd-mc.com', { uid });
  const t0 = Date.now();
  await o.p.goto('https://cmcteams.kd-mc.com/index.html', { waitUntil: 'domcontentloaded' });
  await o.p.evaluate(() => { const go = () => { if (window.render && window.dc && window.vMain) __perf.envelopper(['render', 'dc', 'vMain', 'vAccueil', 'vMonPlanning', 'vPlan', 'vDeparts', 'vChat', 'vIA', 'vAdminV10', 'vGestionLive', 'fbInit', '_cmcSyncChefsTFromBoards', '_cmcApplyPlanningSeed']); else setTimeout(go, 5); }; go(); });
  await o.p.waitForFunction(() => { const c = document.getElementById('content'); return c && c.innerText.trim().length > 40; }, null, { timeout: 120000 });
  const tUtil = Date.now() - t0;
  await o.p.waitForTimeout(8000);
  const charge = await o.p.evaluate(() => ({ lt: __perf.lt.slice(), fn: JSON.parse(JSON.stringify(__perf.fn)) }));
  const app = { chargement: { ecran_utilisable_ms: tUtil, taches_longues: charge.lt.length, taches_longues_ms: charge.lt.reduce((s, x) => s + x[1], 0), pire_tache_ms: Math.max(0, ...charge.lt.map((x) => x[1])), fonctions: charge.fn, reseau_avant_ecran: o.reseau.filter((r) => r.t - t0 < tUtil).map((r) => r.u) }, actions: [] };
  const action = async (lib, sel, cible = '#app') => {
    await o.p.evaluate(() => __perf.raz());
    const r = await o.p.evaluate(async ([s, c]) => { const el = typeof s === 'string' ? document.querySelector(s) : null; if (!el) return { absent: true }; return __perf.cliquer(el, c); }, [sel, cible]);
    const fn = await o.p.evaluate(() => JSON.parse(JSON.stringify(__perf.fn)));
    const lt = await o.p.evaluate(() => __perf.lt.length);
    app.actions.push({ action: lib, ...r, rendus: fn.render ? fn.render.n : 0, render_ms: fn.render ? Math.round(fn.render.ms) : 0, dc: fn.dc ? fn.dc.n : 0, dc_ms: fn.dc ? Math.round(fn.dc.ms) : 0, taches_longues: lt });
  };
  const onglets = ['monplanning', 'planning', 'departs', 'chat', 'ia', 'accueil'].concat(admin ? ['admin', 'gestionlive', 'accueil'] : []);
  for (const v of onglets) await action('onglet ' + v, `#bnav button[onclick="sv('${v}')"]`);
  /* changement de mois dans le planning d'équipe et les départs */
  await o.p.evaluate(() => sv('planning')); await o.p.waitForTimeout(1500);
  await action('planning : mois suivant ›', '[onclick="nextM()"]');
  await action('planning : mois précédent ‹', '[onclick="prevM()"]');
  await o.p.evaluate(() => sv('departs')); await o.p.waitForTimeout(1500);
  await action('départs : mois suivant ›', '[onclick="nextM()"]');
  await o.p.evaluate(() => sv('monplanning')); await o.p.waitForTimeout(1500);
  await action('mon planning : mois suivant ›', '[onclick="nextM()"]');
  /* recherche (si un champ de recherche existe dans le planning) */
  await o.p.evaluate(() => sv('planning')); await o.p.waitForTimeout(1500);
  const rech = await o.p.evaluate(async () => {
    const i = document.querySelector('#content input[type=search], #content input[placeholder*="echerch"]'); if (!i) return null;
    __perf.raz(); const t0 = performance.now(); const sync = [];
    for (const ch of 'abcd') { const t = performance.now(); i.value += ch; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ch })); sync.push(Math.round(performance.now() - t)); await new Promise((r) => setTimeout(r, 120)); }
    await new Promise((r) => setTimeout(r, 1500));
    return { id: i.id || i.placeholder, frappes: 4, sync_par_frappe: sync, rendus: __perf.fn.render ? __perf.fn.render.n : 0, dc: __perf.fn.dc ? __perf.fn.dc.n : 0, dc_ms: __perf.fn.dc ? Math.round(__perf.fn.dc.ms) : 0, total: Math.round(performance.now() - t0) };
  });
  app.recherche = rech;
  app.erreurs = o.errs.slice(0, 10);
  R.apps[nom] = app;
  await o.ctx.close();
}

/* ─── light ────────────────────────────────────────────────────────────────── */
async function mesurerLight(admin) {
  const nom = admin ? 'light (admin)' : 'light (employé)';
  const o = await appareil('cmcteams-light.kd-mc.com', { admin, ident: admin ? { prenom: 'Kevin', nom: 'DESARZENS', matricule: 'U11804', verif: 'faceid' } : { prenom: 'Testeur', nom: 'FICTIF', matricule: 'U00001' } });
  const t0 = Date.now();
  await o.p.goto('https://cmcteams-light.kd-mc.com/', { waitUntil: 'domcontentloaded' });
  await o.p.evaluate(() => { const go = () => { if (window.render && window.compute) __perf.envelopper(['render', 'compute', 'load', 'applyBoards', 'buildBoardsFromState', 'buildAppCmcBoards', 'fillSel', 'fillMoSel', 'renderSeances', 'setMonth', 'switchBoard']); else setTimeout(go, 5); }; go(); });
  await o.p.waitForFunction(() => { return document.querySelectorAll('#grid td').length > 20; }, null, { timeout: 120000 }).catch(() => {});
  const tUtil = Date.now() - t0;
  await o.p.waitForTimeout(8000);
  const charge = await o.p.evaluate(() => ({ lt: __perf.lt.slice(), fn: JSON.parse(JSON.stringify(__perf.fn)) }));
  const app = { chargement: { ecran_utilisable_ms: tUtil, taches_longues: charge.lt.length, taches_longues_ms: charge.lt.reduce((s, x) => s + x[1], 0), pire_tache_ms: Math.max(0, ...charge.lt.map((x) => x[1])), fonctions: charge.fn, reseau_avant_ecran: o.reseau.filter((r) => r.t - t0 < tUtil).map((r) => r.u) }, actions: [] };
  /* inventaire des boutons visibles de la light */
  const boutons = await o.p.evaluate(() => [...document.querySelectorAll('button, select, [onclick]')].filter((b) => b.offsetParent && b.getBoundingClientRect().width > 0).map((b, i) => { b.setAttribute('data-mes', i); return { i, tag: b.tagName, txt: (b.innerText || b.value || b.title || '').trim().slice(0, 30), oc: (b.getAttribute('onclick') || '').slice(0, 40), id: b.id }; }));
  app.boutons_vus = boutons.length;
  const action = async (lib, sel) => {
    await o.p.evaluate(() => __perf.raz());
    const r = await o.p.evaluate(async (s) => { const el = document.querySelector(s); if (!el) return { absent: true }; if (el.tagName === 'SELECT') { const t0 = performance.now(); el.selectedIndex = (el.selectedIndex + 1) % el.options.length; el.dispatchEvent(new Event('change', { bubbles: true })); return { sync: Math.round(performance.now() - t0), visible: null, fin: null, select: true }; } return __perf.cliquer(el, null); }, sel);
    const fn = await o.p.evaluate(() => JSON.parse(JSON.stringify(__perf.fn)));
    app.actions.push({ action: lib, ...r, rendus: fn.render ? fn.render.n : 0, render_ms: fn.render ? Math.round(fn.render.ms) : 0, compute: fn.compute ? fn.compute.n : 0, compute_ms: fn.compute ? Math.round(fn.compute.ms) : 0, fn: Object.fromEntries(Object.entries(fn).map(([k, v]) => [k, [v.n, Math.round(v.ms)]])) });
    await o.p.waitForTimeout(300);
  };
  for (const b of boutons) {
    if (/logout|deconn|reset|effacer|supprim|resetAll|resetCounters|J'arrive|Je pars|window\.open|location/i.test(b.txt + b.oc)) continue;
    if (b.tag === 'SELECT') { await action('select ' + (b.id || b.i), `[data-mes="${b.i}"]`); continue; }
    await action((b.txt || b.oc || b.id || b.tag).replace(/\s+/g, ' ').slice(0, 40), `[data-mes="${b.i}"]`);
    /* fermer un éventuel panneau ouvert */
    await o.p.keyboard.press('Escape').catch(() => {});
    if (app.actions.length > 40) break;
  }
  /* cases du tableau (délégation data-act) */
  const cases = [['nom (fiche/chef)', '#grid td[data-act=name]'], ['case du jour', '#grid td[data-act=cell]'], ['case NR', '#grid td[data-nr5e]'], ['case heures', '#grid td[data-heures]']];
  for (const [lib, sel] of cases) { await action(lib, sel); await o.p.keyboard.press('Escape').catch(() => {}); await o.p.evaluate(() => { document.querySelectorAll('.modal,.panel,[id*=Fiche]').forEach((m) => { if (m.style) m.style.display = 'none'; }); }); }
  /* recherche de la light */
  app.recherche = await o.p.evaluate(async () => {
    const i = document.querySelector('input[type=search], input#q, input[placeholder*="echerch"], input[placeholder*="om"]'); if (!i || !i.offsetParent) return null;
    __perf.raz(); const sync = [];
    for (const ch of 'abcd') { const t = performance.now(); i.value += ch; i.dispatchEvent(new Event('input', { bubbles: true })); sync.push(Math.round(performance.now() - t)); await new Promise((r) => setTimeout(r, 120)); }
    await new Promise((r) => setTimeout(r, 1500));
    return { id: i.id || i.placeholder, sync_par_frappe: sync, fn: Object.fromEntries(Object.entries(__perf.fn).map(([k, v]) => [k, [v.n, Math.round(v.ms)]])) };
  });
  app.erreurs = o.errs.slice(0, 10);
  R.apps[nom] = app;
  await o.ctx.close();
}

try {
  if (QUOI.includes('cmc')) await mesurerCmc(false);
  if (QUOI.includes('cmcadmin')) await mesurerCmc(true);
  if (QUOI.includes('light')) await mesurerLight(false);
  if (QUOI.includes('lightadmin')) await mesurerLight(true);
} finally { await browser.close(); }

if (JSONOUT) { console.log(JSON.stringify(R, null, 1)); process.exit(0); }
console.log(`\nRÉACTIVITÉ — CPU ×${CPU}, réseau +${RESEAU} ms, 390×844\n`);
for (const [nom, a] of Object.entries(R.apps)) {
  const c = a.chargement;
  console.log(`■ ${nom}\n  chargement : écran utilisable ${c.ecran_utilisable_ms} ms · ${c.taches_longues} tâches longues (${c.taches_longues_ms} ms, pire ${c.pire_tache_ms} ms) · réseau avant l'écran : ${c.reseau_avant_ecran.length}`);
  console.log('  fonctions au chargement : ' + Object.entries(c.fonctions).map(([k, v]) => `${k}×${v.n}=${Math.round(v.ms)}ms`).join(' · '));
  for (const x of a.actions) {
    const mort = x.absent ? 'ABSENT' : (x.visible == null && !x.select) ? 'aucune réaction' : x.visible > 100 ? `LENT ${x.visible} ms` : 'ok';
    console.log(`  ${x.action.padEnd(42)} sync ${String(x.sync ?? '-').padStart(5)} · visible ${String(x.visible ?? '-').padStart(5)} · fin ${String(x.fin ?? '-').padStart(5)} · rendus ${x.rendus}${x.dc != null ? ' dc ' + x.dc : ''}${x.compute != null ? ' compute ' + x.compute : ''} → ${mort}`);
  }
  if (a.recherche) console.log('  recherche : ' + JSON.stringify(a.recherche));
  if (a.erreurs && a.erreurs.length) console.log('  erreurs JS : ' + a.erreurs.join(' | '));
}
