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
import { ECRANS, mesurer, connecterAdmin, lectureSeule, fermerFeuilleInstalleur, fermerAccueil } from './verif-affichage-domaine.mjs';
export { fermerFeuilleInstalleur, fermerAccueil };   /* 16.11 : fermerAccueil vit avec le détecteur, les DEUX robots ferment l'accueil avant de mesurer */
/** 6.11 (apex-cloud, Servi 42313704615 : Apex AI iphone-13 et portable « cache 26-27 », installeur « non ») : la feuille « 📲 Installer » du domaine s'ouvre
 *  d'elle-même pour un compte connecté sur un appareil neuf, 1,5 s APRÈS que le domaine a répondu — parfois après les deux fermetures du robot. Elle couvre alors
 *  toute la page, et le robot comptait 27 boutons « cachés » qui ne le sont pas. On ferme, on mesure, on referme : si elle s'est ouverte pendant la mesure, on remesure
 *  (jusqu'à 3 fois). Un bouton réellement recouvert par autre chose reste signalé. */
export async function mesurerSansFeuille(page, tel, r = {}) {
  let m = null;
  /* 8.11 (CMCteams : la bannière cookies arrive à DOMContentLoaded + 3 s, APRÈS la première fermeture du robot) : accueil et bannière de consentement
     suivent la même règle que la feuille Installer : fermés avant la mesure, et si l'un s'ouvre pendant la mesure, refermé puis la page remesurée. */
  const fermer = async () => {
    let ferme = false;
    if (await page.evaluate(fermerFeuilleInstalleur).catch(() => false)) { r.installeur = true; ferme = true; }
    const acc = await page.evaluate(fermerAccueil).catch(() => ''); if (acc) { r.accueil = r.accueil && r.accueil !== acc ? r.accueil + ' + ' + acc : acc; ferme = true; }
    if (ferme) await page.waitForTimeout(400);
    return ferme;
  };
  for (let i = 0; i < 3; i++) {
    await fermer();
    m = await page.evaluate(mesurer, tel).catch(() => null);
    if (!(await fermer())) return m;
  }
  return m;
}
/** 7.11 (apex-cloud, Servi 42361880522 / 42355883096 : Apex AI « 1er texte div.apex-splash-logo », pastille absente, 17 i/s) : à 4,5 s l'écran de démarrage de l'app est parfois encore là,
 *  et le robot mesurait ce démarrage au lieu de l'app. On attend sa disparition (15 s de plus au plus) et on RAPPORTE le temps : `n` secondes après les 4,5 s, 0 si déjà parti,
 *  null si la page n'en a pas, « toujours » s'il est encore là au bout. Un écran de démarrage qui dure 20 s est un défaut de l'app, pas du robot. */
export async function attendreFinSplash(page, maxMs = 15000) {
  const present = () => page.evaluate(() => { const e = document.querySelector('[class*="splash"], [id*="splash"]'); if (!e) return false; const r = e.getBoundingClientRect(), c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.visibility !== 'hidden' && c.display !== 'none' && Number(c.opacity) > 0.05; }).catch(() => false);
  if (!(await present())) return null;
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) { await page.waitForTimeout(500); if (!(await present())) return Math.round((Date.now() - t0) / 100) / 10; }
  return 'toujours';
}
/** Les écrans d'ADMINISTRATION d'Apex Chat (7.11, tâche 97 : « écrans admin non mesurés — les comptes de test ne sont pas admin »). Servi est connecté en admin du domaine, donc en admin d'Apex Chat :
 *  on affiche chaque vue (K.sv, lecture seule : le robot bloque toute requête qui écrit, on ne clique rien) et on la mesure comme une page. `{ admin: false }` si le compte n'est pas admin. */
export const VUES_ADMIN_APEX_CHAT = ['admin', 'admin-diag', 'admin-users', 'admin-connections', 'admin-toggles', 'admin-sentinels', 'admin-audit', 'admin-invite-book', 'admin-trusted-circle', 'admin-search', 'admin-timeline', 'admin-map', 'admin-premium'];
export async function mesurerVuesAdminApexChat(page, tel, vues = VUES_ADMIN_APEX_CHAT, attenteMs = 900) {
  /* 7.11 (Servi 42368800591 : « rôle inconnu ») : Apex Chat n'a pas de `K.user.role` — l'admin est `K.user.is_admin === true` (index.html l.1752, posé par le SERVEUR). */
  const etat = await page.evaluate(() => ({ k: typeof window.K, user: !!(window.K && K.user), admin: !!(window.K && K.user && (K.user.is_admin === true || K.user.role === 'admin')), vue: (window.K && K.view) || null, etape: (window.K && K.authStep) || null })).catch(() => ({ k: 'illisible' }));
  const role = etat.admin ? 'admin' : (etat.user ? 'utilisateur' : etat.k === 'object' ? 'sans compte (étape ' + (etat.etape || '?') + ')' : 'application absente');
  if (!etat.admin) return { admin: false, role, vues: [] };
  const sortie = [];
  for (const v of vues) {
    const rep = { vue: v };
    try {
      await page.evaluate((nom) => { K.sv(nom); }, v); await page.waitForTimeout(attenteMs);
      rep.affichee = (await page.evaluate(() => (window.K && K.view) || '').catch(() => '')) === v;
      const m = await mesurerSansFeuille(page, tel, rep);
      if (m) Object.assign(rep, { cache: m.cache, cacheEx: sansTexte(m.cacheEx), petit: m.petit, petitEx: sansTexte(m.petitEx || []), deborde: m.deborde, js: m.js });
    } catch (e) { rep.err = String(e && e.message).split('\n')[0].slice(0, 80); }
    sortie.push(rep);
  }
  return { admin: true, role, vues: sortie };
}
export const vueAdminACorriger = (x) => !!(x.err || x.affichee === false || x.cache > 0 || x.deborde > 0 || x.petit > 0);
/** 7.11 (apex-cloud, Servi 42361310862 / 42373432923) : un « page.goto Timeout 30000ms » tombait sur des requêtes DIFFÉRENTES à chaque fois (Apex AI deux écrans paysage ; apex-chat.kd-mc.com/ lui-même ;
 *  javis.kd-mc.com/javis-widget.js à 29 s) — des blocages ponctuels, pas un défaut d'une page. On rouvre UNE fois : si la 2ᵉ ouverture réussit, la mesure est faite et le relevé écrit « reprise après délai »
 *  avec les requêtes qui bloquaient ; si elle échoue aussi, c'est un défaut rapporté comme avant. */
export async function ouvrirAvecReprise(page, adresse, r = {}, enCours = new Map(), ouvrir = (u) => page.goto(u, { waitUntil: 'load', timeout: 30000 })) {
  try { return await ouvrir(adresse); }
  catch (e) {
    if (!/Timeout/i.test(String(e && e.message))) throw e;
    r.reprise = 'reprise après délai' + enAttente(enCours);
    enCours.clear();
    return await ouvrir(adresse);
  }
}
/** Requêtes restées sans réponse (hôte + chemin, sans paramètres), les plus anciennes d'abord — pour expliquer un délai dépassé. */
export function enAttente(enCours, maintenant = Date.now()) {
  const l = [...enCours.entries()].sort((x, y) => x[1] - y[1]).slice(0, 5).map(([q, t]) => { let u; try { u = new URL(q.url()); } catch { return '?'; } return `${u.hostname}${u.pathname.slice(0, 50)} ${Math.round((maintenant - t) / 1000)}s`; });
  return l.length ? ' · en attente : ' + l.join(' | ') : ' · aucune requête en attente';
}
/** Retire tout texte de page (entre guillemets) d'un exemple de recouvrement : il ne reste que sélecteurs, position et z-index. */
export const sansTexte = (ex) => (Array.isArray(ex) ? ex : []).map((x) => String(x).replace(/"[^"]*"/g, '…').slice(0, 240));
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
  /* 7.11 (arbre : l'écran du code écrit « Arbre v3.200 » dans #gateVer, le robot disait « visibles 0 ») : un mot court devant le numéro (« Arbre », « Version ») reste une pastille. */
  /* 8.11 (javis : la pastille propre dit « Bee v1.36 ↻ », le robot lisait « visibles 0 ») : un court symbole après le numéro (↻, ✨, ·) reste une pastille. */
  const motV = /^(?:\p{L}{1,12}\s+)?(v\d+(?:\.\d+)+)(?:\s*[^\p{L}\p{N}\s]{1,3})?$/iu;
  /* 7.11 (arbre connecté admin : la pastille #ver dit « v3.200 · 411 pers. », le robot lisait « visibles 0 ») : une pastille FIXE peut porter un court complément après le numéro. */
  const motVSuffixe = /^(v\d+(?:\.\d+)+)\s*[·|—–-]\s*.{1,24}$/i;
  const estPastille = (e) => { const t = (e.textContent || '').trim(); if (motV.test(t)) return true; return motVSuffixe.test(t) && getComputedStyle(e).position === 'fixed'; };
  const numV = (e) => { const t = (e.textContent || '').trim(); return (t.match(motV) || t.match(motVSuffixe) || [])[1] || ''; };
  const badges = [...document.querySelectorAll('body *')].filter((e) => !e.children.length && estPastille(e)).map(numV).slice(0, 3);
  /* 6.11 (Studio : « v9.22.11 » DEUX FOIS l'une sur l'autre) : `badges` compte aussi une pastille cachée (display:none) ; ce qui fait le défaut,
     c'est le nombre de pastilles réellement VISIBLES. On le mesure (nombre seulement) et on note l'id de celles qui se voient. */
  const versionVisible = (e) => { for (let a = e; a && a !== document.documentElement; a = a.parentElement) { const st = getComputedStyle(a); if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) === 0) return false; } const r = e.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0)) return false;
    /* 6.11 soir (ia 1280×720, run 42312947970 : « visibles 2 » alors qu'une seule se voyait) : la bulle de l'app vivait dans le pied de page, 3 700 px SOUS l'écran ;
       le module affichait la sienne à bon droit. Hors de l'écran = pas visible (même règle que le module : `elementFromPoint` nul). */
    return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };
  /* une pastille recouverte par un AUTRE élément (bouton, barre) ne se voit pas : on ne la compte pas ; recouverte par une autre pastille de version, si (c'est le défaut) */
  const decouverte = (e) => { const h = e.closest('#kdmc-version-badge, #vbadge, #ver, [data-own-badge]') || e; const pe = h.style.pointerEvents; h.style.pointerEvents = 'auto'; const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); h.style.pointerEvents = pe; return !t || h.contains(t) || t.contains(e) || !!t.closest('#kdmc-version-badge') || estPastille(t); };
  const pastillesVisibles = [...document.querySelectorAll('body *')].filter((e) => !e.children.length && estPastille(e) && versionVisible(e) && decouverte(e));
  const badgesVisibles = pastillesVisibles.length;
  /* 7.11 (arbre : « badge v3.200/v3.200 visibles 0 », sans dire pourquoi) : quand il y a des textes de version et qu'aucun ne se voit, le robot NOMME la cause de chacun
     (caché par quel ancêtre, hors de l'écran, ou recouvert par qui) : un « 0 » sans cause ne se corrige pas (leçons 871, 878). */
  const badgesCaches = badgesVisibles ? [] : [...document.querySelectorAll('body *')].filter((e) => !e.children.length && estPastille(e)).slice(0, 3).map((e) => {
    const qui = e.id ? '#' + e.id : sel(e);
    for (let a = e; a && a !== document.documentElement; a = a.parentElement) { const st = getComputedStyle(a); const k = st.display === 'none' ? 'display none' : st.visibility === 'hidden' ? 'visibility hidden' : parseFloat(st.opacity) === 0 ? 'opacity 0' : ''; if (k) return qui + ' : ' + (a === e ? 'lui-même' : sel(a)) + ' ' + k; }
    const r = e.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0)) return qui + ' : taille 0';
    if (!(r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth)) return qui + ' : hors écran @' + Math.round(r.left) + ',' + Math.round(r.top);
    const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return qui + ' : sous ' + (t ? sel(t) : '?');
  });
  const badgesVisiblesQui = pastillesVisibles.slice(0, 3).map((e) => (e.closest('#kdmc-version-badge') ? 'module' : (e.id ? '#' + e.id : e.tagName.toLowerCase())));
  /* qui recouvre chaque pastille visible (même mesure que le module : bulle interrogeable le temps de la mesure) — pour savoir POURQUOI le module ne se cache pas */
  const modB = document.getElementById('kdmc-version-badge'); const modD = modB ? modB.style.display : ''; if (modB) modB.style.display = 'none';   /* sans la bulle du module : qui recouvre la bulle de l'app ? */
  const badgesDessus = pastillesVisibles.slice(0, 3).map((e) => { const h = e.closest('#vbadge, #ver, [data-own-badge]') || e; const pe = h.style.pointerEvents; h.style.pointerEvents = 'auto'; const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); h.style.pointerEvents = pe; return t ? sel(t) + '@' + Math.round(r.left) + ',' + Math.round(r.top) : '-'; });
  if (modB) modB.style.display = modD;
  /* le plus large élément qui dépasse l'écran (débordement horizontal) : sélecteur + nombres, jamais de texte.
     29.10 : un élément contenu par un parent qui coupe ou fait défiler (grille dans .scroll) ne fait pas déborder la page : ignoré. */
  const L = document.documentElement.clientWidth; let deb = null;
  /* 7.11 (arbre : « déborde 0 [b droite 509 / écran 390 · parent div#aura] ») : si le corps ou la racine coupe le débordement (overflow-x hidden), rien ne dépasse à l'écran : personne n'est nommé. */
  const contenu = (e) => { for (let a = e.parentElement; a; a = a.parentElement) if (getComputedStyle(a).overflowX !== 'visible') return true; return false; };
  for (const e of document.querySelectorAll('body *')) {
    const r = e.getBoundingClientRect(); if (r.width < 2 || r.right <= L + 1 || !vis(e)) continue;
    const st = getComputedStyle(e); if (st.position === 'fixed' || contenu(e)) continue;
    if (!deb || r.right > deb.droite) deb = { s: sel(e), droite: Math.round(r.right), largeur: Math.round(r.width), parent: e.parentElement ? sel(e.parentElement) : '' };
  }
  return {
    debordeur: deb,
    appVer: document.documentElement.getAttribute('data-app-ver') || '',
    badges, badgesVisibles, badgesVisiblesQui, badgesDessus, badgesCaches,
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
/* 18.11 (run 44224183689 : CMCteams « sw cmcteams-v10.028 (fichier présent, non enregistré) » sur les 2 écrans iPhone, alors que 3 passages de la nuit le voyaient
   inscrit ; mesuré en local sur l'app servie : elle inscrit son worker sur `load`, et l'inscription n'est visible qu'environ 1,5 s APRÈS). Le robot lisait une seule
   fois, trop tôt, et écrivait « non enregistré » à tort — un robot qui compte faux se corrige (leçon 858). Quand le fichier /sw.js est bien servi, on sonde
   l'inscription jusqu'à ATTENTE_SW_MS ; une page sans worker (fichier absent, porte, erreur) n'attend pas. Pur, testable avec une sonde et une horloge factices. */
export const ATTENTE_SW_MS = 6000;
export function fichierSwServi(b) {
  if (!b || b.erreur || b.statut !== 200) return false;
  const texte = String(b.texte || '');
  if (!texte.trim()) return false;
  return !(/text\/html/i.test(String(b.type || '')) || /^\s*<!doctype|^\s*<html/i.test(texte.slice(0, 200)));
}
export async function attendreInscription(sonde, { delai = ATTENTE_SW_MS, pas = 400, horloge = Date.now, pause = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const fin = horloge() + delai;
  const tour = async () => {
    const v = await sonde();
    if (v === true || v === null) return v;   /* null = navigateur sans worker : rien à attendre */
    if (horloge() >= fin) return false;
    await pause(pas);
    return tour();
  };
  return tour();
}
async function versionSw(page) {
  const brut = (await page.evaluate(async () => {
    const out = { texte: '', type: '', statut: 0, enregistre: null };
    try { const rep = await fetch('/sw.js', { cache: 'no-store' }); out.statut = rep.status; out.type = rep.headers.get('content-type') || ''; out.texte = (await rep.text()).slice(0, 20000); } catch { out.erreur = true; }
    return out;
  }).catch(() => null)) || { erreur: true };   /* page morte : evaluate rend null ou rejette → « illisible », jamais un plantage du robot (garde 2aj) */
  const sonde = () => page.evaluate(async () => {
    try { return 'serviceWorker' in navigator ? !!(await navigator.serviceWorker.getRegistration()) : null; } catch { return null; }
  }).catch(() => null);
  if (!brut.erreur) brut.enregistre = await attendreInscription(sonde, { delai: fichierSwServi(brut) ? ATTENTE_SW_MS : 0 });
  return lireVersionSw(brut);
}


/* 8.11 (pont-check 2104 : « apex-chat.kd-mc.com en portable : hôte final kd-mc.com ») : quand l'hôte final n'est pas celui demandé, la ligne dit par où la page est passée
   (statut + hôte + chemin, jamais les paramètres) — sinon on ne sait pas si c'est la porte, l'app ou le robot. */
export function chaineRedirections(rep) {
  const out = []; let q = rep && rep.request ? rep.request() : null;
  while (q && out.length < 6) {
    try { const u = new URL(q.url()); out.unshift(`${u.hostname}${u.pathname}`); } catch (_) { break; }
    q = q.redirectedFrom ? q.redirectedFrom() : null;
  }
  return out.join(' → ');
}
/* 12.11 (apex-cloud 2139 : « que la mesure note les NOMS des paramètres de l'URL finale (return, _ssob) pour confirmer le détour de connexion ») : les noms seulement, jamais les valeurs. */
export function nomsParametres(u) { try { return [...new Set([...new URL(u).searchParams.keys()])].slice(0, 8); } catch (_) { return []; } }
export function hoteDemande(a) { try { return new URL(/^https?:/i.test(a) ? a : 'https://' + a).hostname; } catch (_) { return ''; } }
/* 8.11 (Servi 42520525324 annulé à 20 min : Apex AI portable ne finissait pas) : une adresse qui ne finit pas ne bloque plus tout le job — au bout de `ms` elle est notée en erreur et on passe à la suivante. */
export async function avecLimite(fn, ms, msg = 'délai dépassé pour cette adresse') {
  let t; const corps = Promise.resolve().then(fn); corps.catch(() => {});
  try { return await Promise.race([corps, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`${msg} (${Math.round(ms / 1000)} s)`)), ms); })]); }
  finally { clearTimeout(t); }
}
/* 14.11 (run 43627981507, iPhone 13 WebKit : « page.goto: Page crashed » sur 5 adresses de suite après 2 pages mesurées ; 12.11, run 43216449365 : « Target page, context or browser has been closed ») :
   un navigateur qui plante n'est pas un défaut des pages — le robot ferme le contexte mort, en ouvre un neuf (connexion admin refaite) et rejoue l'adresse UNE fois ; la ligne
   porte « reprise après plantage du navigateur ». Si la 2ᵉ ouverture plante aussi, c'est une erreur rapportée comme avant. */
export function estPlantage(e) { return /Page crashed|crashed|Target page, context or browser has been closed|Target closed|browser has been closed|has been closed|disconnected/i.test(String(e?.message || e)); }
export async function avecRepriseSiPlantage(fn, renaitre, r = {}) {
  try { return await fn(); }
  catch (e) {
    if (!estPlantage(e)) throw e;
    r.reprise = (r.reprise ? r.reprise + ' · ' : '') + 'reprise après plantage du navigateur';
    await renaitre();
    return await fn();
  }
}
/* 8.11 : la ligne du journal est une fonction (testable) ; « petit N » NOMME les cibles < 44 px (sélecteurs, sans texte), comme « cache » nomme les boutons recouverts. */
function texteDemarrage(d) {
  if (d === undefined || d === null) return '-';
  return d === 'toujours' ? 'ÉCRAN DE DÉMARRAGE ENCORE LÀ après 20 s' : d + ' s';
}
export function ligneServi(a, nom, r) {
  const redir = r.redirige ? ` · REDIRIGÉ (demandé ${r.redirige}${r.chaine ? ' · chaîne : ' + r.chaine : ''}${r.parametres && r.parametres.length ? ' · paramètres : ' + r.parametres.join(', ') : ''})` : '';
  return `${aCorriger(r) ? '❌' : '✅'} ${a} · ${nom} · HTTP ${r.statut ?? '?'} · hôte ${r.hoteFinal ?? '?'} · sw ${r.sw ?? '?'} · app ${r.appVer || '-'} · bee page ${r.beePage || '-'} cadre ${r.beeCadre === '' ? '-' : r.beeCadre} · badge ${(r.badges || []).join('/') || '-'} visibles ${r.badgesVisibles ?? '-'}${r.badgesVisibles > 1 ? ' [' + (r.badgesVisiblesQui || []).join(' + ') + ' dessus ' + (r.badgesDessus || []).join(' | ') + ']' : ''}${r.badgesVisibles === 0 && r.badgesCaches?.length ? ' [' + r.badgesCaches.join(' | ') + ']' : ''} ${r.reprise ? ' · ' + r.reprise : ''} · démarrage ${texteDemarrage(r.demarrage)} · pastille bas ${r.pastilleBas ?? '-'} · 1er texte ${r.premier ? r.premier.top + ' ' + r.premier.s : '-'} · sous pastille ${r.sousPastille ? 'OUI' : 'non'} · installeur ${r.installeur ? 'fermé' : 'non'}${r.accueil ? ' · accueil fermé ' + r.accueil : ''} · cache ${r.cache ?? '-'}${r.cache && r.cacheEx?.length ? ' [' + r.cacheEx.join(' | ') + ']' : ''}${r.aDefiler ? ' · à défiler ' + r.aDefiler + ' [' + (r.aDefilerEx || []).join(' | ') + ']' : ''} · haut ${r.haut ?? '-'} · déborde ${r.deborde ?? '-'}${r.debordeur ? ' [' + r.debordeur.s + ' droite ' + r.debordeur.droite + ' / écran ' + r.largeurEcran + ' · largeur ' + r.debordeur.largeur + ' · parent ' + r.debordeur.parent + ']' : ''} · petit ${r.petit ?? '-'}${r.petit && r.petitEx?.length ? ' [' + r.petitEx.slice(0, 3).join(' | ') + ']' : ''} · fluidité ${r.fps ?? '-'} i/s${r.fps < 30 && r.bloque?.length ? ' [bloque ' + r.bloque.join(' | ') + ']' : ''}${r.err ? ' · ' + r.err : ''}${redir}${r.safariManque ? ' · ⚠️ Safari non mesuré (Chromium à la place de WebKit)' : ''}`;
}
/* 18.11 : la ligne de bilan est une fonction (testable) ; elle compte aussi les pages iPhone mesurées sans Safari. */
export function ligneBilan(res) {
  const ko = res.filter(aCorriger).length;
  const sansSafari = res.filter((r) => r.safariManque).length;
  const safari = sansSafari ? ' · ⚠️ Safari non mesuré sur ' + sansSafari + ' page(s) (WebKit absent)' : '';
  return `=== BILAN SERVI : ${res.length} page(s) lue(s), ${ko} à corriger${safari} ===`;
}
/* 7.11 : la ligne du journal d'UNE vue d'administration d'Apex Chat (sélecteurs seulement, jamais de texte : dépôt public). */
export function ligneVueAdmin(a, nom, x) {
  const ex = (n, liste, max) => (n && liste && liste.length ? ' [' + liste.slice(0, max).join(' | ') + ']' : '');
  return `${vueAdminACorriger(x) ? '❌' : '✅'} ${a} · ${nom} · vue ${x.vue} · affichée ${x.affichee === false ? 'NON' : 'oui'} · cache ${x.cache ?? '-'}${ex(x.cache, x.cacheEx, 99)} · petit ${x.petit ?? '-'}${ex(x.petit, x.petitEx, 3)} · déborde ${x.deborde ?? '-'}${x.err ? ' · ' + x.err : ''}`;
}
/* 7.11 : Apex Chat, écrans d'administration (portrait étroit et portable seulement : 13 vues x 5 écrans ferait trop long) */
export async function journaliserVuesAdminApexChat(page, a, { nom, tel, r, journal }) {
  if (r.hoteFinal !== 'apex-chat.kd-mc.com' || (nom !== 'iphone-13' && nom !== 'portable')) return;
  const adm = await mesurerVuesAdminApexChat(page, tel);
  if (!adm.admin) journal(`➖ ${a} · ${nom} · écrans d'administration : compte non administrateur (rôle ${adm.role ?? 'inconnu'}) — rien à mesurer`);
  for (const x of adm.vues) journal(ligneVueAdmin(a, nom, x));
}
/* 17.11 (apex-cloud 2573, runs 43627981507 / 43973747944 / 43989746303) : sur apex-chat.kd-mc.com en Chromium, le robot lisait la PORTE du domaine (la page
   « connexion » du routeur, ou le portail avec ?return=…) et écrivait « ✅ … badge v1.0.91 » — la version du portail, pas celle de l'app. Une porte servie à un
   robot connecté admin n'est jamais un ✅ : la ligne dit « porte (non connecté : <type>) » et compte comme erreur. Les signaux, dans l'ordre : l'en-tête
   `x-kdmc-porte` du document (fiche / code), le titre « … — connexion » ou le `body[data-return]` de la porte, le portail servi à la place d'un autre hôte
   (hôte final kd-mc.com avec le paramètre `return`). Pure, testable. */
export function detecterPorte({ entete = '', titre = '', dataReturn = false, redirige = '', hoteFinal = '', parametres = [] } = {}) {
  if (entete) return String(entete);
  const t = String(titre).toLowerCase();
  if (dataReturn || t.endsWith('— connexion')) return 'fiche';
  if (t.endsWith('crée ton code')) return 'code';
  if (redirige && /^(www\.)?kd-mc\.com$/.test(String(hoteFinal)) && (parametres || []).includes('return')) return 'portail';
  return '';
}
/* Diagnostic quand la porte est servie : ce que le domaine dit du robot sur CET hôte (statut + booléens, jamais d'identité). */
async function diagnosticWhoami(page) {
  return page.evaluate(async () => {
    try {
      const x = await fetch('/__sso/whoami', { credentials: 'include', cache: 'no-store' });
      const j = await x.json().catch(() => ({}));
      return `whoami ${x.status} ok:${!!j.ok} admin:${!!j.admin}${j.reason ? ' ' + String(j.reason).slice(0, 30) : ''}`;
    } catch {
      /* réseau coupé ou porte qui refuse la requête : c'est le diagnostic lui-même, rien d'autre à faire */
      return 'whoami injoignable';
    }
  }).catch(() => 'whoami illisible');
}
/* La page ouverte est-elle une porte ? Alors `r.porte` + `r.err` (avec le diagnostic whoami) et vrai. */
async function reconnaitrePorte(page, rep, r) {
  const entete = rep && typeof rep.headers === 'function' ? (rep.headers()['x-kdmc-porte'] || '') : '';
  const signes = await page.evaluate(() => ({ titre: document.title || '', dataReturn: !!document.body?.dataset?.return })).catch(() => ({}));
  r.porte = detecterPorte({ entete, ...signes, redirige: r.redirige, hoteFinal: r.hoteFinal, parametres: r.parametres });
  if (!r.porte) return false;
  r.err = `porte (non connecté : ${r.porte} · ${await diagnosticWhoami(page)})`;
  return true;
}
/* 14.11 (Sonar, PR 5688) : la mesure d'UNE adresse sur UNE page vit ici, hors de la boucle des écrans ; `page` est celle du moment (elle change après un plantage). */
export async function mesurerAdresse(page, a, { nom, tel, r, enCours, journal }) {
  const rep = await ouvrirAvecReprise(page, a, r, enCours);
  r.statut = rep ? rep.status() : 0; r.hoteFinal = new URL(page.url()).hostname;
  const dem = hoteDemande(a);
  if (dem && r.hoteFinal !== dem) { r.redirige = dem; r.chaine = chaineRedirections(rep); r.parametres = nomsParametres(page.url()); }
  await page.waitForTimeout(4500); r.demarrage = await attendreFinSplash(page); await page.evaluate(() => window.scrollTo(0, 0));
  if (await reconnaitrePorte(page, rep, r)) return;   /* une porte : rien à mesurer, la ligne dit pourquoi */
  r.installeur = await page.evaluate(fermerFeuilleInstalleur).catch(() => false);
  r.accueil = await page.evaluate(fermerAccueil).catch(() => ''); if (r.accueil) await page.waitForTimeout(500);
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
  /* 14.11 (run 43627981507 : cmcteams-light iPhone 13 « ✅ … cache - haut - déborde - petit - » = page morte pendant la mesure, ligne pourtant verte) : une mesure absente est une erreur, jamais un ✅ vide */
  if (!m) throw new Error('page.evaluate: Page crashed (mesure absente)');
  /* 6.11 (Kevin : « creuse toujours pour savoir ») : Servi comptait « cache 4 » sur kit.kd-mc.com sans dire QUI cache QUOI, et ne le comptait pas
     « à corriger ». Il nomme maintenant les boutons recouverts et ce qui les recouvre — sélecteurs seulement, le texte entre guillemets est retiré
     (dépôt public) — et un bouton recouvert compte comme un défaut. */
  Object.assign(r, { cache: m.cache, cacheEx: sansTexte(m.cacheEx), aDefiler: m.aDefiler, aDefilerEx: sansTexte(m.aDefilerEx), haut: m.haut, deborde: m.deborde, petit: m.petit, petitEx: sansTexte(m.petitEx), js: m.js });
  await journaliserVuesAdminApexChat(page, a, { nom, tel, r, journal });
}
/* 17.11 (apex-cloud 2618, oui pour CE POST seulement) : la connexion d'Apex Chat que Servi laisse passer, en plus de la connexion admin du domaine.
   Adresse EXACTE (l'API d'Apex Chat est servie par son worker, pas par apex-chat.kd-mc.com) ; /api/keys/device, /api/users/me et tout autre POST restent bloqués. */
export const CONNEXIONS_SERVI = ['https://apex-chat-api.9r4rxssx64.workers.dev/api/auth/sso-from-kdmc'];
export async function verifierServi({ adresses, hash = '', journal = console.log }) {
  const b = await chromium.launch({ headless: true });
  const bw = process.env.WEBKIT === '1' ? await webkit.launch({ headless: true }).catch(() => null) : null;
  /* 18.11 (run 44224183689 : WebKit n'avait pas démarré — apt de l'hébergeur coupé — et l'iPhone a été mesuré en Chromium sans que le bilan le dise ;
     seul l'en-tête « [chromium] » le trahissait). Un moteur absent ne se tait jamais (règle « tout tester partout ») : la ligne de chaque page iPhone et le bilan le disent. */
  const safariManque = process.env.WEBKIT === '1' && !bw;
  if (safariManque) journal('⚠️ WebKit absent : iphone-13 sera mesuré en Chromium — Safari NON mesuré sur ce passage');
  const sortie = [];
  try {
    /* SERVI_ECRANS=portable,iphone-13 : ne lire que certains écrans (mesure de masse, ex. la version de Bee sur les 33 adresses) ; vide = les 5 écrans */
    const voulus = String(process.env.SERVI_ECRANS || '').split(',').map((x) => x.trim()).filter(Boolean);
    for (const nom of NOMS_ECRANS_SERVI.filter((n) => !voulus.length || voulus.includes(n))) {
      const ec = trouverEcranServi(nom); const { nom: _n, tel, explorer: _e, ...opts } = ec; delete opts.defaultBrowserType;
      const moteur = bw && nom === 'iphone-13' ? bw : b;
      let ctx = await moteur.newContext({ ...opts }); await lectureSeule(ctx, { connexions: CONNEXIONS_SERVI });
      let page = await ctx.newPage();
      /* 7.11 (apex-cloud, Servi 42361310862 : Apex AI « page.goto Timeout 30000ms » sur 2 écrans paysage, 2 runs de suite) : au dépassement du délai on dit QUELLES requêtes
         n'avaient pas fini (hôte + chemin, jamais les paramètres) — un « timeout » sans cause ne se corrige pas. */
      const enCours = new Map();
      const suivre = (p) => { p.on('request', (q) => enCours.set(q, Date.now())); p.on('requestfinished', (q) => enCours.delete(q)); p.on('requestfailed', (q) => enCours.delete(q)); };
      suivre(page);
      let admin = false;
      if (hash) admin = !!(await connecterAdmin(page, hash).catch(() => ({ ok: false }))).ok;
      /* 14.11 : navigateur planté → contexte neuf, page neuve, connexion admin refaite (le navigateur lui-même est relancé s'il est tombé) */
      const renaitre = async () => {
        await page.close().catch(() => {}); await ctx.close().catch(() => {}); enCours.clear();
        const lanceur = moteur === bw ? webkit : chromium;
        const m2 = moteur.isConnected() ? moteur : await lanceur.launch({ headless: true });
        ctx = await m2.newContext({ ...opts }); await lectureSeule(ctx, { connexions: CONNEXIONS_SERVI }); page = await ctx.newPage(); suivre(page);
        if (hash) await connecterAdmin(page, hash).catch(() => ({ ok: false }));
      };
      journal(`=== ${nom} [${moteur === bw ? 'webkit' : 'chromium'}] (${opts.viewport.width}×${opts.viewport.height}) — connexion admin : ${admin ? 'oui' : 'NON'}`);
      const LIMITE_MS = Math.max(30000, Number(process.env.SERVI_ADRESSE_MAX_MS) || 240000);
      for (const a of adresses) {
        const r = { adresse: a, ecran: nom, admin };
        if (safariManque && nom === 'iphone-13') r.safariManque = true;
        try {
          await avecRepriseSiPlantage(() => avecLimite(() => mesurerAdresse(page, a, { nom, tel, r, enCours, journal }), LIMITE_MS), renaitre, r);
        } catch (e) {
          r.err = String(e && e.message).split('\n')[0].slice(0, 90) + enAttente(enCours);
          if (/délai dépassé pour cette adresse/.test(String(e && e.message))) {   /* page peut-être figée : on la jette et on repart d'une neuve pour les adresses suivantes */
            await page.close().catch(() => {}); enCours.clear(); page = await ctx.newPage(); suivre(page);
            if (hash) await connecterAdmin(page, hash).catch(() => ({ ok: false }));
          } else if (estPlantage(e)) { await renaitre().catch(() => {}); }   /* planté deux fois de suite : on repart quand même d'un navigateur neuf pour les adresses suivantes */
        }
        sortie.push(r);
        journal(ligneServi(a, nom, r));
      }
      await ctx.close().catch(() => {});
    }
  } finally { await b.close().catch(() => {}); if (bw) await bw.close().catch(() => {}); }
  return sortie;
}

if (process.argv[1] && /(^|[\\/])verifier-servi\.mjs$/.test(process.argv[1])) {
  const brut = process.argv.slice(2);
  const adresses = brut.map(adresseSure).filter(Boolean);
  const refus = brut.filter((a) => !adresseSure(a));
  if (refus.length) console.log(`⚠️ ${refus.length} adresse(s) refusée(s) : seules les adresses *.kd-mc.com sont ouvertes`);
  if (!adresses.length) { console.error('Aucune adresse *.kd-mc.com à vérifier'); process.exit(2); }
  const res = await verifierServi({ adresses, hash: process.env.KDMC_ADMIN_PIN_SHA256 || '' });
  console.log('\n' + ligneBilan(res));
  process.exit(0);
}
