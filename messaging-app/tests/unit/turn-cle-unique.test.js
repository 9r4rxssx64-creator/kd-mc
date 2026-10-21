// @vitest-environment node
/**
 * Le nombre de clés TURN montait à chaque déploiement d'Apex Chat (63 → 71, relevé du Lenovo le 22.10) : une liste de secrets illisible valait « pas de clé » et en recréait une.
 * Garde : liste illisible ou secret présent = AUCUNE création.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const wf = readFileSync(new URL('../../../.github/workflows/deploy-apex-chat.yml', import.meta.url), 'utf8');
const bloc = wf.slice(wf.indexOf('Provision Cloudflare TURN'), wf.indexOf('Provision Cloudflare TURN') + 4200);
describe('déploiement : une seule clé TURN', () => {
  it('« forcer_turn_unique » est une entrée MANUELLE (défaut non) et le seul moyen de recréer quand le secret existe', () => {
    expect(wf).toMatch(/workflow_dispatch:[\s\S]*forcer_turn_unique:[\s\S]*default: 'non'/);
    expect(bloc).toMatch(/FORCER_TURN: \$\{\{ github\.event\.inputs\.forcer_turn_unique \}\}/);
    expect(bloc).toMatch(/elif \[ "\$FORCER_TURN" != "oui" \] && echo "\$EXISTING" \| grep -q 'CF_TURN_KEY_ID'/);
  });
  it('le jeton est lu là où Cloudflare le met (result.secret — mesuré sur la réponse réelle) : sinon il n\'est jamais enregistré et chaque déploiement recrée une clé', () => {
    expect(bloc).toMatch(/r\.get\('secret'\) or r\.get\('key'\) or r\.get\('token'\)/);
    expect(bloc.indexOf("r.get('secret')")).toBeLessThan(bloc.indexOf('wrangler secret put CF_TURN_TOKEN'));
  });
  it('le jeton de la clé n\'est jamais écrit dans le journal : masqué, réponse brute jamais affichée, seul l\'ID public l\'est', () => {
    expect(bloc).toMatch(/::add-mask::\$KTOK/);
    expect(bloc).not.toMatch(/json\.tool/);
    expect(bloc).not.toMatch(/Réponse : \$RESP/);
    expect(bloc).toMatch(/TURN : ID À GARDER = \$KID/);
  });
  it('liste des secrets illisible → on ne crée rien', () => { expect(bloc).toMatch(/if ! EXISTING=\$\(wrangler secret list --format json/); expect(bloc).not.toMatch(/\|\| echo '\[\]'/); });
  it('secret déjà présent → on garde ; la création n\'a lieu que dans le dernier cas', () => {
    const iPresent = bloc.indexOf("grep -q 'CF_TURN_KEY_ID'"), iCree = bloc.indexOf('calls/turn_keys');
    expect(iPresent).toBeGreaterThan(0); expect(iCree).toBeGreaterThan(iPresent);
  });
});
