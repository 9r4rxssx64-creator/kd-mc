/**
 * APEX v13.3.24 — Tests cosmetic backup-watch (Kevin screenshot 19:11 "493 936h")
 *
 * Vérifie :
 * 1. ts=0 absent → "Aucun backup depuis init" (pas "493936h")
 * 2. ts < MIN_VALID_BACKUP_TS (2020-01-01) → considéré stale, message correct
 * 3. ts récent → format humain "Il y a Xh" (pas "Xh ago")
 * 4. ts > 26h → message warn avec format humain
 * 5. autoFix seed ax_last_backup_ts pour invalider lastResult stale
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sentinels, registerCoreSentinels } from '../../services/sentinels/sentinels.js';

describe('sentinels backup-watch cosmetic v13.3.24', () => {
  beforeEach(() => {
    localStorage.clear();
    /* Reset registered sentinels (re-register fresh per test) */
    sentinels.list().forEach((s) => sentinels.enable(s.id, false));
    registerCoreSentinels();
  });

  it('ts=0 (absent) → "Aucun backup depuis init"', async () => {
    /* Pas de ax_last_backup_ts → fallback autoBackup → vide → 0 → message info */
    const result = await sentinels.runOne('backup-watch');
    expect(result?.ok).toBe(true);
    expect(result?.msg).toMatch(/Aucun backup depuis init/i);
    expect(result?.msg).not.toMatch(/\d{4,}h/); /* pas de "493936h" */
  });

  it('ts négatif → considéré stale → "Aucun backup depuis init"', async () => {
    localStorage.setItem('ax_last_backup_ts', '-1');
    const result = await sentinels.runOne('backup-watch');
    expect(result?.ok).toBe(true);
    expect(result?.msg).toMatch(/Aucun backup depuis init/i);
  });

  it('ts < 2020-01-01 (MIN_VALID) → stale → "Aucun backup depuis init"', async () => {
    localStorage.setItem('ax_last_backup_ts', '0'); /* < MIN_VALID_BACKUP_TS */
    const result = await sentinels.runOne('backup-watch');
    expect(result?.ok).toBe(true);
    expect(result?.msg).toMatch(/Aucun backup depuis init/i);
    expect(result?.msg).not.toContain('493936');
  });

  it('ts récent (1h) → format humain "Il y a 1h"', async () => {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    localStorage.setItem('ax_last_backup_ts', String(oneHourAgo));
    const result = await sentinels.runOne('backup-watch');
    expect(result?.ok).toBe(true);
    expect(result?.msg).toMatch(/Il y a \d+(min|h)/);
  });

  it('ts récent (5h) → format humain "Il y a 5h"', async () => {
    const fiveHoursAgo = Date.now() - (5 * 60 * 60 * 1000);
    localStorage.setItem('ax_last_backup_ts', String(fiveHoursAgo));
    const result = await sentinels.runOne('backup-watch');
    expect(result?.ok).toBe(true);
    expect(result?.msg).toMatch(/Il y a [4-5]h/);
  });

  it('ts > 26h → warn avec format humain (pas "493936h")', async () => {
    const stale = Date.now() - (30 * 60 * 60 * 1000); /* 30h */
    localStorage.setItem('ax_last_backup_ts', String(stale));
    /* Désactive temporairement autoFix pour valider le check seul */
    const sent = sentinels.list().find((s) => s.id === 'backup-watch');
    const origAutoFix = sent?.autoFix;
    if (sent) sent.autoFix = undefined;
    try {
      const result = await sentinels.runOne('backup-watch');
      expect(result?.ok).toBe(false);
      expect(result?.msg).toMatch(/Il y a \d+h/);
      expect(result?.msg).toMatch(/relance/i);
      expect(result?.msg).not.toMatch(/\d{5,}h/); /* pas plus de 4 chiffres */
    } finally {
      if (sent && origAutoFix) sent.autoFix = origAutoFix;
    }
  });

  it('ts > 30 jours → "Plus de 30 jours" (pas compteur infini)', async () => {
    const veryOld = Date.now() - (45 * 24 * 60 * 60 * 1000); /* 45j */
    localStorage.setItem('ax_last_backup_ts', String(veryOld));
    const sent = sentinels.list().find((s) => s.id === 'backup-watch');
    const origAutoFix = sent?.autoFix;
    if (sent) sent.autoFix = undefined;
    try {
      const result = await sentinels.runOne('backup-watch');
      expect(result?.ok).toBe(false);
      expect(result?.msg).toMatch(/Plus de 30 jours|Il y a 45j/i);
    } finally {
      if (sent && origAutoFix) sent.autoFix = origAutoFix;
    }
  });

  it('format humain : <168h → "Il y a Xh"', async () => {
    /* Test format function directement via état du sentinel
     * v13.3.94+ : seuil stale 7h → 8h déclenche autoFix qui remet ts à now,
     * donc on désactive autoFix pour valider le check pur. */
    const eightHoursAgo = Date.now() - (8 * 60 * 60 * 1000);
    localStorage.setItem('ax_last_backup_ts', String(eightHoursAgo));
    const sent = sentinels.list().find((s) => s.id === 'backup-watch');
    const origAutoFix = sent?.autoFix;
    if (sent) sent.autoFix = undefined;
    try {
      const result = await sentinels.runOne('backup-watch');
      expect(result?.msg).toMatch(/Il y a [7-8]h/);
    } finally {
      if (sent && origAutoFix) sent.autoFix = origAutoFix;
    }
  });

  it('format humain : 168h-30j → "Il y a Xj"', async () => {
    const tenDaysAgo = Date.now() - (10 * 24 * 60 * 60 * 1000);
    localStorage.setItem('ax_last_backup_ts', String(tenDaysAgo));
    const sent = sentinels.list().find((s) => s.id === 'backup-watch');
    const origAutoFix = sent?.autoFix;
    if (sent) sent.autoFix = undefined;
    try {
      const result = await sentinels.runOne('backup-watch');
      expect(result?.msg).toMatch(/Il y a 10j/);
    } finally {
      if (sent && origAutoFix) sent.autoFix = origAutoFix;
    }
  });

  it('jamais "493936h" affiché peu importe le timestamp', async () => {
    const cases = ['0', '-1', '1', '1577836799999', '1577836800000', '1577836800001'];
    for (const ts of cases) {
      localStorage.setItem('ax_last_backup_ts', ts);
      const result = await sentinels.runOne('backup-watch');
      expect(result?.msg).not.toContain('493936');
      expect(result?.msg ?? '').not.toMatch(/\d{6,}h/);
    }
  });
});
