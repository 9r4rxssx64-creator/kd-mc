import { describe, it, expect } from 'vitest';
import { extractLinks, mediaKind, collectConversationMedia } from '../../lib/media-gallery.js';

describe('extractLinks', () => {
  it('extrait http(s), sans doublon, ordre conservé', () => {
    const t = 'voir https://a.com et http://b.io puis https://a.com encore';
    expect(extractLinks(t)).toEqual(['https://a.com', 'http://b.io']);
  });
  it('retire la ponctuation finale collée', () => {
    expect(extractLinks('lien : https://ex.com/page).')).toEqual(['https://ex.com/page']);
    expect(extractLinks('(https://ex.com/x;)')).toEqual(['https://ex.com/x']);
  });
  it('vide / non-string → []', () => {
    expect(extractLinks('')).toEqual([]);
    expect(extractLinks(null)).toEqual([]);
    expect(extractLinks(42)).toEqual([]);
    expect(extractLinks('aucun lien ici')).toEqual([]);
  });
});

describe('mediaKind', () => {
  it('voix (data ou trop volumineux)', () => {
    expect(mediaKind({ voice_data: 'x' })).toBe('voice');
    expect(mediaKind({ voice_too_large: true })).toBe('voice');
  });
  it('image inline / mime image / vidéo / fichier', () => {
    expect(mediaKind({ image_data: 'data:...' })).toBe('image');
    expect(mediaKind({ media_url: '/m/1', media_type: 'image/png' })).toBe('image');
    expect(mediaKind({ media_url: '/m/2', media_type: 'video/mp4' })).toBe('video');
    expect(mediaKind({ media_url: '/m/3', media_type: 'application/pdf' })).toBe('file');
    expect(mediaKind({ media_url: '/m/4' })).toBe('file'); // mime absent → fichier
  });
  it('null : rien, supprimé, texte seul', () => {
    expect(mediaKind(null)).toBe(null);
    expect(mediaKind({ image_data: 'x', deleted: true })).toBe(null);
    expect(mediaKind({ text: 'coucou' })).toBe(null);
  });
});

describe('collectConversationMedia', () => {
  const msgs = [
    { id: 'a', ts: 10, image_data: 'data:img', media_name: 'p1.jpg' },
    { id: 'b', ts: 20, media_url: '/m/b', media_type: 'video/mp4', media_name: 'clip.mp4', media_enc: true },
    { id: 'c', ts: 30, media_url: '/m/c', media_type: 'application/pdf', media_name: 'cv.pdf' },
    { id: 'd', ts: 40, voice_data: 'v', voice_text: 'salut' },
    { id: 'e', ts: 50, text: 'regarde https://x.io et https://y.io' },
    { id: 'f', ts: 60, media_url: '/m/f', media_type: 'image/png', text: 'photo https://z.io' },
    { id: 'g', ts: 70, text: 'supprimé https://no.io', deleted: true },
  ];
  const r = collectConversationMedia(msgs);

  it('compte correct par onglet (supprimé ignoré)', () => {
    expect(r.counts).toEqual({ media: 3, files: 1, voices: 1, links: 3 });
  });
  it('médias = images+vidéos, plus récent d’abord', () => {
    expect(r.media.map(x => x.id)).toEqual(['f', 'b', 'a']);
    expect(r.media[1].enc).toBe(true); // vidéo chiffrée
  });
  it('fichiers, vocaux', () => {
    expect(r.files.map(x => x.id)).toEqual(['c']);
    expect(r.voices[0]).toMatchObject({ id: 'd', text: 'salut' });
  });
  it('liens (même depuis un message avec média), triés récents d’abord', () => {
    expect(r.links.map(x => x.url)).toEqual(['https://z.io', 'https://x.io', 'https://y.io']);
    expect(r.links[0].id).toBe('f');
  });
  it('entrée non-tableau → tout vide', () => {
    const e = collectConversationMedia(null);
    expect(e.counts).toEqual({ media: 0, files: 0, voices: 0, links: 0 });
  });
  it('expose window.ApexGallery', () => {
    expect(window.ApexGallery.collectConversationMedia).toBe(collectConversationMedia);
  });

  it('valeurs par défaut : ts absent, noms/types/textes manquants', () => {
    const r2 = collectConversationMedia([
      { id: 'img', image_data: 'd' },                                  // pas de ts/type/name
      { id: 'vid', media_url: '/v', media_type: 'video/webm' },        // pas de name
      { id: 'fic', media_url: '/f' },                                  // fichier sans type ni name
      { id: 'voc', voice_data: 'z' },                                  // pas de voice_text
      { id: 'lnk', text: 'a https://d.io b' },                         // lien sans ts
    ]);
    expect(r2.counts).toEqual({ media: 2, files: 1, voices: 1, links: 1 });
    const img = r2.media.find(x => x.id === 'img');
    expect(img).toMatchObject({ ts: 0, mime: '', name: '', url: '', enc: false });
    expect(r2.files[0]).toMatchObject({ name: 'fichier' });
    expect(r2.voices[0]).toMatchObject({ text: '' });
    expect(r2.links[0]).toMatchObject({ ts: 0, url: 'https://d.io' });
  });
});
