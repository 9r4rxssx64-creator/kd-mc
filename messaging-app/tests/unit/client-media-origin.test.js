// Garde SÉCU (audit client 10/2026) — K._mediaSrc n'envoie JAMAIS nos identifiants
// (?token= jeton de session, ?mt= ticket média, en-tête Bearer) hors de l'API.
//
// La faille : l'URL d'un média vient du marqueur APXMEDIA1 écrit par l'AUTRE
// personne. K._mediaSrc collait ?token=<session> sur toute URL commençant par
// « http » → un message piégé {u:"https://evil.example/x.png"} faisait charger
// l'image par la victime avec SON jeton dans l'URL (vol de session).
//
// Discriminant : sans le correctif, _mediaSrc('https://evil.example/x.png')
// renvoie 'https://evil.example/x.png?token=SECRET' → les tests 1-3 échouent.
import { describe, it, expect, vi } from 'vitest';
import { loadDefs, realEsc, readIndex } from './client-extract.js';

const API_BASE = 'https://apex-chat-api.9r4rxssx64.workers.dev';

function setup({ ticket } = {}) {
  const K = { token: 'SECRET-SESSION', _ensureMediaTicket: vi.fn() };
  if (ticket) K._mediaTicket = { v: ticket, exp: Date.now() + 600000 };
  const html = readIndex();
  // _API_ORIGIN / _mediaUrlAllowed / kcall n'existent qu'avec les correctifs :
  // chargés s'ils sont là (sans eux, l'ancien _mediaSrc tourne tel quel).
  const markers = ['const kcall = (name, args, opts) => {', 'K._API_ORIGIN = ', 'K._mediaUrlAllowed = function(url){',
    'K._mediaSrc = function(url){', 'K._renderMediaEl = function(m){']
    .filter((m) => html.includes(m))
    .sort((a, b) => html.indexOf(a) - html.indexOf(b));
  return loadDefs(markers, { K, API_BASE, esc: realEsc(), _safeCatch: () => {} }).K;
}

describe('K._mediaSrc : identifiants uniquement vers l\'API (audit client 10/2026)', () => {
  it('1. une URL d\'une autre origine ne reçoit PAS le jeton de session', () => {
    const K = setup();
    const out = K._mediaSrc('https://evil.example/x.png');
    expect(out).not.toContain('SECRET-SESSION');
    expect(out).toBe('');
  });

  it('2. une URL d\'une autre origine ne reçoit PAS le ticket média', () => {
    const K = setup({ ticket: 'TICKET-123' });
    expect(K._mediaSrc('https://evil.example/x.png')).toBe('');
    expect(K._mediaSrc('http://apex-chat-api.9r4rxssx64.workers.dev.evil.example/a')).toBe('');
  });

  it('3. pièges d\'URL : userinfo « @ », protocole-relatif, sous-domaine, javascript:', () => {
    const K = setup();
    for (const u of [
      '@evil.example/x.png',                                  // API_BASE + '@evil…' → hôte evil
      'https://apex-chat-api.9r4rxssx64.workers.dev@evil.example/x.png',
      '//evil.example/x.png',
      'https://evil.example/api/media/abc',
      'javascript:alert(1)',
      'data:image/png;base64,AAAA',
    ]) {
      const out = K._mediaSrc(u);
      expect(out, u).not.toContain('SECRET-SESSION');
      expect(out, u).toBe('');
    }
  });

  it('4. comportement conservé : chemin relatif /api/media/… → API + ticket/jeton', () => {
    const K = setup();
    expect(K._mediaSrc('/api/media/abc')).toBe(API_BASE + '/api/media/abc?token=SECRET-SESSION');
    const K2 = setup({ ticket: 'TICKET-123' });
    expect(K2._mediaSrc('/api/media/abc')).toBe(API_BASE + '/api/media/abc?mt=TICKET-123');
    expect(K2._mediaSrc(API_BASE + '/api/media/abc')).toBe(API_BASE + '/api/media/abc?mt=TICKET-123');
  });

  it('5. rendu : un média hors API devient un encart inerte (pas de <img>/<video> chargé)', () => {
    const K = setup();
    const html = K._renderMediaEl({ media_url: 'https://evil.example/x.png', media_type: 'image/png', media_name: 'x.png' });
    expect(html).not.toMatch(/<img|<video|<audio|<a /);
    expect(html).not.toContain('evil.example');
    expect(html).not.toContain('SECRET-SESSION');
    const ok = K._renderMediaEl({ media_url: '/api/media/abc', media_type: 'image/png', media_name: 'x.png' });
    expect(ok).toContain('<img src="' + API_BASE + '/api/media/abc?token=SECRET-SESSION"');
    // Le tap ne passe plus par un onclick="window.open('…')" (cf. kcall)
    expect(ok).not.toContain("window.open(");
  });

  it('6. média chiffré : pas de fetch avec Bearer vers une autre origine', () => {
    const html = readIndex();
    const i = html.indexOf('K._hydrateEncMedia = async function(){');
    const b = html.slice(i, i + 1500);
    const guard = b.indexOf("if(!encSrc) throw");
    const fetchAt = b.indexOf('await fetch(encSrc');
    expect(guard).toBeGreaterThan(-1);
    expect(fetchAt).toBeGreaterThan(guard);
  });
});
