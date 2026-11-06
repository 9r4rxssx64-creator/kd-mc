/* GARDE EN VRAI NAVIGATEUR — la pastille « 👑 Vue admin » (installer-client.js) ne recouvre JAMAIS un bouton, même quand la barre d'onglets du bas
 * n'est ni « fixed » ni « sticky » (tâche 108, 6.11.2026 : Servi, 1280×720 : studio button.on, dashboard a.nav-item, apex-ai .ax-tabbar__item).
 * Le VRAI installer-client.js est joué dans Chromium (cookie kdmc_k posé, /__admin/vue simulé) sur une page dont la barre d'onglets est une GRILLE
 * en bas de l'écran. Contrôles : aucun bouton de la barre n'est recouvert par la pastille ; la pastille reste entièrement dans l'écran.
 * SABOTAGE : `SABOTAGE=1` rejoue le fichier tel qu'il était avant (git show origin/main avant correctif) → doit être ROUGE. */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('./../messaging-app/node_modules/playwright')); }
const exe = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${!c && d !== undefined ? '  → ' + JSON.stringify(d).slice(0, 300) : ''}`); };
const { INSTALLER_JS } = await import('../services/kdmc-router/installer-client.js');
let SRC = INSTALLER_JS;
if (process.env.SABOTAGE === '1') {   /* ancienne règle : seule une barre fixed/sticky fait remonter la pastille → on retire le bloc général */
  const i = SRC.indexOf('/* 6.11 (tâche 108, mesure de Servi'), j = SRC.indexOf('} catch (e4)');
  if (i > 0 && j > i) SRC = SRC.slice(0, i) + '          try {\n          ' + SRC.slice(j);
}
const PAGE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%}body{display:grid;grid-template-rows:1fr auto;background:#0a1a0c;color:#fff;font:16px sans-serif}
main{padding:16px}nav{display:grid;grid-template-columns:repeat(5,1fr);gap:0;background:#16210f}
nav button{min-height:56px;border:0;background:#16210f;color:#fff;font:700 14px sans-serif}</style>
<main>Application de test avec une barre d'onglets en grille, en bas (ni fixed ni sticky).</main>
<nav id="barre"><button>Accueil</button><button class="on">Studio</button><button>Chats</button><button>Appels</button><button>Réglages</button></nav>`;
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
for (const [w, h] of [[1280, 720], [390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.route('**/__admin/vue', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, mode: 'admin' }) }));
  await p.route('https://kdmc.test/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: PAGE }));
  await p.goto('https://kdmc.test/');
  await p.evaluate(() => { document.cookie = 'kdmc_k=1; path=/'; });
  await p.addScriptTag({ content: SRC });
  await p.waitForSelector('[data-kdmc-vue]', { timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const R = await p.evaluate(() => {
    const b = document.querySelector('[data-kdmc-vue]'); if (!b) return { absent: true };
    const r = b.getBoundingClientRect(), recouvre = [];
    document.querySelectorAll('#barre button').forEach((t) => { const q = t.getBoundingClientRect(); if (r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top) recouvre.push(t.textContent); });
    return { absent: false, recouvre, dedans: r.top >= 0 && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] };
  });
  ok(!R.absent, w + '×' + h + ' : la pastille « Vue admin » est posée');
  ok(!R.absent && R.recouvre.length === 0, w + '×' + h + ' : aucun bouton de la barre du bas n\'est recouvert', R);
  ok(!R.absent && R.dedans, w + '×' + h + ' : la pastille reste entièrement dans l\'écran', R);
  await ctx.close();
}

/* B. (capture de Kevin, 6.11 soir) : pas de bouton dessous, mais un TITRE de panneau en bas à gauche : la pastille ne doit pas le cacher non plus */
const PAGE_TEXTE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;background:#0a1a0c;color:#fff;font:16px sans-serif}h2{position:absolute;left:12px;bottom:12px;margin:0;padding:14px 8px;font-size:20px}</style>
<main>Panneau de messages</main><h2 id="titre">Inscriptions à valider</h2>`;
for (const [w, h] of [[390, 844], [1280, 720]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.route('**/__admin/vue', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, mode: 'admin' }) }));
  await p.route('https://kdmc.test/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: PAGE_TEXTE }));
  await p.goto('https://kdmc.test/');
  await p.evaluate(() => { document.cookie = 'kdmc_k=1; path=/'; });
  await p.addScriptTag({ content: SRC });
  await p.waitForSelector('[data-kdmc-vue]', { timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const R = await p.evaluate(() => {
    const b = document.querySelector('[data-kdmc-vue]'); if (!b) return { absent: true };
    const r = b.getBoundingClientRect(), q = document.getElementById('titre').getBoundingClientRect();
    return { absent: false, recouvre: r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top, rect: [Math.round(r.left), Math.round(r.top)] };
  });
  ok(!R.absent && !R.recouvre, w + '×' + h + ' : la pastille ne cache pas le titre « Inscriptions à valider »', R);
  await ctx.close();
}

/* C. (pont 1882, iPhone SE : le chat de Javis occupe tout l'écran) : aucun endroit libre → la pastille se réduit à une languette au bord, jamais plus de 44 px de large */
const PAGE_PLEIN = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%}textarea{position:fixed;inset:0;width:100%;height:100%;border:0;box-sizing:border-box;font:16px sans-serif}</style><textarea id="javis-input">Écris à Javis</textarea>`;
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.route('**/__admin/vue', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, mode: 'admin' }) }));
  await p.route('https://kdmc.test/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: PAGE_PLEIN }));
  await p.goto('https://kdmc.test/');
  await p.evaluate(() => { document.cookie = 'kdmc_k=1; path=/'; });
  await p.addScriptTag({ content: SRC });
  await p.waitForSelector('[data-kdmc-vue]', { timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const R = await p.evaluate(() => { const b = document.querySelector('[data-kdmc-vue]'); if (!b) return { absent: true }; const r = b.getBoundingClientRect(); return { absent: false, largeur: Math.round(r.width), hauteur: Math.round(r.height), dedans: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight }; });
  ok(!R.absent && R.largeur <= 44 && R.hauteur >= 44 && R.dedans, 'iPhone SE, champ plein écran : la pastille devient une languette (≤ 44 px de large, ≥ 44 px de haut, dans l\'écran)', R);
  await ctx.close();
}
await browser.close();
console.log(`\n=== ${pass} OK / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
