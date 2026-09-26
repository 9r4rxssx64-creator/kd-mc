/**
 * Test régression v13.4.82 — Cross-reference TOUTES les routes Apex.
 *
 * MÉTHODE EXPERT obligatoire (Kevin 2026-05-14 22:30 "plus possible toutes
 * tes erreurs") : pour CHAQUE button data-route ou data-nav-route OU
 * navigate('xxx'), vérifier que la route existe bien dans bootstrap.ts.
 *
 * Pattern Erreur #28 CLAUDE.md DECLARATION ≠ DEPLOYMENT reproduit 3 fois
 * en 4 versions (v13.4.78 restoreSession, v13.4.81 dashboard, v13.4.82 dashboard
 * boutons). FIN. Test régression PERMANENT pour bloquer toute nouvelle
 * reproduction.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function readAllFiles(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  function walk(d: string): void {
    let entries: string[] = [];
    try { entries = readdirSync(d); } catch { return; }
    for (const name of entries) {
      const p = join(d, name);
      let st;
      try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) {
        if (name === 'node_modules' || name === 'dist' || name === 'tests') continue;
        walk(p);
      } else if (exts.some((e) => name.endsWith(e))) {
        out.push(p);
      }
    }
  }
  walk(dir);
  return out;
}

describe('v13.4.82 routes cross-reference exhaustif', () => {
  const APEX_V13_ROOT = join(__dirname, '..', '..');
  const bootstrapTs = readFileSync(join(APEX_V13_ROOT, 'core', 'bootstrap.ts'), 'utf8');

  /* Routes ENREGISTRÉES dans bootstrap.ts */
  const registeredRoutes = new Set<string>();
  const regRegex = /router\.register\('([a-z][a-z0-9-]*)'/g;
  let m: RegExpExecArray | null;
  while ((m = regRegex.exec(bootstrapTs)) !== null) {
    if (m[1]) registeredRoutes.add(m[1]);
  }

  it("bootstrap.ts contient un nombre raisonnable de routes (> 30)", () => {
    expect(registeredRoutes.size).toBeGreaterThan(30);
  });

  it("Routes essentielles présentes : chat, vault, admin, dashboard, settings, login", () => {
    for (const r of ['chat', 'vault', 'admin', 'dashboard', 'settings', 'login']) {
      expect(registeredRoutes.has(r), `Route '${r}' DOIT être registered`).toBe(true);
    }
  });

  /* Cherche TOUS les usages data-route + data-nav-route dans features/ + ui/ + core/ */
  const filesToScan = readAllFiles(join(APEX_V13_ROOT, 'features'), ['.ts', '.tsx'])
    .concat(readAllFiles(join(APEX_V13_ROOT, 'ui'), ['.ts']))
    .concat(readAllFiles(join(APEX_V13_ROOT, 'core'), ['.ts']));

  const usedRoutes = new Map<string, string[]>(); /* route → [files] */
  const ATTR_REGEX = /data-(?:nav-)?route=["']([a-z][a-z0-9-]*)["']/g;
  for (const f of filesToScan) {
    if (f.includes('routes-cross-reference')) continue;
    const content = readFileSync(f, 'utf8');
    let mm: RegExpExecArray | null;
    while ((mm = ATTR_REGEX.exec(content)) !== null) {
      const route = mm[1];
      if (!route) continue;
      if (!usedRoutes.has(route)) usedRoutes.set(route, []);
      usedRoutes.get(route)!.push(f);
    }
  }

  it("Au moins 6 routes utilisées dans nav/dashboard buttons", () => {
    expect(usedRoutes.size).toBeGreaterThanOrEqual(6);
  });

  /* === LE TEST CRITIQUE === */
  it("ZÉRO route utilisée qui ne soit PAS registered (anti Erreur #28)", () => {
    const broken: string[] = [];
    for (const [route, files] of usedRoutes) {
      if (!registeredRoutes.has(route)) {
        broken.push(`'${route}' → utilisé dans ${files.length} fichier(s) mais PAS registered`);
      }
    }
    if (broken.length > 0) {
      const msg = `${broken.length} routes broken :\n  - ${broken.join('\n  - ')}`;
      console.error(msg);
      throw new Error(msg);
    }
    expect(broken).toEqual([]);
  });
});

describe('v13.4.82 routes guards cohérence', () => {
  const APEX_V13_ROOT = join(__dirname, '..', '..');
  const bootstrapTs = readFileSync(join(APEX_V13_ROOT, 'core', 'bootstrap.ts'), 'utf8');

  it("Route admin a requiresAdmin: true", () => {
    expect(/router\.register\('admin'[^}]+requiresAdmin:\s*true/.test(bootstrapTs)).toBe(true);
  });

  it("Route vault a un guard (requiresAuth ou requiresAdmin)", () => {
    expect(/router\.register\('vault'[^}]+(?:requiresAuth|requiresAdmin):\s*true/.test(bootstrapTs)).toBe(true);
  });

  it("Route landing/login NE doit PAS avoir requiresAuth (paradoxe)", () => {
    /* Login route doit être accessible sans auth (sinon Kevin ne peut jamais logger) */
    const landingMatch = /router\.register\('landing'[^}]*\}/.exec(bootstrapTs);
    const loginMatch = /router\.register\('login'[^}]*\}/.exec(bootstrapTs);
    expect(landingMatch).not.toBeNull();
    expect(loginMatch).not.toBeNull();
    if (landingMatch) {
      expect(/requiresAuth:\s*true/.test(landingMatch[0])).toBe(false);
    }
    if (loginMatch) {
      expect(/requiresAuth:\s*true/.test(loginMatch[0])).toBe(false);
    }
  });
});

describe('v13.4.82 rescue toolbar buttons → routes valides', () => {
  const APEX_V13_ROOT = join(__dirname, '..', '..');
  const rescueJs = readFileSync(join(APEX_V13_ROOT, 'assets', 'js', 'rescue.js'), 'utf8');
  const bootstrapTs = readFileSync(join(APEX_V13_ROOT, 'core', 'bootstrap.ts'), 'utf8');

  const registeredRoutes = new Set<string>();
  const regRegex = /router\.register\('([a-z][a-z0-9-]*)'/g;
  let m: RegExpExecArray | null;
  while ((m = regRegex.exec(bootstrapTs)) !== null) {
    if (m[1]) registeredRoutes.add(m[1]);
  }

  /* Extract toutes les navHash('#xxx') de rescue.js */
  const navHashRegex = /navHash\('#([a-z][a-z0-9-]*)'/g;
  const rescueRoutes: string[] = [];
  while ((m = navHashRegex.exec(rescueJs)) !== null) {
    if (m[1]) rescueRoutes.push(m[1]);
  }

  it("Toolbar rescue contient au moins 4 boutons hash routes", () => {
    expect(rescueRoutes.length).toBeGreaterThanOrEqual(4);
  });

  it("TOUTES les routes rescue toolbar sont registered", () => {
    const broken = rescueRoutes.filter((r) => !registeredRoutes.has(r));
    if (broken.length > 0) {
      throw new Error(`Rescue toolbar broken routes : ${broken.join(', ')}`);
    }
    expect(broken).toEqual([]);
  });
});
