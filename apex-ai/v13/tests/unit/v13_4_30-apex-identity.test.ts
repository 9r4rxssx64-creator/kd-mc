/**
 * Test régression v13.4.30 — core/apex-identity.ts (identité Kevin/Laurence/famille irrévocable).
 *
 * Règle CLAUDE.md ABSOLUE Kevin 2026-05-08 "Oublie ni moi ni personne jamais !".
 * Identité hardcoded source de vérité. Si modifié sans review → Apex peut oublier
 * qui est Kevin/Laurence = catastrophique UX commerciale.
 *
 * Tests : APEX_IDENTITY structure + buildIdentitySection + buildExtendedIdentitySection
 *         + listAllKnownUsers + intégrité anti-régression.
 */
import { describe, it, expect } from 'vitest';
import {
  APEX_IDENTITY,
  buildIdentitySection,
  buildExtendedIdentitySection,
  listAllKnownUsers,
} from '../../core/apex-identity.js';

describe('v13.4.30 APEX_IDENTITY structure intégrité', () => {
  it("self : Apex AI + créateur Kevin", () => {
    expect(APEX_IDENTITY.self.name).toBe('Apex AI');
    expect(APEX_IDENTITY.self.creator).toContain('Kevin');
    expect(APEX_IDENTITY.self.version).toMatch(/v13/);
  });

  it("admin : Kevin DESARZENS + id kdmc_admin", () => {
    expect(APEX_IDENTITY.admin.id).toBe('kdmc_admin');
    expect(APEX_IDENTITY.admin.name).toBe('Kevin DESARZENS');
    expect(APEX_IDENTITY.admin.company).toBe('Casino Monaco');
  });

  it("admin venues : CMC, CDP, Sun, MCB (4 casinos SBM)", () => {
    expect(APEX_IDENTITY.admin.venues).toContain('CMC');
    expect(APEX_IDENTITY.admin.venues).toContain('CDP');
    expect(APEX_IDENTITY.admin.venues).toContain('Sun');
    expect(APEX_IDENTITY.admin.venues).toContain('MCB');
  });

  it("admin aliases : Kevin + KDMC + variants reconnus", () => {
    expect(APEX_IDENTITY.admin.aliases).toContain('Kevin');
    expect(APEX_IDENTITY.admin.aliases.length).toBeGreaterThanOrEqual(3);
  });

  it("family.laurence : Laurence Saint-Polit ❤️ (anti-régression #40)", () => {
    expect(APEX_IDENTITY.family.laurence.id).toBe('laurence_sp');
    expect(APEX_IDENTITY.family.laurence.name).toContain('Laurence');
    expect(APEX_IDENTITY.family.laurence.relation).toContain('❤️');
    expect(APEX_IDENTITY.family.laurence.tier).toBe('laurence');
  });
});

describe('v13.4.30 buildIdentitySection — system prompt header', () => {
  it("retourne string non-vide", () => {
    const s = buildIdentitySection();
    expect(typeof s).toBe('string');
    expect(s.length).toBeGreaterThan(100);
  });

  it("contient header 🪪 IDENTITÉ APEX", () => {
    expect(buildIdentitySection()).toContain('IDENTITÉ APEX');
  });

  it("contient Apex AI + version", () => {
    const s = buildIdentitySection();
    expect(s).toContain('Apex AI');
    expect(s).toContain('v13');
  });

  it("contient Kevin DESARZENS + Casino Monaco", () => {
    const s = buildIdentitySection();
    expect(s).toContain('Kevin DESARZENS');
    expect(s).toContain('Casino Monaco');
  });

  it("contient Laurence Saint-Polit ❤️", () => {
    const s = buildIdentitySection();
    expect(s).toContain('Laurence');
  });

  it("contient mention 'irrévocable'/'JAMAIS oubliée' (règle Kevin)", () => {
    const s = buildIdentitySection();
    expect(/irrévocable|JAMAIS oublié/i.test(s)).toBe(true);
  });
});

describe('v13.4.30 buildExtendedIdentitySection — enriched admin', () => {
  it("retourne string plus long que basic", () => {
    const basic = buildIdentitySection();
    const ext = buildExtendedIdentitySection();
    expect(ext.length).toBeGreaterThan(basic.length);
  });

  it("contient header enrichi + 'Oublie ni moi ni personne'", () => {
    const ext = buildExtendedIdentitySection();
    expect(ext).toContain('ENRICHIE');
    expect(ext).toContain('personne');
  });

  it("contient Kevin + Laurence (toujours)", () => {
    const ext = buildExtendedIdentitySection();
    expect(ext).toContain('Kevin');
    expect(ext).toContain('Laurence');
  });
});

describe('v13.4.30 listAllKnownUsers — registry complet', () => {
  it("retourne array non-vide", () => {
    const list = listAllKnownUsers();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
  });

  it("contient Kevin admin (category=admin)", () => {
    const list = listAllKnownUsers();
    const admin = list.find((u) => u.category === 'admin');
    expect(admin).toBeDefined();
    expect(admin?.name).toContain('Kevin');
  });

  it("contient Laurence (category=family)", () => {
    const list = listAllKnownUsers();
    const laurence = list.find((u) => u.category === 'family' && u.name.includes('Laurence'));
    expect(laurence).toBeDefined();
  });

  it("contient employés cadres CMCteams (category=employee_cadre)", () => {
    const list = listAllKnownUsers();
    const cadres = list.filter((u) => u.category === 'employee_cadre');
    expect(cadres.length).toBeGreaterThan(0);
  });

  it("chaque entrée a category + name", () => {
    const list = listAllKnownUsers();
    for (const u of list) {
      expect(u.category).toBeTruthy();
      expect(u.name).toBeTruthy();
    }
  });

  it("categories enum valides uniquement", () => {
    const validCats = new Set(['admin', 'family', 'friend', 'client_pro', 'client_free', 'employee_cadre']);
    const list = listAllKnownUsers();
    for (const u of list) {
      expect(validCats.has(u.category)).toBe(true);
    }
  });
});

describe('v13.4.30 IRRÉVOCABILITÉ — anti-régression source de vérité', () => {
  it("APEX_IDENTITY.admin.id === 'kdmc_admin' (NEVER CHANGE)", () => {
    /* Test régression critique : si quelqu'un change l'id admin, ce test fail
     * et empêche le commit (anti-régression Erreur #37/#44 catastrophique). */
    expect(APEX_IDENTITY.admin.id).toBe('kdmc_admin');
  });

  it("APEX_IDENTITY.family.laurence.id === 'laurence_sp' (NEVER CHANGE)", () => {
    expect(APEX_IDENTITY.family.laurence.id).toBe('laurence_sp');
  });

  it("APEX_IDENTITY est un objet (pas modifié en variable)", () => {
    expect(typeof APEX_IDENTITY).toBe('object');
    expect(APEX_IDENTITY).not.toBeNull();
  });
});
