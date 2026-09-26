#!/usr/bin/env -S node --experimental-strip-types
/**
 * APEX v13 — Bundle Budget Check (audit Kevin v13.1.0 production-grade)
 *
 * Vérifie après `npm run build` que :
 * - Main + initial chunks (entry + chunks chargés au boot) < 50 KB gzip total
 * - Aucun chunk > 80 KB gzip
 *
 * Exit code 1 si dépassement (CI fail). Exit 0 si OK.
 *
 * Usage : npx tsx scripts/bundle-budget-check.ts
 *         (ou node --experimental-strip-types scripts/bundle-budget-check.ts en Node 22+)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { gzipSync } from 'node:zlib';

interface BudgetReport {
  file: string;
  rawBytes: number;
  gzipBytes: number;
  category: 'entry' | 'chunk' | 'asset';
  withinBudget: boolean;
}

const DIST_DIR = join(process.cwd(), 'dist');
const BUDGET_INITIAL_TOTAL_GZIP = 50 * 1024; /* 50 KB */
const BUDGET_PER_CHUNK_GZIP = 80 * 1024; /* 80 KB */

/* Chunks considérés "initial" (chargés au boot du shell, sans navigation route).
 * Vite produit l'entry sous /core/main-*.js + /core/bootstrap-*.js.
 * Tout autre /chunks/index-*.js = feature lazy-load (route async). */
const INITIAL_PATTERNS = [/^bootstrap-/i, /^main-/i];
const INITIAL_DIRS = ['core/'];

function walk(dir: string, files: string[] = []): string[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const e of entries) {
    const full = join(dir, e);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      walk(full, files);
    } else if (full.endsWith('.js') || full.endsWith('.css')) {
      files.push(full);
    }
  }
  return files;
}

function categorize(file: string, distRoot: string): 'entry' | 'chunk' | 'asset' {
  const name = basename(file);
  if (file.endsWith('.css')) return 'asset';
  /* "Entry" = bootstrap/main dans /core/, jamais les /chunks/index-*.js (lazy routes) */
  const rel = file.replace(distRoot + '/', '');
  if (INITIAL_DIRS.some((d) => rel.startsWith(d)) && INITIAL_PATTERNS.some((re) => re.test(name))) {
    return 'entry';
  }
  return 'chunk';
}

function fmt(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(2)} KB`;
}

export function runBudgetCheck(distDir = DIST_DIR): { ok: boolean; reports: BudgetReport[]; violations: string[] } {
  const files = walk(distDir);
  if (files.length === 0) {
    return { ok: false, reports: [], violations: [`No build output found in ${distDir}. Run 'npm run build' first.`] };
  }
  const reports: BudgetReport[] = [];
  for (const file of files) {
    const buf = readFileSync(file);
    const gz = gzipSync(buf);
    const category = categorize(file, distDir);
    reports.push({
      file: file.replace(distDir + '/', ''),
      rawBytes: buf.length,
      gzipBytes: gz.length,
      category,
      withinBudget: gz.length <= BUDGET_PER_CHUNK_GZIP,
    });
  }
  const initialGzipTotal = reports
    .filter((r) => r.category === 'entry')
    .reduce((sum, r) => sum + r.gzipBytes, 0);
  const oversized = reports.filter((r) => !r.withinBudget);
  const violations: string[] = [];
  if (initialGzipTotal > BUDGET_INITIAL_TOTAL_GZIP) {
    violations.push(
      `Initial bundle ${fmt(initialGzipTotal)} gzip > budget ${fmt(BUDGET_INITIAL_TOTAL_GZIP)}`,
    );
  }
  for (const r of oversized) {
    violations.push(`Chunk ${r.file} : ${fmt(r.gzipBytes)} gzip > budget ${fmt(BUDGET_PER_CHUNK_GZIP)}`);
  }
  return { ok: violations.length === 0, reports, violations };
}

function isMainModule(): boolean {
  /* CJS et ESM compat (process.argv[1] = script path) */
  try {
    const argv1 = process.argv[1] ?? '';
    return argv1.includes('bundle-budget-check');
  } catch {
    return false;
  }
}

if (isMainModule()) {
  const result = runBudgetCheck();
  console.info('=== APEX v13 Bundle Budget Check ===');
  console.info(`Files analyzed: ${result.reports.length}`);
  for (const r of result.reports.sort((a, b) => b.gzipBytes - a.gzipBytes)) {
    const flag = r.withinBudget ? '✓' : '✗';
    console.info(`  ${flag} [${r.category.padEnd(5)}] ${r.file.padEnd(60)} ${fmt(r.gzipBytes).padStart(10)} gzip`);
  }
  if (result.violations.length > 0) {
    console.error('\n❌ Budget violations:');
    for (const v of result.violations) console.error(`  - ${v}`);
    process.exit(1);
  }
  console.info('\n✅ All bundle budgets respected');
  process.exit(0);
}
