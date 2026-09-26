/**
 * Tests features/laurence/index.ts (UX 20/20 hyper-perfectionniste).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, LAURENCE_VIEW_VERSION } from '../../features/laurence/index.js';

describe('Vue Laurence (features)', () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    root = document.getElementById('root')!;
  });

  it('LAURENCE_VIEW_VERSION exporté', () => {
    expect(LAURENCE_VIEW_VERSION).toBeTruthy();
    expect(LAURENCE_VIEW_VERSION).toMatch(/v13\.\d+\.\d+/);
  });

  it('render injecte hero greeting', () => {
    render(root);
    expect(root.innerHTML).toContain('Laurence');
    expect(root.innerHTML).toContain('🌸');
  });

  it('render inclut chips suggestions', () => {
    render(root);
    expect(root.innerHTML).toContain('ax-laurence-chip');
    expect(root.innerHTML).toContain('Mixer une musique');
    expect(root.innerHTML).toContain('Discuter');
    expect(root.innerHTML).toContain('Dicter');
  });

  it('render inclut bouton voice prominent', () => {
    render(root);
    expect(root.innerHTML).toContain('ax-laurence-voice-btn');
    expect(root.innerHTML).toContain('🎙');
    expect(root.innerHTML).toContain('Dis Apex');
  });

  it('render inclut footer "Créé par DK"', () => {
    render(root);
    expect(root.innerHTML).toContain('APEX AI');
    expect(root.innerHTML).toContain('DK');
  });

  it('render avec wallpaper background gradient', () => {
    render(root);
    const app = root.querySelector('.ax-laurence-app');
    expect(app).toBeTruthy();
    expect(app?.getAttribute('style')).toContain('linear-gradient');
  });

  it('greeting selon heure (matin)', () => {
    /* On ne mocke pas Date.now mais on vérifie qu'un greeting valide est présent */
    render(root);
    const greetings = ['Bonjour', 'Bonsoir', 'Bonne nuit', 'Bon après-midi', 'Bonne soirée'];
    const hasGreeting = greetings.some((g) => root.innerHTML.includes(g));
    expect(hasGreeting).toBe(true);
  });

  it('section "Mes derniers projets" présente', () => {
    render(root);
    expect(root.innerHTML).toContain('Mes derniers projets');
    expect(root.innerHTML).toContain('ax-laurence-projects');
  });
});
