/**
 * Analytics & Reporting Engine — Revenue tracking, content analysis, growth trends
 * Stores data in JSON files (no external DB dependency)
 */
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'tools/social/data');
const METRICS_FILE = path.join(DATA_DIR, 'metrics.json');
const GROWTH_FILE = path.join(DATA_DIR, 'growth.json');

const RPM_BY_NICHE = {
  'betrayal':    { min: 8, max: 15, avg: 12.82, currency: 'USD' },
  'revenge':     { min: 7, max: 14, avg: 10.50, currency: 'USD' },
  'mystery':     { min: 6, max: 12, avg: 9.20,  currency: 'USD' },
  'true-crime':  { min: 7, max: 14, avg: 11.00, currency: 'USD' },
  'finance':     { min: 10, max: 20, avg: 15.30, currency: 'USD' },
  'motivation':  { min: 4, max: 8,  avg: 5.80,  currency: 'USD' },
  'tech':        { min: 5, max: 12, avg: 8.40,  currency: 'USD' },
  'education':   { min: 6, max: 14, avg: 9.60,  currency: 'USD' },
  'entertainment': { min: 3, max: 8, avg: 5.20, currency: 'USD' },
};

const PLATFORM_REVENUE = {
  youtube:   { hasAdRevenue: true, rpmMultiplier: 1.0 },
  tiktok:    { hasAdRevenue: true, rpmMultiplier: 0.08 },
  instagram: { hasAdRevenue: false, rpmMultiplier: 0 },
  facebook:  { hasAdRevenue: true, rpmMultiplier: 0.3 },
  twitter:   { hasAdRevenue: true, rpmMultiplier: 0.05 },
};

function ensureDir() { fs.mkdirSync(DATA_DIR, { recursive: true }); }

function loadJson(fpath, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(fpath, 'utf-8')); } catch { return fallback; }
}

function saveJson(fpath, data) {
  ensureDir();
  fs.writeFileSync(fpath, JSON.stringify(data, null, 2));
}

export function recordMetrics(videoId, platform, metrics) {
  const db = loadJson(METRICS_FILE, { videos: {} });
  const key = `${videoId}_${platform}`;
  if (!db.videos[key]) {
    db.videos[key] = { videoId, platform, history: [], created: new Date().toISOString() };
  }
  db.videos[key].history.push({
    ts: new Date().toISOString(),
    views: metrics.views || 0,
    likes: metrics.likes || 0,
    comments: metrics.comments || 0,
    shares: metrics.shares || 0,
    watchTime: metrics.watchTime || 0,
    subscribers: metrics.subscribers || 0,
  });
  if (metrics.niche) db.videos[key].niche = metrics.niche;
  if (metrics.title) db.videos[key].title = metrics.title;
  if (metrics.tags) db.videos[key].tags = metrics.tags;
  if (metrics.duration) db.videos[key].duration = metrics.duration;
  if (metrics.publishedAt) db.videos[key].publishedAt = metrics.publishedAt;
  saveJson(METRICS_FILE, db);
  return db.videos[key];
}

export function recordGrowth(platform, followers) {
  const db = loadJson(GROWTH_FILE, { platforms: {} });
  if (!db.platforms[platform]) db.platforms[platform] = [];
  db.platforms[platform].push({
    ts: new Date().toISOString(),
    followers,
  });
  if (db.platforms[platform].length > 730) {
    db.platforms[platform] = db.platforms[platform].slice(-365);
  }
  saveJson(GROWTH_FILE, db);
}

function getLatestMetrics(entry) {
  return entry.history?.length ? entry.history[entry.history.length - 1] : {};
}

function engagementRate(m) {
  if (!m.views || m.views === 0) return 0;
  return ((m.likes + m.comments + m.shares) / m.views * 100);
}

function estimateRevenue(views, niche, platform) {
  const rpm = RPM_BY_NICHE[niche] || RPM_BY_NICHE['entertainment'];
  const platMult = PLATFORM_REVENUE[platform]?.rpmMultiplier || 0;
  return (views / 1000) * rpm.avg * platMult;
}

export function getTopVideos(n = 10, metric = 'views') {
  const db = loadJson(METRICS_FILE, { videos: {} });
  const entries = Object.values(db.videos).map(v => {
    const m = getLatestMetrics(v);
    return { ...v, latest: m, engagement: engagementRate(m),
      revenue: estimateRevenue(m.views || 0, v.niche, v.platform) };
  });
  const sortKey = metric === 'engagement' ? 'engagement' : metric === 'revenue' ? 'revenue' : `latest.${metric}`;
  entries.sort((a, b) => {
    const av = metric === 'engagement' ? a.engagement : metric === 'revenue' ? a.revenue : (a.latest?.[metric] || 0);
    const bv = metric === 'engagement' ? b.engagement : metric === 'revenue' ? b.revenue : (b.latest?.[metric] || 0);
    return bv - av;
  });
  return entries.slice(0, n);
}

export function getNichePerformance() {
  const db = loadJson(METRICS_FILE, { videos: {} });
  const niches = {};
  for (const v of Object.values(db.videos)) {
    const niche = v.niche || 'unknown';
    if (!niches[niche]) niches[niche] = { videos: 0, totalViews: 0, totalLikes: 0, totalRevenue: 0, engagements: [] };
    const m = getLatestMetrics(v);
    niches[niche].videos++;
    niches[niche].totalViews += m.views || 0;
    niches[niche].totalLikes += m.likes || 0;
    niches[niche].totalRevenue += estimateRevenue(m.views || 0, niche, v.platform);
    niches[niche].engagements.push(engagementRate(m));
  }
  for (const [k, n] of Object.entries(niches)) {
    n.avgViews = n.videos ? Math.round(n.totalViews / n.videos) : 0;
    n.avgEngagement = n.engagements.length ? +(n.engagements.reduce((a, b) => a + b, 0) / n.engagements.length).toFixed(2) : 0;
    n.rpm = RPM_BY_NICHE[k] || null;
    delete n.engagements;
  }
  return niches;
}

export function getPlatformComparison() {
  const db = loadJson(METRICS_FILE, { videos: {} });
  const platforms = {};
  for (const v of Object.values(db.videos)) {
    const p = v.platform || 'unknown';
    if (!platforms[p]) platforms[p] = { videos: 0, totalViews: 0, totalLikes: 0, totalRevenue: 0 };
    const m = getLatestMetrics(v);
    platforms[p].videos++;
    platforms[p].totalViews += m.views || 0;
    platforms[p].totalLikes += m.likes || 0;
    platforms[p].totalRevenue += estimateRevenue(m.views || 0, v.niche, p);
  }
  for (const n of Object.values(platforms)) {
    n.avgViews = n.videos ? Math.round(n.totalViews / n.videos) : 0;
    n.revenuePerVideo = n.videos ? +(n.totalRevenue / n.videos).toFixed(2) : 0;
  }
  return platforms;
}

export function getGrowthTrend(days = 30) {
  const db = loadJson(GROWTH_FILE, { platforms: {} });
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const trends = {};
  for (const [platform, history] of Object.entries(db.platforms)) {
    trends[platform] = history
      .filter(h => h.ts >= cutoff)
      .map(h => ({ date: h.ts.slice(0, 10), followers: h.followers }));
  }
  return trends;
}

export function getRevenueEstimate(period = 'monthly') {
  const db = loadJson(METRICS_FILE, { videos: {} });
  let totalRevenue = 0;
  let totalViews = 0;
  const cutoff = period === 'daily' ? 1 : period === 'weekly' ? 7 : 30;
  const since = new Date(Date.now() - cutoff * 86400000).toISOString();
  for (const v of Object.values(db.videos)) {
    const recent = (v.history || []).filter(h => h.ts >= since);
    if (recent.length === 0) continue;
    const latest = recent[recent.length - 1];
    const earliest = recent[0];
    const periodViews = (latest.views || 0) - (earliest.views || 0);
    totalViews += periodViews;
    totalRevenue += estimateRevenue(periodViews, v.niche, v.platform);
  }
  return {
    period,
    days: cutoff,
    totalViews,
    estimatedRevenue: +totalRevenue.toFixed(2),
    currency: 'USD',
    projectedAnnual: +(totalRevenue * (365 / cutoff)).toFixed(2),
  };
}

export function getRecommendations() {
  const niches = getNichePerformance();
  const platforms = getPlatformComparison();
  const recs = [];
  const nicheArr = Object.entries(niches).sort((a, b) => b[1].avgViews - a[1].avgViews);
  if (nicheArr.length > 0) {
    const [topNiche, topData] = nicheArr[0];
    recs.push({ type: 'niche', priority: 'high',
      message: `Double down on "${topNiche}" — avg ${topData.avgViews} views, ${topData.avgEngagement}% engagement` });
  }
  if (nicheArr.length > 1) {
    const [worstNiche, worstData] = nicheArr[nicheArr.length - 1];
    if (worstData.avgViews < 100) {
      recs.push({ type: 'niche', priority: 'medium',
        message: `Consider dropping "${worstNiche}" — only ${worstData.avgViews} avg views` });
    }
  }
  const platArr = Object.entries(platforms).sort((a, b) => b[1].revenuePerVideo - a[1].revenuePerVideo);
  if (platArr.length > 0) {
    const [topPlat, topPData] = platArr[0];
    recs.push({ type: 'platform', priority: 'high',
      message: `"${topPlat}" is your best revenue platform — $${topPData.revenuePerVideo}/video` });
  }
  for (const [niche, data] of Object.entries(niches)) {
    if (data.avgEngagement > 8) {
      recs.push({ type: 'content', priority: 'high',
        message: `"${niche}" has ${data.avgEngagement}% engagement — create more content here` });
    }
  }
  const bestRpm = Object.entries(RPM_BY_NICHE).sort((a, b) => b[1].avg - a[1].avg);
  const tried = new Set(Object.keys(niches));
  for (const [niche, rpm] of bestRpm) {
    if (!tried.has(niche)) {
      recs.push({ type: 'opportunity', priority: 'medium',
        message: `Untapped niche: "${niche}" — avg RPM $${rpm.avg} (${rpm.min}-${rpm.max})` });
      break;
    }
  }
  return recs;
}

export function generateReport(period = 'weekly') {
  return {
    generatedAt: new Date().toISOString(),
    period,
    topVideos: getTopVideos(10, 'views'),
    nichePerformance: getNichePerformance(),
    platformComparison: getPlatformComparison(),
    revenue: getRevenueEstimate(period),
    growth: getGrowthTrend(period === 'daily' ? 7 : period === 'weekly' ? 30 : 90),
    recommendations: getRecommendations(),
  };
}

export function exportMarkdown(report) {
  const lines = [
    `# Social Media Analytics Report`,
    `> Generated: ${report.generatedAt}`,
    `> Period: ${report.period}`,
    '',
    `## Revenue Estimate`,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total Views | ${report.revenue.totalViews.toLocaleString()} |`,
    `| Est. Revenue | $${report.revenue.estimatedRevenue} |`,
    `| Projected Annual | $${report.revenue.projectedAnnual} |`,
    '',
    `## Top Videos`,
    `| # | Title | Platform | Views | Engagement | Revenue |`,
    `|---|-------|----------|-------|------------|---------|`,
  ];
  (report.topVideos || []).forEach((v, i) => {
    const m = v.latest || {};
    lines.push(`| ${i + 1} | ${v.title || v.videoId} | ${v.platform} | ${(m.views || 0).toLocaleString()} | ${v.engagement.toFixed(1)}% | $${v.revenue.toFixed(2)} |`);
  });
  lines.push('', `## Niche Performance`, `| Niche | Videos | Avg Views | Avg Engagement | Revenue |`, `|-------|--------|-----------|----------------|---------|`);
  for (const [niche, d] of Object.entries(report.nichePerformance || {})) {
    lines.push(`| ${niche} | ${d.videos} | ${d.avgViews.toLocaleString()} | ${d.avgEngagement}% | $${d.totalRevenue.toFixed(2)} |`);
  }
  lines.push('', `## Recommendations`);
  for (const r of report.recommendations || []) {
    lines.push(`- **[${r.priority.toUpperCase()}]** ${r.message}`);
  }
  return lines.join('\n');
}

export function exportCsv(report) {
  const rows = ['videoId,platform,title,niche,views,likes,comments,shares,engagement,revenue'];
  for (const v of report.topVideos || []) {
    const m = v.latest || {};
    rows.push([v.videoId, v.platform, `"${(v.title || '').replace(/"/g, '""')}"`,
      v.niche || '', m.views || 0, m.likes || 0, m.comments || 0, m.shares || 0,
      v.engagement.toFixed(2), v.revenue.toFixed(2)].join(','));
  }
  return rows.join('\n');
}

export function exportHtml(report) {
  const md = exportMarkdown(report);
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Analytics Dashboard</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Inter,system-ui,sans-serif;background:#0a0a12;color:#e0e0e0;padding:2rem;max-width:1200px;margin:auto}
h1{color:#d4af37;margin-bottom:1rem}h2{color:#d4af37;margin:2rem 0 1rem;border-bottom:1px solid #333;padding-bottom:.5rem}
blockquote{color:#888;margin:.5rem 0;padding:.5rem;border-left:3px solid #d4af37}
table{width:100%;border-collapse:collapse;margin:1rem 0}
th,td{padding:.5rem .75rem;text-align:left;border-bottom:1px solid #222}
th{background:#1a1a2e;color:#d4af37;font-weight:600}
tr:hover{background:#111122}
ul{margin:.5rem 0;padding-left:1.5rem}
li{margin:.3rem 0}
strong{color:#ffd700}
</style></head><body>
<pre style="white-space:pre-wrap">${md.replace(/</g,'&lt;')}</pre>
</body></html>`;
}

export { RPM_BY_NICHE, PLATFORM_REVENUE };
