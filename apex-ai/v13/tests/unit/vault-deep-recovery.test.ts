/**
 * APEX v13 — Tests Vault Deep Recovery (Kevin 2026-05-09 P0).
 *
 * Vérifie :
 *   1. scanAndRestoreAll : restore IDB/alias + reclassify + whatsapp en 1 passe.
 *   2. reclassifyMisplacedKeys : Cohere mal classée contenant un xAI Bearer →
 *      migration vers ax_xai_key + backup ancien.
 *   3. autoWireWhatsApp : numéro dans ax_user.phone → set ax_kevin_whatsapp_phone.
 *   4. Idempotent : 2e run no-op (throttle).
 *   5. Pas de régression : clés bien classées restent intactes.
 *   6. autoWireWhatsApp skip si déjà wiré.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { vaultDeepRecovery, __test_helpers } from '../../services/vault/vault-deep-recovery.js';

describe('Vault Deep Recovery (Kevin 2026-05-09 P0 ABSOLUE)', () => {
  beforeEach(() => {
    localStorage.clear();
    /* Reset throttle entre tests */
    localStorage.removeItem(__test_helpers.RUN_THROTTLE_KEY);
  });

  it('scanAndRestoreAll fonctionne sans crash et retourne report cohérent', async () => {
    const r = await vaultDeepRecovery.scanAndRestoreAll();
    expect(r).toBeDefined();
    expect(typeof r.ts).toBe('number');
    expect(typeof r.restored).toBe('number');
    expect(typeof r.reclassified).toBe('number');
    expect(typeof r.whatsappWired).toBe('boolean');
    expect(Array.isArray(r.details.errors)).toBe(true);
    expect(Array.isArray(r.details.reclassification)).toBe(true);
  });

  it('reclassifyMisplacedKeys : valeur Anthropic stockée dans ax_openai_key → migrée vers ax_anthropic_key', async () => {
    const { vault } = await import('../../services/vault/vault.js');
    /* Stocke une vraie clé Anthropic dans ax_openai_key (mauvais emplacement) */
    const anthropicKey = 'sk-ant-api03-' + 'X'.repeat(95);
    await vault.setKey('ax_openai_key', anthropicKey);

    const r = await vaultDeepRecovery.reclassifyMisplacedKeys();
    expect(r.moved).toBeGreaterThanOrEqual(1);

    /* La clé Anthropic doit maintenant être dans ax_anthropic_key */
    const anthropicVal = await vault.readKey('ax_anthropic_key');
    expect(anthropicVal).toBe(anthropicKey);

    /* Vérifie qu'au moins 1 backup a été créé */
    let backupFound = false;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(__test_helpers.RECOVERY_BACKUP_PREFIX) && k.includes('ax_openai_key')) {
        backupFound = true;
        break;
      }
    }
    expect(backupFound).toBe(true);
  });

  it('autoWireWhatsApp : numéro dans ax_user.phone → set ax_kevin_whatsapp_phone', async () => {
    /* Profil Kevin avec numéro WhatsApp */
    localStorage.setItem('ax_user', JSON.stringify({
      id: 'kdmc_admin',
      name: 'Kevin DESARZENS',
      phone: '+33612345678',
    }));

    const r = await vaultDeepRecovery.autoWireWhatsApp();
    expect(r.wired).toBe(true);
    expect(r.source).toBe('ax_user.phone');
    expect(r.phone).toBe('+33612345678');

    /* Vérifie que ax_kevin_whatsapp_phone est bien set + déchiffrable */
    const { vault } = await import('../../services/vault/vault.js');
    const phone = await vault.readKey('ax_kevin_whatsapp_phone');
    expect(phone).toBe('+33612345678');
  });

  it('autoWireWhatsApp : skip si déjà wiré (idempotent)', async () => {
    const { vault } = await import('../../services/vault/vault.js');
    /* Pré-set numéro valide */
    await vault.setKey('ax_kevin_whatsapp_phone', '+33612345678');

    /* Mettre un autre numéro dans profil → ne doit PAS écraser */
    localStorage.setItem('ax_user', JSON.stringify({
      id: 'kdmc_admin',
      phone: '+33799999999',
    }));

    const r = await vaultDeepRecovery.autoWireWhatsApp();
    expect(r.wired).toBe(false); /* déjà wiré */

    /* Vérifie que le numéro initial est conservé */
    const phone = await vault.readKey('ax_kevin_whatsapp_phone');
    expect(phone).toBe('+33612345678');
  });

  it('reclassifyMisplacedKeys : clé bien classée NE BOUGE PAS (pas de régression)', async () => {
    const { vault } = await import('../../services/vault/vault.js');
    const anthropicKey = 'sk-ant-api03-' + 'Y'.repeat(95);
    await vault.setKey('ax_anthropic_key', anthropicKey);

    const r = await vaultDeepRecovery.reclassifyMisplacedKeys();
    /* Aucune migration : ax_anthropic_key contient bien une clé Anthropic */
    const anthropicMoved = r.details.find((d) => d.from === 'ax_anthropic_key' && d.ok);
    expect(anthropicMoved).toBeUndefined();

    /* Valeur conservée */
    const val = await vault.readKey('ax_anthropic_key');
    expect(val).toBe(anthropicKey);
  });

  it('scanAndRestoreAll : 2e run dans la même fenêtre 5min skip via throttle (idempotent)', async () => {
    /* 1er run */
    const r1 = await vaultDeepRecovery.scanAndRestoreAll();
    expect(r1).toBeDefined();

    /* 2e run immédiat → throttle doit kick in : retourne report initial vide */
    const r2 = await vaultDeepRecovery.scanAndRestoreAll();
    expect(r2.restored).toBe(0);
    expect(r2.reclassified).toBe(0);
    expect(r2.whatsappWired).toBe(false);
    expect(r2.details.autoRestore.restored).toBe(0);
  });

  it('autoWireWhatsApp : numéro invalide dans profil → wired=false', async () => {
    localStorage.setItem('ax_user', JSON.stringify({
      id: 'kdmc_admin',
      phone: 'not-a-phone-number',
    }));
    const r = await vaultDeepRecovery.autoWireWhatsApp();
    expect(r.wired).toBe(false);
  });

  it('normalizePhone helper : E.164 valides reconnus, invalides rejetés', () => {
    expect(__test_helpers.normalizePhone('+33612345678')).toBe('+33612345678');
    expect(__test_helpers.normalizePhone('+33 6 12 34 56 78')).toBe('+33612345678');
    expect(__test_helpers.normalizePhone('06.12.34.56.78')).toBe('0612345678');
    expect(__test_helpers.normalizePhone('+377 99 88 77 66')).toBe('+37799887766');
    expect(__test_helpers.normalizePhone('not-phone')).toBeNull();
    expect(__test_helpers.normalizePhone('123')).toBeNull(); /* trop court */
    expect(__test_helpers.normalizePhone('')).toBeNull();
  });

  it('redactPhone helper : keeps prefix + last 2 chars', () => {
    expect(__test_helpers.redactPhone('+33612345678')).toBe('+33***78');
    expect(__test_helpers.redactPhone('123')).toBe('***'); /* trop court */
  });
});
