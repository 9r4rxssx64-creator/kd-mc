/* planche-humeurs.mjs — rend Bee ou Bourricot en 3D dans plusieurs humeurs (gros plans) et enregistre UNE planche PNG : on VOIT le résultat avant de le dire.
 *   node tools/3d/planche-humeurs.mjs <nom-de-sortie.png> [bee|bourricot] [humeur:instant,humeur:instant,…]
 * Un personnage NEUF par case (sinon la pose fond depuis l'humeur d'avant et la case ment). Playwright requis (global ou npm i).
 * Aucun chemin n'est accepté en argument : le moteur est toujours javis/perso3d.js du dépôt, la sortie est un NOM de fichier .png écrit dans
 * le dossier temporaire (jamais dans le dépôt), le personnage vient d'une liste fermée. Aucun serveur : la page est montée en direct. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { chromium } = createRequire(path.join(process.cwd(), 'x.js'))('playwright');
const arreter = (m) => { console.error('planche-humeurs : ' + m); process.exit(2); };

const PERSOS = ['bee', 'bourricot'];
const PERSO = process.argv[3] || 'bee';
if (!PERSOS.includes(PERSO)) arreter('personnage inconnu (bee ou bourricot)');
const nom = path.basename(process.argv[2] || 'planche.png').replace(/[^A-Za-z0-9._-]/g, '_');
if (!nom.endsWith('.png')) arreter('le nom de sortie doit finir par .png');
const OUT = path.join(os.tmpdir(), nom);
const MOTEUR = fs.readFileSync(path.join(ROOT, 'javis', 'perso3d.js'), 'utf8');
/* la vraie Bee (v1.3) : ses données (javis/perso3d-reel.js) sont posées AVANT le moteur ; REEL=0 = la Bee faite de formes */
const DONNEES = process.env.REEL === '0' ? '' : fs.readFileSync(path.join(ROOT, 'javis', 'perso3d-reel.js'), 'utf8');
const HUM = (process.argv[4] || 'repos:0.6,joie:0.9,parle:1.3,triste:1,pense:1,surprise:0.5,rire:0.8,coucou:0.7')
  .split(',').map((x) => x.split(':')).map(([h, t]) => [String(h).replace(/[^a-z]/g, ''), Number.parseFloat(t) || 0]);
const PAGE = '<!doctype html><body style="margin:0;background:#222"><canvas id=c width=420 height=420></canvas>';
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 420 * 4, height: 420 * Math.ceil(HUM.length / 4) } });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e.message).slice(0, 120)));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)); });
await p.setContent(PAGE); if (DONNEES) await p.addScriptTag({ content: DONNEES }); await p.addScriptTag({ content: MOTEUR }); await p.waitForTimeout(500);
await p.evaluate(() => window.KdmcPerso3D?.attendreReel?.(8000));
const res = await p.evaluate(({ HUM, PERSO }) => {
  const P = window.KdmcPerso3D;
  if (!P?.actif()) return { ko: '3D indisponible' };
  if (!P.creer(PERSO)) return { ko: 'creer null' };
  document.body.innerHTML = '';
  HUM.forEach(([h, t]) => {
    const c = document.createElement('canvas'); c.width = c.height = 420; c.style.cssText = 'display:inline-block'; document.body.appendChild(c);
    P.creer(PERSO).dessiner(c.getContext('2d'), 420, h, t, { niveau: 0.7, ouv: 0.6 }, '#fdf7e7');
  });
  return { ok: 1, stats: P._stats(), reel: P.reel?.() };
}, { HUM, PERSO });
console.log(JSON.stringify(res), errs.join('|'));
await p.screenshot({ path: OUT }); await b.close();
console.log('planche : ' + OUT);
