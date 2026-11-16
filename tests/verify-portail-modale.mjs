/* GARDE — TANT QU'UNE FENÊTRE EST OUVERTE, LA PASTILLE « ← PORTAIL » NE RESTE PAS CACHÉE SOUS ELLE (Apex Chat 1.1.365, 16.11.2026)
   Constat (robot d'affichage public, pont 2538 : « a#kdmc-portal-link sous span 🔕 ← div.card-row @8,548 », le visiteur ne peut pas la faire défiler) :
   la fenêtre du menu recouvre la pastille fixe. Règle : fenêtre ouverte = pastille masquée (la fenêtre a son ✕), fermée = pastille visible.
   Vrai navigateur : la VRAIE règle CSS lue dans messaging-app/index.html, la VRAIE pastille (même id), un hôte de fenêtre comme K._showModal.
   node tests/verify-portail-modale.mjs  ·  SABOTAGE=1 : retire la règle — doit être rouge */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
let ok = 0, ko = 0;
const t = (c, m) => { if (c) { ok++; console.log('  ✅ ' + m); } else { ko++; console.log('  ❌ ' + m); } };
const src = readFileSync(new URL('../messaging-app/index.html', import.meta.url), 'utf8');
const m = src.match(/^body:has\(#modal-host \.modal-back\) #kdmc-portal-link\{[^}]*\}/m);
t(!!m, 'la règle de masquage est dans messaging-app/index.html');
const regle = process.env.SABOTAGE === '1' ? '' : (m ? m[0] : '');
const nav = await chromium.launch();
const p = await (await nav.newContext({ viewport: { width: 412, height: 915 } })).newPage();
await p.setContent(`<!doctype html><meta charset="utf-8"><style>${regle}</style><a id="kdmc-portal-link" href="#" style="position:fixed;left:8px;bottom:72px;width:80px;height:44px;z-index:150;display:inline-flex">← Portail</a><div id="modal-host"></div>`);
const vis = () => p.evaluate(() => getComputedStyle(document.getElementById('kdmc-portal-link')).display !== 'none');
t(await vis(), 'aucune fenêtre ouverte : la pastille est visible');
await p.evaluate(() => { document.getElementById('modal-host').innerHTML = '<div class="modal-back"><div class="modal">menu</div></div>'; });
t(!(await vis()), 'fenêtre ouverte : la pastille est masquée (rien n\'est recouvert)');
await p.evaluate(() => { document.getElementById('modal-host').innerHTML = ''; });
t(await vis(), 'fenêtre fermée : la pastille revient');
await nav.close();
console.log(`\n${ok} ✅ · ${ko} ❌`); process.exit(ko ? 1 : 0);
