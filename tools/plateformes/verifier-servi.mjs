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
import { ECRANS, mesurer, connecterAdmin, lectureSeule, fermerFeuilleInstalleur } from './verif-affichage-domaine.mjs';
export { fermerFeuilleInstalleur };
/** 6.11 (apex-cloud, Servi 42313704615 : Apex AI iphone-13 et portable « cache 26-27 », installeur « non ») : la feuille « 📲 Installer » du domaine s'ouvre
 *  d'elle-même pour un compte connecté sur un appareil neuf, 1,5 s APRÈS que le domaine a répondu — parfois après les deux fermetures du robot. Elle couvre alors
 *  toute la page, et le robot comptait 27 boutons « cachés » qui ne le sont pas. On ferme, on mesure, on referme : si elle s'est ouverte pendant la mesure, on remesure
 *  (jusqu'à 3 fois). Un bouton réellement recouvert par autre chose reste signalé. */
export async function mesurerSansFeuille(page, tel, r = {}) {
  let m = null;
  for (let i = 0; i < 3; i++) {
    if (await page.evaluate(fermerFeuilleInstalleur).catch(() => false)) { r.installeur = true; await page.waitForTimeout(400); }
    m = await page.evaluate(mesurer, tel).catch(() => null);
    if (!(await page.evaluate(fermerFeuilleInstalleur).catch(() => false))) return m;
    r.installeur = true; await page.waitForTimeout(400);
  }
  return m;
}
/** Retire tout texte de page (entre guillemets) d'un exemple de recouvrement : il ne reste que sélecteurs, position et z-index. */
export const sansTexte = (ex) => (Array.isArray(ex) ? ex : []).map((x) => String(x).replace(/"[^"]*"/g, '…').slice(0, 160));
/** Une page à corriger : erreur, titre sous la pastille, OU un bouton dont le centre est recouvert par un autre élément. */
export const aCorriger = (r) => !!(r.err || r.sousPastille || (process.env.SABOTAGE !== 'cache' && r.cache > 0) || (process.env.SABOTAGE !== 'double' && r.badgesVisibles > 1));

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
/* 6.11 (Kevin : « creuse toujours ») : la fluidité. Studio tournait à 1,6 image/s dans le Chrome du Lenovo, corps vide compris : le fil principal est
   saturé par un script. Servi compte les images par seconde (rAF, 2 s) et NOMME les scripts qui bloquent le plus (long-animation-frame : fin de chemin du
   fichier seulement, jamais de texte de page ni de paramètres). Mesure d'abord, pas encore un défaut (processeur sans carte graphique = moins que le vrai). */
export async function mesurerFluidite() {
  const bloque = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) for (const s of (e.scripts || [])) bloque.push({ f: String(s.sourceURL || s.invoker || '?').split('?')[0].split('/').slice(-2).join('/'), d: Math.round(s.duration) }); }).observe({ type: 'long-animation-frame', buffered: true }); } catch (e) { /* navigateur sans cette mesure */ }
  let n = 0; const t = performance.now();
  await new Promise((r) => { (function f() { n++; performance.now() - t < 2000 ? requestAnimationFrame(f) : r(); })(); });
  const parFichier = {}; for (const b of bloque) parFichier[b.f] = (parFichier[b.f] || 0) + b.d;
  return { fps: +(n / 2).toFixed(1), bloque: Object.entries(parFichier).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([f, d]) => f + ':' + d + 'ms') };
}

export function mesurerServi() {
  const sel = (e) => (e.tagName || '').toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/)[0] : '');
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05; };
  /* 4.11 (pont 1639, javis.kd-mc.com : « 1er texte div.javis-bub y=-187 sous la pastille OUI ») : un texte qui a défilé HORS de sa zone (liste de chat dans un
     parent à overflow auto/hidden) est coupé par cette zone : on ne voit que la part restée dans la zone. On mesure donc le rectangle VISIBLE
     (rectangle du texte ∩ rectangle de chaque parent qui coupe) ; rien de visible (null) = le texte n'est pas à l'écran, il ne peut pas être sous la pastille. */
  const visibleRect = (e) => {
    const r = e.getBoundingClientRect(); let h = r.top, b = r.bottom, g = r.left, d = r.right;
    for (let a = e.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
      const st = getComputedStyle(a), cx = st.overflowX !== 'visible', cy = st.overflowY !== 'visible';
      if (!cx && !cy) continue;
      const ar = a.getBoundingClientRect();
      if (cy) { h = Math.max(h, ar.top); b = Math.min(b, ar.bottom); }
      if (cx) { g = Math.max(g, ar.left); d = Math.min(d, ar.right); }
    }
    return b - h > 1 && d - g > 1 ? { top: h, bottom: b, left: g, right: d } : null;
  };
  /* la pastille « ← Portail » du routeur (ou de la page) : fixe, en haut à gauche, lien vers le portail */
  const pastille = [...document.querySelectorAll('a[data-kdmc-pastille], a[href="https://kd-mc.com/"], a[href="https://kd-mc.com"]')].find((e) => vis(e) && getComputedStyle(e).position === 'fixed');
  const pb = pastille ? pastille.getBoundingClientRect() : null;
  let premier = null;
  for (const e of document.querySelectorAll('body *')) {
    if (e === pastille || (pastille && pastille.contains(e)) || e.children.length || !(e.textContent || '').trim() || !vis(e)) continue;
    if (/^(script|style|noscript)$/i.test(e.tagName)) continue;
    const st = getComputedStyle(e); if (st.position === 'fixed' || (e.closest && e.closest('[data-kdmc-pastille]'))) continue;
    const r = visibleRect(e); if (!r || r.bottom <= 0) continue;
    if (!premier || r.top < premier.top) premier = { top: Math.round(r.top), gauche: Math.round(r.left), droite: Math.round(r.right), s: sel(e) };
  }
  /* versions : jamais un texte libre, seulement ce qui ressemble à « v1.2.3 » */
  const motV = /^v\d+(?:\.\d+)+$/i;
  const badges = [...document.querySelectorAll('body *')].filter((e) => !e.children.length && motV.test((e.textContent || '').trim())).map((e) => (e.textContent || '').trim()).slice(0, 3);
  /* 6.11 (Studio : « v9.22.11 » DEUX FOIS l'une sur l'autre) : `badges` compte aussi une pastille cachée (display:none) ; ce qui fait le défaut,
     c'est le nombre de pastilles réellement VISIBLES. On le mesure (nombre seulement) et on note l'id de celles qui se voient. */
  const versionVisible = (e) => { for (let a = e; a && a !== document.documentElement; a = a.parentElement) { const st = getComputedStyle(a); if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) === 0) return false; } const r = e.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0)) return false;
    /* 6.11 soir (ia 1280×720, run 42312947970 : « visibles 2 » alors qu'une seule se voyait) : la bulle de l'app vivait dans le pied de page, 3 700 px SOUS l'écran ;
       le module affichait la sienne à bon droit. Hors de l'écran = pas visible (même règle que le module : `elementFromPoint` nul). */
    return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };
  /* une pastille recouverte par un AUTRE élément (bouton, barre) ne se voit pas : on ne la compte pas ; recouverte par une autre pastille de version, si (c'est le défaut) */
  const decouverte = (e) => { const h = e.closest('#kdmc-version-badge, #vbadge, #ver, [data-own-badge]') || e; const pe = h.style.pointerEvents; h.style.pointerEvents = 'auto'; const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); h.style.pointerEvents = pe; return !t || h.contains(t) || t.contains(e) || !!t.closest('#kdmc-version-badge') || motV.test((t.textContent || '').trim()); };
  const pastillesVisibles = [...document.querySelectorAll('body *')].filter((e) => !e.children.length && motV.test((e.textContent || '').trim()) && versionVisible(e) && decouverte(e));
  const badgesVisibles = pastillesVisibles.length;
  const badgesVisiblesQui = pastillesVisibles.slice(0, 3).map((e) => (e.closest('#kdmc-version-badge') ? 'module' : (e.id ? '#' + e.id : e.tagName.toLowerCase())));
  /* qui recouvre chaque pastille visible (même mesure que le module : bulle interrogeable le temps de la mesure) — pour savoir POURQUOI le module ne se cache pas */
  const modB = document.getElementById('kdmc-version-badge'); const modD = modB ? modB.style.display : ''; if (modB) modB.style.display = 'none';   /* sans la bulle du module : qui recouvre la bulle de l'app ? */
  const badgesDessus = pastillesVisibles.slice(0, 3).map((e) => { const h = e.closest('#vbadge, #ver, [data-own-badge]') || e; const pe = h.style.pointerEvents; h.style.pointerEvents = 'auto'; const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); h.style.pointerEvents = pe; return t ? sel(t) + '@' + Math.round(r.left) + ',' + Math.round(r.top) : '-'; });
  if (modB) modB.style.display = modD;
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
    badges, badgesVisibles, badgesVisiblesQui, badgesDessus,
    pastilleBas: pb ? Math.round(pb.bottom) : null,
    premier,
    sousPastille: !!(pb && premier && premier.top < pb.bottom && premier.gauche < pb.right && premier.droite > pb.left),
    largeurDoc: document.documentElement.scrollWidth, largeurEcran: document.documentElement.clientWidth,
  };
}

/* 6.11 (tâche 108, Kevin « pousse le reste ») : Servi disait « sw vide » ou « sans CACHE_VERSION » sur 16 hôtes alors que 6 d'entre eux
 * servaient un worker complet (variable `CACHE`, pas `CACHE_VERSION`) et que les autres sont des pages SANS cache hors ligne (relues à chaque
 * ouverture, mise à jour forcée par le module de pastille) ou servent la PORTE à la place de /sw.js (zones admin). Un robot qui compte sans
 * nommer se corrige (leçon 858) : il lit maintenant CACHE_VERSION / CACHE_NAME / CACHE / VERSION, reconnaît une page HTML, et demande au
 * navigateur si un worker est VRAIMENT enregistré. Ce qui s'affiche : « <version> » · « aucun » (pas de worker : page sans cache hors ligne)
 * · « enregistré, version non lue » · « enregistré, /sw.js derrière la porte » · « illisible » (erreur). SABOTAGE=sw : l'ancienne lecture → rouge. */
export function lireVersionSw(b) {
  if (!b || b.erreur) return 'illisible';
  const texte = String(b.texte || '');
  const html = /text\/html/i.test(String(b.type || '')) || /^\s*<!doctype|^\s*<html/i.test(texte.slice(0, 200));
  const re = process.env.SABOTAGE === 'sw' ? /CACHE_VERSION\s*=\s*['"]([^'"]{1,40})['"]/ : /\b(?:CACHE_VERSION|CACHE_NAME|CACHE|VERSION)\s*=\s*['"]([^'"]{1,40})['"]/;
  const m = html ? null : texte.match(re);
  if (m) return m[1] + (b.enregistre === false ? ' (fichier présent, non enregistré)' : '');
  if (b.enregistre === false) return 'aucun';
  if (html) return b.enregistre ? 'enregistré, /sw.js derrière la porte' : 'aucun';
  if (b.statut === 404 || !texte.length) return b.enregistre ? 'enregistré, fichier absent' : 'aucun';
  return b.enregistre ? 'enregistré, version non lue' : 'aucun';
}
async function versionSw(page) {
  const brut = await page.evaluate(async () => {
    const out = { texte: '', type: '', statut: 0, enregistre: null };
    try { const rep = await fetch('/sw.js', { cache: 'no-store' }); out.statut = rep.status; out.type = rep.headers.get('content-type') || ''; out.texte = (await rep.text()).slice(0, 20000); } catch { out.erreur = true; }
    try { if ('serviceWorker' in navigator) out.enregistre = !!(await navigator.serviceWorker.getRegistration()); } catch { /* navigateur sans worker : on garde null */ }
    return out;
  }).catch(() => ({ erreur: true }));
  return lireVersionSw(brut);
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
          r.installeur = await page.evaluate(fermerFeuilleInstalleur).catch(() => false);
          /* 6.11 : la pastille du module se retire au plus 1,5 s après la fermeture de la feuille d'installation (suivi toutes les 1,5 s) ; mesurer avant comptait « 2 pastilles » à tort sur Studio */
          if (r.installeur) await page.waitForTimeout(1800);
          r.sw = await versionSw(page);
          Object.assign(r, await page.evaluate(mesurerServi));
          /* BEE (Kevin 29.10 : « Javis n'est pas à jour de partout ») : la version qui tourne VRAIMENT, sur la page (app qui porte Bee) et dans le cadre posé par le routeur */
          r.beePage = await page.evaluate(() => String(window.JAVIS_VER || '')).catch(() => '');
          const cadre = page.frames().find((f) => /\/__javis\/cadre/.test(f.url()));
          r.beeCadre = cadre ? await cadre.evaluate(() => String(window.JAVIS_VER || '')).catch(() => '?') : '';
          if (await page.evaluate(fermerFeuilleInstalleur).catch(() => false)) { r.installeur = true; await page.waitForTimeout(300); }   /* la feuille peut s'ouvrir APRÈS la 1re fermeture (iPhone paysage, 6.11) */
          Object.assign(r, await page.evaluate(mesurerFluidite).catch(() => ({})));
          const m = await mesurerSansFeuille(page, tel, r);
          /* 6.11 (Kevin : « creuse toujours pour savoir ») : Servi comptait « cache 4 » sur kit.kd-mc.com sans dire QUI cache QUOI, et ne le comptait pas
             « à corriger ». Il nomme maintenant les boutons recouverts et ce qui les recouvre — sélecteurs seulement, le texte entre guillemets est retiré
             (dépôt public) — et un bouton recouvert compte comme un défaut. */
          if (m) Object.assign(r, { cache: m.cache, cacheEx: sansTexte(m.cacheEx), haut: m.haut, deborde: m.deborde, petit: m.petit, js: m.js });
        } catch (e) { r.err = String(e && e.message).split('\n')[0].slice(0, 90); }
        sortie.push(r);
        journal(`${aCorriger(r) ? '❌' : '✅'} ${a} · ${nom} · HTTP ${r.statut ?? '?'} · hôte ${r.hoteFinal ?? '?'} · sw ${r.sw ?? '?'} · app ${r.appVer || '-'} · bee page ${r.beePage || '-'} cadre ${r.beeCadre === '' ? '-' : r.beeCadre} · badge ${(r.badges || []).join('/') || '-'} visibles ${r.badgesVisibles ?? '-'}${r.badgesVisibles > 1 ? ' [' + (r.badgesVisiblesQui || []).join(' + ') + ' dessus ' + (r.badgesDessus || []).join(' | ') + ']' : ''} · pastille bas ${r.pastilleBas ?? '-'} · 1er texte ${r.premier ? r.premier.top + ' ' + r.premier.s : '-'} · sous pastille ${r.sousPastille ? 'OUI' : 'non'} · installeur ${r.installeur ? 'fermé' : 'non'} · cache ${r.cache ?? '-'}${r.cache && r.cacheEx && r.cacheEx.length ? ' [' + r.cacheEx.join(' | ') + ']' : ''} · haut ${r.haut ?? '-'} · déborde ${r.deborde ?? '-'}${r.debordeur ? ' [' + r.debordeur.s + ' droite ' + r.debordeur.droite + ' / écran ' + r.largeurEcran + ' · largeur ' + r.debordeur.largeur + ' · parent ' + r.debordeur.parent + ']' : ''} · petit ${r.petit ?? '-'} · fluidité ${r.fps ?? '-'} i/s${r.fps < 30 && r.bloque && r.bloque.length ? ' [bloque ' + r.bloque.join(' | ') + ']' : ''}${r.err ? ' · ' + r.err : ''}`);
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
  const ko = res.filter(aCorriger).length;
  console.log(`\n=== BILAN SERVI : ${res.length} page(s) lue(s), ${ko} à corriger ===`);
  process.exit(0);
}
