#!/usr/bin/env node
/**
 * Produit le dossier de pages du STAGING d'Apex Chat : une copie des fichiers de la page où l'adresse de l'API de production
 * est remplacée par celle du Worker de staging (dans le code ET dans la politique de sécurité de la page), et un bandeau « STAGING ».
 * node tools/staging-site.mjs [dossier-de-sortie]      (défaut : ./.staging-site à côté de workers/)
 */
import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HOTE_PROD = 'apex-chat-api.9r4rxssx64.workers.dev';
export const HOTE_STAGING = 'apex-chat-api-staging.9r4rxssx64.workers.dev';
const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = join(ICI, '..');
const FICHIERS = ['index.html', 'aide.html', 'cgu.html', 'privacy.html', 'mentions.html', 'diag.html', 'force-update.html', 'force-logout.html', 'manifest.json', 'robots.txt', 'sw.js', 'crypto.js', 'og-image.svg'];
const DOSSIERS = ['lib', 'icons'];
const BANDEAU = '<div style="position:fixed;left:0;bottom:0;z-index:2147483647;pointer-events:none;background:#b45309;color:#fff;font:600 11px/1 system-ui;padding:3px 8px;border-top-right-radius:6px;opacity:.9">🧪 STAGING — données de test</div>';

export function adapter(nom, contenu) {
  let t = contenu.split(HOTE_PROD).join(HOTE_STAGING);
  /* 24.10 (studio-crea, pont 800) : le badge de version est un script de kd-mc.com (/CMCteams/tools/shared/…) : sur workers.dev il répondait 404. Le bandeau STAGING suffit. */
  if (nom === 'index.html') t = t.replace(/<script>\(function\(\)\{if\(window\.Capacitor\)return;var s=document\.createElement\("script"\);s\.src='\/CMCteams\/tools\/shared\/version-badge-pwa\.js';[\s\S]*?<\/script>/, '');
  if (nom === 'index.html') t = t.replace('</body>', BANDEAU + '</body>');
  if (nom === 'robots.txt') t = 'User-agent: *\nDisallow: /\n';
  return t;
}
const texte = (f) => ['.html', '.js', '.json', '.txt', '.svg', '.css', '.xml'].includes(extname(f));

export function produire(sortie = join(RACINE, '.staging-site')) {
  rmSync(sortie, { recursive: true, force: true });
  mkdirSync(sortie, { recursive: true });
  const ecrits = [];
  const copier = (src, dst, nom) => {
    if (texte(src)) writeFileSync(dst, adapter(nom, readFileSync(src, 'utf8')));
    else cpSync(src, dst);
    ecrits.push(nom);
  };
  for (const f of FICHIERS) if (existsSync(join(RACINE, f))) copier(join(RACINE, f), join(sortie, f), f);
  for (const d of DOSSIERS) {
    const dir = join(RACINE, d); if (!existsSync(dir)) continue;
    mkdirSync(join(sortie, d), { recursive: true });
    for (const f of readdirSync(dir)) if (statSync(join(dir, f)).isFile()) copier(join(dir, f), join(sortie, d, f), `${d}/${f}`);
  }
  return ecrits;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const e = produire(process.argv[2]);
  console.log(`dossier de pages de staging : ${e.length} fichier(s)`);
}
