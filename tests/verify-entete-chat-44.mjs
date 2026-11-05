/* GARDE — LE TITRE TOUCHABLE DE L'EN-TÊTE D'UNE CONVERSATION D'APEX CHAT FAIT AU MOINS 44 PX (règle frontend, audit domaine 05.11.2026)
   Constat (robot « toutes les fonctions », run 41968885178, deux comptes connectés) : `div 182x39 « Groupe … 👥 N membres »` dans `div.chat-header`.
   Ce bloc ouvre la gestion du groupe (ou la vérification de sécurité) : c'est une commande, pas du texte.
   Vrai navigateur : une page minimale avec le CSS RÉEL de l'app et le HTML réel de l'en-tête, on mesure la hauteur du titre, à 390 et 1250 px.
   node tests/verify-entete-chat-44.mjs  ·  SABOTAGE=1 : retire la règle min-height de la copie du CSS, doit être rouge */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

let ok = 0, ko = 0;
const t = (c, m) => { if (c) { ok++; console.log('  ✅ ' + m); } else { ko++; console.log('  ❌ ' + m); } };

const src = readFileSync(new URL('../messaging-app/index.html', import.meta.url), 'utf8');
const css = src.match(/\/\* =+ Chat view =+ \*\/[\s\S]*?(?=\n\/\* =+ )/);
t(!!css, 'le bloc CSS « Chat view » est trouvé dans messaging-app/index.html');
const regle = /\.chat-header > div\[style\*="flex:1"\]\{[^}]*\}/.exec(css ? css[0] : '');
t(!!regle, 'la règle du titre touchable de l\'en-tête existe');
let styles = css ? css[0] : '';
if (process.env.SABOTAGE) styles = styles.replace(/min-height:44px;display:flex;flex-direction:column;justify-content:center/, '');

/* le HTML de l'en-tête, tel qu'il est écrit dans l'app (index.html, K.renderChat) */
const enTete = (nom, sous) => `<div class="chat-header">
  <button class="topbar-btn" aria-label="Retour">⬅</button>
  <div class="avatar">G</div>
  <div style="flex:1;min-width:0;cursor:pointer" title="Toucher pour gérer le groupe">
    <div class="chat-hname">${nom}</div>
    <div style="font-size:.68em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" id="chat-header-subtitle">${sous}</div>
  </div>
  <button class="topbar-btn hdr-opt" aria-label="Rechercher">🔎</button>
  <button class="topbar-btn" aria-label="Menu">⋯</button>
</div>`;
const page = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>:root{--ax-bg-2:#111;--ax-border:#333;--ax-ok:#0a0}body{margin:0;font-family:sans-serif;font-size:16px}
.topbar-btn{border:0;background:#222;color:#fff}.avatar{border-radius:50%;background:#555;display:flex;align-items:center;justify-content:center}
${styles}</style>
${enTete('Groupe cafh', '👥 2 membres · en ligne')}${enTete('Un nom de groupe vraiment très très long qui doit rester sur une seule ligne avec des points de suspension', '👥 12 membres')}`;

const nav = await chromium.launch();
for (const largeur of [390, 1250]) {
  const p = await nav.newPage({ viewport: { width: largeur, height: 700 } });
  await p.setContent(page);
  const m = await p.evaluate(() => [...document.querySelectorAll('.chat-header > div[style*="flex:1"]')].map((e) => {
    const r = e.getBoundingClientRect(); const nom = e.querySelector('.chat-hname'); const rn = nom.getBoundingClientRect();
    return { h: Math.round(r.height), w: Math.round(r.width), debordeNom: nom.scrollWidth > nom.clientWidth + 1 && getComputedStyle(nom).textOverflow !== 'ellipsis', nomLargeur: Math.round(rn.width) };
  }));
  m.forEach((x, i) => t(x.h >= 44, `${largeur} px, en-tête ${i + 1} : le titre touchable fait ${x.h} px de haut (≥ 44)`));
  t(m.every((x) => x.w >= 96), `${largeur} px : le titre garde au moins 96 px de large (${m.map((x) => x.w).join(' / ')})`);
  t(m.every((x) => !x.debordeNom), `${largeur} px : le nom long reste sur une ligne avec des points de suspension`);
  await p.close();
}
await nav.close();
console.log(`\n${ok} ✅ · ${ko} ❌`); process.exit(ko ? 1 : 0);
