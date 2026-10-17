#!/usr/bin/env node
/* LINGUA COMME KEVIN — « Connecte-toi comme moi et teste tout dans Lingua réel, comme moi » (Kevin 16.10.2026).
 *
 * Ce que fait la sonde, sur le VRAI domaine, avec la VRAIE session de Kevin (code admin → /__admin/login, secret
 * CI, jamais journalisé — tools/smoke/session-kevin.mjs) et un écran d'iPhone :
 *   arrivée sur SON compte · ses cartes d'accueil · les 6 onglets · « La vraie vie » et une leçon jouée jusqu'au bout ·
 *   un APPEL de Bee avec la vraie IA (3 répliques écrites, puis le bilan de fin d'appel) · son cercle (vue admin) ·
 *   son profil · le traducteur · la phrase du jour. Une capture d'écran par étape.
 *
 * SON COMPTE NE BOUGE PAS (règle d'or) : toute requête qui ÉCRIT vers le domaine est coupée et comptée —
 *   · sauvegarde de progression, messages, sessions, présence, journaux… → réponse locale « lecture seule » ;
 *   · le battement du cercle (qui écrit présence + XP) est REMPLACÉ par sa lecture pure `GET /__cercle/etat`
 *     (même réponse, rien d'écrit) ;
 *   · seuls passent les appels à l'IA en mode `appel` / `appel-bilan` : le routeur ne les note nulle part
 *     (le coach écrit, lui, la question dans le fil de la personne → coupé, et c'est DIT).
 *   La leçon, l'appel, les XP gagnés n'existent que dans ce navigateur jetable.
 *   Navigations et fichiers marqués `x-kdmc-sonde` (le routeur ne fiche ni ne compte la visite).
 *
 * Journal public possible (dépôt kd-mc) : on n'y écrit QUE des nombres et des oui/non — aucun nom, aucun message,
 * aucun ami, aucun jeton. Les captures (qui montrent l'écran de Kevin) vont sur une branche du COFFRE privé.
 *
 * node tools/smoke/lingua-comme-kevin.mjs [https://lingua.kd-mc.com] [--portail=https://kd-mc.com]
 *      [--captures=dossier] [--rapide] [--sans-garde (TESTS LOCAUX SEULEMENT : prouve que le compteur d'écritures marche)]
 */
import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { passPortail, ADMIN } from './session-kevin.mjs';
import { marquerSonde } from './marquer-sonde.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const BASE = (args.find((a) => !a.startsWith('--')) || 'https://lingua.kd-mc.com').replace(/\/+$/, '');
const PORTAIL = opt('portail', 'https://kd-mc.com').replace(/\/+$/, '');
const CAP = opt('captures', '/tmp/lingua-comme-kevin');
const SANS_GARDE = args.includes('--sans-garde');
const RAPIDE = args.includes('--rapide');   /* tests locaux : saute la leçon et l'appel (le compteur d'écritures n'en a pas besoin) */
/* TESTS LOCAUX : tout *.kd-mc.com est servi par une copie locale (routeur réel) — refusé hors de localhost. */
const REDIR = opt('rediriger', '').replace(/\/+$/, '');
if (REDIR && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(REDIR)) { console.error('--rediriger : localhost seulement.'); process.exit(2); }
const hoteBase = new URL(BASE).hostname;
if (SANS_GARDE && !REDIR) { console.error('--sans-garde : tests locaux seulement (avec --rediriger).'); process.exit(2); }
const versServeur = (u) => (REDIR ? REDIR + u.pathname + u.search : u.href);
mkdirSync(CAP, { recursive: true });

const R = { ok: [], ko: [], gris: [] };
const dire = (s) => console.log(s);
const ok = (m) => { R.ok.push(m); dire('✅ ' + m); };
const ko = (m) => { R.ko.push(m); dire('❌ ' + m); };
const gris = (m) => { R.gris.push(m); dire('⚠ ' + m); };
const chk = (c, m, d) => (c ? ok(m) : ko(m + (d !== undefined ? ' → ' + String(d).slice(0, 160) : '')));
let nCap = 0;
const capture = async (page, nom) => { nCap++; await page.screenshot({ path: join(CAP, String(nCap).padStart(2, '0') + '-' + nom + '.jpg'), type: 'jpeg', quality: 55 }).catch(() => {}); };

/* ─── la session de Kevin ─── */
dire(`\n=== LINGUA COMME KEVIN — ${BASE} ===`);
const pp = await passPortail(PORTAIL).catch((e) => ({ ok: false, note: String((e && e.message) || e) }));
if (!pp.ok) { ko('session de Kevin : ' + (pp.note || 'refusée') + (pp.statut ? ' (HTTP ' + pp.statut + ')' : '')); fin(); }
ok('session de Kevin ouverte pour de vrai (code admin → /__admin/login)' + (pp.adminProuve ? ', admin PROUVÉ' : ', admin non prouvé'));

const domaineCookie = /kd-mc\.com$/.test(hoteBase) ? '.kd-mc.com' : hoteBase;
const nav = await chromium.launch();
const ctx = await nav.newContext({ ...devices['iPhone 13'], locale: 'fr-FR', serviceWorkers: 'block' });
/* comme l'iPhone de Kevin : Lingua ouverte depuis l'écran d'accueil (mode « installé ») — c'est là que la bulle de version se
   posait sur les onglets (photo du 17.10). */
await ctx.addInitScript(() => { try { Object.defineProperty(navigator, 'standalone', { get: () => true }); } catch (e) { /* */ } });
await ctx.addCookies([{ name: 'kdmc_sso', value: pp.jeton, domain: domaineCookie, path: '/', secure: BASE.startsWith('https'), httpOnly: true, sameSite: 'Lax' }]);
await marquerSonde(ctx, 'lingua-comme-kevin', [BASE, PORTAIL]);
await ctx.route((u) => /\.(png|jpe?g|gif|webp|mp4|webm|woff2?|ttf|otf)($|\?)/i.test(u.pathname), (r) => r.abort());
if (REDIR) await ctx.route((u) => u.hostname === 'kd-mc.com' || u.hostname.endsWith('.kd-mc.com'), async (route, req) => {
  const u = new URL(req.url());
  const r = await route.fetch({ url: versServeur(u), headers: Object.assign({}, req.headers(), { 'x-hote': u.hostname, cookie: 'kdmc_sso=' + pp.jeton }) }).catch(() => null);
  return r ? route.fulfill({ response: r }) : route.abort();
});

/* ─── la garde « son compte ne bouge pas » (enregistrée EN DERNIER : Playwright essaie la dernière route d'abord) ─── */
const bloquees = [], iaPassees = [];
const notreDomaine = (u) => u.hostname === hoteBase || u.hostname === 'kd-mc.com' || u.hostname.endsWith('.kd-mc.com') || u.hostname === new URL(PORTAIL).hostname;
if (!SANS_GARDE) await ctx.route((u) => notreDomaine(u), async (route, req) => {
  const m = req.method(); const u = new URL(req.url());
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return route.fallback();
  if (u.pathname === '/__lingua/ai') {
    let mode = ''; try { mode = JSON.parse(req.postData() || '{}').mode || ''; } catch {}
    if (mode === 'appel' || mode === 'appel-bilan') { iaPassees.push(mode); return route.fallback(); }
  }
  if (u.pathname === '/__cercle/battement') {   /* même réponse, sans écrire : la lecture pure */
    bloquees.push('POST /__cercle/battement → GET /__cercle/etat');
    const r = await route.fetch({ url: versServeur(new URL(u.origin + '/__cercle/etat')), method: 'GET', headers: Object.assign({}, req.headers(), { 'x-hote': u.hostname }, REDIR ? { cookie: 'kdmc_sso=' + pp.jeton } : {}) }).catch(() => null);
    return r ? route.fulfill({ response: r }) : route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false,"reason":"lecture_seule"}' });
  }
  bloquees.push(m + ' ' + u.host + u.pathname);
  return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false,"reason":"lecture_seule","sonde":"lingua-comme-kevin"}' });
});

const page = await ctx.newPage();
/* ce qu'une écoute fait entendre : l'adresse donnée à la balise audio (…/tts?…&t=mot) ou le texte de la voix du
   téléphone. Noté dans la page, rien ne sort. */
await page.addInitScript(() => {
  window.__entendus = [];
  const d = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
  Object.defineProperty(HTMLMediaElement.prototype, 'src', { configurable: true, get() { return d.get.call(this); },
    set(v) { try { const t = new URL(v, location.href).searchParams.get('t'); if (t) window.__entendus.push(t); } catch {} d.set.call(this, v); } });
  try { const sp = speechSynthesis.speak.bind(speechSynthesis); speechSynthesis.speak = (u) => { try { window.__entendus.push(String(u.text || '')); } catch {} return sp(u); }; } catch {}
});
const erreurs = [], echecs = [];
page.on('pageerror', (e) => erreurs.push(String(e.message).slice(0, 160)));
page.on('response', (r) => { try { if (r.status() >= 500 && notreDomaine(new URL(r.url()))) echecs.push(r.status() + ' ' + new URL(r.url()).pathname); } catch {} });
const attends = (ms) => page.waitForTimeout(ms);
const texte = () => page.evaluate(() => (document.body.innerText || '').trim()).catch(() => '');
const clic = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; e.click(); return true; }, sel).catch(() => false);
const onglet = (nom) => page.evaluate((n) => { const t = [...document.querySelectorAll('.tabbar .tab')].find((x) => (x.textContent || '').includes(n)); if (!t) return false; t.click(); return true; }, nom).catch(() => false);
const fermerModales = async () => { for (let i = 0; i < 4; i++) { const f = await page.evaluate(() => { const m = document.querySelector('.overlay.show'); if (!m) return false; const b = [...m.querySelectorAll('button')].find((x) => /Fermer|Continuer|Plus tard|Pas maintenant|OK/i.test(x.textContent || '')); if (b) b.click(); else m.remove(); return true; }).catch(() => false); if (!f) return; await attends(400); } };

try {
  /* 1. arrivée */
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 45000 }); await attends(4500);
  await capture(page, 'arrivee');
  const ver = await page.evaluate(() => window.LINGUA_VER || '').catch(() => '');
  chk(!!ver, `version servie : ${ver || 'INCONNUE'}`);
  const compte = await page.evaluate((prenom) => {
    let acc = []; let cur = ''; try { acc = JSON.parse(localStorage.getItem('lingua_g_accounts') || '[]'); cur = JSON.parse(localStorage.getItem('lingua_g_current') || '""'); } catch {}
    const a = acc.find((x) => x.id === cur) || {};
    return { ecranComptes: !!document.querySelector('.acc-card.add'), cestLui: new RegExp(prenom, 'i').test(String(a.name || '')), comptes: acc.length };
  }, ADMIN.nom.split(' ')[0]).catch(() => ({}));
  chk(!compte.ecranComptes && compte.cestLui, 'Lingua s\'ouvre directement sur TON compte (pas d\'écran « choisir un compte »)', JSON.stringify(compte));
  await fermerModales();
  /* pas encore de langue sur ce compte → l'écran « Choisis une langue » : on prend l'anglais, dans CE navigateur seulement */
  const choix = await page.evaluate(() => /Choisis une langue/.test(document.body.innerText || '') && document.querySelectorAll('.course-card').length).catch(() => 0);
  if (choix) {
    const n = await page.evaluate(() => { const c = [...document.querySelectorAll('.course-card')].find((x) => /Anglais/.test(x.textContent || '')); if (!c) return 0; c.click(); return 1; }).catch(() => 0);
    gris(`ton compte n'avait aucune langue en cours : la sonde a choisi l'anglais (${choix} langues proposées) — dans ce navigateur seulement, rien d'écrit`);
    await attends(1500); await fermerModales();
    void n;
  } else {
    const langue = await page.evaluate(() => (document.querySelector('#tbFlag') || {}).textContent || '').catch(() => '');
    ok('ta langue en cours est chargée ' + (langue ? '(' + langue.trim().slice(0, 4) + ')' : ''));
  }

  /* 2. accueil */
  const cartes = await page.evaluate(() => ['vie-link', 'appel-link', 'cercle-link', 'verbs-link', 'pron-link', 'hist-link', 'stats-link']
    .filter((c) => document.querySelector('.' + c))).catch(() => []);
  chk(cartes.length >= 6, `cartes de l'accueil : ${cartes.length}/7 (${cartes.join(', ')})`);
  /* 17.10 (photo de Kevin) : rien de ce que le domaine pose par-dessus ne cache les onglets ni le haut de l'écran */
  await attends(1800);
  const dessus = await page.evaluate(() => {
    const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return b.width && b.height ? { l: b.left, r: b.right, t: b.top, b: b.bottom } : null; };
    const sur = (a, b) => !!(a && b && a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t);
    const barre = r(document.querySelector('.tabbar')), haut = r(document.querySelector('.topbar'));
    const poses = [['bulle de version', '#kdmc-version-badge'], ['✉️', 'button[aria-label="Écrire à l\'admin"]'], ['« ← Portail »', 'a[data-kdmc-pastille]']]
      .map(([n, q]) => [n, r(document.querySelector(q))]).filter((x) => x[1]);
    return { barre: !!barre, portail: !!document.querySelector('.tabbar a[data-kdmc-retour][href="https://kd-mc.com/"]'),
      caches: poses.filter(([, x]) => sur(x, barre) || sur(x, haut)).map(([n]) => n) };
  }).catch(() => ({ caches: ['(lecture impossible)'] }));
  chk(dessus.barre && dessus.caches.length === 0, `rien ne cache tes onglets ni le haut de l'écran (iPhone « installé ») ${dessus.caches.length ? '— cachent : ' + dessus.caches.join(', ') : ''}`);
  chk(dessus.portail, 'ta sortie « 🚪 Portail » est dans la barre du bas');
  const pod = await page.evaluate(() => { const p = document.querySelector('.plan-phrase'); if (!p) return null; return { t: (p.querySelector('b') || {}).textContent || '', fr: (p.querySelector('.pod-fr') || {}).textContent || '' }; }).catch(() => null);
  if (pod) chk(!!pod.t && pod.t.trim() !== pod.fr.trim(), 'phrase du jour : une vraie traduction (pas le français recopié)'); else gris('phrase du jour non affichée sur ce compte');
  await capture(page, 'accueil');

  /* 3. les 6 onglets */
  const empreintes = new Set(); let vus = 0;
  for (const n of ['Accueil', 'Réviser', 'Coach', 'Traduire', 'Ligue', 'Profil']) {
    if (await onglet(n)) { await attends(1200); const t = await texte(); if (t.length > 40) { vus++; empreintes.add(t.slice(0, 200)); } await capture(page, 'onglet-' + n.toLowerCase()); }
  }
  chk(vus === 6 && empreintes.size >= 5, `les 6 onglets s'affichent et sont différents (${vus}/6, ${empreintes.size} écrans distincts)`);

  /* 4. profil : la mémoire en ligne de Kevin */
  await onglet('Profil'); await attends(900);
  const prof = await texte();
  chk(/Compte KDMC[\s\S]{0,40}suit ton compte|Mémoire en ligne active/i.test(prof) && !/Mémoire en ligne[\s\S]{0,6}inactive/i.test(prof), 'profil : ta progression est liée à ton compte (mémoire en ligne active)');

  /* 5. traducteur */
  await onglet('Traduire'); await attends(700);
  await page.fill('#trQ', 'bonjour').catch(() => {}); await page.press('#trQ', 'Enter').catch(() => {}); await attends(700);
  const trad = await page.evaluate(() => document.querySelectorAll('#trOut .tr-card').length).catch(() => 0);
  chk(trad >= 10, `traducteur : « bonjour » traduit dans ${trad} langues`);

  /* 6. le cercle (vue admin) */
  await onglet('Accueil'); await attends(700);
  if (await clic('.cercle-link')) {
    await attends(2500);
    const c = await page.evaluate(() => ({ titre: !!document.querySelector('.screen.cercle'), amis: document.querySelectorAll('.cercle-ami').length,
      admin: /Tous les membres|tous les comptes|Journal|admin/i.test(document.body.innerText || '') })).catch(() => ({}));
    chk(c.titre, `ton cercle s'ouvre (${c.amis || 0} ligne(s) ; vue admin ${c.admin ? 'présente' : 'absente'})`);
    await capture(page, 'cercle');
    await fermerModales(); await onglet('Accueil'); await attends(800); /* pas de goBack : il quitterait Lingua */
  } else gris('carte « Mon cercle » absente');

  /* 7. La vraie vie + une leçon jouée jusqu'au bout */
  await fermerModales();
  if (RAPIDE) gris('mode rapide (test du compteur) : leçon et appel non joués');
  else if (await clic('.vie-link')) {
    await attends(600);
    const vv = await page.evaluate(() => ({ u: document.querySelectorAll('.vie-unite').length, l: document.querySelectorAll('.vie-lecon').length })).catch(() => ({}));
    chk(vv.u === 10 && vv.l === 20, `« La vraie vie » : ${vv.u} situations, ${vv.l} leçons`);
    await capture(page, 'vraie-vie');
    await clic('.vie-lecon'); await attends(1500);
    /* Joue comme une vraie personne : une erreur montre la bonne réponse, la sonde la RETIENT et répond juste quand
       la question revient (Lingua repose chaque question ratée — avec les cœurs ∞ de Kevin, une sonde qui répond
       « x » ne finirait jamais). Une écoute est reconnue au mot que Lingua envoie à la synthèse vocale. */
    const memoire = new Map();
    let etapes = 0, phrase = false, finie = false, justes = 0;
    for (; etapes < 160; etapes++) {
      if (!(await page.$('.lesson-body'))) { finie = true; break; }
      await attends(450);
      const q = await page.evaluate(() => {
        const t = (s) => ((document.querySelector(s) || {}).textContent || '').trim();
        const opts = [...document.querySelectorAll('.ex .opt')].map((b) => b.textContent.trim());
        const ent = (window.__entendus || []).splice(0);
        return { ent, bulle: t('.bubble'), mot: t('.q-word'), audio: !!document.querySelector('.q-audio'), opts, match: !!document.querySelector('.match-grid'),
          bank: !!document.querySelector('.bank-src'), champ: !!document.querySelector('.type-input'), passe: !!document.querySelector('.lesson-body .skip') };
      }).catch(() => ({}));
      if (/Traduis cette phrase/.test(q.bulle || '')) phrase = true;
      const sig = [q.bulle, q.mot, q.audio ? 'audio:' + (q.ent || []).slice(-1).join('') : '', (q.opts || []).slice().sort().join('/')].join('#');
      const sol = memoire.get(sig);
      if (q.passe) await clic('.lesson-body .skip');
      else if (q.match) {   /* associer les paires : on essaie, une mauvaise paire clignote sans rien coûter */
        for (let k = 0; k < 6; k++) {
          const g = await page.$$eval('.mcol', (cs) => cs.map((c) => [...c.querySelectorAll('.mtile:not(.matched)')].length)).catch(() => [0]);
          if (!g[0]) break;
          for (let j = 0; j < g[1]; j++) {
            await page.evaluate((jj) => { const c = document.querySelectorAll('.mcol'); const a = c[0].querySelector('.mtile:not(.matched)'); const b = c[1].querySelectorAll('.mtile:not(.matched)')[jj]; if (a && b) { a.click(); b.click(); } }, j).catch(() => {});
            await attends(520);
            const reste = await page.$$eval('.mcol', (cs) => [...cs[0].querySelectorAll('.mtile:not(.matched)')].length).catch(() => 0);
            if (reste < g[0]) break;
          }
        }
      } else if (q.opts && q.opts.length) {
        await page.evaluate((v) => { const o = [...document.querySelectorAll('.ex .opt')]; (o.find((b) => b.textContent.trim() === v) || o[0]).click(); }, sol || '').catch(() => {});
      } else if (q.bank) {
        await page.evaluate((v) => { const src = () => [...document.querySelectorAll('.bank-src .tok:not(.used)')];
          if (!v) { const b = src()[0]; if (b) b.click(); return; }
          for (const m of v.split(' ')) { const b = src().find((x) => x.textContent === m); if (b) b.click(); } }, sol || '').catch(() => {});
      } else if (q.champ) await page.fill('.type-input', sol || 'x').catch(() => {});
      await attends(200); await clic('.lesson-foot .btn-main'); await attends(700);
      const fb = await page.evaluate(() => { const f = document.querySelector('.lesson-foot .feedback'); if (!f) return null;
        const b = f.querySelector('b'); const n = b && b.nextSibling; return { ok: /^✅/.test((b || f).textContent.trim()), sol: (n && n.nodeType === 3 ? n.textContent : '').trim() }; }).catch(() => null);
      if (process.env.LCK_DEBUG) console.error('DBG', JSON.stringify({ sig, sol, fb }));
      if (fb && fb.ok) justes++;
      else if (fb && fb.sol) memoire.set(sig, fb.sol);
      await clic('.lesson-foot .btn-main'); await attends(350);
    }
    chk(phrase, 'leçon : un exercice « Traduis cette phrase » de la vraie vie est posé');
    chk(finie, `leçon jouée jusqu'au bout (${etapes} questions, ${justes} justes, ${memoire.size} corrections retenues)`);
    await capture(page, 'fin-de-lecon');
    await fermerModales(); await onglet('Accueil'); await attends(600);
  } else ko('carte « La vraie vie » absente');

  /* 8. l'appel de Bee, avec la vraie IA */
  await fermerModales();
  if (RAPIDE) { /* rien */ } else if (await clic('.appel-link')) {
    await attends(800); await capture(page, 'appel-reglages');
    const lance = await page.evaluate(() => { const b = [...document.querySelectorAll('.modal button')].find((x) => /Appeler .* maintenant/.test(x.textContent || '')); if (!b) return false; b.click(); return true; }).catch(() => false);
    if (lance) {
      await attends(1500);
      await clic('.ap-decroche'); await attends(2000);
      let repliques = 0;
      for (let i = 0; i < 3; i++) {
        await page.waitForFunction(() => { const k = document.querySelector('.ap-clavier'); const e = document.querySelector('.ap-etat'); return (k && !k.hidden) || /attente|À toi|Réponds/i.test((e || {}).textContent || ''); }, null, { timeout: 30000 }).catch(() => {});
        await clic('.ap-kb'); await attends(300);
        const msgs = ['Hello Bee, I am fine thank you', 'I like to cook pasta', 'I eat with my family'];
        /* comme une personne : on attend que Bee ait fini de réfléchir, et on ne compte que les répliques ACCEPTÉES (champ vidé) */
        await page.waitForFunction(() => !/réfléchit/.test((document.querySelector('.ap-etat') || {}).textContent || ''), null, { timeout: 30000 }).catch(() => {});
        await page.fill('.ap-input', msgs[i]).catch(() => {}); await clic('.ap-envoi'); await attends(200);
        if (await page.evaluate(() => ((document.querySelector('.ap-input') || {}).value || '') === '').catch(() => false)) repliques++;
        await attends(6000);
      }
      await capture(page, 'appel-en-cours');
      const sous = await page.evaluate(() => (document.querySelector('.disc-sub') || {}).textContent || '').catch(() => '');
      chk(iaPassees.filter((x) => x === 'appel').length >= 2 && sous.trim().length > 5, `appel : Bee répond pour de vrai (${iaPassees.filter((x) => x === 'appel').length} réponses de l'IA, ${repliques} répliques écrites)`);
      await clic('.ap-raccroche');
      await page.waitForFunction(() => /Ton bilan|Bilan indisponible|Aucune faute/.test((document.querySelector('.ap-bilan') || {}).innerText || ''), null, { timeout: 30000 }).catch(() => {});
      const bil = await page.evaluate(() => { const b = document.querySelector('.ap-bilan'); return b ? { t: /Ton bilan|Aucune faute/.test(b.innerText), corr: b.querySelectorAll('.ap-corr').length } : null; }).catch(() => null);
      chk(bil && bil.t, `bilan de fin d'appel affiché (${bil ? bil.corr : 0} correction(s))`);
      await capture(page, 'appel-bilan');
      await clic('.ap-fin .btn-main'); await attends(600);
    } else gris('bouton « Appeler maintenant » introuvable dans les réglages d\'appel');
  } else ko('carte « Appeler Bee » absente');

  /* 9. le coach : non testé exprès */
  gris('coach non testé : une question au coach s\'écrit dans ton fil d\'activité (lecture seule oblige)');
} catch (e) {
  ko('la sonde s\'est arrêtée : ' + String((e && e.message) || e).slice(0, 160));
  await capture(page, 'arret');
}

/* 10. bilan de la garde */
chk(erreurs.length === 0, `erreurs JavaScript : ${erreurs.length}`, erreurs.slice(0, 3).join(' | '));
chk(echecs.length === 0, `réponses 5xx du domaine : ${echecs.length}`, echecs.slice(0, 3).join(' | '));
if (!SANS_GARDE) {
  ok(`ton compte n'a pas bougé : ${bloquees.length} écriture(s) coupée(s) avant le domaine (${[...new Set(bloquees.map((b) => b.replace(/^POST [^/]+/, 'POST ')))].slice(0, 6).join(', ')})`);
  dire(`   · appels à l'IA de Bee passés (ne s'écrivent nulle part) : ${iaPassees.length}`);
}
await nav.close();
fin();

function fin() {
  const ligne = `=== LINGUA COMME KEVIN ${R.ko.length ? 'ÉCHEC' : 'OK'} — ${R.ok.length} ✅ · ${R.ko.length} ❌ · ${R.gris.length} ⚠ ===`;
  dire('\n' + ligne);
  writeFileSync(join(CAP, 'RAPPORT.md'), ['# Lingua comme Kevin', '', ...R.ok.map((x) => '- ✅ ' + x), ...R.ko.map((x) => '- ❌ ' + x), ...R.gris.map((x) => '- ⚠ ' + x), '', ligne, ''].join('\n'));
  process.exit(R.ko.length ? 1 : 0);
}
