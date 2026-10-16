/**
 * Tests kdmc-projects-registry.ts
 *
 * Couverture : list/byId/listActive/listByStatus/searchByKeyword/update/
 * formatForSystemPrompt/count/countActive/reset + edge cases (overrides,
 * persistence, immutables, fallback).
 *
 * Règle Kevin : "Apex doit connaître TOUS projets internes pour autonomie."
 */
import { describe, it, expect, beforeEach } from 'vitest';

import {
  kdmcProjectsRegistry,
  KDMC_PROJECTS,
  type KdmcProjectUpdate,
} from '../../services/admin/kdmc-projects-registry.js';

describe('kdmc-projects-registry', () => {
  beforeEach(() => {
    localStorage.clear();
    kdmcProjectsRegistry.reset();
  });

  describe('catalog initial', () => {
    it('expose au moins 6 projets', () => {
      expect(KDMC_PROJECTS.length).toBeGreaterThanOrEqual(6);
    });

    it('inclut les projets clés Kevin (apex, cmcteams, ekdmc, telecommande, crackpass)', () => {
      const ids = KDMC_PROJECTS.map((p) => p.id);
      expect(ids).toContain('apex');
      expect(ids).toContain('cmcteams');
      expect(ids).toContain('ekdmc');
      expect(ids).toContain('telecommande');
      expect(ids).toContain('crackpass');
    });

    it('chaque projet a id, name, version, status, repo_url, deploy_url, tech_stack', () => {
      for (const p of KDMC_PROJECTS) {
        expect(p.id).toBeTruthy();
        expect(p.name).toBeTruthy();
        expect(p.version).toBeTruthy();
        expect(['active', 'wip', 'archived']).toContain(p.status);
        expect(p.repo_url).toMatch(/^https?:\/\//);
        expect(p.deploy_url).toMatch(/^https?:\/\//);
        expect(Array.isArray(p.tech_stack)).toBe(true);
        expect(p.created_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });
  });

  describe('list / byId / count', () => {
    it('list() retourne tous les projets', () => {
      expect(kdmcProjectsRegistry.list().length).toBe(KDMC_PROJECTS.length);
    });

    it('byId("apex") retourne projet APEX AI', () => {
      const apex = kdmcProjectsRegistry.byId('apex');
      expect(apex).not.toBeNull();
      expect(apex?.name).toBe('APEX AI');
      expect(apex?.status).toBe('active');
    });

    it('byId("inconnu") retourne null', () => {
      expect(kdmcProjectsRegistry.byId('inconnu')).toBeNull();
    });

    it('count() retourne le total catalog', () => {
      expect(kdmcProjectsRegistry.count()).toBe(KDMC_PROJECTS.length);
    });

    it('countActive() compte uniquement active+wip', () => {
      const archived = KDMC_PROJECTS.filter((p) => p.status === 'archived').length;
      const expected = KDMC_PROJECTS.length - archived;
      expect(kdmcProjectsRegistry.countActive()).toBe(expected);
    });
  });

  describe('listActive / listByStatus', () => {
    it('listActive() retourne uniquement active+wip (pas archived)', () => {
      const actives = kdmcProjectsRegistry.listActive();
      expect(actives.every((p) => p.status === 'active' || p.status === 'wip')).toBe(true);
      expect(actives.some((p) => p.status === 'archived')).toBe(false);
    });

    it('listByStatus("active") retourne seulement actifs', () => {
      const r = kdmcProjectsRegistry.listByStatus('active');
      expect(r.every((p) => p.status === 'active')).toBe(true);
      expect(r.length).toBeGreaterThan(0);
    });

    it('listByStatus("archived") retourne au moins iakdmc', () => {
      const r = kdmcProjectsRegistry.listByStatus('archived');
      const ids = r.map((p) => p.id);
      expect(ids).toContain('iakdmc');
    });
  });

  describe('searchByKeyword', () => {
    it('matche dans le nom (casse-insensible)', () => {
      const r = kdmcProjectsRegistry.searchByKeyword('CMC');
      expect(r.some((p) => p.id === 'cmcteams')).toBe(true);
    });

    it('matche dans la description', () => {
      const r = kdmcProjectsRegistry.searchByKeyword('Casino Monaco');
      expect(r.some((p) => p.id === 'cmcteams')).toBe(true);
    });

    it('matche dans tech_stack (TypeScript)', () => {
      const r = kdmcProjectsRegistry.searchByKeyword('typescript');
      expect(r.length).toBeGreaterThan(0);
      expect(r.some((p) => p.id === 'apex')).toBe(true);
    });

    it('matche multi-tokens (tous doivent matcher)', () => {
      const r = kdmcProjectsRegistry.searchByKeyword('apex assistant');
      expect(r.some((p) => p.id === 'apex')).toBe(true);
    });

    it('retourne vide pour query vide', () => {
      expect(kdmcProjectsRegistry.searchByKeyword('').length).toBe(0);
      expect(kdmcProjectsRegistry.searchByKeyword('   ').length).toBe(0);
    });

    it('retourne vide pour keyword introuvable', () => {
      expect(kdmcProjectsRegistry.searchByKeyword('xyz_introuvable_zzz').length).toBe(0);
    });
  });

  describe('update + persistence', () => {
    it('update() change la version d\'un projet', () => {
      const ok = kdmcProjectsRegistry.update('apex', { version: 'v13.0.99' });
      expect(ok).toBe(true);
      expect(kdmcProjectsRegistry.byId('apex')?.version).toBe('v13.0.99');
    });

    it('update() persiste dans localStorage', () => {
      kdmcProjectsRegistry.update('apex', { version: 'v13.99.99' });
      const raw = localStorage.getItem('apex_v13_kdmc_projects_overrides');
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw ?? '{}') as Record<string, KdmcProjectUpdate>;
      expect(parsed['apex']?.version).toBe('v13.99.99');
    });

    it('update() refuse projet inconnu', () => {
      const ok = kdmcProjectsRegistry.update('inconnu', { version: 'v1' });
      expect(ok).toBe(false);
    });

    it('update() refuse champs immutables (id, created_at)', () => {
      const before = kdmcProjectsRegistry.byId('apex');
      const ok = kdmcProjectsRegistry.update('apex', {
        /* @ts-expect-error volontaire : tester rejet champ immutable */
        id: 'pirate',
        /* @ts-expect-error volontaire : created_at non éditable */
        created_at: '2099-01-01',
      });
      expect(ok).toBe(false);
      expect(kdmcProjectsRegistry.byId('apex')?.id).toBe(before?.id);
      expect(kdmcProjectsRegistry.byId('apex')?.created_at).toBe(before?.created_at);
    });

    it('update() change status active → wip', () => {
      kdmcProjectsRegistry.update('cmcteams', { status: 'wip' });
      expect(kdmcProjectsRegistry.byId('cmcteams')?.status).toBe('wip');
    });

    it('update() supporte tech_stack remplaçant', () => {
      kdmcProjectsRegistry.update('crackpass', { tech_stack: ['Rust', 'WASM'] });
      const p = kdmcProjectsRegistry.byId('crackpass');
      expect(p?.tech_stack).toEqual(['Rust', 'WASM']);
    });

    it('reset() retire les overrides', () => {
      kdmcProjectsRegistry.update('apex', { version: 'v13.99.99' });
      kdmcProjectsRegistry.reset();
      const apex = kdmcProjectsRegistry.byId('apex');
      const original = KDMC_PROJECTS.find((p) => p.id === 'apex');
      expect(apex?.version).toBe(original?.version);
    });
  });

  describe('formatForSystemPrompt', () => {
    it('produit du markdown structuré pour IA', () => {
      const md = kdmcProjectsRegistry.formatForSystemPrompt();
      expect(md).toContain('## Projets KDMC');
      expect(md).toContain('APEX AI');
      expect(md).toContain('CMCteams');
      expect(md).toContain('stack:');
      expect(md).toContain('live:');
    });

    it('exclut archived par défaut (économie tokens IA)', () => {
      const md = kdmcProjectsRegistry.formatForSystemPrompt();
      /* iakdmc est archived → ne doit pas apparaître */
      expect(md).not.toContain('IA-KDMC');
    });

    it('inclut archived si includeArchived=true', () => {
      const md = kdmcProjectsRegistry.formatForSystemPrompt({ includeArchived: true });
      expect(md).toContain('IA-KDMC');
    });

    it('respecte maxStackEntries (limite tech_stack affichée)', () => {
      const md = kdmcProjectsRegistry.formatForSystemPrompt({ maxStackEntries: 1 });
      /* APEX AI a 6 stack → doit afficher "+5" */
      expect(md).toMatch(/\+\d+/);
    });

    it('reflète les updates dans le markdown', () => {
      kdmcProjectsRegistry.update('apex', { version: 'v13.0.999' });
      const md = kdmcProjectsRegistry.formatForSystemPrompt();
      expect(md).toContain('v13.0.999');
    });
  });
});
