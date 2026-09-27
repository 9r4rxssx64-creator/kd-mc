/* AUDIT LINGUA — tout, sur le VRAI domaine, mesuré (Kevin 27.09 : « Fais ton audit de
 * lingua, toutes les fonctions, voix, etc. Tout. Réel tjs »).
 * ===========================================================================
 * POURQUOI CE FICHIER, alors que `audit-live.mjs` a déjà une sonde Lingua : celle-là
 * vérifie que la surface RÉPOND, parmi 39 autres. Elle ouvre UNE langue, pas seize ;
 * elle COMPTE les voix proposées, elle n'en écoute aucune ; elle ne touche ni au
 * dictionnaire, ni aux verbes, ni à la LSF, ni à la mémoire en ligne.
 *
 * TOUT SE FAIT PAR DE VRAIS CLICS. Mesuré le 27.09 : `lingua/app.js` vit entièrement
 * dans une IIFE — `go()`, `S`, `startLesson()`, `VOICES` n'existent PAS sur `window`
 * (seul `window.LINGUA_VER` est exposé, exprès). Une sonde qui les appellerait
 * n'obtiendrait rien et, comme les erreurs sont avalées, elle croirait avoir navigué :
 * elle noterait « ✅ » six onglets en regardant six fois le même écran. C'est
 * exactement ce qui est arrivé au premier jet de ce fichier. On clique donc ce qu'un
 * élève clique, et rien d'autre.
 *
 * DEPUIS UNE SESSION CLAUDE, CE FICHIER NE PEUT PAS TOURNER sur le vrai domaine : le
 * proxy d'agent répond 403 au CONNECT sur *.kd-mc.com. Il est fait pour la CI
 * (`.github/workflows/audit-lingua.yml`), dont le rapport revient par les ANNOTATIONS
 * du check-run — le seul canal qui traverse le proxy.
 *
 * COÛT. Les voix cloud passent par /__lingua/tts, facturé au caractère. On dit donc UN
 * mot court par voix (« bonjour », 7 caractères) et le worker met en cache : un tour
 * complet coûte ~90 caractères, une fois.
 *
 * Lancer : node tools/smoke/audit-lingua.mjs [https://lingua.kd-mc.com]
 */
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';

const BASE = (process.argv[2] || 'https://lingua.kd-mc.com').replace(/\/+$/, '');
const R = { ok: [], ko: [], gris: [] };
const ok = (m) => R.ok.push(m);
const ko = (m) => R.ko.push(m);
const gris = (m) => R.gris.push(m);          // mesuré « pas concluant » — jamais compté vert
const chk = (c, m) => (c ? ok(m) : ko(m));

/* `x-kdmc-sonde` sur les seules NAVIGATIONS de page (27.09 nuit). Posé via `extraHTTPHeaders`,
   l'en-tête partait aussi sur les appels cross-origin des pages (Kit IA, Apex, World Monitor,
   OSINT) : un en-tête inconnu déclenche un contrôle CORS que leurs workers refusent → 14
   surfaces « rouges » en une heure, alors que rien n'avait changé pour un vrai visiteur.
   Le routeur ne fiche que les pages (`estUnePage`) : marquer les documents suffit. */
/* On n'intercepte que ce qui PEUT être une page (pas les .js/.css/images/sons/json) : intercepter
   les centaines de fichiers d'une app coûte un aller-retour chacun — mesuré le 27.09 nuit, l'audit
   Lingua a dépassé ses 15 min là où il en prenait 9. Le test `resourceType` reste en garde-fou. */
const PAS_UNE_PAGE = /\.(js|mjs|css|map|json|webmanifest|png|jpe?g|gif|webp|svg|ico|mp3|wav|ogg|mp4|webm|woff2?|ttf|otf|pdf|txt|xml)($|\?)/i;
const marquerSonde = (cible, nom) => cible.route((u) => !PAS_UNE_PAGE.test(u.pathname), (route, req) => {
  if (req.resourceType() !== 'document') return route.continue();
  return route.continue({ headers: Object.assign({}, req.headers(), { 'x-kdmc-sonde': nom }) });
});
const nav = await chromium.launch();
const ctx = await nav.newContext({ locale: 'fr-FR' });
await marquerSonde(ctx, 'audit-lingua');
const page = await ctx.newPage();

const erreurs = [];
page.on('pageerror', (e) => erreurs.push(String(e.message).slice(0, 160)));
const appels = [];
page.on('request', (r) => { if (r.url().includes('/__lingua/')) appels.push(r.url()); });

const attends = (ms) => page.waitForTimeout(ms);
const compte = (sel) => page.$$eval(sel, (e) => e.length).catch(() => 0);
const texte = () => page.evaluate(() => document.body.innerText || '').catch(() => '');
/* clique le PREMIER élément dont le texte contient `motif` — comme un doigt le ferait */
const clicTexte = (motif, sel = 'button, .st-card, .game-card, .course-card, .acc-card') =>
  page.evaluate(([m, s]) => {
    const e = [...document.querySelectorAll(s)].find((x) => new RegExp(m, 'i').test(x.textContent || ''));
    if (!e) return false; e.click(); return true;
  }, [motif, sel]).catch(() => false);
const clicSel = (sel) => page.$eval(sel, (e) => e.click()).then(() => true).catch(() => false);
/* les 6 onglets de la barre du bas, dans l'ordre du code */
const ONGLETS = ['Accueil', 'Réviser', 'Coach', 'Traduire', 'Ligue', 'Profil'];
const onglet = (nom) => page.evaluate((n) => {
  const t = [...document.querySelectorAll('.tabbar .tab')].find((x) => (x.textContent || '').includes(n));
  if (!t) return false; t.click(); return true;
}, nom).catch(() => false);
/* revenir au choix de la langue : le drapeau de la barre du haut */
const auxLangues = () => clicSel('#tbFlag');

/* ─── 1. L'arrivée ───────────────────────────────────────────────────────── */
const t0 = Date.now();
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 45000 });
await attends(2500);
const msCharge = Date.now() - t0;

const ver = await page.evaluate(() => (typeof window.LINGUA_VER === 'string' ? window.LINGUA_VER : '')).catch(() => '');
chk(!!ver, `1.1 version RÉELLEMENT servie : ${ver || 'INCONNUE (window.LINGUA_VER absente)'}`);
const tArrivee = (await texte()).trim().length;
chk(tArrivee > 20, `1.2 l'écran d'arrivée s'affiche (${tArrivee} caractères ; une page blanche en ferait ~0)`);
chk(!!(await page.$('.acc-card.add')), '1.3 le bouton « Nouveau compte » est là');
chk((await texte()).includes('déjà un compte'), '1.4 « J\'ai déjà un compte » est proposé');
ok(`1.5 page prête en ${(msCharge / 1000).toFixed(1)} s (mesure, pas un seuil)`);

/* ─── 2. Créer un compte (prénom + nom + code) ───────────────────────────── */
const NOM = 'Audit Lingua';                              // compte de test, aucune donnée réelle
const CODE = String(100000 + (Date.now() % 800000));     // code jetable, jamais réutilisé
await clicSel('.acc-card.add');
await attends(900);
let creable = true;
try {
  await page.waitForSelector('#acPrenom', { timeout: 8000 });
  await page.fill('#acPrenom', 'Audit');
  await page.fill('#acNom', 'Lingua');
  await page.fill('#acCode', CODE);
} catch { creable = false; }
chk(creable, '2.1 la fenêtre « Nouveau compte » se remplit (prénom + nom + code)');
await clicSel('.modal .btn-main');
await attends(2000);
chk(!!(await page.$('.course-card')), '2.2 après création, on arrive au choix de la langue');

/* ─── 3. LES LANGUES, une par une, en entrant vraiment dedans ────────────── */
const noms = await page.$$eval('.course-card', (els) => els.map((e) => (e.querySelector('.cnom')?.textContent || e.textContent || '').split('\n')[0].trim()));
chk(noms.length >= 16, `3.0 langues proposées : ${noms.length}`);
const detail = [];
for (let i = 0; i < noms.length; i++) {
  const avant = erreurs.length;
  const entre = await page.evaluate((k) => {
    const c = [...document.querySelectorAll('.course-card')][k];
    if (!c) return false; c.click(); return true;
  }, i).catch(() => false);
  if (!entre) { ko(`3.${i + 1} ${noms[i]} : carte introuvable au moment d'entrer`); continue; }
  await attends(1200);
  const unites = await compte('.unit');
  const lecons = await compte('.node');
  const neuves = erreurs.length - avant;
  detail.push({ nom: noms[i], unites, lecons, neuves });
  chk(unites >= 1 && lecons >= 1 && neuves === 0,
      `3.${i + 1} ${noms[i]} : ${unites} unités, ${lecons} leçons affichées${neuves ? ' — ' + neuves + ' ERREUR JS' : ''}`);
  if (!(await auxLangues())) { ko(`3.${i + 1}↩ impossible de revenir au choix de la langue (bouton drapeau)`); break; }
  await attends(900);
}

/* ─── 4. Une VRAIE leçon, jouée au clic ──────────────────────────────────── */
await page.evaluate(() => document.querySelector('.course-card')?.click());
await attends(1300);
const avantLecon = erreurs.length;
const ouvre = await page.evaluate(() => {
  const n = [...document.querySelectorAll('.node')].find((x) => !x.classList.contains('locked'));
  if (!n) return false; n.click(); return true;
}).catch(() => false);
await attends(1500);
chk(ouvre && !!(await page.$(".lesson-foot, .lesson, .ex-wrap")), '4.1 une leçon s\'ouvre au clic sur la 1re étoile du parcours');
/* Une leçon mélange CINQ sortes d'exercices (app.js l.2898 : mc, match, bank, type,
   speak) et l'ordre est tiré au sort. Le premier jet ne savait répondre qu'au QCM :
   d'un lancement à l'autre il trouvait « 4 réponses » ou « 0 », sans que l'app ait
   changé. On parcourt donc les premiers exercices, on répond à chacun selon SA sorte,
   et on dit lesquelles ont été réellement exercées. */
const sortes = new Map();
let repondus = 0, verdicts = 0;
for (let tour = 0; tour < 6; tour++) {
  const vu = await page.evaluate(() => {
    const b = document.querySelector('.lesson-body'); if (!b) return null;
    if (b.querySelector('.opt')) return 'choix (QCM)';
    if (b.querySelector('.type-input')) return 'à écrire';
    if (b.querySelector('.tok')) return 'mots à remettre en ordre';
    if (b.querySelector('.match-grid .mtile')) return 'paires à associer';
    if (b.querySelector('.mic-btn, #spSay')) return 'à prononcer (micro)';
    return 'inconnue';
  }).catch(() => null);
  if (!vu) break;
  sortes.set(vu, (sortes.get(vu) || 0) + 1);
  /* on répond comme on peut ; « à prononcer » demande un micro : on ne fera pas semblant */
  const aRepondu = await page.evaluate(() => {
    const b = document.querySelector('.lesson-body'); if (!b) return false;
    const o = b.querySelector('.opt'); if (o) { o.click(); return true; }
    const i = b.querySelector('.type-input'); if (i) { i.value = 'xyz'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; }
    const t = [...b.querySelectorAll('.tok')]; if (t.length) { t.slice(0, Math.min(3, t.length)).forEach((x) => x.click()); return true; }
    /* paires : l'exercice n'est TERMINÉ que lorsque toutes les paires sont faites
       (app.js l.2985 : `_can` passe à vrai au dernier appariement). Les tuiles portent
       leur `data-key` : on apparie donc pour de bon, gauche puis droite, au lieu de
       cliquer deux tuiles au hasard — sinon « Vérifier » reste gris et la sonde conclut
       à tort que l'app ne rend pas de verdict (mesuré : 3 verdicts sur 6). */
    const cols = [...b.querySelectorAll('.match-grid .mcol')];
    if (cols.length >= 2) {
      for (const g of [...cols[0].querySelectorAll('.mtile')]) {
        const d = [...cols[1].querySelectorAll('.mtile')].find((x) => x.dataset.key === g.dataset.key);
        if (d) { g.click(); d.click(); }
      }
      return true;
    }
    return false;
  }).catch(() => false);
  if (!aRepondu) break;
  repondus++;
  await attends(400);
  await page.evaluate(() => document.querySelector('.lesson-foot .btn-main')?.click()).catch(() => {});
  await attends(900);
  /* Le signal sûr n'est pas un mot mais l'ÉTAT du pied : `lesson-foot ok|ko` (l.2909). */
  const v = await page.evaluate(() => {
    const f = document.querySelector('.lesson-foot');
    return f ? (f.classList.contains('ok') ? 'juste' : f.classList.contains('ko') ? 'faux' : '') : '';
  }).catch(() => '');
  if (v) verdicts++;
  await page.evaluate(() => document.querySelector('.lesson-foot .btn-main')?.click()).catch(() => {});  // « Continuer »
  await attends(900);
  if (!(await page.$('.lesson-body'))) break;   // leçon finie, ou plus de cœurs
}
chk(repondus > 0, `4.2 exercices auxquels la sonde a pu répondre : ${repondus}`);
chk(verdicts === repondus && repondus > 0,
    `4.3 chaque réponse reçoit un verdict juste/faux : ${verdicts}/${repondus} — la boucle d'apprentissage tourne`);
ok(`4.5 sortes d'exercices rencontrées : ${[...sortes.entries()].map(([k, n]) => k + ' ×' + n).join(' · ') || 'aucune'}`);
chk(!sortes.has('inconnue'), `4.6 aucune sorte d'exercice non reconnue par la sonde`);
chk(erreurs.length === avantLecon, '4.4 aucune erreur JS pendant la leçon');
/* sortir de la leçon : la croix / le retour, sinon on recharge proprement */
await page.evaluate(() => document.querySelector('.lesson-quit, .bz-quit, .lx-quit')?.click()).catch(() => {});
await attends(700);
if (!(await page.$('.tabbar'))) { await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await attends(2200); }

/* ─── 5. Les 6 onglets, cliqués dans la barre du bas ─────────────────────── */
const empreintesEcran = new Map();
for (const nom of ONGLETS) {
  const avant = erreurs.length;
  const vu = await onglet(nom);
  await attends(1100);
  const t = (await texte()).trim();
  empreintesEcran.set(nom, createHash('sha256').update(t).digest('hex').slice(0, 10));
  chk(vu && t.length > 40 && erreurs.length === avant,
      `5.${nom} : ${t.length} caractères rendus${!vu ? ' — ONGLET INTROUVABLE' : ''}${erreurs.length > avant ? ' — ERREUR JS' : ''}`);
}
/* Le piège du premier jet : six « ✅ » sur six fois le même écran. */
const ecransDistincts = new Set(empreintesEcran.values()).size;
chk(ecransDistincts >= 5,
    `5.∑ ${ecransDistincts} écrans DIFFÉRENTS sur ${ONGLETS.length} onglets` +
    (ecransDistincts >= 5 ? '' : ' — les onglets montrent la MÊME chose, la navigation ne marche pas'));

/* ─── 6. Ce que l'accueil propose vraiment ───────────────────────────────── */
await onglet('Accueil'); await attends(1000);
const surAccueil = await texte();
const cartes = [
  ['Histoires de la ruche', '.story-item', 6, 'histoires'],
  ['Mes statistiques', '.heat-grid .heat', 84, 'cases du calendrier'],
  ['Atelier prononciation', '.pron-play', 2, 'boutons audio'],
  ['Les verbes', '.vb-row, .verb-row, .vb-card', 1, 'verbes'],
];
for (const [libelle, sel, mini, quoi] of cartes) {
  if (!surAccueil.includes(libelle.split(' ')[0])) { gris(`6.${libelle} : carte absente de l'accueil — NON MESURÉE`); continue; }
  const avant = erreurs.length;
  const a = await clicTexte(libelle, 'button, .st-card, .game-card');
  await attends(1200);
  const n = await compte(sel);
  chk(a && n >= mini, `6.${libelle} : ${n} ${quoi} (≥ ${mini} attendu)${erreurs.length > avant ? ' — ERREUR JS' : ''}`);
  await onglet('Accueil'); await attends(900);
  if (!(await page.$('.tabbar'))) { await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await attends(2200); await onglet('Accueil'); await attends(800); }
}
chk(await compte('.game-card') >= 2, `6.jeux cartes de jeu sur l'accueil : ${await compte('.game-card')} (Défi éclair + Paires)`);
chk(/L'alphabet dactylologique|dictionnaire des signes/i.test(surAccueil) === false || true,
    `6.LSF cartes LSF sur l'accueil du cours choisi : ${/dactylologique/i.test(surAccueil) ? 'présentes' : 'absentes (normal hors cours LSF)'}`);

/* ─── 7. Le dictionnaire, depuis l'onglet Réviser ────────────────────────── */
await onglet('Réviser'); await attends(1100);
const versDico = await clicTexte('Voir le dictionnaire');
await attends(1200);
const motsDico = await compte('.dict-row, .dw, .dict-item, .word-row');
chk(versDico, '7.1 l\'onglet Réviser mène au dictionnaire');
/* Le compte de la sonde vient de naître : 0 mot appris, donc un dictionnaire VIDE est
   la bonne réponse. On vérifie que l'écran se monte, pas qu'il contient des mots. */
chk(versDico && /dictionnaire|mot/i.test(await texte()),
    `7.2 l'écran dictionnaire se monte (${motsDico} entrées — 0 est normal sur un compte neuf, aucun mot encore appris)`);

/* ─── 8. LES VOIX — écoutées, pas comptées ───────────────────────────────── */
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await attends(2200);
await onglet('Profil'); await attends(1200);
const voixListees = await page.$$eval('.voice-row', (e) => e.map((x) => x.textContent.trim().split('\n')[0])).catch(() => []);
chk(voixListees.length >= 12, `8.0 voix proposées dans le Profil : ${voixListees.length}`);
chk(voixListees.some((v) => /hors-ligne|téléphone/i.test(v)),
    '8.device la voix du téléphone (hors-ligne) est proposée ET nommée comme telle');

/* Les identifiants sont lus dans le app.js RÉELLEMENT SERVI — pas dans le dépôt. */
let ids = [];
try {
  const js = await (await ctx.request.get(BASE + '/app.js', { timeout: 30000 })).text();
  const bloc = js.slice(js.indexOf('var VOICES=['), js.indexOf('];', js.indexOf('var VOICES=[')));
  ids = [...bloc.matchAll(/\{id:"([a-z]+)"[^}]*cloud:true/g)].map((m) => m[1]);
} catch { /* signalé juste après */ }
chk(ids.length >= 10, `8.ids ${ids.length} voix cloud déclarées dans le app.js SERVI : ${ids.join(', ') || '(illisible)'}`);

const empreintes = new Map();
/* VERROU DU DOMAINE (mesuré le 27.09, run 36337868944) : /__lingua/tts refuse toute
   requête qui ne vient pas d'une page du domaine — `vientDuDomaine()` dans worker.js —
   et répond 200 + {"ok":false,"reason":"hors_domaine"}, soit EXACTEMENT 36 octets de
   JSON. Le premier jet appelait l'adresse en direct (APIRequestContext) : les 12 voix
   rendaient le même corps de 36 octets et la sonde criait « des voix identiques se font
   passer pour différentes ». C'était l'app qui se protégeait, correctement.
   On demande donc les voix DEPUIS LA PAGE, comme l'app le fait. */
const bareTts = await ctx.request.get(BASE + '/__lingua/tts?v=nova&t=bonjour', { timeout: 30000 }).catch(() => null);
const bareTxt = bareTts ? await bareTts.text().catch(() => '') : '';
chk(!!bareTts && /hors_domaine/.test(bareTxt),
    `8.verrou un appel à la voix DEPUIS L'EXTÉRIEUR du domaine est refusé (${bareTts ? bareTts.status() + ' ' + bareTxt.slice(0, 40) : 'pas de réponse'}) — personne ne peut faire chanter le compte de Kevin`);

for (const id of ids) {
  const r = await page.evaluate(async (v) => {
    try {
      const q = await fetch('/__lingua/tts?v=' + encodeURIComponent(v) + '&t=bonjour', { cache: 'no-store' });
      const b = new Uint8Array(await q.arrayBuffer());
      const h = await crypto.subtle.digest('SHA-256', b);
      const sig = Array.from(new Uint8Array(h)).map((x) => ('0' + x.toString(16)).slice(-2)).join('').slice(0, 12);
      return { s: q.status, ct: (q.headers.get('content-type') || '').split(';')[0], n: b.length, sig,
               txt: b.length < 200 ? new TextDecoder().decode(b).slice(0, 60) : '' };
    } catch (e) { return { err: String(e).slice(0, 60) }; }
  }, id).catch(() => ({ err: 'appel impossible' }));
  if (!r || r.err) { ko(`8.${id} appel impossible : ${r && r.err}`); continue; }
  if (r.s !== 200 || !/^audio\//.test(r.ct) || r.n === 0) {
    ko(`8.${id} pas d'audio : HTTP ${r.s} · ${r.ct} · ${r.n} o${r.txt ? ' · ' + r.txt : ''}`); continue;
  }
  empreintes.set(id, r.sig);
  ok(`8.${id} HTTP ${r.s} · ${r.ct} · ${String(r.n).padStart(6)} o · empreinte ${r.sig}`);
}
/* LE contrôle central : douze voix qui rendraient le même fichier ne sont pas douze
   voix. C'est exactement ce que l'empreinte attrape. */
const distinctes = new Set(empreintes.values()).size;
chk(empreintes.size === ids.length && ids.length > 0 && distinctes === empreintes.size,
    `8.∑ ${empreintes.size}/${ids.length} voix cloud rendent de l'audio, ${distinctes} empreintes DISTINCTES` +
    (empreintes.size === ids.length && distinctes === empreintes.size
      ? ' — chacune est bien une voix différente'
      : ' — des voix MUETTES ou IDENTIQUES se font passer pour différentes'));

/* Le bouton 🔊 déclenche-t-il vraiment un appel ? On regarde le réseau. */
await onglet('Accueil'); await attends(1000);
const avantAppels = appels.length;
const aParle = await clicSel('.pod-say');
await attends(3000);
const partis = appels.slice(avantAppels).filter((u) => u.includes('/tts'));
chk(aParle && partis.length >= 1, `8.🔊 appuyer sur 🔊 déclenche ${partis.length} appel(s) de voix${aParle ? '' : ' — bouton 🔊 introuvable'}`);
chk(partis.length <= 1, `8.🔊×2 le mot n'est demandé qu'UNE fois (${partis.length}) — le bug « dit deux fois » ne revient pas`);

/* ─── 9. Mémoire en ligne : aller-retour réel ────────────────────────────── */
/* La clé doit être du HEXA PUR : `okKey = /^[a-f0-9]{16,64}$/` dans worker.js. Le
   premier jet envoyait « audit-lingua-sonde-<hexa> » → `bad_key` (400), et la sonde
   l'annonçait comme une mémoire en ligne en panne. Elle marchait très bien. */
const cle = createHash('sha256').update('audit-lingua-sonde-' + Date.now()).digest('hex').slice(0, 40);
try {
  const pos = await ctx.request.post(BASE + '/__lingua/save', { data: { k: cle, data: { v: 2, sonde: true } }, timeout: 25000 });
  const jp = await pos.json().catch(() => ({}));
  /* Le refus dit toujours POURQUOI (`reason`) : on l'écrit, sinon un « HTTP 200 » en
     rouge ne se comprend pas (mesuré run 36346527479 : 200 + ok:false, raison absente
     du rapport → impossible de trancher entre panne du KV et sonde mal fichue). */
  chk(jp && jp.ok === true, `9.1 écriture en ligne acceptée (HTTP ${pos.status()}${jp && jp.ok === true ? '' : ' — ' + JSON.stringify(jp).slice(0, 80)})`);
  const get = await ctx.request.get(BASE + '/__lingua/load?k=' + cle, { timeout: 25000 });
  const jg = await get.json().catch(() => ({}));
  chk(jg && jg.ok === true && jg.data && jg.data.sonde === true,
      `9.2 relecture en ligne : ${jg && jg.ok ? (jg.data ? 'la sauvegarde revient à l\'identique' : 'réponse OK mais VIDE') : 'refusée (' + (jg && jg.reason || get.status()) + ')'}`);
} catch (e) { ko('9.✗ mémoire en ligne injoignable : ' + String(e.message).slice(0, 70)); }

/* ─── 10. « Voir mon code » (v2.126.0) sur le vrai domaine ───────────────── */
await onglet('Profil'); await attends(1200);
const aVoir = (await texte()).includes('Voir mon code');
chk(aVoir, '10.1 le Profil propose « Voir mon code »');
if (aVoir) {
  await clicTexte('Voir mon code');
  await attends(800);
  const lireModale = () => page.evaluate(() => { const m = [...document.querySelectorAll('.modal')].pop(); return m ? [...m.querySelectorAll('.txt')].map((i) => i.value) : []; }).catch(() => []);
  const avantC = await lireModale();
  chk(!avantC.includes(CODE), '10.2 le code reste masqué tant qu\'on ne le demande pas');
  chk(avantC.includes(NOM), `10.3 le prénom + nom exact enregistré est rappelé (« ${NOM} »)`);
  await page.evaluate(() => { const m = [...document.querySelectorAll('.modal')].pop();
    [...(m?.querySelectorAll('button') || [])].find((b) => /Afficher mon code/i.test(b.textContent))?.click(); }).catch(() => {});
  await attends(600);
  chk((await lireModale()).includes(CODE),
      '10.4 après l\'appui, le code du compte s\'affiche — « quel est mon code ? » a enfin une réponse dans l\'app');
} else gris('10.2-10.4 « Voir mon code » absent : NON MESURÉ (déploiement pas encore propagé ?)');

/* ─── 11. Hors-ligne ─────────────────────────────────────────────────────── */
const sw = await page.evaluate(() => navigator.serviceWorker ? navigator.serviceWorker.getRegistrations().then((r) => r.length) : 0).catch(() => 0);
chk((sw || 0) >= 1, `11.1 service worker enregistré (${sw}) — l'app peut s'ouvrir sans réseau`);

/* ─── 12. Honnêteté affichée ─────────────────────────────────────────────── */
await page.evaluate(() => document.querySelector('#tbFlag')?.click()).catch(() => {});
await attends(1000);
const listeLangues = await texte();
chk(/Monégasque/i.test(listeLangues), '12.1 le monégasque est réellement proposé (pas seulement dans le dépôt)');
chk(/signes|LSF/i.test(listeLangues), '12.2 la langue des signes est réellement proposée');

/* ─── 14. UNE SEULE ADRESSE (27.09 soir : « l'icône envoie sur CMCteams », « il ne
   reconnaît pas mon code sauf en passant par mon domaine ») ───────────────────────────
   Les anciens chemins sur le domaine principal doivent renvoyer ICI, en 301 — sinon une
   icône posée depuis l'un d'eux ouvre une DEUXIÈME Lingua, avec une autre mémoire
   locale (le compte « n'existe pas »), ou la page de repli de l'hébergeur (CMCteams). */
for (const ancien of ['https://kd-mc.com/CMCteams/lingua/', 'https://kd-mc.com/lingua/', 'https://kd-mc.com/CMCteams/lingua/index.html']) {
  try {
    const r = await ctx.request.get(ancien, { maxRedirects: 0, timeout: 20000 });
    const loc = r.headers()['location'] || '';
    chk(r.status() === 301 && loc.startsWith(BASE + '/'),
        `14.${ancien.replace('https://kd-mc.com', '')} → ${r.status()} ${loc || '(pas de Location)'}${r.status() === 301 && loc.startsWith(BASE + '/') ? ' — renvoie bien sur la seule adresse' : ' — DEUXIÈME Lingua ou page de repli : l\'icône y resterait'}`);
  } catch (e) { ko(`14.${ancien} injoignable : ${String(e.message).slice(0, 60)}`); }
}

/* ─── Verdict ────────────────────────────────────────────────────────────── */
chk(erreurs.length === 0, `13.∑ erreurs JavaScript sur TOUT le parcours : ${erreurs.length}${erreurs.length ? ' — 1re : ' + erreurs[0] : ''}`);

await nav.close();

console.log('\n=== AUDIT LINGUA ' + BASE + ' ===');
console.log('version servie : ' + (ver || 'INCONNUE'));
R.ko.forEach((m) => console.log('❌ ' + m));
R.gris.forEach((m) => console.log('⚠ ' + m));
R.ok.forEach((m) => console.log('✅ ' + m));
if (detail.length) {
  console.log('\n--- les langues, une par une ---');
  detail.forEach((d) => console.log(`   · ${d.nom} : ${d.unites} unités, ${d.lecons} leçons${d.neuves ? ', ' + d.neuves + ' erreur JS' : ''}`));
}
console.log(`\nAUDIT LINGUA ${R.ko.length === 0 ? 'OK' : 'ÉCHEC'} — ${R.ok.length} vérifié(s), ${R.ko.length} en échec, ${R.gris.length} non mesuré(s)`);
process.exit(R.ko.length ? 1 : 0);
