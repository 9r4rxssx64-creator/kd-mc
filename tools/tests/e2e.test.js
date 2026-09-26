/**
 * CMC Teams — Tests E2E automatisés (Puppeteer)
 *
 * Run : node tools/tests/e2e.test.js
 *
 * Couvre les flows critiques :
 * - Chargement de l'app
 * - Présence des fonctions globales
 * - Login admin simulé
 * - Navigation entre vues
 * - Command palette
 * - Modals (aide, debug, etc.)
 * - Responsive 6 devices
 */

const puppeteer = require('puppeteer');
const path = require('path');

const DEVICES = [
  { name: 'iPhone SE',     w: 375,  h: 667,  dpr: 2,     mobile: true },
  { name: 'iPhone 14 Pro', w: 393,  h: 852,  dpr: 3,     mobile: true },
  { name: 'Galaxy S22',    w: 360,  h: 780,  dpr: 3,     mobile: true },
  { name: 'Pixel 7',       w: 412,  h: 915,  dpr: 2.625, mobile: true },
  { name: 'iPad Air',      w: 820,  h: 1180, dpr: 2,     mobile: true },
  { name: 'Desktop HD',    w: 1920, h: 1080, dpr: 1,     mobile: false }
];

const APP_URL = 'file://' + path.resolve(__dirname, '../../index.html');

class TestRunner {
  constructor() {
    this.results = [];
    this.passed = 0;
    this.failed = 0;
  }

  async test(name, fn) {
    const start = Date.now();
    try {
      await fn();
      this.passed++;
      this.results.push({ name, status: 'PASS', duration: Date.now() - start });
      console.log(`  ✅ ${name}`);
    } catch (err) {
      this.failed++;
      this.results.push({ name, status: 'FAIL', error: err.message, duration: Date.now() - start });
      console.log(`  ❌ ${name}`);
      console.log(`     ${err.message}`);
    }
  }

  assert(condition, message) {
    if (!condition) throw new Error(message || 'Assertion failed');
  }

  summary() {
    const total = this.passed + this.failed;
    const pct = total ? Math.round(this.passed / total * 100) : 0;
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  Résumé : ${this.passed}/${total} PASS (${pct}%)`);
    if (this.failed > 0) {
      console.log(`\n  Échecs :`);
      this.results.filter(r => r.status === 'FAIL').forEach(r => {
        console.log(`    - ${r.name}: ${r.error}`);
      });
    }
    return this.failed === 0;
  }
}

async function setupPage(browser, device) {
  const page = await browser.newPage();
  await page.setViewport({
    width: device.w,
    height: device.h,
    deviceScaleFactor: device.dpr,
    isMobile: device.mobile,
    hasTouch: device.mobile
  });
  await page.setRequestInterception(true);
  page.on('request', req => {
    const u = req.url();
    if (u.startsWith('file://') || u.startsWith('data:')) req.continue();
    else req.abort();
  });
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 2500));
  return page;
}

async function runTestsForDevice(browser, device, runner) {
  console.log(`\n📱 ${device.name} (${device.w}×${device.h})`);
  const page = await setupPage(browser, device);

  // Le journal d'erreurs vit dans localStorage, PARTAGÉ entre les pages du même
  // navigateur : sans remise à zéro, l'erreur de l'appareil 1 était recomptée sur
  // les 5 suivants (1, 2, 3, 4, 5 erreurs) et attribuée au mauvais appareil.
  await page.evaluate(() => {
    try { localStorage.removeItem('cmc_err_log'); } catch (e) {}
    if (typeof _errLog !== 'undefined') _errLog.length = 0;
  });

  // Login admin pour tous les tests
  await page.evaluate(() => {
    const admin = A.employees.find(e => e.id === 'U11804');
    if (admin) { A.user = admin; if (typeof render === 'function') render(); }
  });
  await new Promise(r => setTimeout(r, 500));

  await runner.test(`[${device.name}] App chargée`, async () => {
    const loaded = await page.evaluate(() => typeof APP_VER !== 'undefined' && typeof A === 'object');
    runner.assert(loaded, 'APP_VER ou A non défini');
  });

  await runner.test(`[${device.name}] IA tools (>= 60)`, async () => {
    const count = await page.evaluate(() => IA_TOOLS.length);
    runner.assert(count >= 60, `Seulement ${count} outils IA (attendu >= 60)`);
  });

  await runner.test(`[${device.name}] Command palette s'ouvre`, async () => {
    await page.evaluate(() => { if (typeof openCommandPalette === 'function') openCommandPalette(); });
    await new Promise(r => setTimeout(r, 300));
    const opened = await page.evaluate(() => !!document.getElementById('cmdPalette'));
    runner.assert(opened, 'Command palette non affiché');
    // Fermer
    await page.evaluate(() => { const m = document.getElementById('cmdPalette'); if (m) m.remove(); });
  });

  await runner.test(`[${device.name}] Modal d'aide`, async () => {
    await page.evaluate(() => { if (typeof showHelp === 'function') showHelp('motd'); });
    await new Promise(r => setTimeout(r, 300));
    const opened = await page.evaluate(() => !!document.getElementById('helpModal'));
    runner.assert(opened, 'Help modal non affiché');
    await page.evaluate(() => { const m = document.getElementById('helpModal'); if (m) m.remove(); });
  });

  await runner.test(`[${device.name}] Accessibilité skip-link + landmarks`, async () => {
    const a11y = await page.evaluate(() => ({
      skip: !!document.querySelector('.skip-link'),
      main: !!document.querySelector('main[role="main"]'),
      nav: !!document.querySelector('nav[role="navigation"]')
    }));
    runner.assert(a11y.skip, 'Skip link manquant');
    runner.assert(a11y.main, '<main role="main"> manquant');
    runner.assert(a11y.nav, '<nav role="navigation"> manquant');
  });

  await runner.test(`[${device.name}] Navigation multi-vues`, async () => {
    const views = ['accueil', 'monplanning', 'planning', 'departs', 'chat', 'admin'];
    for (const v of views) {
      await page.evaluate((view) => { if (typeof sv === 'function') sv(view); }, v);
      await new Promise(r => setTimeout(r, 100));
      const viewSet = await page.evaluate((v) => A.view === v, v);
      runner.assert(viewSet, `Vue ${v} non activée`);
    }
  });

  await runner.test(`[${device.name}] Undo/Redo fonctionnel`, async () => {
    const result = await page.evaluate(() => {
      A.motd = null;
      setMotd('Test undo');
      const v1 = A.motd ? A.motd.text : null;
      undoAdmin();
      const v2 = A.motd ? A.motd.text : null;
      redoAdmin();
      const v3 = A.motd ? A.motd.text : null;
      A.motd = null; // cleanup
      return { v1, v2, v3 };
    });
    runner.assert(result.v1 === 'Test undo', 'setMotd n\'a pas marché');
    runner.assert(result.v2 === null, 'undoAdmin n\'a pas remis null');
    runner.assert(result.v3 === 'Test undo', 'redoAdmin n\'a pas restauré');
  });

  await runner.test(`[${device.name}] IA tool execution (get_app_health)`, async () => {
    const result = await page.evaluate(() => _iaExecuteTool('get_app_health', {}));
    runner.assert(typeof result === 'string' && result.includes('Santé'), 'get_app_health ne retourne pas Santé');
  });

  await runner.test(`[${device.name}] Aucune erreur JS runtime`, async () => {
    // Le journal a trois formes d'entrée ({msg}, {technical,userMsg}, {ctx,err}) :
    // n'en lire qu'une affichait un message VIDE — un rouge qui ne dit pas pourquoi.
    const errs = await page.evaluate(() => {
      const l = (typeof getErrorLog === 'function' ? getErrorLog() : []) || [];
      const memoire = (typeof _errLog !== 'undefined') ? _errLog : [];
      const brut = l.length ? l : memoire;
      return brut.map(e => ({
        quoi: String((e && (e.type || e.ctx)) || 'erreur'),
        texte: String((e && (e.msg || e.err || e.technical || e.userMsg)) || '(sans message)'),
        vue: (e && e.view) || ''
      }));
    });
    runner.assert(errs.length === 0, `${errs.length} erreurs runtime: `
      + errs.slice(0, 3).map(e => `[${e.quoi}] ${e.texte}${e.vue ? ' @' + e.vue : ''}`).join(' | '));
  });

  await page.close();
}

(async () => {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  CMC Teams — Tests E2E automatisés (Puppeteer)               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\n📂 App : ${APP_URL}`);
  console.log(`📱 ${DEVICES.length} devices à tester`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const runner = new TestRunner();
  const startTime = Date.now();

  for (const device of DEVICES) {
    try {
      await runTestsForDevice(browser, device, runner);
    } catch (err) {
      runner.failed++;
      console.log(`  ❌ Crash device ${device.name}: ${err.message}`);
    }
  }

  await browser.close();

  console.log(`\n⏱️  Durée : ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  const success = runner.summary();
  process.exit(success ? 0 : 1);
})();
