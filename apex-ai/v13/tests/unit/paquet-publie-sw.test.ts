/**
 * 30.10.2026 : en reconstruisant `apex-ai-v13/` (copie de `dist/`), le service worker `sw.js` a disparu de la publication (13.4.396 et 13.4.397) :
 * apex-ai.kd-mc.com/sw.js répondait 404, plus de hors-ligne ni de mise à jour. `dist/` ne contient PAS sw.js : il se copie à part.
 * Ce garde exige que le paquet publié ait son sw.js, identique à la source, et son manifeste.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const racine = `${process.cwd()}/../../apex-ai-v13`;

describe('paquet publié apex-ai-v13/', () => {
  it('sw.js présent et identique à la source apex-ai/v13/sw.js', () => {
    expect(existsSync(`${racine}/sw.js`)).toBe(true);
    expect(readFileSync(`${racine}/sw.js`, 'utf8')).toBe(readFileSync(`${process.cwd()}/sw.js`, 'utf8'));
  });
  it('manifest.json et index.html présents', () => {
    expect(existsSync(`${racine}/manifest.json`)).toBe(true);
    expect(existsSync(`${racine}/index.html`)).toBe(true);
  });
});
