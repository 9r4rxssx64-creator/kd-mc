/* VÉRIFICATION RÉELLE DES MESSAGES, CONNECTÉ EN ADMIN COMME KEVIN — iPhone, vrai domaine
 * (Kevin 17.10.2026 : « Connecte-toi réel comme moi. Tes autres branches le font déjà. Note-le et rappelle-toi toujours » ; règle « Réel toujours »).
 *
 * Tourne en CI (réseau ouvert) : le code admin vient du SECRET (empreinte SHA-256, jamais écrite ni journalisée) et part au DOMAINE (POST /__admin/login),
 * exactement comme quand Kevin le tape ; vrai Chromium au format iPhone 13. LECTURE SEULE : aucune écriture dans la boîte de Kevin
 * (« lu », « répondre », valider… sont absorbés : ouvrir sa boîte ne doit JAMAIS changer ce qu'il voit en rouge).
 *
 * Contrôles (chacun ✅ ou ❌ avec la raison exacte) :
 *   A. connexion admin acceptée par le domaine ;
 *   B. la version SERVIE est celle du dépôt (sw.js) et le code du classement / de l'atterrissage est dans le kdmc-boite.js servi ;
 *   C. le bandeau 📬 s'affiche, au doigt (≥ 44 px) ;
 *   D. un toucher sur le bandeau ATTERRIT sur la conversation non lue la plus récente à laquelle on peut répondre (sinon : la liste) ;
 *   E. la liste « Tous » ne montre QUE de vrais messages (aucune alerte), dans l'ordre du classement (non lu → lu sans réponse → répondu → autres) ;
 *   F. le tableau de bord admin (onglet Messages) : aperçu sans connexions/alertes, ordre du classement (non essayé en ESSAI_LOCAL) ;
 *   G. aucune erreur JavaScript.
 *
 * node tests/verif-live-messages.mjs   (KDMC_ADMIN_PIN_SHA256 requis ; CAPTURES = dossier des captures)
 * Essai sans réseau : ESSAI_LOCAL=1 (les vraies pages kdmc-home/ du dépôt, domaine simulé) — c'est test:verif-live-messages-robot.
 * SABOTAGE=alertes (le code servi mélange les alertes dans « Tous ») : E DOIT rougir ; SABOTAGE=tri (le classement est neutralisé) : E DOIT rougir ;
 * SABOTAGE=atterrissage (l'ouverture ne saute plus sur la conversation) : D DOIT rougir ; SABOTAGE=sansdonnee (la boîte ne répond pas, comme au 1er run réel du 17.10) : « la boîte répond » ET « a LU la boîte » DOIVENT rougir (jamais de vert à vide). */
import { readFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';

const LOCAL = process.env.ESSAI_LOCAL === '1';
/* SANS_NOMS=1 (dépôt PUBLIC, gratuit et illimité — Kevin 17.10 « utilise le gratuit toujours ») : un journal public se lit par tout le monde, la boîte de Kevin contient des noms
   et des messages de ses collègues → ni nom, ni clé de conversation, ni capture : seulement des NOMBRES et des verdicts. */
const SANS_NOMS = process.env.SANS_NOMS === '1';
const nom = (t) => (SANS_NOMS ? '«nom masqué»' : t);
const detail = (x) => (SANS_NOMS ? '(détail masqué : dépôt public)' : JSON.stringify(x));
const vue = (page, fichier) => (SANS_NOMS ? Promise.resolve() : page.screenshot({ path: join(CAPTURES, fichier) }).catch(() => {}));
const SABOTAGE = String(process.env.SABOTAGE || '');
const HASH = LOCAL ? '0'.repeat(64) : String(process.env.KDMC_ADMIN_PIN_SHA256 || '').trim().toLowerCase();
const BASE = 'https://kd-mc.com';
const CAPTURES = process.env.CAPTURES || '/tmp/captures';
const RESUME = process.env.GITHUB_STEP_SUMMARY || '';
const RACINE = process.cwd();
const lignes = [];
const dire = (t) => { console.log(t); lignes.push(t); };
let echecs = 0;
const ok = (c, m, d) => { if (!c) echecs++; dire(`${c ? '✅' : '❌'} ${m}${!c && d ? ' — ' + String(d).slice(0, 260) : ''}`); };
const fin = (code) => {
  if (RESUME) { try { appendFileSync(RESUME, '## Vérification réelle des Messages (admin, iPhone)\n\n' + lignes.map((l) => '- ' + l).join('\n') + '\n'); } catch (_) { /* pas de résumé */ } }
  dire(code ? `=== VÉRIF MESSAGES : ÉCHEC (${echecs} contrôle(s))` : '=== VÉRIF MESSAGES : OK');
  process.exit(code);
};

if (!/^[0-9a-f]{64}$/.test(HASH)) { dire('❌ Code admin absent (secret CI) : vérification réelle IMPOSSIBLE — je n\'affirme rien.'); fin(1); }
try { mkdirSync(CAPTURES, { recursive: true }); } catch (_) { /* dossier déjà là */ }

const browser = await chromium.launch(process.env.PW_EXE ? { executablePath: process.env.PW_EXE } : {});
const ctx = await browser.newContext({
  serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
});

/* LECTURE SEULE : la connexion admin et les lectures passent ; toute écriture dans la boîte (lu, répondre, valider, codes…) est absorbée. */
const DOMAINE_OK = /(^|\.)kd-mc\.com$/;
const ECRITURE_OK = /^\/__(admin\/login|sso\/[a-z]+)$/;
const ecritures = [];
async function routeReel(r) {
  const q = r.request(), m = q.method();
  let u; try { u = new URL(q.url()); } catch (_) { return r.abort(); }
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return r.fallback();
  if (DOMAINE_OK.test(u.hostname) && ECRITURE_OK.test(u.pathname)) return r.fallback();
  ecritures.push(m + ' ' + u.pathname);
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"lectureSeule":true}' });
}

/* ESSAI_LOCAL=1 : les vraies pages du dépôt (kdmc-home/), le domaine simulé — pour prouver le robot AVANT de le lancer pour de vrai. */
const t0 = Date.now();
const DONNEES = () => ({ ok: true, nonLus: 2, nonLusAlertes: 1, connectes: 1, maj: Date.now(), enLigne: [],
  sources: [{ id: 'lingua', nom: 'Lingua', icone: '🐝', etat: 'ok', total: 2, nonLus: 1 }, { id: 'cmcteams', nom: 'CMCteams · employés', icone: '📅', etat: 'ok', total: 1, nonLus: 1 },
    { id: 'alertes', nom: 'Alertes du domaine', icone: '🔔', etat: 'ok', total: 2, nonLus: 1 }],
  messages: [
    { cle: 'lingua:fait', source: 'lingua', app: 'lingua.kd-mc.com', de: 'Répondu Récent', ts: t0 - 10000, texte: 'Merci !', nonLus: 0, lu: true, repondre: 'direct', fil: [{ moi: false, texte: 'Une question', ts: t0 - 600000 }, { moi: true, texte: 'Voilà', ts: t0 - 10000 }] },
    { cle: 'cmc:attente', source: 'cmcteams', app: 'cmcteams.kd-mc.com', de: 'Lu Sans Réponse', ts: t0 - 1800000, texte: 'Tu peux me rappeler ?', nonLus: 0, lu: true, repondre: 'direct', fil: [{ moi: false, texte: 'Tu peux me rappeler ?', ts: t0 - 1800000 }] },
    { cle: 'lingua:nv', source: 'lingua', app: 'lingua.kd-mc.com', de: 'Non Lu Ancien', ts: t0 - 7200000, texte: 'Bonjour', nonLus: 1, lu: false, repondre: 'direct', fil: [{ moi: false, texte: 'Bonjour', ts: t0 - 7200000 }] },
    { cle: 'alerte:1-new_device', source: 'alertes', app: 'domaine', de: '🔐 Nouvel appareil', ts: t0 - 900000, texte: 'iPhone · Nice', nonLus: 1, lu: false, repondre: null, fil: [] },
    { cle: 'alerte:2-connexion', source: 'alertes', app: 'domaine', de: 'Davy · departs', ts: t0 - 800000, texte: "s'est connecté departs.kd-mc.com", nonLus: 0, lu: true, repondre: null, fil: [] } ] });
if (LOCAL) {
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url()), J = (o, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
    if (!DOMAINE_OK.test(u.hostname)) return r.fulfill({ status: 204, body: '' });
    if (u.pathname === '/__admin/login') return J({ ok: true, grant: 'g-essai', token: 't-essai', admin: true, verified: true });
    if (u.pathname === '/__sso/whoami') return J({ ok: true, uid: 'kdmc_admin', name: 'kevin Desarzens', admin: true, verified: true, cgu: true });
    if (u.pathname === '/__boite/admin' && r.request().method() === 'GET') return SABOTAGE === 'sansdonnee' ? J({ ok: false, reason: 'admin_requis' }, 401) : J(DONNEES());
    if (u.pathname.startsWith('/__')) return r.fulfill({ status: 404, body: '' });
    const f = u.pathname === '/' ? join(RACINE, 'kdmc-home/index.html') : join(RACINE, 'kdmc-home', u.pathname.replace(/^\//, ''));   // le portail kdmc-home/ (pas la page racine de CMCteams : un test qui la lit reste au coffre)
    if (!f.startsWith(join(RACINE, 'kdmc-home')) || !existsSync(f)) return r.fulfill({ status: 404, body: '' });
    let corps = readFileSync(f);
    if (/kdmc-boite\.js$/.test(f)) {
      let t = String(corps);
      if (SABOTAGE === 'alertes') t = t.replace("filtre === 'tous' ? m.source !== 'alertes' : m.source === filtre", "filtre === 'tous' || m.source === filtre");
      if (SABOTAGE === 'tri') t = t.replace(/return \{ m: m, r: rang\(m\), i: i \};/, 'return { m: m, r: 1, i: i };');
      if (SABOTAGE === 'atterrissage') t = t.replace('function ouvrir(cle) {\n    ouverte = true; atterrir = true;', 'function ouvrir(cle) {\n    ouverte = true; atterrir = false;');
      corps = Buffer.from(t);
    }
    return r.fulfill({ status: 200, contentType: TYPES[extname(f)] || 'application/octet-stream', body: corps });
  });
}
await ctx.route('**/*', routeReel);   // la lecture seule passe en dernier recours : Playwright appelle la route la plus récente d'abord

/* La connexion admin, par le DOMAINE (comme Kevin) : l'empreinte part à /__admin/login, jamais affichée. sw.js est servi sans compte. */
async function connecter(page) {
  await page.goto(BASE + '/sw.js', { waitUntil: 'domcontentloaded', timeout: 60000 });
  return page.evaluate(async (h) => {
    const x = await fetch('/__admin/login', { method: 'POST', credentials: 'include', cache: 'no-store', headers: { 'content-type': 'application/json', 'x-kdmc-verif': '1' }, body: JSON.stringify({ hash: h }) });
    const j = await x.json().catch(() => ({}));
    try { if (j.grant) localStorage.setItem('kdmc_admin_grant', j.grant); if (j.token) localStorage.setItem('kdmc_sso_token', j.token); } catch (_) { /* stockage interdit */ }
    return { st: x.status, ok: !!j.ok, raison: j.reason || '' };
  }, HASH);
}
const rangDe = (m) => (m.nonLus ? 1 : (m.fil && m.fil.length ? (m.fil[m.fil.length - 1].moi ? 3 : (m.repondre === 'direct' ? 2 : 4)) : (m.repondre === 'direct' ? 2 : 4)));

try {
  const page = await ctx.newPage();
  const fautes = []; page.on('pageerror', (e) => fautes.push(String(e && e.message).slice(0, 120)));

  /* A. connexion */
  const c = await connecter(page);
  ok(c.ok, 'connexion ADMIN au domaine (le code, vérifié par kd-mc.com — comme quand Kevin le tape)', c.ok ? '' : `HTTP ${c.st} ${c.raison}`);
  if (!c.ok) { await browser.close(); fin(1); }

  /* B. ce qui est SERVI */
  const servi = await page.evaluate(async () => {
    const t = async (p) => { try { const x = await fetch(p, { cache: 'no-store' }); return x.ok ? await x.text() : ''; } catch (_) { return ''; } };
    return { sw: await t('/sw.js'), boite: await t('/kdmc-boite.js') };
  });
  const vServie = (/kdmc-apex-v([0-9.]+)/.exec(servi.sw) || [])[1] || '';
  const vDepot = (/kdmc-apex-v([0-9.]+)/.exec(readFileSync(join(RACINE, 'kdmc-home/sw.js'), 'utf8')) || [])[1] || '';
  ok(vServie && vServie === vDepot, `la version servie (portail v${vServie || '?'}) est celle du dépôt (v${vDepot})`, 'le déploiement n\'a pas (encore) pris — ne pas dire « en ligne »');
  ok(/function trier/.test(servi.boite) && /function choisirAtterrissage/.test(servi.boite), 'le kdmc-boite.js SERVI contient le classement et l\'atterrissage direct', servi.boite.length + ' octets');

  /* C0. la LECTURE de la boîte, mesurée à part (18.10 : le premier run réel est resté sur « Lecture de la boîte… » sans dire pourquoi) : statut, durée, taille, raison. */
  const sonde = await page.evaluate(async () => {
    const t0 = performance.now(); let tok = ''; try { tok = localStorage.getItem('kdmc_sso_token') || ''; } catch (_) { /* stockage interdit */ }
    try {
      const ctl = new AbortController(); const stop = setTimeout(() => ctl.abort(), 45000);
      const x = await fetch('/__boite/admin', { credentials: 'include', cache: 'no-store', headers: tok ? { authorization: 'Bearer ' + tok } : {}, signal: ctl.signal });
      const txt = await x.text(); clearTimeout(stop); let j = null; try { j = JSON.parse(txt); } catch (_) { /* pas du JSON */ }
      return { st: x.status, ms: Math.round(performance.now() - t0), octets: txt.length, ok: !!(j && j.ok), raison: j && j.reason || '', msgs: j && Array.isArray(j.messages) ? j.messages.length : -1, ms: j && j.ms ? Object.keys(j.ms).map((k) => k + ':' + j.ms[k]).join(' ') : '', sources: j && Array.isArray(j.sources) ? j.sources.map((z) => z.id + ':' + z.etat).join(',') : '' };
    } catch (e) { return { st: 0, ms: Math.round(performance.now() - t0), octets: 0, ok: false, raison: String(e && e.name || e) }; }
  });
  ok(sonde.st === 200 && sonde.ok, `la boîte de Kevin répond : HTTP ${sonde.st} en ${sonde.ms} ms, ${sonde.octets} octets, ${sonde.msgs} entrée(s)${sonde.sources ? ' · apps ' + sonde.sources : ''}`, `raison « ${sonde.raison} »`);
  if (sonde.ms) dire(`ℹ️ où va le temps de la lecture (ms, mesuré côté routeur) : ${sonde.ms}`);

  /* C. le bandeau */
  const appels = []; page.on('response', (r) => { try { const u = new URL(r.url()); if (u.pathname.startsWith('/__')) appels.push(u.pathname + ' ' + r.status()); } catch (_) { /* url illisible */ } });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  /* 17.10 (diagnostic du run 39079117343) : le robot cliquait « Plus tard » de l'offre Face ID AVANT qu'elle existe (le portail attend la réponse du domaine) → il restait sur
     cet écran et ne voyait jamais l'accueil. On ATTEND l'offre (ou l'accueil), puis on la passe — comme Kevin quand il touche « Plus tard ». */
  await page.waitForSelector('#pk-skip, #cercle-alerte:not([hidden])', { state: 'attached', timeout: 30000 }).catch(() => {});
  await page.evaluate(() => { const b = document.getElementById('pk-skip'); if (b) b.click(); }).catch(() => {});
  await page.waitForFunction(() => { const a = document.getElementById('cercle-alerte'); return a && !a.hidden; }, null, { timeout: 75000 }).catch(() => {});
  const ban = await page.evaluate(() => { const a = document.getElementById('cercle-alerte'); return a && !a.hidden ? { t: a.textContent.slice(0, 120), h: Math.round(a.getBoundingClientRect().height) } : null; });
  ok(!!ban && ban.h >= 44, 'le bandeau 📬 s\'affiche (connecté comme Kevin) et fait ≥ 44 px', ban ? `${ban.h} px` : 'bandeau absent : session non admin ? ' + (await page.evaluate(() => document.body.innerText.slice(0, 120))));
  await vue(page, '1-bandeau.png');
  if (!ban) {
    /* POURQUOI le portail n'affiche rien : des statuts et des noms de clés seulement (jamais une valeur) */
    const diag = await page.evaluate(() => { let cles = ''; try { cles = Object.keys(localStorage).filter((k) => /kdmc|sso|admin/i.test(k)).join(','); } catch (_) { /* stockage interdit */ }
      const b = window.kdmcBoite, z = (id) => { const e = document.getElementById(id); return e ? (e.hidden ? 'caché' : 'visible') : 'absent'; };
      return { chemin: location.pathname + location.hash.slice(0, 20), boite: typeof b, donnees: !!(b && b.donnees && b.donnees()), cles, texte: document.body.innerText.length, sso: typeof window.kdmcSSO, jeton: !!(window.kdmcSSO && window.kdmcSSO.token && window.kdmcSSO.token()), bandeau: z('cercle-alerte'), espacePrive: z('priv-zone'), tableau: z('tdb-haut'), sw: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
        ecran: Array.from(document.body.children).filter((e) => e.id && e.tagName !== 'SCRIPT').map((e) => e.id + (e.hidden || getComputedStyle(e).display === 'none' ? ':caché' : ':visible')).join(','), titre: (document.querySelector('h1, h2') || {}).textContent ? document.querySelector('h1, h2').textContent.slice(0, 50) : '' }; }).catch((e) => ({ erreur: String(e && e.message).slice(0, 80) }));
    /* ce que le DOMAINE répond au portail sur « qui es-tu » : des booléens et un état, jamais un nom */
    const qui = await page.evaluate(async () => { try { const t = localStorage.getItem('kdmc_sso_token') || ''; const x = await fetch('/__sso/whoami', { credentials: 'include', cache: 'no-store', headers: t ? { authorization: 'Bearer ' + t } : {} }); const j = await x.json().catch(() => ({})); return { st: x.status, ok: !!j.ok, admin: !!j.admin, verified: !!j.verified, state: j.state || '', nom: !!j.name, code: !!j.code, cgu: !!j.cgu, portee: j.portee || '', attente: j.attente_admin || '', tel: j.tel_pose, codeRequis: !!j.code_requis, telAConfirmer: !!j.tel_a_confirmer, horsPerimetre: !!j.hors_perimetre }; } catch (e) { return { erreur: String(e && e.message).slice(0, 60) }; } });
    dire('ℹ️ whoami (ce que le domaine répond à la session du robot) : ' + JSON.stringify(qui));
    dire('ℹ️ diagnostic du portail : ' + JSON.stringify(diag) + ' · appels du domaine : ' + (appels.slice(0, 25).join(' ; ') || 'aucun') + ' · erreurs de page : ' + (fautes.slice(0, 5).join(' | ') || 'aucune'));
  }
  const D = await page.evaluate(() => (window.kdmcBoite && window.kdmcBoite.donnees && window.kdmcBoite.donnees()) || null);
  ok(!!D && Array.isArray(D.messages), 'le portail a LU la boîte (donnée présente) — sans elle, les contrôles suivants ne prouveraient rien', 'donnée absente : lecture lente, 401 ou panne');
  if (!D) { await vue(page, '9-sans-donnee.png'); await browser.close(); fin(1); }
  const nbMsg = D ? (D.messages || []).length : 0;
  dire(`ℹ️ la boîte de Kevin contient ${nbMsg} entrée(s), dont ${D ? (D.messages || []).filter((m) => m.source === 'alertes').length : 0} alerte(s) ; ${D ? D.nonLus || 0 : 0} message(s) non lu(s)`);

  /* D. l'atterrissage */
  const attendu = D ? (D.messages || []).filter((m) => m.repondre === 'direct' && m.nonLus).sort((a, b) => (b.ts || 0) - (a.ts || 0))[0] : null;
  await page.evaluate(() => { const a = document.getElementById('cercle-alerte'); if (a) a.click(); });
  await page.waitForTimeout(1500);
  const at = await page.evaluate(() => { const r = document.getElementById('boite-fen'); return r && !r.hidden ? { conv: r.getAttribute('data-conv'), ta: !!r.querySelector('textarea'), cartes: r.querySelectorAll('.bf-liste .bf-c').length } : null; });
  await vue(page, '2-apres-toucher.png');
  if (attendu) ok(!!at && at.conv === attendu.cle && at.ta, `un toucher sur le bandeau ATTERRIT sur la conversation non lue la plus récente (${nom(attendu.de)})`, detail(at));
  else ok(!!at && !at.conv, 'rien de non lu à qui répondre : le bandeau ouvre la LISTE', detail(at));

  /* E. la liste « Tous » */
  if (at && at.conv) { await page.evaluate(() => { const b = document.querySelector('#boite-fen .bf-ret'); if (b) b.click(); }); await page.waitForTimeout(500); }
  const liste = await page.evaluate(() => ({ noms: [...document.querySelectorAll('#boite-fen .bf-liste .bf-c .bf-de')].map((x) => x.textContent), grp: [...document.querySelectorAll('#boite-fen .bf-grp')].map((x) => x.textContent) }));
  await vue(page, '3-liste-tous.png');
  const vrais = D ? (D.messages || []).filter((m) => m.source !== 'alertes') : [];
  ok(liste.noms.length === vrais.length, `la liste « Tous » montre ${liste.noms.length} entrée(s) = les ${vrais.length} vrais messages (aucune alerte, aucune connexion)`, detail(liste.noms));
  const parNom = new Map(vrais.map((m) => [m.de, m]));
  const rangs = liste.noms.map((n) => (parNom.get(n) ? rangDe(parNom.get(n)) : 9));
  ok(rangs.every((r, i) => i === 0 || rangs[i - 1] <= r) && !rangs.includes(9), 'l\'ordre affiché suit le classement : non lu → lu sans réponse → répondu → autres (rangs ' + rangs.join(',') + ')', detail(liste.noms));
  const nbGroupes = new Set(rangs.map((r) => (r <= 2 ? 1 : r))).size;
  ok(nbGroupes <= 1 ? liste.grp.length === 0 : liste.grp.length === nbGroupes, `les intitulés de groupe : ${liste.grp.length} pour ${nbGroupes} groupe(s) (aucun s'il n'y en a qu'un)`, detail(liste.grp));

  /* F. le tableau de bord admin (Messages) */
  if (!LOCAL) {
    await page.evaluate(() => { const b = document.querySelector('#boite-fen .bf-x'); if (b) b.click(); });
    await page.goto(BASE + '/admin/#messages', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#tb-messages .mess, #tb-messages .info', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const adm = await page.evaluate(() => ({ lignes: [...document.querySelectorAll('#tb-messages .mess button')].map((b) => b.textContent), badge: ((document.querySelector('.vbadge,[data-version],.version-badge') || {}).textContent || '').slice(0, 20) }));
    await vue(page, '4-admin-messages.png');
    ok(!adm.lignes.some((t) => /s'est connect|nouvel appareil|code admin refus/i.test(t)), `tableau de bord › Messages : ${adm.lignes.length} ligne(s), aucune connexion ni alerte`, detail(adm.lignes));
  } else dire('ℹ️ tableau de bord admin : non essayé en ESSAI_LOCAL (essayé par verify-admin-unique)');

  dire(`ℹ️ lecture seule : ${ecritures.length} écriture(s) absorbée(s) (${[...new Set(ecritures)].join(', ') || 'aucune'}) — la boîte de Kevin n'a pas bougé`);
  ok(fautes.length === 0, 'aucune erreur JavaScript', fautes.join(' | '));
  await browser.close();
  fin(echecs ? 1 : 0);
} catch (e) {
  dire('❌ le robot a échoué : ' + String(e && e.message || e).slice(0, 240));
  try { await browser.close(); } catch (_) { /* déjà fermé */ }
  fin(1);
}
