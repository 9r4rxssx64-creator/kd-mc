/**
 * Tests mcp-memory-server deep v13.4.156 (Kevin "100/100 réel").
 *
 * Module : services/mcp-memory-server.ts (686 stmts, était 77%).
 * Focus : addEntity + addRelation + search + getRelated + getStats + export/import.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { mcpMemoryServer } from '../../services/ai/mcp-memory-server.js';

describe('mcp-memory-server deep (v13.4.156)', () => {
  beforeEach(async () => {
    await mcpMemoryServer.reset().catch(() => null);
  });

  afterEach(async () => {
    await mcpMemoryServer.reset().catch(() => null);
  });

  describe('init + getStats', () => {
    it('init retourne KGStats avec ready=true', async () => {
      const stats = await mcpMemoryServer.init();
      expect(stats.ready).toBe(true);
      expect(stats.entities_count).toBe(0);
      expect(stats.relations_count).toBe(0);
    });

    it('getStats retourne stats à jour', async () => {
      await mcpMemoryServer.init();
      await mcpMemoryServer.addEntity('Kevin', 'person', ['admin Apex']);
      const stats = await mcpMemoryServer.getStats();
      expect(stats.entities_count).toBe(1);
    });
  });

  describe('addEntity', () => {
    it('crée entité avec id', async () => {
      const r = await mcpMemoryServer.addEntity('Laurence', 'person', ['compagne Kevin']);
      expect(r.id).toBeTypeOf('string');
      expect(r.created).toBe(true);
    });

    it('idempotent : name+type déjà existants → merge observations', async () => {
      const r1 = await mcpMemoryServer.addEntity('A', 'person', ['obs1']);
      const r2 = await mcpMemoryServer.addEntity('A', 'person', ['obs2']);
      expect(r1.id).toBe(r2.id);
      expect(r2.created).toBe(false);
    });

    it('throw si name vide', async () => {
      await expect(mcpMemoryServer.addEntity('', 'person', [])).rejects.toThrow(/name/);
    });

    it('throw si type vide', async () => {
      await expect(mcpMemoryServer.addEntity('X', '', [])).rejects.toThrow(/type/);
    });
  });

  describe('addRelation', () => {
    it('crée relation entre 2 entités', async () => {
      const a = await mcpMemoryServer.addEntity('A', 'person', []);
      const b = await mcpMemoryServer.addEntity('B', 'project', []);
      const rel = await mcpMemoryServer.addRelation(a.id, b.id, 'works_on');
      expect(rel.id).toBeTypeOf('string');
    });

    it('throw si from_id vide', async () => {
      await expect(mcpMemoryServer.addRelation('', 'x', 'r')).rejects.toThrow();
    });
  });

  describe('addObservation', () => {
    it('ajoute observation à entité existante', async () => {
      const r = await mcpMemoryServer.addEntity('Project', 'project', ['initial']);
      const res = await mcpMemoryServer.addObservation(r.id, 'new fact');
      expect(res.ok).toBe(true);
      expect(res.total).toBeGreaterThanOrEqual(2);
    });

    it('throw si entité absente', async () => {
      await expect(mcpMemoryServer.addObservation('nonexistent', 'X')).rejects.toThrow();
    });
  });

  describe('search', () => {
    it('retourne [] si query vide', async () => {
      const r = await mcpMemoryServer.search('');
      expect(r).toEqual([]);
    });

    it('trouve entité par name', async () => {
      await mcpMemoryServer.addEntity('Kevin Desarzens', 'person', ['admin Apex Casino Monaco']);
      const r = await mcpMemoryServer.search('kevin');
      expect(r.length).toBeGreaterThan(0);
      expect(r[0]?.entity.name).toContain('Kevin');
    });

    it('filtre par type', async () => {
      await mcpMemoryServer.addEntity('X', 'person', ['kevin']);
      await mcpMemoryServer.addEntity('Y', 'project', ['kevin']);
      const r = await mcpMemoryServer.search('kevin', { type: 'person' });
      expect(r.every((h) => h.entity.type === 'person')).toBe(true);
    });

    it('respecte limit', async () => {
      for (let i = 0; i < 10; i++) {
        await mcpMemoryServer.addEntity(`Test${i}`, 'project', ['searchable']);
      }
      const r = await mcpMemoryServer.search('searchable', { limit: 3 });
      expect(r.length).toBeLessThanOrEqual(3);
    });
  });

  describe('getRelated', () => {
    it('throw si entity_id vide', async () => {
      await expect(mcpMemoryServer.getRelated('')).rejects.toThrow();
    });

    it('throw si entity inconnu', async () => {
      await expect(mcpMemoryServer.getRelated('not_exist')).rejects.toThrow(/not found/);
    });

    it('retourne related entities depth 1', async () => {
      const a = await mcpMemoryServer.addEntity('A', 'person', []);
      const b = await mcpMemoryServer.addEntity('B', 'project', []);
      await mcpMemoryServer.addRelation(a.id, b.id, 'works');
      const r = await mcpMemoryServer.getRelated(a.id, 1);
      expect(r.length).toBe(1);
      expect(r[0]?.entity.id).toBe(b.id);
    });
  });

  describe('getEntity / getRelation', () => {
    it('getEntity retourne null si absent', async () => {
      const r = await mcpMemoryServer.getEntity('unknown');
      expect(r).toBeNull();
    });

    it('getRelation retourne null si absent', async () => {
      const r = await mcpMemoryServer.getRelation('unknown');
      expect(r).toBeNull();
    });
  });

  describe('exportJSON / importJSON', () => {
    it('export retourne structure complète', async () => {
      await mcpMemoryServer.addEntity('X', 'person', ['Y']);
      const data = await mcpMemoryServer.exportJSON();
      expect(data.entities.length).toBe(1);
      expect(Array.isArray(data.relations)).toBe(true);
    });

    it('import recharge entities + relations', async () => {
      const data = {
        version: 1,
        ts: Date.now(),
        entities: [
          { id: 'e1', name: 'Test', type: 'person', observations: ['note'], ts: 1, updated_at: 1 },
        ],
        relations: [],
      };
      const r = await mcpMemoryServer.importJSON(data);
      expect(r.entities).toBe(1);
      const e = await mcpMemoryServer.getEntity('e1');
      expect(e?.name).toBe('Test');
    });
  });

  describe('reset', () => {
    it('vide tout', async () => {
      await mcpMemoryServer.addEntity('X', 'person', []);
      await mcpMemoryServer.reset();
      const stats = await mcpMemoryServer.getStats();
      expect(stats.entities_count).toBe(0);
    });
  });
});
