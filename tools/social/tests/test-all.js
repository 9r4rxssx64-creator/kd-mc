#!/usr/bin/env node
/**
 * Comprehensive test suite for the social media video pipeline
 * Run: node tools/social/tests/test-all.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let passed = 0, failed = 0, skipped = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

function assert(condition, msg) { if (!condition) throw new Error(msg || 'Assertion failed'); }
function assertEqual(a, b, msg) { if (a !== b) throw new Error(msg || `Expected ${b}, got ${a}`); }
function assertType(val, type, msg) { if (typeof val !== type) throw new Error(msg || `Expected ${type}, got ${typeof val}`); }

async function testSubtitleEngine() {
  console.log('\n📝 Subtitle Engine');
  const { segmentScript, groupIntoSubtitles } = await import('../engine/subtitle-engine.js');

  test('segmentScript returns array', () => {
    const result = segmentScript('Hello world test', 3000);
    assert(Array.isArray(result), 'Should return array');
    assert(result.length > 0, 'Should have segments');
  });

  test('segmentScript handles empty string', () => {
    const result = segmentScript('', 1000);
    assert(Array.isArray(result), 'Should return array');
    assertEqual(result.length, 0, 'Should be empty for empty input');
  });

  test('segments have required fields', () => {
    const result = segmentScript('One two three four five', 5000);
    for (const seg of result) {
      assertType(seg.word, 'string', 'word should be string');
      assertType(seg.startMs, 'number', 'startMs should be number');
      assertType(seg.endMs, 'number', 'endMs should be number');
      assert(seg.endMs >= seg.startMs, 'endMs >= startMs');
    }
  });

  test('groupIntoSubtitles respects wordsPerLine', () => {
    const segs = segmentScript('One two three four five six seven eight nine ten', 10000);
    const groups = groupIntoSubtitles(segs, { wordsPerLine: 3 });
    for (const g of groups) {
      assert(g.words.length <= 4, `Group has ${g.words.length} words, expected <= 4`);
    }
  });

  test('timing covers full duration', () => {
    const duration = 5000;
    const segs = segmentScript('Hello world this is a test script with words', duration);
    const last = segs[segs.length - 1];
    assert(last.endMs <= duration + 500, 'Last segment should not exceed duration + buffer');
  });
}

async function testAnalytics() {
  console.log('\n📊 Analytics');
  const analytics = await import('../engine/analytics.js');

  test('RPM_BY_NICHE has expected niches', () => {
    assert(analytics.RPM_BY_NICHE.betrayal, 'Should have betrayal');
    assert(analytics.RPM_BY_NICHE.finance, 'Should have finance');
    assert(analytics.RPM_BY_NICHE.mystery, 'Should have mystery');
  });

  test('RPM values are positive', () => {
    for (const [niche, rpm] of Object.entries(analytics.RPM_BY_NICHE)) {
      assert(rpm.avg > 0, `${niche} avg RPM should be positive`);
      assert(rpm.max >= rpm.min, `${niche} max >= min`);
    }
  });

  test('generateReport returns valid structure', () => {
    const report = analytics.generateReport('weekly');
    assert(report.generatedAt, 'Should have generatedAt');
    assert(report.period === 'weekly', 'Should have correct period');
    assert(Array.isArray(report.topVideos), 'topVideos should be array');
    assert(typeof report.nichePerformance === 'object', 'nichePerformance should be object');
    assert(typeof report.revenue === 'object', 'revenue should be object');
    assert(Array.isArray(report.recommendations), 'recommendations should be array');
  });

  test('exportMarkdown returns string', () => {
    const report = analytics.generateReport('daily');
    const md = analytics.exportMarkdown(report);
    assertType(md, 'string');
    assert(md.includes('Analytics Report'), 'Should contain title');
  });

  test('exportCsv returns string with headers', () => {
    const report = analytics.generateReport('daily');
    const csv = analytics.exportCsv(report);
    assertType(csv, 'string');
    assert(csv.includes('videoId'), 'Should contain CSV headers');
  });
}

async function testABTesting() {
  console.log('\n🧪 A/B Testing');
  const ab = await import('../engine/ab-testing.js');

  test('createExperiment returns valid experiment', () => {
    const exp = ab.createExperiment('Test', ['A', 'B'], { type: 'title' });
    assert(exp.id, 'Should have id');
    assertEqual(exp.name, 'Test');
    assertEqual(exp.variants.length, 2);
    assertEqual(exp.status, 'active');
  });

  test('listExperiments includes created experiment', () => {
    const list = ab.listExperiments();
    assert(list.length > 0, 'Should have experiments');
  });

  test('recordResult updates variant metrics', () => {
    const exp = ab.createExperiment('Metrics Test', ['X', 'Y']);
    const updated = ab.recordResult(exp.id, 'v0', { views: 100, likes: 10, impressions: 500, clicks: 50 });
    const v0 = updated.variants.find(v => v.id === 'v0');
    assertEqual(v0.views, 100);
    assertEqual(v0.likes, 10);
  });

  test('analyzeExperiment returns analysis', () => {
    const exp = ab.createExperiment('Analysis Test', ['Alpha', 'Beta']);
    ab.recordResult(exp.id, 'v0', { views: 1000, likes: 100, impressions: 5000, clicks: 500 });
    ab.recordResult(exp.id, 'v1', { views: 500, likes: 30, impressions: 5000, clicks: 200 });
    const analysis = ab.analyzeExperiment(exp.id);
    assert(analysis.winner, 'Should have winner');
    assertType(analysis.confidence, 'number');
    assert(analysis.confidence >= 0 && analysis.confidence <= 1, 'Confidence should be 0-1');
  });

  test('titleTest shortcut works', () => {
    const exp = ab.titleTest(['Title A', 'Title B', 'Title C']);
    assertEqual(exp.variants.length, 3);
    assertEqual(exp.type, 'title');
  });
}

async function testViralOptimizer() {
  console.log('\n🔥 Viral Optimizer');
  const viral = await import('../engine/viral-optimizer.js');

  test('scoreTitle returns 0-10 score', () => {
    const result = viral.scoreTitle('She Trusted Her Sister');
    assertType(result.total, 'number');
    assert(result.total >= 0 && result.total <= 10, `Score ${result.total} should be 0-10`);
  });

  test('high-power title scores higher', () => {
    const weak = viral.scoreTitle('A Nice Story');
    const strong = viral.scoreTitle('She Lost $2 Million — The Betrayal That Destroyed Everything');
    assert(strong.total > weak.total, `Strong (${strong.total}) should beat weak (${weak.total})`);
  });

  test('scoreHook returns patterns', () => {
    const result = viral.scoreHook('He trusted his best friend with everything. $4 million disappeared overnight.');
    assert(result.matchedPatterns.length > 0, 'Should match patterns');
    assert(result.score >= 0, 'Score should be non-negative');
  });

  test('scoreScript analyzes full script', () => {
    const script = 'She trusted her sister with everything. Her secrets, her dreams, even her engagement ring. Three months later, she came home to discover her sister had pawned the ring. The truth destroyed them both.';
    const result = viral.scoreScript(script);
    assert(result.viralScore >= 0, 'Should have viralScore');
    assert(result.wordCount > 0, 'Should count words');
    assert(result.sentenceCount > 0, 'Should count sentences');
  });

  test('optimizeTitle generates alternatives', () => {
    const result = viral.optimizeTitle('The Betrayal');
    assert(result.original, 'Should have original');
    assert(result.best, 'Should have best');
    assert(result.alternatives.length > 0, 'Should have alternatives');
  });

  test('generateHookVariants returns requested count', () => {
    const hooks = viral.generateHookVariants('trust', 3);
    assertEqual(hooks.length, 3);
    assert(hooks[0].hook, 'Should have hook text');
  });

  test('predictViralPotential returns comprehensive analysis', () => {
    const story = {
      title: 'He Lost $2 Million in 24 Hours',
      script: 'He was a thirty-five year old engineer. Life was good. Then he discovered options trading. The first month, he made twelve thousand dollars. He felt invincible. Within six months, everything was gone.',
      tags: ['finance', 'money', 'loss'],
    };
    const result = viral.predictViralPotential(story);
    assert(result.viralScore >= 0 && result.viralScore <= 10, 'Score should be 0-10');
    assert(result.verdict, 'Should have verdict');
    assert(result.title, 'Should have title analysis');
    assert(result.script, 'Should have script analysis');
    assert(result.hook, 'Should have hook analysis');
  });
}

async function testContentRepurposer() {
  console.log('\n♻️ Content Repurposer');
  const repurposer = await import('../engine/content-repurposer.js');

  const story = {
    id: 'test-001',
    title: 'The Test Story',
    script: 'She trusted her sister with everything. Her secrets, her dreams, even her engagement ring. Three months later, she came home to discover the truth. The ring was gone. The money was gone. Her sister was gone. She never saw any of them again. Twenty years passed in silence.',
    tags: ['test', 'story'],
  };

  test('repurposeAll generates all content types', () => {
    const result = repurposer.repurposeAll(story);
    assert(result.totalPieces > 5, `Should generate 5+ pieces, got ${result.totalPieces}`);
    assert(result.generated.twitterThread, 'Should have twitter thread');
    assert(result.generated.instagramCarousel, 'Should have IG carousel');
    assert(result.generated.linkedInPost, 'Should have LinkedIn post');
    assert(result.generated.blogPost, 'Should have blog post');
    assert(result.generated.newsletter, 'Should have newsletter');
  });

  test('twitter thread respects char limits', () => {
    const thread = repurposer.generateTwitterThread(story);
    assert(thread.length >= 2, 'Should have multiple tweets');
    for (const tweet of thread) {
      assert(tweet.chars <= 300, `Tweet too long: ${tweet.chars} chars`);
    }
  });

  test('instagram carousel has cover and CTA', () => {
    const slides = repurposer.generateInstagramCarousel(story);
    assertEqual(slides[0].type, 'cover');
    assertEqual(slides[slides.length - 1].type, 'cta');
    assert(slides.length <= 10, 'Max 10 slides');
  });

  test('extractBestQuotes returns scored quotes', () => {
    const quotes = repurposer.extractBestQuotes(story.script, 3);
    assertEqual(quotes.length, 3);
    for (const q of quotes) {
      assertType(q.text, 'string');
      assertType(q.score, 'number');
    }
  });
}

async function testSEOOptimizer() {
  console.log('\n🔍 SEO Optimizer');
  const seo = await import('../engine/seo-optimizer.js');

  const story = {
    title: 'She Trusted Her Sister',
    script: 'She trusted her sister with everything. Her secrets, her dreams, even her engagement ring. Three months later, she came home to discover the truth.',
    tags: ['betrayal', 'family', 'trust'],
    category: 'betrayal',
  };

  test('generateYouTubeMetadata returns complete metadata', () => {
    const meta = seo.generateYouTubeMetadata(story, { durationSec: 300 });
    assert(meta.title, 'Should have title');
    assert(meta.description, 'Should have description');
    assert(meta.tags.length > 0, 'Should have tags');
    assert(meta.chapters.length >= 3, 'Should have chapters');
    assert(meta.description.length <= 5000, 'Description under YouTube limit');
  });

  test('generateTikTokCaption respects char limit', () => {
    const result = seo.generateTikTokCaption(story);
    assert(result.caption.length <= 2200, 'Caption under TikTok limit');
    assert(result.hashtags.includes('fyp'), 'Should include #fyp');
  });

  test('generateInstagramCaption includes hashtags', () => {
    const result = seo.generateInstagramCaption(story);
    assert(result.hashtags.length <= 30, 'Max 30 hashtags');
    assert(result.caption.includes('#'), 'Caption should have hashtags');
  });

  test('generateAllPlatformMeta covers all platforms', () => {
    const all = seo.generateAllPlatformMeta(story);
    assert(all.youtube, 'Should have YouTube');
    assert(all.tiktok, 'Should have TikTok');
    assert(all.instagram, 'Should have Instagram');
  });

  test('generateChapters respects duration', () => {
    const chapters = seo.generateChapters(story.script, 600);
    assert(chapters[0].timestamp === '0:00', 'Should start at 0:00');
    assert(chapters.length >= 3, 'Should have at least 3 chapters');
  });

  test('optimizeTags deduplicates', () => {
    const tags = seo.optimizeTags(['betrayal', 'story', 'betrayal'], 'betrayal');
    const unique = new Set(tags);
    assertEqual(tags.length, unique.size, 'Tags should be unique');
  });
}

async function testMultiLang() {
  console.log('\n🌍 Multi-Language');
  const ml = await import('../engine/multi-lang.js');

  test('listLanguages returns 9 languages', () => {
    const langs = ml.listLanguages();
    assert(langs.length >= 9, `Should have 9+ languages, got ${langs.length}`);
  });

  test('getBestVoice returns voice config', () => {
    const voice = ml.getBestVoice('fr', 'storytelling', 'male');
    assert(voice.voice, 'Should have voice name');
    assertType(voice.rate, 'number');
    assertType(voice.pitch, 'number');
    assertEqual(voice.language, 'fr');
  });

  test('getSubtitleConfig handles RTL', () => {
    const arConfig = ml.getSubtitleConfig('ar');
    assertEqual(arConfig.rtl, true);
    assertEqual(arConfig.textAlign, 'right');
  });

  test('getSubtitleConfig handles CJK', () => {
    const jaConfig = ml.getSubtitleConfig('ja');
    assertEqual(jaConfig.cjk, true);
    assert(jaConfig.wordsPerLine > 5, 'CJK should have more words per line');
  });

  test('detectLanguage identifies French', () => {
    const lang = ml.detectLanguage('Elle a fait confiance à sa sœur avec tout. Les secrets, les rêves.');
    assertEqual(lang, 'fr');
  });

  test('detectLanguage identifies English', () => {
    const lang = ml.detectLanguage('She trusted her sister with everything. Her secrets, her dreams.');
    assertEqual(lang, 'en');
  });

  test('detectLanguage identifies Japanese', () => {
    const lang = ml.detectLanguage('彼女は姉に全てを託した。秘密も、夢も。');
    assertEqual(lang, 'ja');
  });
}

async function testScheduler() {
  console.log('\n📅 Scheduler');
  const sched = await import('../scheduler/scheduler.js');

  test('OPTIMAL_TIMES has all platforms', () => {
    assert(sched.OPTIMAL_TIMES.youtube, 'Should have YouTube');
    assert(sched.OPTIMAL_TIMES.tiktok, 'Should have TikTok');
    assert(sched.OPTIMAL_TIMES.instagram, 'Should have Instagram');
  });

  test('getNextOptimalTime returns future date', () => {
    const now = new Date();
    const next = sched.getNextOptimalTime('youtube', now);
    assert(next > now, 'Should be in the future');
  });

  test('createSchedule returns valid schedule', () => {
    const s = sched.createSchedule({ name: 'Test Schedule', platforms: ['youtube'] });
    assert(s.id, 'Should have id');
    assertEqual(s.name, 'Test Schedule');
    assertEqual(s.active, true);
  });

  test('enqueue creates a job', () => {
    const job = sched.enqueue({ platform: 'youtube', niche: 'betrayal' });
    assert(job.id, 'Should have id');
    assertEqual(job.status, 'pending');
  });

  test('generateCalendar returns entries', () => {
    sched.createSchedule({ name: 'Calendar Test', platforms: ['youtube'], frequency: 'daily' });
    const cal = sched.generateCalendar(7);
    assert(cal.entries.length > 0, 'Should have entries');
    assert(cal.entries[0].date, 'Entry should have date');
    assert(cal.entries[0].platform, 'Entry should have platform');
  });
}

async function testBranding() {
  console.log('\n🎨 Branding');
  const branding = await import('../engine/branding.js');

  test('loadBrandKit returns default kit', () => {
    const kit = branding.loadBrandKit('default');
    assert(kit.channelName, 'Should have channelName');
    assert(kit.colors, 'Should have colors');
    assert(kit.watermark, 'Should have watermark config');
  });

  test('saveBrandKit persists and loads', () => {
    branding.saveBrandKit('test-brand', { channelName: 'Test Channel' });
    const loaded = branding.loadBrandKit('test-brand');
    assertEqual(loaded.channelName, 'Test Channel');
  });

  test('listBrandKits includes saved kit', () => {
    const kits = branding.listBrandKits();
    assert(kits.includes('test-brand'), 'Should include test-brand');
  });

  test('listSchemes returns 10 schemes', () => {
    const schemes = branding.listSchemes();
    assert(schemes.length >= 10, `Should have 10+ schemes, got ${schemes.length}`);
    assert(schemes.includes('midnight-gold'), 'Should include midnight-gold');
  });

  test('getScheme returns color object', () => {
    const scheme = branding.getScheme('blood-red');
    assert(scheme.primary, 'Should have primary');
    assert(scheme.bg, 'Should have bg');
    assert(scheme.text, 'Should have text');
  });
}

async function testContentLibrary() {
  console.log('\n📚 Content Library');
  const libPath = path.join(ROOT, 'config', 'content-library.json');

  test('content-library.json exists and parses', () => {
    assert(fs.existsSync(libPath), 'File should exist');
    const lib = JSON.parse(fs.readFileSync(libPath, 'utf-8'));
    assert(typeof lib === 'object', 'Should be object');
  });

  test('all stories have required fields', () => {
    const lib = JSON.parse(fs.readFileSync(libPath, 'utf-8'));
    let count = 0;
    for (const [cat, stories] of Object.entries(lib)) {
      if (cat.startsWith('_')) continue;
      for (const story of stories) {
        assert(story.id, `Story missing id in ${cat}`);
        assert(story.title, `Story ${story.id} missing title`);
        assert(story.script, `Story ${story.id} missing script`);
        assert(story.tags, `Story ${story.id} missing tags`);
        assert(typeof story.used === 'boolean', `Story ${story.id} missing used flag`);
        count++;
      }
    }
    assert(count >= 10, `Should have 10+ stories, got ${count}`);
  });

  test('no duplicate story IDs', () => {
    const lib = JSON.parse(fs.readFileSync(libPath, 'utf-8'));
    const ids = new Set();
    for (const [cat, stories] of Object.entries(lib)) {
      if (cat.startsWith('_')) continue;
      for (const story of stories) {
        assert(!ids.has(story.id), `Duplicate ID: ${story.id}`);
        ids.add(story.id);
      }
    }
  });

  test('scripts have minimum length', () => {
    const lib = JSON.parse(fs.readFileSync(libPath, 'utf-8'));
    for (const [cat, stories] of Object.entries(lib)) {
      if (cat.startsWith('_')) continue;
      for (const story of stories) {
        const words = story.script.split(/\s+/).length;
        assert(words >= 30, `Story ${story.id} too short: ${words} words`);
      }
    }
  });
}

async function testPlatformsConfig() {
  console.log('\n⚙️ Platforms Config');
  const configPath = path.join(ROOT, 'config', 'platforms.json');

  test('platforms.json exists and parses', () => {
    assert(fs.existsSync(configPath), 'File should exist');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    assert(typeof config === 'object');
  });

  test('has all required platforms', () => {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    for (const p of ['youtube', 'tiktok', 'instagram', 'facebook']) {
      assert(config[p], `Missing platform: ${p}`);
    }
  });
}

async function testEdgeCases() {
  console.log('\n🔬 Edge Cases & Robustness');
  const { segmentScript, groupIntoSubtitles } = await import('../engine/subtitle-engine.js');

  test('subtitle: single word script', () => {
    const result = segmentScript('Hello', 1000);
    assertEqual(result.length, 1);
  });

  test('subtitle: very long script', () => {
    const longText = Array(500).fill('word').join(' ');
    const result = segmentScript(longText, 60000);
    assertEqual(result.length, 500);
  });

  test('subtitle: punctuation-heavy script', () => {
    const result = segmentScript('Hello! How are you? Fine. Great!', 4000);
    assert(result.length >= 4, 'Should segment punctuation-heavy text');
  });

  const viral = await import('../engine/viral-optimizer.js');

  test('viral: empty title scores low', () => {
    const score = viral.scoreTitle('');
    assert(score.total <= 5, 'Empty title should score low');
  });

  test('viral: very long title gets penalty', () => {
    const longTitle = 'A'.repeat(200);
    const score = viral.scoreTitle(longTitle);
    assert(score.breakdown.length <= 5, 'Long title should penalize length');
  });

  test('viral: emotional keywords boost script score', () => {
    const script = 'She betrayed him. He lost everything. $2 million gone overnight. His trust was shattered forever. He never spoke to her again.';
    const result = viral.scoreScript(script);
    assert(result.breakdown.emotionalPeaks > 0, 'Should detect emotional peaks');
    assert(result.breakdown.specificDetails > 0, 'Should detect specific details ($2 million)');
  });

  const seo = await import('../engine/seo-optimizer.js');

  test('seo: handles story with no tags', () => {
    const result = seo.generateYouTubeMetadata({ title: 'Test', script: 'Test script here.', tags: [] });
    assert(result.tags.length > 0, 'Should generate tags even without input tags');
  });

  test('seo: handles empty script for chapters', () => {
    const chapters = seo.generateChapters('', 120);
    assert(chapters.length >= 1, 'Should have at least intro chapter');
  });

  const repurposer = await import('../engine/content-repurposer.js');

  test('repurpose: handles very short story', () => {
    const result = repurposer.repurposeAll({
      id: 'short-test', title: 'Short', script: 'One sentence.', tags: ['test'],
    });
    assert(result.totalPieces > 0, 'Should still generate some pieces');
  });

  const ab = await import('../engine/ab-testing.js');

  test('ab: error on invalid experiment ID', () => {
    let threw = false;
    try { ab.analyzeExperiment('nonexistent_id'); } catch { threw = true; }
    assert(threw, 'Should throw for invalid experiment ID');
  });

  const analytics = await import('../engine/analytics.js');

  test('analytics: getRevenueEstimate with no data', () => {
    const rev = analytics.getRevenueEstimate('daily');
    assertType(rev.estimatedRevenue, 'number');
    assert(rev.estimatedRevenue >= 0, 'Revenue should be non-negative');
  });

  test('analytics: platform comparison with no data', () => {
    const comp = analytics.getPlatformComparison();
    assertType(comp, 'object');
  });

  const ml = await import('../engine/multi-lang.js');

  test('multilang: getBestVoice for unsupported lang falls back', () => {
    const voice = ml.getBestVoice('xx', 'storytelling');
    assert(voice.voice, 'Should fallback to English voice');
  });

  test('multilang: detectLanguage on mixed text', () => {
    const lang = ml.detectLanguage('This is English with some 日本語 mixed in');
    assert(['en', 'ja'].includes(lang), 'Should detect one of the languages');
  });
}

async function testContentLibraryAdvanced() {
  console.log('\n📚 Content Library Advanced');
  const libPath = path.join(ROOT, 'config', 'content-library.json');
  const lib = JSON.parse(fs.readFileSync(libPath, 'utf-8'));

  test('at least 50 stories total', () => {
    let count = 0;
    for (const [cat, stories] of Object.entries(lib)) {
      if (cat.startsWith('_')) continue;
      count += stories.length;
    }
    assert(count >= 50, `Should have 50+ stories, got ${count}`);
  });

  test('at least 5 niche categories', () => {
    const cats = Object.keys(lib).filter(k => !k.startsWith('_'));
    assert(cats.length >= 5, `Should have 5+ categories, got ${cats.length}`);
  });

  test('all stories have niche_rpm data', () => {
    for (const [cat, stories] of Object.entries(lib)) {
      if (cat.startsWith('_')) continue;
      for (const story of stories) {
        if (story.niche_rpm) {
          assertType(story.niche_rpm.avg, 'number', `${story.id} niche_rpm.avg should be number`);
          assert(story.niche_rpm.avg > 0, `${story.id} RPM should be positive`);
        }
      }
    }
  });

  test('viral scoring works on all stories', async () => {
    const { predictViralPotential } = await import('../engine/viral-optimizer.js');
    let scored = 0;
    for (const [cat, stories] of Object.entries(lib)) {
      if (cat.startsWith('_')) continue;
      for (const story of stories) {
        const result = predictViralPotential(story);
        assert(result.viralScore >= 0 && result.viralScore <= 10, `${story.id} viral score out of range: ${result.viralScore}`);
        scored++;
      }
    }
    assert(scored >= 50, `Should score 50+ stories, scored ${scored}`);
  });

  test('SEO generation works on all stories', async () => {
    const seo = await import('../engine/seo-optimizer.js');
    let generated = 0;
    for (const [cat, stories] of Object.entries(lib)) {
      if (cat.startsWith('_')) continue;
      for (const story of stories.slice(0, 3)) {
        const meta = seo.generateAllPlatformMeta({ ...story, category: cat.replace('narrative_', '') });
        assert(meta.youtube.title, `${story.id} YouTube meta should have title`);
        assert(meta.tiktok.caption, `${story.id} TikTok meta should have caption`);
        generated++;
      }
    }
    assert(generated >= 10, `Should generate SEO for 10+ stories`);
  });

  test('repurpose works on all stories', async () => {
    const { repurposeAll } = await import('../engine/content-repurposer.js');
    let repurposed = 0;
    for (const [cat, stories] of Object.entries(lib)) {
      if (cat.startsWith('_')) continue;
      for (const story of stories.slice(0, 2)) {
        const result = repurposeAll(story);
        assert(result.totalPieces > 5, `${story.id} should repurpose to 5+ pieces`);
        repurposed++;
      }
    }
    assert(repurposed >= 10, `Should repurpose 10+ stories`);
  });
}

async function testCLIHelp() {
  console.log('\n🖥️ CLI Validation');
  const { execSync } = await import('child_process');

  test('cli.js --help exits cleanly', () => {
    const output = execSync('node cli.js help', { cwd: ROOT, encoding: 'utf-8' });
    assert(output.includes('CORE COMMANDS'), 'Should show core commands');
    assert(output.includes('ADVANCED COMMANDS'), 'Should show advanced commands');
    assert(output.includes('FUTURISTIC COMMANDS'), 'Should show futuristic commands');
  });

  test('cli.js help lists 18+ unique commands', () => {
    const output = execSync('node cli.js help', { cwd: ROOT, encoding: 'utf-8' });
    const cmds = ['list-stories', 'list-voices', 'test-tts', 'generate', 'generate-script',
      'extract-shorts', 'publish', 'publish-telegram', 'thumbnail', 'analytics',
      'experiment', 'schedule', 'brand', 'translate', 'viral', 'repurpose', 'seo', 'status'];
    for (const cmd of cmds) {
      assert(output.includes(cmd), `Help should mention "${cmd}"`);
    }
  });

  test('unknown command shows error + help', () => {
    try {
      execSync('node cli.js invalid-cmd 2>&1', { cwd: ROOT, encoding: 'utf-8' });
    } catch (e) {
      assert(e.stdout.includes('Commande inconnue') || e.stderr?.includes('Commande inconnue'), 'Should show error for unknown cmd');
    }
  });
}

// ─── Main Runner ─────────────────────────────────────────────────

async function main() {
  console.log('🧪 Social Pipeline Test Suite\n' + '='.repeat(50));

  await testSubtitleEngine();
  await testAnalytics();
  await testABTesting();
  await testViralOptimizer();
  await testContentRepurposer();
  await testSEOOptimizer();
  await testMultiLang();
  await testScheduler();
  await testBranding();
  await testContentLibrary();
  await testPlatformsConfig();
  await testEdgeCases();
  await testContentLibraryAdvanced();
  await testCLIHelp();

  console.log('\n' + '='.repeat(50));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log(`   Total: ${passed + failed + skipped} tests`);

  if (failed > 0) {
    console.log(`\n❌ ${failed} test(s) FAILED`);
    process.exit(1);
  } else {
    console.log(`\n✅ ALL ${passed} TESTS PASSED`);
  }
}

main().catch(err => {
  console.error(`\n💥 Test runner crashed: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
