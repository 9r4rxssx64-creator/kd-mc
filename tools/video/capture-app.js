#!/usr/bin/env node
/**
 * CMC Teams — Capture automatisée de l'application
 * Utilise Puppeteer pour capturer chaque vue en screenshot haute résolution
 *
 * Usage: node tools/video/capture-app.js
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const config = require('./config');

const ASSETS_DIR = path.resolve(config.paths.assets);

// Vues à capturer avec leur configuration
const VIEWS = [
  {
    id: 'login',
    name: 'Connexion',
    setup: async (page) => {
      // La page de login est la vue par défaut
      await page.waitForSelector('#app', { timeout: 5000 });
      await sleep(1000);
    },
  },
  {
    id: 'accueil',
    name: 'Accueil',
    setup: async (page) => {
      // Simuler un login pour voir l'accueil
      await page.evaluate(() => {
        if (typeof A !== 'undefined') {
          A.view = 'accueil';
          A.user = A.employees && A.employees[0] ? A.employees[0] : { id: 'U11804', name: 'DESARZENS K', team: 'bj1' };
          if (typeof dc === 'function') dc();
        }
      });
      await sleep(500);
    },
  },
  {
    id: 'planning',
    name: 'Planning',
    setup: async (page) => {
      await page.evaluate(() => {
        if (typeof sv === 'function') sv('planning');
        else if (typeof A !== 'undefined') { A.view = 'planning'; if (typeof dc === 'function') dc(); }
      });
      await sleep(500);
    },
  },
  {
    id: 'departs',
    name: 'Départs',
    setup: async (page) => {
      await page.evaluate(() => {
        if (typeof sv === 'function') sv('departs');
        else if (typeof A !== 'undefined') { A.view = 'departs'; if (typeof dc === 'function') dc(); }
      });
      await sleep(500);
    },
  },
  {
    id: 'monplanning',
    name: 'Mon Planning',
    setup: async (page) => {
      await page.evaluate(() => {
        if (typeof sv === 'function') sv('monplanning');
        else if (typeof A !== 'undefined') { A.view = 'monplanning'; if (typeof dc === 'function') dc(); }
      });
      await sleep(500);
    },
  },
  {
    id: 'profil',
    name: 'Profil',
    setup: async (page) => {
      await page.evaluate(() => {
        if (typeof sv === 'function') sv('profil');
        else if (typeof A !== 'undefined') { A.view = 'profil'; if (typeof dc === 'function') dc(); }
      });
      await sleep(500);
    },
  },
  {
    id: 'chat',
    name: 'Chat',
    setup: async (page) => {
      await page.evaluate(() => {
        if (typeof sv === 'function') sv('chat');
        else if (typeof A !== 'undefined') { A.view = 'chat'; if (typeof dc === 'function') dc(); }
      });
      await sleep(500);
    },
  },
  {
    id: 'stats',
    name: 'Statistiques',
    setup: async (page) => {
      await page.evaluate(() => {
        if (typeof sv === 'function') sv('stats');
        else if (typeof A !== 'undefined') { A.view = 'stats'; if (typeof dc === 'function') dc(); }
      });
      await sleep(500);
    },
  },
  {
    id: 'convention',
    name: 'Convention',
    setup: async (page) => {
      await page.evaluate(() => {
        if (typeof sv === 'function') sv('convention');
        else if (typeof A !== 'undefined') { A.view = 'convention'; if (typeof dc === 'function') dc(); }
      });
      await sleep(500);
    },
  },
  {
    id: 'ia',
    name: 'IA Claude',
    setup: async (page) => {
      await page.evaluate(() => {
        if (typeof sv === 'function') sv('ia');
        else if (typeof A !== 'undefined') { A.view = 'ia'; if (typeof dc === 'function') dc(); }
      });
      await sleep(500);
    },
  },
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function captureViews() {
  console.log('📸 Capture automatisée des vues CMC Teams');
  console.log(`📂 Screenshots: ${ASSETS_DIR}\n`);

  // S'assurer que le dossier existe
  fs.mkdirSync(ASSETS_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins',
      '--disable-site-isolation-trials',
      '--window-size=430,932',
    ],
    defaultViewport: {
      width: 430,
      height: 932,
      deviceScaleFactor: 2, // Retina pour qualité HD
    },
  });

  const page = await browser.newPage();

  // Désactiver les requêtes réseau externes (Firebase, etc.)
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.startsWith('file://') || url.startsWith('data:') || url.includes('localhost')) {
      req.continue();
    } else {
      req.abort();
    }
  });

  // Charger l'application
  const appPath = path.resolve(config.paths.app);
  console.log(`🌐 Chargement: file://${appPath}`);

  try {
    await page.goto(`file://${appPath}`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
  } catch (err) {
    console.log(`⚠️  Timeout chargement (normal — Firebase bloqué). Continuation...`);
  }

  await sleep(2000);

  // Injecter des données de démo si nécessaire
  await page.evaluate(() => {
    // Empêcher les redirections Firebase
    window.fbWrite = function() {};
    window.fbStartListening = function() {};
  });

  // Capturer chaque vue
  for (const view of VIEWS) {
    console.log(`  📷 ${view.name} (${view.id})...`);

    try {
      await view.setup(page);
      await sleep(300);

      const ssPath = path.join(ASSETS_DIR, `ss_${view.id}.png`);
      await page.screenshot({
        path: ssPath,
        type: 'png',
        fullPage: false,
      });

      const stats = fs.statSync(ssPath);
      console.log(`     ✅ ${(stats.size / 1024).toFixed(0)} KB`);
    } catch (err) {
      console.log(`     ⚠️  Erreur: ${err.message.slice(0, 80)}`);
    }
  }

  await browser.close();
  console.log(`\n✅ Capture terminée! ${VIEWS.length} vues capturées.`);
}

if (require.main === module) {
  captureViews().catch(err => {
    console.error('❌ Erreur fatale:', err);
    process.exit(1);
  });
}

module.exports = { captureViews, VIEWS };
