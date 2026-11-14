/* GARDE — EN PAYSAGE, L'ENCART « METS APEX CHAT SUR TON ÉCRAN D'ACCUEIL » NE CACHE PLUS LA LISTE DES CONVERSATIONS (Apex Chat 1.1.364, 14.11.2026)
   Constat (robot d'affichage public, run 43605916685 puis 43608259983, iPhone paysage 844×390) : « div.conv-item sous div#install-hint{fixed z180} » — 4 lignes de
   conversations recouvertes, l'encart de 46 px tombant au milieu d'une hauteur de 390 px. Sous 480 px de haut, l'encart n'est plus affiché ; en portrait (390×664) il reste.
   Vrai navigateur : la VRAIE fonction K._maybeShowInstallHint extraite de messaging-app/index.html, UA iPhone, une ligne de conversation posée aux mesures du robot.
   node tests/verify-install-hint-paysage.mjs  ·  SABOTAGE=1 : retire la règle « sous 480 px de haut » — doit être rouge */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
let ok = 0, ko = 0;
const t = (c, m) => { if (c) { ok++; console.log('  ✅ ' + m); } else { ko++; console.log('  ❌ ' + m); } };
const src = readFileSync(new URL('../messaging-app/index.html', import.meta.url), 'utf8');
const a = src.indexOf('K._maybeShowInstallHint = function(){'), b = src.indexOf('K._contactSupport = async function(){');
t(a > 0 && b > a, 'la vraie fonction de l\'encart est dans messaging-app/index.html');
let code = src.slice(a, b);
if (process.env.SABOTAGE === '1') code = code.replace('@media (max-height:480px){#install-hint{display:none!important}}', '');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const nav = await chromium.launch();
async function essai(w, h) {
  const ctx = await nav.newContext({ viewport: { width: w, height: h }, userAgent: UA, hasTouch: true });
  const p = await ctx.newPage();
  const page = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--ax-bg-2:#111;--ax-text-2:#aaa;--ax-shadow:0 2px 8px #000}body{margin:0;height:${h}px}#conv{position:absolute;left:8px;width:${w - 110}px;height:69px;top:${h - 138}px}</style><div class="conv-item" id="conv">Conversation</div>`;
  await p.route('https://apex-chat.test/', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: page }));
  await p.goto('https://apex-chat.test/');
  await p.evaluate((c) => { const K = { user: { id: 'u' } }; window.K = K; (new Function('K', c))(K); K._maybeShowInstallHint(); }, code);
  const m = await p.evaluate(() => {
    const e = document.getElementById('install-hint'); const c = document.getElementById('conv').getBoundingClientRect();
    const vu = !!e && getComputedStyle(e).display !== 'none';
    const x = c.left + c.width / 2, y = c.top + c.height / 2; const top = document.elementFromPoint(x, y);
    return { existe: !!e, visible: vu, ligneTouchee: !!top && (top.id === 'conv' || top.closest('#conv') !== null) };
  });
  await ctx.close(); return m;
}
const pay = await essai(844, 390);
t(pay.ligneTouchee, 'iPhone paysage 844×390 : la ligne de conversation reçoit le toucher (rien par-dessus)');
t(!pay.visible, 'iPhone paysage 844×390 : l\'encart n\'est pas affiché');
const por = await essai(390, 664);
t(por.existe && por.visible, 'iPhone portrait 390×664 : l\'encart reste affiché (le conseil n\'est pas perdu)');
await nav.close();
console.log(`\n${ok} ✅ · ${ko} ❌`); process.exit(ko ? 1 : 0);
