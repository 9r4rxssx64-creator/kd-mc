/* Garde (Kevin 6.11.2026 : « vérifie réel dans les apps que la pastille Javis Bee Lingua ne cache jamais rien, aucune fonction »).
 * Lingua a sa propre compagne (.bee-companion), fixe en bas à droite. Dans un vrai Chromium, 4 écrans × plusieurs écrans de l'app (accueil, haut et bas
 * de page, chaque onglet visible) : au repos, AUCUN contrôle ne doit avoir son centre ou plus de la moitié de sa surface sous la compagne.
 * LINGUA_DIR=<dossier d'une ancienne Lingua> doit être ROUGE. */
import { chromium } from 'playwright'; import path from 'node:path';
const DIR = process.env.LINGUA_DIR || path.resolve('lingua');
const PAGE = 'file://' + path.join(DIR, 'index.html');
const nav = await chromium.launch();
let n = 0, ko = 0, vues = 0;
for (const [w, h, mob] of [[390, 664, true], [844, 390, true], [820, 1180, true], [1280, 720, false]]) {
  const ctx = await nav.newContext({ viewport: { width: w, height: h }, hasTouch: mob, isMobile: mob });
  await ctx.addInitScript(() => { localStorage.setItem('lingua_g_accounts', JSON.stringify([{ id: 'a1', name: 'Essai Robot', avatar: '🐝', code: '', created: 1 }])); localStorage.setItem('lingua_g_current', JSON.stringify('a1')); localStorage.setItem('lingua_a_a1_course', JSON.stringify('en')); });
  const p = await ctx.newPage(); await p.goto(PAGE); await p.waitForTimeout(2500);
  const onglets = await p.evaluate(() => [...document.querySelectorAll('nav button, .tabbar button, [role=tab]')].slice(0, 6).map((_, i) => i));
  const etapes = [['accueil haut', null, 0], ['accueil milieu', null, 0.5], ['accueil bas', null, 1],
    ['bouton glissé pile sous la compagne', 'piege', 0], ...onglets.flatMap((i) => [['onglet ' + (i + 1) + ' haut', i, 0], ['onglet ' + (i + 1) + ' bas', i, 1]])];
  for (const [nom, onglet, frac] of etapes) {
    if (onglet === 'piege') { await p.waitForTimeout(300); await p.evaluate(() => { const c = document.querySelector('.bee-companion'); if (!c) return; const r = c.getBoundingClientRect(); const e = document.createElement('button'); e.id = 'piege'; e.textContent = 'Valider'; e.style.cssText = 'position:absolute;left:' + (r.left + scrollX) + 'px;top:' + (r.top + scrollY) + 'px;width:' + r.width + 'px;height:' + r.height + 'px'; document.body.appendChild(e); }); }
    else if (onglet !== null) await p.evaluate((i) => { const b = [...document.querySelectorAll('nav button, .tabbar button, [role=tab]')][i]; if (b) b.click(); }, onglet);
    await p.waitForTimeout(500);
    if (onglet !== 'piege') await p.evaluate((f) => { scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f); for (const e of document.querySelectorAll('*')) if (e.scrollHeight > e.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(e).overflowY)) e.scrollTop = (e.scrollHeight - e.clientHeight) * f; }, frac);
    await p.waitForTimeout(900); await p.evaluate(() => { const b = document.querySelector('.bee-bubble'); if (b) b.remove(); if (window.__linguaBeeEviter) window.__linguaBeeEviter(); }); await p.waitForTimeout(450);
    const r = await p.evaluate(() => {
      const c = document.querySelector('.bee-companion'); if (!c) return null;
      const b0 = c.getBoundingClientRect(), b = { l: Math.max(0, b0.left), r: Math.min(innerWidth, b0.right), t: b0.top, b: b0.bottom }, out = [];
      for (const e of document.querySelectorAll('a[href],button,[role=button],input,select,textarea,summary,label,[onclick]')) {
        if (e.closest('.bee-companion,.bee-bubble')) continue; const r = e.getBoundingClientRect(); if (r.width < 6 || r.height < 6) continue;
        const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0 || cs.pointerEvents === 'none') continue;
        const ix = Math.min(b.r, r.right) - Math.max(b.l, r.left), iy = Math.min(b.b, r.bottom) - Math.max(b.t, r.top); if (ix <= 2 || iy <= 2) continue;
        const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
        if ((cx > b.l && cx < b.r && cy > b.t && cy < b.b) || ix * iy > 0.5 * r.width * r.height) out.push((e.id ? '#' + e.id : e.tagName.toLowerCase()) + ' « ' + (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 22) + ' »');
      }
      return out;
    });
    if (r === null) continue; vues++; n++; if (r.length) ko++;
    if (r.length) console.log(`  ❌ ${w}×${h} ${nom} : Bee cache ${r.join(', ')}`);
  }
  await ctx.close();
}
await nav.close();
if (!vues) { console.log('❌ la compagne n\'apparaît jamais : le garde ne voit rien'); process.exit(1); }
console.log(`\n${ko ? '❌ ' + ko + '/' + n + ' écran(s) où la compagne cache un contrôle' : '✅ la compagne de Lingua ne cache rien : ' + n + ' écrans mesurés, 4 tailles'}`); process.exit(ko ? 1 : 0);
