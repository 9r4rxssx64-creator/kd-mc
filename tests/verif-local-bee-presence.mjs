/* VÉRIFICATION RÉELLE, GRATUITE, EN LOCAL : le widget de Bee est-il sur CHAQUE adresse du domaine ? (Kevin 17.10 : « trouve des solutions pour tout vérifier réel, passe par le gratuit toujours »)
 *
 * Le robot du domaine (verif-live-bee-partout) coûte ~8 min d'Actions du coffre : la ration du jour peut le refuser. Celui-ci ne coûte RIEN : il lance le VRAI routeur (le même worker.js,
 * empaqueté par wrangler comme en production, dans workerd) avec les VRAIES pages de la copie embarquée (prepare-secours.mjs) et ouvre CHAQUE adresse dans un vrai Chromium connecté
 * comme Kevin — avec un code jetable local (aucun secret du domaine). Aucune IA n'est appelée (Workers AI facturerait même en local) : seulement la présence du widget.
 *
 *   1. wrangler dev -c wrangler.local.toml --local --local-protocol https --port 8787   (wrangler.local.toml = wrangler.toml avec main = local-entree.mjs)
 *   2. HASH_LOCAL=<sha256 du code jetable> node tests/verif-local-bee-presence.mjs
 * Sortie : une ligne par adresse (✅ présent en direct / dans le cadre, ⏭ retrait voulu, ❌ absent + la cause lue dans la page). */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { chromium } from 'playwright';

const HASH = String(process.env.HASH_LOCAL || '').trim();
const PORT = process.env.PORT_LOCAL || '8787';
if (!/^[0-9a-f]{64}$/.test(HASH)) { console.log('HASH_LOCAL (sha256 du code jetable de .dev.vars) requis'); process.exit(2); }
const src = readFileSync('services/kdmc-router/worker.js', 'utf8');
const bloc = src.slice(src.indexOf('const ROUTES = {'), src.indexOf('};', src.indexOf('const ROUTES = {')));
const vu = new Map();
for (const m of bloc.matchAll(/^\s*'((?:[a-z0-9-]+\.)?kd-mc\.com)':\s*'([^']+)'/gm)) if (!vu.has(m[2])) vu.set(m[2], m[1]);
const HOTES = [...vu.values()].filter((h) => !/^www\./.test(h));
if (process.env.HOTES) HOTES.splice(0, HOTES.length, ...process.env.HOTES.split(','));

/* le Chromium COMPLET (le « headless shell » ignore --host-resolver-rules sur ce poste) : PW_EXE, sinon celui de /opt/pw-browsers */
function navigateur() {
  if (process.env.PW_EXE) return process.env.PW_EXE;
  try { for (const d of readdirSync('/opt/pw-browsers').filter((x) => /^chromium-\d+$/.test(x)).sort().reverse()) { const e = '/opt/pw-browsers/' + d + '/chrome-linux/chrome'; if (existsSync(e)) return e; } } catch (_) { /* pas de dossier : Playwright choisit */ }
  return undefined;
}
const browser = await chromium.launch({ args: ['--no-sandbox', '--no-proxy-server', '--ignore-certificate-errors', `--host-resolver-rules=MAP *.kd-mc.com 127.0.0.1:${PORT}, MAP kd-mc.com 127.0.0.1:${PORT}`] , executablePath: navigateur() });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: 'block', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => { try { localStorage.setItem('kdmc_perso3d', '0'); localStorage.setItem('javis_widget_bonjour', 'x'); } catch (_) { /* stockage interdit */ } });
await ctx.route((u) => !/(^|\.)kd-mc\.com$/.test(u.hostname), (r) => r.abort());   // rien ne sort : seules les adresses du domaine répondent (le routeur local)

const boot = await ctx.newPage();
await boot.goto('https://javis.kd-mc.com/sw.js', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
const c = await boot.evaluate(async (h) => {
  const x = await fetch('/__admin/login', { method: 'POST', credentials: 'include', cache: 'no-store', headers: { 'content-type': 'application/json', 'x-kdmc-verif': '1' }, body: JSON.stringify({ hash: h }) });
  const j = await x.json().catch(() => ({}));
  try { if (j.grant) localStorage.setItem('kdmc_admin_grant', j.grant); if (j.token) localStorage.setItem('kdmc_sso_token', j.token); } catch (_) { /* stockage interdit */ }
  return { st: x.status, ok: !!j.ok, raison: j.reason || j.error || JSON.stringify(j).slice(0,120) };
}, HASH);
console.log('connexion locale (code jetable) : HTTP ' + c.st + ' ok=' + c.ok + ' ' + (c.raison || ''));
if (!c.ok) { await browser.close(); process.exit(1); }
await boot.close();

async function presence(host) {
  const page = await ctx.newPage(); const csp = [], erreurs = [];
  page.on('console', (m) => { const t = m.text(); if (/Content Security Policy|Refused to/i.test(t) && csp.length < 2) csp.push(t.replace(/\s+/g, ' ').slice(0, 130)); });
  page.on('pageerror', (e) => { if (erreurs.length < 2) erreurs.push(String(e && e.message).slice(0, 80)); });
  try {
    await page.goto('https://' + host + '/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    const t0 = Date.now(); let r = null;
    while (Date.now() - t0 < 12000) {
      r = await page.evaluate(() => {
        const meta = document.querySelector('meta[name="kdmc-bee"]');
        if (meta && /^(off|non|0)$/i.test(meta.getAttribute('content') || '')) return { etat: 'retrait' };
        const taille = (el) => { if (!el) return 0; const b = el.getBoundingClientRect(), cs = getComputedStyle(el); return cs.display === 'none' || cs.visibility === 'hidden' ? 0 : Math.round(b.width * b.height); };
        const direct = document.getElementById('javis-launcher');
        if (direct && taille(direct) > 0) return { etat: 'present', via: 'direct' };
        const cadre = document.querySelector('iframe[src*="/__javis/cadre"]');
        if (cadre && taille(cadre) > 0) return { etat: 'present', via: 'cadre' };
        return { etat: 'absent', titre: (document.title || '').slice(0, 40), tag: !!document.querySelector('script[src*="__javis/partout"]'), marqueur: /(?:^|;\s*)kdmc_k=1(?:;|$)/.test(document.cookie),
          lancee: !!window.__kdmcBee, erreurBee: window.__kdmcBeeErr || '', cadre: cadre ? 'posé, ' + (cadre.style.display || 'visible') : 'non', csp: (document.querySelector('meta[http-equiv="Content-Security-Policy"]') ? 'meta' : 'en-tête') };
      }).catch(() => ({ etat: 'illisible' }));
      if (r.etat === 'present' || r.etat === 'retrait') break;
      await page.waitForTimeout(1000);
    }
    if (r && r.etat === 'absent') r.diag = `titre « ${r.titre} » · balise partout.js ${r.tag} · marqueur ${r.marqueur} · Bee lancée ${r.lancee} · erreur de Bee « ${r.erreurBee || 'aucune'} » · cadre ${r.cadre} · CSP ${r.csp}` + (csp.length ? ' · console : ' + csp.join(' | ') : '') + (erreurs.length ? ' · erreurs JS : ' + erreurs.join(' | ') : '');
    return r || { etat: 'illisible' };
  } finally { await page.close().catch(() => {}); }
}
const res = []; const file = HOTES.slice();
await Promise.all([0, 1, 2].map(async () => { while (file.length) { const h = file.shift(); res.push([h, await presence(h)]); } }));
res.sort((a, b) => HOTES.indexOf(a[0]) - HOTES.indexOf(b[0]));
let p = 0, rt = 0, ab = 0;
for (const [h, r] of res) {
  if (r.etat === 'present') { p++; console.log(`✅ ${h} : Bee est là (${r.via})`); }
  else if (r.etat === 'retrait') { rt++; console.log(`⏭  ${h} : la page se retire exprès`); }
  else { ab++; console.log(`❌ ${h} : ABSENTE — ${r.diag || r.etat}`); }
}
console.log(`\nBILAN LOCAL : ${p} avec Bee · ${rt} retrait(s) voulu(s) · ${ab} sans · sur ${res.length} adresses`);
await browser.close();
process.exit(ab ? 1 : 0);
