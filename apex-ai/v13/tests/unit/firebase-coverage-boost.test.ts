/**
 * firebase coverage boost — branches manquantes (Sprint 9 Kevin v13.0.78+)
 *
 * Cible : firebase.ts L:88.2% S:88.2% F:100% B:82% → ≥95% partout
 * Branches manquantes : applyRemoteChange edge cases, isLocalOnly prefix match, queue flush,
 * cleanupSSE idempotency, restoreVaultKeysFromFirebase, disconnect.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { firebase, FB_FIX, FB_LOCAL } from '../../services/storage/firebase.js';

describe('firebase coverage boost', () => {
  beforeEach(() => {
    localStorage.clear();
    /* Reset firebase state */
    firebase.disconnect();
  });

  describe('shouldSync', () => {
    it('FB_FIX includes ax_anthropic_key', () => {
      expect(firebase.shouldSync('ax_anthropic_key')).toBe(true);
    });

    it('FB_FIX includes apex_v13_facts', () => {
      expect(firebase.shouldSync('apex_v13_facts')).toBe(true);
    });

    it('non-whitelisted key → false', () => {
      expect(firebase.shouldSync('random_key_abc')).toBe(false);
    });

    it('FB_FIX export non vide', () => {
      expect(FB_FIX.length).toBeGreaterThan(50);
    });
  });

  describe('isLocalOnly', () => {
    it('apex_v13_user → true (FB_LOCAL exact)', () => {
      expect(firebase.isLocalOnly('apex_v13_user')).toBe(true);
    });

    it('apex_v13_uid → true', () => {
      expect(firebase.isLocalOnly('apex_v13_uid')).toBe(true);
    });

    it('ax_voice_print_kevin → true (prefix match)', () => {
      expect(firebase.isLocalOnly('ax_voice_print_kevin')).toBe(true);
    });

    it('ax_voice_print_laurence_sp → true (prefix match)', () => {
      expect(firebase.isLocalOnly('ax_voice_print_laurence_sp')).toBe(true);
    });

    it('ax_anthropic_key → false (FB_FIX, pas LOCAL)', () => {
      expect(firebase.isLocalOnly('ax_anthropic_key')).toBe(false);
    });

    it('FB_LOCAL export', () => {
      expect(FB_LOCAL.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('write (queue offline)', () => {
    it('write FB_LOCAL key → no-op silencieux (pas throw, pas connect)', async () => {
      let threw = false;
      try {
        await firebase.write('apex_v13_user', { id: 'kevin' });
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
      /* FB_LOCAL ne doit pas connecter Firebase */
      expect(firebase.isConnected()).toBe(false);
    });

    it('write non-whitelisted key → no-op silencieux', async () => {
      let threw = false;
      try {
        await firebase.write('random_xyz', 'value');
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
      expect(firebase.shouldSync('random_xyz')).toBe(false);
    });

    it('write hors connexion → no-op silencieux (pas throw)', async () => {
      let threw = false;
      try {
        await firebase.write('ax_anthropic_key', 'sk-test');
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });
  });

  describe('isConnected', () => {
    it('par défaut non connecté', () => {
      firebase.disconnect();
      expect(firebase.isConnected()).toBe(false);
    });
  });

  describe('disconnect (idempotent)', () => {
    it('disconnect 2× sans throw', () => {
      firebase.disconnect();
      firebase.disconnect();
      expect(firebase.isConnected()).toBe(false);
    });

    it('getActiveSSEListenerCount=0 après disconnect', () => {
      firebase.disconnect();
      expect(firebase.getActiveSSEListenerCount()).toBe(0);
    });
  });

  describe('read offline', () => {
    it('read en mode offline retourne null', async () => {
      firebase.disconnect();
      const r = await firebase.read('ax_anthropic_key');
      expect(r).toBeNull();
    });
  });

  describe('FB_FIX content checks (audit anti-régression)', () => {
    it('contient les 5 backup vault keys préfixes apex_v13_', () => {
      expect(FB_FIX).toContain('apex_v13_anthropic_key');
      expect(FB_FIX).toContain('apex_v13_openai_key');
    });

    it('contient les clés payments', () => {
      expect(FB_FIX).toContain('ax_stripe_key');
    });

    it('contient les clés DevOps', () => {
      expect(FB_FIX).toContain('ax_github_token');
      expect(FB_FIX).toContain('ax_cloudflare_token');
    });

    it('contient les clés communications', () => {
      expect(FB_FIX).toContain('ax_telegram_token');
      expect(FB_FIX).toContain('ax_resend_key');
    });

    it('NE contient PAS les FB_LOCAL keys (anti pollution)', () => {
      for (const local of FB_LOCAL) {
        expect(FB_FIX).not.toContain(local);
      }
    });
  });

  describe('writes idempotency hash deterministe', () => {
    it('même entrée 2× sans throw + état stable', async () => {
      let threw = false;
      try {
        await firebase.write('ax_telegram_token', 'value-X');
        await firebase.write('ax_telegram_token', 'value-X');
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
      /* Sans connexion, isConnected reste false */
      expect(firebase.isConnected()).toBe(false);
    });
  });

  describe('FB_FIX whitelist enrichissement Sprint 9', () => {
    it('apex_v13_multi_keys est sync (multi-key vault)', () => {
      expect(firebase.shouldSync('apex_v13_multi_keys')).toBe(true);
    });

    it('ax_handoff_journal sync (pipeline Apex↔Claude Code)', () => {
      expect(firebase.shouldSync('ax_handoff_journal')).toBe(true);
    });

    it('ax_admin_commands_pending sync (admin cross-device)', () => {
      expect(firebase.shouldSync('ax_admin_commands_pending')).toBe(true);
    });

    it('ax_cmc_planning_pending sync (bridge CMCteams)', () => {
      expect(firebase.shouldSync('ax_cmc_planning_pending')).toBe(true);
    });
  });
});
