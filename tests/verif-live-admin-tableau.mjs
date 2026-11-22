/* VÉRIFICATION RÉELLE — « le tableau de bord admin : le plus récent d'abord, chaque information cliquable et qui atterrit au bon endroit » (Kevin 18.11.2026).
 * La page admin est derrière la porte du domaine : aucun outil ne pouvait dire QUELLE version est servie ni si les lignes mènent quelque part. Ce robot, connecté
 * en admin sur le VRAI domaine (code admin = SECRET, empreinte, jamais écrite ni journalisée), ouvre https://kd-mc.com/admin/ sur écran iPhone et MESURE :
 * la version affichée, le nombre de lignes du Journal et combien sont cliquables, les filtres, « Ce qui a bougé cette semaine », puis touche la puce d'app d'une
 * ligne et vérifie que le Journal se filtre (puce de filtre) et que la retirer le défait. LECTURE SEULE : tout envoi autre que la connexion est absorbé ; il se
 * présente comme un appareil de robot (ses pages ne se montrent pas à Kevin). Journal public : verdicts et NOMBRES seulement, aucun nom. À la main seulement. */
import { appendFileSync } from 'node:fs';
import { chromium } from 'playwright';

const HASH = String(process.env.KDMC_ADMIN_PIN_SHA256 || '').trim().toLowerCase();
const RESUME = process.env.GITHUB_STEP_SUMMARY || '';
const lignes = [];
const dire = (t) => { console.log(t); lignes.push(t); };
if (!/^[0-9a-f]{64}$/.test(HASH)) { dire('❌ Code admin absent (secret CI) : vérification réelle IMPOSSIBLE — je n\'affirme rien.'); process.exit(1); }

const browser = await chromium.launch(process.env.PW_EXE ? { executablePath: process.env.PW_EXE } : {});
const ctx = await browser.newContext({
  serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  /* 18.11 : ce robot tourne sur le poste de Kevin (runner du Lenovo), donc hors du réseau des robots : ses 10 pages ouvertes s'écrivaient dans le journal au nom
     du compte admin (52 lignes au 1er passage, effacées à la main). Il se présente donc comme un APPAREIL DE ROBOT connu du journal (iPhone · iOS 15.0 · Safari 18,
     `APPAREIL_ROBOT` dans services/kdmc-router/activite.js) : ses pages ne se montrent pas à Kevin et ne comptent que contre les robots. Il ne reste à effacer
     que ses lignes d'essai. */
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
});
/* MAIL_ESSAI=1 (à la main, jamais par défaut) : UN mail d'essai part au compte ADMIN lui-même, pour prouver l'envoi réel de la porte /__admin/mail-envoyer. */
const MAIL_ESSAI = process.env.MAIL_ESSAI === '1';
const DOMAINE = /(^|\.)kd-mc\.com$/, ECRITURE_OK = MAIL_ESSAI ? /^\/__(admin\/login|sso\/[a-z]+|admin\/mail-envoyer|admin\/matricule)$/ : /^\/__(admin\/login|sso\/[a-z]+|admin\/matricule)$/;   // 21.11 : /__admin/matricule passe, mais le robot n'y envoie QU'UNE forme refusée (« ROBOT ») : la porte répond 400 avant toute lecture, rien n'est écrit
await ctx.route('**/*', (r) => {
  const q = r.request(), m = q.method(); let u; try { u = new URL(q.url()); } catch (_) { return r.abort(); }
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return r.fallback();
  if (DOMAINE.test(u.hostname) && ECRITURE_OK.test(u.pathname)) return r.fallback();
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"lectureSeule":true}' });
});

const page = await ctx.newPage();
await page.goto('https://kd-mc.com/sw.js', { waitUntil: 'domcontentloaded', timeout: 60000 });
const c = await page.evaluate(async (h) => {
  const x = await fetch('/__admin/login', { method: 'POST', credentials: 'include', cache: 'no-store', headers: { 'content-type': 'application/json', 'x-kdmc-verif': '1' }, body: JSON.stringify({ hash: h }) });
  const j = await x.json().catch(() => ({}));
  return { st: x.status, ok: !!j.ok, raison: j.reason || '', token: j.token || '', grant: j.grant || '' };
}, HASH);
dire(`${c.ok ? '✅' : '❌'} connexion ADMIN au domaine${c.ok ? '' : ' — HTTP ' + c.st + ' ' + c.raison}`);
if (!c.ok) { await browser.close(); process.exit(1); }


const ATTENDUE = String(process.env.VERSION_ATTENDUE || '').trim();
let bons = 0, mauvais = 0;
const chk = (ok, t) => { if (ok) bons++; else mauvais++; dire(`${ok ? '✅' : '❌'} ${t}`); return ok; };
try {
  await page.evaluate(({ t, g }) => { try { if (t) localStorage.setItem('kdmc_sso_token', t); if (g) localStorage.setItem('kdmc_admin_grant', g); } catch (_) { /* rien */ } }, { t: c.token, g: c.grant });
  const rep = await page.goto('https://kd-mc.com/admin/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  chk(rep && rep.status() === 200, 'page admin servie · HTTP ' + (rep ? rep.status() : '?'));
  await page.waitForSelector('.fil-e, #tb-fil-vide, .fil-vide', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const m = await page.evaluate(() => {
    /* la version SERVIE = celle que la page demande pour son propre code (tableau.js?v=…), pas un texte d'écran */
    const sc = Array.from(document.scripts).map((x) => x.getAttribute('src') || '').find((x) => /(^|\/)tableau\.js\?v=/.test(x)) || '';
    const v = (sc.match(/\?v=(\d+\.\d+\.\d+)/) || [])[1] || '';
    const l = Array.from(document.querySelectorAll('.fil-e'));
    const heures = l.map((b) => { const h = b.querySelector('.h'); return h ? h.textContent.trim() : ''; });
    return {
      v, lignes: l.length, cliquables: l.filter((b) => b.getAttribute('data-va')).length, puces: document.querySelectorAll('.fil-e .app[data-va]').length,
      filtres: document.querySelectorAll('[data-fil-quoi]').length, notifs: !!document.querySelector('[data-fil-quoi="notifs"]'),
      apps: document.querySelectorAll('#tb-apps-activite [data-va^="filapp:"]').length, inscrits: document.querySelectorAll('.inscrit[data-va^="fiche:"]').length,
      toutFait: document.querySelectorAll('.tout-fait[data-va^="fil:"]').length, va: document.querySelectorAll('[data-va]').length, heures: heures.slice(0, 8).join(' '),
    };
  });
  chk(!!m.v && (!ATTENDUE || m.v === ATTENDUE), 'version affichée : ' + (m.v || 'illisible') + (ATTENDUE ? ' (attendue ' + ATTENDUE + ')' : ''));
  chk(m.lignes > 0 && m.cliquables === m.lignes, `Journal de l'accueil : ${m.lignes} ligne(s), ${m.cliquables} cliquable(s), ${m.puces} puce(s) d'app`);
  dire(`ℹ️ heures des premières lignes, du haut vers le bas : ${m.heures || '-'}`);
  chk(m.filtres >= 5 && m.notifs, `filtres « Quoi » : ${m.filtres}, dont Notifs : ${m.notifs ? 'oui' : 'NON'}`);
  dire(`ℹ️ « Ce qui a bougé cette semaine » : ${m.apps} app(s) · derniers inscrits : ${m.inscrits} · boutons « tout ce qu'elle a fait » : ${m.toutFait} · éléments cliquables vers une cible : ${m.va}`);
  if (m.puces > 0) {
    await page.locator('.fil-e .app[data-va]').first().click({ timeout: 8000 }).catch(() => {});
    const pose = await page.waitForSelector('#tb-fil-filtre [data-fil-efface]', { state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);
    chk(pose, 'toucher la puce d\'app d\'une ligne filtre le Journal sur cette app (puce de filtre affichée)');
    if (pose) {
      await page.waitForTimeout(1500);
      const apres = await page.evaluate(() => { const l = Array.from(document.querySelectorAll('.fil-e .app')); return { n: l.length, distinctes: new Set(l.map((x) => x.textContent.trim())).size }; });
      chk(apres.n > 0 && apres.distinctes === 1, `Journal filtré : ${apres.n} ligne(s), ${apres.distinctes} app distincte`);
      /* MESURÉ le 18.11 (run 44323908411 : « sous le doigt : div (AUTRE CHOSE) ») : un navigateur NEUF voit s'ouvrir une fois la feuille « Installer et notifications »
         (installer-client.js, 1,5 s après la connexion) et son fond plein écran recouvre la page. Kevin ne la voit qu'une fois par appareil ; le robot, lui, est neuf à
         chaque passage. On la ferme comme une personne : en touchant le fond. */
      const feuille = await page.waitForSelector('[data-kdmc-installer="feuille"]', { timeout: 4000 }).then(() => true).catch(() => false);
      if (feuille) {
        await page.evaluate(() => { const f = document.querySelector('[data-kdmc-installer="feuille"]'), fond = f && f.previousElementSibling; if (fond && fond.click) fond.click(); });
        const fermee = await page.waitForSelector('[data-kdmc-installer="feuille"]', { state: 'detached', timeout: 4000 }).then(() => true).catch(() => false);
        dire('ℹ️ feuille « Installer et notifications » ouverte (navigateur neuf) : ' + (fermee ? 'fermée en touchant le fond' : 'PAS fermée'));
      }
      /* avant de toucher : ce qui se trouve VRAIMENT sous le doigt au centre de la puce (une barre collée en haut peut la recouvrir) — balises et classes seulement */
      const dessous = await page.evaluate(() => {
        const b = document.querySelector('#tb-fil-filtre [data-fil-efface]'); if (!b) return 'puce absente';
        b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        const nom = (x) => (x ? x.tagName.toLowerCase() + (x.id ? '#' + x.id : '') + (x.className && typeof x.className === 'string' ? '.' + x.className.trim().split(/\s+/).slice(0, 2).join('.') : '') : 'rien');
        return 'puce ' + Math.round(r.width) + '×' + Math.round(r.height) + ' px à y=' + Math.round(r.top) + ' · sous le doigt : ' + nom(e) + (e && (e === b || b.contains(e)) ? ' (la puce)' : ' (AUTRE CHOSE)');
      });
      const errClic = await page.locator('#tb-fil-filtre [data-fil-efface]').first().click({ timeout: 8000 }).then(() => '').catch((e) => String(e && e.message || e).split('\n').slice(0, 6).join(' ⏎ ').replace(/[“”"][^“”"]{0,80}[“”"]/g, '«…»').slice(0, 400));
      const parti = await page.waitForSelector('#tb-fil-filtre [data-fil-efface]', { state: 'hidden', timeout: 8000 }).then(() => true).catch(() => false);
      chk(parti, 'retirer la puce défait le filtre');
      if (!parti) {
        const etat = await page.evaluate(() => { const p = document.getElementById('tb-fil-filtre'), s = document.getElementById('tb-fil-app'); return 'conteneur ' + (p ? (p.hidden ? 'caché' : 'visible') + ', ' + p.querySelectorAll('[data-fil-efface]').length + ' puce(s)' : 'absent') + ' · liste des apps ' + (s ? (s.value ? 'sur une app' : 'vide') : 'absente') + ' · vue ' + (document.body.getAttribute('data-vue') || '?'); });
        dire('   ↳ ' + dessous); dire('   ↳ toucher : ' + (errClic || 'réussi')); dire('   ↳ après : ' + etat);
      }
    }
  } else dire('ℹ️ aucune puce d\'app à l\'écran : le filtre par app n\'a pas pu être essayé');
  /* 19.11 (Kevin : « vérifie toujours tout ») : le journal admin et les boutons ouvrir / fermer, lus sur la vraie page — nombres seulement. */
  await page.waitForSelector('#audsec .tlrow', { state: 'attached', timeout: 15000 }).catch(() => {});
  const ja = await page.evaluate(() => {
    const l = Array.from(document.querySelectorAll('#audsec .tlrow')), lib = l.map((r) => { const b = r.querySelector('b'); return b ? b.textContent : ''; }).filter(Boolean);
    const f = Array.from(document.querySelectorAll('.bascule.fermee[data-bascule]'));
    return { lignes: lib.length, code: lib.filter((t) => /_/.test(t)).length, imprevus: lib.filter((t) => /^• /.test(t)).length, cibles: l.filter((r) => r.getAttribute('data-va')).length, total: l.length,
      plus: !!document.getElementById('aud-plus'), ouvertes: document.querySelectorAll('.bascule[data-bascule]:not(.fermee)').length, fermees: f.length,
      datees: f.filter((b) => / · (depuis|avant) le /.test((b.querySelector('.s') || {}).textContent || '')).length };
  });
  chk(ja.lignes > 0 && ja.code === 0, `journal admin : ${ja.lignes} ligne(s), ${ja.code} en nom de code, ${ja.imprevus} événement(s) sans phrase prévue`);
  chk(ja.total > 0 && ja.cibles === ja.total, `journal admin : ${ja.cibles} ligne(s) sur ${ja.total} mènent quelque part · bouton « plus anciens » : ${ja.plus ? 'oui' : 'non'}`);
  chk(ja.fermees + ja.ouvertes > 0, `ouvrir / fermer : ${ja.ouvertes} app(s) ouverte(s), ${ja.fermees} fermée(s) pour tous`);
  dire(`ℹ️ apps fermées qui disent depuis quand : ${ja.datees} sur ${ja.fermees} (les autres : fermeture plus ancienne que les 200 dernières lignes du journal)`);
  /* 19.11 (pont 2770, Kevin : « la liste des personnes qui ont un compte dans CMC Teams avec leur identifiant SBM ») : la porte de lecture, mesurée en vrai —
     NOMBRES seulement, aucun nom ni matricule au journal. */
  const cc = await page.evaluate(async () => {
    try { const h = {}; try { const g = localStorage.getItem('kdmc_admin_grant') || '', t = localStorage.getItem('kdmc_sso_token') || ''; if (g) h['x-kdmc-admin'] = g; if (t) h.Authorization = 'Bearer ' + t; } catch (_) { /* rien */ }
      const x = await fetch('/__admin/comptes-cmcteams', { credentials: 'include', cache: 'no-store', headers: h }); const j = await x.json().catch(() => ({}));
      const l = Array.isArray(j.comptes) ? j.comptes : [];
      return { st: x.status, ok: !!j.ok, total: j.total, avec: j.avec_matricule, sans: j.sans_matricule, n: l.length, champs: [...new Set(l.flatMap((c) => Object.keys(c)))].sort().join(','),
        tri: l.every((c, i) => i === 0 || String(l[i - 1].nom).localeCompare(String(c.nom), 'fr', { sensitivity: 'base' }) <= 0), bons: l.filter((c) => !c.matricule || /^U\d{3,6}$/.test(c.matricule)).length };
    } catch (e) { return { st: 0, ok: false }; }
  });
  chk(cc.ok && cc.n === cc.total && cc.avec + cc.sans === cc.total, `comptes CMCteams : ${cc.total} compte(s), ${cc.avec} avec matricule SBM, ${cc.sans} sans · HTTP ${cc.st}`);
  chk(cc.ok && cc.tri && cc.bons === cc.n && (cc.n === 0 || cc.champs === 'apps,matricule,nom,uid,vu'), `comptes CMCteams : triés par nom, ${cc.bons} matricule(s) bien écrits ou vides sur ${cc.n}, champs rendus : ${cc.champs || '-'}`);
  /* 19.11 (Kevin : « Oui go pour Bee ») : la porte du mail, lue en vrai sur le compte ADMIN — verdicts seulement, jamais l'adresse. */
  const ml = await page.evaluate(async (essai) => {
    const h = { 'content-type': 'application/json' }; try { const g = localStorage.getItem('kdmc_admin_grant') || '', t = localStorage.getItem('kdmc_sso_token') || ''; if (g) h['x-kdmc-admin'] = g; if (t) h.Authorization = 'Bearer ' + t; } catch (_) { /* rien */ }
    const lire = async () => { const x = await fetch('/__admin/mail-envoyer?uid=kdmc_admin', { credentials: 'include', cache: 'no-store', headers: h }); const j = await x.json().catch(() => ({})); return { st: x.status, ok: !!j.ok, pret: j.pret === true, adresse: !!j.email_masque, reste: j.reste, champs: Object.keys(j).sort().join(',') }; };
    try {
      const avant = await lire(); let envoi = null;
      if (essai && avant.ok && avant.pret && avant.adresse && avant.reste > 0) {
        const x = await fetch('/__admin/mail-envoyer', { method: 'POST', credentials: 'include', headers: h, body: JSON.stringify({ uid: 'kdmc_admin', objet: 'Essai du robot — le domaine sait envoyer un mail', corps: 'Bonjour Kevin,\n\nceci est UN mail d\'essai envoyé par le robot de vérification du tableau de bord, pour prouver que le domaine sait envoyer un mail quand tu confirmes avec ✅ dans Bee.\n\nTu peux le supprimer.' }) });
        const j = await x.json().catch(() => ({})); envoi = { st: x.status, ok: !!j.ok, raison: j.reason || '', reste: j.reste };
      }
      return { avant, envoi, apres: envoi ? await lire() : null };
    } catch (e) { return { avant: { st: 0, ok: false }, envoi: null, apres: null }; }
  }, MAIL_ESSAI);
  chk(ml.avant.ok && ml.avant.champs === 'email_masque,name,ok,pret,reste', `porte du mail : HTTP ${ml.avant.st} · messagerie branchée : ${ml.avant.pret ? 'oui' : 'NON'} · le compte admin a une adresse : ${ml.avant.adresse ? 'oui' : 'non'} · reste aujourd'hui : ${ml.avant.reste}`);
  if (MAIL_ESSAI) chk(!!ml.envoi && ml.envoi.ok && ml.apres && ml.apres.reste === ml.avant.reste - 1, `mail d'essai au compte admin : ${ml.envoi ? (ml.envoi.ok ? 'PARTI' : 'refusé (' + (ml.envoi.raison || 'HTTP ' + ml.envoi.st) + ')') : 'pas tenté (messagerie non branchée, pas d\'adresse ou plafond atteint)'} · reste ensuite : ${ml.apres ? ml.apres.reste : '-'}`);
  /* 21.11 (pont 2989) : le matricule SBM modifiable — la porte existe et REFUSE une mauvaise forme (aucune écriture : « ROBOT » n'est pas un matricule) ; la page servie a le champ et le bouton. */
  const mt = await page.evaluate(async () => {
    const h = { 'content-type': 'application/json' }; try { const g = localStorage.getItem('kdmc_admin_grant') || '', t = localStorage.getItem('kdmc_sso_token') || ''; if (g) h['x-kdmc-admin'] = g; if (t) h.Authorization = 'Bearer ' + t; } catch (_) { /* rien */ }
    const x = await fetch('/__admin/matricule', { method: 'POST', credentials: 'include', headers: h, body: JSON.stringify({ uid: 'kdmc_admin', matricule: 'ROBOT' }) });
    const j = await x.json().catch(() => ({}));
    const src = (document.querySelector('script[src*="admin.js"]') || {}).src || '';
    const js = src ? await (await fetch(src, { cache: 'no-store' })).text() : '';
    return { st: x.status, raison: String(j.reason || ''), champ: /class="matin"/.test(js), bouton: /data-act="matricule"/.test(js) };
  });
  chk(mt.st === 400 && mt.raison === 'matricule_format', `matricule SBM : la porte répond et refuse une mauvaise forme sans rien écrire · HTTP ${mt.st} · ${mt.raison || '-'}`);
  /* 22.11 (Kevin : « oui entre ») : matricules à confirmer par la personne — le NOMBRE côté admin, et la porte de la personne lue avec la session du robot (lecture seule). */
  const mc = await page.evaluate(async () => {
    const h = { 'content-type': 'application/json' }; try { const g = localStorage.getItem('kdmc_admin_grant') || '', t = localStorage.getItem('kdmc_sso_token') || ''; if (g) h['x-kdmc-admin'] = g; if (t) h.Authorization = 'Bearer ' + t; } catch (_) { /* rien */ }
    const a = await fetch('/__admin/comptes-cmcteams', { credentials: 'include', cache: 'no-store', headers: h }); const ja = await a.json().catch(() => ({}));
    const p = await fetch('/__sso/matricule-confirmer', { credentials: 'include', cache: 'no-store', headers: h }); const jp = await p.json().catch(() => ({}));
    const src = (document.querySelector('script[src*="admin.js"]') || {}).src || '';
    const js = src ? await (await fetch(src, { cache: 'no-store' })).text() : '';
    return { n: ja.a_confirmer, avec: ja.avec_matricule, stP: p.status, okP: jp.ok === true, typeP: typeof jp.a_confirmer, case_: /class="matchk"/.test(js) };
  });
  chk(Number.isInteger(mc.n) && mc.n >= 0 && mc.n <= mc.avec, `matricules à confirmer par la personne : ${mc.n} sur ${mc.avec} matricule(s) rangé(s)`);
  /* 200 = le robot a une session de personne ; 401 = il n'a que la session admin, et la porte le REFUSE (elle existe et garde l'entrée) — les deux prouvent la porte, le verdict dit lequel. */
  chk(((mc.stP === 200 && mc.okP && mc.typeP === 'boolean') || mc.stP === 401) && mc.case_, `matricule à confirmer : la porte de la personne ${mc.stP === 200 ? 'répond' : 'refuse sans session de personne'} · HTTP ${mc.stP} · la case « à faire confirmer » est dans la page servie : ${mc.case_ ? 'oui' : 'NON'}`);
  chk(mt.champ && mt.bouton, `matricule SBM : la page servie a le champ (${mt.champ ? 'oui' : 'NON'}) et le bouton (${mt.bouton ? 'oui' : 'NON'}) dans la rubrique Identité`);
  /* 22.11 (mission pc-obd, pont 3158) : la valise OBD — la tuile est dans l'admin servi, la page, son script et sa base de codes répondent AVEC la session admin (sans session, tout /admin/ rend la page d'entrée). Lecture seule. */
  const ob = await page.evaluate(async () => {
    const src = (document.querySelector('script[src*="admin.js"]') || {}).src || '';
    const js = src ? await (await fetch(src, { cache: 'no-store' })).text() : '';
    const lire = async (u) => { try { const x = await fetch(u, { credentials: 'include', cache: 'no-store' }); return { st: x.status, type: String(x.headers.get('content-type') || '').split(';')[0], texte: await x.text() }; } catch (_) { return { st: 0, type: '', texte: '' }; } };
    const pg = await lire('/admin/obd.html'), sc = await lire('/admin/obd.js'), ti = await lire('/admin/obd-base/titres.json'), p2 = await lire('/admin/obd-base/P02.json');
    let nTitres = 0; try { nTitres = Object.keys(JSON.parse(ti.texte)).length; } catch (_) { nTitres = 0; }
    let okP2 = false; try { JSON.parse(p2.texte); okP2 = true; } catch (_) { okP2 = false; }
    return { tuile: (js.match(/\/admin\/obd\.html/g) || []).length, pg: pg.st, pgOk: /Valise|OBD/i.test(pg.texte) && /obd\.js/.test(pg.texte), csp: /connect-src 'self'/.test(pg.texte), sc: sc.st, scType: sc.type, scTaille: sc.texte.length, ti: ti.st, nTitres, p2: p2.st, okP2 };
  });
  chk(ob.tuile === 1, `valise OBD : ${ob.tuile} tuile dans l'admin servi (attendu 1)`);
  chk(ob.pg === 200 && ob.pgOk && ob.csp, `valise OBD : la page répond · HTTP ${ob.pg} · c'est bien la valise : ${ob.pgOk ? 'oui' : 'NON'} · elle ne parle qu'au domaine : ${ob.csp ? 'oui' : 'NON'}`);
  chk(ob.sc === 200 && /javascript/.test(ob.scType) && ob.scTaille > 20000, `valise OBD : son script est servi · HTTP ${ob.sc} · ${ob.scType || '-'} · ${ob.scTaille} caractères`);
  chk(ob.ti === 200 && ob.nTitres > 1000 && ob.p2 === 200 && ob.okP2, `valise OBD : la base de codes est servie · ${ob.nTitres} libellés de codes · un fichier de détail lisible : ${ob.okP2 ? 'oui' : 'NON'}`);
  /* 22.11 (Kevin, relayé pc-config 3164) : la valise OBD aussi sur le PORTAIL, pour lui seul — vue avec la session admin, en dernier (on quitte la page admin). Lecture seule. */
  const erreursPortail = []; page.on('pageerror', (e) => erreursPortail.push(String(e && e.message || e).split('\n')[0].slice(0, 160)));
  await page.goto('https://kd-mc.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => { const n = document.getElementById('tdb-haut'); return !!n && !n.hidden; }, null, { timeout: 20000 }).catch(() => {});
  const po = await page.evaluate(async () => {
    /* pourquoi le bloc est caché, si c'est le cas : ce que le domaine répond à « qui suis-je » (états seulement, jamais le nom) */
    let qui = { etat: '?', admin: null, apercu: null, prouve: null }; try { const w = await window.kdmcSSO.whoamiResult(); qui = { etat: String((w && w.state) || 'aucun'), admin: !!(w && w.session && w.session.admin), apercu: !!(w && w.session && w.session.apercu), prouve: !!(w && w.session && w.session.verified) }; } catch (_) { qui.etat = 'erreur'; }
    const hub = document.getElementById('hub');
    /* indices sans aucun nom : quel écran d'entrée est affiché (identifiants des boutons seulement), et l'adresse où l'on est */
    const gate = document.getElementById('gate');
    const ecran = gate ? { cache: gate.hidden, boutons: Array.from(gate.querySelectorAll('button[id], input[id], p[id]')).map((b) => b.id).slice(0, 8).join(',') } : { cache: null, boutons: '' };
    const t = document.getElementById('tuile-obd'), n = document.getElementById('tdb-haut'), badge = (document.querySelector('script[data-project="kdmc-home"]') || {}).dataset || {};
    const r = t ? t.getBoundingClientRect() : { width: 0, height: 0 };
    return { ecran, chemin: location.pathname + (location.search ? '?…' : ''), qui, hubCache: !hub || hub.hidden, existe: !!t, blocVisible: !!n && !n.hidden, l: Math.round(r.width), h: Math.round(r.height), href: t ? t.getAttribute('href') : '', version: badge.version || '', deborde: document.documentElement.scrollWidth > window.innerWidth + 1 };
  });
  /* Le portail n'ouvre l'accueil du compte admin qu'après une preuve Face ID (kdmc-portal.js `_kevinNonProuve`). Le robot n'a qu'une session par code :
     chez lui l'accueil reste fermé. Ce n'est pas un défaut : on le DIT (non mesuré) et on vérifie ce qui reste mesurable — la carte est dans le bloc caché de la page servie. */
  const demandePreuve = po.hubCache && po.qui.etat === 'session' && po.qui.admin === true && po.qui.prouve === false;
  if (demandePreuve) {
    dire(`ℹ️ portail ${po.version || '?'} : affichage du raccourci NON MESURÉ par le robot — le portail demande Face ID au compte admin (session par code seulement). À mesurer dans le navigateur de Kevin.`);
    chk(po.existe && po.href === '/admin/obd.html' && !po.blocVisible, `portail ${po.version || '?'} : le raccourci « Valise OBD » est dans la page servie, DANS le bloc admin resté caché · mène à ${po.href || '-'}`);
  } else {
    chk(po.existe && po.blocVisible && po.h >= 44 && po.l >= 44 && po.href === '/admin/obd.html' && !po.deborde, `portail ${po.version || '?'} : raccourci « Valise OBD » visible pour l'admin · ${po.l} × ${po.h} px · mène à ${po.href || '-'} · page qui déborde : ${po.deborde ? 'OUI' : 'non'}` + (po.blocVisible ? '' : ` — bloc admin caché : le domaine répond état « ${po.qui.etat} », admin : ${po.qui.admin}, prouvé : ${po.qui.prouve}, vue membre : ${po.qui.apercu}, accueil caché : ${po.hubCache} · écran d'entrée caché : ${po.ecran.cache} · ses éléments : ${po.ecran.boutons || '-'} · adresse : ${po.chemin} · erreurs de la page : ${erreursPortail.length ? erreursPortail.slice(0, 3).join(' | ') : 'aucune'}`));
  }
} catch (e) { chk(false, 'erreur du robot : ' + String(e && e.message || e).split('\n')[0].slice(0, 140)); }

dire(`=== VÉRIF TABLEAU ADMIN : ${bons} OK · ${mauvais} en défaut`);
if (RESUME) { try { appendFileSync(RESUME, lignes.map((l) => '- ' + l).join('\n') + '\n'); } catch (_) { /* pas de résumé */ } }
await browser.close();
process.exit(mauvais ? 1 : 0);
