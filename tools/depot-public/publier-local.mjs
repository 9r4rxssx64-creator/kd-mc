#!/usr/bin/env node
/* PUBLIER SANS GITHUB ACTIONS — le secours qui empêche d'être bloqué (Kevin 15.10.2026 : « Économise le forfait action. Au maximum, trouve des
 * solutions pour ne jamais plus être bloqué. N'importe où. Partout »).
 *
 * POURQUOI : la production est publiée par le dépôt PUBLIC (depuis le 26.09), mais son code vient du coffre via le robot
 * « Coffre → dépôt public : synchroniser le CODE » — qui consomme des minutes Actions du coffre. Quota du coffre épuisé (12.10) = aucune
 * fusion ne partait plus en ligne. Cet outil fait EXACTEMENT les mêmes pas que le robot, depuis une session, sans une minute Actions :
 *   1. exporter + VÉRIFIER (mêmes exporter.mjs / verifier.mjs : rien de sensible ne part, fail-fermé) ;
 *   2. cloner le dépôt public ; refuser si l'export fait moins de 80 % de ce qui y est déjà (export tronqué) ;
 *   3. aligner le dépôt public sur l'export (jamais --force, jamais l'historique) ;
 *   4. A BLANC par défaut : montre ce qui partirait. `--envoyer` pousse (3 essais) puis fait signe au dépôt public (si un jeton existe).
 *
 *   node tools/depot-public/publier-local.mjs                         (à blanc : rien n'est poussé)
 *   node tools/depot-public/publier-local.mjs --envoyer               (pousse sur le dépôt public)
 *   --depot <url|dossier>  (défaut : https://github.com/9r4rxssx64-creator/kd-mc.git ; un dossier git local sert aux tests)
 *   --sortie <dossier>     (défaut : /tmp/kdmc-publier-local)
 * Jeton : variable KDMC_PUBLIC_PAT (jeton du dépôt public) — ou, en session, le dépôt public attaché avec le droit d'écriture (add_repo).
 * Sans l'un ni l'autre : l'envoi échoue proprement (le contrôle à blanc marche toujours). Destination : GitHub, dépôt public — ZÉRO cron.
 * 16.10.2026 (Kevin : « Passe par le dépôt ouvert si possible. Toujours. ») : c'est désormais LA voie normale après chaque fusion —
 * la session lance `--envoyer` elle-même (0 minute du coffre) ; le robot du coffre n'est plus que le train du soir / le secours. */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, readdirSync, statSync, copyFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const val = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const ENVOYER = args.includes('--envoyer');
const SORTIE = resolve(val('--sortie', '/tmp/kdmc-publier-local'));
const DEPOT = val('--depot', 'https://github.com/9r4rxssx64-creator/kd-mc.git');
const PAT = process.env.KDMC_PUBLIC_PAT || '';

const sh = (cmd, a, o = {}) => execFileSync(cmd, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...o });
const log = (m) => console.log(m);
const stop = (m, code = 1) => { console.error('⛔ ' + m); process.exit(code); };

function lister(dossier, base = dossier, out = []) {
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    if (e.name === '.git') continue;
    const p = join(dossier, e.name);
    if (e.isDirectory()) lister(p, base, out); else out.push(relative(base, p));
  }
  return out;
}
/* aligne `cible` sur `source` (copie ce qui est là, supprime ce qui n'y est plus) — l'équivalent de rsync -a --delete sans .git */
export function aligner(source, cible) {
  const voulus = new Set(lister(source));
  for (const f of lister(cible)) if (!voulus.has(f)) rmSync(join(cible, f), { force: true });
  for (const f of voulus) { mkdirSync(dirname(join(cible, f)), { recursive: true }); copyFileSync(join(source, f), join(cible, f)); }
  return voulus.size;
}
/* le plancher : un export qui ne fait pas au moins 80 % du dépôt public est refusé (outil cassé, dossier vide) */
export function plancherOk(prets, avant) { return avant <= 0 || prets >= Math.floor((avant * 80) / 100); }

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  log(`Publier sans Actions — ${ENVOYER ? 'ENVOI RÉEL' : 'à blanc (rien n\'est poussé)'}`);
  rmSync(SORTIE, { recursive: true, force: true });
  try {
    sh(process.execPath, [join(RACINE, 'tools/depot-public/exporter.mjs'), '--sortie', SORTIE], { cwd: RACINE });
    sh(process.execPath, [join(RACINE, 'tools/depot-public/verifier.mjs'), '--sortie', SORTIE], { cwd: RACINE });
  } catch (e) { stop('export ou vérification REFUSÉ — rien ne part :\n' + String(e.stdout || '') + String(e.stderr || '')); }
  const prets = lister(SORTIE).length;
  log(`1. export vérifié : ${prets} fichiers, rien de sensible.`);

  const W = join(SORTIE + '-public');
  rmSync(W, { recursive: true, force: true });
  const url = PAT && /^https:\/\//.test(DEPOT) ? DEPOT.replace('https://', `https://x-access-token:${PAT}@`) : DEPOT;
  try { sh('git', ['clone', '-q', '--depth', '1', url, W]); } catch (e) { stop('clonage du dépôt public impossible : ' + String(e.stderr || e.message).replace(PAT || '§', '***').slice(0, 300)); }
  const avant = lister(W).length;
  log(`2. dépôt public aujourd'hui : ${avant} fichiers · à envoyer : ${prets}`);
  if (!plancherOk(prets, avant)) stop(`l'export ne contient que ${prets} fichiers alors que le dépôt public en a ${avant} (plancher ${Math.floor(avant * 0.8)}) — envoi REFUSÉ : un export tronqué effacerait le site.`);

  aligner(SORTIE, W);
  sh('git', ['config', 'user.name', 'kdmc-publier-local'], { cwd: W });
  sh('git', ['config', 'user.email', 'publier-local@users.noreply.github.com'], { cwd: W });
  sh('git', ['add', '-A'], { cwd: W });
  const diff = sh('git', ['diff', '--cached', '--name-only'], { cwd: W }).split('\n').filter(Boolean);
  if (!diff.length) { log('3. le dépôt public est déjà à jour — rien à envoyer.'); process.exit(0); }
  log(`3. ${diff.length} fichier(s) changeraient :`);
  diff.slice(0, 25).forEach((f) => log('   · ' + f)); if (diff.length > 25) log(`   … et ${diff.length - 25} autres`);
  if (!ENVOYER) { log('À BLANC : rien n\'a été poussé. Relance avec --envoyer pour publier.'); process.exit(0); }

  const sha = (() => { try { return sh('git', ['rev-parse', '--short=9', 'HEAD'], { cwd: RACINE }).trim(); } catch { return 'local'; } })();
  sh('git', ['commit', '-q', '-m', `Synchronisation LOCALE depuis le coffre (${sha}) — sans minutes Actions ; le dépôt public republie le site`], { cwd: W });
  let pousse = false;
  for (let i = 1; i <= 3 && !pousse; i++) {
    try { sh('git', ['push', '-q', 'origin', 'HEAD:main'], { cwd: W }); pousse = true; }
    catch (e) { log(`   essai ${i} échoué : ${String(e.stderr || e.message).replace(PAT || '§', '***').slice(0, 160)}`); try { sh('git', ['pull', '-q', '--rebase', 'origin', 'main'], { cwd: W }); } catch { /* on réessaie */ } }
  }
  if (!pousse) stop('le push sur le dépôt public a échoué 3 fois (droit d\'écriture ? jeton KDMC_PUBLIC_PAT ?). Rien n\'a été modifié là-bas.');
  log('4. poussé sur le dépôt public : il republie le site tout seul.');
  /* 16.10 soir : plus de signal « coffre-a-change » — il n'a plus d'écouteur depuis #4604 (la republication Pages est arrêtée) ;
     chaque robot de déploiement du public relit lui-même les fichiers privés au coffre (action .github/actions/coffre). */
  log('   les fichiers privés (CMCteams, light, arbre…) sont relus au coffre par chaque déploiement public : rien d\'autre à envoyer.');
}
