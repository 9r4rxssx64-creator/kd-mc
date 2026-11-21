import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/* Robot « Lighthouse CI Apex v13 » rouge depuis le 19.11 : audit target-size, cible #apex-version-badge mesurée 70×18 px (minimum 24×24 CSS px).
   Le test lit le CSS RÉEL du badge. */
const src = readFileSync('ui/version-badge.ts', 'utf8');
const bloc = (src.match(/#\$\{BADGE_ID\}\s*\{([\s\S]*?)\n  \}/) ?? [])[1] ?? '';
const px = (prop: string): number => Number((new RegExp(`${prop}:\\s*(\\d+)px`).exec(bloc) ?? [])[1] ?? 0);

describe('badge de version : cible tactile', () => {
  it('on lit bien le bloc CSS du badge', () => { expect(bloc).toMatch(/position:\s*fixed/); });
  it('au moins 24 px de haut et de large (audit target-size)', () => {
    expect(px('min-height')).toBeGreaterThanOrEqual(24); expect(px('min-width')).toBeGreaterThanOrEqual(24);
  });
  it('il ne capte toujours aucun appui et ne recouvre ni onglet ni bouton (règle du 15.10)', () => {
    expect(bloc).toMatch(/pointer-events:\s*none/); expect(bloc).toMatch(/top:\s*calc\(env\(safe-area-inset-top/);
  });
  it('sabotage : l\'ancienne règle « min-height: 0 » serait refusée', () => { expect(bloc).not.toMatch(/min-height:\s*0\b/); });
});
