/**
 * v13.4.398 (cloud-installer 2632 / 2637, Kevin 17.11 : « qui a fait quoi, de tout le domaine, chaque app ») :
 * Apex AI écrit au journal du domaine (`window.kdmcJournal`) après un enregistrement RÉUSSI, sans jamais envoyer le texte d'un message
 * ni un nom de projet ; sans le script du domaine, aucune erreur. Et le bouton de fermeture des notifications ne rétrécit plus (43×43 mesuré).
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { journalDomaine } from '../../ui/journal.js';

const lire = (f: string): string => readFileSync(`${process.cwd()}/${f}`, 'utf8');

describe('journalDomaine', () => {
  afterEach(() => {
    delete (window as unknown as { kdmcJournal?: unknown }).kdmcJournal;
  });
  it('appelle window.kdmcJournal avec la phrase et le type', () => {
    const f = vi.fn();
    (window as unknown as { kdmcJournal: unknown }).kdmcJournal = f;
    journalDomaine('projet créé');
    journalDomaine('message envoyé à Apex', 'message');
    expect(f).toHaveBeenNthCalledWith(1, 'projet créé', undefined);
    expect(f).toHaveBeenNthCalledWith(2, 'message envoyé à Apex', 'message');
  });
  it('coupe la phrase à 180 caractères', () => {
    const f = vi.fn();
    (window as unknown as { kdmcJournal: unknown }).kdmcJournal = f;
    journalDomaine('y'.repeat(500));
    expect((f.mock.calls[0]?.[0] as string).length).toBe(180);
  });
  it('sans le script du domaine, ou si il lève : aucune erreur', () => {
    expect(() => journalDomaine('x')).not.toThrow();
    (window as unknown as { kdmcJournal: unknown }).kdmcJournal = () => {
      throw new Error('boom');
    };
    expect(() => journalDomaine('x')).not.toThrow();
  });
});

describe('points d\'enregistrement branchés', () => {
  it('message envoyé : phrase fixe, jamais le texte', () => {
    const src = lire('features/chat/chat-engine.ts');
    expect(src).toMatch(/journalDomaine\('message envoyé à Apex', 'message'\)/);
    expect(src).not.toMatch(/journalDomaine\([^)]*text/);
  });
  it('projets : créé / modifié / note / supprimé, sans le nom du projet', () => {
    const src = lire('features/projects/index.ts');
    expect(src).toMatch(/journalDomaine\(editingId \? 'projet modifié' : 'projet créé'\)/);
    expect(src).toMatch(/journalDomaine\('projet supprimé'\)/);
    expect(src).not.toMatch(/journalDomaine\([^)]*saved\.name/);
  });
  it('réglages : mémoire long terme, mémoire compacte, lecture auto, voix', () => {
    const src = lire('features/settings/index.ts');
    expect((src.match(/journalDomaine\(/g) ?? []).length).toBe(4);
  });
});

describe('notifications : bouton de fermeture', () => {
  it('ne rétrécit pas dans le flex et garde 44 px minimum', () => {
    const css = lire('assets/css/animations.css');
    const debut = css.indexOf('.ax-toast-close {');
    const regle = css.slice(debut, css.indexOf('}', debut));
    expect(regle).toMatch(/flex:\s*0 0 auto/);
    expect(regle).toMatch(/min-width:\s*var\(--ax-touch-min\)/);
    expect(regle).toMatch(/min-height:\s*var\(--ax-touch-min\)/);
  });
});
