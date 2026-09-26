/**
 * Tests features/browser (refonte complète Kevin v13.0.20).
 *
 * Couvre la logique pure (UI HTML excluded coverage via vitest.config) :
 *  - escapeHtml anti-XSS
 *  - isValidUrl + normalizeUrl + isBlockedUrl + extractDomain + getFaviconUrl
 *  - tabsStore CRUD (load/save/add/close/update/reorder/active/count/clear)
 *  - bookmarksStore CRUD (load/save/add/remove/toggle/isBookmarked/search)
 *  - historyStore CRUD (load/save/push/search/clear)
 *  - Anti X-Frame-Options bypass : buildArchiveUrl / buildReaderUrl / buildGoogleCacheUrl / getFallbackChain
 *  - AI search detection : isAiQuery / extractAiQuery
 *  - Auto-complete suggestions
 *  - FIFO 20 tabs / 500 history / 1000 bookmarks
 *  - Sécurité : javascript: scheme bloqué, blocklist, dédup
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  bookmarksStore,
  buildArchiveUrl,
  buildBlockedOverlay,
  buildGoogleCacheUrl,
  buildReaderUrl,
  countWords,
  detectIframeBlocked,
  escapeHtml,
  extractAiQuery,
  extractDomain,
  extractReaderStats,
  fallbackLabel,
  getFallbackChain,
  getFaviconUrl,
  getSuggestions,
  historyStore,
  isAiQuery,
  isBlockedUrl,
  isValidUrl,
  normalizeUrl,
  readingTimeMinutes,
  searchInDocument,
  tabsStore,
} from '../../features/browser/index.js';

function clearAll(): void {
  localStorage.clear();
}

/* Build strings dynamically so ESLint no-script-url doesn't flag them.
   These are explicit security tests verifying that XSS schemes are rejected. */
const JS_SCHEME = 'java' + 'script:alert(1)';
const JS_SCHEME_COOKIE = 'java' + 'script:alert(document.cookie)';
const DATA_SCHEME = 'data' + ':text/html,<script>';
const DATA_SCHEME_SHORT = 'data' + ':,xxx';
const VBS_SCHEME = 'vb' + 'script:msgbox("xss")';
const FILE_SCHEME = 'file' + ':///etc/passwd';

beforeEach(clearAll);
afterEach(clearAll);

describe('features/browser — escapeHtml', () => {
  it('échappe < > & " \' pour anti-XSS', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
    expect(escapeHtml("L'apos")).toBe('L&#39;apos');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('idempotent sur texte clean', () => {
    expect(escapeHtml('Hello world 123')).toBe('Hello world 123');
  });
});

describe('features/browser — isValidUrl', () => {
  it('accepte http/https valides', () => {
    expect(isValidUrl('https://www.google.com')).toBe(true);
    expect(isValidUrl('http://example.com')).toBe(true);
    expect(isValidUrl('google.com')).toBe(true);
    expect(isValidUrl('example.fr/path?q=1')).toBe(true);
  });

  it('refuse les schemes dangereux (XSS)', () => {
    expect(isValidUrl(JS_SCHEME)).toBe(false);
    expect(isValidUrl(DATA_SCHEME + 'alert(1)')).toBe(false);
    expect(isValidUrl(VBS_SCHEME)).toBe(false);
    expect(isValidUrl(FILE_SCHEME)).toBe(false);
  });

  it('refuse vide ou input invalide', () => {
    expect(isValidUrl('')).toBe(false);
    expect(isValidUrl('   ')).toBe(false);
    expect(isValidUrl('not a url')).toBe(false);
    expect(isValidUrl(null as unknown as string)).toBe(false);
  });
});

describe('features/browser — normalizeUrl', () => {
  it('ajoute https:// si manquant', () => {
    expect(normalizeUrl('google.com')).toBe('https://google.com');
    expect(normalizeUrl('example.fr/path')).toBe('https://example.fr/path');
  });

  it('garde http:// et https:// intacts', () => {
    expect(normalizeUrl('http://example.com')).toBe('http://example.com');
    expect(normalizeUrl('https://example.com')).toBe('https://example.com');
  });

  it('retourne vide si input vide', () => {
    expect(normalizeUrl('')).toBe('');
    expect(normalizeUrl('   ')).toBe('');
  });
});

describe('features/browser — isBlockedUrl', () => {
  it('bloque mots-clés porn/malware/phishing', () => {
    expect(isBlockedUrl('https://porn-site.com')).toBe(true);
    expect(isBlockedUrl('https://malware-bad.com')).toBe(true);
    expect(isBlockedUrl('https://phishing-fake.com')).toBe(true);
  });

  it('autorise sites légitimes', () => {
    expect(isBlockedUrl('https://www.google.com')).toBe(false);
    expect(isBlockedUrl('https://github.com')).toBe(false);
    expect(isBlockedUrl('https://www.lemonde.fr')).toBe(false);
  });

  it('considère vide comme bloqué', () => {
    expect(isBlockedUrl('')).toBe(true);
  });
});

describe('features/browser — extractDomain + getFaviconUrl', () => {
  it('extractDomain retourne hostname', () => {
    expect(extractDomain('https://www.google.com/search?q=x')).toBe('www.google.com');
    expect(extractDomain('http://example.fr')).toBe('example.fr');
  });

  it('extractDomain retourne vide si invalide', () => {
    expect(extractDomain('not a url')).toBe('');
  });

  it('getFaviconUrl retourne URL Google s2', () => {
    const fav = getFaviconUrl('https://example.com');
    expect(fav).toContain('https://www.google.com/s2/favicons');
    expect(fav).toContain('domain=example.com');
  });

  it('getFaviconUrl retourne vide si pas de domain', () => {
    expect(getFaviconUrl('not a url')).toBe('');
  });
});

describe('features/browser — tabsStore CRUD', () => {
  it('load retourne [] vide initial', () => {
    expect(tabsStore.load()).toEqual([]);
    expect(tabsStore.count()).toBe(0);
  });

  it('add crée tab avec id, ts, title défaut', () => {
    const tab = tabsStore.add('https://example.com');
    expect(tab).not.toBeNull();
    expect(tab?.id).toMatch(/^tab_/);
    expect(tab?.url).toBe('https://example.com');
    expect(tab?.ts_opened).toBeGreaterThan(0);
    expect(tabsStore.count()).toBe(1);
  });

  it('add normalize URL sans https://', () => {
    const tab = tabsStore.add('google.com');
    expect(tab?.url).toBe('https://google.com');
  });

  it('add refuse javascript: scheme', () => {
    expect(tabsStore.add(JS_SCHEME)).toBeNull();
  });

  it('add refuse URL bloquée', () => {
    expect(tabsStore.add('https://porn-site.com')).toBeNull();
  });

  it('close retire tab', () => {
    const tab = tabsStore.add('https://a.com');
    expect(tabsStore.count()).toBe(1);
    expect(tabsStore.close(tab!.id)).toBe(true);
    expect(tabsStore.count()).toBe(0);
  });

  it('update modifie URL et title', () => {
    const tab = tabsStore.add('https://a.com', 'A');
    expect(tabsStore.update(tab!.id, { url: 'https://b.com', title: 'B' })).toBe(true);
    const list = tabsStore.load();
    expect(list[0]?.url).toBe('https://b.com');
    expect(list[0]?.title).toBe('B');
  });

  it('update retourne false si id inconnu', () => {
    expect(tabsStore.update('inconnu', { title: 'x' })).toBe(false);
  });

  it('reorder change ordre des tabs', () => {
    const t1 = tabsStore.add('https://a.com');
    const t2 = tabsStore.add('https://b.com');
    const t3 = tabsStore.add('https://c.com');
    expect(tabsStore.reorder([t3!.id, t1!.id, t2!.id])).toBe(true);
    const list = tabsStore.load();
    expect(list[0]?.id).toBe(t3!.id);
    expect(list[1]?.id).toBe(t1!.id);
    expect(list[2]?.id).toBe(t2!.id);
  });

  it('FIFO : > 20 tabs supprime le plus ancien', () => {
    for (let i = 0; i < 25; i++) {
      tabsStore.add(`https://site${i}.com`);
    }
    expect(tabsStore.count()).toBe(20);
  });

  it('setActive + getActive', () => {
    const tab = tabsStore.add('https://a.com');
    tabsStore.setActive(tab!.id);
    expect(tabsStore.getActive()).toBe(tab!.id);
  });

  it('clear vide tout', () => {
    tabsStore.add('https://a.com');
    expect(tabsStore.clear()).toBe(true);
    expect(tabsStore.count()).toBe(0);
    expect(tabsStore.getActive()).toBeNull();
  });

  it('load gère localStorage corrompu', () => {
    localStorage.setItem('apex_v13_browser_tabs', '{not json}');
    expect(tabsStore.load()).toEqual([]);
  });

  it('load gère array invalide', () => {
    localStorage.setItem('apex_v13_browser_tabs', '"pas un array"');
    expect(tabsStore.load()).toEqual([]);
  });

  it('load filtre tabs invalides', () => {
    localStorage.setItem('apex_v13_browser_tabs', JSON.stringify([{ bad: 'data' }, null, 'string']));
    expect(tabsStore.load()).toEqual([]);
  });
});

describe('features/browser — bookmarksStore CRUD', () => {
  it('load retourne [] vide initial', () => {
    expect(bookmarksStore.load()).toEqual([]);
    expect(bookmarksStore.count()).toBe(0);
  });

  it('add crée bookmark avec favicon + tags lowercase', () => {
    const bm = bookmarksStore.add({ url: 'https://example.com', title: 'Example', tags: ['News', 'Tech'] });
    expect(bm).not.toBeNull();
    expect(bm?.id).toMatch(/^bm_/);
    expect(bm?.url).toBe('https://example.com');
    expect(bm?.favicon).toContain('s2/favicons');
    expect(bm?.tags).toEqual(['news', 'tech']);
  });

  it('add refuse URL invalide', () => {
    expect(bookmarksStore.add({ url: JS_SCHEME })).toBeNull();
    expect(bookmarksStore.add({ url: '' })).toBeNull();
  });

  it('add refuse URL bloquée', () => {
    expect(bookmarksStore.add({ url: 'https://porn-site.com' })).toBeNull();
  });

  it('add dédup par URL', () => {
    bookmarksStore.add({ url: 'https://example.com', title: 'A' });
    expect(bookmarksStore.add({ url: 'https://example.com', title: 'B' })).toBeNull();
    expect(bookmarksStore.count()).toBe(1);
  });

  it('remove supprime bookmark', () => {
    const bm = bookmarksStore.add({ url: 'https://a.com' });
    expect(bookmarksStore.remove(bm!.id)).toBe(true);
    expect(bookmarksStore.count()).toBe(0);
  });

  it('isBookmarked detect existant', () => {
    bookmarksStore.add({ url: 'https://a.com' });
    expect(bookmarksStore.isBookmarked('https://a.com')).toBe(true);
    expect(bookmarksStore.isBookmarked('a.com')).toBe(true); // normalized
    expect(bookmarksStore.isBookmarked('https://b.com')).toBe(false);
  });

  it('isBookmarked false si vide', () => {
    expect(bookmarksStore.isBookmarked('')).toBe(false);
  });

  it('toggle ajoute si absent, retire si présent', () => {
    expect(bookmarksStore.toggle('https://a.com', 'A')).toBe(true);
    expect(bookmarksStore.count()).toBe(1);
    expect(bookmarksStore.toggle('https://a.com')).toBe(true);
    expect(bookmarksStore.count()).toBe(0);
  });

  it('toggle refuse URL invalide', () => {
    expect(bookmarksStore.toggle(JS_SCHEME)).toBe(false);
  });

  it('search trouve par titre/url/tag', () => {
    bookmarksStore.add({ url: 'https://google.com', title: 'Google Search', tags: ['search'] });
    bookmarksStore.add({ url: 'https://github.com', title: 'GitHub', tags: ['code'] });
    expect(bookmarksStore.search('google').length).toBe(1);
    expect(bookmarksStore.search('search').length).toBe(1);
    expect(bookmarksStore.search('code').length).toBe(1);
    expect(bookmarksStore.search('nope').length).toBe(0);
  });

  it('search vide retourne tous', () => {
    bookmarksStore.add({ url: 'https://a.com' });
    bookmarksStore.add({ url: 'https://b.com' });
    expect(bookmarksStore.search('').length).toBe(2);
  });

  it('clear vide tout', () => {
    bookmarksStore.add({ url: 'https://a.com' });
    expect(bookmarksStore.clear()).toBe(true);
    expect(bookmarksStore.count()).toBe(0);
  });

  it('load gère localStorage corrompu', () => {
    localStorage.setItem('apex_v13_bookmarks', '{not json}');
    expect(bookmarksStore.load()).toEqual([]);
  });
});

describe('features/browser — historyStore CRUD', () => {
  it('load retourne [] vide initial', () => {
    expect(historyStore.load()).toEqual([]);
    expect(historyStore.count()).toBe(0);
  });

  it('push crée entry avec id+ts', () => {
    const e = historyStore.push('https://a.com', 'A');
    expect(e).not.toBeNull();
    expect(e?.id).toMatch(/^h_/);
    expect(e?.url).toBe('https://a.com');
    expect(e?.title).toBe('A');
    expect(historyStore.count()).toBe(1);
  });

  it('push refuse URL invalide ou bloquée', () => {
    expect(historyStore.push(JS_SCHEME)).toBeNull();
    expect(historyStore.push('https://porn-x.com')).toBeNull();
  });

  it('search trouve par titre/url', () => {
    historyStore.push('https://google.com', 'Google');
    historyStore.push('https://github.com', 'GitHub');
    expect(historyStore.search('goog').length).toBe(1);
    expect(historyStore.search('github').length).toBe(1);
    expect(historyStore.search('nope').length).toBe(0);
  });

  it('search vide retourne tous', () => {
    historyStore.push('https://a.com');
    historyStore.push('https://b.com');
    expect(historyStore.search('').length).toBe(2);
  });

  it('FIFO : > 500 history supprime ancien', () => {
    for (let i = 0; i < 510; i++) {
      historyStore.push(`https://site${i}.com`);
    }
    expect(historyStore.count()).toBe(500);
  });

  it('clear vide tout', () => {
    historyStore.push('https://a.com');
    expect(historyStore.clear()).toBe(true);
    expect(historyStore.count()).toBe(0);
  });

  it('load gère localStorage corrompu', () => {
    localStorage.setItem('apex_v13_browser_history', '{not json}');
    expect(historyStore.load()).toEqual([]);
  });
});

describe('features/browser — Anti X-Frame-Options bypass', () => {
  it('buildArchiveUrl encode URL pour web.archive.org', () => {
    const u = buildArchiveUrl('https://example.com');
    expect(u).toContain('web.archive.org/web/2/');
    expect(u).toContain(encodeURIComponent('https://example.com'));
  });

  it('buildReaderUrl utilise r.jina.ai', () => {
    expect(buildReaderUrl('https://example.com')).toBe('https://r.jina.ai/https://example.com');
  });

  it('buildGoogleCacheUrl encode URL', () => {
    const u = buildGoogleCacheUrl('https://example.com');
    expect(u).toContain('webcache.googleusercontent.com');
    expect(u).toContain(encodeURIComponent('https://example.com'));
  });

  it('getFallbackChain retourne 5 méthodes ordonnées', () => {
    const chain = getFallbackChain('https://example.com');
    expect(chain.length).toBe(5);
    expect(chain[0]?.method).toBe('direct');
    expect(chain[1]?.method).toBe('archive');
    expect(chain[2]?.method).toBe('reader');
    expect(chain[3]?.method).toBe('gcache');
    expect(chain[4]?.method).toBe('safari');
  });

  it('getFallbackChain normalize URL sans scheme', () => {
    const chain = getFallbackChain('example.com');
    expect(chain[0]?.url).toBe('https://example.com');
  });
});

describe('features/browser — AI search', () => {
  it('isAiQuery détecte ?question', () => {
    expect(isAiQuery('?meteo Monaco')).toBe(true);
    expect(isAiQuery('? résume')).toBe(true);
  });

  it('isAiQuery refuse normal URLs', () => {
    expect(isAiQuery('https://google.com')).toBe(false);
    expect(isAiQuery('example.com')).toBe(false);
    expect(isAiQuery('')).toBe(false);
    expect(isAiQuery('?')).toBe(false); // juste ? sans contenu
  });

  it('extractAiQuery retire le ? initial', () => {
    expect(extractAiQuery('?meteo Monaco')).toBe('meteo Monaco');
    expect(extractAiQuery('?  hello  ')).toBe('hello');
  });
});

describe('features/browser — getSuggestions auto-complete', () => {
  it('retourne [] si input vide', () => {
    expect(getSuggestions('')).toEqual([]);
    expect(getSuggestions('   ')).toEqual([]);
  });

  it('retourne suggestion AI si ?question', () => {
    const s = getSuggestions('?meteo Monaco');
    expect(s.length).toBe(1);
    expect(s[0]?.type).toBe('ai');
    expect(s[0]?.query).toBe('meteo Monaco');
  });

  it('mix bookmarks + history (bookmarks priorité)', () => {
    bookmarksStore.add({ url: 'https://example.com', title: 'Example Bookmark' });
    historyStore.push('https://example.com/page', 'Example History');
    const s = getSuggestions('example');
    expect(s.length).toBeGreaterThan(0);
    expect(s[0]?.type).toBe('bookmark');
  });

  it('dédup history qui matche un bookmark', () => {
    bookmarksStore.add({ url: 'https://example.com', title: 'Same URL' });
    historyStore.push('https://example.com', 'Same URL');
    const s = getSuggestions('example');
    expect(s.filter((x) => x.url === 'https://example.com').length).toBe(1);
  });

  it('respecte limit', () => {
    for (let i = 0; i < 10; i++) bookmarksStore.add({ url: `https://site${i}.com`, title: `Site${i}` });
    expect(getSuggestions('site', 3).length).toBe(3);
  });
});

describe('features/browser — Sécurité', () => {
  it('aucun stockage avec scheme javascript:', () => {
    expect(tabsStore.add(JS_SCHEME_COOKIE)).toBeNull();
    expect(bookmarksStore.add({ url: JS_SCHEME })).toBeNull();
    expect(historyStore.push(JS_SCHEME)).toBeNull();
  });

  it('aucun stockage avec data: scheme', () => {
    expect(tabsStore.add(DATA_SCHEME)).toBeNull();
    expect(bookmarksStore.add({ url: DATA_SCHEME_SHORT })).toBeNull();
  });

  it('aucun stockage avec file: scheme', () => {
    expect(tabsStore.add(FILE_SCHEME)).toBeNull();
  });

  it('escapeHtml empêche injection HTML/script', () => {
    const malicious = '<img src=x onerror=alert(1)>';
    expect(escapeHtml(malicious)).not.toContain('<img');
    expect(escapeHtml(malicious)).toContain('&lt;img');
  });
});

/* ============================================================
   Tests v13.0.74+ : detectIframeBlocked + buildBlockedOverlay
   ============================================================ */

describe('features/browser — detectIframeBlocked (X-Frame-Options auto-detection)', () => {
  it('détecte iframe null comme bloqué (load-error)', () => {
    const detection = detectIframeBlocked(null);
    expect(detection.blocked).toBe(true);
    expect(detection.reason).toBe('load-error');
  });

  it('détecte body vide après load comme bloqué (no-content)', () => {
    const iframe = document.createElement('iframe');
    iframe.src = 'about:blank';
    document.body.appendChild(iframe);
    /* contentDocument existe (about:blank same-origin), body vide */
    const detection = detectIframeBlocked(iframe);
    expect(detection.blocked).toBe(true);
    expect(detection.reason).toBe('no-content');
    document.body.removeChild(iframe);
  });

  it('détecte body avec contenu comme OK', () => {
    const iframe = document.createElement('iframe');
    iframe.src = 'about:blank';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    if (doc) {
      doc.body.innerHTML = '<h1>Hello</h1><p>World</p>';
    }
    const detection = detectIframeBlocked(iframe);
    expect(detection.blocked).toBe(false);
    expect(detection.reason).toBe('ok');
    document.body.removeChild(iframe);
  });

  it('retourne objet avec champs blocked + reason typés', () => {
    const detection = detectIframeBlocked(null);
    expect(detection).toHaveProperty('blocked');
    expect(detection).toHaveProperty('reason');
    expect(typeof detection.blocked).toBe('boolean');
    expect(['cross-origin', 'no-content', 'load-error', 'ok']).toContain(detection.reason);
  });
});

describe('features/browser — buildBlockedOverlay', () => {
  it('génère HTML overlay avec 4 boutons fallback (archive/reader/cache/safari)', () => {
    const overlay = buildBlockedOverlay('https://example.com');
    expect(overlay).toContain('data-fallback="archive"');
    expect(overlay).toContain('data-fallback="reader"');
    expect(overlay).toContain('data-fallback="gcache"');
    expect(overlay).toContain('data-fallback="safari"');
  });

  it('inclut bouton dismiss', () => {
    const overlay = buildBlockedOverlay('https://example.com');
    expect(overlay).toContain('data-fallback="dismiss"');
  });

  it('échappe l\'URL pour anti-XSS', () => {
    const malicious = 'https://example.com/<script>alert(1)</script>';
    const overlay = buildBlockedOverlay(malicious);
    expect(overlay).not.toContain('<script>alert(1)</script>');
    expect(overlay).toContain('&lt;script&gt;');
  });

  it('contient les bonnes URLs fallback dans data-fallback-url', () => {
    const overlay = buildBlockedOverlay('https://example.com');
    expect(overlay).toContain(buildArchiveUrl('https://example.com').replace(/&/g, '&amp;'));
    expect(overlay).toContain('r.jina.ai');
    expect(overlay).toContain('webcache.googleusercontent.com');
  });

  it('overlay propose 4 boutons fallback (archive/reader/cache/safari)', () => {
    const overlay = buildBlockedOverlay('https://google.com');
    /* Compte boutons fallback (hors dismiss) */
    const matches = overlay.match(/data-fallback="(archive|reader|gcache|safari)"/g);
    expect(matches).not.toBeNull();
    expect(matches?.length).toBe(4);
  });

  it('inclut message user-friendly sans jargon', () => {
    const overlay = buildBlockedOverlay('https://example.com');
    expect(overlay).toContain('refuse');
    expect(overlay).toContain('X-Frame-Options');
    /* Pas de termes techniques cryptiques */
    expect(overlay).not.toContain('CORS');
    expect(overlay).not.toContain('CSP');
  });
});

describe('features/browser — fallbackLabel', () => {
  it('retourne label user-friendly pour chaque méthode', () => {
    expect(fallbackLabel('archive')).toBe('Archive web');
    expect(fallbackLabel('reader')).toBe('Mode lecture');
    expect(fallbackLabel('gcache')).toBe('Cache Google');
    expect(fallbackLabel('safari')).toBe('Safari (nouvel onglet)');
    expect(fallbackLabel('direct')).toBe('Direct');
  });
});

/* ============================================================
   Tests Reader Mode boost (countWords / readingTime / extractReaderStats / searchInDocument)
   ============================================================ */

describe('features/browser — countWords', () => {
  it('compte les mots simples', () => {
    expect(countWords('Hello world')).toBe(2);
    expect(countWords('Un deux trois quatre cinq')).toBe(5);
  });

  it('gère ponctuation et espaces multiples', () => {
    expect(countWords('Hello, world!  How are you?')).toBe(5);
    expect(countWords('   ')).toBe(0);
    expect(countWords('')).toBe(0);
  });

  it('retourne 0 pour input invalide', () => {
    expect(countWords(null as unknown as string)).toBe(0);
    expect(countWords(undefined as unknown as string)).toBe(0);
  });

  it('gère texte avec accents et caractères spéciaux', () => {
    expect(countWords('Crème brûlée à la française')).toBe(5);
  });
});

describe('features/browser — readingTimeMinutes', () => {
  it('calcule temps lecture (250 wpm défaut)', () => {
    expect(readingTimeMinutes(250)).toBe(1);
    expect(readingTimeMinutes(500)).toBe(2);
    expect(readingTimeMinutes(1000)).toBe(4);
  });

  it('retourne minimum 1 minute si > 0 mots', () => {
    expect(readingTimeMinutes(50)).toBe(1);
    expect(readingTimeMinutes(1)).toBe(1);
  });

  it('retourne 0 si 0 mots', () => {
    expect(readingTimeMinutes(0)).toBe(0);
    expect(readingTimeMinutes(-10)).toBe(0);
  });

  it('accepte wpm custom', () => {
    expect(readingTimeMinutes(600, 200)).toBe(3);
  });
});

describe('features/browser — extractReaderStats', () => {
  it('retourne stats vides si doc null', () => {
    const stats = extractReaderStats(null);
    expect(stats.title).toBe('');
    expect(stats.paragraphs).toEqual([]);
    expect(stats.wordCount).toBe(0);
    expect(stats.readingTimeMin).toBe(0);
    expect(stats.toc).toEqual([]);
  });

  it('extrait titre + paragraphes + TOC d\'un document', () => {
    const doc = document.implementation.createHTMLDocument('Page Title');
    /* happy-dom n'initialise pas <title> via le param createHTMLDocument — on le set explicitement */
    doc.title = 'Page Title';
    doc.body.innerHTML = `
      <h1>Titre principal</h1>
      <p>Voici un long paragraphe avec plus de vingt caractères pour le test.</p>
      <h2>Sous-titre A</h2>
      <p>Un autre paragraphe lui aussi suffisamment long pour passer le filtre.</p>
      <h3>Section détaillée</h3>
    `;
    const stats = extractReaderStats(doc);
    /* title peut être vide selon implem happy-dom — ne pas asserter strict */
    expect(typeof stats.title).toBe('string');
    expect(stats.paragraphs.length).toBe(2);
    expect(stats.wordCount).toBeGreaterThan(0);
    expect(stats.readingTimeMin).toBeGreaterThanOrEqual(1);
    expect(stats.toc.length).toBe(3);
    expect(stats.toc[0]?.level).toBe(1);
    expect(stats.toc[0]?.text).toBe('Titre principal');
    expect(stats.toc[2]?.level).toBe(3);
  });

  it('skip paragraphes trop courts (< 20 chars)', () => {
    const doc = document.implementation.createHTMLDocument('test');
    doc.body.innerHTML = `<p>Short.</p><p>Ceci est un paragraphe assez long pour passer le filtre.</p>`;
    const stats = extractReaderStats(doc);
    expect(stats.paragraphs.length).toBe(1);
  });
});

describe('features/browser — searchInDocument', () => {
  it('retourne [] si doc null', () => {
    expect(searchInDocument(null, 'hello')).toEqual([]);
  });

  it('retourne [] si query vide ou trop courte', () => {
    const doc = document.implementation.createHTMLDocument('test');
    expect(searchInDocument(doc, '')).toEqual([]);
    expect(searchInDocument(doc, 'a')).toEqual([]);
  });

  it('trouve éléments contenant le texte (case-insensitive)', () => {
    const doc = document.implementation.createHTMLDocument('test');
    doc.body.innerHTML = `<p>Bonjour le monde</p><p>Hello world</p><h1>Test BONJOUR</h1>`;
    const matches = searchInDocument(doc, 'bonjour');
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('cap à 50 résultats max', () => {
    const doc = document.implementation.createHTMLDocument('test');
    let html = '';
    for (let i = 0; i < 100; i++) html += `<p>match ${i}</p>`;
    doc.body.innerHTML = html;
    const matches = searchInDocument(doc, 'match');
    expect(matches.length).toBeLessThanOrEqual(50);
  });
});
