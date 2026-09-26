/**
 * Viral Optimizer — Predicts viral potential, optimizes hooks, titles, and retention
 * Uses engagement heuristics + niche RPM data + platform-specific rules
 */
import fs from 'fs';
import path from 'path';

const HOOK_PATTERNS = [
  { pattern: /^(he|she|they|i)\s/i, score: 8, label: 'personal-pronoun-start' },
  { pattern: /\?$/, score: 7, label: 'question-hook' },
  { pattern: /\$[\d,]+/, score: 9, label: 'money-mention' },
  { pattern: /\d+\s*(years?|months?|days?|hours?|minutes?|seconds?)/i, score: 6, label: 'time-specificity' },
  { pattern: /(never|nobody|no one|nothing|impossible)/i, score: 7, label: 'negative-absolute' },
  { pattern: /(secret|hidden|truth|exposed|revealed)/i, score: 8, label: 'mystery-word' },
  { pattern: /(mistake|wrong|fail|lost|destroyed|ruined)/i, score: 7, label: 'negative-outcome' },
  { pattern: /(million|billion|thousand)/i, score: 8, label: 'large-number' },
  { pattern: /\d{4}/, score: 5, label: 'year-mention' },
  { pattern: /(dead|died|killed|murder|prison|jail)/i, score: 9, label: 'high-stakes' },
];

const TITLE_RULES = {
  maxLength: 70,
  idealLength: { min: 40, max: 60 },
  powerWords: ['secret', 'truth', 'exposed', 'never', 'mistake', 'lost', 'million', 'hidden', 'destroyed', 'revenge', 'betrayal', 'caught', 'trap', 'karma'],
  weakWords: ['very', 'really', 'just', 'actually', 'basically', 'literally', 'amazing', 'incredible'],
  clickbaitPenalty: ['you won\'t believe', 'what happened next', 'gone wrong', 'gone sexual', 'not clickbait'],
};

const RETENTION_FACTORS = {
  hookFirst5Seconds: 0.25,
  storyArc: 0.20,
  emotionalPeaks: 0.15,
  plotTwist: 0.15,
  specificDetails: 0.10,
  pacing: 0.10,
  callToAction: 0.05,
};

export function scoreTitle(title) {
  const scores = { total: 0, breakdown: {} };
  const len = title.length;
  if (len === 0) {
    scores.breakdown.length = 0;
  } else if (len >= TITLE_RULES.idealLength.min && len <= TITLE_RULES.idealLength.max) {
    scores.breakdown.length = 10;
  } else if (len <= TITLE_RULES.maxLength) {
    scores.breakdown.length = 7;
  } else {
    scores.breakdown.length = 3;
  }
  const lower = title.toLowerCase();
  const powerCount = TITLE_RULES.powerWords.filter(w => lower.includes(w)).length;
  scores.breakdown.powerWords = Math.min(10, powerCount * 3);
  const weakCount = TITLE_RULES.weakWords.filter(w => lower.includes(w)).length;
  scores.breakdown.weakWords = Math.max(0, 10 - weakCount * 4);
  const clickbaitCount = TITLE_RULES.clickbaitPenalty.filter(p => lower.includes(p)).length;
  scores.breakdown.clickbait = Math.max(0, 10 - clickbaitCount * 5);
  const hasNumber = /\d/.test(title);
  scores.breakdown.numbers = hasNumber ? 8 : 5;
  const hasEmotion = /(betray|revenge|love|hate|trust|fear|shock|horror)/i.test(title);
  scores.breakdown.emotion = hasEmotion ? 9 : 5;
  const capsRatio = len > 0 ? (title.match(/[A-Z]/g) || []).length / len : 0;
  scores.breakdown.caps = len === 0 ? 0 : capsRatio > 0.5 ? 3 : capsRatio > 0.3 ? 5 : 8;
  const values = Object.values(scores.breakdown);
  scores.total = Math.round(values.reduce((a, b) => a + b, 0) / values.length * 10) / 10;
  scores.suggestions = [];
  if (len > TITLE_RULES.maxLength) scores.suggestions.push(`Shorten to ${TITLE_RULES.maxLength} chars (currently ${len})`);
  if (powerCount === 0) scores.suggestions.push(`Add a power word: ${TITLE_RULES.powerWords.slice(0, 5).join(', ')}`);
  if (weakCount > 0) scores.suggestions.push(`Remove weak words: ${TITLE_RULES.weakWords.filter(w => lower.includes(w)).join(', ')}`);
  if (!hasNumber) scores.suggestions.push('Add a specific number (dollar amounts, years, counts)');
  if (!hasEmotion) scores.suggestions.push('Add an emotional trigger word');
  return scores;
}

export function scoreHook(scriptFirst100Words) {
  const text = scriptFirst100Words.split(/\s+/).slice(0, 100).join(' ');
  let totalScore = 0;
  const matched = [];
  for (const { pattern, score, label } of HOOK_PATTERNS) {
    if (pattern.test(text)) {
      totalScore += score;
      matched.push(label);
    }
  }
  const firstSentence = text.split(/[.!?]/)[0] || '';
  const wordCount = firstSentence.split(/\s+/).length;
  if (wordCount <= 12) totalScore += 5;
  else if (wordCount <= 20) totalScore += 2;
  const normalized = Math.min(10, Math.round(totalScore / 8 * 10) / 10);
  return {
    score: normalized,
    matchedPatterns: matched,
    firstSentenceWords: wordCount,
    suggestions: normalized < 7 ? [
      'Start with a personal pronoun (He, She, They)',
      'Add a specific dollar amount or time period',
      'Use a mystery/reveal word in the first sentence',
      'Keep the first sentence under 12 words',
    ].filter((_, i) => !matched.includes(HOOK_PATTERNS[i]?.label)) : [],
  };
}

export function scoreScript(script) {
  const words = script.split(/\s+/);
  const wordCount = words.length;
  const sentences = script.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const scores = {};
  const first100 = words.slice(0, 100).join(' ');
  scores.hook = scoreHook(first100).score;
  const hasBeginning = wordCount > 50;
  const hasMiddle = wordCount > 150;
  const hasEnd = /\.$/.test(script.trim());
  scores.storyArc = (hasBeginning ? 3 : 0) + (hasMiddle ? 4 : 0) + (hasEnd ? 3 : 0);
  const emotionWords = (script.match(/(betray|revenge|love|hate|trust|fear|shock|anger|rage|tears|cry|scream|silence|walked away|never spoke)/gi) || []).length;
  scores.emotionalPeaks = Math.min(10, emotionWords * 1.5);
  const twistWords = (script.match(/(but|however|what .* didn't know|the truth was|then.*happened|revealed|discovered|turned out)/gi) || []).length;
  scores.plotTwist = Math.min(10, twistWords * 2);
  const specifics = (script.match(/\$[\d,]+|\d{4}|[A-Z][a-z]+ [A-Z][a-z]+/g) || []).length;
  scores.specificDetails = Math.min(10, specifics * 1.5);
  const avgSentenceLen = sentences.length ? wordCount / sentences.length : 50;
  scores.pacing = avgSentenceLen < 12 ? 9 : avgSentenceLen < 18 ? 7 : avgSentenceLen < 25 ? 5 : 3;
  const shortSentences = sentences.filter(s => s.trim().split(/\s+/).length <= 5).length;
  const longSentences = sentences.filter(s => s.trim().split(/\s+/).length > 20).length;
  const variety = Math.abs(shortSentences - longSentences) < sentences.length * 0.3;
  scores.pacing = variety ? Math.min(10, scores.pacing + 2) : scores.pacing;
  const total = Object.entries(RETENTION_FACTORS).reduce((sum, [key, weight]) => {
    return sum + (scores[key] || 5) * weight;
  }, 0);
  return {
    viralScore: Math.round(total * 10) / 10,
    breakdown: scores,
    wordCount,
    sentenceCount: sentences.length,
    avgSentenceLength: Math.round(avgSentenceLen),
    readingTime: Math.round(wordCount / 150),
  };
}

export function optimizeTitle(title) {
  const current = scoreTitle(title);
  const variants = [
    title,
    title.replace(/^The /, ''),
    title.replace(/\.$/, ''),
  ];
  if (!/\d/.test(title)) {
    variants.push(`${title} — $2.4 Million Gone`);
    variants.push(`${title} (True Story)`);
  }
  if (!/(secret|truth|exposed)/i.test(title)) {
    variants.push(`The Truth About ${title}`);
    variants.push(`${title} — The Hidden Truth`);
  }
  const scored = variants.map(v => ({ title: v, ...scoreTitle(v) }));
  scored.sort((a, b) => b.total - a.total);
  return {
    original: { title, score: current.total },
    best: scored[0],
    alternatives: scored.slice(1, 4),
  };
}

export function predictViralPotential(story) {
  const titleScore = scoreTitle(story.title);
  const scriptScore = scoreScript(story.script);
  const hookScore = scoreHook(story.script);
  const niche = story.niche_rpm || story.category || 'unknown';
  const nicheBonus = typeof niche === 'object' ? (niche.avg || 8) / 15 * 2 : 0;
  const composite = (titleScore.total * 0.25 + scriptScore.viralScore * 0.50 + hookScore.score * 0.25) + nicheBonus;
  const potential = Math.min(10, Math.round(composite * 10) / 10);
  let verdict;
  if (potential >= 8.5) verdict = 'HIGH VIRAL POTENTIAL — publish immediately';
  else if (potential >= 7) verdict = 'GOOD — minor tweaks could boost performance';
  else if (potential >= 5) verdict = 'AVERAGE — needs hook and title optimization';
  else verdict = 'LOW — consider rewriting or choosing a different niche';
  return {
    viralScore: potential,
    verdict,
    title: titleScore,
    script: scriptScore,
    hook: hookScore,
    recommendations: [
      ...titleScore.suggestions,
      ...hookScore.suggestions,
      scriptScore.avgSentenceLength > 20 ? 'Break up long sentences for better pacing' : null,
      scriptScore.wordCount < 150 ? 'Script may be too short for good retention' : null,
      scriptScore.wordCount > 2000 ? 'Consider splitting into 2 videos' : null,
    ].filter(Boolean),
  };
}

export function generateHookVariants(topic, count = 5) {
  const templates = [
    `He trusted {person} with everything. That was his first mistake.`,
    `$\{amount} disappeared overnight. No one saw it coming.`,
    `She walked into {place} expecting {expectation}. She walked out with nothing.`,
    `Everyone told him not to {action}. He did it anyway.`,
    `Three words changed {person}'s life forever: "{three_words}."`,
    `The email arrived at 3 AM. By sunrise, everything was different.`,
    `{person} had {timeframe} to make a decision that would define {pronoun} entire life.`,
    `Most people don't know this about {topic}. And that's exactly how {entity} wants it.`,
    `When {person} opened the {object}, {pronoun} found something that shouldn't exist.`,
    `They said it was impossible. {person} proved them wrong in {timeframe}.`,
  ];
  return templates.slice(0, count).map((t, i) => ({
    variant: i + 1,
    hook: t.replace(/\{[^}]+\}/g, `[${topic}]`),
    template: t,
  }));
}

export function analyzeCompetition(titles) {
  const results = titles.map(t => ({ title: t, ...scoreTitle(t) }));
  results.sort((a, b) => b.total - a.total);
  const avgScore = results.reduce((s, r) => s + r.total, 0) / results.length;
  const topPatterns = {};
  for (const r of results.slice(0, 5)) {
    for (const [key, val] of Object.entries(r.breakdown)) {
      if (val >= 8) topPatterns[key] = (topPatterns[key] || 0) + 1;
    }
  }
  return {
    averageScore: Math.round(avgScore * 10) / 10,
    bestTitle: results[0],
    worstTitle: results[results.length - 1],
    topPatterns: Object.entries(topPatterns).sort((a, b) => b[1] - a[1]).map(([k]) => k),
    gap: results[0].total - results[results.length - 1].total,
  };
}
