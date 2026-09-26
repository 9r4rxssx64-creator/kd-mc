/**
 * Tests features/apex-toolbox (port v12 vApexToolbox).
 */
import { describe, expect, it } from 'vitest';

import { computeStats, escapeHtml, filterTools } from '../../features/apex-toolbox/index.js';
import type { ApexTool } from '../../services/core-svc/apex-tools.js';

const FAKE_TOOLS: ReadonlyArray<ApexTool> = [
  {
    name: 'read_file',
    description: 'Lit un fichier',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
    minTier: 'admin',
    impactLevel: 'A',
  },
  {
    name: 'web_search',
    description: 'Cherche sur le web',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
    minTier: 'client_free',
    impactLevel: 'A',
  },
  {
    name: 'edit_file',
    description: 'Modifie un fichier (validation Kevin requise)',
    inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } } },
    minTier: 'admin',
    impactLevel: 'C',
  },
  {
    name: 'send_notification',
    description: 'Envoie une notif (notify Kevin)',
    inputSchema: { type: 'object', properties: { msg: { type: 'string' } } },
    minTier: 'family',
    impactLevel: 'B',
  },
];

describe('features/apex-toolbox — escapeHtml', () => {
  it('échappe < > & " \'', () => {
    expect(escapeHtml('<x>')).toBe('&lt;x&gt;');
    expect(escapeHtml('"a"')).toBe('&quot;a&quot;');
    expect(escapeHtml("a'b")).toBe('a&#39;b');
  });
});

describe('features/apex-toolbox — filterTools', () => {
  it('retourne tous tools si filtre vide', () => {
    const r = filterTools(FAKE_TOOLS, {});
    expect(r).toHaveLength(FAKE_TOOLS.length);
  });

  it('filtre par query (name)', () => {
    const r = filterTools(FAKE_TOOLS, { query: 'read' });
    expect(r).toHaveLength(1);
    expect(r[0]?.name).toBe('read_file');
  });

  it('filtre par query (description)', () => {
    const r = filterTools(FAKE_TOOLS, { query: 'cherche' });
    expect(r).toHaveLength(1);
    expect(r[0]?.name).toBe('web_search');
  });

  it('filtre par tier admin', () => {
    const r = filterTools(FAKE_TOOLS, { tier: 'admin' });
    expect(r.every((t) => t.minTier === 'admin')).toBe(true);
    expect(r).toHaveLength(2);
  });

  it('filtre par tier "all" garde tous', () => {
    const r = filterTools(FAKE_TOOLS, { tier: 'all' });
    expect(r).toHaveLength(FAKE_TOOLS.length);
  });

  it('filtre par impactLevel A', () => {
    const r = filterTools(FAKE_TOOLS, { impactLevel: 'A' });
    expect(r.every((t) => t.impactLevel === 'A')).toBe(true);
  });

  it('filtre par impactLevel C', () => {
    const r = filterTools(FAKE_TOOLS, { impactLevel: 'C' });
    expect(r).toHaveLength(1);
    expect(r[0]?.name).toBe('edit_file');
  });

  it('combine filtres tier + impact', () => {
    const r = filterTools(FAKE_TOOLS, { tier: 'admin', impactLevel: 'A' });
    expect(r).toHaveLength(1);
    expect(r[0]?.name).toBe('read_file');
  });

  it('case insensitive query', () => {
    const lower = filterTools(FAKE_TOOLS, { query: 'web' });
    const upper = filterTools(FAKE_TOOLS, { query: 'WEB' });
    expect(lower.length).toBe(upper.length);
  });

  it('retourne [] si query no match', () => {
    expect(filterTools(FAKE_TOOLS, { query: 'zzznomatch' })).toEqual([]);
  });
});

describe('features/apex-toolbox — computeStats', () => {
  it('compte total', () => {
    const s = computeStats(FAKE_TOOLS);
    expect(s.total).toBe(FAKE_TOOLS.length);
  });

  it('compte by_tier', () => {
    const s = computeStats(FAKE_TOOLS);
    expect(s.by_tier['admin']).toBe(2);
    expect(s.by_tier['client_free']).toBe(1);
    expect(s.by_tier['family']).toBe(1);
  });

  it('compte by_impact', () => {
    const s = computeStats(FAKE_TOOLS);
    expect(s.by_impact['A']).toBe(2);
    expect(s.by_impact['B']).toBe(1);
    expect(s.by_impact['C']).toBe(1);
  });

  it('gère array vide', () => {
    const s = computeStats([]);
    expect(s.total).toBe(0);
    expect(s.by_tier).toEqual({});
    expect(s.by_impact).toEqual({});
  });

  it('compte agrège correctement multi-tiers', () => {
    const more: ReadonlyArray<ApexTool> = [
      ...FAKE_TOOLS,
      ...FAKE_TOOLS, /* doublé */
    ];
    const s = computeStats(more);
    expect(s.total).toBe(8);
    expect(s.by_tier['admin']).toBe(4);
  });
});

describe('features/apex-toolbox — apex-tools registry réel', () => {
  it('apex-tools service charge sans erreur', async () => {
    const { apexTools } = await import('../../services/core-svc/apex-tools.js');
    const list = apexTools.list();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
  });

  it('chaque tool a name + description + inputSchema + minTier + impactLevel', async () => {
    const { apexTools } = await import('../../services/core-svc/apex-tools.js');
    const list = apexTools.list();
    for (const t of list) {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.inputSchema).toBeTruthy();
      expect(['admin', 'laurence', 'family', 'client_pro', 'client_free']).toContain(t.minTier);
      expect(['A', 'B', 'C']).toContain(t.impactLevel);
    }
  });
});
