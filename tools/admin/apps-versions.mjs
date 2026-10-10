#!/usr/bin/env node
/* LA VERSION DE CHAQUE APP, pour le tableau de bord admin unique (kd-mc.com/admin/, section « Apps du domaine »).
 * Kevin 10.10 : « chaque app, sa version, ouvrir ». Une page du domaine ne peut pas lire les autres apps (autres adresses, CSP
 * connect-src 'self') : on relève donc la version DANS LE DÉPÔT, à partir de la carte du routeur (ROUTES de
 * services/kdmc-router/worker.js = la source des adresses) et de la page d'accueil de chaque app (la bulle de version
 * data-version, sinon APP_VER, sinon le commentaire <!-- vX -->). Le fichier dit sa date : le tableau l'affiche (« relevé le … »),
 * jamais comme un chiffre en direct.
 *   node tools/admin/apps-versions.mjs           → écrit kdmc-home/admin/apps-versions.json
 *   node tools/admin/apps-versions.mjs --check   → n'écrit rien, affiche ce qui serait écrit (exit 0)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export function routes(src) {
  const bloc = src.slice(src.indexOf('const ROUTES = {'), src.indexOf('};', src.indexOf('const ROUTES = {')));
  const out = {};
  for (const m of bloc.matchAll(/'([a-z0-9.-]+\.kd-mc\.com|kd-mc\.com)':\s*'\/CMCteams\/?([^']*)'/g)) out[m[1]] = m[2];
  return out;
}
export function versionDe(html) {
  const m = html.match(/version-badge[^>]*data-version="(v?\d[^"]*)"/) || html.match(/data-version="(v?\d[^"]*)"[^>]*version-badge/)
    || html.match(/data-app-ver="(v?\d[^"]*)"/) || html.match(/"data-version":\s*"(v?\d[^"]*)"/)
    || html.match(/APP_VER\s*=\s*['"](v?\d[^'"]*)['"]/) || html.match(/<!--\s*(v\d+\.\d+[\w.-]*)\s*-->/);
  return m ? (m[1].startsWith('v') ? m[1] : 'v' + m[1]) : null;
}
export function releve(racine = RACINE) {
  const r = routes(readFileSync(join(racine, 'services/kdmc-router/worker.js'), 'utf8'));
  const apps = {};
  for (const [host, dossier] of Object.entries(r)) {
    const page = join(dossier, 'index.html');
    const f = join(racine, page);
    apps[host] = { page, version: existsSync(f) ? versionDe(readFileSync(f, 'utf8')) : null };
  }
  return apps;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const apps = releve();
  const sortie = { _doc: 'Généré par tools/admin/apps-versions.mjs — relevé dans le dépôt, pas en direct.', genere: new Date().toISOString().slice(0, 10), apps };
  if (process.argv.includes('--check')) { console.log(JSON.stringify(sortie, null, 1)); process.exit(0); }
  writeFileSync(join(RACINE, 'kdmc-home/admin/apps-versions.json'), JSON.stringify(sortie, null, 1) + '\n');
  const sans = Object.entries(apps).filter(([, a]) => !a.version).map(([h]) => h);
  console.log(Object.keys(apps).length + ' apps relevées, ' + sans.length + ' sans version lisible' + (sans.length ? ' : ' + sans.join(', ') : ''));
}
