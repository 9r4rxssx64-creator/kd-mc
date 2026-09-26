// Garde VÉRITÉ (v1.1.285) — audit 2026-09-05, « documentation qui ment ».
//
// Règle Kevin ABSOLUE « vérité, rien de faux, partout toujours » : on ne promet
// jamais une sécurité que le code ne tient pas. Le README annonçait
// « chiffrement militaire post-quantum (PQXDH) » et « serveur aveugle » :
//   - MESURÉ : le chiffrement réel est ECDH P-256 + HKDF-SHA256 + AES-GCM-256
//     + PBKDF2 100k. ZÉRO Kyber, ZÉRO ML-KEM dans tout le dépôt. « PQXDH »
//     n'existe que comme texte de remplissage 'PENDING_PQXDH' en base.
//   - « serveur aveugle » est faux en mode A (KEVIN_INVISIBLE_ADMIN : le compte
//     admin est membre invisible de chaque conversation).
//
// Ce test ÉCHOUE si une allégation post-quantique revient dans le README, et
// si la version de package.json diverge de la version réelle de l'app (elle
// avait 23 versions de retard : 1.1.262 vs 1.1.285).
//
// Prouvé discriminant : remettre « post-quantum » en tête du README, ou
// désynchroniser package.json → ce test échoue.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

describe('Vérité — aucune allégation de sécurité que le code ne tient pas', () => {
  it("le README ne revendique PAS de chiffrement post-quantique", () => {
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
    // On isole l'en-tête (avant l'encadré d'honnêteté qui, lui, EXPLIQUE que
    // c'était faux — il a le droit de citer les termes pour les démentir).
    const claimLine = readme.split('\n').slice(0, 6).join('\n');
    expect(/post.?quantum|post.?quantique|PQXDH|Kyber|ML-KEM/i.test(claimLine)).toBe(false);
  });

  it("aucune vraie primitive post-quantique n'est utilisée (donc rien à revendiquer)", () => {
    const crypto = readFileSync(join(ROOT, 'lib', 'crypto-core.js'), 'utf8');
    // Le code réel : ECDH/HKDF/AES-GCM/PBKDF2 — et PAS de Kyber/ML-KEM.
    expect(crypto.includes('ECDH')).toBe(true);
    expect(crypto.includes('AES-GCM')).toBe(true);
    expect(/kyber|ml-kem/i.test(crypto)).toBe(false);
  });

  it('la version de package.json suit la version réelle de l\'app', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    const m = html.match(/__APEX_CHAT_VERSION__\s*=\s*'v([\d.]+)'/);
    expect(m, 'version introuvable dans index.html').toBeTruthy();
    expect(pkg.version).toBe(m[1]);
  });
});
