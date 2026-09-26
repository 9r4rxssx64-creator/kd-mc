/**
 * v13.4.320 — Kevin « toujours détailler la cause exacte ». Le message « Toutes
 * les IA KO » doit dire la VRAIE cause + le geste, pas le générique « recharge ».
 * Câblé dans test:ci.
 */
import { describe, it, expect } from 'vitest';

import { allDeadMessage } from '../../services/ai/ai-key-rotation.js';

describe('v13.4.320 — message IA KO précis', () => {
  it('proxy activé + code admin PAS en mémoire → demande la reconnexion (cas 2026-06-08)', () => {
    const m = allDeadMessage({ proxyOn: true, pinStored: false, hasLocalKey: false });
    expect(m).toContain('reconnecte-toi avec ton code');
  });

  it('aucune clé locale + proxy off → coller une clé dans le Coffre', () => {
    const m = allDeadMessage({ proxyOn: false, pinStored: false, hasLocalKey: false });
    expect(m).toContain('Colle une clé dans le Coffre');
  });

  it('proxy activé + code en mémoire → clés (serveur/Coffre) expirées', () => {
    expect(allDeadMessage({ proxyOn: true, pinStored: true, hasLocalKey: false })).toContain('expirées');
  });

  it('clé locale présente mais tout KO → générique « expirées »', () => {
    expect(allDeadMessage({ proxyOn: false, pinStored: false, hasLocalKey: true })).toContain('expirées');
  });
});
