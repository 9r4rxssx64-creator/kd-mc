#!/usr/bin/env node
/**
 * APEX v13.4.180 + CMCteams v9.614 — Multi-project visual inspector.
 *
 * Kevin règle 2026-05-16 : "Inspecter mes autres projets et corriger"
 *
 * Visite chaque projet Kevin sur 3 viewports iPhone, capture screenshots,
 * détecte overflow horizontal + boutons hors viewport + petits touch targets.
 * Output JSON + screenshots dans $OUTPUT_DIR.
 *
 * Fail CI si critical issues détectées (overflow > 50px, > 5 boutons hors viewport).
 */

import { chromium, webkit } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const OUT = process.env.OUTPUT_DIR || './visual-reports';

/* ⚠️ 22.09.2026 — L'ADRESSE ÉTAIT MORTE, ET PERSONNE NE LE VOYAIT.
   Ce banc d'essai visitait `9r4rxssx64-creator.github.io/CMCteams`. Or le dépôt est
   passé en PRIVÉ : le job « verif » de deploy.yml le détecte et SAUTE la publication
   GitHub Pages (mesuré : déploiements « réussis » en 9 secondes, étape de publication
   ignorée). Le banc chargeait donc une page qui n'est plus l'app.
   Symptôme mesuré : `functional_fail_rate=75% (3 errors)` À L'IDENTIQUE sur apex-v13,
   cmcteams ET tools-visual, sur chaque demande de fusion. Une panne parfaitement
   uniforme sur trois applications sans rapport ne vient JAMAIS des applications :
   elle vient du banc d'essai. Les apps vivent maintenant sur le domaine. */
const BASE = process.env.SITE_BASE || 'https://kd-mc.com';
const BASE_APEX = process.env.SITE_APEX || 'https://apex-ai.kd-mc.com';

const PROJECTS = [
  { id: 'apex-v13', label: 'Apex v13', url: `${BASE_APEX}/`, routes: ['', '#chat', '#dashboard', '#vault', '#settings', '#admin'] },
  { id: 'cmcteams', label: 'CMCteams', url: `${BASE}/`, routes: ['', '#accueil', '#chat', '#admin'] },
];

const VIEWPORTS = [
  { id: 'iphone-se', label: 'iPhone SE', width: 375, height: 667 },
  { id: 'iphone-14-pro', label: 'iPhone 14 Pro', width: 390, height: 844 },
  { id: 'iphone-16-pro-max', label: 'iPhone 16 Pro Max', width: 440, height: 956 },
];

async function inspectPage(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const docW = document.documentElement.scrollWidth;
    const overflows = [];
    const hiddenButtons = [];
    const smallTargets = [];

    document.querySelectorAll('*').forEach((el) => {
      if (el.scrollWidth > el.clientWidth + 1 && el.scrollWidth > 50) {
        const cs = getComputedStyle(el);
        if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') return;
        overflows.push({
          tag: el.tagName.toLowerCase(),
          id: el.id || '',
          classes: typeof el.className === 'string' ? el.className.slice(0, 60) : '',
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          overflowBy: el.scrollWidth - el.clientWidth,
        });
      }
    });

    document.querySelectorAll('button, [role="button"], a[href]').forEach((btn) => {
      const rect = btn.getBoundingClientRect();
      const cs = getComputedStyle(btn);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      if (rect.width === 0 || rect.height === 0) return;
      if (rect.right > vw + 2) {
        hiddenButtons.push({
          tag: btn.tagName.toLowerCase(),
          label: (btn.textContent || btn.getAttribute('aria-label') || '').trim().slice(0, 30),
          right: Math.round(rect.right),
          viewport: vw,
        });
      }
      if (rect.width < 44 || rect.height < 44) {
        smallTargets.push({
          label: (btn.textContent || btn.getAttribute('aria-label') || '').trim().slice(0, 30),
          size: { w: Math.round(rect.width), h: Math.round(rect.height) },
        });
      }
    });

    return {
      viewport: { width: vw, height: vh },
      docScroll: { width: docW },
      hasHorizontalOverflow: docW > vw + 1,
      overflowingCount: overflows.length,
      hiddenButtonsCount: hiddenButtons.length,
      smallTargetsCount: smallTargets.length,
      overflows: overflows.slice(0, 20),
      hiddenButtons: hiddenButtons.slice(0, 20),
      smallTargets: smallTargets.slice(0, 20),
    };
  });
}

/**
 * Est-ce que les boutons de la page RÉAGISSENT ?
 *
 * ⚠️ RÉÉCRIT LE 22.09.2026 — l'ancienne version accusait l'application de ses propres
 * limites, et affichait « 75 % des boutons en panne » sur trois applications sans
 * rapport, à l'identique, sur chaque demande de fusion. Trois causes, toutes mesurées :
 *
 *   1. ELLE VISAIT UNE ADRESSE MORTE (voir en haut du fichier).
 *   2. ELLE SE MARCHAIT SUR LES PIEDS. Les boutons étaient étiquetés une fois, puis
 *      cliqués l'un après l'autre dans la MÊME page. Or le premier clic change la vue :
 *      ces applications redessinent tout, les étiquettes disparaissent, et les clics
 *      suivants tombent dans le vide — comptés comme des pannes de boutons.
 *      → chaque bouton est maintenant essayé depuis une page NEUVE, au même point de
 *        départ, sans rien garder du clic précédent.
 *   3. SA DÉFINITION DE « ÇA A RÉAGI » ÉTAIT TROP ÉTROITE : seulement un changement
 *      d'adresse, une bulle ou une fenêtre qui s'ouvre. Mesuré sur la vraie page
 *      d'accueil : « Continuer → », « Compris », « CGU » réagissent tous, et pourtant
 *      l'ancienne version les comptait en panne, parce que ce qui change chez eux,
 *      c'est LE CONTENU DE LA PAGE (et fermer un bandeau FAIT BAISSER le compte de
 *      fenêtres, au lieu de le monter).
 *      → on pose la seule question qui compte : est-ce que quelque chose a changé ?
 *
 * On laisse de côté les boutons destructeurs (supprimer, déconnexion…).
 */
async function testButtonInteractions(browser, options, url, maxButtons = 8) {
  const destructive = /supprim|efface|détruir|reset|vider|logout|déconnex|delete|destroy|format|purge|wipe|kill/i;

  /* une page neuve, au point de départ, sans mémoire du clic précédent */
  const pageNeuve = async () => {
    const ctx = await browser.newContext(options);
    const page = await ctx.newPage();
    /* PAS « networkidle » ICI. Ces applications gardent une connexion ouverte en
       permanence (la synchronisation en direct) : le reseau n'est JAMAIS au repos, donc
       « networkidle » attend jusqu'au bout du delai — 30 secondes PAR BOUTON, mesure.
       Pour essayer un bouton, il suffit que la page soit dessinee. */
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await page.waitForTimeout(2500);
    return { ctx, page };
  };

  /* ce qu'on voit à l'écran, en une photo comparable */
  const PHOTO = () => ({
    hash: location.hash,
    url: location.href,
    toasts: document.querySelectorAll('[class*="toast"], [class*="ax-toast"]').length,
    modals: document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="ax-sheet"]').length,
    texte: ((document.body && document.body.innerText) || '').replace(/\s+/g, ' ').trim(),
    elements: document.querySelectorAll('*').length,
  });

  /* le i-ème bouton visible de l'affichage courant */
  const BOUTONS = (max) => {
    const all = Array.from(document.querySelectorAll('button, [role="button"], a[href]'));
    return all.filter((btn) => {
      const cs = getComputedStyle(btn);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      const r = btn.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.left < window.innerWidth && r.top < window.innerHeight;
    }).slice(0, max);
  };

  /* 1er passage : la liste des boutons (texte + désactivé) */
  let depart = await pageNeuve();
  const buttons = await depart.page.evaluate(({ max, src }) => {
    const fn = new Function('max', 'return (' + src + ')(max)');
    return fn(max).map((btn) => ({
      text: ((btn.textContent || btn.getAttribute('aria-label') || '').trim()).slice(0, 40),
      disabled: btn.disabled === true,
    }));
  }, { max: maxButtons, src: BOUTONS.toString() }).catch(() => []);
  await depart.ctx.close();

  const results = [];
  for (let i = 0; i < buttons.length; i++) {
    const b = buttons[i];
    if (b.disabled || destructive.test(b.text)) {
      results.push({ label: b.text, status: b.disabled ? 'disabled' : 'skipped_destructive', reactions: [] });
      continue;
    }
    let ctx = null;
    try {
      const neuf = await pageNeuve();
      ctx = neuf.ctx;
      const page = neuf.page;
      const before = await page.evaluate(PHOTO);
      const poignee = await page.evaluateHandle(({ idx, max, src }) => {
        const fn = new Function('max', 'return (' + src + ')(max)');
        return fn(max)[idx] || null;
      }, { idx: i, max: maxButtons, src: BOUTONS.toString() });
      const element = poignee.asElement();
      if (!element) {
        results.push({ label: b.text, status: 'introuvable', reactions: [] });
        continue;
      }
      await element.click({ timeout: 2500 });
      await page.waitForTimeout(600);
      const after = await page.evaluate(PHOTO);
      const reactions = [];
      if (after.hash !== before.hash) reactions.push(`nav:${before.hash || '/'}→${after.hash || '/'}`);
      if (after.url !== before.url && after.hash === before.hash) reactions.push('url_change');
      if (after.toasts !== before.toasts) reactions.push(`${after.toasts > before.toasts ? '+' : '-'}${Math.abs(after.toasts - before.toasts)}bulle`);
      if (after.modals !== before.modals) reactions.push(`${after.modals > before.modals ? '+' : '-'}${Math.abs(after.modals - before.modals)}fenetre`);
      if (after.texte !== before.texte) reactions.push('contenu_change');
      else if (after.elements !== before.elements) reactions.push('dom_change');
      results.push({ label: b.text, status: reactions.length > 0 ? 'ok' : 'no_response', reactions });
    } catch (err) {
      /* Tous les « échecs de clic » ne parlent pas de l'application : un lien
         d'évitement (« Aller au contenu principal ») est exprès invisible tant qu'on
         n'est pas au clavier. Les ranger en « bouton en panne » fabriquait un taux
         d'échec qui ne voulait rien dire. */
      const m = (err && err.message ? err.message : '').replace(/\s+/g, ' ');
      const statut = /not attached|detached|not visible|outside of the viewport|intercepts pointer|not stable|hidden|Timeout/i.test(m)
        ? 'non_atteignable' : 'error';
      results.push({ label: b.text, status: statut, reactions: [], error: m.slice(0, 140) });
    } finally {
      if (ctx) { try { await ctx.close(); } catch { /* rien */ } }
    }
  }

  const ok = results.filter((r) => r.status === 'ok').length;
  const noResponse = results.filter((r) => r.status === 'no_response').length;
  const errors = results.filter((r) => r.status === 'error').length;
  const ecartes = results.filter((r) => r.status === 'non_atteignable' || r.status === 'introuvable').length;
  /* « jugés » = ceux sur lesquels on a vraiment pu se prononcer. Mettre au dénominateur
     un bouton qu'on n'a pas pu atteindre fabrique un taux d'échec faux. */
  const juges = ok + noResponse + errors;
  return { tested: juges, juges, ecartes, ok, noResponse, errors, details: results };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const allReports = [];
  const criticalFailures = [];

  /* WebKit pour iOS Safari fidélité, fallback Chromium */
  const browserType = process.env.BROWSER === 'chromium' ? chromium : webkit;
  const browser = await browserType.launch();

  for (const project of PROJECTS) {
    for (const viewport of VIEWPORTS) {
      for (const route of project.routes) {
        const url = project.url + route;
        const optionsCtx = {
          viewport: { width: viewport.width, height: viewport.height },
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
          deviceScaleFactor: 3,
          isMobile: true,
        };
        const ctx = await browser.newContext(optionsCtx);
        const page = await ctx.newPage();
        const tag = `${project.id}_${viewport.id}_${(route || 'home').replace('#', '')}`;
        try {
          const rep = await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
          await page.waitForTimeout(2000);  /* Laisse le temps aux animations */

          /* ⚠️ LA PAGE S'EST-ELLE VRAIMENT CHARGÉE ?
             Sans cette question, une adresse morte ressort en « 75 % des boutons en
             panne » : on accuse l'application alors que le site n'a jamais répondu.
             Une adresse injoignable est un problème D'ADRESSE, et ça doit se lire
             comme tel. */
          const statut = rep ? rep.status() : 0;
          const corps = (await page.evaluate(() => (document.body && document.body.innerText || '').trim().length)) || 0;
          if (statut >= 400 || corps < 40) {
            const pourquoi = statut >= 400
              ? `le site a répondu HTTP ${statut}`
              : `la page est vide (${corps} caractères) — adresse probablement morte`;
            criticalFailures.push(`[${tag}] ADRESSE INJOIGNABLE : ${pourquoi} → ${url}. Ce n'est PAS une panne de l'application : c'est l'adresse visitée par ce banc d'essai qui est à corriger.`);
            console.error(`❌ ${tag} — ADRESSE INJOIGNABLE (${pourquoi})`);
            allReports.push({ project: project.label, route, url, error: 'adresse injoignable : ' + pourquoi });
            continue;
          }
          const report = await inspectPage(page);
          report.project = project.label;
          report.viewport_label = viewport.label;
          report.route = route || '/';
          report.url = url;
          /* Essai réel des boutons : sur UN SEUL format d'écran, et sur la PREMIÈRE
             adresse de chaque application. Depuis qu'on repart d'une page neuve à
             chaque bouton (seule façon de ne pas se marcher sur les pieds), chaque
             essai coûte un chargement : le faire sur les 4 à 6 vues de chaque appli
             multiplierait la note d'électricité sans rien apprendre de plus — les
             boutons du haut et du bas sont les mêmes d'une vue à l'autre. */
          if (viewport.id === 'iphone-14-pro' && route === project.routes[0]) {
            try {
              report.interactions = await testButtonInteractions(browser, optionsCtx, url, 8);
            } catch (err) {
              report.interactions = { error: err.message?.slice(0, 100) };
            }
          }
          allReports.push(report);

          /* Critical : overflow > 50px OU > 5 hidden buttons OU > 50% boutons no_response */
          if (report.docScroll.width - report.viewport.width > 50 || report.hiddenButtonsCount > 5) {
            criticalFailures.push(`[${tag}] overflow=${report.docScroll.width - report.viewport.width}px, hidden=${report.hiddenButtonsCount}`);
          }
          if (report.interactions && report.interactions.tested > 0) {
            const failRate = (report.interactions.noResponse + report.interactions.errors) / report.interactions.tested;
            if (failRate > 0.5) {
              criticalFailures.push(`[${tag}] functional_fail_rate=${(failRate * 100).toFixed(0)}% (${report.interactions.noResponse}/${report.interactions.tested} no_response, ${report.interactions.errors} errors)`);
            }
          }

          await page.screenshot({ path: join(OUT, `${tag}.png`), fullPage: false });
          const intInfo = report.interactions
            ? ` btn:${report.interactions.ok}/${report.interactions.tested}` +
              (report.interactions.ecartes ? ` (+${report.interactions.ecartes} non atteignables — lien d'évitement, élément masqué…)` : '')
            : '';
          console.log(`✅ ${tag} — overflow:${report.hasHorizontalOverflow} hidden:${report.hiddenButtonsCount}${intInfo}`);
        } catch (err) {
          console.error(`❌ ${tag} — ${err.message}`);
          allReports.push({ project: project.label, route, url, error: err.message });
        } finally {
          await ctx.close();
        }
      }
    }
  }
  await browser.close();

  await writeFile(join(OUT, 'reports.json'), JSON.stringify(allReports, null, 2));
  if (criticalFailures.length > 0) {
    await writeFile(join(OUT, 'critical_failures.txt'), criticalFailures.join('\n'));
  }

  /* Markdown summary humain */
  const md = [`# Visual Regression Report — ${new Date().toISOString()}\n`];
  for (const r of allReports) {
    if (r.error) {
      md.push(`## ❌ ${r.project} ${r.route}\n  Error: ${r.error}\n`);
      continue;
    }
    const status = r.hasHorizontalOverflow || r.hiddenButtonsCount > 0 ? '⚠️' : '✅';
    md.push(`## ${status} ${r.project} ${r.viewport_label} ${r.route}`);
    md.push(`- viewport: ${r.viewport.width}×${r.viewport.height}`);
    md.push(`- docScroll.width: ${r.docScroll.width} (overflow: ${r.docScroll.width - r.viewport.width}px)`);
    md.push(`- overflowing elements: ${r.overflowingCount}`);
    md.push(`- hidden buttons (off viewport right): ${r.hiddenButtonsCount}`);
    md.push(`- small touch targets (<44px): ${r.smallTargetsCount}`);
    if (r.hiddenButtons.length) {
      md.push(`  - Hidden buttons sample:`);
      r.hiddenButtons.slice(0, 5).forEach((b) => md.push(`    - "${b.label}" right=${b.right}px (viewport=${b.viewport})`));
    }
    md.push('');
  }
  await writeFile(join(OUT, 'summary.md'), md.join('\n'));
  console.log(`\n📊 Reports written to ${OUT}/`);
  console.log(`📸 ${allReports.length} screenshots`);
  if (criticalFailures.length > 0) {
    console.log(`❌ ${criticalFailures.length} critical failures`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
