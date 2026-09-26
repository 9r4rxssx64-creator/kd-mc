#!/usr/bin/env node
/**
 * CLIQUE CHAQUE BOUTON — CMCteams (Kevin 2026-08-09 « clique chaque bouton »).
 *
 * L'audit de rendu (runtime-audit-render-all-views) prouve que les vues S'AFFICHENT, mais pas que
 * les boutons FONCTIONNENT. Ce harnais monte l'app pour de vrai (DOM réel, session admin Kevin),
 * parcourt chaque vue, et EXÉCUTE le handler `onclick` de chaque bouton (un par un, en restaurant
 * une session admin propre avant chacun pour l'isoler). Il compile réellement le handler — donc il
 * attrape le bug le plus SOURNOIS : un bouton dont le onclick ne compile pas → le navigateur
 * l'ignore en SILENCE (aucune erreur, aucun crash), le bouton est MORT mais paraît normal.
 *
 * C'est ainsi qu'ont été trouvés (puis corrigés) 24 boutons morts : 21 filtres de la galerie
 * (apostrophes mal échappées `\'`) + 3 filtres pit (`JSON.stringify` brut tronquant l'attribut).
 * Prouvé au navigateur : un vrai clic ne changeait pas l'état (_galSalon restait « Tous »).
 *
 * SÛR : confirm()=false (annule toute suppression), alert/prompt/open/reload = no-op, session
 * éphémère file:// SANS réseau → aucune donnée réelle touchée. Exit 1 si un handler jette une
 * erreur (hors bruit réseau, attendu hors-ligne) → BLOQUANT dans test:ci (test:clicks).
 *
 *   npm run test:clicks   (=  node tools/audit/click-every-button.mjs)
 *   node tools/audit/click-every-button.mjs --json out.json
 *
 * Honnêteté / limites : (1) ne couvre que les handlers INLINE `onclick=` — pas ceux attachés par
 * addEventListener (CMCteams est quasi 100 % inline). (2) NE détecte PAS un bouton « inerte »
 * (compile mais ne fait rien d'utile) — indiscernable d'un bouton légitimement passif. (3) les
 * vues sans données seedées montrent moins de boutons → couverture partielle sur ces vues.
 */
import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const INDEX = resolve(HERE, '..', '..', 'index.html');
const jsonOut = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;

/* Les vues à parcourir = les routes du switch (mêmes que le smoke de rendu). */
const ROUTES = ['accueil', 'monplanning', 'profil', 'planning', 'departs', 'chat', 'ia', 'mesdemandes',
  'convention', 'documents', 'galerie', 'partage', 'rgpd', 'mes-donnees', 'vie-privee',
  'admin', 'employees', 'teams', 'import', 'importversions', 'passwords', 'stats', 'statsglobal',
  'statsannuelles', 'online', 'connexions', 'auditlog', 'absences', 'absenceslong', 'retrait',
  'pit', 'pitdash', 'pithist', 'pitmap', 'checkintable', 'tables', 'qrtables', 'gestionlive',
  'endshiftdash', 'heuresshift', 'dashboardheures', 'quotidienne', 'retardataires', 'timings',
  'templates', 'convocs', 'agents', 'agentshealth', 'sentinelhub', 'telemetry', 'featureflags',
  'flags', 'knowledgebank', 'memorypro', 'persaudit', 'security', 'geo', 'geolocation', 'monaco',
  'kevininbox', 'usersactivity', 'crossteamactivity', 'lessonscmc', 'parserintel', 'parserlearning',
  'parsercompare', 'importanom', 'consumptionlevels', 'voicepresets', 'ocrhistory', 'quilibre',
  'equilibre', 'mois', 'sim', 'browser', 'camerastudio', 'liveroom', 'myplanlive', 'monfilpit'];

const NET_NOISE = /firebas|fetch|Load failed|NetworkError|Failed to fetch|ERR_|net::|EventSource|CORS|import\(|dynamically imported|googleapis|workers\.dev/i;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  const errors = []; /* {msg} — toutes les pageerror */
  page.on('pageerror', (e) => errors.push(String((e && e.message) || e)));

  /* Neutraliser AVANT tout : dialogues + navigations réelles + réseau. */
  await page.addInitScript(() => {
    window.__CMC_NO_SEED = true;
    window.confirm = () => false;      /* annule toute action destructrice */
    window.alert = () => {};
    window.prompt = () => null;
    window.open = () => null;
    /* empêche un vrai rechargement/navigation qui tuerait la page de test */
    try { history.pushState = () => {}; history.replaceState = () => {}; } catch (_) {}
    try { location.reload = () => {}; location.assign = () => {}; location.replace = () => {}; } catch (_) {}
  });
  page.on('dialog', (d) => d.dismiss().catch(() => {}));

  /* (re)charge la page + réinstalle la session admin + monte le DOM. Rappelé si un clic
     provoque quand même une navigation qui détruit le contexte. */
  async function bootAdmin() {
    try {
      await page.goto('file://' + INDEX, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
      /* un handler d'auto-update (location.href=index.html?v=…) peut interrompre le goto ; la
         cible reste le même fichier → on laisse la navigation se terminer puis on continue. */
      if (!/interrupted by another navigation/i.test(String(e && e.message || e))) throw e;
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
    }
    await page.waitForFunction(
      () => window.A && Array.isArray(A.employees) && typeof window.sv === 'function'
        && typeof window.render === 'function' && typeof window.vMain === 'function',
      { timeout: 20000 });
    await page.evaluate(() => {
      A.user = A.employees.find((e) => e.id === 'U11804') || { id: 'U11804', name: 'DESARZENS K', role: 'admin' };
      try { localStorage.setItem('cmc_uid', 'U11804'); } catch (_) {}
      /* neutralise les fonctions d'auto-mise-à-jour qui rechargent la page (comportement voulu en
         prod, mais qui interromprait le test). Ce ne sont pas des boutons cassés. */
      const nop = () => {};
      for (const f of ['forceUpdate', 'forceRefresh', 'axForceRefresh', '_cmcCheckRemoteVersion',
        'cmcForceUpdate', 'hardRefresh']) { try { window[f] = nop; } catch (_) {} }
      try { window.location.reload = nop; window.location.assign = nop; window.location.replace = nop; } catch (_) {}
      window.render();
    });
  }
  const navd = /context was destroyed|Target closed|Target page.*closed|Execution context/i;
  const navigated = []; /* {route,label} — clics qui ont navigué (pas un bug) */
  await bootAdmin();

  const perView = [];
  let totalClicked = 0;
  const culprits = []; /* {route, label, err} */
  const crashed = [];  /* {route, label} — le handler a vidé la vue */

  /* Neutralise, DANS la page, tout ce qui ferait une vraie navigation (elle détruirait le
     contexte de test). On exécute le HANDLER du bouton pour voir s'il jette une erreur ; on ne
     veut pas quitter la page pour de bon. */
  await page.evaluate(() => {
    try {
      const nop = () => {};
      Object.defineProperty(window, 'open', { value: nop, configurable: true });
      const L = window.location;
      try { L.assign = nop; L.replace = nop; L.reload = nop; } catch (_) {}
    } catch (_) {}
  });

  /* Dédup GLOBAL : chaque bouton unique (par son onclick) n'est exécuté qu'une fois, même s'il
     apparaît sur plusieurs vues (topbar, nav). On installe le Set dans la page pour qu'il survive
     aux re-render. */
  await page.evaluate(() => { window.__seenBtn = new Set(); });

  for (const route of ROUTES) {
    let out;
    try {
      out = await page.evaluate((rt) => {
        /* restaure une session admin PROPRE (sans recharger) puis rend la vue. */
        const restore = (v) => {
          try { A.user = A.employees.find((e) => e.id === 'U11804') || A.user; } catch (_) {}
          try { window.loginStep = 0; } catch (_) {}
          try { window._viewAs = null; } catch (_) {}
          A.view = v; window.render();
        };
        const RES = { present: 0, ran: 0, culprits: [], crashed: [], note: null };
        try { restore(rt); } catch (e) { RES.note = 'render KO: ' + (e && e.message || e); return RES; }
        const app = document.getElementById('app') || document.body;
        /* snapshot des handlers inline de tout le DOM monté (topbar + vue + nav + modales). */
        const snap = [];
        for (const el of app.querySelectorAll('[onclick]')) {
          const oc = el.getAttribute('onclick'); if (!oc) continue;
          const key = oc.trim().slice(0, 100);
          if (window.__seenBtn.has(key)) continue;
          window.__seenBtn.add(key);
          snap.push({ oc, label: (el.textContent || el.getAttribute('aria-label') || oc || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 48) });
        }
        const NET = /firebas|fetch|Load failed|NetworkError|Failed to fetch|ERR_|net::|EventSource|CORS|googleapis|workers\.dev|dynamically imported|import\(|xhr|XMLHttp/i;
        for (const { oc, label } of snap) {
          try { restore(rt); } catch (_) {}                        /* état propre AVANT chaque handler */
          RES.present++; RES.ran++;
          try {
            const fn = new Function('event', oc);
            fn.call(null, { type: 'click', preventDefault() {}, stopPropagation() {}, target: null, currentTarget: null });
          } catch (e) {
            const msg = String(e && e.message || e);
            if (!NET.test(msg)) RES.culprits.push({ label, err: msg.slice(0, 130) });
          }
          const a2 = document.getElementById('app');
          if (!(a2 && a2.innerHTML && a2.innerHTML.length > 40)) RES.crashed.push({ label });
        }
        return RES;
      }, route);
    } catch (e) {
      if (navd.test(String(e && e.message || e))) { await bootAdmin(); perView.push({ route, buttons: 0, ran: 0, note: 'navigation' }); continue; }
      throw e;
    }
    totalClicked += out.ran;
    out.culprits.forEach((c) => culprits.push({ route, label: c.label, err: c.err }));
    out.crashed.forEach((c) => crashed.push({ route, label: c.label }));
    perView.push({ route, buttons: out.present, ran: out.ran, note: out.note });
  }

  await browser.close();

  /* Rapport. */
  const netErrs = errors.filter((m) => NET_NOISE.test(m)).length;
  console.log('\n════ CLIQUE CHAQUE BOUTON — CMCteams (session admin, DOM réel, hors-ligne) ════');
  console.log('  Vues parcourues        : ' + ROUTES.length);
  console.log('  Boutons (handlers) exécutés : ' + totalClicked);
  console.log('  Erreurs JS déclenchées par un clic (bugs) : ' + culprits.length);
  console.log('  Vues vidées après un clic  : ' + crashed.length);
  console.log('  Clics qui ont navigué (normal, pas un bug) : ' + navigated.length);
  console.log('  (bruit réseau filtré, attendu hors-ligne : ' + netErrs + ')');

  if (culprits.length) {
    console.log('\n  ❌ BOUTONS QUI CASSENT (erreur JS au clic) :');
    for (const c of culprits.slice(0, 40)) console.log('   · [' + c.route + '] « ' + c.label +' » → ' + c.err.slice(0, 120));
  }
  if (crashed.length) {
    console.log('\n  ⚠️  CLICS QUI VIDENT LA VUE :');
    for (const c of crashed.slice(0, 30)) console.log('   · [' + c.route + '] « ' + c.label + ' »');
  }
  /* Top vues par nb de boutons (contexte). */
  const top = [...perView].sort((a, b) => b.buttons - a.buttons).slice(0, 8);
  console.log('\n  Vues les plus riches en boutons : ' + top.map((v) => v.route + '(' + v.buttons + ')').join(', '));

  if (jsonOut) {
    writeFileSync(jsonOut, JSON.stringify({ totalClicked, culprits, crashed, perView }, null, 2));
    console.log('\n  → détail JSON : ' + jsonOut);
  }

  const fail = culprits.length > 0 || crashed.length > 0;
  console.log('\n' + (fail ? '❌ des boutons cassent au clic — voir ci-dessus' : '✅ aucun bouton ne casse : tout réagit sans erreur JS') + '\n');
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('FATAL:', e && e.stack || e); process.exit(2); });
