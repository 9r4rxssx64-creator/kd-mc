/**
 * v13.4.339 — capture du dernier échec IA exact (leçon #97) + affichage Diagnostic.
 * Contexte : « toujours openai » persistait car anthropic échoue RÉELLEMENT sur le
 * device (serveur prouvé 200 en CI) — sans le message exact, impossible de trancher.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearLastAiFail,
  formatLastAiFails,
  getLastAiFails,
  recordLastAiFail,
} from '../../services/ai/last-ai-fail.js';

describe('v13.4.339 — last-ai-fail (diag échec exact par provider)', () => {
  beforeEach(() => localStorage.clear());

  it('record + get : message tronqué, status conservé', () => {
    recordLastAiFail('anthropic', 'anthropic HTTP 400: tools.42.input_schema invalid', 400);
    const f = getLastAiFails()['anthropic'];
    expect(f?.msg).toContain('tools.42');
    expect(f?.status).toBe(400);
  });

  it('clear sur succès : entrée retirée (jamais périmée)', () => {
    recordLastAiFail('anthropic', 'boom', 500);
    clearLastAiFail('anthropic');
    expect(getLastAiFails()['anthropic']).toBeUndefined();
  });

  it('clear idempotent : pas d\'écriture si absent', () => {
    clearLastAiFail('anthropic'); /* ne throw pas, ne crée rien */
    expect(localStorage.getItem('apex_v13_last_ai_fail')).toBeNull();
  });

  it('format lisible pour le Diagnostic (provider + âge + HTTP + msg)', () => {
    recordLastAiFail('anthropic', 'Failed to fetch');
    const lines = formatLastAiFails();
    expect(lines[0]).toMatch(/^anthropic \(il y a \d+ min\) : Failed to fetch/);
  });

  it('message très long → tronqué à 400 chars', () => {
    recordLastAiFail('openai', 'x'.repeat(1000), 429);
    expect(getLastAiFails()['openai']?.msg.length).toBe(400);
  });
});
