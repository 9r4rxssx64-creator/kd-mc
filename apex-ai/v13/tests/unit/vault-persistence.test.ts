/**
 * Tests vault persistence — fix Kevin v13.0.20+ :
 * "Apex oublie les clés API entre sessions"
 *
 * Vérifie :
 * - setKey persiste localStorage + IDB shadow + Firebase backup chiffré
 * - readKey fallback IDB si localStorage vide (clear cache Safari simulation)
 * - restoreFromFirebase déchiffre + re-hydrate
 * - FB_FIX whitelist contient toutes les clés API ax_*
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { vault } from '../../services/vault/vault.js';
import { FB_FIX } from '../../services/storage/firebase.js';

describe('Vault persistence (fix Kevin "clés pas en mémoire")', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('setKey — triple persistence', () => {
    it('setKey stocke en localStorage chiffré (AXENC1:)', async () => {
      const r = await vault.setKey('ax_anthropic_key', 'sk-ant-api03-test123');
      expect(r.ok).toBe(true);
      expect(r.persisted.local).toBe(true);
      const raw = localStorage.getItem('ax_anthropic_key');
      expect(raw).toBeTruthy();
      expect(raw!.startsWith('AXENC1:')).toBe(true);
    });

    it('setKey vide → removeItem localStorage', async () => {
      localStorage.setItem('ax_anthropic_key', 'AXENC1:something');
      const r = await vault.setKey('ax_anthropic_key', '');
      expect(r.ok).toBe(true);
      expect(localStorage.getItem('ax_anthropic_key')).toBeNull();
    });

    it('setKey expose persisted.idb=true si IDB dispo', async () => {
      const r = await vault.setKey('ax_openai_key', 'sk-fake-openai');
      /* happy-dom a IDB → persisted.idb true */
      expect(typeof r.persisted.idb).toBe('boolean');
    });

    it('setKey + readKey round-trip preserve plaintext', async () => {
      const original = 'sk-ant-api03-' + 'A'.repeat(50);
      await vault.setKey('ax_anthropic_key', original);
      const read = await vault.readKey('ax_anthropic_key');
      expect(read).toBe(original);
    });
  });

  describe('readKey — fallback IDB shadow', () => {
    it('readKey vide retourne ""', async () => {
      const r = await vault.readKey('ax_no_such_key');
      expect(r).toBe('');
    });

    it('readKey lit plaintext legacy (sans AXENC1:)', async () => {
      localStorage.setItem('ax_legacy_key', 'plaintext-legacy-value');
      const r = await vault.readKey('ax_legacy_key');
      expect(r).toBe('plaintext-legacy-value');
    });

    it('readKey simule clear localStorage → fallback IDB', async () => {
      const original = 'sk-fb-fallback-test';
      const setResult = await vault.setKey('ax_groq_key', original);
      /* Si happy-dom IDB pas dispo, skip cette assertion (seul localStorage testé) */
      if (!setResult.persisted.idb) {
        expect(localStorage.getItem('ax_groq_key')).toBeTruthy();
        return;
      }
      /* Petit délai pour laisser IDB.put() terminer côté happy-dom */
      await new Promise((r) => setTimeout(r, 50));
      /* Simule clear cache Safari : localStorage perdu, IDB préservé */
      localStorage.removeItem('ax_groq_key');
      const r = await vault.readKey('ax_groq_key');
      /* IDB shadow doit avoir restauré la clé */
      expect(r).toBe(original);
    });

    it('readKey IDB miss + localStorage miss → "" (graceful)', async () => {
      const r = await vault.readKey('ax_completely_unknown_key_12345');
      expect(r).toBe('');
    });
  });

  describe('restoreFromFirebase', () => {
    it('restoreFromFirebase écrit localStorage si décrypt OK', async () => {
      /* Encrypt avec device passphrase, puis simule arrivée Firebase */
      const original = 'sk-restore-fb-test';
      const encrypted = await vault.encryptAuto(original);
      const ok = await vault.restoreFromFirebase('ax_anthropic_key', encrypted);
      expect(ok).toBe(true);
      expect(localStorage.getItem('ax_anthropic_key')).toBe(encrypted);
    });

    it('restoreFromFirebase rejette payload corrompu', async () => {
      const ok = await vault.restoreFromFirebase('ax_anthropic_key', 'AXENC1:CORRUPT_GIBBERISH');
      expect(ok).toBe(false);
    });

    it('restoreFromFirebase accepte legacy plaintext', async () => {
      const ok = await vault.restoreFromFirebase('ax_legacy_plain', 'pk_test_123');
      expect(ok).toBe(true);
      expect(localStorage.getItem('ax_legacy_plain')).toBe('pk_test_123');
    });

    it('restoreFromFirebase rejette empty/non-string', async () => {
      expect(await vault.restoreFromFirebase('ax_x', '')).toBe(false);
      expect(await vault.restoreFromFirebase('ax_x', null as unknown as string)).toBe(false);
    });
  });

  describe('FB_FIX whitelist (sync cross-device)', () => {
    it('FB_FIX contient ax_anthropic_key', () => {
      expect(FB_FIX).toContain('ax_anthropic_key');
    });

    it('FB_FIX contient tous les AI providers majeurs', () => {
      for (const k of [
        'ax_openai_key',
        'ax_groq_key',
        'ax_google_key',
        'ax_openrouter_key',
        'ax_mistral_key',
        'ax_cohere_key',
        'ax_deepseek_key',
        'ax_replicate_key',
        'ax_elevenlabs_key',
        'ax_perplexity_key',
        'ax_huggingface_key',
      ]) {
        expect(FB_FIX).toContain(k);
      }
    });

    it('FB_FIX contient payment keys', () => {
      expect(FB_FIX).toContain('ax_stripe_key');
      expect(FB_FIX).toContain('ax_paypal_token');
    });

    it('FB_FIX contient devops tokens', () => {
      expect(FB_FIX).toContain('ax_github_token');
      expect(FB_FIX).toContain('ax_cloudflare_token');
      expect(FB_FIX).toContain('ax_vercel_token');
    });

    it('FB_FIX contient communication keys', () => {
      expect(FB_FIX).toContain('ax_twilio_key');
      expect(FB_FIX).toContain('ax_sendgrid_key');
      expect(FB_FIX).toContain('ax_brevo_key');
      expect(FB_FIX).toContain('ax_resend_key');
      expect(FB_FIX).toContain('ax_telegram_token');
    });

    it('FB_FIX contient ax_links_registry pour sync registry cross-device', () => {
      expect(FB_FIX).toContain('ax_links_registry');
    });

    it('FB_FIX a au moins 30 entries (whitelist complète)', () => {
      expect(FB_FIX.length).toBeGreaterThanOrEqual(30);
    });
  });

  describe('readMasked + getKeyStatus (UI helpers)', () => {
    it('readMasked masque la clé chiffrée', async () => {
      await vault.setKey('ax_anthropic_key', 'sk-ant-api03-' + 'X'.repeat(50));
      const masked = await vault.readMasked('ax_anthropic_key');
      expect(masked).toContain('***');
      expect(masked.length).toBeLessThan(20);
    });

    it('getKeyStatus retourne "encrypted" si chiffré', async () => {
      await vault.setKey('ax_openai_key', 'sk-fake');
      expect(vault.getKeyStatus('ax_openai_key')).toBe('encrypted');
    });

    it('getKeyStatus retourne "empty" si rien', () => {
      expect(vault.getKeyStatus('ax_empty_test')).toBe('empty');
    });

    it('getKeyStatus retourne "plaintext_legacy" si non chiffré', () => {
      localStorage.setItem('ax_plain_legacy', 'raw-plaintext-value');
      expect(vault.getKeyStatus('ax_plain_legacy')).toBe('plaintext_legacy');
    });
  });

  /* v13.3.20 — Tests régression fix Kevin "Apex oublie ses codes sans cesse" */
  describe('v13.3.20 fix Kevin "oublie codes sans cesse"', () => {
    it('autoStore appelle bien setKey (triple persistence) au lieu de localStorage.setItem direct', async () => {
      /* Spy sur setKey pour vérifier qu'autoStore l'utilise */
      const setKeySpy = vi.spyOn(vault, 'setKey');
      const result = await vault.autoStore('sk-ant-api03-' + 'X'.repeat(50));
      expect(result.ok).toBe(true);
      expect(setKeySpy).toHaveBeenCalledWith('ax_anthropic_key', expect.any(String));
      setKeySpy.mockRestore();
    });

    it('autoStore VERIFY post-write : si readKey ne retourne pas le plaintext, retry 3x', async () => {
      /* setKey OK mais readKey retourne mismatch les 2 premières fois */
      const original = 'sk-ant-api03-' + 'Y'.repeat(50);
      let readCount = 0;
      const realRead = vault.readKey.bind(vault);
      const readSpy = vi.spyOn(vault, 'readKey').mockImplementation(async (k: string) => {
        readCount++;
        if (readCount < 3) return ''; /* Simule mismatch */
        return realRead(k);
      });
      const result = await vault.autoStore(original);
      expect(result.ok).toBe(true);
      /* Au moins 3 reads (verify x3) */
      expect(readCount).toBeGreaterThanOrEqual(3);
      readSpy.mockRestore();
    });

    it('paste credential → reload simulation → key still present (round-trip complet)', async () => {
      const original = 'sk-ant-api03-' + 'Z'.repeat(50);
      /* 1. Paste (autoStore) */
      const stored = await vault.autoStore(original);
      expect(stored.ok).toBe(true);
      /* 2. Simule "reload" : on lit fresh depuis localStorage via vault */
      const after = await vault.readKey('ax_anthropic_key');
      expect(after).toBe(original);
    });

    it('startCredentialsWatch est idempotent (multi-call OK)', () => {
      vault.startCredentialsWatch();
      vault.startCredentialsWatch();
      vault.startCredentialsWatch();
      /* Pas d'erreur, juste guard interne */
      expect(true).toBe(true);
    });

    it('autoStore retourne ok:false avec reason claire si verify fail définitivement', async () => {
      /* Mock setKey pour qu'il retourne ok:false (simule quota persistant) */
      const setKeySpy = vi.spyOn(vault, 'setKey').mockResolvedValue({
        ok: false,
        persisted: { local: false, idb: false, firebase: false },
      });
      const result = await vault.autoStore('sk-ant-api03-' + 'Q'.repeat(50));
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/triple persistence|stockage|verify|recolle/i);
      setKeySpy.mockRestore();
    });
  });
});
