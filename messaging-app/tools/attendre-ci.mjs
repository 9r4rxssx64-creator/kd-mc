#!/usr/bin/env node
/**
 * Attend, par l'API GitHub, qu'un workflow (ou un de ses jobs) du MÊME commit soit terminé avec succès.
 *
 * Lot E2 (audit A5, F4, 15.10.2026) : la mise à jour forcée de tous les téléphones partait sur
 * `push`, sans rien attendre — mesuré le 15.10 : POST force-update à 09:52:52, nouveau worker en
 * ligne à 09:54:10 (78 s plus tard), et même quand les tests unitaires du commit échouaient.
 * apex-chat-auto-force-update.yml appelle désormais cet outil AVANT de forcer la mise à jour.
 *
 *   node messaging-app/tools/attendre-ci.mjs --workflow deploy-apex-chat.yml [--job "<nom du job>"] [--absent-ok]
 *   env : GH_TOKEN, REPO (owner/nom), SHA ; facultatif GITHUB_API.
 *
 * Sortie 0 : terminé avec succès (ou aucun run pour ce commit après ~1 min ET --absent-ok).
 * Sortie 1 : terminé autrement (échec, annulé…), aucun run sans --absent-ok, ou toujours en cours
 * après la borne (12 min par défaut). Chaque issue est ANNONCÉE (::notice / ::error).
 * Pas de cron : un appel par exécution, borné. Garde : tests/unit/lot-e2-attendre-ci.test.js.
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function attendre({ workflow, job = null, absentOk = false, repo, sha, token,
  api = 'https://api.github.com', fetchFn = fetch, dormir = (ms) => new Promise((r) => setTimeout(r, ms)),
  pas = 15000, essais = 48, essaisAbsent = 4, log = console.log }) {
  const h = { authorization: 'Bearer ' + token, accept: 'application/vnd.github+json' };
  const lire = async (url) => { const r = await fetchFn(url, { headers: h }); if (!r.ok) throw new Error('API GitHub HTTP ' + r.status); return r.json(); };
  const quoi = job ? `job « ${job} » de ${workflow}` : workflow;
  for (let i = 1; i <= essais; i++) {
    let etat = null; let lu = false;
    try {
      const runs = await lire(`${api}/repos/${repo}/actions/workflows/${workflow}/runs?head_sha=${sha}&per_page=1`);
      const run = runs.workflow_runs && runs.workflow_runs[0];
      if (run && job) {
        const jobs = await lire(`${api}/repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`);
        const j = (jobs.jobs || []).find((x) => x.name === job);
        etat = j ? { status: j.status, conclusion: j.conclusion } : { status: 'queued', conclusion: null };
      } else if (run) etat = { status: run.status, conclusion: run.conclusion };
      lu = true;
    } catch (e) { log(`::warning::lecture de l'état CI impossible (essai ${i}) : ${e.message}`); }
    if (!lu) { /* API illisible : on réessaie au tour suivant */ } else if (!etat) {
      if (i >= essaisAbsent) {
        if (absentOk) { log(`::notice::aucun ${quoi} pour ce commit — rien à attendre`); return 0; }
        log(`::error::aucun ${quoi} pour ce commit : impossible de prouver qu'il est vert`); return 1;
      }
    } else if (etat.status === 'completed') {
      if (etat.conclusion === 'success') { log(`::notice::${quoi} terminé avec succès (essai ${i})`); return 0; }
      log(`::error::${quoi} terminé en « ${etat.conclusion} » : on s'arrête là`); return 1;
    }
    await dormir(pas);
  }
  log(`::error::${quoi} toujours en cours après ${Math.round((essais * pas) / 60000)} min`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const a = process.argv.slice(2);
  const opt = (n) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : null; };
  const { GH_TOKEN, REPO, SHA, GITHUB_API } = process.env;
  if (!opt('--workflow') || !GH_TOKEN || !REPO || !SHA) {
    console.error('usage : GH_TOKEN=… REPO=… SHA=… node attendre-ci.mjs --workflow <fichier.yml> [--job <nom>] [--absent-ok]');
    process.exit(2);
  }
  attendre({ workflow: opt('--workflow'), job: opt('--job'), absentOk: a.includes('--absent-ok'), repo: REPO, sha: SHA, token: GH_TOKEN, api: GITHUB_API || 'https://api.github.com' })
    .then((c) => process.exit(c), (e) => { console.error('ÉCHEC : ' + e.message); process.exit(1); });
}
