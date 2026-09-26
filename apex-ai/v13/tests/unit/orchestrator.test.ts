import { describe, it, expect } from 'vitest';
import { orchestrator, PROJECTS, TOOLS_HTML } from '../../services/core-svc/orchestrator.js';

describe('orchestrator', () => {
  it('liste 6 projets Kevin préservés', () => {
    expect(PROJECTS.length).toBeGreaterThanOrEqual(6);
    const ids = PROJECTS.map((p) => p.id);
    expect(ids).toContain('cmcteams');
    expect(ids).toContain('telecommande');
    expect(ids).toContain('crackpass');
    expect(ids).toContain('kdmc');
    expect(ids).toContain('ekdmc');
    expect(ids).toContain('iakdmc');
  });
  it('liste tools HTML autonomes', () => {
    expect(TOOLS_HTML.length).toBeGreaterThanOrEqual(8);
    expect(TOOLS_HTML.some((t) => t.id === 'kevin_todo')).toBe(true);
  });
  it('openTool retourne URL valide', () => {
    const r = orchestrator.openTool('kevin_todo');
    expect(r.ok).toBe(true);
    expect(r.url).toMatch(/CMCteams\/tools\/kevin-todo-iphone\.html$/);
  });
  it('openTool inconnu retourne erreur', () => {
    const r = orchestrator.openTool('inexistant');
    expect(r.ok).toBe(false);
  });
  it('getToolDefinitions au format Anthropic', () => {
    const tools = orchestrator.getToolDefinitions() as Array<{ name: string }>;
    expect(tools.some((t) => t.name === 'cmc_read')).toBe(true);
  });
});
