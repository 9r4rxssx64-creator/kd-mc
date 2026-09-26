// E2E navigateur RÉEL — deux points levés par le second avis indépendant (Qodo, PR #3890, 17/09/2026).
//
// 1. Historique des modales : fermer une modale par son bouton ✕ doit AUSSI retirer l'entrée
//    d'historique posée à l'ouverture. Sinon le geste Retour suivant « ne fait rien » (il consomme
//    une entrée morte) et la modale suivante ne crée plus la sienne (state.modal encore vrai).
// 2. Suppression de compte : les bases IndexedDB locales doivent être RÉELLEMENT supprimées
//    (connexion fermée, suppression attendue) avant le rechargement, pas seulement « lancées ».
//
// Prouvé discriminant : avec l'ancien _closeModal (innerHTML='' seul) → `stateAfterClose` reste
// vrai et `pushed2` est faux (2 échecs) ; avec l'ancien deleteDatabase non attendu → la base est
// encore listée au retour de la fonction.
import { test, expect } from '@playwright/test';

test.describe('Apex Chat — retour arrière et effacement local (navigateur réel)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(() => window.K && window.K._showModal && window.K._closeModal, { timeout: 15000 });
  });

  test('fermer une modale au bouton retire son entrée d\'historique ; la suivante en recrée une ; Retour la ferme', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const K = window.K;
      const host = document.querySelector('#modal-host');
      K._showModal('Première', '<p>a</p>');
      await wait(60);                                   // le MutationObserver pousse l'entrée
      const pushed = !!(history.state && history.state.modal);
      document.querySelector('.modal-close').click();   // fermeture par le bouton ✕
      await wait(200);                                  // history.back() asynchrone → popstate
      const stateAfterClose = !!(history.state && history.state.modal);
      const hostEmptyAfterClose = !host.innerHTML;
      K._showModal('Seconde', '<p>b</p>');
      await wait(60);
      const pushed2 = !!(history.state && history.state.modal);
      history.back();                                   // le geste Retour du téléphone
      await wait(200);
      const closedByBack = !host.innerHTML;
      const stateAfterBack = !!(history.state && history.state.modal);
      return { pushed, stateAfterClose, hostEmptyAfterClose, pushed2, closedByBack, stateAfterBack, view: K.view };
    });
    expect(r.pushed, 'ouvrir une modale pousse une entrée').toBe(true);
    expect(r.hostEmptyAfterClose, 'le bouton ✕ ferme la modale').toBe(true);
    expect(r.stateAfterClose, 'le bouton ✕ retire aussi l\'entrée d\'historique').toBe(false);
    expect(r.pushed2, 'la modale suivante recrée son entrée').toBe(true);
    expect(r.closedByBack, 'le geste Retour ferme la modale suivante').toBe(true);
    expect(r.stateAfterBack).toBe(false);
  });

  test('suppression de compte : la base IndexedDB locale est réellement supprimée avant le rechargement', async ({ page }) => {
    await page.route('**/api/users/me', (route) => {
      if (route.request().method() === 'DELETE') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, deleted: true }) });
      return route.continue();
    });
    const r = await page.evaluate(async () => {
      const K = window.K;
      // une base ouverte et remplie, comme en usage réel (connexion tenue par l'app)
      await new Promise((res, rej) => { const rq = indexedDB.open('apex_chat_idb', 1); rq.onupgradeneeded = () => { const db = rq.result; if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv'); }; rq.onsuccess = () => { rq.result.close(); res(); }; rq.onerror = () => rej(rq.error); });
      const before = (await indexedDB.databases()).map((d) => d.name);
      K.token = 'tok-test';
      const inp = document.createElement('input'); inp.id = 'del-confirm'; inp.value = 'SUPPRIMER'; document.body.appendChild(inp);
      const origReplace = location.replace.bind(location);
      let reloadAsked = false; try { location.replace = () => { reloadAsked = true; }; } catch (_) {}
      await K._deleteMyAccountGo();
      const after = (await indexedDB.databases()).map((d) => d.name);
      try { location.replace = origReplace; } catch (_) {}
      return { before, after };
    });
    expect(r.before).toContain('apex_chat_idb');
    expect(r.after, 'plus aucune base locale au retour de la fonction').not.toContain('apex_chat_idb');
  });

  // Second avis Qodo (PR #3894) : si une autre fenêtre garde la base ouverte, la suppression reste « blocked »
  // après 3 s. On ne doit pas annoncer un effacement qui n'a pas eu lieu : drapeau posé, message clair, et
  // l'effacement est REPRIS au démarrage suivant, avant toute ouverture de base.
  test('suppression de compte avec une autre fenêtre ouverte : prévenu, puis effacé au démarrage suivant', async ({ page }) => {
    await page.route('**/api/users/me', (route) => {
      if (route.request().method() === 'DELETE') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, deleted: true }) });
      return route.continue();
    });
    const step1 = await page.evaluate(async () => {
      const K = window.K;
      // une connexion « étrangère » qui ne se ferme pas sur versionchange (ancienne fenêtre, autre onglet)
      await window.idbSet('marqueur_ancien_compte', { secret: 'x' });   // une donnée de l'ancien compte
      await new Promise((res, rej) => { const rq = indexedDB.open('apex_chat_idb', 1); rq.onupgradeneeded = () => { const db = rq.result; if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv'); }; rq.onsuccess = () => { window.__autreFenetre = rq.result; res(); }; rq.onerror = () => rej(rq.error); });
      K.token = 'tok-test';
      const inp = document.createElement('input'); inp.id = 'del-confirm'; inp.value = 'SUPPRIMER'; document.body.appendChild(inp);
      try { location.replace = () => {}; } catch (_) {}
      const t0 = Date.now();
      await K._deleteMyAccountGo();
      const toasts = [...document.querySelectorAll('.toast')].map((t) => t.textContent);
      return { ms: Date.now() - t0, flag: localStorage.getItem('apex_chat_wipe_pending'), bases: (await indexedDB.databases()).map((d) => d.name), toasts };
    });
    expect(step1.flag, 'drapeau « effacement à reprendre » posé').toBe('1');
    expect(step1.bases, 'la base est encore là (bloquée par l\'autre fenêtre), et on ne prétend pas le contraire').toContain('apex_chat_idb');
    expect(step1.toasts.join(' ')).toContain('autre fenêtre');
    expect(step1.ms, 'plafond 3 s tenu').toBeLessThan(6000);
    // l'autre fenêtre est fermée (rechargement) → l'app reprend l'effacement au démarrage.
    // Un dialogue beforeunload éventuel serait « dismiss » par défaut (= navigation annulée) : on l'accepte.
    page.on('dialog', (d) => d.accept().catch(() => {}));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.K && window.K._wipeLocalDatabases, { timeout: 15000 });
    await page.waitForFunction(() => !localStorage.getItem('apex_chat_wipe_pending'), { timeout: 10000 });
    // L'app recrée aussitôt une base VIDE pour la nouvelle session : la preuve d'effacement, c'est que la
    // donnée de l'ancien compte n'y est plus.
    const step2 = await page.evaluate(async () => ({ ancien: await window.idbGet('marqueur_ancien_compte'), flag: localStorage.getItem('apex_chat_wipe_pending') }));
    expect(step2.ancien, 'la donnée de l\'ancien compte a disparu au démarrage suivant').toBeFalsy();
    expect(step2.flag).toBeNull();
  });

  // Mesuré le 17/09 : IndexedDB qui refuse (navigation privée, quota, effacement en cours) → l'échec partait
  // à la télémétrie, qui écrit son journal via ls() → IndexedDB → échec → … journal de 7,9 Mo en 2 min, CPU à
  // 100 %, page qui ne se recharge plus. Ancien code → des milliers de lignes ; nouveau → 3 avertissements.
  test('IndexedDB indisponible : pas de boucle infinie, l\'app continue avec la mémoire locale', async ({ page }) => {
    let errs = 0;
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs++; });
    await page.evaluate(() => {
      const failing = { open: () => { throw new Error('indexedDB refusé (navigation privée)'); }, databases: async () => [] };
      Object.defineProperty(window, 'indexedDB', { value: failing, configurable: true });
    });
    await page.evaluate(async () => {
      // 20 écritures locales comme en usage réel (chacune tente une copie IndexedDB, qui échoue)
      const ls = window.ls; for (let i = 0; i < 20; i++) ls('test_idb_' + i, { i });
      await new Promise((r) => setTimeout(r, 1500));
    });
    expect(errs, 'avertissements console après 20 écritures avec IndexedDB en panne').toBeLessThanOrEqual(6);
    const alive = await page.evaluate(() => typeof window.lg === 'function' && window.lg('test_idb_19', null)?.i === 19);
    expect(alive, 'la mémoire locale fonctionne toujours').toBe(true);
  });

  // Mesuré le 17/09 (Firebase injoignable) : 3 636 requêtes en 2 min, parce que l'échec de l'envoi
  // repassait par _safeCatch → _logTelemetry → _escalateToApex. Ancien code → ce test compte des
  // centaines de requêtes ; nouveau → au plus 3 (puis pause 5 min).
  test('télémétrie : Firebase injoignable ne déclenche plus une tempête de requêtes', async ({ page }) => {
    let hits = 0;
    await page.route('**/ax_telemetry_in.json', (route) => { hits++; route.abort('connectionrefused'); });
    // 5 erreurs applicatives d'affilée (chacune tentait un envoi ; l'ancien code en relançait sans fin)
    await page.evaluate(async () => { for (let i = 0; i < 5; i++) { window._safeCatch('test-tempete', new Error('boom ' + i)); await new Promise((r) => setTimeout(r, 150)); } });
    await page.waitForTimeout(2500);
    expect(hits, 'requêtes Firebase après 5 erreurs : 3 tentatives puis silence').toBeLessThanOrEqual(3);
    const gate = await page.evaluate(() => ({ paused: window.K._telemetryGate.pausedUntil > Date.now() }));
    expect(gate.paused, 'après 3 échecs consécutifs, pause 5 min').toBe(true);
  });

  // audit-live.yml (run 35256272025) notait « version servie : non exposée par la page » : la convention du
  // domaine est une globale <APP>_VERSION ou un élément [data-ver]. Les deux existent désormais et concordent.
  test('la version servie est lisible par l\'audit live (globale + data-ver), et concorde avec la barre', async ({ page }) => {
    const v = await page.evaluate(() => ({
      globale: window.APEX_CHAT_VERSION,
      dataVer: document.querySelector('[data-ver]')?.getAttribute('data-ver'),
      topbar: document.querySelector('#topbar-version')?.textContent.trim(),
    }));
    expect(v.globale).toMatch(/^v\d+\.\d+\.\d+$/);
    expect(v.dataVer).toBe(v.globale);
    expect(v.topbar).toBe(v.globale);
  });
});
