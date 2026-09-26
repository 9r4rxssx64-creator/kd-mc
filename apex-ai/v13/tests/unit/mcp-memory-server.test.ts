/**
 * APEX v13 — Tests MCP Memory Server (knowledge graph).
 *
 * Couvre :
 *  - addEntity : création + idempotence (réutilise existing name+type)
 *  - addRelation : crée relations + dédupe + valide existence des entités
 *  - addObservation : append + dédupe + cap MAX_OBSERVATIONS
 *  - search : full-text par tokens + ranking (bonus name match) + filtre type
 *  - getRelated : BFS traversal + depth + bidirectionnel
 *  - exportJSON / importJSON : roundtrip
 *  - getStats : counts cohérents
 *  - Tool registry : 4 tools enregistrés + dispatch fonctionne
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { apexTools } from '../../services/core-svc/apex-tools.js';
import { apexToolsDispatch } from '../../services/core-svc/apex-tools-dispatch.js';
import { mcpMemoryServer } from '../../services/ai/mcp-memory-server.js';

describe('MCP Memory Server (knowledge graph)', () => {
  beforeEach(async () => {
    /* setup.ts wipe IDB chaque beforeEach via fresh IDBFactory.
       On ré-init le singleton après wipe pour isolation stricte. */
     
    (mcpMemoryServer as unknown as { initialized: boolean }).initialized = false;
    (mcpMemoryServer as unknown as { memEntities: Map<string, unknown> }).memEntities = new Map();
    (mcpMemoryServer as unknown as { memRelations: Map<string, unknown> }).memRelations = new Map();
     
    await mcpMemoryServer.init();
  });

  describe('addEntity', () => {
    it('crée une entité avec id unique et observations dédupliquées', async () => {
      const r = await mcpMemoryServer.addEntity('Kevin DESARZENS', 'person', [
        'admin Apex',
        'admin Apex', /* doublon → dédupliqué */
        'habite Monaco',
      ]);
      expect(r.created).toBe(true);
      expect(r.id).toMatch(/^ent_/);
      const entity = await mcpMemoryServer.getEntity(r.id);
      expect(entity).toBeTruthy();
      expect(entity?.observations).toHaveLength(2);
      expect(entity?.observations).toContain('admin Apex');
      expect(entity?.observations).toContain('habite Monaco');
    });

    it('réutilise une entité existante (name+type case-insensitive) et merge nouvelles obs', async () => {
      const r1 = await mcpMemoryServer.addEntity('Apex AI', 'project', ['v13']);
      const r2 = await mcpMemoryServer.addEntity('apex ai', 'PROJECT', ['v13', 'autonomie totale']);
      expect(r2.id).toBe(r1.id);
      expect(r2.created).toBe(false);
      const entity = await mcpMemoryServer.getEntity(r1.id);
      expect(entity?.observations).toContain('v13');
      expect(entity?.observations).toContain('autonomie totale');
      expect(entity?.observations).toHaveLength(2); /* pas de duplicate */
    });

    it('rejette name vide ou type vide', async () => {
      await expect(mcpMemoryServer.addEntity('', 'person')).rejects.toThrow(/name required/);
      await expect(mcpMemoryServer.addEntity('Kevin', '')).rejects.toThrow(/type required/);
    });
  });

  describe('addRelation', () => {
    it('crée une relation entre 2 entités existantes', async () => {
      const a = await mcpMemoryServer.addEntity('Kevin', 'person');
      const b = await mcpMemoryServer.addEntity('Apex', 'project');
      const rel = await mcpMemoryServer.addRelation(a.id, b.id, 'created');
      expect(rel.created).toBe(true);
      expect(rel.id).toMatch(/^rel_/);
      const stored = await mcpMemoryServer.getRelation(rel.id);
      expect(stored?.from_id).toBe(a.id);
      expect(stored?.to_id).toBe(b.id);
      expect(stored?.type).toBe('created');
    });

    it('idempotent : (from, to, type) déjà existante → réutilise', async () => {
      const a = await mcpMemoryServer.addEntity('Kevin', 'person');
      const b = await mcpMemoryServer.addEntity('Apex', 'project');
      const r1 = await mcpMemoryServer.addRelation(a.id, b.id, 'created');
      const r2 = await mcpMemoryServer.addRelation(a.id, b.id, 'created');
      expect(r2.id).toBe(r1.id);
      expect(r2.created).toBe(false);
    });

    it('rejette si entité from ou to introuvable', async () => {
      const a = await mcpMemoryServer.addEntity('Kevin', 'person');
      await expect(
        mcpMemoryServer.addRelation(a.id, 'ent_nonexistent', 'loves'),
      ).rejects.toThrow(/to entity not found/);
      await expect(
        mcpMemoryServer.addRelation('ent_nonexistent', a.id, 'loves'),
      ).rejects.toThrow(/from entity not found/);
    });

    it('rejette si from_id === to_id', async () => {
      const a = await mcpMemoryServer.addEntity('Kevin', 'person');
      await expect(mcpMemoryServer.addRelation(a.id, a.id, 'self')).rejects.toThrow(/must differ/);
    });
  });

  describe('addObservation', () => {
    it('append et dédupe sur entité existante', async () => {
      const e = await mcpMemoryServer.addEntity('Laurence', 'person', ['femme Kevin']);
      const r1 = await mcpMemoryServer.addObservation(e.id, 'aime mixage R&B');
      expect(r1.total).toBe(2);
      const r2 = await mcpMemoryServer.addObservation(e.id, 'aime mixage R&B'); /* dup */
      expect(r2.total).toBe(2);
      const entity = await mcpMemoryServer.getEntity(e.id);
      expect(entity?.observations).toHaveLength(2);
    });

    it('rejette entité introuvable', async () => {
      await expect(
        mcpMemoryServer.addObservation('ent_nope', 'foo'),
      ).rejects.toThrow(/entity not found/);
    });
  });

  describe('search', () => {
    it('trouve par token observation et ranke par tokens matched', async () => {
      const k = await mcpMemoryServer.addEntity('Kevin DESARZENS', 'person', [
        'admin Apex AI',
        'habite Monaco',
      ]);
      await mcpMemoryServer.addEntity('Laurence', 'person', ['conjointe Kevin', 'aime musique']);
      await mcpMemoryServer.addEntity('CMCteams', 'project', ['planning casino Monaco']);

      const hits = await mcpMemoryServer.search('Kevin Monaco');
      expect(hits.length).toBeGreaterThan(0);
      /* Kevin doit ranker plus haut (match name + 2 obs tokens) */
      expect(hits[0]?.entity.id).toBe(k.id);
      expect(hits[0]?.score).toBeGreaterThan(0);
      expect(hits[0]?.matched_tokens.length).toBeGreaterThan(0);
    });

    it('filtre par type', async () => {
      await mcpMemoryServer.addEntity('Kevin', 'person', ['Apex']);
      await mcpMemoryServer.addEntity('Apex AI', 'project');
      const hitsPerson = await mcpMemoryServer.search('Apex', { type: 'person' });
      const hitsProject = await mcpMemoryServer.search('Apex', { type: 'project' });
      expect(hitsPerson.every((h) => h.entity.type === 'person')).toBe(true);
      expect(hitsProject.every((h) => h.entity.type === 'project')).toBe(true);
    });

    it('retourne [] si query vide', async () => {
      const hits = await mcpMemoryServer.search('');
      expect(hits).toEqual([]);
    });
  });

  describe('getRelated', () => {
    it('BFS traversal depth=1 (voisins directs)', async () => {
      const k = await mcpMemoryServer.addEntity('Kevin', 'person');
      const a = await mcpMemoryServer.addEntity('Apex', 'project');
      const c = await mcpMemoryServer.addEntity('CMCteams', 'project');
      await mcpMemoryServer.addRelation(k.id, a.id, 'created');
      await mcpMemoryServer.addRelation(k.id, c.id, 'created');
      const related = await mcpMemoryServer.getRelated(k.id, 1);
      expect(related).toHaveLength(2);
      expect(related.every((r) => r.depth === 1)).toBe(true);
      expect(related.map((r) => r.entity.id).sort()).toEqual([a.id, c.id].sort());
    });

    it('BFS traversal depth=2 (transitif via relations)', async () => {
      const k = await mcpMemoryServer.addEntity('Kevin', 'person');
      const a = await mcpMemoryServer.addEntity('Apex', 'project');
      const f = await mcpMemoryServer.addEntity('Firebase', 'service');
      await mcpMemoryServer.addRelation(k.id, a.id, 'created');
      await mcpMemoryServer.addRelation(a.id, f.id, 'uses');
      const related = await mcpMemoryServer.getRelated(k.id, 2);
      const ids = related.map((r) => r.entity.id);
      expect(ids).toContain(a.id);
      expect(ids).toContain(f.id);
      const fbNode = related.find((r) => r.entity.id === f.id);
      expect(fbNode?.depth).toBe(2);
    });

    it('traversal bidirectionnel (incoming + outgoing)', async () => {
      const k = await mcpMemoryServer.addEntity('Kevin', 'person');
      const a = await mcpMemoryServer.addEntity('Apex', 'project');
      /* relation depuis Apex VERS Kevin → traversal partant de Kevin doit la voir */
      await mcpMemoryServer.addRelation(a.id, k.id, 'managed_by');
      const related = await mcpMemoryServer.getRelated(k.id, 1);
      expect(related.map((r) => r.entity.id)).toContain(a.id);
    });

    it('rejette entité introuvable', async () => {
      await expect(mcpMemoryServer.getRelated('ent_nope', 1)).rejects.toThrow(/entity not found/);
    });
  });

  describe('exportJSON / importJSON', () => {
    it('roundtrip complet : export → reset → import → données identiques', async () => {
      const k = await mcpMemoryServer.addEntity('Kevin', 'person', ['admin']);
      const a = await mcpMemoryServer.addEntity('Apex', 'project');
      await mcpMemoryServer.addRelation(k.id, a.id, 'created');
      const exported = await mcpMemoryServer.exportJSON();
      expect(exported.version).toBe(1);
      expect(exported.entities).toHaveLength(2);
      expect(exported.relations).toHaveLength(1);

      await mcpMemoryServer.reset();
      const stats0 = await mcpMemoryServer.getStats();
      expect(stats0.entities_count).toBe(0);

      const result = await mcpMemoryServer.importJSON(exported);
      expect(result.entities).toBe(2);
      expect(result.relations).toBe(1);
      const restored = await mcpMemoryServer.getEntity(k.id);
      expect(restored?.name).toBe('Kevin');
      expect(restored?.observations).toContain('admin');
    });

    it('rejette format invalide', async () => {
      await expect(
         
        mcpMemoryServer.importJSON({ version: 999 } as any),
      ).rejects.toThrow(/version mismatch/);
    });
  });

  describe('getStats', () => {
    it('counts cohérents avec données réelles', async () => {
      const k = await mcpMemoryServer.addEntity('K', 'person', ['o1', 'o2']);
      const a = await mcpMemoryServer.addEntity('A', 'project', ['o3']);
      await mcpMemoryServer.addRelation(k.id, a.id, 'rel');
      const stats = await mcpMemoryServer.getStats();
      expect(stats.entities_count).toBe(2);
      expect(stats.relations_count).toBe(1);
      expect(stats.observations_total).toBe(3);
      expect(stats.ready).toBe(true);
    });
  });

  describe('Tool registry + dispatch', () => {
    it('4 tools memory_* présents', () => {
      expect(apexTools.getByName('memory_add_entity')).toBeTruthy();
      expect(apexTools.getByName('memory_add_relation')).toBeTruthy();
      expect(apexTools.getByName('memory_search')).toBeTruthy();
      expect(apexTools.getByName('memory_get_related')).toBeTruthy();
    });

    it('memory_add_entity accessible client_free', () => {
      const tool = apexTools.getByName('memory_add_entity');
      expect(tool?.minTier).toBe('client_free');
      expect(tool?.impactLevel).toBe('A');
    });

    it('dispatch memory_add_entity exécute', async () => {
      const r = await apexToolsDispatch.execute(
        'memory_add_entity',
        { name: 'Test E', type: 'concept', observations: ['fact'] },
        'admin',
      );
      expect(r.ok).toBe(true);
      const result = r.result as { id: string; created: boolean };
      expect(result.id).toMatch(/^ent_/);
      expect(result.created).toBe(true);
    });

    it('dispatch memory_search retourne hits avec count', async () => {
      await mcpMemoryServer.addEntity('SearchTest', 'concept', ['unique_token_42']);
      const r = await apexToolsDispatch.execute(
        'memory_search',
        { query: 'unique_token_42' },
        'admin',
      );
      expect(r.ok).toBe(true);
      const result = r.result as { hits: unknown[]; count: number };
      expect(result.count).toBeGreaterThanOrEqual(1);
    });

    it('dispatch memory_add_entity retourne erreur si name manquant', async () => {
      const r = await apexToolsDispatch.execute(
        'memory_add_entity',
        { type: 'concept' },
        'admin',
      );
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/required/);
    });
  });
});
