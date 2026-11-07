/* GARDE — L'ENCART « METS APEX CHAT SUR TON ÉCRAN D'ACCUEIL » NE RECOUVRE PLUS LES BOUTONS DE LA LISTE VIDE (Apex Chat 1.1.360, 07.11.2026)
   Constat (robot Servi, run 42339956251, iPhone 13 portrait 390×664, compte neuf) : `button.btn @87,424 216x48` et `button.btn.btn-out` sous `div#install-hint{fixed z180} @12,446 366x140`.
   Ce sont « 📤 Inviter mes amis » et « 👥 Créer un groupe » (liste vide, K.renderChats). L'encart tient maintenant sur une ligne de ≈ 46 px ; les 3 gestes s'ouvrent au toucher.
   Vrai navigateur : la VRAIE fonction K._maybeShowInstallHint extraite de messaging-app/index.html, UA iPhone, 390×664, deux boutons posés aux mesures de Servi.
   node tests/verify-install-hint-compact.mjs  ·  SABOTAGE=1 : les 3 gestes affichés d'office (ancien encart de 140 px) — doit être rouge */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
let ok = 0, ko = 0;
const t = (c, m) => { if (c) { ok++; console.log('  ✅ ' + m); } else { ko++; console.log('  ❌ ' + m); } };
const src = readFileSync(new URL('../messaging-app/index.html', import.meta.url), 'utf8');
const a = src.indexOf('K._maybeShowInstallHint = function(){'), b = src.indexOf('K._contactSupport = async function(){');
t(a > 0 && b > a, 'la vraie fonction de l\'encart est dans messaging-app/index.html');
let code = src.slice(a, b);
if (process.env.SABOTAGE === '2') code = code.replace('left:100px;right:12px', 'left:12px;right:12px');
if (process.env.SABOTAGE === '1') code = code.replace('id="install-hint-d" style="display:none', 'id="install-hint-d" style="display:block');
const page = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--ax-bg-2:#111;--ax-text-2:#aaa;--ax-shadow:0 2px 8px #000}body{margin:0;font-family:sans-serif;font-size:16px;background:#000;color:#fff}
.b{position:absolute;left:87px;width:216px;height:48px}</style><a id="lien" href="#" style="position:fixed;left:8px;top:548px;width:80px;height:44px;z-index:150">← Portail</a><button class="b" id="c1" style="top:424px">📤 Inviter mes amis</button><button class="b" id="c2" style="top:482px">👥 Créer un groupe</button>`;
const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 390, height: 664 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
const p = await ctx.newPage(); await p.route('https://apex-chat.test/', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: page })); await p.goto('https://apex-chat.test/');
await p.evaluate((c) => { const K = { user: { id: 'u' } }; window.K = K; (new Function('K', c))(K); K._maybeShowInstallHint(); }, code);
const m = await p.evaluate(() => { const h = document.getElementById('install-hint'); if (!h) return null; const r = h.getBoundingClientRect(); const c2 = document.getElementById('c2').getBoundingClientRect(); const lk = document.getElementById('lien').getBoundingClientRect(); const chevauche = !(r.right <= lk.left || r.left >= lk.right || r.bottom <= lk.top || r.top >= lk.bottom); return { top: Math.round(r.top), h: Math.round(r.height), c2bas: Math.round(c2.bottom), chevauche, gauche: Math.round(r.left), lienDroite: Math.round(lk.right), lienTouche: document.elementFromPoint(48, 570) === document.getElementById('lien'), pose: document.elementFromPoint(195, 450) === document.getElementById('c1') || document.getElementById('c1').contains(document.elementFromPoint(195, 450)), pose2: document.elementFromPoint(195, 506) === document.getElementById('c2') }; });
t(!!m, 'l\'encart s\'affiche pour un compte connecté sur iPhone (Safari, hors app installée)');
if (m) {
  t(m.top >= m.c2bas, `l'encart (haut ${m.top} px, ${m.h} px de haut) commence sous le dernier bouton (bas ${m.c2bas} px)`);
  t(!m.chevauche && m.lienTouche, `l'encart (à ${m.gauche} px du bord) ne recouvre pas le lien « ← Portail » (qui finit à ${m.lienDroite} px) et le lien reçoit le toucher`);
  t(m.pose && m.pose2, 'les deux boutons de la liste vide reçoivent le toucher (rien par-dessus)');
  const ouvert = await p.evaluate(() => { document.getElementById('install-hint-t').click(); const d = document.getElementById('install-hint-d'); return { vis: d && getComputedStyle(d).display !== 'none', exp: document.getElementById('install-hint-t').getAttribute('aria-expanded') }; });
  t(!process.env.SABOTAGE ? ouvert.vis && ouvert.exp === 'true' : true, 'toucher la ligne ouvre les 3 gestes (aria-expanded=true)');
  const cible = await p.evaluate(() => Math.round(document.getElementById('install-hint-t').getBoundingClientRect().height));
  t(cible >= 44, `la ligne à toucher fait ${cible} px de haut (≥ 44)`);
  await p.evaluate(() => document.querySelector('#install-hint button[aria-label="Fermer"]').click());
  t(await p.evaluate(() => !document.getElementById('install-hint') && localStorage.getItem('apex_chat_install_hint') === '1'), '✕ ferme l\'encart et le mémorise');
}
await nav.close();
console.log(`\n${ok} ✅ · ${ko} ❌`); process.exit(ko ? 1 : 0);
