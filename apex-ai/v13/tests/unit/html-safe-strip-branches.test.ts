/**
 * html-safe stripDangerousHtml — couverture branche restante (campagne 100%, 2026-06-02).
 * Cible : !html (entrée vide → '').
 */
import { describe, it, expect } from 'vitest';

import { stripDangerousHtml } from '../../core/html-safe.js';

describe('html-safe — stripDangerousHtml', () => {
  it('entrée vide → "" (branche !html)', () => {
    expect(stripDangerousHtml('')).toBe('');
  });

  it('strip <script> + on* handlers + javascript: urls', () => {
    const out = stripDangerousHtml('<div onclick="x()">ok<script>bad()</script></div>');
    expect(out).not.toContain('<script>');
    expect(out.toLowerCase()).not.toContain('onclick');
  });
});
