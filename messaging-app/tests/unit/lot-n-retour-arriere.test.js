/**
 * Le déploiement défait lui-même un code qui ne répond plus (audit 16.10.2026) — mais JAMAIS pour une simple
 * panne d'infrastructure (503 avec détail), qu'un retour arrière n'arrangerait pas. Le workflow est exécuté pour
 * de vrai (bash + jq) sur les deux cas, en réutilisant le VRAI texte de l'étape.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const Y = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '.github/workflows/deploy-apex-chat.yml'), 'utf8');
const bloc = Y.slice(Y.indexOf('          if [ "$ok" != "1" ]; then'), Y.indexOf('          # Lot E2 : /api/health vérifie'));

function joue(code, corps) {
  const d = mkdtempSync(join(tmpdir(), 'rb-'));
  writeFileSync(join(d, 'health.json'), corps);
  writeFileSync(join(d, 'out'), '');
  const script = `ok=0; code=${code}\n${bloc.replace(/\/tmp\/health\.json/g, join(d, 'health.json'))}\necho PASSE`;
  let sortie = '';
  try { sortie = execFileSync('bash', ['-c', script], { env: { ...process.env, GITHUB_OUTPUT: join(d, 'out') }, encoding: 'utf8', stdio: 'pipe' }); } catch (e) { sortie = String(e.stdout || ''); }
  return { sortie, flag: readFileSync(join(d, 'out'), 'utf8') };
}

describe('retour arrière automatique du déploiement', () => {
  it('le serveur ne répond pas du tout (000) → retour arrière demandé', () => { expect(joue(0, '').flag).toContain('rollback=1'); });
  it('le serveur plante (500, page d\'erreur) → retour arrière demandé', () => { expect(joue(500, 'error code: 1101').flag).toContain('rollback=1'); });
  it('503 AVEC le détail des vérifications (base KO) → panne d\'infrastructure : PAS de retour arrière', () => {
    expect(joue(503, '{"ok":false,"checks":{"d1":"ko","do":"ok"}}').flag).not.toContain('rollback=1');
  });
  it('l\'étape de retour arrière ne s\'exécute que sur échec + drapeau, sans bloquer le reste', () => {
    expect(Y).toContain("if: ${{ failure() && steps.live.outputs.rollback == '1' }}");
    const i = Y.indexOf('Retour arrière automatique');
    expect(Y.slice(i, i + 400)).toContain('continue-on-error: true');
    expect(Y).toContain('wrangler@4 rollback');
  });
});
