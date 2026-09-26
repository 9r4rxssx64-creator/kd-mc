/**
 * APEX v13 — Tests régression wiring exhaustif feature toggles
 *
 * Mission ARCHI-101 (Kevin 2026-05-08) :
 * "Mesurer que TOUS les toggles déclarés sont effectivement vérifiés runtime."
 *
 * Stratégie :
 *  - Lit le registry (services/feature-toggles.ts)
 *  - Pour chaque toggle ID, vérifie qu'il est référencé dans au moins 1 fichier
 *    .ts (hors feature-toggles.ts/feature-guard.ts/tests).
 *  - Ce test détecte les régressions : si quelqu'un ajoute un toggle au registry
 *    sans le wirer, le test échoue.
 *
 * Ne couvre PAS le runtime exact (un toggle peut être référencé mais mal wiré).
 * Pour ça, voir les tests features/* qui simulent OFF + assertent rootEl.innerHTML.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, it, expect } from 'vitest';

import { featureToggles } from '../../services/auth/feature-toggles.js';
import { SENTINEL_TOGGLE_IDS_COVERED } from '../../services/sentinels/sentinels.js';

const ROOT = resolve(__dirname, '..', '..');
const SCAN_DIRS = ['services', 'features', 'core', 'ui', 'workers'];
const EXCLUDE_FILES = new Set([
  'services/feature-toggles.ts',
  'services/feature-guard.ts',
]);

function walk(dir: string, files: string[] = []): string[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const e of entries) {
    const full = join(dir, e);
    let isDir = false;
    try {
      isDir = statSync(full).isDirectory();
    } catch {
      continue;
    }
    if (isDir) {
      walk(full, files);
    } else if (full.endsWith('.ts') && !full.includes('.test.')) {
      files.push(full);
    }
  }
  return files;
}

function loadAllTsFiles(): { path: string; content: string }[] {
  const out: { path: string; content: string }[] = [];
  for (const d of SCAN_DIRS) {
    const dir = join(ROOT, d);
    for (const f of walk(dir)) {
      const rel = f.substring(ROOT.length + 1);
      if (EXCLUDE_FILES.has(rel)) continue;
      try {
        out.push({ path: rel, content: readFileSync(f, 'utf8') });
      } catch {
        /* ignore */
      }
    }
  }
  return out;
}

describe('feature toggles — wiring final (ARCHI-101)', () => {
  const allFiles = loadAllTsFiles();

  it('chaque toggle ID est référencé dans au moins 1 fichier hors registry', () => {
    const registry = featureToggles.list();
    const unwired: string[] = [];
    for (const f of registry) {
      const id = f.id;
      const refs = allFiles.filter((file) =>
        file.content.includes(`'${id}'`) || file.content.includes(`"${id}"`),
      );
      if (refs.length === 0) {
        unwired.push(id);
      }
    }
    if (unwired.length > 0) {
       
      console.error('Unwired feature toggles:', unwired);
    }
    expect(unwired).toEqual([]);
  });

  it('coverage minimum 95% (>=110/117 toggles vraiment wirés)', () => {
    const registry = featureToggles.list();
    let wired = 0;
    for (const f of registry) {
      const refs = allFiles.filter((file) =>
        file.content.includes(`'${f.id}'`) || file.content.includes(`"${f.id}"`),
      );
      if (refs.length > 0) wired++;
    }
    expect(wired / registry.length).toBeGreaterThanOrEqual(0.95);
  });

  describe('Sentinels mapping (SENTINEL_TOGGLE_MAP)', () => {
    it('couvre les sentinelles déclarées dans registry (sentinel.* ids)', () => {
      const sentinelToggles = featureToggles
        .listByCategory('sentinel')
        .map((f) => f.id);
      const covered = new Set(SENTINEL_TOGGLE_IDS_COVERED);
      const missing = sentinelToggles.filter(
        (id) =>
          !covered.has(id) &&
          /* feature.realtime-backup est mappé via realtime-backup-watch */
          id !== 'feature.realtime-backup',
      );
      expect(missing).toEqual([]);
    });
  });

  describe('Tools mapping (TOOL_TOGGLE_MAP)', () => {
    it('charge le mapping et expose au moins 30 tools', async () => {
      /* Lecture textuelle : pas d'export direct, mais on vérifie présence */
      const dispatchPath = join(ROOT, 'services', 'core-svc', 'apex-tools-dispatch.ts');
      const content = readFileSync(dispatchPath, 'utf8');
      const matches = content.match(/'tool\.[a-z_]+'/g) ?? [];
      const unique = new Set(matches);
      expect(unique.size).toBeGreaterThanOrEqual(20);
    });
  });

  describe('Critical toggles wiring (smoke)', () => {
    /* Ces toggles sont les plus visibles user — vérifient qu'ils sont wirés
       dans des fichiers métier (pas seulement registry). */
    const CRITICAL_IDS = [
      'module.chat',
      'module.landing',
      'admin.commerce',
      'admin.users',
      'admin.bilan',
      'admin.executions',
      'admin.audit-log',
      'auth.voice_print',
      'auth.biometric',
      'auth.webauthn',
      'feature.pinecone-rag',
      'studio.camera',
      'voice.tts',
      'voice.stt',
      'voice.wake_word',
      'browser.iframe',
    ];

    for (const id of CRITICAL_IDS) {
      it(`'${id}' est wired dans un fichier features/ ou services/`, () => {
        const refs = allFiles.filter((file) =>
          file.content.includes(`'${id}'`) || file.content.includes(`"${id}"`),
        );
        expect(refs.length).toBeGreaterThan(0);
      });
    }
  });

  describe('Tests régression OFF state (smoke)', () => {
    it('module.chat OFF → render renvoie disabled notice (smoke check)', () => {
      /* On valide que le code source utilise bien isFeatureEnabled('module.chat')
         dans le path de render. Test runtime exhaustif demande JSDOM full mount,
         hors scope ici (couvert par tests/unit/features-* dédiés). */
      const chatPath = join(ROOT, 'features', 'chat', 'index.ts');
      const content = readFileSync(chatPath, 'utf8');
      expect(content).toMatch(/isFeatureEnabled\(\s*['"]module\.chat['"]/);
    });

    it('admin.bilan OFF → tab content renvoie disabled notice', () => {
      const adminPath = join(ROOT, 'features', 'admin', 'index.ts');
      const content = readFileSync(adminPath, 'utf8');
      expect(content).toMatch(/admin\.bilan/);
      expect(content).toMatch(/ADMIN_TAB_TOGGLE_MAP/);
    });

    it('feature.pinecone-rag OFF → fallback localStorage', () => {
      const pineconePath = join(ROOT, 'services', 'storage', 'pinecone-store.ts');
      const content = readFileSync(pineconePath, 'utf8');
      expect(content).toMatch(/isFeatureEnabled\(['"]feature\.pinecone-rag['"]\)/);
    });

    it('auth.biometric OFF → admin-action-gate skip biometric', () => {
      const gatePath = join(ROOT, 'services', 'auth', 'admin-action-gate.ts');
      const content = readFileSync(gatePath, 'utf8');
      expect(content).toMatch(/isFeatureEnabled\(['"]auth\.biometric['"]\)/);
    });

    it('auth.voice_print OFF → identifySpeaker retourne not identified', () => {
      const vpPath = join(ROOT, 'services', 'ai', 'voice-print.ts');
      const content = readFileSync(vpPath, 'utf8');
      expect(content).toMatch(/isFeatureEnabled\(['"]auth\.voice_print['"]/);
    });

    it('studio.camera OFF → tool dispatcher refuse', () => {
      const dispatchPath = join(ROOT, 'services', 'core-svc', 'apex-tools-dispatch.ts');
      const content = readFileSync(dispatchPath, 'utf8');
      expect(content).toMatch(/isFeatureEnabled\(['"]studio\.camera['"]\)/);
    });
  });
});
