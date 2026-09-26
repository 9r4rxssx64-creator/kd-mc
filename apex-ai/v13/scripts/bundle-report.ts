#!/usr/bin/env -S node --experimental-strip-types
/**
 * APEX v13.3.57 PUSH-100 — Bundle Analyzer Auto-Report
 *
 * Post-build : génère un rapport JSON listant tous les chunks avec
 * size raw + gzip, compare vs `bundle-report-prev.json` si présent,
 * alert si delta > +10%.
 *
 * Usage :
 *   npm run build && npx tsx scripts/bundle-report.ts
 *
 * Exit code :
 *   0 = OK ou regression < +10%
 *   1 = regression > +10% sur un chunk ou total
 */
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

interface ChunkInfo {
  file: string;
  rawBytes: number;
  gzipBytes: number;
}

interface BundleReport {
  ts: number;
  totalRaw: number;
  totalGzip: number;
  chunks: ChunkInfo[];
}

const DIST_DIR = join(process.cwd(), 'dist');
const REPORT_PATH = join(process.cwd(), 'bundle-report.json');
const PREV_REPORT_PATH = join(process.cwd(), 'bundle-report-prev.json');
const REGRESSION_THRESHOLD_PCT = 10;

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
    if (stat.isDirectory()) walk(full, files);
    else if (full.endsWith('.js') || full.endsWith('.css')) files.push(full);
  }
  return files;
}

function fmt(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(2)} KB`;
}

/* Strip hash from chunk filename pour comparer entre builds.
 * "main-BqoKC8cR.js" → "main.js"
 * "chunks/apex-tools-dispatch-DkTuwZwG.js" → "chunks/apex-tools-dispatch.js" */
function normalizeChunkName(file: string): string {
  return file.replace(/-[A-Za-z0-9_-]{8,}\.(js|css)$/, '.$1');
}

export function buildReport(distDir = DIST_DIR): BundleReport {
  const files = walk(distDir);
  const chunks: ChunkInfo[] = files.map((file) => {
    const buf = readFileSync(file);
    return {
      file: file.replace(distDir + '/', ''),
      rawBytes: buf.length,
      gzipBytes: gzipSync(buf).length,
    };
  });
  return {
    ts: Date.now(),
    totalRaw: chunks.reduce((s, c) => s + c.rawBytes, 0),
    totalGzip: chunks.reduce((s, c) => s + c.gzipBytes, 0),
    chunks: chunks.sort((a, b) => b.rawBytes - a.rawBytes),
  };
}

interface RegressionResult {
  hasRegression: boolean;
  totalDeltaPct: number;
  chunkRegressions: Array<{ name: string; oldSize: number; newSize: number; deltaPct: number }>;
}

export function compareReports(current: BundleReport, prev: BundleReport): RegressionResult {
  const totalDeltaPct = ((current.totalGzip - prev.totalGzip) / Math.max(prev.totalGzip, 1)) * 100;
  const chunkRegressions: Array<{ name: string; oldSize: number; newSize: number; deltaPct: number }> = [];

  /* Build map normalized name → size */
  const prevMap = new Map<string, number>();
  for (const c of prev.chunks) {
    prevMap.set(normalizeChunkName(c.file), c.gzipBytes);
  }
  for (const c of current.chunks) {
    const key = normalizeChunkName(c.file);
    const oldSize = prevMap.get(key);
    if (oldSize === undefined) continue;
    const deltaPct = ((c.gzipBytes - oldSize) / Math.max(oldSize, 1)) * 100;
    if (deltaPct > REGRESSION_THRESHOLD_PCT && c.gzipBytes - oldSize > 1024) {
      /* Ignore tiny absolute deltas (< 1KB) même si % grand */
      chunkRegressions.push({ name: key, oldSize, newSize: c.gzipBytes, deltaPct });
    }
  }

  const hasRegression = totalDeltaPct > REGRESSION_THRESHOLD_PCT || chunkRegressions.length > 0;
  return { hasRegression, totalDeltaPct, chunkRegressions };
}

function isMainModule(): boolean {
  try {
    const argv1 = process.argv[1] ?? '';
    return argv1.includes('bundle-report');
  } catch {
    return false;
  }
}

if (isMainModule()) {
  const current = buildReport();
  console.info('=== APEX v13 Bundle Analyzer Report ===');
  console.info(`Total chunks : ${current.chunks.length}`);
  console.info(`Total raw    : ${fmt(current.totalRaw)}`);
  console.info(`Total gzip   : ${fmt(current.totalGzip)}`);
  console.info('\nTop 15 chunks (by raw size):');
  for (const c of current.chunks.slice(0, 15)) {
    console.info(`  ${fmt(c.rawBytes).padStart(10)} raw / ${fmt(c.gzipBytes).padStart(10)} gzip  ${c.file}`);
  }

  if (existsSync(PREV_REPORT_PATH)) {
    const prevContent = readFileSync(PREV_REPORT_PATH, 'utf-8');
    const prev = JSON.parse(prevContent) as BundleReport;
    const result = compareReports(current, prev);
    console.info('\n=== Comparison vs previous build ===');
    console.info(`Total gzip delta : ${result.totalDeltaPct >= 0 ? '+' : ''}${result.totalDeltaPct.toFixed(2)}%`);
    if (result.chunkRegressions.length > 0) {
      console.error('\n⚠️ Chunk regressions detected:');
      for (const r of result.chunkRegressions) {
        console.error(`  ${r.name}: ${fmt(r.oldSize)} → ${fmt(r.newSize)} (+${r.deltaPct.toFixed(1)}%)`);
      }
    }
    if (result.hasRegression) {
      console.error(`\n❌ Bundle regression > ${REGRESSION_THRESHOLD_PCT}% detected`);
      /* Save current report (overwrite even if regression) */
      writeFileSync(REPORT_PATH, JSON.stringify(current, null, 2));
      process.exit(1);
    } else {
      console.info('\n✅ No significant bundle regression');
    }
  } else {
    console.info('\n(No previous report — skipping comparison)');
  }

  /* Sauvegarder current → prev pour next run */
  if (existsSync(REPORT_PATH)) {
    try {
      renameSync(REPORT_PATH, PREV_REPORT_PATH);
    } catch {
      /* Si rename fail, on copy */
    }
  }
  writeFileSync(REPORT_PATH, JSON.stringify(current, null, 2));
  console.info(`\n📊 Report saved : ${REPORT_PATH}`);
  process.exit(0);
}
