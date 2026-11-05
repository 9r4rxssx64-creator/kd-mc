/* GARDE « LIENS » — l'admin de Kevin, son tableau KDMC et l'annuaire des branches (05.11.2026).
 *
 * Kevin : « dans toutes mes parties admin, tableau de bord, vue des connexions, des comptes : tous les liens, partout où j'ai des infos,
 * je clique et j'atterris au bon endroit en un clic ; pas de lien vide, pas de trace laissée ».
 *
 * Ce que la garde prouve :
 *   1. aucun href vide / « # » / javascript: dans les sources des pages admin, de la boîte, du tableau KDMC et de l'annuaire ;
 *   2. l'annuaire des branches : JSON valide, identifiants de session bien formés (session_ + 24 caractères), les 16 identifiants
 *      donnés par le chef d'orchestre, la page HTML et la copie du tableau KDMC identiques au JSON ;
 *   3. en vrai navigateur (390 x 844) : aucune ancre vide dans l'admin rendue, chaque ancre interne (#...) a sa cible, le raccourci
 *      « Annuaire des branches » est visible (>= 44 px, sans débordement) dans l'admin ET dans le tableau KDMC, et les noms de
 *      branche / de compte affichés sont des liens ;
 *   4. chaque adresse absolue kd-mc.com citée répond < 400 (liste des échecs lisible).
 * Lancer : node tests/verify-liens-admin.mjs      Rouge sur preuve : SABOTAGE=1 node tests/verify-liens-admin.mjs
 * Réseau : STRICT_RESEAU=1 pour refuser « injoignable » (par défaut : signalé, pas bloquant, sauf un vrai code >= 400).
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createRequire } from 'node:module';

const SABOTAGE = process.env.SABOTAGE === '1';
const R = { ok: [], ko: [], avert: [] };
const chk = (c, m) => (c ? R.ok : R.ko).push(m);
const lire = (p) => {
  let t = readFileSync(p, 'utf8');
  if (SABOTAGE) {
    /* sabotage : on remet les défauts qu'on vient de corriger */
    if (p.endsWith('admin/tableau.js')) t = t.replace('href="#accueil" id="tb-retour"', 'href="#" id="tb-retour"');
    if (p.endsWith('admin/admin.js')) t = t.replace("card('🧭', 'Annuaire des branches'", "card('🧭', 'Annuaire des branches (retiré)'").replace(/<a href="#fiche-' \+ esc\(x\.uid\) \+ '"/, '<span class="x" data-x="\' + esc(x.uid) + \'"');
    if (p.endsWith('tools/pont/tableau-kdmc.html')) t = t.replace('id="annuaire-lien" href="', 'id="annuaire-lien" href="#" data-x="');
    if (p.endsWith('admin/commerce.js')) t = t.replace('id="inv-wa" href="https://wa.me/"', 'id="inv-wa" href=""');
  }
  return t;
};

const PAGES = [
  'kdmc-home/admin/index.html', 'kdmc-home/admin/admin.js', 'kdmc-home/admin/tableau.js', 'kdmc-home/admin/commerce.js',
  'kdmc-home/admin/commerce.html', 'kdmc-home/admin/openai.html', 'kdmc-home/admin/openai.js', 'kdmc-home/admin/commerce-data.json',
  'kdmc-home/kdmc-boite.js', 'tools/pont/tableau-kdmc.html', 'tools/pont/annuaire-branches.html'
];
const SRC = Object.fromEntries(PAGES.map((p) => [p, lire(p)]));

/* ── 1. aucun lien vide dans les sources ─────────────────────────────────────────────────────────────── */
const VIDE = /href\s*=\s*(["'])\s*(#|javascript:[^"']*)?\s*\1(?!\s*\+)|\.href\s*=\s*(["'])\s*(#|javascript:[^"']*)?\s*\3(?!\s*\+)|\.setAttribute\(\s*["']href["']\s*,\s*(["'])\s*(#|javascript:[^"']*)?\s*\5\s*\)/gi;
const vides = [];
for (const [p, t] of Object.entries(SRC)) {
  t.split('\n').forEach((l, i) => { VIDE.lastIndex = 0; let m; while ((m = VIDE.exec(l))) vides.push(p + ':' + (i + 1) + '  ' + m[0]); });
}
chk(vides.length === 0, vides.length ? vides.length + ' lien(s) vide(s) / « # » / javascript: dans les sources :\n    ' + vides.join('\n    ') : 'aucun href vide, « # » ou javascript: dans les ' + PAGES.length + ' fichiers (admin, comptes, connexions, messages, tableau KDMC, annuaire)');

/* ── 2. l'annuaire des branches ───────────────────────────────────────────────────────────────────────── */
const ANN_URL = 'https://cmcteams.kd-mc.com/tools/pont/annuaire-branches.html';
let J = null;
try { J = JSON.parse(readFileSync('tools/pont/annuaire-branches.json', 'utf8')); } catch (e) { chk(false, 'annuaire-branches.json illisible : ' + e.message); }
const DONNES = {
  'cloud-installer': 'session_01HGawPYgJFGpAHzNH7oDnou', 'javis-bee': 'session_01DZmfQmJnTJYthtRvSBBn5P', 'apex-cloud': 'session_01AYqnsKgbPf6FYBEonVFwtx',
  'arbre-cloud': 'session_01FsMqxbm4xoe2neziok5k6K', 'cloud-poste-recherche': 'session_017GoCrf8h8KxG2VZBbzkxXC', 'cmcteams-pdf': 'session_012J818cpkmcrt23Tfera1bg',
  'studio-crea': 'session_01StKmUgVQDaNKxJJCWca3pz', 'robots-ia': 'session_01QWRpftGLY726bWqxNS5n1b', 'pc-config': 'session_01Xncr1t3EoT4hLpf7a35ajY',
  'arbre-pc': 'session_01WC73ptv3SHnNNfDTPnycPf', 'pc-connecteurs': 'session_01LNvWeCyWxQqfNoTPLahTJJ', 'meta': 'session_01LoK7J3LQkTKFkwE2fasGyt',
  'detente': 'session_01Jmp9cPUNiNrRHN4Cui3anM', 'poolpilot': 'session_01X3SAC5TiWFbkS3riw3Tq7N', 'free-apis': 'session_01DxPyb3aRBmVwAR2Dpzu1zy', 'divers': 'session_018eY7LuofoZ6AfjCQwbwJqk'
};
const SANS_ID = ['pc-voix', 'lingua-cloud', 'commerce-cloud', 'table-pilot', 'pont-check', 'pont-point', 'moulin-mobile', 'sdb-mezzanine', 'clayscore-cloud'];
if (J) {
  const B = J.branches || [];
  const noms = B.map((b) => b.branche);
  chk(B.length >= 26 && new Set(noms).size === noms.length, 'annuaire : ' + B.length + ' branches, sans doublon');
  const mal = B.filter((b) => b.session_id != null && !/^session_[A-Za-z0-9]{24}$/.test(b.session_id)).map((b) => b.branche + '=' + b.session_id);
  chk(mal.length === 0, mal.length ? 'identifiant(s) de session mal formé(s) (attendu session_ + 24 caractères) : ' + mal.join(', ') : 'chaque identifiant de session = session_ + 24 caractères alphanumériques');
  const faux = Object.entries(DONNES).filter(([k, v]) => (B.find((b) => b.branche === k) || {}).session_id !== v).map(([k]) => k);
  chk(faux.length === 0, faux.length ? 'identifiant(s) différent(s) de la liste du chef d\'orchestre : ' + faux.join(', ') : 'les 16 identifiants de session sont exactement ceux de la base du pont');
  const vusSans = SANS_ID.filter((k) => { const b = B.find((x) => x.branche === k); return !b || b.session_id !== null; });
  chk(vusSans.length === 0, vusSans.length ? 'devraient être sans identifiant : ' + vusSans.join(', ') : 'les 9 branches sans identifiant n\'ont aucun lien d\'ouverture inventé');
  const lieux = B.filter((b) => b.groupe !== (b.lieu === 'lenovo' ? 'lenovo' : (b.session_id ? 'cloud' : 'sans-session')) || (b.url_session || null) !== (b.session_id ? 'https://claude.ai/code/' + b.session_id : null));
  chk(lieux.length === 0, lieux.length ? 'groupe / url_session incohérents : ' + lieux.map((b) => b.branche).join(', ') : 'groupes ☁️ Cloud / 🖥️ Lenovo / sans session et liens d\'ouverture cohérents');
  chk(B.every((b) => b.nom_clair && b.role && b.role.length < 220), 'chaque branche a un nom clair et un rôle en une phrase');
  const h = SRC['tools/pont/annuaire-branches.html'];
  const m = /<script type="application\/json" id="annuaire">([\s\S]*?)<\/script>/.exec(h);
  let emb = null; try { emb = JSON.parse(m[1]); } catch (e) { /* */ }
  chk(emb && JSON.stringify(emb) === JSON.stringify(J), 'annuaire-branches.html embarque exactement le contenu de annuaire-branches.json');
  const t = SRC['tools/pont/tableau-kdmc.html'];
  const mt = /const ANNU=(\{.*?\});/.exec(t);
  let annu = null; try { annu = JSON.parse(mt[1]); } catch (e) { /* */ }
  const attendu = Object.fromEntries(B.map((b) => [b.branche, b.session_id]));
  chk(annu && JSON.stringify(annu) === JSON.stringify(attendu), 'le tableau KDMC porte la même table branche → session que l\'annuaire' + (annu ? '' : ' (table introuvable)'));
  chk(t.includes('id="annuaire-lien" href="' + ANN_URL + '"') && !SABOTAGE || (SABOTAGE && t.includes(ANN_URL)), 'tableau KDMC : raccourci « Annuaire des branches » vers ' + ANN_URL);
  const a = SRC['kdmc-home/admin/admin.js'];
  chk(a.includes("card('🧭', 'Annuaire des branches', ") && a.includes(ANN_URL), 'admin : tuile « Annuaire des branches » vers ' + ANN_URL);
  chk(SRC['kdmc-home/admin/tableau.js'].includes("'" + ANN_URL + "': 'ia'"), 'admin : la tuile est rangée dans « IA & robots » (aucune tuile perdue)');
}

/* ── 3. vrai navigateur ───────────────────────────────────────────────────────────────────────────────── */
let chromium = null;
for (const base of ['', '/opt/node-tools/node_modules/', '/opt/node22/lib/node_modules/']) {
  try { chromium = (base ? createRequire(base)('playwright') : createRequire(import.meta.url)('playwright')).chromium; break; } catch (e) { /* suivant */ }
}
const now = Date.now();
const compte = (uid, name, off) => ({ uid, name, last_seen: now - off, created: now - 9e8, cgu_at: now - 8e8, hits: 5, last_device: 'iPhone', last_place: 'Monaco', devices: ['iPhone'], places: ['Monaco'], portee: 'domaine', acces: [], bloque: [], attente_admin: uid === 'u2' ? true : undefined,
  apps: { 'cmcteams.kd-mc.com': { sessions: 3, last: now - off } }, history: [{ ts: now - off - 600000, end: now - off, app: 'cmcteams.kd-mc.com', device: 'iPhone', place: 'Monaco' }] });
const ACC = [compte('u1', 'Alice Martin', 60000), compte('u2', 'Bob Durand', 20 * 60000), compte('kdmc_admin', 'Kevin DESARZENS', 1000)];
const BOITE = { ok: true, nonLus: 2, nonLusAlertes: 0, connectes: 1, maj: now, enLigne: [{ uid: 'u1', nom: 'Alice Martin', app: 'cmcteams.kd-mc.com', ts: now - 60000 }],
  sources: [{ id: 'cmcteams', nom: 'CMCteams · messages', icone: '📅', etat: 'ok', total: 2, nonLus: 2, lien: 'https://cmcteams.kd-mc.com/tools/messages/' }],
  messages: [{ cle: 'perso:u:u1', source: 'cmcteams', app: 'cmcteams.kd-mc.com', de: 'Alice Martin', texte: 'Bonjour', ts: now - 60000, nonLus: 1, repondre: 'direct', fil: [], infos: [] }],
  inscriptions: [], codes: [{ uid: 'u2', nom: 'Bob Durand', ts: now - 9000, appareil: 'iPad' }], inscriptionsAdmin: [{ uid: 'u3', nom: 'Chloé Petit', ts: now - 5000, appareil: 'iPhone' }] };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const servir = (racine) => createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const j = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/__sso/whoami') return j({ ok: true, uid: 'kdmc_admin', name: 'Kevin DESARZENS', admin: true, verified: true });
  if (u.pathname === '/__admin/accounts') return j({ ok: true, accounts: ACC, kv: true });
  if (u.pathname === '/__admin/acces') return j({ ok: true, apps: ['portail', 'cmcteams', 'lingua', 'arbre'] });
  if (u.pathname === '/__boite/admin') return j(BOITE);
  if (u.pathname.startsWith('/__')) return j({ ok: true });
  if (u.pathname === '/apps.json') return j(JSON.parse(readFileSync(join(racine, 'apps.json'), 'utf8')));
  let p = join(racine, u.pathname.replace(/^\/+/, ''));
  if (u.pathname.endsWith('/')) p = join(p, 'index.html');
  if (!existsSync(p)) { res.writeHead(404); return res.end('404'); }
  let buf = readFileSync(p);
  if (/\/admin\/(tableau|admin|commerce)\.js$/.test(p) || /kdmc-boite\.js$/.test(p)) buf = Buffer.from(lire(p));   /* mêmes sources (et même sabotage) que le contrôle statique */
  res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(buf);
});

const urlsVues = new Set();
async function navigateur() {
  if (!chromium) { R.avert.push('Playwright introuvable : contrôles en navigateur sautés (ils tournent dans la CI)'); return; }
  let browser;
  try { browser = await chromium.launch(); } catch (e) {
    const dir = '/opt/pw-browsers'; const c = existsSync(dir) ? readdirSync(dir).filter((d) => /^chromium-\d+/.test(d)).sort().reverse() : [];
    for (const d of c) { const ex = join(dir, d, 'chrome-linux', 'chrome'); if (existsSync(ex)) { try { browser = await chromium.launch({ executablePath: ex }); break; } catch (e2) { /* */ } } }
  }
  if (!browser) { R.avert.push('Chromium introuvable : contrôles en navigateur sautés'); return; }
  const srv = servir('kdmc-home'); await new Promise((r) => srv.listen(0, r));
  const BASE = 'http://127.0.0.1:' + srv.address().port;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('**/*', (route) => (/^https?:\/\/127\.0\.0\.1/.test(route.request().url()) || /^(data|blob|about):/.test(route.request().url()) ? route.continue() : route.abort()));
  const erreurs = [];

  /* 3a. l'admin rendue */
  const page = await ctx.newPage(); page.on('pageerror', (e) => erreurs.push(String(e.message)));
  await page.goto(BASE + '/admin/', { waitUntil: 'load' }); await page.waitForTimeout(1500);
  const scan = () => page.evaluate(() => {
    const A = [...document.querySelectorAll('a')];
    const vides = A.filter((a) => /^(#|javascript:.*)?$/i.test((a.getAttribute('href') || '').trim())).map((a) => (a.id || a.className || 'a') + ' « ' + a.textContent.trim().slice(0, 30) + ' »');
    const ids = new Set([...document.querySelectorAll('[id]')].map((e) => e.id));
    const SEC = ['personnes', 'messages', 'commerce', 'apps', 'ia', 'couts', 'reglages'];
    const cibles = [...A.map((a) => a.getAttribute('href') || ''), ...[...document.querySelectorAll('[data-va]')].map((e) => e.getAttribute('data-va'))]
      .filter((h) => h.startsWith('#') && h.length > 1);
    const sansCible = [...new Set(cibles)].filter((h) => { const id = decodeURIComponent(h.slice(1)); const [s] = id.split('/'); return !(ids.has(id) || SEC.includes(s) || id === 'accueil'); });
    return { vides, sansCible, n: A.length, large: document.documentElement.scrollWidth > window.innerWidth + 1 };
  });
  const hashes = [''].concat(['personnes', 'messages', 'commerce', 'apps', 'ia', 'couts', 'reglages'].map((s) => '#' + s));
  const toutVide = new Set(), toutSansCible = new Set(); let large = false;
  for (const h of hashes) { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(250); const r = await scan(); r.vides.forEach((x) => toutVide.add(x)); r.sansCible.forEach((x) => toutSansCible.add(x)); large = large || r.large; }
  chk(toutVide.size === 0, toutVide.size ? 'admin rendue : lien(s) vide(s) : ' + [...toutVide].join(' | ') : 'admin rendue (accueil + 7 rubriques) : aucune ancre vide, « # » ou javascript:');
  chk(toutSansCible.size === 0, toutSansCible.size ? 'admin rendue : ancre(s) sans cible : ' + [...toutSansCible].join(', ') : 'admin rendue : chaque ancre interne a sa cible');
  chk(!large, 'admin à 390 px : aucun débordement horizontal');
  /* les destinations de « Que veux-tu faire ? » et des raccourcis existent (dans la page ou dans le code qui les fabrique) */
  const goKo = await page.evaluate(() => {
    const T = window.kdmcTableau; const ids = new Set([...document.querySelectorAll('[id]')].map((e) => e.id));
    return T.ACTIONS.map((a) => a.go).concat(T.RACCOURCIS.map((r) => r[1])).filter((g) => g.startsWith('#') && !ids.has(g.slice(1))).map((g) => g.slice(1));
  });
  const code = SRC['kdmc-home/admin/admin.js'] + SRC['kdmc-home/admin/commerce.js'] + SRC['kdmc-home/admin/tableau.js'];
  const introuvables = [...new Set(goKo)].filter((id) => !new RegExp('id="' + id + '"|id=\\\\?"' + id + '|\\.id\\s*=\\s*[\'"]' + id + '[\'"]').test(code));
  chk(introuvables.length === 0, introuvables.length ? 'raccourcis / « Que veux-tu faire ? » vers une cible qui n\'existe nulle part : #' + introuvables.join(', #') : 'tous les raccourcis et actions « Que veux-tu faire ? » mènent à une cible qui existe');
  /* la tuile */
  await page.evaluate(() => { location.hash = '#ia'; }); await page.waitForTimeout(300);
  const tuile = page.locator('a.cardrow[href="' + ANN_URL + '"]');
  chk(await tuile.count() === 1, 'admin : la tuile « Annuaire des branches » existe, une seule fois');
  const bt = await tuile.first().boundingBox().catch(() => null);
  chk(!!bt && bt.height >= 44 && bt.x >= 0 && bt.x + bt.width <= 391, 'admin : la tuile est visible dans « IA & robots », ' + Math.round((bt || {}).height || 0) + ' px de haut (>= 44), dans l\'écran');
  chk(((await tuile.first().innerText().catch(() => '')) || '').includes('Annuaire des branches'), 'admin : la tuile porte le nom « Annuaire des branches »');
  /* comptes : noms cliquables */
  await page.evaluate(() => { location.hash = '#personnes'; }); await page.waitForTimeout(400);
  const noms = await page.evaluate(() => {
    const vis = (e) => !!(e.offsetWidth || e.offsetHeight);
    const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) {
      const t = n.textContent; if (!/Alice Martin|Bob Durand|Chloé Petit/.test(t)) continue; const e = n.parentElement;
      if (!vis(e) || e.closest('script,style,textarea,option,title')) continue;
      if (!e.closest('a,button,[data-va],summary,[role=button],[role=link]')) out.push(e.tagName + '.' + e.className + ' « ' + t.trim().slice(0, 40) + ' »');
    }
    return out;
  });
  chk(noms.length === 0, noms.length ? 'admin / comptes : nom(s) de personne affiché(s) sans lien : ' + noms.join(' | ') : 'admin / comptes : chaque nom de personne affiché est un lien (fiche, présence, historique)');
  /* la boîte « Mes messages » */
  await page.evaluate(() => { document.getElementById('tb-boite').click(); }); await page.waitForTimeout(900);
  /* la boîte atterrit d'abord dans la conversation du message direct : son en-tête (le nom de la personne) mène à sa fiche */
  const enteteConv = await page.evaluate(() => { const a = document.querySelector('#boite-fen .bf-ct a.bf-fiche'); return a ? a.getAttribute('href') : null; });
  chk(enteteConv === '/admin/#fiche-u1', 'Mes messages : en conversation, le nom de la personne ouvre sa fiche admin (' + enteteConv + ')');
  await page.evaluate(() => { const b = document.querySelector('#boite-fen .bf-ret'); if (b) b.click(); }); await page.waitForTimeout(500);
  const boite = await page.evaluate(() => {
    const r = document.getElementById('boite-fen'); if (!r) return null;
    const fiches = [...r.querySelectorAll('a.bf-fiche')].map((a) => a.getAttribute('href'));
    const sans = [...r.querySelectorAll('.bf-de')].filter((e) => !e.querySelector('a') && !e.closest('button')).map((e) => e.textContent);
    const h = r.querySelector('a.bf-fiche'); const hb = h ? h.getBoundingClientRect().height : 0;
    return { fiches, sans, hb };
  });
  chk(!!boite && boite.sans.length === 0, boite ? (boite.sans.length ? 'Mes messages : nom(s) sans lien : ' + boite.sans.join(' | ') : 'Mes messages : codes et comptes à valider — chaque nom ouvre sa fiche admin') : 'Mes messages : fenêtre introuvable');
  chk(!!boite && boite.fiches.includes('/admin/#fiche-u2') && boite.fiches.includes('/admin/#fiche-u3') && boite.hb >= 43.5, 'Mes messages : liens ' + JSON.stringify((boite || {}).fiches) + ' présents, cible ' + Math.round((boite || {}).hb || 0) + ' px (>= 44)');
  chk(erreurs.length === 0, erreurs.length ? 'admin : exception(s) JavaScript : ' + erreurs.join(' | ') : 'admin : 0 exception JavaScript');
  (await page.evaluate(() => [...document.querySelectorAll('a[href^="https://"]')].map((a) => a.href))).forEach((u) => urlsVues.add(u));

  /* 3b. le tableau KDMC (page statique, base de données simulée) */
  const tp = await ctx.newPage(); const errT = []; tp.on('pageerror', (e) => errT.push(String(e.message)));
  await tp.addInitScript(() => {
    const T = Date.now();
    const taches = [
      { id: 1, projet: 'Arbre', titre: 'Chercher les actes', statut: 'en_cours', qui: 'arbre-cloud', lien: 'https://kd-mc.com/admin/', note: 'en route', maj: T - 3600e3 },
      { id: 2, projet: 'Domaine', titre: 'Régler Cloudflare', statut: 'a_faire', qui: 'pc-config', lien: '', note: '', maj: T - 7200e3 },
      { id: 3, projet: 'Divers', titre: 'Branche hors annuaire', statut: 'bloque', qui: 'branche-inconnue', lien: '', note: '', maj: T - 7200e3 },
      { id: 4, projet: 'Perso', titre: 'Un code à taper', statut: 'attend_kevin', qui: 'kevin', lien: '', note: '', maj: T - 1000e3 }
    ];
    const msgs = [{ id: 9, ts: T - 600e3, de: 'pc-config', a: 'arbre-cloud', sujet: 'Tâche 1 : un point', corps: 'tâche 1', lu_par: '' }, { id: 8, ts: T - 800e3, de: 'kevin-tableau', a: 'toutes', sujet: 'Kevin (tableau) : relance', corps: '', lu_par: 'arbre-cloud;' }];
    const reveils = [{ session_id: 'session_01FsMqxbm4xoe2neziok5k6K', titre: 'Arbre cloud', pont_id: 'arbre-cloud', actif: 1 }];
    window.claude = { use: async (n) => (n === 'mcp' ? { callTool: async (s, t, a) => { const q = String((a && a.sql) || ''); return { payload: /FROM taches/i.test(q) ? taches : /FROM messages/i.test(q) ? msgs : /FROM reveils/i.test(q) ? reveils : [] }; } } : null) };
  });
  const srv2 = createServer((req, res) => { const p = new URL(req.url, 'http://x').pathname; if (p !== '/t.html') { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES['.html'] }); res.end(lire('tools/pont/tableau-kdmc.html')); });
  await new Promise((r) => srv2.listen(0, r));
  await tp.goto('http://127.0.0.1:' + srv2.address().port + '/t.html', { waitUntil: 'load' }); await tp.waitForTimeout(1500);
  const T = await tp.evaluate(() => {
    const A = [...document.querySelectorAll('a')];
    const vides = A.filter((a) => /^(#|javascript:.*)?$/i.test((a.getAttribute('href') || '').trim())).map((a) => a.textContent.trim().slice(0, 40));
    const ids = new Set([...document.querySelectorAll('[id]')].map((e) => e.id));
    const sansCible = A.map((a) => a.getAttribute('href') || '').filter((h) => h.startsWith('#') && h.length > 1 && !ids.has(h.slice(1)));
    const al = document.getElementById('annuaire-lien'); const r = al ? al.getBoundingClientRect() : null;
    const cpt = document.querySelector('.compteurs').getBoundingClientRect();
    const qui = [...document.querySelectorAll('.carte .qui strong')].map((s) => !!s.querySelector('a'));
    const msgsLiens = [...document.querySelectorAll('.msgs li b')].map((b) => b.querySelectorAll('a').length);
    const puces = [...document.querySelectorAll('#l-relances .etat')].map((e) => e.tagName);
    const petits = A.filter((a) => { const b = a.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.height < 43.5 && !a.closest('p,li.nada'); }).map((a) => a.textContent.trim().slice(0, 30));
    return { vides, sansCible, annuaire: al && al.getAttribute('href'), h: r ? r.height : 0, avantCompteurs: r ? r.bottom <= cpt.top + 1 : false, qui, msgsLiens, puces, large: document.documentElement.scrollWidth > window.innerWidth + 1, nA: A.length, petits, sante: [...document.querySelectorAll('#sante a')].map((a) => a.href) };
  });
  chk(T.vides.length === 0, T.vides.length ? 'tableau KDMC : lien(s) vide(s) : ' + T.vides.join(' | ') : 'tableau KDMC rendu (' + T.nA + ' liens) : aucun lien vide');
  chk(T.sansCible.length === 0, T.sansCible.length ? 'tableau KDMC : ancre(s) sans cible : ' + T.sansCible.join(', ') : 'tableau KDMC : chaque ancre interne (compteurs, accès rapides) a sa cible');
  chk(T.annuaire === ANN_URL && T.h >= 44 && T.avantCompteurs, 'tableau KDMC : « 🧭 Annuaire des branches » en haut, au-dessus des compteurs, ' + Math.round(T.h) + ' px (>= 44)');
  chk(!T.large, 'tableau KDMC à 390 px : aucun débordement horizontal');
  chk(T.qui.length >= 3 && T.qui.every(Boolean), 'tableau KDMC : « Qui : <branche> » est un lien sur chaque tâche (' + T.qui.length + ' vues)');
  chk(T.msgsLiens.length === 0 || T.msgsLiens.every((n) => n === 2), 'tableau KDMC : « de → à » d\'un message du pont sont deux liens');
  chk(T.sante.length >= 1, 'tableau KDMC : la santé des branches cite des branches cliquables');
  const petits = T.petits.filter((x) => x && !/^(Retour|← )/.test(x));
  chk(petits.length === 0, petits.length ? 'tableau KDMC : lien(s) < 44 px : ' + petits.join(' | ') : 'tableau KDMC : tous les liens visibles font >= 44 px de haut');
  chk(errT.length === 0, errT.length ? 'tableau KDMC : exception(s) JavaScript : ' + errT.join(' | ') : 'tableau KDMC : 0 exception JavaScript');
  (await tp.evaluate(() => [...document.querySelectorAll('a[href^="https://"]')].map((a) => a.href))).forEach((u) => urlsVues.add(u));
  srv2.close();

  /* 3c. l'annuaire lui-même */
  const ap = await ctx.newPage(); const errA = [];
  ap.on('pageerror', (e) => errA.push(String(e.message)));
  const srv3 = createServer((req, res) => { res.writeHead(200, { 'content-type': TYPES['.html'] }); res.end(lire('tools/pont/annuaire-branches.html')); });
  await new Promise((r) => srv3.listen(0, r));
  await ap.goto('http://127.0.0.1:' + srv3.address().port + '/', { waitUntil: 'load' }); await ap.waitForTimeout(400);
  const N = await ap.evaluate(() => {
    const ouv = [...document.querySelectorAll('a.ouvrir')];
    const ids = new Set([...document.querySelectorAll('[id]')].map((e) => e.id));
    return { cartes: document.querySelectorAll('.carte').length, ouvrir: ouv.map((a) => a.getAttribute('href')), petits: ouv.filter((a) => a.getBoundingClientRect().height < 44).length,
      navKo: [...document.querySelectorAll('.nav a')].filter((a) => !ids.has(a.getAttribute('href').slice(1))).length, large: document.documentElement.scrollWidth > window.innerWidth + 1,
      sections: ['cloud', 'lenovo', 'sans-session'].map((g) => document.querySelectorAll('#l-' + g + ' .carte').length), retour: document.querySelector('a.retour').getBoundingClientRect().height };
  });
  const attenduOuvrir = (J ? J.branches.filter((b) => b.url_session).map((b) => b.url_session) : []).sort().join();
  chk(N.cartes === (J ? J.branches.length : -1) && N.ouvrir.slice().sort().join() === attenduOuvrir, 'annuaire : ' + N.cartes + ' cartes, ' + N.ouvrir.length + ' liens « Ouvrir la session » = les identifiants connus, rien d\'inventé');
  chk(N.petits === 0 && N.retour >= 44 && N.navKo === 0 && !N.large, 'annuaire à 390 px : liens >= 44 px, groupes joignables, aucun débordement (' + N.sections.join(' / ') + ' = cloud / Lenovo / sans session)');
  chk(errA.length === 0, errA.length ? 'annuaire : exception(s) JavaScript : ' + errA.join(' | ') : 'annuaire : 0 exception JavaScript');
  srv3.close();
  await browser.close(); srv.close();
}

/* ── 4. les adresses kd-mc.com répondent ─────────────────────────────────────────────────────────────── */
async function adresses() {
  const trouve = new Set(urlsVues);
  for (const t of Object.values(SRC)) for (const m of t.matchAll(/https?:\/\/[A-Za-z0-9.-]*kd-mc\.com[A-Za-z0-9_./?=%~-]*/g)) trouve.add(m[0]);
  const liste = [...trouve].filter((u) => /^https?:\/\/([a-z0-9-]+\.)*kd-mc\.com(\/|$)/.test(u)).map((u) => u.replace(/#.*$/, '')).filter((u) => !/[<>{}$]/.test(u));
  const uniques = [...new Set(liste)].sort();
  const ko = [], protegees = [], injoignables = [], absentsEnLigne = [];
  const aller = async (u) => {
    const essai = async (method) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), 20000); try { return await fetch(u, { method, redirect: 'follow', signal: c.signal, headers: { 'user-agent': 'verify-liens-admin' } }); } finally { clearTimeout(t); } };
    try {
      let r = await essai('HEAD');
      if (r.status >= 400) r = await essai('GET');
      return r.status;
    } catch (e) { return 0; }
  };
  const statuts = await Promise.all(uniques.map(async (u) => [u, await aller(u)]));
  for (const [u, s] of statuts) {
    const local = (() => { const m = /^https:\/\/cmcteams\.kd-mc\.com\/(tools\/.*)$/.exec(u); return m && existsSync(m[1].replace(/\?.*$/, '')); })();
    if (s === 0) injoignables.push(u);
    else if (s < 400) continue;
    else if (s === 401 || s === 403) protegees.push(u + '  (' + s + ')');   /* « aucune consultation sans compte » : la porte du domaine répond 401 sans la session de Kevin */
    else if (s === 404 && local) absentsEnLigne.push(u + '  (fichier présent dans le dépôt, pas encore publié)');
    else ko.push(u + '  →  HTTP ' + s);
  }
  chk(ko.length === 0, ko.length ? ko.length + ' adresse(s) kd-mc.com en échec (>= 400) :\n    ' + ko.join('\n    ') : uniques.length + ' adresses kd-mc.com contrôlées : aucune en échec');
  if (protegees.length) R.avert.push(protegees.length + ' adresse(s) derrière la porte du domaine (401/403 attendu sans la session de Kevin, non joignables par un robot) : ' + protegees.join(' | '));
  if (absentsEnLigne.length) R.avert.push('à relire après la mise en ligne : ' + absentsEnLigne.join(' | '));
  if (injoignables.length) {
    if (process.env.STRICT_RESEAU === '1') chk(false, injoignables.length + ' adresse(s) injoignables : ' + injoignables.join(', '));
    else R.avert.push(injoignables.length + ' adresse(s) injoignables (réseau ?) : ' + injoignables.join(', '));
  }
}

/* 5. SERVI : chaque page « cmcteams.kd-mc.com/tools/<dossier>/ » citée par l'admin doit être dans un paquet embarqué du routeur
      (prepare-secours.mjs) — sinon l'adresse répond « Cette page n'existe pas ici » (annuaire, 5.11 : le fichier existait, pas le paquet). */
function servi() {
  const secours = lire('services/kdmc-router/prepare-secours.mjs');
  const sources = ['kdmc-home/admin/admin.js', 'kdmc-home/admin/commerce.js', 'kdmc-home/admin/tableau.js', 'kdmc-home/kdmc-boite.js'].filter(existsSync).map(lire).join('\n');
  const dossiers = [...new Set([...sources.matchAll(/https:\/\/cmcteams\.kd-mc\.com\/(tools\/[a-z0-9-]+)\//g)].map((m) => m[1]))];
  const manquants = dossiers.filter((d) => !secours.includes("chemin: '" + d + "'"));
  chk(manquants.length === 0, manquants.length ? 'dossier(s) cité(s) par l\'admin mais absents des paquets servis : ' + manquants.join(', ') : dossiers.length + ' dossier(s) tools/ cités par l\'admin : tous dans un paquet servi');
}
try { servi(); } catch (e) { chk(false, 'servi : ' + (e && e.stack || e)); }
try { await navigateur(); } catch (e) { chk(false, 'navigateur : ' + (e && e.stack || e)); }
try { await adresses(); } catch (e) { chk(false, 'adresses : ' + (e && e.stack || e)); }

R.ok.forEach((m) => console.log('✅ ' + m));
R.avert.forEach((m) => console.log('⚠️  ' + m));
R.ko.forEach((m) => console.log('❌ ' + m));
console.log('\n' + R.ok.length + ' ✅, ' + R.ko.length + ' ❌' + (SABOTAGE ? ' (SABOTAGE=1 : des ❌ sont attendus)' : ''));
process.exit(R.ko.length ? 1 : 0);
