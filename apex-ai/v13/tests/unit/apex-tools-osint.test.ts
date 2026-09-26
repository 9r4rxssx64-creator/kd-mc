/**
 * Tests du tool natif osint_tools (répertoire OSINT curé).
 * Registry → dispatch → data statique (sans clé, sans réseau).
 */
import { describe, it, expect } from 'vitest';
import { apexTools } from '../../services/core-svc/apex-tools.js';
import { apexToolsDispatch } from '../../services/core-svc/apex-tools-dispatch.js';
import { osintTools } from '../../services/apex-tools-dispatch/utils-misc.js';

describe('osint_tools', () => {
  it('est enregistré dans le registry, tier client_free', () => {
    const t = apexTools.list().find((x) => x.name === 'osint_tools');
    expect(t).toBeDefined();
    expect(t?.minTier).toBe('client_free');
  });

  it('sans filtre → retourne toutes les catégories + le hub', () => {
    const r = osintTools();
    expect(r.hub).toBe('https://kd-mc.com/osint/');
    expect(r.matched).toBeNull();
    expect(r.categories.length).toBeGreaterThanOrEqual(10);
    /* chaque outil a un nom + URL https valide */
    for (const c of r.categories) {
      expect(c.tools.length).toBeGreaterThan(0);
      for (const tool of c.tools) {
        expect(tool.name).toBeTruthy();
        expect(tool.url).toMatch(/^https:\/\//);
      }
    }
  });

  it('filtre par catégorie (accent-insensible) → 1 catégorie ciblée', () => {
    const r = osintTools('maritime');
    expect(r.matched).toBe('maritime');
    expect(r.categories).toHaveLength(1);
    expect(r.categories[0]?.category).toContain('Navires');
    expect(r.categories[0]?.tools.some((t) => t.name === 'MarineTraffic')).toBe(true);
  });

  it('filtre par nom d\'outil → garde la structure par catégorie', () => {
    const r = osintTools('shodan');
    expect(r.matched).toBe('shodan');
    const names = r.categories.flatMap((c) => c.tools.map((t) => t.name));
    expect(names).toContain('Shodan');
    expect(names.every((n) => n.toLowerCase().includes('shodan'))).toBe(true);
  });

  it('filtre sans correspondance → repli sur tout le répertoire', () => {
    const r = osintTools('zzz-inexistant');
    expect(r.categories.length).toBeGreaterThanOrEqual(10);
  });

  it('outils sensibles portent une note (faciale / fuites)', () => {
    const all = osintTools().categories.flatMap((c) => c.tools);
    expect(all.find((t) => t.name.includes('PimEyes'))?.note).toBeTruthy();
    expect(all.find((t) => t.name === 'DeHashed')?.note).toBeTruthy();
  });

  it('dispatch client_free exécute et retourne les données', async () => {
    const r = await apexToolsDispatch.execute('osint_tools', { category: 'vols' }, 'client_free');
    expect(r.ok).toBe(true);
    const data = r.result as { matched: string; categories: Array<{ category: string }> };
    expect(data.matched).toBe('vols');
    expect(data.categories[0]?.category).toContain('Vols');
  });
});
