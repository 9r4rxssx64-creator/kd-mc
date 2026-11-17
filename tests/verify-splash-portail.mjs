/* Garde (17.11.2026, bilan d'affichage n°2, pont 2608) : sur l'ÉCRAN DE CONNEXION d'Apex Chat (#splash, z 1000) :
   (1) la pastille « ← KDMC » est au-dessus (la seule sortie pour qui n'a pas de compte), jamais recouverte ;
   (2) elle ne recouvre AUCUN bouton / champ de l'écran (règle stricte des flottants du domaine) ;
   (3) le titre « APEX CHAT » n'est jamais coupé en haut, même en paysage / petit écran (l'écran défile au lieu de couper).
   SABOTAGE=1 : ancien fichier (origin/main, ou ANCIEN_INDEX) → rouge. */
import { chromium } from '/home/user/cmcteams/node_modules/playwright/index.mjs';
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
let fichier = join(racine, 'messaging-app', 'index.html'), tmp = null;
if (process.env.SABOTAGE === '1') { tmp = join(racine, 'messaging-app', '.index-ancien-splash.tmp.html'); writeFileSync(tmp, execSync(`git -C "${racine}" show ${process.env.ANCIEN_INDEX || 'origin/main'}:messaging-app/index.html`, { maxBuffer: 80e6 })); fichier = tmp; }
const ecrans = { 'iphone-se-320': [320, 568], 'iphone-se': [375, 667], 'iphone-13': [390, 664], 'iphone-13-paysage': [844, 390], 'iphone-se-paysage': [667, 375], tablette: [820, 1180], portable: [1280, 720] };
let ko = 0; const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) ko++; };
const b = await chromium.launch({ args: ['--no-sandbox'] });
try {
  for (const [nom, [w, h]] of Object.entries(ecrans)) {
    const c = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
    await c.route('**/*', (r) => r.request().url().startsWith('file://') ? r.continue() : r.abort());
    const p = await c.newPage(); const erreurs = []; p.on('pageerror', (e) => erreurs.push(String(e.message).slice(0, 80)));
    await p.goto('file://' + fichier, { waitUntil: 'load' }); await p.waitForTimeout(1500);
    const r = await p.evaluate(() => {
      document.getElementById('splash').scrollTop = 0; // la mise au point d'un champ peut faire défiler : on mesure au repos, en haut
      const a = document.getElementById('kdmc-portal-link'), sp = document.getElementById('splash');
      const titreHaut = Math.round(document.querySelector('.splash-title').getBoundingClientRect().top); // mesuré en haut de course
      const ra = a.getBoundingClientRect(); const e = document.elementFromPoint(ra.left + ra.width / 2, ra.top + ra.height / 2);
      // écran qui défile : le contrôle du bas se mesure en bas de course (76 px réservés) ; sinon au repos
      const defile = sp.scrollHeight > sp.clientHeight + 1; if (defile) sp.scrollTop = sp.scrollHeight;
      const recouvre = [];
      sp.querySelectorAll('button, input, select, textarea, a[href]').forEach((x) => {
        const rx = x.getBoundingClientRect(); if (!rx.width || !rx.height || getComputedStyle(x).visibility === 'hidden') return;
        const l = Math.max(rx.left, ra.left), t = Math.max(rx.top, ra.top), rr = Math.min(rx.right, ra.right), bb = Math.min(rx.bottom, ra.bottom);
        if (rr > l && bb > t && ((rr - l) * (bb - t)) / (rx.width * rx.height) > 0.02) recouvre.push((x.id || x.tagName) + '');
      });
      return { affiche: !!sp && !sp.classList.contains('h'), dessus: e === a || a.contains(e), recouvre, titreHaut, haut: Math.round(ra.height), large: Math.round(ra.width) };
    });
    ok(r.affiche, `${nom} ${w}×${h} : l'écran de connexion est affiché`);
    ok(r.dessus, `${nom} : la pastille « ← KDMC » est touchable (au-dessus de l'écran de connexion)`);
    ok(r.recouvre.length === 0, `${nom} : la pastille ne recouvre aucun contrôle` + (r.recouvre.length ? ' (' + r.recouvre.join(', ') + ')' : ''));
    ok(r.titreHaut >= 0, `${nom} : le titre n'est pas coupé en haut (haut du titre à ${r.titreHaut} px)`);
    ok(r.haut >= 44 && r.large >= 44, `${nom} : la pastille fait ${r.large}×${r.haut} (≥ 44)`);
    ok(erreurs.length === 0, `${nom} : aucune erreur JavaScript` + (erreurs.length ? ' : ' + erreurs.join(' ; ') : ''));
    await c.close();
  }
} finally { await b.close(); if (tmp && existsSync(tmp)) unlinkSync(tmp); }
process.exit(ko ? 1 : 0);
