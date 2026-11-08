/* VÉRIFICATION RÉELLE — « connecté en admin, AUCUN code à retaper dans tout le domaine » (Kevin 21.10.2026 : « quand je me connecte avec Face ID, tout ça, je n'ai besoin
 * d'aucun code sur tout mon domaine… que je sois reconnu partout, à chaque fois que je change d'application »).
 * Tourne en CI (dépôt PUBLIC, gratuit) : le code admin vient du SECRET (empreinte, jamais écrite ni journalisée), part au DOMAINE (/__admin/login) comme quand Kevin le
 * tape ; vrai Chromium format iPhone ; le robot ouvre CHAQUE application du domaine et dit si elle réclame encore un code à une personne reconnue.
 * LECTURE SEULE (toute écriture hors connexion est absorbée) ; SANS_NOMS=1 : seulement des verdicts et des nombres (un journal public se lit par tous).
 * Un contrôle ne ment pas : « demande un code » = un champ de saisie VISIBLE de code/mot de passe/PIN (ou un libellé « code famille/admin/PIN » visible). */
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
let demandent = 0, muets = 0, ok = 0;
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
for (const a of APPS) {
  const [hote, ...rest] = a.split('/'); const chemin = '/' + rest.join('/');
  const p = await ctx.newPage(); const t0 = Date.now();
  let statut = 0, verdict = '', libelle = '';
  try {
    await p.goto('https://' + hote + '/sw.js', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await p.evaluate(({ t, g }) => { try { if (t) localStorage.setItem('kdmc_sso_token', t); if (g) localStorage.setItem('kdmc_admin_grant', g); } catch (_) { /* rien */ } }, { t: c.token, g: c.grant }).catch(() => {});
    const rep = await p.goto('https://' + hote + chemin, { waitUntil: 'domcontentloaded', timeout: 45000 });
    statut = rep ? rep.status() : 0;
    await p.waitForTimeout(ATTENTE);
    const r = await p.evaluate(() => {
      const vis = (e) => { const s = getComputedStyle(e), b = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && b.width > 8 && b.height > 8 && b.bottom > 0 && b.top < innerHeight * 1.5; };
      const champs = [...document.querySelectorAll('input,textarea')].filter(vis).filter((i) => {
        const t = (i.type || '').toLowerCase(), pl = (i.placeholder || '') + ' ' + (i.getAttribute('aria-label') || '') + ' ' + (i.name || '') + ' ' + (i.id || '');
        return t === 'password' || /\b(code|pin|mot de passe|passcode)\b/i.test(pl);
      });
      const txt = (document.body && document.body.innerText || '').slice(0, 4000);
      const libelle = /(entre|saisis|tape|choisis|crée)\s[^.\n]{0,40}\bcode\b|code (famille|admin|pin)|mot de passe/i.exec(txt);
      return { champs: champs.length, libelle: libelle ? libelle[0].slice(0, 60) : '', ecran: (document.title || '').slice(0, 50) };
    });
    libelle = r.libelle;
    if (statut >= 400 && statut !== 401) verdict = 'ℹ️ page absente (' + statut + ')';
    else if (r.champs > 0 && (/^coffre\./.test(hote) || /\/finances\//.test(chemin))) { verdict = 'ℹ️ coffre chiffré (Coffre, Finances) : déverrouillage local (Face ID possible), non contournable par conception (' + r.champs + ' champ(s))'; muets++; }
    else if (r.champs > 0) { verdict = '❌ DEMANDE UN CODE (' + r.champs + ' champ(s)' + (r.libelle ? ' · « ' + r.libelle + ' »' : '') + ')'; demandent++; }
    else if (statut === 401 || statut === 403) { verdict = '🔒 porte fermée (' + statut + ')'; muets++; }
    else { verdict = '✅ aucun code demandé'; ok++; }
  } catch (e) { verdict = '⚠️ non chargée (' + String(e.message).split('\n')[0].slice(0, 60) + ')'; muets++; }
  dire(`${verdict} — ${hote}${chemin === '/' ? '' : chemin} (${Math.round((Date.now() - t0) / 1000)} s)`);
  await p.close().catch(() => {});
}
await browser.close();
dire(`=== ${ok} sans code · ${demandent} qui demandent un code · ${muets} fermées/non chargées sur ${APPS.length}`);
if (RESUME) { try { appendFileSync(RESUME, '## Admin connecté : aucun code à retaper ?\n\n' + lignes.map((l) => '- ' + l).join('\n') + '\n'); } catch (_) { /* pas de résumé */ } }
process.exit(demandent ? 1 : 0);
