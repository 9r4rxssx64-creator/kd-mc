// @vitest-environment node
/**
 * Le nombre de clés TURN montait à chaque déploiement d'Apex Chat (63 → 71, relevé du Lenovo le 22.10) : une liste de secrets illisible valait « pas de clé » et en recréait une.
 * Garde : liste illisible ou secret présent = AUCUNE création.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const wf = readFileSync(new URL('../../../.github/workflows/deploy-apex-chat.yml', import.meta.url), 'utf8');
const bloc = wf.slice(wf.indexOf('Provision Cloudflare TURN'), wf.indexOf('Provision Cloudflare TURN') + 2500);
describe('déploiement : une seule clé TURN', () => {
  it('liste des secrets illisible → on ne crée rien', () => { expect(bloc).toMatch(/if ! EXISTING=\$\(wrangler secret list --format json/); expect(bloc).not.toMatch(/\|\| echo '\[\]'/); });
  it('secret déjà présent → on garde ; la création n\'a lieu que dans le dernier cas', () => {
    const iPresent = bloc.indexOf("grep -q 'CF_TURN_KEY_ID'"), iCree = bloc.indexOf('calls/turn_keys');
    expect(iPresent).toBeGreaterThan(0); expect(iCree).toBeGreaterThan(iPresent);
  });
});
