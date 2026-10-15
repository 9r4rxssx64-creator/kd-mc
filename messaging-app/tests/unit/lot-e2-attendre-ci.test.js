// @vitest-environment node
/**
 * Lot E2 (audit A5, F4) — la mise à jour forcée attend que le commit soit VERT et DÉPLOYÉ.
 * tools/attendre-ci.mjs contre une fausse API GitHub (états successifs), plus le texte du workflow.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { attendre } from '../../tools/attendre-ci.mjs';

/** Fausse API : `etats` = suite des réponses (une par tour) pour les runs, et jobs facultatifs. */
function api(etats, jobs = null) {
  let i = 0; const urls = [];
  const fetchFn = async (url) => {
    urls.push(url);
    if (url.includes('/jobs')) return new Response(JSON.stringify({ jobs: jobs[Math.min(i - 1, jobs.length - 1)] }));
    const e = etats[Math.min(i++, etats.length - 1)];
    if (e === 'erreur') return new Response('x', { status: 502 });
    return new Response(JSON.stringify({ workflow_runs: e ? [{ id: 7, ...e }] : [] }));
  };
  return { fetchFn, urls };
}
const base = (x) => ({ workflow: 'deploy-apex-chat.yml', repo: 'o/r', sha: 'abc', token: 't', dormir: async () => {}, log: () => {}, ...x });

describe('attendre-ci', () => {
  it('en cours puis succès → 0, en interrogeant le bon commit', async () => {
    const A = api([{ status: 'queued' }, { status: 'in_progress' }, { status: 'completed', conclusion: 'success' }]);
    expect(await attendre(base({ fetchFn: A.fetchFn }))).toBe(0);
    expect(A.urls[0]).toBe('https://api.github.com/repos/o/r/actions/workflows/deploy-apex-chat.yml/runs?head_sha=abc&per_page=1');
    expect(A.urls.length).toBe(3);
  });
  it('déploiement en échec ou annulé → 1 (pas de mise à jour forcée)', async () => {
    for (const c of ['failure', 'cancelled', 'timed_out']) {
      expect(await attendre(base({ fetchFn: api([{ status: 'completed', conclusion: c }]).fetchFn }))).toBe(1);
    }
  });
  it('aucun run : 0 avec --absent-ok (commit sans changement serveur), 1 sinon', async () => {
    expect(await attendre(base({ fetchFn: api([null]).fetchFn, absentOk: true }))).toBe(0);
    expect(await attendre(base({ fetchFn: api([null]).fetchFn }))).toBe(1);
  });
  it('API illisible un moment : on réessaie, une erreur n\'est pas prise pour « absent »', async () => {
    const A = api(['erreur', 'erreur', 'erreur', 'erreur', { status: 'completed', conclusion: 'success' }]);
    expect(await attendre(base({ fetchFn: A.fetchFn }))).toBe(0);
  });
  it('toujours en cours après la borne → 1', async () => {
    expect(await attendre(base({ fetchFn: api([{ status: 'in_progress' }]).fetchFn, essais: 5 }))).toBe(1);
  });
  it('--job : c\'est la conclusion du JOB qui compte (les e2e du même run n\'y entrent pas)', async () => {
    const A = api([{ status: 'in_progress' }, { status: 'in_progress' }], [[{ name: 'tests', status: 'in_progress' }], [{ name: 'tests', status: 'completed', conclusion: 'success' }, { name: 'e2e', status: 'completed', conclusion: 'failure' }]]);
    expect(await attendre(base({ workflow: 'messaging-app-tests.yml', job: 'tests', fetchFn: A.fetchFn }))).toBe(0);
    const B = api([{ status: 'in_progress' }], [[{ name: 'tests', status: 'completed', conclusion: 'failure' }]]);
    expect(await attendre(base({ workflow: 'messaging-app-tests.yml', job: 'tests', fetchFn: B.fetchFn }))).toBe(1);
  });

  it('le workflow de mise à jour forcée attend tests ET déploiement AVANT le POST', () => {
    const wf = readFileSync(new URL('../../../.github/workflows/apex-chat-auto-force-update.yml', import.meta.url), 'utf8');
    const iTests = wf.indexOf('attendre-ci.mjs --workflow messaging-app-tests.yml --job tests');
    const iDeploy = wf.indexOf('attendre-ci.mjs --workflow deploy-apex-chat.yml --absent-ok');
    const iPost = wf.indexOf('- name: POST /api/admin/force-update-via-token');
    expect(iTests).toBeGreaterThan(0);
    expect(iDeploy).toBeGreaterThan(0);
    expect(iPost).toBeGreaterThan(Math.max(iTests, iDeploy));
    expect(wf).toMatch(/^\s+actions: read/m);
    expect(wf).toMatch(/uses: actions\/checkout@/);
    expect(wf.slice(0, iPost)).not.toMatch(/continue-on-error:\s*true/);
  });
});
