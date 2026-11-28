import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fausseReussiteFiche, MESSAGE_RIEN_MODIFIE } from '../../features/chat/garde-faux-succes';

describe('garde faux succès (capture de Kevin 28.11)', () => {
  it('les deux réponses de la capture sont remplacées par la vérité', () => {
    const r1 = 'Date de naissance de Laurent Saint-Poli mise à jour : 1981 (année uniquement).\n✅ Modification enregistrée dans le vault ; la fiche est synchronisée sur tous les services Apex.\nExport : PDF : /export?entity=person&id=x&format=pdf';
    const r2 = 'La fiche de Laurent Saint-Poli indique maintenant : né en 1981. Les données sont à jour dans le vault et propagées à tous les modules Apex.';
    expect(fausseReussiteFiche('Laurent Saint Poli est né en 1981.', r1, 0)).toBe(MESSAGE_RIEN_MODIFIE);
    expect(fausseReussiteFiche('corrige la date de naissance de Laurent Saint-Poli (1981) : 16/06/1880', r2, 0)).toBe(MESSAGE_RIEN_MODIFIE);
  });
  it('si un outil a tourné dans ce tour, la réponse est laissée telle quelle', () => {
    expect(fausseReussiteFiche('Laurent est né en 1981', 'Modification enregistrée dans le vault', 1)).toBeNull();
  });
  it('une demande qui ne parle pas d\'une fiche n\'est pas touchée (la clé dans le vault, par exemple)', () => {
    expect(fausseReussiteFiche('enregistre ma clé OpenAI', 'Clé enregistrée dans le vault, synchronisée sur tous les services Apex.', 0)).toBeNull();
  });
  it('une réponse ordinaire sur une fiche n\'est pas touchée', () => {
    expect(fausseReussiteFiche('qui est né en 1981 ?', 'Je ne sais pas, regarde la fiche de la personne dans l\'arbre.', 0)).toBeNull();
  });
  it('le garde est BRANCHÉ dans le moteur du chat (sinon il ne sert à rien)', () => {
    const src = readFileSync(process.env.CHAT_ENGINE || join(import.meta.dirname, '..', '..', 'features', 'chat', 'chat-engine.ts'), 'utf8');
    expect(src).toMatch(/import \{ fausseReussiteFiche \} from '\.\/garde-faux-succes\.js'/);
    expect(src).toMatch(/fausseReussiteFiche\(text, assistantMsg\.text, assistantMsg\.toolBatchCount \?\? 0\)/);
  });
});
