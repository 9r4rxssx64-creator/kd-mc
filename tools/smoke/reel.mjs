#!/usr/bin/env node
/* VOIR LE DOMAINE POUR DE VRAI, DEPUIS LA SESSION (Kevin 16.10.2026 nuit : « Dis à toutes tes branches de se connecter réel partout,
   même le domaine, trouve des solutions, pour toujours tout vérifier réel partout »).

   Mesuré le 16.10 : une session Claude Code ATTEINT kd-mc.com (curl 200) ; seul le vrai navigateur échouait
   (ERR_CERT_AUTHORITY_INVALID) parce que le magasin du navigateur (NSS) ne connaissait pas l'autorité du proxy de la session.
   Ce script :
     1. inscrit cette autorité dans le magasin du navigateur (une fois ; c'est la configuration prévue du proxy, pas un contournement :
        AUCUNE vérification TLS n'est coupée) ;
     2. demande un vrai pass au routeur pour le robot `ci_smoke` (sans fiche, hors quota d'inscriptions) ;
     3. ouvre chaque page dans Chromium au format iPhone, connecté (cookie kdmc_sso + jeton rangé), et relève :
        code HTTP, titre, version servie (sw.js / version.txt), écran de connexion ou non, erreurs JS, requêtes en échec ;
     4. photographie chaque page dans audit/captures-reel/ (hors dépôt) et écrit audit/captures-reel/rapport.json.

   Usage : node tools/smoke/reel.mjs [url…]      (défaut : les pages principales)      npm run reel
           node tools/smoke/reel.mjs --confiance  (prépare seulement le navigateur ; le hook de démarrage le fait dans chaque session)
   Périmètre : kd-mc.com et ses sous-domaines UNIQUEMENT. Lecture seule. Aucun code admin (le robot n'est pas l'admin :
   les zones « admin prouvé » restent fermées, et le rapport le dit). */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SORTIE = path.join(R, 'audit/captures-reel');
const DEFAUT = ['https://kd-mc.com/', 'https://cmcteams.kd-mc.com/', 'https://cmcteams-light.kd-mc.com/', 'https://apex-ai.kd-mc.com/', 'https://lingua.kd-mc.com/', 'https://kd-mc.com/admin/', 'https://admin.kd-mc.com/'];
const urls = process.argv.slice(2).filter((a) => /^https:\/\//.test(a));
const pages = urls.length ? urls : DEFAUT;
const horsDomaine = pages.filter((u) => !/^https:\/\/([a-z0-9-]+\.)*kd-mc\.com(\/|$)/.test(u));
if (horsDomaine.length) { console.error('Refusé (hors kd-mc.com) : ' + horsDomaine.join(', ')); process.exit(2); }

/* 1. le navigateur fait confiance à l'autorité du proxy de la session (sinon ERR_CERT_AUTHORITY_INVALID) */
function confianceNavigateur() {
  const ca = '/root/.ccr/agent-proxy-ca.crt', db = 'sql:' + path.join(process.env.HOME || '/root', '.pki/nssdb');
  if (!process.env.HTTPS_PROXY || !fs.existsSync(ca)) return 'pas de proxy de session (rien à faire)';
  const certutil = () => execFileSync('certutil', ['-L', '-d', db], { encoding: 'utf8' });
  try { if (/ccr-agent-proxy/.test(certutil())) return 'déjà en place'; } catch (e) {
    try { execFileSync('apt-get', ['install', '-y', 'libnss3-tools'], { stdio: 'ignore' }); } catch (e2) { return 'certutil absent et non installable — le navigateur refusera le domaine'; }
  }
  fs.mkdirSync(db.slice(4), { recursive: true });
  execFileSync('certutil', ['-A', '-d', db, '-n', 'ccr-agent-proxy', '-t', 'C,,', '-i', ca]);
  return /ccr-agent-proxy/.test(certutil()) ? 'inscrite' : 'échec';
}

/* 2. un vrai pass, pour le robot de contrôle */
async function pass() {
  const r = await fetch('https://kd-mc.com/__sso/issue', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://kd-mc.com' }, body: JSON.stringify({ uid: 'ci_smoke', name: 'CI Smoke', cgu: true }) });
  const j = await r.json().catch(() => ({}));
  return { http: r.status, token: j.token || '', erreur: j.error || j.erreur || '' };
}

async function versionServie(origine) {
  for (const f of ['version.txt', 'sw.js']) {
    try {
      const r = await fetch(origine + '/' + f, { cache: 'no-store' });
      if (!r.ok) continue;
      const t = await r.text();
      if (f === 'version.txt') return t.trim().slice(0, 40);
      const m = t.match(/(?:CACHE[A-Z_]*|VERSION)\s*=\s*['"`]([^'"`]{2,60})['"`]/);
      if (m) return m[1];
    } catch (e) { /* page suivante */ }
  }
  return '';
}

const confiance = confianceNavigateur();
/* --confiance : seulement préparer le navigateur (appelé par le hook de démarrage de CHAQUE session, 17.10) */
if (process.argv.includes('--confiance')) { console.log('[reel] navigateur ↔ proxy : ' + confiance); process.exit(0); }
console.log('Navigateur ↔ proxy de la session : ' + confiance);
const p = await pass();
console.log('Pass ci_smoke : ' + (p.token ? 'obtenu' : 'REFUSÉ (' + p.http + ' ' + p.erreur + ') — les pages seront vues anonymes'));

const { chromium } = await import('playwright');
const exe = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const browser = await chromium.launch({ executablePath: exe, proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1 kdmc-verif-reelle' });
if (p.token) {
  await ctx.addCookies([{ name: 'kdmc_sso', value: p.token, domain: '.kd-mc.com', path: '/', secure: true, httpOnly: true, sameSite: 'Lax' }]);
  await ctx.addInitScript((t) => { try { localStorage.setItem('kdmc_sso_token', t); } catch (e) { /* stockage fermé */ } }, p.token);
}
fs.mkdirSync(SORTIE, { recursive: true });
const rapport = { quand: new Date().toISOString(), confiance, pass: !!p.token, pages: [] };
for (const u of pages) {
  const page = await ctx.newPage();
  const erreursJs = [], echecs = [];
  page.on('pageerror', (e) => erreursJs.push(String(e.message || e).slice(0, 160)));
  page.on('requestfailed', (q) => { if (/kd-mc\.com/.test(q.url()) && !/ERR_ABORTED/.test((q.failure() || {}).errorText || '')) echecs.push(q.url().slice(0, 120) + ' ' + ((q.failure() || {}).errorText || '')); });
  /* 401/403 = réservé (le robot n'est ni l'admin ni un membre CMC) : noté à part, ce n'est pas une panne */
  page.on('response', (r) => { if (r.status() >= 400 && /kd-mc\.com/.test(r.url())) ((r.status() === 401 || r.status() === 403) ? fermes : echecs).push(r.status() + ' ' + r.url().slice(0, 120)); });
  const fermes = [];
  const ligne = { url: u, http: 0, titre: '', version: '', connexion: false, erreursJs, echecs, fermes, capture: '' };
  try {
    const r = await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 30000 });
    ligne.http = r ? r.status() : 0;
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    ligne.titre = (await page.title()).slice(0, 80);
    ligne.connexion = await page.evaluate(() => !!document.querySelector('input[type=password],input[autocomplete="one-time-code"],input[inputmode=numeric]:not([hidden])') && /code|connexion|connecte|se connecter/i.test(document.body.innerText.slice(0, 3000)));
    const nom = new URL(u).hostname.replace(/\./g, '_') + new URL(u).pathname.replace(/[^a-z0-9]+/gi, '_').replace(/_+$/, '');
    ligne.capture = path.relative(R, path.join(SORTIE, nom + '.png'));
    await page.screenshot({ path: path.join(R, ligne.capture) });
  } catch (e) { ligne.erreur = String(e.message || e).split('\n')[0].slice(0, 160); }
  ligne.version = await versionServie(new URL(u).origin);
  rapport.pages.push(ligne);
  const porte = ligne.http === 401 || ligne.http === 403;
  console.log(`${ligne.http === 200 ? '✅' : porte ? '🔒' : '❌'} ${u} — HTTP ${ligne.http}${ligne.erreur ? ' ' + ligne.erreur : ''} · « ${ligne.titre} » · version ${ligne.version || '?'}${ligne.connexion ? ' · écran de connexion' : ''} · ${erreursJs.length} erreur(s) JS · ${echecs.length} requête(s) en échec${fermes.length ? ' · ' + fermes.length + ' réservée(s) au compte (401/403, normal pour le robot)' : ''}`);
  await page.close();
}
await browser.close();
fs.writeFileSync(path.join(SORTIE, 'rapport.json'), JSON.stringify(rapport, null, 2));
console.log('\nCaptures + rapport : audit/captures-reel/ (ouvre les .png avec l\'outil Read pour VOIR les pages).');
/* 🔒 401/403 = la porte du domaine refuse le robot (réservé) : la page répond, ce n'est pas une panne */
const ko = rapport.pages.filter((l) => ![200, 401, 403].includes(l.http)).length;
process.exit(ko ? 1 : 0);
