#!/usr/bin/env node
/* PUBLIER PUIS PROUVER — l'étape qui manquait après « fusionner » (Kevin 16.10.2026 : « Passe par le dépôt public, trouve des solutions »).
 *
 * POURQUOI : quand le quota Actions du coffre est mangé, plus aucun robot ne copie le code du coffre vers le dépôt public ; le site ne bouge
 * pas, et un déploiement VERT peut tourner sur du vieux code (vécu le 16.10 : lots G et H annoncés « en ligne » à tort).
 * Les autres sessions font la même chose à la main (« Synchronisation LOCALE depuis le coffre ») : cet outil en fait UNE commande, et
 * il ne dit « en ligne » qu'après avoir comparé le commit DÉPLOYÉ au commit PUBLIÉ.
 *
 *   node tools/depot-public/publier-et-verifier.mjs                       publie (publier-local --envoyer), attend le déploiement
 *   node tools/depot-public/publier-et-verifier.mjs --workflow deploy-apex-chat.yml   (défaut : deploy-apex-chat.yml)
 *   --sans-publier   ne publie pas : vérifie seulement ce qui est déjà en ligne
 *   --delai 25       minutes d'attente au plus (défaut 25)
 * Sortie : 0 = le déploiement de CE commit public a réussi · 1 = échec / pas de déploiement · 2 = délai dépassé.
 * Destination : GitHub (dépôt public), ZÉRO cron, ZÉRO minute du coffre. Il utilise `gh api` (session) : en lecture, plus un `dispatches`
 * quand rien ne démarre seul (cas d'un commit qui ne touche que des tests). */
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = '9r4rxssx64-creator/kd-mc';

/** Parmi les exécutions d'un workflow, celle qui porte CE commit public (jamais « la dernière », qui peut être l'ancienne). */
export function runDuCommit(runs, sha) {
  const court = String(sha || '').slice(0, 8);
  if (!court) return null;
  return (runs || []).find((r) => String(r.head_sha || '').startsWith(court)) || null;
}
/** Un commit public plus récent contient-il le mien ? (une autre session a publié entre-temps : mon commit est DANS le sien).
 *  `statut` = le champ « status » de l'API de comparaison (mon commit ... le leur). */
export function estCouvert(statut) { return statut === 'ahead' || statut === 'identical'; }
/** Le verdict à dire à voix haute : 'attente' (rien ou en cours), 'ok', 'echec'. */
export function verdict(run) {
  if (!run) return 'attente';
  if (run.status !== 'completed') return 'attente';
  return run.conclusion === 'success' ? 'ok' : 'echec';
}
/** Faut-il lancer le déploiement à la main ? Seulement si, après le délai de grâce, AUCUNE exécution n'existe pour ce commit. */
export function faut_il_lancer(run, minutesEcoulees, grace = 4) {
  return !run && minutesEcoulees >= grace;
}

const sh = (c, a, o = {}) => execFileSync(c, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...o });
const gh = (chemin, ...extra) => sh('gh', ['api', chemin, ...extra]);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function principal() {
  const args = process.argv.slice(2);
  const val = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
  const wf = val('--workflow', 'deploy-apex-chat.yml');
  const delai = Number(val('--delai', '25'));
  const log = (m) => console.log(m);

  if (!args.includes('--sans-publier')) {
    const r = spawnSync(process.execPath, [join(RACINE, 'tools/depot-public/publier-local.mjs'), '--envoyer'], { stdio: 'inherit', cwd: RACINE });
    if (r.status !== 0) { console.error('⛔ la publication a échoué — rien à vérifier.'); process.exit(1); }
  }
  const sha = gh(`repos/${PUBLIC}/commits/main`, '--jq', '.sha').trim();
  log(`Commit public à prouver : ${sha.slice(0, 8)}`);
  const debut = Date.now();
  let lance = false;
  while ((Date.now() - debut) / 60000 < delai) {
    let runs = [];
    try { runs = JSON.parse(gh(`repos/${PUBLIC}/actions/workflows/${wf}/runs?per_page=10`, '--jq', '[.workflow_runs[]|{status,conclusion,head_sha,html_url}]')); } catch (e) { log('   (lecture impossible : ' + String(e.message).slice(0, 80) + ')'); }
    let run = runDuCommit(runs, sha);
    if (!run) {
      // Une autre session a pu publier APRÈS moi : le dépôt public est alors plus loin, et mon commit est dedans.
      for (const r of runs) {
        try {
          const st = gh(`repos/${PUBLIC}/compare/${sha}...${r.head_sha}`, '--jq', '.status').trim();
          if (estCouvert(st)) { run = r; log(`   (mon commit est inclus dans ${String(r.head_sha).slice(0, 8)}, publié ensuite par une autre session)`); break; }
        } catch { /* comparaison impossible : on garde l'attente */ }
      }
    }
    const v = verdict(run);
    if (v === 'ok') { log(`✅ ${wf} a réussi sur le commit public ${sha.slice(0, 8)} : ${run.html_url}`); process.exit(0); }
    if (v === 'echec') { console.error(`⛔ ${wf} a ÉCHOUÉ sur ${sha.slice(0, 8)} (${run.conclusion}) : ${run.html_url}`); process.exit(1); }
    if (!lance && faut_il_lancer(run, (Date.now() - debut) / 60000)) {
      try { gh(`repos/${PUBLIC}/actions/workflows/${wf}/dispatches`, '-X', 'POST', '-f', 'ref=main'); lance = true; log('   rien ne démarrait seul : déploiement lancé à la main.'); } catch (e) { log('   lancement manuel impossible : ' + String(e.message).slice(0, 80)); lance = true; }
    }
    await dormir(30000);
  }
  console.error(`⏱ délai dépassé (${delai} min) sans verdict pour ${sha.slice(0, 8)}.`);
  process.exit(2);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) principal();
