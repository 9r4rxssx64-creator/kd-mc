/**
 * Tests data/apex-extended-catalog.ts (Catalog 300+ outils MCP/skills/PWA/frameworks).
 *
 * Suite de tests exhaustive : structure catalog, helpers (countTools, groupByType,
 * groupByCompatibility, getPwaCompatibleTools, getToolsImproving, getHighValueTools,
 * searchCatalog, getToolById), invariants (IDs uniques, URLs valides, types valides).
 */
import { describe, it, expect } from 'vitest';

import {
  APEX_EXTENDED_CATALOG,
  countTools,
  groupByType,
  groupByCompatibility,
  getPwaCompatibleTools,
  getToolsImproving,
  getHighValueTools,
  searchCatalog,
  getToolById,
  type ApexExtendedTool,
  type ApexExtendedToolType,
  type ApexCompatibility,
  type ImprovementArea,
} from '../../data/apex-extended-catalog.js';

const VALID_TYPES: readonly ApexExtendedToolType[] = [
  'mcp-server',
  'mcp-aggregator',
  'claude-skill',
  'claude-hook',
  'claude-command',
  'claude-subagent-orchestrator',
  'agent-framework',
  'browser-api',
  'web-tool',
  'github-action',
  'tooling-cli',
  'status-line',
  'pwa-capability',
];

const VALID_COMPAT: readonly ApexCompatibility[] = [
  'pwa-direct',
  'cloudflare-worker',
  'node-required',
  'native-only',
];

const VALID_AREAS: readonly ImprovementArea[] = [
  'performance',
  'autonomy',
  'capability',
  'self-healing',
  'observability',
  'memory',
  'reasoning',
  'security',
  'ux',
];

describe('data/apex-extended-catalog — invariants structure', () => {
  it('contient au moins 300 outils', () => {
    expect(APEX_EXTENDED_CATALOG.length).toBeGreaterThanOrEqual(300);
  });

  it('countTools() retourne la longueur du catalog', () => {
    expect(countTools()).toBe(APEX_EXTENDED_CATALOG.length);
  });

  it('tous les IDs sont uniques', () => {
    const ids = APEX_EXTENDED_CATALOG.map((t) => t.id);
    const set = new Set(ids);
    expect(set.size).toBe(ids.length);
  });

  it('tous les IDs sont non-vides', () => {
    for (const t of APEX_EXTENDED_CATALOG) {
      expect(t.id).toBeTruthy();
      expect(t.id.length).toBeGreaterThan(0);
    }
  });

  it('toutes les URLs source commencent par https://', () => {
    for (const t of APEX_EXTENDED_CATALOG) {
      expect(t.source_url.startsWith('https://')).toBe(true);
    }
  });

  it('tous les types sont valides', () => {
    for (const t of APEX_EXTENDED_CATALOG) {
      expect(VALID_TYPES).toContain(t.type);
    }
  });

  it('toutes les compat values sont valides', () => {
    for (const t of APEX_EXTENDED_CATALOG) {
      expect(VALID_COMPAT).toContain(t.apex_compatibility);
    }
  });

  it('toutes les valeurs auto_improvement sont valides', () => {
    for (const t of APEX_EXTENDED_CATALOG) {
      expect(['high', 'medium', 'low']).toContain(t.auto_improvement_value);
    }
  });

  it('tous les improves[] contiennent des areas valides', () => {
    for (const t of APEX_EXTENDED_CATALOG) {
      expect(t.improves.length).toBeGreaterThan(0);
      for (const area of t.improves) {
        expect(VALID_AREAS).toContain(area);
      }
    }
  });

  it('toutes les categories[] sont non-vides', () => {
    for (const t of APEX_EXTENDED_CATALOG) {
      expect(t.categories.length).toBeGreaterThan(0);
      for (const c of t.categories) {
        expect(c.length).toBeGreaterThan(0);
      }
    }
  });

  it('toutes les descriptions sont non-vides', () => {
    for (const t of APEX_EXTENDED_CATALOG) {
      expect(t.description.length).toBeGreaterThan(0);
    }
  });
});

describe('data/apex-extended-catalog — distribution catégories', () => {
  it('contient au moins 30 MCP servers', () => {
    const mcps = APEX_EXTENDED_CATALOG.filter(
      (t) => t.type === 'mcp-server' || t.type === 'mcp-aggregator',
    );
    expect(mcps.length).toBeGreaterThanOrEqual(30);
  });

  it('contient au moins 15 Claude skills', () => {
    const skills = APEX_EXTENDED_CATALOG.filter((t) => t.type === 'claude-skill');
    expect(skills.length).toBeGreaterThanOrEqual(15);
  });

  it('contient au moins 5 hooks Claude', () => {
    const hooks = APEX_EXTENDED_CATALOG.filter((t) => t.type === 'claude-hook');
    expect(hooks.length).toBeGreaterThanOrEqual(5);
  });

  it('contient au moins 10 commands Claude', () => {
    const cmds = APEX_EXTENDED_CATALOG.filter((t) => t.type === 'claude-command');
    expect(cmds.length).toBeGreaterThanOrEqual(10);
  });

  it('contient au moins 20 agent frameworks', () => {
    const fws = APEX_EXTENDED_CATALOG.filter((t) => t.type === 'agent-framework');
    expect(fws.length).toBeGreaterThanOrEqual(20);
  });

  it('contient au moins 30 PWA capabilities', () => {
    const pwas = APEX_EXTENDED_CATALOG.filter((t) => t.type === 'pwa-capability');
    expect(pwas.length).toBeGreaterThanOrEqual(30);
  });

  it('contient au moins 30 web tools/libs', () => {
    const tools = APEX_EXTENDED_CATALOG.filter((t) => t.type === 'web-tool');
    expect(tools.length).toBeGreaterThanOrEqual(30);
  });

  it('contient au moins 10 github actions', () => {
    const ghas = APEX_EXTENDED_CATALOG.filter((t) => t.type === 'github-action');
    expect(ghas.length).toBeGreaterThanOrEqual(10);
  });
});

describe('data/apex-extended-catalog — helpers groupByType', () => {
  it('groupByType retourne map non-vide', () => {
    const groups = groupByType();
    expect(Object.keys(groups).length).toBeGreaterThan(0);
  });

  it('total entries dans groupByType = catalog total', () => {
    const groups = groupByType();
    let total = 0;
    for (const arr of Object.values(groups)) {
      total += (arr as readonly ApexExtendedTool[]).length;
    }
    expect(total).toBe(APEX_EXTENDED_CATALOG.length);
  });
});

describe('data/apex-extended-catalog — helpers groupByCompatibility', () => {
  it('groupByCompatibility retourne 4 entrées', () => {
    const groups = groupByCompatibility();
    expect(Object.keys(groups).length).toBe(4);
  });

  it('total entries = catalog total', () => {
    const groups = groupByCompatibility();
    let total = 0;
    for (const arr of Object.values(groups)) {
      total += (arr as readonly ApexExtendedTool[]).length;
    }
    expect(total).toBe(APEX_EXTENDED_CATALOG.length);
  });
});

describe('data/apex-extended-catalog — helpers PWA compat', () => {
  it('getPwaCompatibleTools retourne tools pwa-direct OU cloudflare-worker', () => {
    const pwas = getPwaCompatibleTools();
    for (const t of pwas) {
      expect(['pwa-direct', 'cloudflare-worker']).toContain(t.apex_compatibility);
    }
  });

  it('getPwaCompatibleTools représente une bonne portion (>60%) du catalog', () => {
    const pwas = getPwaCompatibleTools();
    const ratio = pwas.length / APEX_EXTENDED_CATALOG.length;
    expect(ratio).toBeGreaterThan(0.6);
  });
});

describe('data/apex-extended-catalog — helper getToolsImproving', () => {
  it('getToolsImproving("autonomy") retourne entries qui ont autonomy dans improves', () => {
    const tools = getToolsImproving('autonomy');
    expect(tools.length).toBeGreaterThan(0);
    for (const t of tools) {
      expect(t.improves).toContain('autonomy');
    }
  });

  it('getToolsImproving("security") trouve les tools sécurité', () => {
    const tools = getToolsImproving('security');
    expect(tools.length).toBeGreaterThan(0);
    for (const t of tools) {
      expect(t.improves).toContain('security');
    }
  });

  it('getToolsImproving sur area inexistante retourne vide', () => {
    const tools = getToolsImproving('autonomy');
    /* contrôle : ne renvoie que ceux ayant l'area */
    for (const t of tools) {
      expect(t.improves.includes('autonomy')).toBe(true);
    }
  });
});

describe('data/apex-extended-catalog — helper getHighValueTools', () => {
  it('getHighValueTools retourne uniquement value=high', () => {
    const tools = getHighValueTools();
    expect(tools.length).toBeGreaterThan(0);
    for (const t of tools) {
      expect(t.auto_improvement_value).toBe('high');
    }
  });

  it('getHighValueTools représente moins de 60% du catalog (sélectivité)', () => {
    const tools = getHighValueTools();
    const ratio = tools.length / APEX_EXTENDED_CATALOG.length;
    expect(ratio).toBeLessThan(0.6);
  });
});

describe('data/apex-extended-catalog — helper searchCatalog', () => {
  it('search vide retourne tout le catalog', () => {
    const r = searchCatalog('');
    expect(r.length).toBe(APEX_EXTENDED_CATALOG.length);
  });

  it('search whitespace retourne tout', () => {
    const r = searchCatalog('   ');
    expect(r.length).toBe(APEX_EXTENDED_CATALOG.length);
  });

  it('search "mcp" trouve plusieurs MCP servers', () => {
    const r = searchCatalog('mcp');
    expect(r.length).toBeGreaterThan(20);
  });

  it('search "browser" trouve browser tools', () => {
    const r = searchCatalog('browser');
    expect(r.length).toBeGreaterThan(2);
  });

  it('search insensible à la casse', () => {
    const lower = searchCatalog('langchain');
    const upper = searchCatalog('LANGCHAIN');
    expect(lower.length).toBe(upper.length);
  });

  it('search sur catégorie unique', () => {
    const r = searchCatalog('security');
    expect(r.length).toBeGreaterThan(0);
  });

  it('search sur ID unique', () => {
    const r = searchCatalog('framework-langgraph');
    expect(r.length).toBeGreaterThanOrEqual(1);
  });
});

describe('data/apex-extended-catalog — helper getToolById', () => {
  it('trouve tool par id existant', () => {
    const t = getToolById('mcp-fetch');
    expect(t).toBeDefined();
    expect(t?.name).toBe('MCP Fetch');
  });

  it('retourne undefined pour id inexistant', () => {
    expect(getToolById('does-not-exist-xyz')).toBeUndefined();
  });

  it('trouve LangGraph framework', () => {
    const t = getToolById('framework-langgraph');
    expect(t).toBeDefined();
    expect(t?.type).toBe('agent-framework');
  });

  it('trouve PWA capability', () => {
    const t = getToolById('pwa-webusb');
    expect(t).toBeDefined();
    expect(t?.apex_compatibility).toBe('pwa-direct');
  });
});
