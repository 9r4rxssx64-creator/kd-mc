/**
 * Tests vault triple-persistence BÉTON — fix Kevin v13.3.74+ (2026-05-08, ABSOLUE) :
 * "J'ai collé mes codes plusieurs fois ils les ont en mémoire quelque part.
 *  Il doit plus avoir de problème ou il s'emmêle ou je n'ai plus de réponse"
 *
 * Vérifie l'architecture 3 sources :
 *   - Couche 1 : localStorage (rapide, primary)
 *   - Couche 2 : IndexedDB shadow (résiste cache clear Safari iOS)
 *   - Couche 3 : Firebase backup dédié `/apex/vault_backup/<uid>/<keyId>`
 *
 * Scénarios couverts :
 *   - Push vers Firebase backup avec throttle 5min
 *   - Refus push si plaintext (jamais en clair Firebase)
 *   - Hash SHA-256 short pour intégrité
 *   - Auto-restore au boot depuis Firebase backup si localStorage vide
 *   - Skip restore si Kevin a explicitement supprimé la clé (ax_credentials_deleted)
 *   - Audit cohérence drift detection + autoFix syncDrift
 *   - pushAllLocal pour pre-backup (utilisé par UltraReset)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import { vault } from '../../services/vault/vault.js';
import { vaultFirebaseBackup } from '../../services/vault/vault-firebase-backup.js';
import { firebase } from '../../services/storage/firebase.js';

describe('Vault Triple-Persistence (Kevin v13.3.74+ ABSOLUE)', () => {
  beforeEach(() => {
    vaultFirebaseBackup.resetThrottle();
    vi.restoreAllMocks();
    /* v13.4.122 fix : clear localStorage pour que getUid() retourne 'anon'
     * (sinon apex_v13_pin résiduel d'autres tests fait fallback ADMIN_KEVIN_UID
     * → path queried devient vault_backup/kdmc_admin ≠ mock vault_backup/anon). */
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  /* ============================================================
     1. push() — refus plaintext + throttle 5min
     ============================================================ */
  describe('push() — security & throttle', () => {
    it('REFUSE push de valeur plaintext (jamais en clair Firebase)', async () => {
      vi.spyOn(firebase, 'isConnected').mockReturnValue(true);
      const writeSpy = vi.spyOn(firebase, 'write').mockResolvedValue();
      const r = await vaultFirebaseBackup.push('ax_anthropic_key', 'sk-ant-plaintext-value');
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('plaintext_refused');
      expect(writeSpy).not.toHaveBeenCalled();
    });

    it('accepte push de valeur chiffrée AXENC1:', async () => {
      vi.spyOn(firebase, 'isConnected').mockReturnValue(true);
      const writeSpy = vi.spyOn(firebase, 'write').mockResolvedValue();
      const enc = await vault.encryptAuto('sk-ant-test-secret');
      const r = await vaultFirebaseBackup.push('ax_anthropic_key', enc);
      expect(r.ok).toBe(true);
      expect(r.ts).toBeGreaterThan(0);
      expect(writeSpy).toHaveBeenCalledTimes(1);
      const callPath = writeSpy.mock.calls[0]?.[0] as string;
      expect(callPath).toContain('vault_backup/');
      expect(callPath).toContain('ax_anthropic_key');
    });

    it('throttle 5min : 2ème push même clé < 5min → skip avec throttled:true', async () => {
      vi.spyOn(firebase, 'isConnected').mockReturnValue(true);
      const writeSpy = vi.spyOn(firebase, 'write').mockResolvedValue();
      const enc = await vault.encryptAuto('sk-throttle-test');
      const r1 = await vaultFirebaseBackup.push('ax_openai_key', enc);
      expect(r1.ok).toBe(true);
      const r2 = await vaultFirebaseBackup.push('ax_openai_key', enc);
      expect(r2.ok).toBe(false);
      expect(r2.throttled).toBe(true);
      /* Une seule write Firebase */
      expect(writeSpy).toHaveBeenCalledTimes(1);
    });

    it('opts.force=true bypass le throttle', async () => {
      vi.spyOn(firebase, 'isConnected').mockReturnValue(true);
      const writeSpy = vi.spyOn(firebase, 'write').mockResolvedValue();
      const enc = await vault.encryptAuto('sk-force-test');
      await vaultFirebaseBackup.push('ax_groq_key', enc);
      const r2 = await vaultFirebaseBackup.push('ax_groq_key', enc, { force: true });
      expect(r2.ok).toBe(true);
      expect(writeSpy).toHaveBeenCalledTimes(2);
    });

    it('si offline → met en file d\'attente (queued), write() appelé pour flush auto (v13.4.257)', async () => {
      /* v13.4.257 (FIX "Firebase backup KO 0/20") : offline N'ABANDONNE PLUS.
         firebase.write() met en file (firebase-queue) + flush à la reconnexion
         → le backup vault n'est plus perdu en arrière-plan iOS. */
      vi.spyOn(firebase, 'isConnected').mockReturnValue(false);
      const writeSpy = vi.spyOn(firebase, 'write').mockResolvedValue();
      const enc = await vault.encryptAuto('sk-offline-test');
      const r = await vaultFirebaseBackup.push('ax_anthropic_key', enc);
      expect(r.ok).toBe(true);
      expect(r.queued).toBe(true);
      expect(writeSpy).toHaveBeenCalled();
    });
  });

  /* ============================================================
     2. fetch() — récupération + intégrité hash
     ============================================================ */
  describe('fetch() — récupération + intégrité', () => {
    it('fetch retourne null si offline', async () => {
      vi.spyOn(firebase, 'isConnected').mockReturnValue(false);
      const r = await vaultFirebaseBackup.fetch('ax_anthropic_key');
      expect(r).toBeNull();
    });

    it('fetch retourne null si Firebase répond null', async () => {
      vi.spyOn(firebase, 'isConnected').mockReturnValue(true);
      vi.spyOn(firebase, 'read').mockResolvedValue(null);
      const r = await vaultFirebaseBackup.fetch('ax_anthropic_key');
      expect(r).toBeNull();
    });

    it('fetch round-trip : push puis fetch retourne même valeur chiffrée', async () => {
      vi.spyOn(firebase, 'isConnected').mockReturnValue(true);
      const enc = await vault.encryptAuto('sk-roundtrip-test');
      let storedEnvelope: unknown = null;
      vi.spyOn(firebase, 'write').mockImplementation(async (path, value) => {
        if (typeof path === 'string' && path.includes('ax_resend_key')) {
          storedEnvelope = value;
        }
      });
      vi.spyOn(firebase, 'read').mockImplementation(async (path) => {
        if (typeof path === 'string' && path.includes('ax_resend_key')) {
          return storedEnvelope as never;
        }
        return null;
      });
      const r1 = await vaultFirebaseBackup.push('ax_resend_key', enc);
      expect(r1.ok).toBe(true);
      const fetched = await vaultFirebaseBackup.fetch('ax_resend_key');
      expect(fetched).toBe(enc);
    });

    it('fetch rejette si format envelope invalide', async () => {
      vi.spyOn(firebase, 'isConnected').mockReturnValue(true);
      vi.spyOn(firebase, 'read').mockResolvedValue({
        v: 999, /* version inconnue */
        enc: 'AXENC1:something',
      } as never);
      const r = await vaultFirebaseBackup.fetch('ax_anthropic_key');
      expect(r).toBeNull();
    });

    it('fetch rejette si valeur n\'est pas AXENC1: (plaintext attaque)', async () => {
      vi.spyOn(firebase, 'isConnected').mockReturnValue(true);
      vi.spyOn(firebase, 'read').mockResolvedValue({
        v: 1,
        ts: Date.now(),
        k: 'ax_anthropic_key',
        enc: 'plaintext-not-encrypted', /* attaque : plaintext injecté */
      } as never);
      const r = await vaultFirebaseBackup.fetch('ax_anthropic_key');
      expect(r).toBeNull();
    });
  });

  /* ============================================================
     3. restoreAllFromFirebaseBackup — auto-restore boot
     ============================================================ */
  describe('restoreAllFromFirebaseBackup — auto-restore au boot', () => {
    it('restore N=0 si offline', async () => {
      vi.spyOn(firebase, 'isConnected').mockReturnValue(false);
      const r = await vaultFirebaseBackup.restoreAllFromFirebaseBackup();
      expect(r.total).toBe(0);
      expect(r.restored).toBe(0);
    });

    it('restore N=0 si pas de backup Firebase', async () => {
      vi.spyOn(firebase, 'isConnected').mockReturnValue(true);
      vi.spyOn(firebase, 'read').mockResolvedValue(null);
      const r = await vaultFirebaseBackup.restoreAllFromFirebaseBackup();
      expect(r.total).toBe(0);
      expect(r.restored).toBe(0);
    });

    it('restore : localStorage VIDE + Firebase backup PRÉSENT → key restored', async () => {
      const original = 'sk-ant-api03-' + 'R'.repeat(50);
      const enc = await vault.encryptAuto(original);
      vi.spyOn(firebase, 'isConnected').mockReturnValue(true);
      /* listAll retourne 1 backup */
      vi.spyOn(firebase, 'read').mockImplementation(async (path) => {
        if (typeof path !== 'string') return null;
        if (typeof path === 'string' && path.match(/^vault_backup\/[^/]+$/)) {
          return {
            ax_anthropic_key: { v: 1, ts: Date.now(), k: 'ax_anthropic_key', enc },
          } as never;
        }
        if (path.endsWith('ax_anthropic_key')) {
          return { v: 1, ts: Date.now(), k: 'ax_anthropic_key', enc } as never;
        }
        return null;
      });
      /* localStorage VIDE pour cette clé */
      expect(localStorage.getItem('ax_anthropic_key')).toBeNull();
      const r = await vaultFirebaseBackup.restoreAllFromFirebaseBackup();
      expect(r.total).toBeGreaterThan(0);
      expect(r.restored).toBeGreaterThan(0);
      /* Vérif que vault peut maintenant lire la clé */
      const decrypted = await vault.readKey('ax_anthropic_key');
      expect(decrypted).toBe(original);
    });

    it('restore SKIP si localStorage déjà présent (write-through)', async () => {
      const enc = await vault.encryptAuto('sk-already-local');
      localStorage.setItem('ax_openai_key', enc);
      vi.spyOn(firebase, 'isConnected').mockReturnValue(true);
      vi.spyOn(firebase, 'read').mockImplementation(async (path) => {
        if (typeof path === 'string' && path.match(/^vault_backup\/[^/]+$/)) {
          return {
            ax_openai_key: { v: 1, ts: Date.now(), k: 'ax_openai_key', enc },
          } as never;
        }
        return null;
      });
      const r = await vaultFirebaseBackup.restoreAllFromFirebaseBackup();
      expect(r.skipped).toBeGreaterThan(0);
      const skipDetail = r.details.find((d) => d.key === 'ax_openai_key');
      expect(skipDetail?.status).toBe('skipped');
      expect(skipDetail?.reason).toBe('already_local');
    });

    it('restore SKIP si Kevin a explicitement supprimé via ax_credentials_deleted', async () => {
      localStorage.setItem('ax_credentials_deleted', JSON.stringify(['ax_groq_key']));
      const enc = await vault.encryptAuto('sk-deleted-by-kevin');
      vi.spyOn(firebase, 'isConnected').mockReturnValue(true);
      vi.spyOn(firebase, 'read').mockImplementation(async (path) => {
        if (typeof path === 'string' && path.match(/^vault_backup\/[^/]+$/)) {
          return {
            ax_groq_key: { v: 1, ts: Date.now(), k: 'ax_groq_key', enc },
          } as never;
        }
        return null;
      });
      const r = await vaultFirebaseBackup.restoreAllFromFirebaseBackup();
      const skipDetail = r.details.find((d) => d.key === 'ax_groq_key');
      expect(skipDetail?.status).toBe('skipped');
      expect(skipDetail?.reason).toBe('user_deleted');
      /* localStorage doit rester vide (respect choix Kevin) */
      expect(localStorage.getItem('ax_groq_key')).toBeNull();
    });
  });

  /* ============================================================
     4. auditCoherence + syncDrift — sentinelle vault-resilience-watch
     ============================================================ */
  describe('auditCoherence + syncDrift — drift detection', () => {
    it('auditCoherence : 0 drift si local et FB synced', async () => {
      const enc = await vault.encryptAuto('sk-coherent');
      localStorage.setItem('ax_anthropic_key', enc);
      vi.spyOn(firebase, 'isConnected').mockReturnValue(true);
      vi.spyOn(firebase, 'read').mockImplementation(async (path) => {
        if (typeof path === 'string' && path.match(/^vault_backup\/[^/]+$/)) {
          return {
            ax_anthropic_key: { v: 1, ts: Date.now(), k: 'ax_anthropic_key', enc },
          } as never;
        }
        return null;
      });
      const audit = await vaultFirebaseBackup.auditCoherence();
      expect(audit.drift_detected).toBe(false);
      expect(audit.local_count).toBe(1);
      expect(audit.fb_count).toBe(1);
    });

    it('auditCoherence : drift si key local sans backup Firebase', async () => {
      const enc = await vault.encryptAuto('sk-only-local');
      localStorage.setItem('ax_mistral_key', enc);
      vi.spyOn(firebase, 'isConnected').mockReturnValue(true);
      vi.spyOn(firebase, 'read').mockResolvedValue({} as never); /* aucun backup FB */
      const audit = await vaultFirebaseBackup.auditCoherence();
      expect(audit.drift_detected).toBe(true);
      expect(audit.in_local_not_fb).toContain('ax_mistral_key');
    });

    it('auditCoherence : drift si key Firebase sans local (post clear cache)', async () => {
      const enc = await vault.encryptAuto('sk-only-fb');
      vi.spyOn(firebase, 'isConnected').mockReturnValue(true);
      vi.spyOn(firebase, 'read').mockImplementation(async (path) => {
        if (typeof path === 'string' && path.match(/^vault_backup\/[^/]+$/)) {
          return {
            ax_cohere_key: { v: 1, ts: Date.now(), k: 'ax_cohere_key', enc },
          } as never;
        }
        return null;
      });
      const audit = await vaultFirebaseBackup.auditCoherence();
      expect(audit.drift_detected).toBe(true);
      expect(audit.in_fb_not_local).toContain('ax_cohere_key');
    });

    it('syncDrift : push manquants Firebase + restore manquants local', async () => {
      const encLocal = await vault.encryptAuto('sk-only-local-2');
      const encRemote = await vault.encryptAuto('sk-only-remote-2');
      localStorage.setItem('ax_perplexity_key', encLocal);
      vi.spyOn(firebase, 'isConnected').mockReturnValue(true);
      const writeSpy = vi.spyOn(firebase, 'write').mockResolvedValue();
      let listAllCallCount = 0;
      vi.spyOn(firebase, 'read').mockImplementation(async (path) => {
        if (typeof path === 'string' && path.match(/^vault_backup\/[^/]+$/)) {
          listAllCallCount++;
          /* Avant syncDrift : seulement ax_huggingface_key dans FB */
          /* Après push : devrait contenir les 2 — mais on simule snapshot pre-sync */
          return {
            ax_huggingface_key: { v: 1, ts: Date.now(), k: 'ax_huggingface_key', enc: encRemote },
          } as never;
        }
        if (typeof path === 'string' && path.includes('ax_huggingface_key')) {
          return { v: 1, ts: Date.now(), k: 'ax_huggingface_key', enc: encRemote } as never;
        }
        return null;
      });
      const r = await vaultFirebaseBackup.syncDrift();
      expect(r.pushed).toBeGreaterThanOrEqual(1); /* push perplexity vers FB */
      expect(r.restored).toBeGreaterThanOrEqual(1); /* restore huggingface vers local */
      expect(writeSpy).toHaveBeenCalled();
      expect(listAllCallCount).toBeGreaterThan(0);
      /* localStorage doit avoir reçu huggingface restored */
      expect(localStorage.getItem('ax_huggingface_key')).toBe(encRemote);
    });
  });

  /* ============================================================
     5. pushAllLocal — utilisé par UltraReset pre-backup
     ============================================================ */
  describe('pushAllLocal — UltraReset pre-backup', () => {
    it('pushAllLocal scanne et push toutes les clés vault chiffrées', async () => {
      const enc1 = await vault.encryptAuto('sk-bulk-1');
      const enc2 = await vault.encryptAuto('sk-bulk-2');
      localStorage.setItem('ax_anthropic_key', enc1);
      localStorage.setItem('ax_openai_key', enc2);
      /* Plaintext : ne doit PAS être pushé */
      localStorage.setItem('ax_some_plaintext_key', 'raw-not-encrypted');
      vi.spyOn(firebase, 'isConnected').mockReturnValue(true);
      const writeSpy = vi.spyOn(firebase, 'write').mockResolvedValue();
      const r = await vaultFirebaseBackup.pushAllLocal();
      expect(r.pushed).toBeGreaterThanOrEqual(2);
      expect(r.skipped).toBeGreaterThanOrEqual(1); /* le plaintext */
      /* Vérif : 2 writes minimum, et aucun pour la clé plaintext */
      expect(writeSpy).toHaveBeenCalled();
      const allPaths = writeSpy.mock.calls.map((c) => String(c[0]));
      expect(allPaths.some((p) => p.includes('ax_some_plaintext_key'))).toBe(false);
    });

    it('pushAllLocal : 0 push si aucune clé chiffrée', async () => {
      vi.spyOn(firebase, 'isConnected').mockReturnValue(true);
      const writeSpy = vi.spyOn(firebase, 'write').mockResolvedValue();
      const r = await vaultFirebaseBackup.pushAllLocal();
      expect(r.pushed).toBe(0);
      expect(writeSpy).not.toHaveBeenCalled();
    });
  });

  /* ============================================================
     6. Integration vault.setKey avec vault-firebase-backup
     ============================================================ */
  describe('Integration vault.setKey ↔ vault-firebase-backup', () => {
    it('vault.setKey appelle vaultFirebaseBackup.push en async fire-and-forget (couche 4)', async () => {
      const pushSpy = vi.spyOn(vaultFirebaseBackup, 'push').mockResolvedValue({
        ok: true,
        ts: Date.now(),
      });
      vi.spyOn(firebase, 'isConnected').mockReturnValue(true);
      const r = await vault.setKey('ax_anthropic_key', 'sk-ant-integration-test');
      expect(r.ok).toBe(true);
      /* push lancé en async (fire-and-forget) — laisser microtask flush */
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(pushSpy).toHaveBeenCalledWith('ax_anthropic_key', expect.stringContaining('AXENC1:'));
    });

    it('vault.setKey continue OK même si vaultFirebaseBackup.push fail (fire-and-forget)', async () => {
      /* Avec fire-and-forget, l'erreur push n'affecte JAMAIS le retour setKey */
      vi.spyOn(vaultFirebaseBackup, 'push').mockRejectedValue(new Error('FB down'));
      const r = await vault.setKey('ax_groq_key', 'sk-groq-with-fb-fail');
      /* Ok parce que local et IDB ont marché */
      expect(r.ok).toBe(true);
      expect(r.persisted.local).toBe(true);
    });
  });

  /* ============================================================
     7. resetThrottle — admin debug helper
     ============================================================ */
  describe('resetThrottle — admin debug', () => {
    it('resetThrottle remet à zéro le cache throttle', async () => {
      vi.spyOn(firebase, 'isConnected').mockReturnValue(true);
      vi.spyOn(firebase, 'write').mockResolvedValue();
      const enc = await vault.encryptAuto('sk-throttle-reset');
      const r1 = await vaultFirebaseBackup.push('ax_xai_key', enc);
      expect(r1.ok).toBe(true);
      /* Sans reset, 2ème push throttled */
      const r2 = await vaultFirebaseBackup.push('ax_xai_key', enc);
      expect(r2.throttled).toBe(true);
      /* Reset → next push OK */
      vaultFirebaseBackup.resetThrottle();
      const r3 = await vaultFirebaseBackup.push('ax_xai_key', enc);
      expect(r3.ok).toBe(true);
      expect(r3.throttled).toBeUndefined();
    });
  });
});
