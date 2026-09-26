/**
 * SEO Optimizer — YouTube/TikTok/Instagram description, tags, hashtags, chapters
 * Generates platform-optimized metadata for maximum discoverability
 */

const PLATFORM_LIMITS = {
  youtube: { titleMax: 100, descMax: 5000, tagsMax: 500, hashtagsMax: 15 },
  tiktok: { captionMax: 2200, hashtagsMax: 5 },
  instagram: { captionMax: 2200, hashtagsMax: 30 },
  facebook: { descMax: 63206 },
  twitter: { textMax: 280, hashtagsMax: 3 },
};

const NICHE_HASHTAGS = {
  betrayal: ['storytime', 'betrayal', 'revenge', 'karma', 'darkstory', 'truestory', 'toxicpeople', 'narcissist', 'manipulation', 'redflags', 'relationship', 'drama', 'cheating', 'exposed', 'trust'],
  revenge: ['revenge', 'karma', 'justice', 'payback', 'satisfying', 'storytime', 'pettyrevenge', 'prorevenge', 'nuclearrevenge', 'sweetrevenge'],
  mystery: ['mystery', 'unsolved', 'creepy', 'paranormal', 'truecrime', 'disappeared', 'coldcase', 'unexplained', 'scary', 'horror'],
  finance: ['money', 'finance', 'investing', 'wealth', 'scam', 'fraud', 'crypto', 'stocks', 'financialfreedom', 'millionaire', 'sidehustle', 'personalfinance'],
  'true-crime': ['truecrime', 'crime', 'murder', 'investigation', 'detective', 'forensics', 'coldcase', 'documentary', 'justice', 'criminal'],
  motivation: ['motivation', 'success', 'mindset', 'hustle', 'grind', 'entrepreneur', 'inspiration', 'goals', 'nevergiveup', 'discipline'],
  psychology: ['psychology', 'brain', 'mindset', 'behavior', 'habits', 'mentalhealth', 'facts', 'science', 'humanmind', 'cognitive'],
  tech: ['tech', 'ai', 'technology', 'future', 'innovation', 'startups', 'coding', 'digital', 'automation', 'data'],
};

const CTA_TEMPLATES = {
  youtube: [
    '👍 Like if this story shocked you',
    '🔔 Subscribe for daily stories',
    '💬 Comment: What would YOU have done?',
    '📤 Share this with someone who needs to hear it',
  ],
  tiktok: [
    'Follow for Part 2 👀',
    'Like if you saw the twist coming 🤯',
    'Comment your theory 💬',
  ],
  instagram: [
    '💾 Save for later',
    '📤 Share to your story',
    '👇 Tag someone who needs this',
  ],
};

export function generateYouTubeMetadata(story, opts = {}) {
  const niche = story.category || detectNiche(story.tags || []);
  const nicheHashtags = NICHE_HASHTAGS[niche] || NICHE_HASHTAGS.betrayal;
  const title = (story.title || '').slice(0, PLATFORM_LIMITS.youtube.titleMax);
  const chapters = generateChapters(story.script, opts.durationSec || 300);
  const description = [
    story.title,
    '',
    (story.script || '').split(/[.!?]/).slice(0, 2).join('. ').trim() + '.',
    '',
    '📖 Chapters:',
    ...chapters.map(c => `${c.timestamp} ${c.label}`),
    '',
    ...CTA_TEMPLATES.youtube,
    '',
    '---',
    '',
    nicheHashtags.slice(0, 10).map(h => `#${h}`).join(' '),
    '',
    '© Stories are original or inspired by real events. Names changed for privacy.',
  ].join('\n').slice(0, PLATFORM_LIMITS.youtube.descMax);
  const tags = [
    ...(story.tags || []),
    ...nicheHashtags.slice(0, 10),
    'story', 'storytime', 'narrative', 'faceless',
  ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 30);
  return { title, description, tags, chapters, platform: 'youtube' };
}

export function generateTikTokCaption(story) {
  const niche = story.category || detectNiche(story.tags || []);
  const hashtags = (NICHE_HASHTAGS[niche] || []).slice(0, 4);
  hashtags.push('fyp');
  const hook = (story.script || '').split(/[.!?]/)[0]?.trim() || story.title;
  const cta = CTA_TEMPLATES.tiktok[Math.floor(Math.random() * CTA_TEMPLATES.tiktok.length)];
  const caption = [
    hook.length > 80 ? hook.slice(0, 77) + '...' : hook,
    '',
    cta,
    '',
    hashtags.map(h => `#${h}`).join(' '),
  ].join('\n').slice(0, PLATFORM_LIMITS.tiktok.captionMax);
  return { caption, hashtags, platform: 'tiktok' };
}

export function generateInstagramCaption(story) {
  const niche = story.category || detectNiche(story.tags || []);
  const hashtags = [
    ...(NICHE_HASHTAGS[niche] || []).slice(0, 20),
    'reels', 'viral', 'explore', 'fyp', 'story',
  ].slice(0, PLATFORM_LIMITS.instagram.hashtagsMax);
  const sentences = (story.script || '').split(/[.!?]+/).filter(s => s.trim().length > 5);
  const teaser = sentences.slice(0, 3).join('. ').trim() + '.';
  const caption = [
    `📖 ${story.title}`,
    '',
    teaser,
    '',
    '...',
    '',
    ...CTA_TEMPLATES.instagram,
    '',
    '.',
    '.',
    '.',
    '',
    hashtags.map(h => `#${h}`).join(' '),
  ].join('\n').slice(0, PLATFORM_LIMITS.instagram.captionMax);
  return { caption, hashtags, platform: 'instagram' };
}

export function generateChapters(script, totalDurationSec = 300) {
  const sentences = (script || '').split(/[.!?]+/).filter(s => s.trim().length > 10);
  const sectionCount = Math.min(6, Math.max(3, Math.floor(totalDurationSec / 60)));
  const sectionSize = Math.ceil(sentences.length / sectionCount);
  const chapters = [{ timestamp: '0:00', label: 'Introduction' }];
  const labels = ['The Setup', 'The Turning Point', 'Things Get Worse', 'The Truth Revealed', 'The Aftermath', 'Lessons Learned'];
  for (let i = 1; i < sectionCount; i++) {
    const timeSec = Math.round((i / sectionCount) * totalDurationSec);
    const min = Math.floor(timeSec / 60);
    const sec = timeSec % 60;
    chapters.push({
      timestamp: `${min}:${String(sec).padStart(2, '0')}`,
      label: labels[i - 1] || `Part ${i + 1}`,
    });
  }
  return chapters;
}

export function generateAllPlatformMeta(story, opts = {}) {
  return {
    youtube: generateYouTubeMetadata(story, opts),
    tiktok: generateTikTokCaption(story),
    instagram: generateInstagramCaption(story),
  };
}

function detectNiche(tags) {
  const tagStr = tags.join(' ').toLowerCase();
  for (const [niche, keywords] of Object.entries(NICHE_HASHTAGS)) {
    const matches = keywords.filter(k => tagStr.includes(k)).length;
    if (matches >= 2) return niche;
  }
  return 'betrayal';
}

export function optimizeTags(tags, niche = 'betrayal', maxCount = 30) {
  const nicheHashtags = NICHE_HASHTAGS[niche] || [];
  const combined = [...new Set([...tags, ...nicheHashtags, 'story', 'storytime', 'viral'])];
  return combined.slice(0, maxCount);
}

export { PLATFORM_LIMITS, NICHE_HASHTAGS, CTA_TEMPLATES };
