import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { phraseCleRangee, phraseCleRefusee } from '../../features/chat/chat-cle-rangee';

/* pc-config 2961 : Kevin colle un jeton GitHub, la zone se vide, il ne voit que des pastilles → « Apex n'a rien répondu ». */
describe('réponse dans le chat quand une clé est rangée', () => {
  it('une clé : dit le service, « chiffrée », « jamais envoyée à une IA »', () => {
    const t = phraseCleRangee(['GitHub'], false);
    expect(t).toMatch(/GitHub/); expect(t).toMatch(/chiffrée/); expect(t).toMatch(/jamais envoyée à une IA/); expect(t).not.toMatch(/Gist/);
  });
  it('jeton GitHub : annonce la sauvegarde Gist et le résultat à suivre', () => {
    expect(phraseCleRangee(['GitHub'], true)).toMatch(/Gist.*résultat/s);
  });
  it('plusieurs clés : le nombre et les noms, sans doublon', () => {
    const t = phraseCleRangee(['Anthropic', 'Anthropic', 'GitHub'], false);
    expect(t).toMatch(/3 clés/); expect((t.match(/Anthropic/g) || []).length).toBe(1);
  });
  it('ne laisse passer ni balise ni signe de mise en forme venus d\'un nom', () => {
    expect(phraseCleRangee(['<b>X*</b>`'], false)).not.toMatch(/[<>`*]/);
  });
  it('clé refusée : le dit, sans la ranger', () => { expect(phraseCleRefusee(['Coffre'])).toMatch(/jamais rangée/); });
  it('le câblage du chat pousse bien la phrase (3 endroits : rangée, résultat Gist, refusée)', () => {
    const src = readFileSync('features/chat/chat-input-wiring.ts', 'utf8');
    expect(src).toMatch(/phraseCleRangee\(/); expect(src).toMatch(/phraseCleRefusee\(/);
    expect((src.match(/pushAssistantMessage/g) || []).length).toBeGreaterThanOrEqual(3);
  });
});
