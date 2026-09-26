/**
 * Tests cmc-planning-bridge.ts — bridge Apex → CMCteams (Kevin 2026-05-07 §8).
 *
 * Cible :
 *  - detectSbmPlanning : positifs / négatifs / edge cases
 *  - pushPlanningToCmc : OK + erreur firebase
 *  - detectAndPushIfPlanning : combiné
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  detectSbmPlanning,
  pushPlanningToCmc,
  detectAndPushIfPlanning,
  _internals,
} from '../../services/integrations/cmc-planning-bridge.js';
import { firebase } from '../../services/storage/firebase.js';
import { auth } from '../../services/auth/auth.js';

describe('cmc-planning-bridge', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    /* v13.4.83 added auth.isAdminSync() guard in pushPlanningToCmc.
     * Default-mock to true (admin) so tests can verify bridge logic.
     * Tests that need to verify the guard itself override with mockReturnValueOnce(false). */
    vi.spyOn(auth, 'isAdminSync').mockReturnValue(true);
  });

  describe('detectSbmPlanning()', () => {
    it('détecte planning SBM complet (mois + équipes + cadres)', () => {
      const text =
        'Voici mon planning de MAI 2026 pour les équipes du casino.\n' +
        'BJ Éq.1 et BJ Éq.2 travaillent de 14h à 22h.\n' +
        'PIT BOSS : Kevin DESARZENS\n' +
        'SUPERVISEUR : Laurence SAINT-POLIT\n' +
        'INSPECTEUR : Jean DURAND\n' +
        'Le planning détaillé sera affiché demain matin.\n' +
        'RA Éq.1 et CMC Éq.3 disponibles également.\n' +
        'Toutes les rotations sont programmées selon la convention SBM.';
      const r = detectSbmPlanning(text);
      expect(r.detected).toBe(true);
      expect(r.matches.length).toBeGreaterThanOrEqual(2);
      expect(r.size).toBe(text.length);
    });

    it('détecte planning JUIN 2026 + cadres', () => {
      const text =
        'Planning officiel JUIN 2026 — distribution des shifts.\n'.repeat(8) +
        'PIT BOSS du 1 au 30. SUPERVISEUR sur tous les shifts.\n' +
        'BJ Éq.5 démarre à 6h.';
      const r = detectSbmPlanning(text);
      expect(r.detected).toBe(true);
    });

    it('NE détecte PAS un message court "Salut comment ça va"', () => {
      const r = detectSbmPlanning('Salut comment ça va ?');
      expect(r.detected).toBe(false);
      expect(r.matches).toEqual([]);
    });

    it('NE détecte PAS texte trop court (<200 chars) même avec patterns', () => {
      /* "MAI 2026" + "BJ Éq.1" présents mais texte trop court */
      const text = 'MAI 2026 BJ Éq.1 PIT BOSS';
      const r = detectSbmPlanning(text);
      expect(r.detected).toBe(false);
      expect(r.size).toBeLessThan(_internals.MIN_TEXT_LENGTH);
    });

    it('NE détecte PAS avec 1 seul match (faux positif évité)', () => {
      /* Texte long mais juste "MAI 2026" → 1 match seulement */
      const text =
        'Le voyage est prévu pour MAI 2026 mais on n\'a pas encore réservé.\n'.repeat(5) +
        'On verra plus tard pour le reste, pas urgent.';
      const r = detectSbmPlanning(text);
      expect(r.detected).toBe(false);
    });

    it('détecte avec accent Éq. ET sans Eq.', () => {
      const text =
        'Planning AVRIL 2026 SBM Casino.\n' +
        'BJ Eq.1 + RA Eq.2 + CMC Eq.3.\n'.repeat(5) +
        'INSPECTEUR + SUPERVISEUR du jour.';
      const r = detectSbmPlanning(text);
      expect(r.detected).toBe(true);
    });

    it('input null ou non-string → safe', () => {
      // @ts-expect-error testing invalid input
      expect(detectSbmPlanning(null).detected).toBe(false);
      // @ts-expect-error testing invalid input
      expect(detectSbmPlanning(undefined).detected).toBe(false);
      expect(detectSbmPlanning('').detected).toBe(false);
      // @ts-expect-error testing invalid input
      expect(detectSbmPlanning(12345).detected).toBe(false);
    });

    it('case insensitive sur les mois', () => {
      const text =
        'planning de mai 2026 pour le casino.\n'.repeat(10) +
        'pit boss + superviseur.\nbj éq.1 et ra éq.2.';
      const r = detectSbmPlanning(text);
      expect(r.detected).toBe(true);
    });
  });

  describe('pushPlanningToCmc()', () => {
    it('push réussi → ok=true + id', async () => {
      const writeSpy = vi.spyOn(firebase, 'write').mockResolvedValue(undefined);
      const r = await pushPlanningToCmc('mock raw text', 'chat');
      expect(r.ok).toBe(true);
      expect(r.id).toMatch(/^pln_/);
      expect(writeSpy).toHaveBeenCalledTimes(1);
      const [keyArg, payloadArg] = writeSpy.mock.calls[0]!;
      expect(keyArg).toMatch(/^ax_cmc_planning_pending\//);
      const payload = payloadArg as { from_apex: boolean; processed: boolean; source: string; raw_text: string };
      expect(payload.from_apex).toBe(true);
      expect(payload.processed).toBe(false);
      expect(payload.source).toBe('chat');
      expect(payload.raw_text).toBe('mock raw text');
    });

    it('source par défaut = "chat"', async () => {
      const writeSpy = vi.spyOn(firebase, 'write').mockResolvedValue(undefined);
      await pushPlanningToCmc('hello');
      const payload = writeSpy.mock.calls[0]![1] as { source: string };
      expect(payload.source).toBe('chat');
    });

    it('source "paste" + "voice" supportés', async () => {
      const writeSpy = vi.spyOn(firebase, 'write').mockResolvedValue(undefined);
      await pushPlanningToCmc('a', 'paste');
      await pushPlanningToCmc('b', 'voice');
      expect((writeSpy.mock.calls[0]![1] as { source: string }).source).toBe('paste');
      expect((writeSpy.mock.calls[1]![1] as { source: string }).source).toBe('voice');
    });

    it('cap raw_text à 50 KB + flag truncated=true', async () => {
      const writeSpy = vi.spyOn(firebase, 'write').mockResolvedValue(undefined);
      const huge = 'x'.repeat(60_000);
      const r = await pushPlanningToCmc(huge, 'chat');
      expect(r.ok).toBe(true);
      const payload = writeSpy.mock.calls[0]![1] as { raw_text: string; truncated: boolean; original_size: number };
      expect(payload.raw_text.length).toBe(_internals.MAX_RAW_TEXT);
      expect(payload.truncated).toBe(true);
      expect(payload.original_size).toBe(60_000);
    });

    it('petit payload → truncated=false', async () => {
      const writeSpy = vi.spyOn(firebase, 'write').mockResolvedValue(undefined);
      await pushPlanningToCmc('small', 'chat');
      const payload = writeSpy.mock.calls[0]![1] as { truncated: boolean };
      expect(payload.truncated).toBe(false);
    });

    it('firebase.write throw → ok=false + error string (pas de re-throw)', async () => {
      vi.spyOn(firebase, 'write').mockRejectedValue(new Error('network down'));
      const r = await pushPlanningToCmc('text');
      expect(r.ok).toBe(false);
      expect(r.error).toContain('network down');
    });

    it('rawText vide → ok=false sans appel firebase', async () => {
      const writeSpy = vi.spyOn(firebase, 'write').mockResolvedValue(undefined);
      const r = await pushPlanningToCmc('');
      expect(r.ok).toBe(false);
      expect(writeSpy).not.toHaveBeenCalled();
    });

    it('id unique entre 2 appels', async () => {
      vi.spyOn(firebase, 'write').mockResolvedValue(undefined);
      const a = await pushPlanningToCmc('a');
      const b = await pushPlanningToCmc('b');
      expect(a.id).not.toBe(b.id);
    });
  });

  describe('detectAndPushIfPlanning()', () => {
    it('texte normal → null (pas de push)', async () => {
      const writeSpy = vi.spyOn(firebase, 'write').mockResolvedValue(undefined);
      const r = await detectAndPushIfPlanning('Salut Kevin');
      expect(r).toBeNull();
      expect(writeSpy).not.toHaveBeenCalled();
    });

    it('planning détecté + assez gros → push effectué', async () => {
      const writeSpy = vi.spyOn(firebase, 'write').mockResolvedValue(undefined);
      const text =
        'Planning MAI 2026 SBM Monaco — voici la distribution complète.\n'.repeat(20) +
        'BJ Éq.1 / BJ Éq.2 / RA Éq.1 / CMC Éq.5\n' +
        'PIT BOSS, SUPERVISEUR et INSPECTEUR du jour assignés.\n' +
        'Toutes les rotations 20/20, 40/20, 60/20 OK.';
      const r = await detectAndPushIfPlanning(text, 'chat');
      expect(r).not.toBeNull();
      expect(r!.detection.detected).toBe(true);
      expect(r!.push.ok).toBe(true);
      expect(writeSpy).toHaveBeenCalledOnce();
    });

    it('planning détecté mais < MIN_PUSH_LENGTH → null', async () => {
      const writeSpy = vi.spyOn(firebase, 'write').mockResolvedValue(undefined);
      /* Texte avec ≥2 patterns mais seulement ~250 chars (< 1000) */
      const text =
        'Planning MAI 2026.\n' +
        'BJ Éq.1 PIT BOSS SUPERVISEUR.\n' +
        'Petit extrait pas pertinent.\n' +
        'Encore quelques lignes pour dépasser 200 mais pas 1000 chars du tout.\n' +
        'Stop.';
      const r = await detectAndPushIfPlanning(text);
      expect(r).toBeNull();
      expect(writeSpy).not.toHaveBeenCalled();
    });
  });

  describe('_internals', () => {
    it('expose les constantes pour debug', () => {
      expect(_internals.MIN_TEXT_LENGTH).toBe(200);
      expect(_internals.MIN_PUSH_LENGTH).toBe(1000);
      expect(_internals.MAX_RAW_TEXT).toBe(50_000);
      expect(_internals.SBM_PATTERNS.length).toBe(7);
    });
  });
});
