/**
 * Test régression v13.4.100 — Credential associator + tester runtime.
 *
 * Kevin 2026-05-15 : "Qu'il associe identifiant et codes intelligemment et
 * teste tout toujours"
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { apexCredentialAssociator } from '../../services/vault/apex-credential-associator.js';
import {
  isServiceSupported,
  listSupportedServices,
} from '../../services/vault/apex-credential-tester.js';

describe('v13.4.100 apexCredentialAssociator', () => {
  beforeEach(() => {
    try { localStorage.removeItem('apex_v13_credential_associations'); } catch { /* ignore */ }
  });

  it("associate() refuse non-admin", () => {
    const r = apexCredentialAssociator.associate({
      service: 'anthropic',
      credentialValue: 'sk-ant-api03-fake-xxx',
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('admin_only_associate');
  });

  it("associate() refuse input invalid", () => {
    const r1 = apexCredentialAssociator.associate({ service: '', credentialValue: 'x' });
    expect(r1.ok).toBe(false);
    const r2 = apexCredentialAssociator.associate({ service: 'anthropic', credentialValue: '' });
    expect(r2.ok).toBe(false);
  });

  it("list() retourne array vide initial", () => {
    expect(Array.isArray(apexCredentialAssociator.list())).toBe(true);
    expect(apexCredentialAssociator.list().length).toBe(0);
  });

  it("listByOwner / listByService retournent array", () => {
    expect(Array.isArray(apexCredentialAssociator.listByOwner('kdmc_admin'))).toBe(true);
    expect(Array.isArray(apexCredentialAssociator.listByService('anthropic'))).toBe(true);
  });

  it("audit() retourne structure attendue", () => {
    const r = apexCredentialAssociator.audit();
    expect(r).toHaveProperty('orphans_no_owner');
    expect(r).toHaveProperty('orphans_no_service');
    expect(r).toHaveProperty('duplicates');
    expect(r).toHaveProperty('untested');
    expect(r).toHaveProperty('invalid');
  });

  it("runTestAll() refuse non-admin", async () => {
    const r = await apexCredentialAssociator.runTestAll();
    expect(r.errors).toBeGreaterThanOrEqual(1);
  });
});

describe('v13.4.100 apex-credential-tester support services', () => {
  it("isServiceSupported('anthropic') retourne true", () => {
    expect(isServiceSupported('anthropic')).toBe(true);
  });

  it("isServiceSupported('openai') retourne true", () => {
    expect(isServiceSupported('openai')).toBe(true);
  });

  it("isServiceSupported('github') retourne true", () => {
    expect(isServiceSupported('github')).toBe(true);
  });

  it("isServiceSupported('mistral') retourne true", () => {
    expect(isServiceSupported('mistral')).toBe(true);
  });

  it("isServiceSupported('inconnu') retourne false", () => {
    expect(isServiceSupported('un_service_inexistant')).toBe(false);
  });

  it("listSupportedServices() contient les principaux providers IA", () => {
    const services = listSupportedServices();
    expect(services.length).toBeGreaterThanOrEqual(7);
    expect(services).toContain('anthropic');
    expect(services).toContain('openai');
    expect(services).toContain('groq');
    expect(services).toContain('mistral');
    expect(services).toContain('github');
  });

  it("case-insensitive support", () => {
    expect(isServiceSupported('ANTHROPIC')).toBe(true);
    expect(isServiceSupported('GitHub')).toBe(true);
  });
});
