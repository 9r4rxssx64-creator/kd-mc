/**
 * Content Repurposer — Transform 1 video into 10+ content pieces
 * Generates shorts clips, quote cards, thread scripts, blog posts, captions
 */
import fs from 'fs';
import path from 'path';

const PLATFORM_FORMATS = {
  youtube_short: { maxWords: 100, maxDuration: 60, aspect: '9:16', label: 'YouTube Short' },
  tiktok: { maxWords: 80, maxDuration: 60, aspect: '9:16', label: 'TikTok' },
  instagram_reel: { maxWords: 90, maxDuration: 90, aspect: '9:16', label: 'Instagram Reel' },
  instagram_carousel: { maxSlides: 10, maxWordsPerSlide: 30, label: 'IG Carousel' },
  twitter_thread: { maxTweets: 12, maxCharsPerTweet: 280, label: 'X Thread' },
  linkedin_post: { maxChars: 3000, label: 'LinkedIn Post' },
  blog_post: { minWords: 500, maxWords: 2000, label: 'Blog Post' },
  email_newsletter: { maxWords: 500, label: 'Newsletter' },
  pinterest_pin: { maxChars: 500, label: 'Pinterest Pin' },
  podcast_notes: { maxWords: 300, label: 'Podcast Notes' },
};

function splitIntoSentences(text) {
  return text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 5);
}

function extractBestQuotes(script, count = 5) {
  const sentences = splitIntoSentences(script);
  const scored = sentences.map(s => {
    let score = 0;
    if (s.length < 120) score += 3;
    if (/\b(never|always|every|nobody|everyone)\b/i.test(s)) score += 2;
    if (/[.!?]$/.test(s.trim())) score += 1;
    if (/(truth|secret|lesson|remember|forget|realize)/i.test(s)) score += 2;
    if (/\$[\d,]+|\d+ (years?|months?|days?)/.test(s)) score += 2;
    if (s.split(/\s+/).length <= 15) score += 1;
    return { text: s.trim(), score, words: s.split(/\s+/).length };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, count);
}

function extractClipSegments(script, count = 3, targetWords = 80) {
  const sentences = splitIntoSentences(script);
  const segments = [];
  const segmentSize = Math.max(1, Math.floor(sentences.length / (count + 1)));
  for (let i = 0; i < count; i++) {
    const startIdx = Math.floor((i + 0.5) * segmentSize);
    let segment = '';
    let j = startIdx;
    while (j < sentences.length && segment.split(/\s+/).length < targetWords) {
      segment += (segment ? ' ' : '') + sentences[j];
      j++;
    }
    if (segment.trim()) {
      segments.push({
        index: i + 1,
        text: segment.trim(),
        words: segment.split(/\s+/).length,
        startSentence: startIdx,
        hook: sentences[startIdx]?.trim() || '',
      });
    }
  }
  return segments;
}

export function generateTwitterThread(story) {
  const sentences = splitIntoSentences(story.script);
  const tweets = [];
  tweets.push(`🧵 ${story.title}\n\nA thread. 👇`);
  let current = '';
  for (const sentence of sentences) {
    const test = current ? `${current} ${sentence}` : sentence;
    if (test.length > 250 && current) {
      tweets.push(current.trim());
      current = sentence;
    } else {
      current = test;
    }
  }
  if (current.trim()) tweets.push(current.trim());
  tweets.push(`If this story hit you, repost the first tweet.\n\nFollow for more stories like this. 🔔`);
  return tweets.slice(0, PLATFORM_FORMATS.twitter_thread.maxTweets).map((t, i) => ({
    number: i + 1,
    text: t,
    chars: t.length,
  }));
}

export function generateInstagramCarousel(story) {
  const quotes = extractBestQuotes(story.script, 8);
  const slides = [
    { slide: 1, type: 'cover', text: story.title, subtext: 'Swipe to read →' },
  ];
  for (const quote of quotes) {
    slides.push({
      slide: slides.length + 1,
      type: 'quote',
      text: quote.text,
      words: quote.words,
    });
  }
  slides.push({
    slide: slides.length + 1,
    type: 'cta',
    text: 'Follow for more stories',
    subtext: 'Save this post 🔖 • Share with a friend',
  });
  return slides.slice(0, PLATFORM_FORMATS.instagram_carousel.maxSlides);
}

export function generateLinkedInPost(story) {
  const hook = splitIntoSentences(story.script)[0] || story.title;
  const quotes = extractBestQuotes(story.script, 3);
  const lines = [
    hook,
    '',
    '---',
    '',
  ];
  for (const q of quotes) {
    lines.push(`→ ${q.text}`);
    lines.push('');
  }
  lines.push('---');
  lines.push('');
  lines.push('What would you have done differently?');
  lines.push('');
  lines.push((story.tags || []).map(t => `#${t}`).join(' '));
  const post = lines.join('\n').slice(0, PLATFORM_FORMATS.linkedin_post.maxChars);
  return { text: post, chars: post.length };
}

export function generateBlogPost(story) {
  const sentences = splitIntoSentences(story.script);
  const paragraphs = [];
  let current = [];
  for (const s of sentences) {
    current.push(s);
    if (current.length >= 3) {
      paragraphs.push(current.join(' '));
      current = [];
    }
  }
  if (current.length) paragraphs.push(current.join(' '));
  const lines = [
    `# ${story.title}`,
    '',
    `*${(story.tags || []).map(t => `#${t}`).join(' ')}*`,
    '',
  ];
  for (const p of paragraphs) {
    lines.push(p);
    lines.push('');
  }
  lines.push('---');
  lines.push('');
  lines.push('*What do you think? Share your thoughts in the comments below.*');
  return { markdown: lines.join('\n'), words: story.script.split(/\s+/).length };
}

export function generateNewsletterVersion(story) {
  const hook = splitIntoSentences(story.script).slice(0, 2).join(' ');
  const cliffhanger = splitIntoSentences(story.script).slice(2, 5).join(' ');
  return {
    subject: `📖 ${story.title}`,
    preview: hook.slice(0, 100),
    body: [
      hook,
      '',
      cliffhanger,
      '',
      '**[Read the full story →]**',
      '',
      '---',
      'If you enjoyed this, forward it to a friend who loves a good story.',
    ].join('\n'),
    words: (hook + cliffhanger).split(/\s+/).length,
  };
}

export function generatePodcastNotes(story) {
  const quotes = extractBestQuotes(story.script, 3);
  return {
    title: story.title,
    summary: splitIntoSentences(story.script).slice(0, 3).join(' '),
    keyQuotes: quotes.map(q => q.text),
    timestamps: [
      { time: '0:00', label: 'Introduction' },
      { time: '0:30', label: 'The Setup' },
      { time: '2:00', label: 'The Turning Point' },
      { time: '4:00', label: 'The Resolution' },
    ],
    tags: story.tags || [],
  };
}

export function repurposeAll(story) {
  const result = {
    source: { id: story.id, title: story.title, words: story.script.split(/\s+/).length },
    generated: {},
    totalPieces: 0,
  };
  const clips = extractClipSegments(story.script, 3, 80);
  result.generated.shortClips = clips;
  result.totalPieces += clips.length;
  const quotes = extractBestQuotes(story.script, 5);
  result.generated.quoteCards = quotes;
  result.totalPieces += quotes.length;
  result.generated.twitterThread = generateTwitterThread(story);
  result.totalPieces++;
  result.generated.instagramCarousel = generateInstagramCarousel(story);
  result.totalPieces++;
  result.generated.linkedInPost = generateLinkedInPost(story);
  result.totalPieces++;
  result.generated.blogPost = generateBlogPost(story);
  result.totalPieces++;
  result.generated.newsletter = generateNewsletterVersion(story);
  result.totalPieces++;
  result.generated.podcastNotes = generatePodcastNotes(story);
  result.totalPieces++;
  return result;
}

export function exportRepurposed(result, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const thread = result.generated.twitterThread;
  if (thread) {
    fs.writeFileSync(path.join(outDir, 'twitter-thread.txt'),
      thread.map(t => `[${t.number}/${thread.length}]\n${t.text}`).join('\n\n---\n\n'));
  }
  const linkedin = result.generated.linkedInPost;
  if (linkedin) {
    fs.writeFileSync(path.join(outDir, 'linkedin-post.txt'), linkedin.text);
  }
  const blog = result.generated.blogPost;
  if (blog) {
    fs.writeFileSync(path.join(outDir, 'blog-post.md'), blog.markdown);
  }
  const newsletter = result.generated.newsletter;
  if (newsletter) {
    fs.writeFileSync(path.join(outDir, 'newsletter.txt'),
      `Subject: ${newsletter.subject}\nPreview: ${newsletter.preview}\n\n${newsletter.body}`);
  }
  fs.writeFileSync(path.join(outDir, 'repurpose-manifest.json'), JSON.stringify(result, null, 2));
  return Object.keys(result.generated).length;
}

export { PLATFORM_FORMATS, extractBestQuotes, extractClipSegments };
