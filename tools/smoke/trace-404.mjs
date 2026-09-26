/* TRACE-404 — retrouver la CAUSE EXACTE (pile d'appel) d'une requête 404 sur une page kd-mc.com.
 *
 * Pourquoi : la vérif réelle voit « HTTP 404 https://cmcteams.kd-mc.com/%22/%22 » mais pas QUI
 * la déclenche. Trois correctifs à l'aveugle (v9.877-879) n'ont pas suffi → on capture ici
 * l'initiator CDP (type de ressource + pile d'appel JS complète) de la requête fautive.
 *
 * Usage : node tools/smoke/trace-404.mjs [url] [motif]
 *   url    (défaut https://cmcteams.kd-mc.com/) — doit être sur kd-mc.com
 *   motif  (défaut %22) — sous-chaîne à chercher dans l'URL des requêtes
 * Session Kevin appliquée si KDMC_AS_KEVIN=1 (mêmes règles que audit-live).
 */
import { chromium } from 'playwright';
import { connecte } from './session-kevin.mjs';

const url = process.argv[2] || 'https://cmcteams.kd-mc.com/';
const motif = process.argv[3] || '%22';
const host = new URL(url).host;
if (!/(^|\.)kd-mc\.com$/.test(host)) { console.error('périmètre refusé :', host); process.exit(2); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
const trouvailles = [];
cdp.on('Network.requestWillBeSent', (e) => {
  if (!e.request.url.includes(motif)) return;
  const init = e.initiator || {};
  const frames = (init.stack && init.stack.callFrames) || [];
  trouvailles.push({
    url: e.request.url,
    type: e.type,
    initiatorType: init.type,
    initiatorUrl: init.url || '',
    ligne: init.lineNumber != null ? init.lineNumber : '',
    pile: frames.slice(0, 12).map(f => `${f.functionName || '(anonyme)'} @ ${f.url.split('/').pop()}:${f.lineNumber}:${f.columnNumber}`),
  });
});

if (process.env.KDMC_AS_KEVIN === '1') {
  await connecte(page, url, { pinHash: process.env.KDMC_ADMIN_PIN_SHA256 || '' });
} else {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
}
await page.waitForTimeout(15000); // laisser Firebase SSE charger les données puis re-render

/* Version réellement SERVIE + éléments fautifs dans le DOM (source exacte) */
try {
  const etat = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('img').forEach(i => { const sr = i.getAttribute('src') || ''; if (sr.includes('\"') || sr.includes('%22')) bad.push('IMG ' + i.outerHTML.slice(0, 260)); });
    document.querySelectorAll('[style*="url"]').forEach(el => { const st = el.getAttribute('style') || ''; if (/%22/.test(st)) bad.push(el.tagName + ' style=' + st.slice(0, 200)); });
    return { version: (typeof APP_VER !== 'undefined' ? APP_VER : '(inconnue)'), fautifs: bad };
  });
  console.log('VERSION SERVIE :', etat.version);
  etat.fautifs.forEach(f => console.log('ÉLÉMENT FAUTIF :', f));
  if (!etat.fautifs.length) console.log('(aucun élément fautif encore présent dans le DOM)');
} catch (e) { console.log('inspection DOM impossible :', e.message); }

console.log(`\n=== requêtes contenant « ${motif} » sur ${url} : ${trouvailles.length} ===`);
for (const t of trouvailles) {
  console.log('\n• URL      :', t.url);
  console.log('  ressource:', t.type, '· initiator:', t.initiatorType, t.initiatorUrl, t.ligne !== '' ? 'ligne ' + t.ligne : '');
  if (t.pile.length) { console.log('  PILE D\'APPEL :'); t.pile.forEach(p => console.log('    ', p)); }
  else console.log('  (pas de pile — initiator', t.initiatorType + ' : élément HTML/CSS, voir initiatorUrl+ligne)');
}
if (!trouvailles.length) console.log('Aucune requête fautive vue en 15 s — soit corrigée, soit déclenchée par une autre vue.');
await browser.close();
