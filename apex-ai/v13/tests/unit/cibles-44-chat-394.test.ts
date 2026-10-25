/**
 * v13.4.394 (pont 1076, Lenovo : 12 cibles < 44 px à 1250 px) : mesurées dans un vrai Chromium sur le shell du chat
 * (flèche « aller en bas » 40×40 au repos à cause de scale(.92), micro / oreille / trombone 36×44).
 * Ici : les règles qui fixent ces tailles ne peuvent plus repasser sous 44 px.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const lire = (f: string): string => readFileSync(`${process.cwd()}/${f}`, 'utf8');

describe('chat : cibles tactiles ≥ 44 px', () => {
  it('micro / oreille / trombone : 44 px de large', () => {
    const css = lire('assets/css/components.css');
    const ligne = css.split('\n').find((l) => l.includes('.ax-gs-358.ax-gs-358.ax-gs-358')) ?? '';
    expect(ligne).toMatch(/width:44px;flex:0 0 44px/);
    expect(ligne).not.toMatch(/36px/);
  });
  it('petit écran : les boutons icône du champ de saisie restent à 44 px', () => {
    const css = lire('assets/css/rescue.css');
    const bloc = css.slice(css.indexOf('@media (max-width: 400px)'));
    const regle = bloc.slice(bloc.indexOf('.ax-chat-input .ax-btn-icon {'), bloc.indexOf('}', bloc.indexOf('.ax-chat-input .ax-btn-icon {')));
    expect(regle).toMatch(/min-width: 44px/);
    expect(regle).toMatch(/min-height: 44px/);
  });
  it('flèche « aller en bas » : 44 px, et jamais réduite par un scale au repos', () => {
    const src = lire('features/chat/chat-view-template.ts');
    const fab = src.slice(src.indexOf('.ax-scroll-bottom-fab {'), src.indexOf('.ax-scroll-bottom-fab.visible'));
    expect(fab).toMatch(/width: 44px;\s*height: 44px;/);
    expect(fab).not.toMatch(/scale\(0\.92\)/);
  });
});
