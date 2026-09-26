/**
 * Test régression v13.4.98 — Vault Firebase backup multi-uid restore.
 *
 * Kevin "Coffre tjs perd memoire" → cause racine : reinstall PWA wipe
 * localStorage 'apex_v13_uid' → getUid()='anon' → backup unreachable.
 *
 * Fix : getUid() fallback ADMIN_KEVIN_UID si pin admin présent OU last_known_name
 * contient Kevin. getAllKnownUids() retourne ALL uids pour scan exhaustif.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');

describe('v13.4.98 vault-firebase-backup multi-uid fallback', () => {
  const src = readFileSync(resolve(ROOT, 'services/vault/vault-firebase-backup.ts'), 'utf-8');

  it("getUid() fallback ADMIN_KEVIN_UID si pin admin présent", () => {
    expect(src).toContain("const ADMIN_KEVIN_UID = 'kdmc_admin'");
    expect(src).toContain("apex_v13_pin");
    expect(src).toMatch(/return ADMIN_KEVIN_UID/);
  });

  it("getUid() fallback last_known_name si contient kevin/desarzens", () => {
    expect(src).toContain('lastKnownName');
    expect(src).toMatch(/lastKnownName\.includes\('kevin'\)/);
    expect(src).toMatch(/lastKnownName\.includes\('desarzens'\)/);
  });

  it("getAllKnownUids() retourne array avec ADMIN_KEVIN_UID toujours", () => {
    expect(src).toContain('function getAllKnownUids()');
    expect(src).toContain("set.add(ADMIN_KEVIN_UID)");
  });

  it("fetch() scanne tous les uids (boucle for of allUids)", () => {
    expect(src).toMatch(/for \(const uid of allUids\)/);
  });

  it("listAll() merge backups depuis tous les uids (dedupe par key)", () => {
    expect(src).toContain('seenByKey');
    expect(src).toContain('getAllKnownUids');
  });
});

describe('v13.4.248 index.html — zoom utilisateur réactivé (a11y Apple HIG / WCAG 1.4.4)', () => {
  const html = readFileSync(resolve(ROOT, 'index.html'), 'utf-8');

  /* v13.4.248 a RETIRÉ le script inline anti-zoom (gesturestart/lastTouchEnd) et
     réactivé le pinch-zoom accessibilité. Le double-tap-zoom reste neutralisé via
     CSS touch-action:manipulation (base.css/rescue.css), pas via JS. Ces tests
     vérifient désormais l'intention COURANTE (zoom a11y permis), pas l'ancienne. */
  it("ne bloque PLUS le pinch-zoom par JS inline (gesturestart retiré)", () => {
    expect(html).not.toMatch(/gesturestart[\s\S]*gesturechange[\s\S]*gestureend/);
    expect(html).not.toMatch(/lastTouchEnd[\s\S]*300/);
  });

  it("viewport autorise le zoom (pas de user-scalable=no, maximum-scale >= 5)", () => {
    const vp = html.match(/<meta name="viewport"[^>]*content="([^"]*)"/)?.[1] ?? '';
    expect(vp).toContain('width=device-width');
    expect(vp).not.toMatch(/user-scalable\s*=\s*no/);
    const maxScale = vp.match(/maximum-scale\s*=\s*([\d.]+)/)?.[1];
    if (maxScale) expect(Number(maxScale)).toBeGreaterThanOrEqual(5);
  });

  it("bootstrap chargé en module (entry présent)", () => {
    expect(html).toMatch(/bootstrap[\w.-]*\.js/);
  });
});
