#!/usr/bin/env node
/**
 * VOIR COMME KEVIN — ouvrir une vraie page du domaine kd-mc.com dans un vrai navigateur,
 * au format iPhone, connecté en tant que Kevin, et rapporter ce qu'ON VOIT :
 * captures d'écran (écran + page entière), version servie, erreurs JS, requêtes en échec,
 * texte visible. Kevin 2026-09-10 : « trouve des solutions pour voir comme moi partout,
 * kd-mc.com aussi et surtout ».
 *
 * POURQUOI un outil : depuis l'agent Claude Code, kd-mc.com est injoignable sur les 4 canaux
 * mesurés le 10.09 (proxy 403, WebFetch EGRESS_BLOCKED, Firecrawl 403, bac à sable Hugging
 * Face 402). Le runner GitHub, lui, a le réseau ouvert. Ce script tourne donc dans le
 * workflow `voir-comme-kevin.yml`, qui dépose le résultat sur une branche de relecture
 * (`claude/voir-<run_id>`) que l'agent peut ensuite `git fetch` et OUVRIR (les images
 * s'affichent dans l'outil Read). Voir tools/voir/rapatrier.sh.
 *
 * Usage :
 *   node tools/voir/voir.mjs "https://cmcteams.kd-mc.com/,https://kd-mc.com/" \
 *        [--connecte] [--vues accueil,monplanning,departs] [--largeur 390] [--sortie voir/out]
 *
 *   --connecte  : session Kevin posée AVANT le chargement (tools/smoke/session-kevin.mjs :
 *                 marques relues dans le code de chaque app ; code admin via KDMC_ADMIN_PIN_SHA256,
 *                 jamais journalisé). Sans le drapeau : visite anonyme.
 *   --vues      : pour CMCteams, enchaîne `sv('<vue>')` et photographie chaque vue.
 *   --largeur   : largeur d'écran (390 = iPhone 14/15 ; 375 = iPhone SE ; 1200 = ordinateur).
 *
 * SÉCURITÉ : périmètre kd-mc.com uniquement (refus sinon), lecture seule, aucun secret dans
 * le rapport (le hash n'apparaît nulle part), captures JPEG (≈100 Ko) pour ne pas gonfler le dépôt.
 */
import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { connecte, masque } from '../smoke/session-kevin.mjs';

const args = process.argv.slice(2);
const urls = (args.find((a) => !a.startsWith('--')) || 'https://cmcteams.kd-mc.com/').split(',').map((s) => s.trim()).filter(Boolean);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def; };
const CONNECTE = args.includes('--connecte');
/* « comme qui ? » — une règle « sauf l'admin » ne se vérifie qu'en se mettant du
   côté de ceux à qui elle s'applique. Par défaut : Kevin (admin). */
const COMME = (args.find((a) => a.startsWith('--comme=')) || '').split('=')[1] || 'kevin';
const VUES = opt('vues', '').split(',').map((s) => s.trim()).filter(Boolean);
const LARGEUR = parseInt(opt('largeur', '390'), 10) || 390;
const SORTIE = opt('sortie', 'voir/out');
const PIN_HASH = (process.env.KDMC_ADMIN_PIN_SHA256 || '').trim();
const DOMAINE = 'kd-mc.com';

const slug = (u) => { const x = new URL(u); return (x.hostname.replace('.' + DOMAINE, '').replace(DOMAINE, 'racine') + x.pathname).replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'racine'; };
const projet = (u) => { try { const h = new URL(u).hostname; return h === DOMAINE || h.endsWith('.' + DOMAINE) || /github\.io|firebasedatabase\.app|workers\.dev/.test(h); } catch { return false; } };

mkdirSync(SORTIE, { recursive: true });
console.log('VOIR COMME ' + (COMME === 'employe' ? 'UN EMPLOYÉ' : 'KEVIN') + ' — ' + urls.length + ' page(s) · largeur ' + LARGEUR + ' · ' + (CONNECTE ? 'CONNECTÉ (code admin ' + masque(PIN_HASH) + ')' : 'anonyme'));

const browser = await chromium.launch();
const iphone = devices['iPhone 13'];
const rapport = { at: new Date().toISOString(), comme: COMME, connecte: CONNECTE, largeur: LARGEUR, pages: [] };
let echecs = 0;

for (const url of urls) {
  const host = new URL(url).hostname;
  if (host !== DOMAINE && !host.endsWith('.' + DOMAINE)) { console.log('✖ hors périmètre, ignoré : ' + url); echecs++; continue; }
  const dossier = join(SORTIE, slug(url)); mkdirSync(dossier, { recursive: true });
  const ctx = await browser.newContext({ ...(LARGEUR <= 500 ? iphone : {}), viewport: { width: LARGEUR, height: LARGEUR <= 500 ? 844 : 800 }, locale: 'fr-FR', timezoneId: 'Europe/Monaco' });
  const page = await ctx.newPage();
  const jsErr = [], reqKo = [], http = [], console_ = [];
  page.on('pageerror', (e) => jsErr.push(String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console_.push('[' + m.type() + '] ' + m.text().slice(0, 160)); });
  /* Les passes de démarrage (seed, équipes, boards, remplacement) s'annoncent en
     « info » : sans elles on voit le RÉSULTAT sans savoir ce qui a tourné. Mesuré
     le 19.09 : octobre restait à 0 équipe en production alors que le correctif
     marchait en local — impossible de trancher sans ce journal. */
  page.on('console', (m) => { const t = m.text(); if (/^\[v9\.\d+ /.test(t)) console_.push('[boot] ' + t.slice(0, 160)); });
  page.on('requestfailed', (r) => { if (projet(r.url()) && !/ERR_ABORTED/.test(r.failure()?.errorText || '')) reqKo.push(r.method() + ' ' + r.url().slice(0, 120) + ' [' + (r.failure()?.errorText || '') + ']'); });
  page.on('response', (r) => { const s = r.status(); if (projet(r.url()) && (s === 404 || s >= 500)) http.push('HTTP ' + s + ' ' + r.url().slice(0, 120)); });
  const P = { url, dossier, ok: true, session: null, captures: [], version: null, titre: null, texte: '', jsErr, reqKo, http, console: console_ };
  try {
    if (CONNECTE) { const m = await connecte(page, url, { pinHash: PIN_HASH, comme: COMME }); P.session = m.note; }
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(5000);
    const lire = async (nom) => {
      const info = await page.evaluate(() => ({
        titre: document.title,
        appVer: (typeof window.APP_VER === 'string' && window.APP_VER) || null,
        badge: (document.querySelector('#verbadge, .version-badge, [data-version], #cmc-ver, .ver-badge') || {}).textContent || null,
        vue: (window.A && window.A.view) || (window.K && window.K.view) || null,
        user: (window.A && window.A.user && window.A.user.name) || null,
        texte: (document.body && document.body.innerText || '').replace(/\s+\n/g, '\n').slice(0, 4000),
      }));
      await page.screenshot({ path: join(dossier, nom + '-ecran.jpg'), type: 'jpeg', quality: 70 });
      await page.screenshot({ path: join(dossier, nom + '-page.jpg'), type: 'jpeg', quality: 60, fullPage: true }).catch(() => {});
      P.captures.push(nom + '-ecran.jpg', nom + '-page.jpg');
      return info;
    };
    const i0 = await lire('01-arrivee');
    P.version = i0.appVer || i0.badge; P.titre = i0.titre; P.texte = i0.texte; P.vue = i0.vue; P.user = i0.user;
    let n = 2;
    for (const v of VUES) {
      const ok = await page.evaluate((vv) => { try { if (typeof window.sv === 'function') { window.sv(vv); return true; } } catch (e) { return String(e); } return false; }, v);
      await page.waitForTimeout(2500);
      // v9.901 — TOUT OUVRIR avant la photo : les familles/sections du planning et des employés
      // sont fermées par défaut, la capture ne montrait que « Ma section » (on ne voyait pas
      // les équipes mélangées que Kevin voit en dépliant). Sans secret, lecture seule.
      await page.evaluate((vv) => { try {
        if (vv === 'planning' && window._planFamOpen) { Object.keys(_planFamOpen).forEach((f) => { _planFamOpen[f] = true; }); if (window._planAbsOpen) Object.keys(_planAbsOpen).forEach((f) => { _planAbsOpen[f] = true; }); dc(); }
        if (vv === 'employees' && typeof _adminViewState === 'function') { const s = _adminViewState(); ['primary', 'mirror', 'fam:bj', 'fam:roulettes', 'fam:baccara', 'fam:cmc', 'fam:cadres', 'noteam:nopresence'].forEach((k) => { s[k] = true; }); _setAdminViewState(s); dc(); }
      } catch (e) {} }, v);
      await page.waitForTimeout(800);
      const iv = await lire(String(n++).padStart(2, '0') + '-' + v.replace(/[^\w]+/g, '_'));
      P['vue_' + v] = { demandee: ok, affichee: iv.vue, texte: iv.texte.slice(0, 1500) };
    }
    // v9.901 — RELEVÉ DES ÉQUIPES (CMCteams) : pour le mois affiché et le suivant, l'équipe et la
    // famille de CHAQUE employé telles que l'app les calcule sur CET appareil (données Firebase de
    // Kevin), à comparer au seed (= PDF) depuis l'agent. Aucun secret, aucune donnée sensible :
    // matricule, nom tel qu'affiché, équipe, famille, nb de cellules.
    if (VUES.length && await page.evaluate(() => !!(window.A && Array.isArray(A.employees) && typeof teamForMonth === 'function'))) {
      const releve = await page.evaluate(() => {
        const out = { appVer: window.APP_VER, seedParser: (window.CMC_PLANNING_SEED || {}).parser || null, mois: {} };
        const keys = []; const y0 = A.year, m0 = A.month; keys.push(y0 + '-' + m0); keys.push(m0 === 11 ? (y0 + 1) + '-0' : y0 + '-' + (m0 + 1));
        keys.forEach((key) => {
          const [y, m] = key.split('-').map(Number);
          let ref = null, recap = false, hist = null; try { ref = lg('cmc_ref_' + key, null); recap = !!(JSON.parse(localStorage.getItem('cmc_recap_teams') || '{}')[key]); hist = (lg('cmc_history_' + key + '_versioned', []) || []).length; } catch (e) {}
          out.mois[key] = {
            ref: ref && { parserVersion: ref.parserVersion || null, seedApplied: ref.seedApplied || null, importedAt: ref.importedAt || null, version: ref.version || null }, recap, versions: hist,
            mirror: (function () { try { return JSON.parse(localStorage.getItem('cmc_team_mirror_' + key)); } catch (e) { return null; } })(),
            chefsT: Object.keys(typeof CHEFS_T !== 'undefined' ? CHEFS_T : {}),
            emps: A.employees.filter((e) => e && e.id).map((e) => ({ id: e.id, n: e.name, fam: e.family || null, fh: (e.familyHistory || {})[key] || null, th: (e.teamHistory || {})[key] || null, tm: teamForMonth(e, y, m, { strict: true }), fm: familyForMonth(e, y, m), cells: Object.keys((A.overrides[key] || {})[e.id] || {}).length, tmo: e.toMo || null })),
          };
        });
        out.teams = (A.teams || []).map((t) => ({ id: t.id, name: t.name, family: t.family || null, board: !!t._board }));
        return out;
      }).catch((e) => ({ erreur: String(e && e.message || e).slice(0, 200) }));
      /* DIAGNOSTIC (Kevin 2026-09-19) : en production, le journal disait « 281
         équipes posées pour octobre » et la mesure juste après donnait 0 —
         impossible à reproduire en local. On relance donc la pose ICI, sur
         l'appareil réel, et on re-mesure : si ça répare, le correctif est bon
         et c'est le MOMENT où il tourne qui est en cause ; si ça ne répare
         pas, c'est autre chose qui efface. Lecture seule côté écran : on ne
         touche pas aux horaires, on ne pose que des équipes manquantes. */
      releve.relance = await page.evaluate(() => {
        const out = { dispo: {}, avant: {}, apres: {} };
        try {
          out.dispo = {
            poseEquipes: typeof _cmcSeedPoseEquipes === 'function',
            completeApresFirebase: typeof _cmcSeedCompleteApresFirebase === 'function',
            appliquerSeed: typeof _cmcApplyPlanningSeed === 'function',
          };
          const cles = Object.keys((window.CMC_PLANNING_SEED || {}).months || {});
          const compte = () => { const o = {}; for (const key of cles) { const [y, m] = key.split('-').map(Number); o[key] = A.employees.filter((e) => e && (e.teamHistory || {})[key]).length; } return o; };
          out.avant = compte();
          if (typeof _cmcApplyPlanningSeed === 'function') _cmcApplyPlanningSeed();
          out.apres = compte();
        } catch (e) { out.erreur = String(e && e.message || e).slice(0, 160); }
        return out;
      }).catch((e) => ({ erreur: String(e && e.message || e).slice(0, 160) }));
      /* MOIS PASSÉS (Kevin 2026-09-19 « enlève les mois passés pour tous sauf l'admin ») :
         une règle « sauf l'admin » ne se vérifie que du côté de ceux à qui elle s'applique.
         On relève donc ce qui RESTE de chaque mois révolu sur CET appareil : équipes,
         plannings, clés de mois. Chez un employé, tout doit être à zéro ; chez Kevin, non.
         C'est ce relevé qui a montré que juillet et août survivaient (le planning vérifié
         les reposait après l'effacement). */
      releve.moisPasses = await page.evaluate(() => {
        const N = new Date(), cur = N.getFullYear() * 12 + N.getMonth();
        const estPasse = (k) => { const [y, m] = String(k).split('-').map(Number); return !isNaN(y) && !isNaN(m) && (y * 12 + m) < cur; };
        const out = { admin: !!(A.user && A.user.id === 'U11804'), moisAffiche: A.year + '-' + A.month, restes: {} };
        const cles = new Set([...Object.keys(A.overrides || {}), ...Object.keys((window.CMC_PLANNING_SEED || {}).months || {})].filter(estPasse));
        for (const k of cles) {
          out.restes[k] = {
            equipes: A.employees.filter((e) => e && (e.teamHistory || {})[k]).length,
            plannings: Object.keys((A.overrides || {})[k] || {}).length,
            cleMois: localStorage.getItem('cmc_team_mirror_' + k) !== null,
          };
        }
        out.total = Object.values(out.restes).reduce((n, r) => n + r.equipes + r.plannings + (r.cleMois ? 1 : 0), 0);
        return out;
      }).catch((e) => ({ erreur: String(e && e.message || e).slice(0, 160) }));
      P.moisPasses = releve.moisPasses;
      writeFileSync(join(dossier, 'equipes.json'), JSON.stringify(releve));
      P.releve = Object.keys(releve.mois || {}).map((k) => k + ' : ' + (releve.mois[k].emps || []).length + ' employés, ' + (releve.mois[k].emps || []).filter((e) => e.tm).length + ' avec équipe, ' + (releve.mois[k].emps || []).filter((e) => e.cells > 0).length + ' avec cellules, recap ' + releve.mois[k].recap + ', parser import ' + ((releve.mois[k].ref || {}).parserVersion || '∅')).join(' · ') || releve.erreur || '';
      P.relance = releve.relance;
      P.captures.push('equipes.json');
    }
  } catch (e) { P.ok = false; P.erreur = String(e && e.message || e).slice(0, 300); echecs++; }
  if (jsErr.length || reqKo.length || http.length) P.ok = P.ok && false;
  rapport.pages.push(P);
  console.log((P.ok ? '✅ ' : '❌ ') + url + ' · version ' + (P.version || '?') + ' · vue ' + (P.vue || '?') + ' · user ' + (P.user || '(anonyme)') + ' · JS ' + jsErr.length + ' · req KO ' + reqKo.length + ' · 404/5xx ' + http.length + (P.erreur ? ' · ' + P.erreur : ''));
  await ctx.close();
}
await browser.close();

/* Rapport lisible (Markdown) + brut (JSON), sans aucun secret. */
const md = ['# Voir comme ' + (COMME === 'employe' ? 'un employé' : 'Kevin') + ' — ' + rapport.at, '', 'Connecté : **' + (CONNECTE ? 'oui (session nommée U11804 ; les zones « admin prouvé » Face ID restent masquées)' : 'non') + '** · largeur ' + LARGEUR + ' px', ''];
for (const P of rapport.pages) {
  md.push('## ' + (P.ok ? '✅' : '❌') + ' ' + P.url, '', '- version servie : `' + (P.version || 'introuvable') + '` · titre : ' + (P.titre || '?') + ' · vue : ' + (P.vue || '?') + ' · utilisateur : ' + (P.user || '(anonyme)'), '- session : ' + (P.session || 'aucune'), '- erreurs JS : ' + P.jsErr.length + (P.jsErr.length ? '\n  - ' + P.jsErr.join('\n  - ') : ''), '- requêtes projet en échec : ' + P.reqKo.length + (P.reqKo.length ? '\n  - ' + P.reqKo.join('\n  - ') : ''), '- 404/5xx projet : ' + P.http.length + (P.http.length ? '\n  - ' + P.http.join('\n  - ') : ''), '- captures : ' + P.captures.map((c) => '`' + join(slug(P.url), c) + '`').join(', '), '');
  if (P.erreur) md.push('- **échec** : ' + P.erreur, '');
  md.push('<details><summary>Texte visible (début)</summary>', '', '```', P.texte.slice(0, 2500), '```', '', '</details>', '');
  for (const k of Object.keys(P).filter((x) => x.startsWith('vue_'))) md.push('- ' + k + ' : demandée ' + JSON.stringify(P[k].demandee) + ' · affichée ' + P[k].affichee, '');
  if (P.releve) md.push('- relevé des équipes (equipes.json) : ' + P.releve, '');
  if (P.moisPasses && P.moisPasses.restes) {
    const r = P.moisPasses, det = Object.keys(r.restes).map((k) => k + ' : ' + r.restes[k].equipes + ' équipes, ' + r.restes[k].plannings + ' plannings' + (r.restes[k].cleMois ? ', clé de mois' : '')).join(' · ');
    md.push('- mois passés encore sur cet appareil (' + (r.admin ? 'ADMIN : normal qu\'il les garde' : 'employé : tout doit être à 0') + ') : **' + r.total + '** reste(s)' + (det ? ' — ' + det : ' (aucun mois passé connu)'), '');
  }
  if (P.relance) md.push('- diagnostic relance : avant ' + JSON.stringify(P.relance.avant) + ' -> apres ' + JSON.stringify(P.relance.apres) + (P.relance.erreur ? ' (' + P.relance.erreur + ')' : ''), '');
  if (P.console && P.console.length) md.push('', '<details><summary>Journal de démarrage (ce qui a tourné)</summary>', '', '```', P.console.slice(0, 40).join('\n'), '```', '', '</details>', '');
}
writeFileSync(join(SORTIE, 'RAPPORT.md'), md.join('\n'));
writeFileSync(join(SORTIE, 'rapport.json'), JSON.stringify(rapport, null, 2));
console.log('→ ' + SORTIE + '/RAPPORT.md (' + rapport.pages.length + ' page(s), ' + echecs + ' échec(s))');
process.exit(echecs ? 1 : 0);
