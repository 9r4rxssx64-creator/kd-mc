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

/* D. (pont 1879) la pastille 📲 : les six coins sont pris par des boutons → elle se glisse le long du bord droit et ne recouvre AUCUN bouton */
const PAGE_COINS = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%}button{position:fixed;width:60px;height:60px}
#a{top:0;right:0}#b{top:0;left:0}#c{bottom:70px;left:0}#d{bottom:70px;right:0}#e{top:calc(50% - 30px);left:0}#f{top:calc(50% - 30px);right:0}</style>
<button id="a">a</button><button id="b">b</button><button id="c">c</button><button id="d">d</button><button id="e">e</button><button id="f">f</button>`;
for (const [w, h] of [[390, 844], [1280, 720]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.route('https://kdmc.test/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: PAGE_COINS }));
  await p.goto('https://kdmc.test/');
  await p.addScriptTag({ content: SRC });
  await p.waitForSelector('[data-kdmc-installer="pastille"]', { timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(1800);
  const R = await p.evaluate(() => {
    const b = document.querySelector('[data-kdmc-installer="pastille"]'); if (!b) return { absent: true };
    const r = b.getBoundingClientRect(), rec = [];
    document.querySelectorAll('button[id]').forEach((t) => { const q = t.getBoundingClientRect(); if (r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top) rec.push(t.id); });
    return { absent: false, recouvre: rec, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width)] };
  });
  ok(!R.absent, w + '×' + h + ' : la pastille 📲 est posée');
  ok(!R.absent && R.recouvre.length === 0, w + '×' + h + ' : la pastille 📲 ne recouvre aucun bouton (six coins pris)', R);
  await ctx.close();
}

/* E. (pont 1879) la pastille « ← Portail » du domaine (fixe, en haut à gauche, 8 px + ~104 px de large) ne recouvre plus la marque de Sourcing */
for (const f of ['shops/sourcing/index.html', 'shops/sourcing/supplier.html']) {
  const html = readFileSync(f, 'utf8');
  for (const [w, h] of [[390, 844], [1280, 720]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    await p.route('https://kdmc.test/**', (r) => r.request().url().endsWith('/x') ? r.fulfill({ status: 200, contentType: 'text/html', body: html }) : r.abort());
    await p.goto('https://kdmc.test/x', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await p.evaluate(() => { const a = document.createElement('a'); a.href = 'https://kd-mc.com/'; a.id = 'portail-pilule'; a.textContent = '← Portail'; a.style.cssText = 'position:fixed;top:calc(env(safe-area-inset-top,0px) + 8px);left:8px;display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:44px;padding:0 14px;box-sizing:border-box;border-radius:22px;font:700 15px/1 sans-serif;z-index:2147483000'; document.body.appendChild(a); });
    const R = await p.evaluate(() => { const a = document.getElementById('portail-pilule').getBoundingClientRect(), b = document.querySelector('a.brand'); if (!b) return { absent: true }; const q = b.getBoundingClientRect(); return { absent: false, recouvre: a.left < q.right && a.right > q.left && a.top < q.bottom && a.bottom > q.top, pilule: [Math.round(a.left), Math.round(a.right)], marque: [Math.round(q.left), Math.round(q.right)] }; });
    ok(!R.absent && !R.recouvre, f.split('/').pop() + ' ' + w + '×' + h + ' : « ← Portail » ne recouvre pas la marque Sourcing', R);
    await ctx.close();
  }
}

/* F. (pont 1911, Apex Chat iPhone 13) : un bouton MONTRÉ après coup par style.display sous la pastille 📲 → elle se replace en moins d'une seconde (pas aux minuteurs de 5 s) */
const PAGE_TARDIF = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%}#z{position:fixed;top:0;right:0;width:70px;height:70px;display:none}</style><button id="z">z</button>`;
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.route('https://kdmc.test/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: PAGE_TARDIF }));
  await p.goto('https://kdmc.test/');
  await p.addScriptTag({ content: SRC });
  await p.waitForSelector('[data-kdmc-installer="pastille"]', { timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(2500);
  await p.evaluate(() => { document.getElementById('z').style.display = 'block'; });
  await p.waitForTimeout(1400);
  const R = await p.evaluate(() => { const b = document.querySelector('[data-kdmc-installer="pastille"]'); if (!b) return { absent: true }; const r = b.getBoundingClientRect(), q = document.getElementById('z').getBoundingClientRect(); return { absent: false, recouvre: r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top }; });
  ok(!R.absent && !R.recouvre, 'un bouton montré après coup (style.display) : la pastille 📲 se replace en moins de 1,4 s', R);
  await ctx.close();
}

/* G. (mesure de Servi, Lingua : « button.tab.active sous 👑 Vue admin ») : la page est PLEINE de grandes cartes cliquables et d'une barre d'onglets : la pastille se juge comme le robot (centre ou > 50 % d'un contrôle = caché), un coin de grande carte ne compte pas */
const PAGE_CARTES = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%}body{display:flex;flex-direction:column}main{flex:1;display:grid;grid-template-columns:1fr;gap:6px;padding:6px;overflow:hidden}
.carte{border:1px solid #888;background:#eee;min-height:90px}nav{display:flex}.tab{flex:1;min-height:56px;border:0;background:#222;color:#fff}</style>
<main>${'<button class="carte">carte</button>'.repeat(9)}</main><nav id="barre"><button class="tab">1</button><button class="tab">2</button><button class="tab">3</button><button class="tab">4</button><button class="tab">5</button></nav>`;
for (const [w, h] of [[390, 844], [375, 667]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.route('**/__admin/vue', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, mode: 'admin' }) }));
  await p.route('https://kdmc.test/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: PAGE_CARTES }));
  await p.goto('https://kdmc.test/');
  await p.evaluate(() => { document.cookie = 'kdmc_k=1; path=/'; });
  await p.addScriptTag({ content: SRC });
  await p.waitForSelector('[data-kdmc-vue]', { timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const R = await p.evaluate(() => {
    const b = document.querySelector('[data-kdmc-vue]'); if (!b) return { absent: true };
    const r = b.getBoundingClientRect(), cache = [];
    document.querySelectorAll('.tab').forEach((t) => { const q = t.getBoundingClientRect(); const ix = Math.max(0, Math.min(q.right, r.right) - Math.max(q.left, r.left)), iy = Math.max(0, Math.min(q.bottom, r.bottom) - Math.max(q.top, r.top)); const cx = q.left + q.width / 2, cy = q.top + q.height / 2; if ((ix * iy) / (q.width * q.height) > .5 || (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom)) cache.push(t.textContent); });
    return { absent: false, cache, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width)] };
  });
  ok(!R.absent && R.cache.length === 0, w + '×' + h + ' : page pleine de cartes — aucun onglet caché (critère du robot), la pastille n\'est pas rejetée sur la barre', R);
  await ctx.close();
}

/* H. (pont 1930, Apex Chat iPhone 13 portrait — REPRODUIT sur la vraie page : un écran d'accueil transparent et non cliquable passe entre la pastille et le lien « ← KDMC ») : on regarde toute la pile, pas le seul premier élément */
const PAGE_VOILE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%}#haut{position:fixed;top:0;right:0;width:80px;height:56px}
#lien{position:fixed;left:8px;bottom:72px;z-index:150;display:flex;align-items:center;justify-content:center;min-height:44px;width:80px;background:#222;color:#fff}
#voile{position:fixed;top:100px;left:0;right:0;bottom:0;z-index:1000;background:transparent}</style>
<button id="haut">x</button><a id="lien" href="#">← KDMC</a><div id="voile"></div>`;
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 664 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.route('https://kdmc.test/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: PAGE_VOILE }));
  await p.goto('https://kdmc.test/');
  await p.addScriptTag({ content: SRC });
  await p.waitForSelector('[data-kdmc-installer="pastille"]', { timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(1800);
  const R = await p.evaluate(() => { const b = document.querySelector('[data-kdmc-installer="pastille"]'); if (!b) return { absent: true }; const r = b.getBoundingClientRect(), q = document.getElementById('lien').getBoundingClientRect(); const cx = q.left + q.width / 2, cy = q.top + q.height / 2; return { absent: false, centreSous: cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom, pill: [Math.round(r.left), Math.round(r.top)] }; });
  ok(!R.absent && !R.centreSous, 'écran transparent non cliquable devant le lien : la pastille 📲 ne recouvre pas le centre du lien', R);
  await ctx.close();
}
await browser.close();
console.log(`\n=== ${pass} OK / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
