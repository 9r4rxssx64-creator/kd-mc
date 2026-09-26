/**
 * apex-tools.canExecute — couverture branches restantes (campagne 100% réel, 2026-06-02).
 * Cible : tool inconnu, tier insuffisant, impactLevel C (validation), admin bypass.
 */
import { describe, it, expect } from 'vitest';

import { apexTools } from '../../services/core-svc/apex-tools.js';

describe('apex-tools — canExecute', () => {
  it('tool inconnu → allowed=false reason "Tool inconnu"', () => {
    const r = apexTools.canExecute('tool_inexistant_xyz', 'admin');
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('Tool inconnu');
  });

  it('tier insuffisant (read_logs admin-only, user client_free) → denied', () => {
    const r = apexTools.canExecute('read_logs', 'client_free');
    expect(r.allowed).toBe(false);
    expect(r.requires_validation).toBe(false);
    expect(r.reason).toBe('Tier insuffisant');
  });

  it('impactLevel C + non-admin (send_email, family) → allowed + requires_validation', () => {
    const r = apexTools.canExecute('send_email', 'family');
    expect(r.allowed).toBe(true);
    expect(r.requires_validation).toBe(true);
  });

  it('impactLevel C + admin → allowed sans validation', () => {
    const r = apexTools.canExecute('send_email', 'admin');
    expect(r.allowed).toBe(true);
    expect(r.requires_validation).toBe(false);
  });

  it('read_logs en admin → allowed sans validation (impact A)', () => {
    const r = apexTools.canExecute('read_logs', 'admin');
    expect(r.allowed).toBe(true);
    expect(r.requires_validation).toBe(false);
  });
});
