import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/* Kevin 20.11.2026 « retire » : Cerebras rend HTTP 402 « Payment required » (cloud-installer 2977, PR 5866). Un fournisseur mort en bonne place
   coûtait un appel perdu à chaque message. Le test lit les listes de préférence RÉELLES (pas une copie). */
const lire = (f: string): string => readFileSync(f, 'utf8');
const ligne = (src: string, debut: string): string => {
  const l = src.split('\n').find((x) => x.includes(debut));
  if (!l) throw new Error('introuvable : ' + debut);
  return l;
};

describe('Apex AI : Cerebras retiré des listes de préférence', () => {
  const pol = lire('services/ai/ai-routing-policy.ts');
  it('aucun domaine de la politique (admin, raisonnement, code, vitesse, création) ne le place', () => {
    for (const d of ['  admin:', '  reasoning:', '  code:', '  speed:', '  creative:']) expect(ligne(pol, d)).not.toMatch(/cerebras/);
  });
  it('la liste des gratuits ne le contient plus', () => { expect(ligne(pol, 'const FREE_PROVIDERS')).not.toMatch(/'cerebras'/); });
  it('la chaîne par défaut du routeur ne le contient plus', () => { expect(ligne(lire('services/ai/ai-router.ts'), 'const DEFAULT_CHAIN')).not.toMatch(/cerebras/); });
  it('le crew ne le propose plus (liste proxiée et ordre des voix)', () => {
    const crew = lire('services/ai/crew-experts.ts');
    expect(ligne(crew, 'const PROXIED_CREW')).not.toMatch(/'cerebras'/);
    expect(ligne(crew, 'const order: CrewProvider[]')).not.toMatch(/cerebras/);
  });
});
