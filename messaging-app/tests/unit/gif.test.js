import { describe, it, expect } from 'vitest';
import { giphySearchUrl, giphyTrendingUrl, mapGiphyResults } from '../../lib/gif.js';

describe('giphySearchUrl', () => {
  it('encode la requête + limite bornée + clé', () => {
    const u = giphySearchUrl('chat mignon', 'KEY123');
    expect(u).toContain('/search?api_key=KEY123');
    expect(u).toContain('q=chat%20mignon');
    expect(u).toContain('limit=24');
    expect(u).toContain('rating=pg-13');
  });
  it('borne la limite [1,50] et défaut 24', () => {
    expect(giphySearchUrl('x', 'k', 999)).toContain('limit=50');
    expect(giphySearchUrl('x', 'k', 0)).toContain('limit=24');
    expect(giphySearchUrl('x', 'k', 5)).toContain('limit=5');
  });
  it('tronque une requête trop longue + query vide', () => {
    const long = 'a'.repeat(200);
    expect(giphySearchUrl(long, 'k')).toContain('q=' + 'a'.repeat(100));
    expect(giphySearchUrl(undefined, 'k')).toContain('q=&');
  });
});

describe('giphyTrendingUrl', () => {
  it('trending avec clé + limite', () => {
    expect(giphyTrendingUrl('K')).toContain('/trending?api_key=K');
    expect(giphyTrendingUrl('K', 60)).toContain('limit=50');
    expect(giphyTrendingUrl('K', 0)).toContain('limit=24');
  });
});

describe('mapGiphyResults', () => {
  it('mappe vers { id, title, preview, full }', () => {
    const json = { data: [{
      id: 'abc', title: 'Salut',
      images: {
        fixed_width_small: { url: 'https://g/s.gif' },
        downsized_medium: { url: 'https://g/m.gif' },
      },
    }]};
    expect(mapGiphyResults(json)).toEqual([
      { id: 'abc', title: 'Salut', preview: 'https://g/s.gif', full: 'https://g/m.gif', mime: 'image/gif' },
    ]);
  });
  it('replis preview/full si rendition manquante', () => {
    const r = mapGiphyResults({ data: [{ id: '1', images: { fixed_width: { url: 'https://g/fw.gif' } } }] });
    expect(r[0]).toMatchObject({ preview: 'https://g/fw.gif', full: 'https://g/fw.gif', title: 'GIF' });
  });
  it('utilise original comme dernier repli pour full', () => {
    const r = mapGiphyResults({ data: [{ id: '2', images: {
      fixed_width_small: { url: 'https://g/s.gif' }, original: { url: 'https://g/o.gif' } } }] });
    expect(r[0].full).toBe('https://g/o.gif');
  });
  it('id manquant → chaîne vide (défaut)', () => {
    const r = mapGiphyResults({ data: [{ images: { fixed_width: { url: 'https://g/x.gif' } } }] });
    expect(r[0].id).toBe('');
  });
  it('ignore les entrées sans URL exploitable', () => {
    expect(mapGiphyResults({ data: [{ id: 'x', images: {} }, { id: 'y' }, null] })).toEqual([]);
  });
  it('json invalide → []', () => {
    expect(mapGiphyResults(null)).toEqual([]);
    expect(mapGiphyResults({})).toEqual([]);
    expect(mapGiphyResults({ data: 'nope' })).toEqual([]);
  });
  it('expose window.ApexGif', () => {
    expect(window.ApexGif.mapGiphyResults).toBe(mapGiphyResults);
  });
});
