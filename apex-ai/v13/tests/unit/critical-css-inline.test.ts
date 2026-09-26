// @vitest-environment node
/**
 * v13.4.223 — Test régression critical CSS inline v13.4.222.
 *
 * Garantit que le `<style nonce="APEX_BOOT_NONCE">` injecté dans
 * apex-ai/v13/index.html (LCP optim 150-250ms gain iPhone Safari)
 * reste en place et bien formé.
 *
 * Anti-régression : si quelqu'un retire ce block ou casse sa structure,
 * ce test fail au prochain push → CI rouge → Issue GitHub auto.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const INDEX_HTML = readFileSync(
  join(import.meta.dirname ?? __dirname, '..', '..', 'index.html'),
  'utf-8',
);

describe('Critical CSS inline (v13.4.222 LCP gain)', () => {
  it('<style nonce="APEX_BOOT_NONCE"> block présent dans <head>', () => {
    /* Pattern : <style nonce="APEX_BOOT_NONCE"> ... </style> AVANT </head> */
    expect(INDEX_HTML).toMatch(/<style\s+nonce="APEX_BOOT_NONCE">[\s\S]+?#apex-splash[\s\S]+?<\/style>/);
  });

  it('contient les selectors critiques pour 1st paint (html, body, #apex-root, #apex-splash)', () => {
    const criticalMatch = INDEX_HTML.match(/<style\s+nonce="APEX_BOOT_NONCE">([\s\S]+?)<\/style>/);
    expect(criticalMatch).not.toBeNull();
    const css = criticalMatch?.[1] ?? '';
    expect(css).toContain('html');
    expect(css).toContain('body');
    expect(css).toContain('#apex-root');
    expect(css).toContain('#apex-splash');
    expect(css).toContain('background');
    expect(css).toContain('#08080f'); /* couleur dark theme apex */
  });

  it('contient anti-FOUC PWA iOS standalone @media', () => {
    const criticalMatch = INDEX_HTML.match(/<style\s+nonce="APEX_BOOT_NONCE">([\s\S]+?)<\/style>/);
    const css = criticalMatch?.[1] ?? '';
    expect(css).toContain('display-mode: standalone');
    expect(css).toContain('safe-area-inset');
  });

  it('color-scheme: dark présent (v13.4.221)', () => {
    const criticalMatch = INDEX_HTML.match(/<style\s+nonce="APEX_BOOT_NONCE">([\s\S]+?)<\/style>/);
    const css = criticalMatch?.[1] ?? '';
    expect(css).toContain('color-scheme: dark');
  });

  it('block critical CSS reste sous 2KB raw (budget perf)', () => {
    const criticalMatch = INDEX_HTML.match(/<style\s+nonce="APEX_BOOT_NONCE">([\s\S]+?)<\/style>/);
    const css = criticalMatch?.[1] ?? '';
    /* Doit rester minimal — si quelqu'un ajoute 5KB, c'est trop = LCP négatif */
    expect(css.length).toBeLessThan(2048);
    expect(css.length).toBeGreaterThan(200); /* min sensé */
  });

  it('<style> placé AVANT premiers <link rel="stylesheet"> (priorité paint)', () => {
    const styleIdx = INDEX_HTML.indexOf('<style nonce="APEX_BOOT_NONCE">');
    const firstStylesheetIdx = INDEX_HTML.indexOf('<link rel="stylesheet"');
    expect(styleIdx).toBeGreaterThan(0);
    expect(firstStylesheetIdx).toBeGreaterThan(styleIdx);
  });
});
