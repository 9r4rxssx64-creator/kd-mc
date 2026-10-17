/* VÉRIFICATION RÉELLE : BEE EST-ELLE PARTOUT, ET SAIT-ELLE TRAVAILLER SUR N'IMPORTE QUEL SUJET ? — connecté en admin comme Kevin, iPhone, vrai domaine
 * (Kevin 17.10.2026 : « vérifie que Javis, enfin Bee, est bien présent, le petit widget, dans TOUTES mes applications, qu'il a accès à tout mon domaine, qu'il peut travailler
 * sur n'importe quel sujet, faire n'importe quelle tâche pour moi, de partout. Il a la parité Apex. Et avec toi aussi, même compétence »).
 *
 * Même voie que verif-live-bee.mjs : le code admin vient du SECRET (empreinte, jamais écrite ni journalisée), part au DOMAINE (/__admin/login), LECTURE seule
 * (aucune carte ✅ confirmée, la conversation de Kevin n'est pas modifiée).
 *
 *   P. PRÉSENCE : chaque adresse du domaine (la liste est lue dans le routeur, une adresse par page distincte, + admin) est OUVERTE comme Kevin ; on regarde si le petit
 *      widget de Bee est là (posé en direct, ou dans le cadre /__javis/cadre) et VISIBLE (taille non nulle). Une page qui se retire exprès (<meta name="kdmc-bee" content="off">)
 *      est notée ⏭, jamais ✅ ; une page absente est ❌ avec ce que le robot voit.
 *   T. TÂCHES : une batterie de demandes de sujets très différents est posée à la vraie Bee (météo, calcul, heure ailleurs, conversion, fait du monde, planning, arbre, lecture d'une
 *      page du domaine, ce qu'elle sait faire, une tâche pour laquelle elle n'a pas d'outil). Chaque réponse doit être UTILE (jamais « je n'ai pas accès / je ne peux pas / c'est Apex »)
 *      et, quand le résultat est objectif, juste. Les réponses privées (planning, arbre) ne sont jamais recopiées dans le rapport.
 *
 * node tests/verif-live-bee-partout.mjs   (KDMC_ADMIN_PIN_SHA256 requis ; CAPTURES = dossier des captures)
 * ESSAI_LOCAL=1 : domaine simulé (deux adresses, une IA simulée) — c'est test:verif-live-bee-partout-robot.
 * SABOTAGE=absent (une page n'a pas le widget) : P DOIT rougir ; SABOTAGE=refus (la réponse dit « je n'ai pas accès ») : T DOIT rougir. */
import { readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const LOCAL = process.env.ESSAI_LOCAL === '1';
const SABOTAGE = String(process.env.SABOTAGE || '');
const HASH = LOCAL ? '0'.repeat(64) : String(process.env.KDMC_ADMIN_PIN_SHA256 || '').trim().toLowerCase();
const CAPTURES = process.env.CAPTURES || '/tmp/captures';
const RESUME = process.env.GITHUB_STEP_SUMMARY || '';
const lignes = [];
const dire = (t) => { console.log(t); lignes.push(t); };
let echecs = 0;
const ok = (c, m, d) => { if (!c) echecs++; dire(`${c ? '✅' : '❌'} ${m}${!c && d ? ' — ' + d : ''}`); };
const fin = (code) => {
  if (RESUME) { try { appendFileSync(RESUME, '## Bee partout + tâches (admin, iPhone)\n\n' + lignes.map((l) => '- ' + l).join('\n') + '\n'); } catch (_) { /* pas de résumé */ } }
  dire(code ? `=== VÉRIF BEE PARTOUT : ÉCHEC (${echecs} contrôle(s))` : '=== VÉRIF BEE PARTOUT : OK');
  process.exit(code);
};
if (!/^[0-9a-f]{64}$/.test(HASH)) { dire('❌ Code admin absent (secret CI) : vérification réelle IMPOSSIBLE — je n\'affirme rien.'); fin(1); }
try { mkdirSync(CAPTURES, { recursive: true }); } catch (_) { /* dossier déjà là */ }

/* ───── les adresses : lues dans le routeur (jamais une liste recopiée qui vieillit), une par page distincte ───── */
function adresses() {
  if (LOCAL) return ['a.kd-mc.com', 'b.kd-mc.com', 'c.kd-mc.com'];
  const src = readFileSync('services/kdmc-router/worker.js', 'utf8');
  const bloc = src.slice(src.indexOf('const ROUTES = {'), src.indexOf('};', src.indexOf('const ROUTES = {')));
  const vu = new Map();
  for (const m of bloc.matchAll(/^\s*'((?:[a-z0-9-]+\.)?kd-mc\.com)':\s*'([^']+)'/gm)) if (!vu.has(m[2])) vu.set(m[2], m[1]);
  const l = [...vu.values()].filter((h) => !/^www\./.test(h));
  if (!l.includes('admin.kd-mc.com')) l.push('admin.kd-mc.com');
  return l;
}
const HOTES = adresses();

const browser = await chromium.launch(process.env.PW_EXE ? { executablePath: process.env.PW_EXE } : {});
const ctx = await browser.newContext({
  serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
});
await ctx.addInitScript(() => { try { localStorage.setItem('kdmc_perso3d', '0'); localStorage.setItem('javis_widget_bonjour', 'x'); } catch (_) { /* stockage interdit */ } });
const DOMAINE_OK = /(^|\.)kd-mc\.com$/;
const ABSORBE = /^\/__javis\/(agir|fil)$/;
const ECRITURE_OK = /^\/__(admin\/login|javis\/ai|sso\/[a-z]+|javis\/qui)$/;
if (LOCAL) {
  const WIDGET = '<div id="javis-root"><button id="javis-launcher" style="width:60px;height:60px">🐝</button></div>';
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url()), J = (o, st = 200) => r.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(o) });
    if (!DOMAINE_OK.test(u.hostname)) return r.abort();
    if (u.pathname === '/__admin/login') return J({ ok: true, grant: 'g', token: 't', admin: true, verified: true });
    if (u.pathname === '/__javis/ai') {
      const q = String(((JSON.parse(r.request().postData() || '{}').messages || []).slice(-1)[0] || {}).content || '');
      if (SABOTAGE === 'refus') return J({ ok: true, text: 'Je n\'ai pas accès à ça, c\'est Apex qui peut.', provider: 'groq' });
      if (/météo|temps/i.test(q)) return J({ ok: true, text: 'Demain à Monaco : 21 °C, ensoleillé.', outils: ['meteo'] });
      if (/17 ?%/.test(q)) return J({ ok: true, text: '17 % de 2 340 = 397,8.', outils: ['calcul'] });
      if (/tokyo/i.test(q)) return J({ ok: true, text: 'À Tokyo il est 22:15.', outils: ['heure_ailleurs'] });
      if (/petit prince/i.test(q)) return J({ ok: true, text: 'Antoine de Saint-Exupéry a écrit « Le Petit Prince ».', outils: ['rechercher'] });
      if (/miles/i.test(q)) return J({ ok: true, text: '10 km = 6,21 miles.', outils: ['convertir'] });
      if (/sais faire/i.test(q)) return J({ ok: true, text: 'Je sais ouvrir tes apps, chercher dans l\'arbre, lire une page, programmer un rappel, déposer une tâche pour Claude Code…', outils: ['mes_pouvoirs'] });
      return J({ ok: true, text: 'Voilà ce que j\'ai trouvé : ' + 'oui '.repeat(20), outils: ['rechercher'] });
    }
    if (u.pathname.startsWith('/__')) return J({ ok: false });
    if (u.hostname === 'c.kd-mc.com') return r.fulfill({ status: 200, contentType: 'text/html', body: '<title>C</title><meta name="kdmc-bee" content="off"><body>plein écran</body>' });
    if (u.hostname === 'b.kd-mc.com' && SABOTAGE === 'absent') return r.fulfill({ status: 200, contentType: 'text/html', body: '<title>B</title><body>sans widget</body>' });
    return r.fulfill({ status: 200, contentType: 'text/html', body: '<title>' + u.hostname + '</title><body>page ' + WIDGET + '</body>' });
  });
} else {
  await ctx.route('**/*', async (r) => {
    const q = r.request(), m = q.method();
    let u; try { u = new URL(q.url()); } catch (_) { return r.abort(); }
    if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return r.fallback();
    if (DOMAINE_OK.test(u.hostname) && ABSORBE.test(u.pathname)) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"lectureSeule":true}' });
    if (DOMAINE_OK.test(u.hostname) && (ECRITURE_OK.test(u.pathname) || !/^\/__/.test(u.pathname))) return r.fallback();
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"lectureSeule":true}' });
  });
}

async function connecter(page) {
  const h0 = HOTES[0] || 'kd-mc.com';
  await page.goto('https://' + (LOCAL ? h0 : 'javis.kd-mc.com') + '/sw.js', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  return page.evaluate(async (h) => {
    const x = await fetch('/__admin/login', { method: 'POST', credentials: 'include', cache: 'no-store', headers: { 'content-type': 'application/json', 'x-kdmc-verif': '1' }, body: JSON.stringify({ hash: h }) });
    const j = await x.json().catch(() => ({}));
    try { if (j.grant) localStorage.setItem('kdmc_admin_grant', j.grant); if (j.token) localStorage.setItem('kdmc_sso_token', j.token); } catch (_) { /* stockage interdit */ }
    return { st: x.status, ok: !!j.ok, raison: j.reason || '' };
  }, HASH);
}

/* Le widget de Bee sur CETTE page : direct (#javis-launcher) ou dans le cadre du domaine ; visible = taille non nulle. */
async function presence(host) {
  const page = await ctx.newPage();
  try {
    await page.goto('https://' + host + '/', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    const t0 = Date.now(); let r = null;
    while (Date.now() - t0 < 25000) {
      r = await page.evaluate(() => {
        const meta = document.querySelector('meta[name="kdmc-bee"]');
        if (meta && /^(off|non|0)$/i.test(meta.getAttribute('content') || '')) return { etat: 'retrait' };
        const taille = (el) => { if (!el) return 0; const b = el.getBoundingClientRect(), cs = getComputedStyle(el); return cs.display === 'none' || cs.visibility === 'hidden' ? 0 : Math.round(b.width * b.height); };
        const direct = document.getElementById('javis-launcher');
        if (direct && taille(direct) > 0) return { etat: 'present', via: 'direct' };
        const cadre = document.querySelector('iframe[src*="/__javis/cadre"]');
        if (cadre && taille(cadre) > 0) return { etat: 'present', via: 'cadre' };
        return { etat: 'absent', cadre: !!cadre, titre: (document.title || '').slice(0, 40), texte: (document.body && document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 90) };
      }).catch(() => ({ etat: 'illisible' }));
      if (r.etat === 'present' || r.etat === 'retrait') break;
      await page.waitForTimeout(1500);
    }
    return r || { etat: 'illisible' };
  } finally { await page.close().catch(() => {}); }
}

/* Une demande à la vraie Bee, comme le widget l'envoie ; une panne passagère de l'IA gratuite est retentée une fois. */
async function demander(page, texte) {
  for (let essai = 0; essai < 2; essai++) {
    const r = await page.evaluate(async (t) => {
      const tok = (() => { try { return localStorage.getItem('kdmc_sso_token') || ''; } catch (_) { return ''; } })();
      const h = { 'content-type': 'application/json' }; if (tok) h['x-kdmc-sso'] = tok;
      const x = await fetch('/__javis/ai', { method: 'POST', credentials: 'include', headers: h, body: JSON.stringify({ messages: [{ role: 'user', content: t }], contexte: { app: location.hostname.split('.')[0], titre: document.title } }) });
      return { st: x.status, j: await x.json().catch(() => null) };
    }, texte);
    if (r.st === 200 && r.j && r.j.ok && r.j.text) return r;
    if (essai === 1) return r;
    await page.waitForTimeout(3000);
  }
}
const REFUS = /n['’ ]ai pas (?:acc[eè]s|la possibilit|de moyen|d['’ ]outil)|pas acc[eè]s|je ne peux pas (?:ouvrir|acc[eé]der|afficher|faire|t['’ ]aider|r[eé]pondre|donner)|c['’ ]est apex qui|je ne dispose pas|je ne suis pas en mesure|impossible de/i;

try {
  const page = await ctx.newPage();
  const c = await connecter(page);
  ok(c.ok, 'connexion ADMIN au domaine (le code, vérifié par kd-mc.com — comme quand Kevin le tape)', c.ok ? '' : `HTTP ${c.st} ${c.raison}`);
  if (!c.ok) { await browser.close(); fin(1); }

  /* ───── P. présence ───── */
  dire(`── P. PRÉSENCE du widget : ${HOTES.length} adresses du domaine ──`);
  const resultats = [];
  const file = HOTES.slice();
  await Promise.all([0, 1, 2].map(async () => { while (file.length) { const h = file.shift(); resultats.push([h, await presence(h)]); } }));
  resultats.sort((a, b) => HOTES.indexOf(a[0]) - HOTES.indexOf(b[0]));
  let presents = 0, retraits = 0;
  for (const [h, r] of resultats) {
    if (r.etat === 'present') { presents++; ok(true, `${h} : le widget de Bee est là (${r.via})`); }
    else if (r.etat === 'retrait') { retraits++; dire(`⏭  ${h} : la page se retire exprès (<meta name="kdmc-bee" content="off">) — voulu`); }
    else ok(false, `${h} : le widget de Bee est ABSENT`, `état ${r.etat}${r.cadre ? ' (cadre posé mais invisible)' : ''} · page vue : « ${r.titre || ''} — ${r.texte || ''} »`);
  }
  dire(`   ↳ bilan présence : ${presents} avec Bee · ${retraits} retrait(s) voulu(s) · ${resultats.length - presents - retraits} sans`);

  /* ───── T. tâches ───── */
  dire('── T. TÂCHES : la vraie Bee, sujets très différents ──');
  await page.goto('https://' + (LOCAL ? HOTES[0] : 'javis.kd-mc.com') + '/sw.js', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  const BATTERIE = [
    { nom: 'météo', q: 'Quel temps fait-il demain à Monaco ?', juste: /\d+\s?°|degr|ensoleill|nuage|pluie|soleil|couvert|orage|vent/i },
    { nom: 'calcul exact', q: 'Combien font 17 % de 2 340 ?', juste: /397[,.]8/ },
    { nom: 'heure ailleurs', q: 'Quelle heure est-il à Tokyo en ce moment ?', juste: /\d{1,2}\s?[h:]\s?\d{2}/ },
    { nom: 'conversion', q: 'Convertis 10 km en miles.', juste: /6[,.]2/ },
    { nom: 'fait du monde', q: 'Qui a écrit « Le Petit Prince » ?', juste: /saint[- ]exup[eé]ry/i },
    { nom: 'ce qu\'elle sait faire', q: 'Qu\'est-ce que tu sais faire pour moi ?', juste: /ouvr|arbre|rappel|planning|page|lien|t[aâ]che/i },
    { nom: 'planning (privé)', q: 'Quel est mon planning demain ?', juste: null, prive: true },
    { nom: 'arbre (privé)', q: 'Dans l\'arbre, qui sont les parents de Kevin ?', juste: null, prive: true },
    { nom: 'lire une page du domaine', q: 'Regarde la page d\'accueil de kd-mc.com et dis-moi en une phrase ce qu\'on y trouve.', juste: null },
    { nom: 'tâche sans outil', q: 'Fais-moi un tableau comparatif de trois logiciels de montage vidéo gratuits.', juste: null },
    { nom: 'tâche de code', q: 'Ajoute un bouton « imprimer » sur la page des départs.', juste: null, tache: true },
  ];
  for (const b of BATTERIE) {
    const t0 = Date.now();
    const r = await demander(page, b.q);
    const rep = (r && r.j) || {}, texte = String(rep.text || ''), ms = Date.now() - t0;
    const refus = REFUS.test(texte);
    const utile = !refus && texte.trim().length >= (b.juste ? 8 : 25);   /* une réponse objective peut être courte (« À Tokyo il est 22:15. ») */
    const propose = Array.isArray(rep.propositions) && rep.propositions.length > 0;
    let bon = utile || (b.tache && propose);
    let raison = !r || r.st !== 200 ? `HTTP ${r && r.st} ${(rep && rep.reason) || ''}` : refus ? 'refus : « ' + (b.prive ? '(masqué)' : texte.slice(0, 120)) + ' »' : texte.trim().length < (b.juste ? 8 : 25) ? 'réponse vide ou trop courte' : '';
    if (bon && b.juste && !b.juste.test(texte)) { bon = false; raison = 'réponse inexacte : « ' + texte.slice(0, 140) + ' »'; }
    ok(bon, `${b.nom} — ${b.prive ? 'réponse privée (non recopiée)' : '« ' + texte.replace(/\s+/g, ' ').slice(0, 90) + (texte.length > 90 ? '…' : '') + ' »'} (${(rep.outils || []).join(',') || rep.provider || '-'} · ${ms} ms${propose ? ' · carte ✅ proposée' : ''})`, raison);
  }
  await browser.close();
  fin(echecs ? 1 : 0);
} catch (e) {
  dire('❌ le robot a rencontré une erreur : ' + String(e && e.message || e).split('\n')[0].slice(0, 200));
  try { await browser.close(); } catch (_) { /* déjà fermé */ }
  fin(1);
}
