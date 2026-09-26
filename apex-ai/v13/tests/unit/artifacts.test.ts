/**
 * APEX v13 — Tests Artifacts / Canvas (extraction + aperçu + session).
 */
import { describe, it, expect, beforeEach } from 'vitest';

import {
  extractArtifacts,
  pickBestArtifact,
  hasArtifact,
  buildPreviewDoc,
  setCanvasArtifact,
  readCanvasArtifact,
  type Artifact,
} from '../../services/ai/artifacts.js';

const htmlBlock = '```html\n<!doctype html><html><body><h1>Salut</h1></body></html>\n```';
const svgBlock = '```svg\n<svg width="100" height="100"><circle cx="50" cy="50" r="40"/></svg>\n```';
const jsBlock = '```js\nfunction add(a, b) { return a + b; } // un helper assez long pour compter\n```';

describe('artifacts — extractArtifacts', () => {
  it('extrait un bloc HTML et le marque previewable', () => {
    const arts = extractArtifacts(`Voici :\n${htmlBlock}`);
    expect(arts).toHaveLength(1);
    expect(arts[0]!.kind).toBe('html');
    expect(arts[0]!.previewable).toBe(true);
  });
  it('détecte un SVG', () => {
    const arts = extractArtifacts(svgBlock);
    expect(arts[0]!.kind).toBe('svg');
    expect(arts[0]!.previewable).toBe(true);
  });
  it('un bloc code non-web = kind code, non previewable', () => {
    const arts = extractArtifacts(jsBlock);
    expect(arts[0]!.kind).toBe('code');
    expect(arts[0]!.previewable).toBe(false);
  });
  it('ignore un bloc trop court', () => {
    expect(extractArtifacts('```js\nx=1\n```')).toHaveLength(0);
  });
  it('détecte html sans lang via <!doctype>', () => {
    const arts = extractArtifacts('```\n<!doctype html><html><body>assez long pour dépasser le seuil</body></html>\n```');
    expect(arts[0]!.kind).toBe('html');
  });
  it('extrait plusieurs blocs dans l\'ordre', () => {
    const arts = extractArtifacts(`${jsBlock}\ntexte\n${htmlBlock}`);
    expect(arts).toHaveLength(2);
    expect(arts[0]!.kind).toBe('code');
    expect(arts[1]!.kind).toBe('html');
  });
  it('hasArtifact', () => {
    expect(hasArtifact(htmlBlock)).toBe(true);
    expect(hasArtifact('juste du texte')).toBe(false);
  });
});

describe('artifacts — pickBestArtifact', () => {
  it('préfère le previewable', () => {
    const a = pickBestArtifact(`${jsBlock}\n${htmlBlock}`);
    expect(a!.kind).toBe('html');
  });
  it('sinon le premier', () => {
    const a = pickBestArtifact(jsBlock);
    expect(a!.kind).toBe('code');
  });
  it('null si aucun', () => {
    expect(pickBestArtifact('texte')).toBeNull();
  });
});

describe('artifacts — buildPreviewDoc', () => {
  it('html complet rendu tel quel', () => {
    const art = extractArtifacts(htmlBlock)[0]!;
    expect(buildPreviewDoc(art)).toContain('<h1>Salut</h1>');
  });
  it('svg wrappé dans un doc', () => {
    const art = extractArtifacts(svgBlock)[0]!;
    const doc = buildPreviewDoc(art);
    expect(doc).toContain('<!doctype html>');
    expect(doc).toContain('<svg');
  });
  it('html partiel wrappé', () => {
    const art: Artifact = { id: 'x', kind: 'html', lang: 'html', code: '<button>ok</button> avec assez de longueur ici', previewable: true };
    const doc = buildPreviewDoc(art);
    expect(doc.startsWith('<!doctype html>')).toBe(true);
    expect(doc).toContain('<button>ok</button>');
  });
});

describe('artifacts — session canvas', () => {
  beforeEach(() => sessionStorage.clear());
  it('set + read roundtrip', () => {
    const art = extractArtifacts(htmlBlock)[0]!;
    setCanvasArtifact(art);
    const back = readCanvasArtifact();
    expect(back!.code).toBe(art.code);
    expect(back!.kind).toBe('html');
  });
  it('read null si vide', () => {
    expect(readCanvasArtifact()).toBeNull();
  });
  it('read null si corrompu', () => {
    sessionStorage.setItem('apex_v13_canvas_artifact', '{bad');
    expect(readCanvasArtifact()).toBeNull();
  });
});
