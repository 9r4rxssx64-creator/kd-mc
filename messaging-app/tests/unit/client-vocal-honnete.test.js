/**
 * iPhone : un vocal part avec SA conversation (le serveur l'exige), avec un délai maximal de 60 s,
 * et un vocal gardé sur l'appareil est marqué « non envoyé » (⚠️), jamais présenté comme livré.
 * (audit 16.10.2026)
 */
import { describe, it, expect } from 'vitest';
import { readIndex, extractDef } from './client-extract.js';

describe('envoi du vocal', () => {
  const src = () => extractDef(readIndex(), 'K._sendVoiceMessage = async function(){', '\n};');
  it('rattache le vocal à sa conversation', () => {
    expect(src()).toContain("'/api/media?conv_id=' + encodeURIComponent(conv.id)");
  });
  it('abandonne proprement au bout de 60 s', () => {
    const t = src();
    expect(t).toContain('new AbortController()');
    expect(t).toContain('signal: _ctl.signal');
    expect(t).toContain('}, 60000);');
  });
  it('un vocal gardé sur l\'appareil est marqué non envoyé', () => {
    expect(src()).toMatch(/voice_too_large: !audioData,\s+failed: true,/);
  });
});
