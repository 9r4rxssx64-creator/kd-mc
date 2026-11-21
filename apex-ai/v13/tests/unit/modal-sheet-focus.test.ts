import { afterEach, describe, expect, it, vi } from 'vitest';

import { modalSheet } from '../../ui/modal-sheet';

/* pc-config 3055 : après la fermeture d'une fenêtre (« Ouvrir une page », « Écrire », « Appeler »), taper SANS recliquer le champ perdait la saisie. */
afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers(); });

describe('modalSheet : le champ de saisie reprend le focus à la fermeture', () => {
  it('le champ qui avait le focus à l\'ouverture le retrouve', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<textarea id="ax-chat-text"></textarea><input id="autre">';
    const z = document.getElementById('ax-chat-text') as HTMLTextAreaElement; z.focus();
    const s = modalSheet.open({ title: 'Test', content: '<p>x</p>', actions: [] });
    (document.activeElement as HTMLElement | null)?.blur?.();
    s.close(); vi.advanceTimersByTime(400);
    expect(document.activeElement).toBe(z);
  });
  it('si le champ d\'origine a disparu, la saisie du chat reprend le focus', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<button id="b">b</button><textarea id="ax-chat-text"></textarea>';
    (document.getElementById('b') as HTMLElement).focus();
    const s = modalSheet.open({ title: 'Test', content: '<p>x</p>', actions: [] });
    document.getElementById('b')?.remove();
    s.close(); vi.advanceTimersByTime(400);
    expect(document.activeElement).toBe(document.getElementById('ax-chat-text'));
  });
  it('si l\'utilisateur a cliqué ailleurs entre-temps, on ne lui vole pas le focus', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<textarea id="ax-chat-text"></textarea><input id="autre">';
    const s = modalSheet.open({ title: 'Test', content: '<p>x</p>', actions: [] });
    const autre = document.getElementById('autre') as HTMLInputElement; autre.focus();
    s.close(); vi.advanceTimersByTime(400);
    expect(document.activeElement).toBe(autre);
  });
});
