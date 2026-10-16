/**
 * iPhone (audit 16.10.2026) : thèmes lisibles (contraste WCAG ≥ 4,5:1 CALCULÉ sur les vraies couleurs des thèmes de la page ;
 * le premier correctif, qui lisait le CSS du mode clair, avait recoloré les états en foncé sur fond noir — vu en vrai navigateur),
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
// Les VRAIS thèmes de la page (K._THEMES + accents), pas une copie : chacun doit être lisible sur SON fond.
const themes = new Function('K', html.slice(html.indexOf('K._THEMES = {'), html.indexOf('K._applyTheme = function')) + '; return K;')({});
const hexOf = (v) => v;

describe('chaque thème est lisible sur son propre fond (WCAG ≥ 4,5:1, calculé)', () => {
  for (const nom of ['dark', 'light', 'midnight']) {
    it(`thème « ${nom} » : texte, états et accents`, () => {
      const t = themes._THEMES[nom];
      const accents = nom === 'light' ? themes._ACCENTS_CLAIR : themes._ACCENTS;
      const paires = [['--ax-text'], ['--ax-text-2'], ['--ax-text-3'], ['--ax-blue'], ['--ax-warn'], ['--ax-ok'], ['--ax-err']];
      for (const [v] of paires) {
        expect(t[v], `${nom} ${v} défini`).toBeTruthy();
        expect(ratio(hexOf(t[v]), t['--ax-bg']), `${nom} ${v} ${t[v]} sur ${t['--ax-bg']}`).toBeGreaterThanOrEqual(4.5);
      }
      for (const a of ['gold', 'blue']) expect(ratio(accents[a], t['--ax-bg']), `${nom} accent ${a} ${accents[a]}`).toBeGreaterThanOrEqual(4.5);
    });
  }
  it('le mode du TÉLÉPHONE ne recolore plus les états sous un autre thème (fuite mesurée en vrai navigateur)', () => {
    const clair = html.slice(html.indexOf('@media (prefers-color-scheme:light){'), html.indexOf('/* v1.1.147 selection'));
    for (const v of ['--ax-blue', '--ax-warn', '--ax-ok', '--ax-err', '--ax-gold:']) expect(clair, v).not.toContain(v);
  });
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
