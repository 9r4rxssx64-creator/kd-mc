/* GARDE (Kevin 22.10.2026, « tout tester partout ») — Créa Studio sur la matrice d'appareils.
 * 1. Statique : l'outil (tools/plateformes/verif-studio-plateformes.mjs) a ses appareils (iPhone de Kevin portrait + paysage, Android, tablette,
 *    portable bas, grand écran), ses mesures (premier dessin, 0 erreur JS, débordement, barre du bas dans l'écran, rien ne recouvre, 9 studios,
 *    galerie des styles, 44 px, pastille de version), ses moteurs (webkit/firefox dits absents) et son sabotage (STUDIO_DIR) ;
 *    le robot gratuit WebKit/Firefox existe au dépôt public ; le Studio porte les correctifs du 25.10 (barre sur deux rangées sous 520 px,
 *    galerie qui s'enroule, boutons d'outils 44 px, pastille qui suit la hauteur de la barre).
 * 2. Réel (Chromium, si Playwright est là) : l'iPhone de Kevin (390×844) et un navigateur étroit 360 px — les deux cas qui étaient rouges
 *    le 25.10 (3 studios et 8 styles hors écran, boutons 40 px) — rejoués pour de vrai, 0 échec attendu.
 *    Sabotage vérifié le 25.10 : avec le Studio d'avant (STUDIO_DIR = v9.18.6), l'iPhone de Kevin donne 5 rouges.
 * La matrice complète sur 3 moteurs : npm run verif:studio-plateformes · robot : .github/workflows/studio-plateformes.yml (dépôt public). */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { spawnSync } from 'node:child_process';
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); const lire = (f) => fs.readFileSync(path.join(R, f), 'utf8');
let ko = 0; const t = (c, m) => { if (!c) ko++; console.log((c ? 'OK ' : 'FAIL ') + m); };
const o = lire('tools/plateformes/verif-studio-plateformes.mjs');
t(/iPhone 14 Pro paysage 844x390/.test(o) && /Pixel 7/.test(o) && /Galaxy S9\+ paysage/.test(o) && /iPad/.test(o) && /Lenovo/.test(o) && /1920x1080/.test(o) && /360 px/.test(o), 'la matrice couvre iPhone (celui de Kevin), Android, tablette, portable bas, navigateur étroit, grand écran');
t(/pageerror/.test(o) && /deborde/.test(o) && /barreDans/.test(o) && /recouverts/.test(o) && /< 6000/.test(o) && /43\.5/.test(o) && /#animStyles \.chip/.test(o) && /vbadge/.test(o) && /STUDIOS = \['photo', 'video', 'anim', 'aivid', 'cam', 'fam', 'mine', 'magic', 'mini'\]/.test(o), 'mesures : premier dessin, 0 erreur JS, débordement, barre dans l\'écran, rien ne recouvre, 9 studios, galerie, 44 px, pastille');
t(/gateName/.test(o) && /gateCode/.test(o) && /hors_ligne_test/.test(o) && /r\.abort\(\)/.test(o), 'compte local fictif par la porte, domaine et IA coupés (aucun réseau)');
t(/webkit/.test(o) && /firefox/.test(o) && /absent ici/.test(o) && /STUDIO_DIR/.test(o), 'WebKit et Firefox prévus, moteur absent DIT, sabotage prévu');
const w = lire('.github/workflows/studio-plateformes.yml');
t(/workflow_dispatch/.test(w) && !/schedule:/.test(w) && /moteur: \[chromium, webkit, firefox\]/.test(w) && /KDMC_RUNNER/.test(w) && /verif-studio-plateformes\.mjs/.test(w) && /EXIGE_PLAYWRIGHT/.test(w), 'robot gratuit : 3 moteurs, à la main, sans cron, interrupteur Lenovo');
const h = lire('tools/crea-studio/index.html');
t(/@media \(max-width:520px\)\{\s*#bnav\{flex-wrap:wrap/.test(h) && /#animStyles\{flex-wrap:wrap/.test(h) && /\.tbtn\{\s*min-width:44px;height:44px/.test(h) && /--navh/.test(h) && /function majNavH/.test(h), 'le Studio porte les correctifs : barre sur deux rangées, galerie enroulée, outils 44 px, pastille qui suit la barre');
const pk = lire('package.json');
t(/"verif:studio-plateformes"/.test(pk) && /npm run test:studio-plateformes/.test(pk), 'les scripts existent et la garde est dans test:ci');
const r = spawnSync(process.execPath, ['tools/plateformes/verif-studio-plateformes.mjs'], { cwd: R, encoding: 'utf8', timeout: 300000,
  env: { ...process.env, ENGINES: 'chromium', PLAT: '390x844 \\(celui de Kevin\\)|360 px' } });
const sortie = (r.stdout || '') + (r.stderr || '');
if (/playwright absent/.test(sortie)) console.log('SKIP Playwright absent : la partie réelle est confiée au robot du dépôt public');
else if (/aucun moteur disponible/.test(sortie)) console.log('SKIP aucun Chromium ici : la partie réelle est confiée au robot du dépôt public');
else { const m = sortie.match(/(\d+)\/(\d+) contrôles OK/); t(!!m && +m[1] === +m[2] && +m[1] >= 20, 'réel (Chromium) : iPhone de Kevin + navigateur étroit 360 px, 0 rouge' + (m ? ` (${m[1]}/${m[2]})` : ' — ' + sortie.slice(-300))); if (r.status !== 0) console.log(sortie.split('\n').filter((l) => /❌|rouge/.test(l)).slice(0, 8).join('\n')); }
console.log(`\n${ko ? '❌ ' + ko + ' échec(s)' : '✅ Créa Studio sur toutes les plateformes : outil, robot, correctifs et cas réels'}`); process.exit(ko ? 1 : 0);
