// Garde anti-régression SÉCU (v1.1.285) — audit 2026-09-05, finding P1/P0.
//
// L'admin d'Apex Chat doit être décidé UNIQUEMENT côté serveur (SSO/JWT +
// is_admin en base), JAMAIS côté client par le nom (règle CLAUDE.md « ADMIN
// DÉCIDÉ UNIQUEMENT côté serveur »). Trois vecteurs client-side accordaient
// l'admin en tapant le nom « Kevin Desarzens » :
//   1. le repli HORS-LIGNE créait une session id='kdmc_admin', is_admin=true ;
//   2. K.login()/restauration forçaient K.user.is_admin=true si le nom matchait ;
//   3. pire : le bypass en ligne fabriquait un jeton 'local-admin-...' avec
//      is_admin=true MÊME QUAND LE SERVEUR REFUSAIT (401 admin_mfa_required),
//      ce qui annulait la fermeture de la porte admin (drapeau
//      ADMIN_BYPASS_REQUIRE_MFA="true").
//
// Ce test ÉCHOUE si l'un de ces vecteurs réapparaît dans index.html.
// Prouvé discriminant : remettre `is_admin: isKevin` ou `K.user.is_admin = true`
// ou un jeton `'local-admin-'` dans index.html → ce test échoue.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX = join(__dirname, '..', '..', 'index.html');

describe("Sécurité — l'admin n'est jamais accordé côté client par le nom", () => {
  const html = readFileSync(INDEX, 'utf8');

  it("le repli hors-ligne n'accorde ni id='kdmc_admin' ni is_admin par le nom", () => {
    // Ancien code fautif : `id: isKevin ? 'kdmc_admin' : (...)` + `is_admin: isKevin`.
    expect(/isKevin\s*\?\s*['"]kdmc_admin['"]/.test(html)).toBe(false);
    expect(/is_admin:\s*isKevin/.test(html)).toBe(false);
  });

  it("aucun forçage client `K.user.is_admin = true`", () => {
    // L'admin ne doit venir que de user.is_admin renvoyé par le serveur, jamais
    // affecté en dur côté client (que ce soit dans K.login ou la restauration).
    expect(/K\.user\.is_admin\s*=\s*true/.test(html)).toBe(false);
  });

  it("aucun jeton admin local fabriqué quand le serveur refuse ('local-admin-')", () => {
    // Le bypass en ligne ne doit plus créer de session admin locale sur refus
    // serveur — l'admin passe UNIQUEMENT par le SSO (vrai jeton serveur).
    expect(html.includes('local-admin-')).toBe(false);
  });
});
