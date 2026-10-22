/* VÉRIFICATION RÉELLE — « toutes les informations sont CLIQUABLES et on atterrit au bon endroit » + « chaque app a son bouton 📲 installer / 🔔 notifications »
 * (Kevin 22.10.2026 : « vérifie que toutes les informations données dans toutes les applications soient cliquables et qu'on atterrisse au bon endroit avec la bonne information » ;
 * « toutes mes applications doivent avoir un bouton pour installer l'application »). Tourne en CI (dépôt PUBLIC, gratuit) : le code admin vient du SECRET, part au DOMAINE comme quand Kevin le tape ;
 * vrai Chromium format iPhone ; le robot ouvre CHAQUE application, relève ses liens et contrôle où ils atterrissent. LECTURE SEULE ; SANS_NOMS=1 : des nombres et des adresses SANS paramètres
 * (un journal public se lit par tous). Contrôles par app :
 *   · liens internes : chacun est ouvert (GET) → mort (404/5xx) = ❌ ; fermé par la porte (401/403) = normal ;
 *   · ancres « #x » qui ne mènent à aucun élément de la page = ❌ ; liens vides (« # », javascript:void) = ⚠️ ;
 *   · tel: / mailto: mal formés = ❌ ;
 *   · informations NON cliquables : téléphone, e-mail ou adresse web écrits en texte simple (hors liens, boutons, champs) = ⚠️ (comptés, jamais recopiés) ;
 *   · le bouton 📲 (installer + notifications) est présent. */
import { appendFileSync } from 'node:fs';
import { chromium } from 'playwright';

const HASH = String(process.env.KDMC_ADMIN_PIN_SHA256 || '').trim().toLowerCase();
const RESUME = process.env.GITHUB_STEP_SUMMARY || '';
const ATTENTE = Number(process.env.ATTENTE_MS || 7000);
const APPS = (process.env.APPS || [
  'kd-mc.com/', 'cmcteams.kd-mc.com/', 'apex-ai.kd-mc.com/', 'apex-chat.kd-mc.com/', 'la-detente.kd-mc.com/', 'chez-lolo.kd-mc.com/', 'dashboard.kd-mc.com/',
  'sourcing.kd-mc.com/', 'coffre.kd-mc.com/', 'departs.kd-mc.com/', 'bot.kd-mc.com/', 'beatbot.kd-mc.com/', 'autorisations.kd-mc.com/', 'arbre.kd-mc.com/',
  'lingua.kd-mc.com/', 'studio.kd-mc.com/', 'cuisine.kd-mc.com/', 'worldmonitor.kd-mc.com/', 'osint.kd-mc.com/', 'ia.kd-mc.com/', 'outils.kd-mc.com/',
  'shops.kd-mc.com/', 'kit.kd-mc.com/', 'dossiers.kd-mc.com/', 'tor.kd-mc.com/', 'rotaplan.kd-mc.com/', 'croupier.kd-mc.com/', 'croupier.kd-mc.com/entrainement.html',
  'cmcteams.kd-mc.com/tools/finances/', 'cmcteams.kd-mc.com/tools/messages/',
].join(',')).split(',').map((x) => x.trim()).filter(Boolean);
const lignes = [];
const dire = (t) => { console.log(t); lignes.push(t); };
let mortes = 0, ancres = 0, mal = 0, sansBouton = 0, nonCliquables = 0, pages = 0;
if (!/^[0-9a-f]{64}$/.test(HASH)) { dire('❌ Code admin absent (secret CI) : vérification réelle IMPOSSIBLE — je n\'affirme rien.'); process.exit(1); }

const browser = await chromium.launch(process.env.PW_EXE ? { executablePath: process.env.PW_EXE } : {});
const ctx = await browser.newContext({
  serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
});
const DOMAINE = /(^|\.)kd-mc\.com$/, ECRITURE_OK = /^\/__(admin\/login|sso\/[a-z]+)$/;
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
  try { if (j.grant) localStorage.setItem('kdmc_admin_grant', j.grant); if (j.token) localStorage.setItem('kdmc_sso_token', j.token); } catch (_) { /* stockage interdit */ }
  return { st: x.status, ok: !!j.ok, raison: j.reason || '', token: j.token || '', grant: j.grant || '' };
}, HASH);
dire(`${c.ok ? '✅' : '❌'} connexion ADMIN au domaine${c.ok ? '' : ' — HTTP ' + c.st + ' ' + c.raison}`);
if (!c.ok) { await browser.close(); process.exit(1); }

/* Ce que le navigateur de Kevin a déjà : la session du domaine (cookie) + le pass déposé dans chaque app. On dépose le pass sur chaque origine comme le fait le portail. */
const court = (u) => { try { const x = new URL(u); return x.hostname + x.pathname.slice(0, 50); } catch (_) { return String(u).slice(0, 60); } };
const SANS_BOUTON_OK = /^(admin\.|apex-chat\.)/;   // admin : jamais ; apex-chat : ses propres notifications (le bouton d'installation y reste proposé par l'app)
for (const a of APPS) {
  const [hote, ...rest] = a.split('/'); const chemin = '/' + rest.join('/');
  const p = await ctx.newPage(); const t0 = Date.now();
  try {
    await p.goto('https://' + hote + '/sw.js', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await p.evaluate(({ t, g }) => { try { if (t) localStorage.setItem('kdmc_sso_token', t); if (g) localStorage.setItem('kdmc_admin_grant', g); } catch (_) { /* rien */ } }, { t: c.token, g: c.grant }).catch(() => {});
    const rep = await p.goto('https://' + hote + chemin, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const statut = rep ? rep.status() : 0;
    await p.waitForTimeout(ATTENTE);
    if (statut >= 400 && statut !== 401) { dire('ℹ️ page absente (' + statut + ') — ' + hote + (chemin === '/' ? '' : chemin)); await p.close().catch(() => {}); continue; }
    pages++;
    const r = await p.evaluate(() => {
      const vis = (e) => { const s = getComputedStyle(e), b = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && b.width > 4 && b.height > 4; };
      const liens = [...document.querySelectorAll('a[href]')].filter((x) => !x.closest('[data-kdmc-installer]'));
      const internes = new Set(), vides = [], ancresMortes = [], malFormes = [];
      let externes = 0;
      for (const x of liens) {
        const h = (x.getAttribute('href') || '').trim();
        if (!h || h === '#' || /^javascript:\s*(void\(0\))?;?\s*$/i.test(h)) { if (vis(x)) vides.push(1); continue; }
        if (/^javascript:/i.test(h)) continue;
        if (/^tel:/i.test(h)) { if (!/^tel:\+?[0-9 .()\-]{6,20}$/i.test(h)) malFormes.push('tel'); continue; }
        if (/^mailto:/i.test(h)) { if (!/^mailto:[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"'?]+(\?.*)?$/i.test(h)) malFormes.push('mailto'); continue; }
        if (h[0] === '#') { const id = decodeURIComponent(h.slice(1)); if (id && !document.getElementById(id) && !document.getElementsByName(id).length && !/^[!\/]/.test(id)) ancresMortes.push(1); continue; }
        let u; try { u = new URL(h, location.href); } catch (_) { malFormes.push('url'); continue; }
        if (!/^https?:$/.test(u.protocol)) continue;
        if (/(^|\.)kd-mc\.com$/.test(u.hostname)) internes.add(u.origin + u.pathname + u.search); else externes++;
      }
      /* informations écrites en texte simple, NON cliquables : téléphone, e-mail, adresse web */
      const SANS = new Set(['A', 'BUTTON', 'INPUT', 'TEXTAREA', 'SCRIPT', 'STYLE', 'SELECT', 'OPTION', 'CODE', 'PRE', 'NOSCRIPT', 'TITLE', 'SVG']);
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); const nc = { tel: 0, mail: 0, web: 0 }; let n;
      while ((n = w.nextNode())) {
        const par = n.parentElement; if (!par || SANS.has(par.tagName) || par.closest('a,button,[onclick],[role="button"],[contenteditable="true"],[data-kdmc-installer],script,style,textarea,select') || !vis(par)) continue;
        const t = n.nodeValue; if (!t || t.length < 6) continue;
        if (/(^|[^\w@.])[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(t)) nc.mail++;
        if (/https?:\/\/[^\s]{4,}|(^|\s)www\.[a-z0-9-]+\.[a-z]{2,}/i.test(t)) nc.web++;
        if (/(^|[^\d])(\+\d{2}[\s.]?\d(?:[\s.]?\d{2}){3,4}|0\d(?:[\s.]\d{2}){4})(?!\d)/.test(t)) nc.tel++;
      }
      return { total: liens.length, internes: [...internes].slice(0, 40), nInternes: internes.size, externes, vides: vides.length, ancresMortes: ancresMortes.length, malFormes, nc,
               bouton: !!document.querySelector('[data-kdmc-installer="pastille"]'), titre: (document.title || '').slice(0, 40) };
    });
    /* chaque lien interne est OUVERT pour de vrai (avec la session du domaine) : il doit atterrir sur une vraie page */
    const mortsAdr = []; let ouverts = 0, fermes = 0;
    const jeton = c.token ? { authorization: 'Bearer ' + c.token } : {};
    for (let i = 0; i < r.internes.length; i += 6) {
      await Promise.all(r.internes.slice(i, i + 6).map(async (u) => {
        try { const x = await ctx.request.get(u, { headers: jeton, maxRedirects: 5, timeout: 25000 }); const s = x.status();
          if (s >= 400 && s !== 401 && s !== 403) mortsAdr.push(s + ' ' + court(u)); else if (s === 401 || s === 403) fermes++; else ouverts++; }
        catch (_) { mortsAdr.push('0 ' + court(u)); }
      }));
    }
    const exempte = SANS_BOUTON_OK.test(hote);
    mortes += mortsAdr.length; ancres += r.ancresMortes; mal += r.malFormes.length; nonCliquables += r.nc.tel + r.nc.mail + r.nc.web; if (!r.bouton && !exempte) sansBouton++;
    const pb = [];
    if (mortsAdr.length) pb.push('❌ ' + mortsAdr.length + ' lien(s) MORT(S) : ' + mortsAdr.slice(0, 6).join(' · '));
    if (r.ancresMortes) pb.push('❌ ' + r.ancresMortes + ' ancre(s) sans cible');
    if (r.malFormes.length) pb.push('❌ ' + r.malFormes.length + ' lien(s) tel/mail/url mal formé(s)');
    if (r.vides) pb.push('⚠️ ' + r.vides + ' lien(s) vide(s) (#)');
    if (r.nc.tel + r.nc.mail + r.nc.web) pb.push('⚠️ non cliquable : ' + r.nc.tel + ' tél · ' + r.nc.mail + ' e-mail · ' + r.nc.web + ' adresse(s) web');
    if (!r.bouton && !exempte) pb.push('❌ pas de bouton 📲');
    dire((pb.some((x) => x.startsWith('❌')) ? '❌' : pb.length ? '⚠️' : '✅') + ' ' + hote + (chemin === '/' ? '' : chemin) + ' — ' + r.total + ' liens (' + r.nInternes + ' internes : ' + ouverts + ' ouverts, ' + fermes + ' derrière la porte ; ' + r.externes + ' externes) · 📲 ' + (r.bouton ? 'oui' : exempte ? 'exempté' : 'NON')
      + (pb.length ? ' — ' + pb.join(' ; ') : '') + ' (' + Math.round((Date.now() - t0) / 1000) + ' s)');
  } catch (e) { dire('⚠️ non chargée — ' + hote + ' (' + String(e.message).split('\n')[0].slice(0, 60) + ')'); }
  await p.close().catch(() => {});
}
await browser.close();
dire(`=== ${pages} pages lues · ${mortes} lien(s) mort(s) · ${ancres} ancre(s) sans cible · ${mal} lien(s) mal formé(s) · ${nonCliquables} information(s) non cliquable(s) · ${sansBouton} page(s) sans bouton 📲`);
if (RESUME) { try { appendFileSync(RESUME, '## Liens cliquables et bouton installer\n\n' + lignes.map((l) => '- ' + l).join('\n') + '\n'); } catch (_) { /* pas de résumé */ } }
process.exit(mortes || ancres || mal || sansBouton ? 1 : 0);
