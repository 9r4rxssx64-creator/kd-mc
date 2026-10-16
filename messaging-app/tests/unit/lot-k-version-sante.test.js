// @vitest-environment node
/**
 * Le serveur annonce sa version dans /api/health, et cette version doit être celle de package.json
 * (sinon le contrôle de déploiement échouerait, ou pire, comparerait des nombres qui ne veulent rien dire).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API_VERSION, checkHealth, _resetHealthCache } from '../../workers/api-worker.js';
import { ENV } from './api-worker-helpers.js';
import { d1Reel } from './_support/d1-sqlite.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
describe('version annoncée par la santé', () => {
  it('API_VERSION = version de package.json', () => {
    expect(API_VERSION).toBe(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version);
  });
  it('la réponse de santé porte la version', async () => {
    _resetHealthCache();
    const b = await checkHealth(ENV({ APEX_CHAT_DB: d1Reel() }));
    expect(b.version).toBe(API_VERSION);
  });
  it('le déploiement compare cette version et échoue si elle diffère', () => {
    const y = readFileSync(join(ROOT, '..', '.github/workflows/deploy-apex-chat.yml'), 'utf8');
    expect(y).toContain("jq -r '.version // empty'");
    expect(y).toContain('le déploiement n\'a pas pris effet');
    expect(y).not.toContain('"$BASE/api/system/config"');
  });
});
