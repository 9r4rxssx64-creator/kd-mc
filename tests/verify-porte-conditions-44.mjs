/* GARDE — LE LIEN « conditions » DE LA PORTE DU DOMAINE EST UNE CIBLE TACTILE DE 44 PX (audit domaine 05.11.2026)
   Constat (robot Apex Chat connecté, run 41968885178, comptes neufs A et B) : `a 72x17 « conditions »` dans la porte des conditions du routeur
   (services/kdmc-router/boite-bouton.js). La porte est vue une fois par compte neuf, dans TOUTES les apps : la corriger ici la corrige partout.
   Vrai navigateur : la porte est rendue par le vrai code (BOUTON_JS) avec un faux /__boite/mes ; on mesure le lien à 375 et 1250 px, on vérifie
   qu'il fait ≥ 44 px, que son clic déplie toujours le texte (comportement conservé), que la case reste alignée sur la ligne, et que la porte
   garde ses boutons ≥ 44 px.
   node tests/verify-porte-conditions-44.mjs  ·  SABOTAGE=1 : remet l'ancien style du lien · SABOTAGE=2 : remet l'ancien <a href="#"> — les deux doivent être rouges */
import { chromium } from 'playwright';
import { BOUTON_JS } from '../services/kdmc-router/boite-bouton.js';

let ok = 0, ko = 0;
const t = (c, m, d) => { if (c) { ok++; console.log('  ✅ ' + m); } else { ko++; console.log('  ❌ ' + m + (d !== undefined ? ' — ' + JSON.stringify(d) : '')); } };

const ANCIEN = "minHeight: '44px', lineHeight: '44px', background: 'none'";
t(BOUTON_JS.includes(ANCIEN) || !!process.env.SABOTAGE, 'le style du lien « conditions » est bien dans le code servi');
const SAB2 = process.env.SABOTAGE === '2';
const BOUTON = SAB2 ? BOUTON_JS.replace("E('button', 'conditions'", "E('a', 'conditions'").replace("lien.type = 'button';", "lien.href = '#';") : process.env.SABOTAGE ? BOUTON_JS.replace(ANCIEN, "background: 'none'").replace("marginTop: '10px'", "marginTop: '2px'") : BOUTON_JS;
const CGU = { requise: true, version: 3, texte: 'Un seul compte pour toutes les apps KDMC.', points: ['Localisation facultative', 'Face ID'] };

const nav = await chromium.launch(process.env.PW_EXE ? { executablePath: process.env.PW_EXE } : {});
for (const largeur of [375, 1250]) {
  const ctx = await nav.newContext({ serviceWorkers: 'block', viewport: { width: largeur, height: 812 }, isMobile: largeur < 700, hasTouch: largeur < 700 });
  await ctx.route('**/*', (r) => { const u = new URL(r.request().url());
    if (u.pathname === '/__boite/mes') return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, admin: false, connecte: true, nom: 'Jean Duponttest', cgu: CGU, messages: [] }) });
    if (u.pathname === '/') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><html><head><meta charset="utf-8"></head><body><h1>Une app du domaine</h1><script>' + BOUTON + '</script></body></html>' });
    return r.fulfill({ contentType: 'application/json', body: '{"ok":false}' }); });
  const p = await ctx.newPage(); const erreurs = []; p.on('pageerror', (e) => erreurs.push(String(e.message).slice(0, 120)));
  await p.goto('https://lingua.kd-mc.com/'); await p.waitForTimeout(700);
  const m = await p.evaluate(() => {
    const porte = document.querySelector('[aria-label="Conditions du domaine KDMC"]'); if (!porte) return null;
    const a = porte.querySelector('[data-kdmc-cgu-lien]'); const cb = porte.querySelector('input[type=checkbox]');
    const ra = a.getBoundingClientRect(), rc = cb.getBoundingClientRect();
    const cibles = [...porte.querySelectorAll('button,a[href]')].map((e) => Math.round(e.getBoundingClientRect().height));
    return { balise: a.tagName, href: a.getAttribute('href'), expanded: a.getAttribute('aria-expanded'), lienH: Math.round(ra.height), lienL: Math.round(ra.width), ecart: Math.round(Math.abs((ra.top + ra.height / 2) - (rc.top + rc.height / 2))), cibles };
  });
  t(!!m, `${largeur} px : la porte des conditions s'affiche`);
  if (m) {
    t(m.balise === 'BUTTON' && !m.href, `${largeur} px : « conditions » est un vrai bouton (balise ${m.balise}), pas un lien sans adresse (href ${m.href})`, m);
    t(m.lienH >= 44, `${largeur} px : le lien « conditions » fait ${m.lienH} px de haut (≥ 44)`, m);
    t(m.ecart <= 6, `${largeur} px : la case reste centrée sur la ligne du lien (écart ${m.ecart} px ≤ 6)`, m);
    t(m.cibles.every((h) => h >= 44), `${largeur} px : tous les boutons et liens de la porte font ≥ 44 px (${m.cibles.join('/')})`, m);
    const avant = await p.evaluate(() => { const d = [...document.querySelectorAll('[aria-label="Conditions du domaine KDMC"] div')].find((e) => /Un seul compte pour toutes/.test(e.textContent) && e.children.length === 0); return d ? getComputedStyle(d.parentElement).display : null; });
    await p.evaluate(() => document.querySelector('[data-kdmc-cgu-lien]').click());
    t(await p.evaluate(() => document.querySelector('[data-kdmc-cgu-lien]').getAttribute('aria-expanded')) === 'true', `${largeur} px : aria-expanded passe à « true » quand le texte est déplié`);
    const apres = await p.evaluate(() => { const d = [...document.querySelectorAll('[aria-label="Conditions du domaine KDMC"] div')].find((e) => /Un seul compte pour toutes/.test(e.textContent) && e.children.length === 0); return d ? getComputedStyle(d.parentElement).display : null; });
    t(avant === 'none' && apres === 'block', `${largeur} px : le clic sur « conditions » déplie toujours le texte (${avant} → ${apres})`);
  }
  t(erreurs.length === 0, `${largeur} px : aucune erreur JavaScript`, erreurs);
  await ctx.close();
}
await nav.close();
console.log(`\n${ok} ✅ · ${ko} ❌`); process.exit(ko ? 1 : 0);
