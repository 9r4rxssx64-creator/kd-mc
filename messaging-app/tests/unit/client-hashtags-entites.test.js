// Garde (audit client 10/2026) — #hashtags et @mentions ne cassent plus le HTML.
//
// _renderHashtags / _renderMentions tournent sur la sortie de _renderMarkdown, donc
// sur du HTML DÉJÀ échappé et balisé. L'ancien replace global :
//   • transformait l'entité « &#39; » (apostrophe) en « &<span…>#39</span>; » →
//     toute apostrophe d'un message s'affichait cassée ;
//   • insérait un <span class="…"> DANS un href="…" d'un lien automatique
//     (https://site/#ancre, mailto:a@b.c) → attribut cassé / injection de balise.
//
// Discriminant : sans le correctif, les tests 1, 2 et 3 échouent.
import { describe, it, expect } from 'vitest';
import { loadDefs, realEsc, readIndex } from './client-extract.js';

function charger() {
  const html = readIndex();
  const K = { user: { pseudo: 'kevin' } };
  const markers = [
    'const kcall = (name, args, opts) => {',
    'K._mapHtmlText = function(html, fn){',
    'K._renderHashtags = function(html){',
    'K._renderMentions = function(html){',
    'K._renderMarkdown = function(rawText){',
  ].filter((m) => html.includes(m));
  return loadDefs(markers, { K, esc: realEsc() }).K;
}
const rendu = (K, txt) => K._renderHashtags(K._renderMentions(K._renderMarkdown(txt)));

describe('Hashtags / mentions sur HTML échappé (audit client 10/2026)', () => {
  it('1. une apostrophe reste une apostrophe (entité &#39; intacte)', () => {
    const K = charger();
    const out = rendu(K, "c'est l'heure");
    expect(out).toBe('c&#39;est l&#39;heure');
    const doc = document.createElement('div');
    doc.innerHTML = out;
    expect(doc.textContent).toBe("c'est l'heure");
  });

  it('2. un lien auto avec #ancre : rien n\'est injecté dans le href', () => {
    const K = charger();
    const out = rendu(K, 'voir https://example.com/page#section ok');
    const doc = document.createElement('div');
    doc.innerHTML = out;
    const a = doc.querySelector('a');
    expect(a).not.toBeNull();
    expect(a.getAttribute('href')).toBe('https://example.com/page#section');
    expect(doc.querySelectorAll('a [class], a span').length).toBe(0);
  });

  it('3. un e-mail auto-lié : la mention @ n\'entre pas dans mailto:', () => {
    const K = charger();
    const out = rendu(K, 'écris à bob@example.com');
    const doc = document.createElement('div');
    doc.innerHTML = out;
    const a = doc.querySelector('a');
    expect(a.getAttribute('href')).toBe('mailto:bob@example.com');
    expect(a.querySelector('span')).toBeNull();
  });

  it('4. comportement conservé : #tag et @pseudo dans le texte sont mis en forme', () => {
    const K = charger();
    const out = rendu(K, 'salut @kevin, on parle de #projet_x et (#apex)');
    const doc = document.createElement('div');
    doc.innerHTML = out;
    const tags = [...doc.querySelectorAll('.hashtag')].map((s) => s.textContent);
    expect(tags).toEqual(['#projet_x', '#apex']);
    expect(doc.querySelector('.mention.mention-me').textContent).toBe('@kevin');
    // le clic passe par l'action déléguée, pas par un onclick inline
    expect(doc.querySelector('.hashtag').getAttribute('data-kcall')).toBe('_searchByHashtag');
    expect(out).not.toContain('onclick');
  });

  it('5. pas de hashtag au milieu d\'un mot ni dans du code', () => {
    const K = charger();
    const out = rendu(K, 'C#12 et `#nocode`');
    expect(out).not.toContain('class="hashtag"');
  });
});
