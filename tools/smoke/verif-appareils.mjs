/* VÉRIF APPAREILS — Lingua et le portail, sur le VRAI domaine, COMME KEVIN sur trois appareils
 * (Kevin 2.10.2026 : « Vérifie réellement tjs. Comme moi iOS, android, navigateur, etc »).
 * ===========================================================================
 * Trois appareils simulés, trois VRAIS moteurs de navigateur :
 *   · iPhone 13 — WebKit (le moteur de Safari iOS : c'est lui qui tourne sur l'iPhone de Kevin) ;
 *   · Pixel 7 — Chromium (Chrome Android) ;
 *   · ordinateur 1280 px — Chromium (Chrome / Edge).
 * Sur chacun, ce qu'un visiteur VOIT et FAIT : l'écran des comptes, l'accueil avec un compte local,
 * l'écran « Mon cercle », un lien d'invitation, le portail kd-mc.com. Et ce qu'il ne doit PAS voir :
 * un écran d'erreur, une version dépareillée, une porte du cercle ouverte sans compte.
 *
 * LECTURE SEULE, PROMIS (leçon #384 : une sonde ne crée JAMAIS de compte sur le vrai domaine) :
 *   · aucun compte créé, aucun code envoyé : le compte de test est LOCAL (localStorage), sans compte
 *     KDMC — la page ne poste donc rien (vérifié : 0 requête non-GET partie de la page) ;
 *   · navigations marquées `x-kdmc-sonde` (le routeur ne fiche ni ne compte) ; images, polices et sons
 *     coupés à la source ; service worker bloqué (il contourne la route et téléchargerait tout, #380) ;
 *   · aucune voix demandée (un appel = une écriture KV de compteur ; l'audit Lingua s'en charge).
 *
 * DEPUIS UNE SESSION CLAUDE, CE FICHIER NE PEUT PAS TOURNER sur le vrai domaine (proxy : 403 au CONNECT
 * sur *.kd-mc.com). Il est fait pour la CI (`.github/workflows/verif-appareils.yml`), sous le plafond de
 * 2 vérifications réelles par jour ; son rapport revient par les annotations du check-run.
 * En local, `tests/verify-verif-appareils.mjs` le fait tourner contre une copie servie sur localhost.
 *
 * Lancer : node tools/smoke/verif-appareils.mjs [https://lingua.kd-mc.com] [--portail=https://kd-mc.com]
 *          [--moteurs=webkit,chromium] [--captures=dossier]
 */
import { chromium, webkit, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const BASE = (args.find((a) => !a.startsWith('--')) || 'https://lingua.kd-mc.com').replace(/\/+$/, '');
const opt = (k, d) => (args.find((a) => a.startsWith('--' + k + '=')) || '').split('=').slice(1).join('=') || d;
const PORTAIL = opt('portail', 'https://kd-mc.com').replace(/\/+$/, '');
const MOTEURS = opt('moteurs', 'webkit,chromium').split(',');
const CAPTURES = opt('captures', '');
if (CAPTURES) mkdirSync(CAPTURES, { recursive: true });

/* Les trois appareils. Sans WebKit (poste de test local), l'iPhone est joué par Chromium : on le DIT. */
const APPAREILS = [
  { id: 'iphone', nom: 'iPhone 13 — Safari (WebKit)', moteur: 'webkit', profil: devices['iPhone 13'] },
  { id: 'android', nom: 'Pixel 7 — Chrome Android (Chromium)', moteur: 'chromium', profil: devices['Pixel 7'] },
  { id: 'ordinateur', nom: 'Ordinateur 1280 px — Chrome (Chromium)', moteur: 'chromium', profil: { viewport: { width: 1280, height: 800 }, userAgent: devices['Desktop Chrome'].userAgent } },
];

const R = { ok: [], ko: [], gris: [] };
const dire = (m) => console.log(m);
const ok = (a, m) => { R.ok.push(m); dire(`✅ [${a}] ${m}`); };
const ko = (a, m) => { R.ko.push(m); dire(`❌ [${a}] ${m}`); };
const gris = (a, m) => { R.gris.push(m); dire(`⚠ [${a}] ${m}`); };
const chk = (a, c, m, d) => (c ? ok(a, m) : ko(a, m + (d !== undefined ? ' → ' + String(d).slice(0, 200) : '')));

/* Même sobriété que l'audit Lingua : marquer les pages, couper le superflu. */
const INUTILE = /\.(png|jpe?g|gif|webp|svg|ico|mp3|wav|ogg|mp4|webm|woff2?|ttf|otf)($|\?)/i;
const PAS_UNE_PAGE = /\.(js|mjs|css|map|json|webmanifest|png|jpe?g|gif|webp|svg|ico|mp3|wav|ogg|mp4|webm|woff2?|ttf|otf|pdf|txt|xml)($|\?)/i;
const SONDE = { 'x-kdmc-sonde': 'verif-appareils' };
/* UNE SONDE NE LAISSE PAS DE TRACE (mesuré run 37080174445, 3.10 00h00 UTC) : avec un compte local nommé, Lingua
   envoie sa progression au journal « qui se connecte » (POST admin.kd-mc.com/log) — 6 lignes « Sonde Appareils »
   chez l'admin ; et Cloudflare injecte sa balise d'analyse (POST /cdn-cgi/rum, bord Cloudflare, jamais le worker).
   Les deux sont coupés à la source : rien n'est écrit, et on le DIT. */
const TRACES = (u) => (u.hostname.startsWith('admin.') && u.pathname === '/log') || u.pathname.startsWith('/cdn-cgi/');
const coupees = [];
async function preparer(ctx) {
  await ctx.route((u) => INUTILE.test(u.pathname), (route) => route.abort());
  await ctx.route((u) => !PAS_UNE_PAGE.test(u.pathname), (route, req) => {
    if (req.resourceType() !== 'document') return route.continue();
    return route.continue({ headers: Object.assign({}, req.headers(), SONDE) });
  });
  /* EN DERNIER, exprès : Playwright essaie les routes de la DERNIÈRE enregistrée à la première. Placée en
     premier (run 37164514412, 4.10 00h20), celle-ci était court-circuitée par la route des pages juste au-dessus
     (/log et /cdn-cgi/rum n'ont pas d'extension) : les traces partaient quand même (leçon #401). */
  await ctx.route((u) => TRACES(u), (route, req) => { coupees.push(req.method() + ' ' + new URL(req.url()).host + new URL(req.url()).pathname); return route.abort(); });
}
/* Le compte de TEST : local, sans compte KDMC (→ la page ne poste rien), déjà sur un cours. */
const SEED = { id: 'sonde', nom: 'Sonde Appareils', cours: 'en' };
const semer = (ctx) => ctx.addInitScript((c) => {
  try {
    if (sessionStorage.getItem('sonde-semee')) return; sessionStorage.setItem('sonde-semee', '1');
    localStorage.setItem('lingua_g_accounts', JSON.stringify([{ id: c.id, name: c.nom, avatar: '🦊', code: '', created: 1 }]));
    localStorage.setItem('lingua_g_current', JSON.stringify(c.id));
    localStorage.setItem('lingua_a_' + c.id + '_course', JSON.stringify(c.cours));
    localStorage.setItem('lingua_a_' + c.id + '_placeAsked', 'true');
    localStorage.setItem('lingua_a_' + c.id + '_sound', 'false');
  } catch (e) { /* stockage indisponible : l'écran des comptes s'affichera, et on le verra */ }
}, SEED);
const texte = (p) => p.evaluate(() => document.body.innerText || '');
const capture = async (p, nom) => { if (CAPTURES) { try { await p.screenshot({ path: `${CAPTURES}/${nom}.png`, fullPage: false }); } catch (e) { /* */ } } };
const hote = (u) => { try { return new URL(u).hostname; } catch { return ''; } };
const DOMAINE = hote(BASE).split('.').slice(-2).join('.');

const lances = {};
async function moteur(nom) {
  if (!MOTEURS.includes(nom)) nom = MOTEURS[0];
  if (!lances[nom]) lances[nom] = await (nom === 'webkit' ? webkit : chromium).launch();
  return { nav: lances[nom], nom };
}

/* ---------- 0. La version SERVIE, une fois (c'est le domaine qui répond, pas une copie) ---------- */
let versionServie = '';
{
  const ctx = await (await moteur('chromium')).nav.newContext({ locale: 'fr-FR' });
  try {
    const sw = await ctx.request.get(BASE + '/sw.js', { headers: SONDE, timeout: 20000 });
    const swTxt = sw.ok() ? await sw.text() : '';
    const vSw = (swTxt.match(/CACHE\s*=\s*"lingua-(v[\d.]+)"/) || [])[1] || '';
    const html = await ctx.request.get(BASE + '/', { headers: SONDE, timeout: 20000 });
    const htmlTxt = html.ok() ? await html.text() : '';
    const vHtml = [...htmlTxt.matchAll(/\?v=(v[\d.]+)"/g)].map((m) => m[1]);
    versionServie = vSw || vHtml[0] || '';
    chk('domaine', sw.ok() && html.ok(), `le domaine répond (sw.js ${sw.status()}, page ${html.status()})`);
    chk('domaine', !!vSw, `version servie : ${vSw || '(illisible)'}`);
    chk('domaine', vHtml.length > 0 && vHtml.every((v) => v === vSw), `la page charge ses fichiers dans la MÊME version que le service worker (${[...new Set(vHtml)].join(', ') || 'aucune'})`);
    const man = await ctx.request.get(BASE + '/manifest.webmanifest', { headers: SONDE, timeout: 20000 });
    chk('domaine', man.ok(), `manifeste de l'app installable (${man.status()})`);
  } catch (e) { ko('domaine', 'le domaine ne répond pas : ' + String(e && e.message || e).slice(0, 160)); }
  await ctx.close();
}

/* ---------- 1. Les portes du cercle, vues de l'extérieur (lecture seule, aucune session) ---------- */
{
  const ctx = await (await moteur('chromium')).nav.newContext({ locale: 'fr-FR' });
  const lire = async (chemin, init) => {
    const r = await ctx.request.fetch(BASE + chemin, Object.assign({ headers: SONDE, timeout: 20000, maxRedirects: 0 }, init || {}));
    let j = null; try { j = await r.json(); } catch { /* pas du JSON */ }
    return { st: r.status(), j };
  };
  try {
    const inv = await lire('/__cercle/invitation?j=sondeappareils000');
    chk('cercle', inv.j && inv.j.ok === false && inv.j.reason === 'invitation_expiree', 'un lien d\'invitation inconnu est refusé proprement (la base du cercle répond)', JSON.stringify(inv.j));
    const etat = await lire('/__cercle/etat');
    chk('cercle', etat.st === 401 && etat.j && etat.j.reason === 'compte_kdmc_requis', 'sans compte KDMC : aucun état du cercle (401)', etat.st + ' ' + JSON.stringify(etat.j));
    const boite = await lire('/__cercle/admin/boite');
    chk('cercle', boite.st === 401, 'la boîte de l\'admin est fermée à un inconnu (401)', boite.st);
    const tous = await lire('/__cercle/admin/tous');
    chk('cercle', tous.st === 401, 'la liste de toutes les personnes est fermée à un inconnu (401)', tous.st);
    const pirate = await lire('/__cercle/message', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json', origin: 'https://site-pirate.example' }, SONDE), data: '{"a":"admin","type":"texte","corps":"x"}' });
    chk('cercle', pirate.st === 403 && pirate.j && pirate.j.reason === 'origine_refusee', 'un site extérieur ne peut rien poster dans le cercle (403)', pirate.st + ' ' + JSON.stringify(pirate.j));
    /* 📞 Bee t'appelle même app fermée (v2.134.0) : la clé des notifications répond, un site extérieur ne peut pas s'abonner */
    const cle = await lire('/__lingua/appel-cle');
    chk('appel', cle.j && cle.j.ok === true && String(cle.j.cle || '').length > 60, 'notifications « Bee t\'appelle » : la clé du service de notifications répond', cle.st + ' ' + JSON.stringify(cle.j).slice(0, 80));
    const abo = await lire('/__lingua/appel-abonnement', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json', origin: 'https://site-pirate.example' }, SONDE), data: '{"sub":{"endpoint":"https://web.push.apple.com/x","keys":{"p256dh":"a","auth":"b"}},"heure":"18:30","tz":"Europe/Paris"}' });
    chk('appel', abo.st === 403, 'un site extérieur ne peut pas abonner un téléphone aux appels (403)', abo.st);
    const qui = await lire('/__sso/whoami');
    chk('domaine', qui.j && qui.j.ok === false, 'sans session : le domaine ne reconnaît personne (whoami ok:false)', JSON.stringify(qui.j));
  } catch (e) { ko('cercle', 'portes du cercle injoignables : ' + String(e && e.message || e).slice(0, 160)); }
  await ctx.close();
}

/* ---------- 2. Chaque appareil, comme un visiteur ---------- */
for (const ap of APPAREILS) {
  const { nav, nom: moteurReel } = await moteur(ap.moteur);
  const A = ap.id + (moteurReel !== ap.moteur ? ` (${moteurReel} à la place de ${ap.moteur})` : '');
  dire(`\n— ${ap.nom}${moteurReel !== ap.moteur ? ' — joué par ' + moteurReel + ' (WebKit absent ici)' : ''}`);
  const ctx = await nav.newContext(Object.assign({ locale: 'fr-FR', serviceWorkers: 'block' }, ap.profil));
  await preparer(ctx);
  const ecritures = [], erreurs = [], mauvaises = [], tracesParties = []; let tracesBloquees = 0;
  /* une trace COUPÉE (route.abort) déclenche quand même l'événement « request » : on ne la compte pas comme écriture,
     mais on vérifie qu'elle a bien été coupée (sinon le compte des coupures reste à 0 et le rapport le dit) */
  ctx.on('request', (req) => { let u; try { u = new URL(req.url()); } catch { return; }
    if (req.method() !== 'GET' && req.method() !== 'HEAD' && hote(req.url()).endsWith(DOMAINE) && !TRACES(u)) ecritures.push(req.method() + ' ' + u.pathname); });
  ctx.on('requestfailed', (req) => { let u; try { u = new URL(req.url()); } catch { return; } if (TRACES(u)) tracesBloquees++; });
  ctx.on('requestfinished', (req) => { let u; try { u = new URL(req.url()); } catch { return; } if (TRACES(u) && req.method() !== 'GET') tracesParties.push(req.method() + ' ' + u.host + u.pathname); });
  ctx.on('response', (res) => { const s = res.status(); if ((s >= 500 || s === 429) && hote(res.url()).endsWith(DOMAINE)) mauvaises.push(s + ' ' + new URL(res.url()).pathname); });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => erreurs.push(String(e && e.message || e).slice(0, 120)));
  try {
    /* a. l'écran des comptes, à froid */
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2500);
    let t = await texte(page);
    chk(A, /Nouveau compte/.test(t) && /J'ai déjà un compte/.test(t), 'écran des comptes : « Nouveau compte » et « J\'ai déjà un compte » visibles', t.slice(0, 160));
    const faceIdPossible = await page.evaluate(() => !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.get));
    const boutonFaceId = /Me connecter avec Face ID/.test(t);
    chk(A, boutonFaceId === faceIdPossible, `bouton « 🔐 Me connecter avec Face ID » ${boutonFaceId ? 'proposé' : 'absent'} — cohérent avec l'appareil (${faceIdPossible ? 'Face ID possible' : 'pas de Face ID sur ce moteur de test'})`);
    if (!faceIdPossible && ap.id === 'iphone') gris(A, 'ce WebKit de test n\'a pas d\'authentificateur : sur un vrai iPhone, Safari en a un et le bouton apparaît (prouvé par le robot Face ID, authentificateur virtuel)');
    chk(A, !/Erreur asynchrone|Cannot read|TypeError/i.test(t), 'aucun écran d\'erreur à l\'ouverture');
    await capture(page, ap.id + '-1-comptes');

    /* b. un compte LOCAL (semé, sans compte KDMC) → l'accueil, puis « Mon cercle » */
    await semer(ctx);
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2500);
    t = await texte(page);
    chk(A, !/Nouveau compte/.test(t) && (/Mon cercle|Accueil|Réviser/.test(t)), 'avec un compte sur l\'appareil : l\'accueil s\'ouvre directement', t.slice(0, 160));
    await capture(page, ap.id + '-2-accueil');
    const bouton = await page.$('#tbCercle');
    chk(A, !!bouton, 'le bouton 🤝 Cercle est dans la barre du haut');
    if (bouton) { await bouton.click(); await page.waitForTimeout(1500); }
    t = await texte(page);
    chk(A, /Mon cercle/.test(t) && /Relier mon compte KDMC/.test(t), 'écran « Mon cercle » : demande le compte KDMC (ce compte de test n\'en a pas)', t.slice(0, 200));
    await capture(page, ap.id + '-3-cercle');

    /* c. un lien d'invitation (inconnu) : le paramètre est consommé, le domaine est interrogé, la réponse est propre */
    const attente = page.waitForResponse((r) => r.url().includes('/__cercle/invitation'), { timeout: 15000 }).catch(() => null);
    await page.goto(BASE + '/?cercle=sondeappareils000', { waitUntil: 'domcontentloaded', timeout: 45000 });
    const rep = await attente;
    let j = null; try { j = rep ? await rep.json() : null; } catch { /* */ }
    chk(A, !!rep && j && j.ok === false, 'lien d\'invitation : l\'app interroge le domaine et un lien inconnu est refusé (pas d\'écran cassé)', rep ? rep.status() + ' ' + JSON.stringify(j) : 'aucune réponse');
    await page.waitForTimeout(800);
    const search = await page.evaluate(() => location.search);
    chk(A, search === '', 'le paramètre ?cercle= est retiré de l\'adresse après lecture', search);
    await capture(page, ap.id + '-4-invitation');

    /* d. rien d'écrit, rien de cassé */
    chk(A, ecritures.length === 0, 'la page n\'a RIEN posté au domaine (0 requête non-GET : aucun compte créé, aucune écriture)', ecritures.join(', '));
    chk(A, tracesParties.length === 0, 'aucune trace n\'est partie (journal admin, balise Cloudflare) — la sonde ne laisse rien chez l\'admin', [...new Set(tracesParties)].join(', '));
    if (coupees.length) gris(A, 'traces coupées à la source (journal admin, balise Cloudflare) : ' + [...new Set(coupees)].join(', ') + ' — rien d\'écrit');
    coupees.length = 0;
    chk(A, erreurs.length === 0, 'aucune erreur JavaScript', erreurs.join(' | '));
    chk(A, mauvaises.length === 0, 'aucune réponse 5xx / 429 du domaine', mauvaises.join(', '));

    /* e. le portail kd-mc.com, anonyme */
    const pp = await ctx.newPage();
    pp.on('pageerror', (e) => erreurs.push('portail: ' + String(e && e.message || e).slice(0, 120)));
    const rp = await pp.goto(PORTAIL + '/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await pp.waitForTimeout(2000);
    const tp = await texte(pp);
    chk(A, rp && rp.status() === 200 && /Créer mon compte/.test(tp), 'portail kd-mc.com : s\'ouvre, propose « Créer mon compte »', (rp && rp.status()) + ' ' + tp.slice(0, 120));
    const bandeau = await pp.evaluate(() => { const a = document.getElementById('cercle-alerte'); return a ? !a.hidden : null; });
    chk(A, bandeau === false, 'portail : le bandeau « messages Lingua » de l\'admin reste caché à un visiteur anonyme', String(bandeau));
    chk(A, !erreurs.some((e) => e.startsWith('portail:')), 'portail : aucune erreur JavaScript', erreurs.filter((e) => e.startsWith('portail:')).join(' | '));
    await capture(pp, ap.id + '-5-portail');
    await pp.close();
  } catch (e) {
    ko(A, 'parcours interrompu : ' + String(e && e.message || e).slice(0, 200));
    await capture(page, ap.id + '-erreur');
  }
  await ctx.close();
}
for (const n of Object.keys(lances)) await lances[n].close();

dire(`\n=== VÉRIF APPAREILS ${R.ko.length ? 'ÉCHEC' : 'OK'} — ${R.ok.length} ✅ · ${R.ko.length} ❌ · ${R.gris.length} ⚠ · version servie ${versionServie || '?'} ===`);
for (const m of R.ko) dire('   · ' + m);
process.exit(R.ko.length ? 1 : 0);
