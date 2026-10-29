#!/usr/bin/env node
/* VÉRIFIER CE QUI EST VRAIMENT SERVI, MÊME DERRIÈRE LA PORTE DU DOMAINE (Kevin 25.10.2026 : « Trouve des solutions, crée, pour ne jamais être
 * bloqué comme ça » — Autorisations v1.3.3 : ma session ne pouvait pas lire la page, derrière la porte, et le Lenovo était éteint).
 *
 * Une session n'a pas le code admin ; le robot du dépôt PUBLIC l'a (secret APEX_ADMIN_PIN_SHA256, empreinte jamais écrite ni affichée) :
 * il se connecte en ADMIN comme Kevin, en LECTURE SEULE (toute requête qui écrit est bloquée), ouvre chaque adresse sur un iPhone 13
 * (moteur Safari si WEBKIT=1) et un portable, et rend des NOMBRES : version servie, haut de la page vs bouton « ← Portail », cases cachées,
 * débordement, petites cibles. AUCUN texte de page n'est imprimé (il peut contenir des noms) : balise#id.classe et nombres seulement.
 * Lancer : workflow `verifier-servi.yml` (dispatch, input `urls`), lecture : annotations « Servi N » — voir `.claude/rules/verifier-servi.md`.
 *   node tools/plateformes/verifier-servi.mjs https://autorisations.kd-mc.com/ [autre-adresse…]
 * Seules les adresses *.kd-mc.com sont ouvertes (le cookie admin ne sort jamais du domaine).
 */
import { chromium, webkit, devices } from 'playwright';
import { ECRANS, mesurer, connecterAdmin, lectureSeule } from './verif-affichage-domaine.mjs';

/* Écrans supplémentaires PROPRES À CE ROBOT (Kevin 29.10 : « portrait ET paysage sur tous les appareils, toujours » —
 * minimum iPhone 390x844 et 844x390, iPad 820x1180 et 1180x820). Définis ICI, pas ajoutés à ECRANS (partagé par
 * verif-affichage-domaine.mjs et ses propres gardes) : ne pas alourdir ni changer le comportement des autres robots. */
const ECRANS_SUPPL = [
  { nom: 'iphone-13-paysage', tel: true, ...devices['iPhone 13'], viewport: { width: 844, height: 390 } },
  { nom: 'ipad-portrait', tel: true, ...devices['iPad Mini'], viewport: { width: 820, height: 1180 } },
  { nom: 'ipad-paysage', tel: true, ...devices['iPad Mini'], viewport: { width: 1180, height: 820 } },
];
export const NOMS_ECRANS_SERVI = ['iphone-13', 'portable', 'iphone-13-paysage', 'ipad-portrait', 'ipad-paysage'];
export function trouverEcranServi(nom) { return ECRANS.find((e) => e.nom === nom) || ECRANS_SUPPL.find((e) => e.nom === nom); }

export const HOTE_PERMIS = /^(?:[a-z0-9-]+\.)*kd-mc\.com$/i;
export function adresseSure(a) {
  try { const u = new URL(/^https?:\/\//i.test(a) ? a : 'https://' + (a.includes('.') ? a : a + '.kd-mc.com') + '/'); return u.protocol === 'https:' && HOTE_PERMIS.test(u.hostname) ? u.href : null; } catch { return null; }
}

/* Exécuté DANS la page : jamais de texte de page, des sélecteurs courts et des nombres. */
export function mesurerServi() {
  const sel = (e) => (e.tagName || '').toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/)[0] : '');
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05; };
  /* la pastille « ← Portail » du routeur (ou de la page) : fixe, en haut à gauche, lien vers le portail */
  const pastille = [...document.querySelectorAll('a[data-kdmc-pastille], a[href="https://kd-mc.com/"], a[href="https://kd-mc.com"]')].find((e) => vis(e) && getComputedStyle(e).position === 'fixed');
  const pb = pastille ? pastille.getBoundingClientRect() : null;
  let premier = null;
  for (const e of document.querySelectorAll('body *')) {
    if (e === pastille || (pastille && pastille.contains(e)) || e.children.length || !(e.textContent || '').trim() || !vis(e)) continue;
    if (/^(script|style|noscript)$/i.test(e.tagName)) continue;
    const st = getComputedStyle(e); if (st.position === 'fixed' || (e.closest && e.closest('[data-kdmc-pastille]'))) continue;
    const r = e.getBoundingClientRect(); if (r.bottom <= 0) continue;
    if (!premier || r.top < premier.top) premier = { top: Math.round(r.top), gauche: Math.round(r.left), droite: Math.round(r.right), s: sel(e) };
  }
  /* versions : jamais un texte libre, seulement ce qui ressemble à « v1.2.3 » */
  const motV = /^v\d+(?:\.\d+)+$/i;
  const badges = [...document.querySelectorAll('body *')].filter((e) => !e.children.length && motV.test((e.textContent || '').trim())).map((e) => (e.textContent || '').trim()).slice(0, 3);
  /* le plus large élément qui dépasse l'écran (débordement horizontal) : sélecteur + nombres, jamais de texte.
     29.10 : un élément contenu par un parent qui coupe ou fait défiler (grille dans .scroll) ne fait pas déborder la page : ignoré. */
  const L = document.documentElement.clientWidth; let deb = null;
  const contenu = (e) => { for (let a = e.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) if (getComputedStyle(a).overflowX !== 'visible') return true; return false; };
  for (const e of document.querySelectorAll('body *')) {
    const r = e.getBoundingClientRect(); if (r.width < 2 || r.right <= L + 1 || !vis(e)) continue;
    const st = getComputedStyle(e); if (st.position === 'fixed' || contenu(e)) continue;
    if (!deb || r.right > deb.droite) deb = { s: sel(e), droite: Math.round(r.right), largeur: Math.round(r.width), parent: e.parentElement ? sel(e.parentElement) : '' };
  }
  return {
    debordeur: deb,
    appVer: document.documentElement.getAttribute('data-app-ver') || '',
    badges,
    pastilleBas: pb ? Math.round(pb.bottom) : null,
    premier,
    sousPastille: !!(pb && premier && premier.top < pb.bottom && premier.gauche < pb.right && premier.droite > pb.left),
    largeurDoc: document.documentElement.scrollWidth, largeurEcran: document.documentElement.clientWidth,
  };
}

async function versionSw(page) {
  return page.evaluate(async () => {
    try { const t = await (await fetch('/sw.js', { cache: 'no-store' })).text(); const m = t.match(/CACHE_VERSION\s*=\s*['"]([^'"]{1,40})['"]/); return m ? m[1] : (t.length ? 'sans CACHE_VERSION' : 'vide'); } catch { return 'illisible'; }
  });
}

export async function verifierServi({ adresses, hash = '', journal = console.log }) {
  const b = await chromium.launch({ headless: true });
  const bw = process.env.WEBKIT === '1' ? await webkit.launch({ headless: true }).catch(() => null) : null;
  const sortie = [];
  try {
    /* SERVI_ECRANS=portable,iphone-13 : ne lire que certains écrans (mesure de masse, ex. la version de Bee sur les 33 adresses) ; vide = les 5 écrans */
    const voulus = String(process.env.SERVI_ECRANS || '').split(',').map((x) => x.trim()).filter(Boolean);
    for (const nom of NOMS_ECRANS_SERVI.filter((n) => !voulus.length || voulus.includes(n))) {
      const ec = trouverEcranServi(nom); const { nom: _n, tel, explorer: _e, ...opts } = ec; delete opts.defaultBrowserType;
      const moteur = bw && nom === 'iphone-13' ? bw : b;
      const ctx = await moteur.newContext({ ...opts }); await lectureSeule(ctx);
      const page = await ctx.newPage();
      let admin = false;
      if (hash) admin = !!(await connecterAdmin(page, hash).catch(() => ({ ok: false }))).ok;
      journal(`=== ${nom} [${moteur === bw ? 'webkit' : 'chromium'}] (${opts.viewport.width}×${opts.viewport.height}) — connexion admin : ${admin ? 'oui' : 'NON'}`);
      for (const a of adresses) {
        const r = { adresse: a, ecran: nom, admin };
        try {
          const rep = await page.goto(a, { waitUntil: 'load', timeout: 30000 });
          r.statut = rep ? rep.status() : 0; r.hoteFinal = new URL(page.url()).hostname;
          await page.waitForTimeout(4500); await page.evaluate(() => window.scrollTo(0, 0));
          r.sw = await versionSw(page);
          Object.assign(r, await page.evaluate(mesurerServi));
          /* BEE (Kevin 29.10 : « Javis n'est pas à jour de partout ») : la version qui tourne VRAIMENT, sur la page (app qui porte Bee) et dans le cadre posé par le routeur */
          r.beePage = await page.evaluate(() => String(window.JAVIS_VER || '')).catch(() => '');
          const cadre = page.frames().find((f) => /\/__javis\/cadre/.test(f.url()));
          r.beeCadre = cadre ? await cadre.evaluate(() => String(window.JAVIS_VER || '')).catch(() => '?') : '';
          const m = await page.evaluate(mesurer, tel).catch(() => null);
          if (m) Object.assign(r, { cache: m.cache, haut: m.haut, deborde: m.deborde, petit: m.petit, js: m.js });
        } catch (e) { r.err = String(e && e.message).split('\n')[0].slice(0, 90); }
        sortie.push(r);
        journal(`${r.err ? '❌' : r.sousPastille ? '❌' : '✅'} ${a} · ${nom} · HTTP ${r.statut ?? '?'} · hôte ${r.hoteFinal ?? '?'} · sw ${r.sw ?? '?'} · app ${r.appVer || '-'} · bee page ${r.beePage || '-'} cadre ${r.beeCadre === '' ? '-' : r.beeCadre} · badge ${(r.badges || []).join('/') || '-'} · pastille bas ${r.pastilleBas ?? '-'} · 1er texte ${r.premier ? r.premier.top + ' ' + r.premier.s : '-'} · sous pastille ${r.sousPastille ? 'OUI' : 'non'} · cache ${r.cache ?? '-'} · haut ${r.haut ?? '-'} · déborde ${r.deborde ?? '-'}${r.debordeur ? ' [' + r.debordeur.s + ' droite ' + r.debordeur.droite + ' / écran ' + r.largeurEcran + ' · largeur ' + r.debordeur.largeur + ' · parent ' + r.debordeur.parent + ']' : ''} · petit ${r.petit ?? '-'}${r.err ? ' · ' + r.err : ''}`);
      }
      await ctx.close();
    }
  } finally { await b.close(); if (bw) await bw.close(); }
  return sortie;
}

if (process.argv[1] && /(^|[\\/])verifier-servi\.mjs$/.test(process.argv[1])) {
  const brut = process.argv.slice(2);
  const adresses = brut.map(adresseSure).filter(Boolean);
  const refus = brut.filter((a) => !adresseSure(a));
  if (refus.length) console.log(`⚠️ ${refus.length} adresse(s) refusée(s) : seules les adresses *.kd-mc.com sont ouvertes`);
  if (!adresses.length) { console.error('Aucune adresse *.kd-mc.com à vérifier'); process.exit(2); }
  const res = await verifierServi({ adresses, hash: process.env.KDMC_ADMIN_PIN_SHA256 || '' });
  const ko = res.filter((r) => r.err || r.sousPastille).length;
  console.log(`\n=== BILAN SERVI : ${res.length} page(s) lue(s), ${ko} à corriger ===`);
  process.exit(0);
}
