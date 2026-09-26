/**
 * v13.4.345 — détection d'intention → outil AUTO (Kevin « tous les outils utilisés
 * auto suivant les questions »). CRITIQUE : 0 faux positif sur du chat normal.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { detectToolIntent } from '../../services/ai/tool-intent.js';

describe('v13.4.345 — detectToolIntent', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* noop */ } });

  it('audit sécurité / secrets → /audit', () => {
    expect(detectToolIntent('audite la sécurité')).toBe('/audit');
    expect(detectToolIntent('scanne les secrets du repo')).toBe('/audit');
    expect(detectToolIntent('y a-t-il des fuites de secrets ?')).toBe('/audit');
    expect(detectToolIntent('lance gitleaks')).toBe('/audit');
  });

  it('pentest → /pentest (+ cible kd-mc.com si URL)', () => {
    expect(detectToolIntent('pentest world monitor')).toBe('/pentest');
    expect(detectToolIntent('fais un pentest sur https://kd-mc.com/worldmonitor/'))
      .toBe('/pentest https://kd-mc.com/worldmonitor/');
    /* URL tierce → on NE passe PAS l'URL (le handler refuserait de toute façon) */
    expect(detectToolIntent('pentest https://google.com')).toBe('/pentest');
  });

  it('audit perf / lighthouse → /perf (+ cible kd-mc.com si URL)', () => {
    expect(detectToolIntent('audit perf')).toBe('/perf');
    expect(detectToolIntent('lighthouse de mon site')).toBe('/perf');
    expect(detectToolIntent('audit perf https://kd-mc.com/osint/')).toBe('/perf https://kd-mc.com/osint/');
  });

  it('URL seule ou lecture de page → /web', () => {
    expect(detectToolIntent('https://example.com/article')).toBe('/web https://example.com/article');
    expect(detectToolIntent('lis cette page https://example.com/x')).toBe('/web https://example.com/x');
    expect(detectToolIntent('résume https://news.com/y')).toBe('/web https://news.com/y');
  });

  it('NE déclenche PAS sur du chat normal (0 faux positif)', () => {
    const normals = [
      'bonjour, comment ça va ?',
      'explique-moi la sécurité informatique en général',
      'je veux parler de performance au travail',
      'va sur le marché demain matin',
      'quelle est la vitesse de la lumière ?',
      'peux-tu m\'aider avec mon site ?',
      'donne-moi une recette de cuisine',
      '/audit', /* déjà une slash-commande → géré ailleurs */
    ];
    for (const n of normals) expect(detectToolIntent(n), n).toBeNull();
  });

  it('une URL interne kd-mc.com seule NE part PAS en Agent-Reach', () => {
    expect(detectToolIntent('https://kd-mc.com/worldmonitor/')).toBeNull();
  });

  it('kill-switch localStorage apex_v13_auto_tools=off → null', () => {
    localStorage.setItem('apex_v13_auto_tools', 'off');
    expect(detectToolIntent('audite la sécurité')).toBeNull();
    expect(detectToolIntent('https://example.com')).toBeNull();
  });
});
