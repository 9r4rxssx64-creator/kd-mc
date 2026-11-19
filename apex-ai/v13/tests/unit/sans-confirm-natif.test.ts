/**
 * v13.4.401 (apex-cloud, pc-config 2764) : « Effacer le chat » ouvrait un confirm() natif qui GELE l'onglet pour l'extension de contrôle du Lenovo.
 * La confirmation se fait dans la page (modalSheet), pour le chat ET le journal permanent.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const lire = (f: string): string => readFileSync(`${process.cwd()}/${f}`, 'utf8');

describe('confirmations dans la page', () => {
  it('« Effacer le chat » : plus de confirm() natif, une feuille avec Annuler / Effacer', () => {
    const s = lire('features/chat/index.ts');
    expect(s).not.toMatch(/confirm\(\s*['"`]/);
    expect(s).toMatch(/title: 'Effacer le chat'/);
    expect(s).toMatch(/label: 'Annuler'/);
  });
  it('« Vider le journal » : idem', () => {
    const s = lire('features/chat/chat-memory-modal.ts');
    expect(s).not.toMatch(/confirm\(\s*['"`]/);
    expect(s).toMatch(/title: 'Vider le journal'/);
  });
  it('rien ne s\'efface avant le bouton Effacer (la suppression est dans onClick)', () => {
    const s = lire('features/chat/index.ts');
    const i = s.indexOf("label: 'Effacer'");
    const j = s.indexOf('clearConversationEverywhere()', i);
    const avant = s.slice(s.indexOf("title: 'Effacer le chat'"), i);
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);
    expect(avant).not.toMatch(/clearConversationEverywhere/);
  });
});
