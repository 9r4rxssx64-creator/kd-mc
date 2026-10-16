/**
 * iPhone (audit 16.10.2026) : mode clair lisible (contraste WCAG ≥ 4,5:1 MESURÉ sur les vraies couleurs de la page),
 * cibles tactiles de 44 px, liste de messages annoncée aux lecteurs d'écran, appareil photo AU CHOIX, et plus de
 * textes techniques affichés à Kevin.
 */
import { describe, it, expect } from 'vitest';
import { readIndex } from './client-extract.js';

const lum = (hex) => {
  const c = hex.replace('#', '').match(/../g).map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const html = readIndex();
const clair = html.slice(html.indexOf('@media (prefers-color-scheme:light){'), html.indexOf('/* v1.1.147 selection'));
const tok = (n) => (clair.match(new RegExp('--ax-' + n + ':(#[0-9a-fA-F]{6})')) || [])[1];

describe('mode clair : contrastes mesurés', () => {
  for (const [nom, min] of [['text', 4.5], ['text-2', 4.5], ['text-3', 4.5], ['gold', 4.5], ['blue', 4.5], ['warn', 4.5], ['ok', 4.5], ['err', 4.5]]) {
    it(`--ax-${nom} ≥ ${min}:1 sur le fond clair et sur le blanc`, () => {
      const c = tok(nom); expect(c, 'couleur définie en mode clair').toBeTruthy();
      expect(ratio(c, tok('bg'))).toBeGreaterThanOrEqual(min);
      expect(ratio(c, tok('bg-2'))).toBeGreaterThanOrEqual(min);
    });
  }
});

describe('confort iPhone', () => {
  it('les boutons de la barre d\'envoi font 44 px', () => { expect(html).toMatch(/\.chat-attach\{width:44px;height:44px;/); });
  it('la liste des messages est annoncée (role=log, aria-live)', () => { expect(html).toMatch(/id="chat-msgs" role="log" aria-live="polite"/); });
  it('l\'envoi de photo laisse le choix photothèque / appareil photo (plus de capture forcé)', () => {
    const i = html.indexOf('id="chat-media-input"');
    expect(html.slice(i, i + 160)).not.toContain('capture=');
  });
  it('plus de texte technique à l\'écran', () => {
    for (const t of ['token absent', 'navigateur ancien', 'peers convs', 'Reconnexion difficile : \' +', 'Temps réel refusé : \' +']) expect(html, t).not.toContain(t);
    expect(html).toContain('Ta session a expiré — reconnecte-toi avec ton numéro');
  });
});
