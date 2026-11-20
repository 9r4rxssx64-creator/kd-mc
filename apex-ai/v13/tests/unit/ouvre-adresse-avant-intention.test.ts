import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { adresseAOuvrir } from '../../features/chat/chat-outils-locaux';
import { detectToolIntent } from '../../services/ai/tool-intent';

/* pc-config 2932 : en vrai, « ouvre-moi https://example.org » partait en « /web » (robot, HTTP 401) avant d'atteindre
   le traitement local, parce que la détection d'intention passe en premier dans chat-input-wiring. */
describe('« ouvre-moi <adresse> » passe avant la détection d\'intention', () => {
  const phrases = ['ouvre-moi https://example.org', 'ouvre-moi http://example.org', 'va sur exemple.fr'];
  it.each(phrases)('« %s » : la détection d\'intention la prendrait (conflit réel) — le chat doit la garder', (p) => {
    expect(adresseAOuvrir(p)).not.toBeNull();
  });
  it('le conflit existe bien (sans la garde, https://… part en /web)', () => {
    expect(detectToolIntent('ouvre-moi https://example.org')).toBe('/web https://example.org');
  });
  it('la garde est câblée AVANT detectToolIntent dans chat-input-wiring', () => {
    const src = readFileSync('features/chat/chat-input-wiring.ts', 'utf8');
    expect(src).toMatch(/adresseAOuvrir\(value\)\s*\?\s*null\s*:\s*detectToolIntent\(value\)/);
  });
  it('« lis https://example.org » (lecture explicite) reste pris par /web', () => {
    expect(adresseAOuvrir('lis https://example.org')).toBeNull();
    expect(detectToolIntent('lis https://example.org')).toBe('/web https://example.org');
  });
});
