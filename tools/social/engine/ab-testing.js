/**
 * A/B Testing Framework — Statistical significance, auto-promote winners
 * Test titles, thumbnails, descriptions, posting times, niches
 */
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'tools/social/data');
const EXPERIMENTS_FILE = path.join(DATA_DIR, 'experiments.json');

function ensureDir() { fs.mkdirSync(DATA_DIR, { recursive: true }); }
function loadDb() { try { return JSON.parse(fs.readFileSync(EXPERIMENTS_FILE, 'utf-8')); } catch { return { experiments: {} }; } }
function saveDb(db) { ensureDir(); fs.writeFileSync(EXPERIMENTS_FILE, JSON.stringify(db, null, 2)); }

function generateId() { return `exp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`; }

export function createExperiment(name, variants, opts = {}) {
  const db = loadDb();
  const id = generateId();
  db.experiments[id] = {
    id,
    name,
    type: opts.type || 'title',
    status: 'active',
    created: new Date().toISOString(),
    minViewsPerVariant: opts.minViews || 500,
    confidenceTarget: opts.confidence || 0.95,
    autoPromote: opts.autoPromote !== false,
    variants: variants.map((v, i) => ({
      id: `v${i}`,
      label: typeof v === 'string' ? v : v.label,
      data: typeof v === 'string' ? { value: v } : v,
      impressions: 0,
      clicks: 0,
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      watchTime: 0,
      revenue: 0,
    })),
    winner: null,
    conclusion: null,
  };
  saveDb(db);
  return db.experiments[id];
}

export function recordResult(experimentId, variantId, metrics) {
  const db = loadDb();
  const exp = db.experiments[experimentId];
  if (!exp) throw new Error(`Experiment ${experimentId} not found`);
  if (exp.status !== 'active') return exp;
  const variant = exp.variants.find(v => v.id === variantId);
  if (!variant) throw new Error(`Variant ${variantId} not found`);
  variant.impressions += metrics.impressions || 0;
  variant.clicks += metrics.clicks || 0;
  variant.views += metrics.views || 0;
  variant.likes += metrics.likes || 0;
  variant.comments += metrics.comments || 0;
  variant.shares += metrics.shares || 0;
  variant.watchTime += metrics.watchTime || 0;
  variant.revenue += metrics.revenue || 0;
  if (exp.autoPromote) {
    const allReady = exp.variants.every(v => v.views >= exp.minViewsPerVariant);
    if (allReady) {
      const analysis = _analyze(exp);
      if (analysis.significant) {
        exp.status = 'completed';
        exp.winner = analysis.winner.id;
        exp.conclusion = analysis.summary;
        exp.completedAt = new Date().toISOString();
      }
    }
  }
  saveDb(db);
  return exp;
}

function _ctr(v) { return v.impressions > 0 ? v.clicks / v.impressions : 0; }
function _engRate(v) { return v.views > 0 ? (v.likes + v.comments + v.shares) / v.views : 0; }
function _avgWatch(v) { return v.views > 0 ? v.watchTime / v.views : 0; }
function _rpmEff(v) { return v.views > 0 ? (v.revenue / v.views) * 1000 : 0; }

function _zTest(p1, n1, p2, n2) {
  const p = (p1 * n1 + p2 * n2) / (n1 + n2);
  if (p === 0 || p === 1) return 0;
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (se === 0) return 0;
  return (p1 - p2) / se;
}

function _zToConfidence(z) {
  const absZ = Math.abs(z);
  if (absZ >= 3.29) return 0.999;
  if (absZ >= 2.58) return 0.99;
  if (absZ >= 2.33) return 0.98;
  if (absZ >= 1.96) return 0.95;
  if (absZ >= 1.65) return 0.90;
  if (absZ >= 1.28) return 0.80;
  return 0.5 + (absZ / 4);
}

function _analyze(exp) {
  const scored = exp.variants.map(v => ({
    ...v,
    ctr: _ctr(v),
    engagement: _engRate(v),
    avgWatch: _avgWatch(v),
    rpm: _rpmEff(v),
    score: _ctr(v) * 0.3 + _engRate(v) * 0.3 + _rpmEff(v) / 20 * 0.4,
  }));
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const second = scored[1];
  let confidence = 0;
  let significant = false;
  if (best && second && best.impressions > 0 && second.impressions > 0) {
    const z = _zTest(_ctr(best), best.impressions, _ctr(second), second.impressions);
    confidence = _zToConfidence(z);
    significant = confidence >= (exp.confidenceTarget || 0.95);
  }
  return {
    variants: scored,
    winner: best,
    runnerUp: second,
    confidence: +confidence.toFixed(4),
    significant,
    summary: significant
      ? `Winner: "${best.label}" with ${(best.score * 100).toFixed(1)} score vs "${second?.label}" (${(confidence * 100).toFixed(1)}% confidence)`
      : `Inconclusive — need more data (current confidence: ${(confidence * 100).toFixed(1)}%)`,
  };
}

export function analyzeExperiment(experimentId) {
  const db = loadDb();
  const exp = db.experiments[experimentId];
  if (!exp) throw new Error(`Experiment ${experimentId} not found`);
  return _analyze(exp);
}

export function getWinner(experimentId, minConfidence = 0.95) {
  const analysis = analyzeExperiment(experimentId);
  if (analysis.confidence >= minConfidence) return analysis.winner;
  return null;
}

export function listExperiments(status = null) {
  const db = loadDb();
  let exps = Object.values(db.experiments);
  if (status) exps = exps.filter(e => e.status === status);
  return exps.map(e => ({
    id: e.id, name: e.name, type: e.type, status: e.status,
    variants: e.variants.length, winner: e.winner,
    created: e.created, completedAt: e.completedAt,
  }));
}

export function closeExperiment(experimentId, winnerId = null) {
  const db = loadDb();
  const exp = db.experiments[experimentId];
  if (!exp) throw new Error(`Experiment ${experimentId} not found`);
  const analysis = _analyze(exp);
  exp.status = 'completed';
  exp.winner = winnerId || analysis.winner?.id;
  exp.conclusion = winnerId ? `Manually selected winner: ${winnerId}` : analysis.summary;
  exp.completedAt = new Date().toISOString();
  saveDb(db);
  return exp;
}

export function generateExperimentReport(experimentId) {
  const db = loadDb();
  const exp = db.experiments[experimentId];
  if (!exp) throw new Error(`Experiment ${experimentId} not found`);
  const analysis = _analyze(exp);
  const lines = [
    `# A/B Test Report: ${exp.name}`,
    `> Type: ${exp.type} | Status: ${exp.status} | Created: ${exp.created}`,
    '',
    `## Results`,
    `| Variant | Impressions | CTR | Engagement | Avg Watch | RPM | Score |`,
    `|---------|-------------|-----|------------|-----------|-----|-------|`,
  ];
  for (const v of analysis.variants) {
    lines.push(`| ${v.label} | ${v.impressions} | ${(v.ctr * 100).toFixed(2)}% | ${(v.engagement * 100).toFixed(2)}% | ${v.avgWatch.toFixed(0)}s | $${v.rpm.toFixed(2)} | ${(v.score * 100).toFixed(1)} |`);
  }
  lines.push('', `## Conclusion`, `**Confidence**: ${(analysis.confidence * 100).toFixed(1)}%`,
    `**Significant**: ${analysis.significant ? 'YES' : 'NO'}`,
    `**${analysis.summary}**`);
  return lines.join('\n');
}

export function titleTest(titles) {
  return createExperiment(`Title Test: ${titles[0].slice(0, 30)}...`, titles, { type: 'title' });
}

export function thumbnailTest(thumbnailPaths) {
  return createExperiment(`Thumbnail Test`, thumbnailPaths.map((p, i) => ({ label: `Thumb ${i + 1}`, path: p })), { type: 'thumbnail' });
}

export function nicheTest(niches) {
  return createExperiment(`Niche Test`, niches, { type: 'niche', minViews: 1000 });
}

export function postingTimeTest(times) {
  return createExperiment(`Posting Time Test`, times.map(t => ({ label: t, time: t })), { type: 'posting_time' });
}
