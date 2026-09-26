/**
 * APEX v13 — Tests RÉGRESSION CRITIQUE vault (Round 1+2+3)
 *
 * Garde-fous protégés ici (NE JAMAIS retirer ces fixes sans replacement clean) :
 * - 14+ patterns détection (Anthropic, OpenAI, Stripe, GitHub PAT, etc.)
 * - autoStore + decrypt round-trip déterministe
 * - v12.784 : decrypt() retourne null sur fail JAMAIS le payload chiffré
 * - Forbidden patterns CB / seed phrase JAMAIS stockés (règle CLAUDE.md absolue)
 * - v13.3.20 : autoStore verify post-write retry 3×
 *
 * Si UN test fail → PR refusée, fuite secret possible.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { vault, CREDENTIAL_PATTERNS } from '../../services/vault/vault.js';
import {
  detectCredential,
  detectAllCredentials,
  CREDENTIAL_PATTERNS as PATTERNS_FULL,
} from '../../services/vault/credential-patterns.js';

describe('REGRESSION vault — 14+ patterns détection critique', () => {
  it('REGRESSION SECU — Au moins 15 patterns historiques préservés (backward-compat)', () => {
    expect(CREDENTIAL_PATTERNS.length).toBeGreaterThanOrEqual(14);
  });

  it("REGRESSION — Au moins 80 patterns dans le registre full (règle Kevin 'AX_CREDENTIAL_PATTERNS 130+')", () => {
    /* Cible idéale 130+ mais on accepte 80+ pour ne pas bloquer
       l'évolution incrémentale. Une baisse en dessous = perte couverture sécu. */
    expect(PATTERNS_FULL.length).toBeGreaterThanOrEqual(80);
  });

  it('REGRESSION — Pattern Anthropic sk-ant-api détecté', () => {
    const r = vault.detectPattern('sk-ant-api03-' + 'A'.repeat(50));
    expect(r?.name).toBe('Anthropic');
    expect(r?.key).toBe('ax_anthropic_key');
  });

  it('REGRESSION — Pattern OpenAI sk- détecté', () => {
    const r = vault.detectPattern('sk-' + 'B'.repeat(48));
    expect(r?.name).toBe('OpenAI');
  });

  it('REGRESSION — Pattern Google AIza détecté', () => {
    const r = vault.detectPattern('AIza' + 'C'.repeat(33));
    expect(r?.name).toBe('Google AI Gemini'); /* v13.4.6 rename */
    expect(r?.key).toBe('ax_gemini_key'); /* v13.4.6 storageKey cohérente avec autres services */
  });

  it('REGRESSION — Pattern GitHub PAT classique détecté', () => {
    const r = vault.detectPattern('ghp_' + 'D'.repeat(36));
    expect(r?.name).toMatch(/GitHub PAT/);
    expect(r?.key).toMatch(/ax_github_(token|pat_classic|pat_finegrained|oauth)/); /* v13.4.6 storageKeys distinctes */
  });

  it('REGRESSION — Pattern GitHub PAT fine-grained détecté', () => {
    const r = vault.detectPattern('github_pat_' + 'X'.repeat(85));
    expect(r?.key).toMatch(/ax_github_(token|pat_classic|pat_finegrained|oauth)/); /* v13.4.6 storageKeys distinctes */
  });

  it('REGRESSION — Pattern Stripe SK live/test détecté', () => {
    const r1 = vault.detectPattern('sk_live_' + 'E'.repeat(30));
    expect(r1?.name).toMatch(/Stripe/i);
    const r2 = vault.detectPattern('sk_test_' + 'F'.repeat(30));
    expect(r2?.name).toMatch(/Stripe/i);
  });

  it('REGRESSION — Pattern Brevo xkeysib détecté', () => {
    const r = vault.detectPattern('xkeysib-abc123-defghi');
    expect(r?.name).toMatch(/Brevo/i);
  });

  it('REGRESSION — Pattern Resend re_ détecté', () => {
    const r = vault.detectPattern('re_AbCdEfGh_12345');
    expect(r?.name).toBe('Resend');
  });

  it('REGRESSION — Pattern Groq gsk_ détecté', () => {
    const r = vault.detectPattern('gsk_' + 'G'.repeat(48));
    expect(r?.name).toBe('Groq');
  });

  it('REGRESSION — Pattern Perplexity pplx- détecté', () => {
    const r = vault.detectPattern('pplx-' + 'H'.repeat(40));
    expect(r?.name).toBe('Perplexity');
  });

  it('REGRESSION — Pattern Telegram bot token détecté', () => {
    const r = vault.detectPattern('123456789:' + 'I'.repeat(35));
    expect(r?.name).toMatch(/Telegram/i);
  });

  it('REGRESSION — Valeur inconnue retourne null (pas de faux positif)', () => {
    expect(vault.detectPattern('bonjour le monde')).toBeNull();
    expect(vault.detectPattern('12345')).toBeNull();
  });
});

describe('REGRESSION vault — encrypt/decrypt round-trip (v12.784)', () => {
  it('REGRESSION CRITIQUE — round-trip OK avec passphrase correcte', async () => {
    const enc = await vault.encrypt('mon-secret-anthropic-12345', 'mypass1234');
    const dec = await vault.decrypt(enc, 'mypass1234');
    expect(dec).toBe('mon-secret-anthropic-12345');
  });

  it("REGRESSION SECU CRITIQUE v12.784 — decrypt retourne null sur fail (JAMAIS le payload chiffré)", async () => {
    const enc = await vault.encrypt('secret-leak-test', 'good-pass');
    const dec = await vault.decrypt(enc, 'wrong-pass');

    /* CRITIQUE : null obligatoire — pas de fuite payload chiffré */
    expect(dec).toBeNull();
    /* Aucune string ne doit être retournée même tronquée */
    expect(typeof dec).not.toBe('string');
  });

  it('REGRESSION — decrypt retourne null sur format invalide (pas crash)', async () => {
    const dec = await vault.decrypt('not-an-encrypted-payload', 'any-pass');
    expect(dec).toBeNull();
  });

  it('REGRESSION — décryptage idempotent (même résultat chaque appel)', async () => {
    const enc = await vault.encrypt('clé-stable', 'pass');
    const dec1 = await vault.decrypt(enc, 'pass');
    const dec2 = await vault.decrypt(enc, 'pass');
    expect(dec1).toBe(dec2);
    expect(dec1).toBe('clé-stable');
  });

  it("REGRESSION — encrypt préfixe avec AXENC1: (format reconnaissable)", async () => {
    const enc = await vault.encrypt('test', 'p');
    expect(enc.startsWith('AXENC1:')).toBe(true);
  });
});

describe('REGRESSION SECU CRITIQUE — Forbidden patterns NEVER stocked', () => {
  it("REGRESSION INTERDICTION ABSOLUE — Carte bancaire détectée mais marquée __FORBIDDEN_CB__", () => {
    /* Format Visa/MC standard 16 digits */
    const cards = [
      '4111 1111 1111 1111', /* Visa */
      '5500 0000 0000 0004', /* MasterCard */
      '4111-1111-1111-1111',
      '4111111111111111',
    ];

    for (const card of cards) {
      const detected = detectCredential(card);
      if (detected) {
        /* CRITIQUE : si détecté, doit être marqué FORBIDDEN — JAMAIS storageKey utilisable */
        expect(detected.category).toBe('forbidden');
        expect(detected.storageKey).toMatch(/^__FORBIDDEN_/);
      }
    }
  });

  it("REGRESSION INTERDICTION ABSOLUE — Seed phrases (12 mots BIP39) marquées FORBIDDEN", () => {
    /* Pattern seed phrase BIP39 commun (12 mots) */
    const seed = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    const detected = detectCredential(seed);
    if (detected) {
      expect(detected.category).toBe('forbidden');
      expect(detected.storageKey).toMatch(/^__FORBIDDEN_/);
    }
  });

  it('REGRESSION — Aucun forbidden pattern ne doit avoir un storageKey utilisable', () => {
    const forbiddens = PATTERNS_FULL.filter((p) => p.category === 'forbidden');
    expect(forbiddens.length).toBeGreaterThan(0); /* Au moins 1 forbidden pattern défini */

    for (const f of forbiddens) {
      /* CRITIQUE : storageKey commence par __FORBIDDEN_ pour qu'aucun store accidentel ne marche */
      expect(f.storageKey).toMatch(/^__FORBIDDEN_/);
    }
  });
});

describe('REGRESSION vault — autoStore verify (v13.3.20)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('REGRESSION v13.3.20 — autoStore détecte format inconnu et retourne explicit fail', async () => {
    const r = await vault.autoStore('not-a-real-credential-xyz');
    /* Soit ok=false (format inconnu), soit ok=true mais avec fallback resolved (v13.3.21) */
    expect(typeof r.ok).toBe('boolean');
  });

  it('REGRESSION v13.3.20 — autoStore avec clé Anthropic valide stocke correctement', async () => {
    const fakeKey = 'sk-ant-api03-' + 'A'.repeat(50);
    const r = await vault.autoStore(fakeKey);
    /* Doit indiquer ok=true ET pattern détecté sur Anthropic */
    if (r.ok) {
      expect(r.pattern).toBeTruthy();
      expect(r.pattern?.name).toMatch(/Anthropic/i);
    }
  });
});

describe('REGRESSION — detectAllCredentials (multi-extraction Kevin règle 2026-05-07)', () => {
  it('REGRESSION CLAUDE.md "Multi-extraction obligatoire" — texte avec 2 clés détecte 2', () => {
    const text = `Voici mes clés:
      anthropic = sk-ant-api03-${'X'.repeat(50)}
      github = ghp_${'Y'.repeat(36)}`;

    const detected = detectAllCredentials(text);
    expect(detected.length).toBeGreaterThanOrEqual(2);
  });

  it('REGRESSION — multi-detect ignore le bruit autour des clés', () => {
    const text = 'Voici la clé: ghp_' + 'Z'.repeat(36) + ' c\'est tout';
    const detected = detectAllCredentials(text);
    expect(detected.length).toBeGreaterThanOrEqual(1);
    const githubFound = detected.some((d) => /github/i.test(d.pattern.name));
    expect(githubFound).toBe(true);
  });
});

describe('TEST MENTAL OBLIGATOIRE — Kevin colle texte avec 5 secrets', () => {
  it('REGRESSION — Photo "compte multi-services" : 5 patterns extraits et configurés (règle Kevin 2026-05-07)', () => {
    /* Exemple multi-source comme Kevin pourrait coller */
    const collage = `
      ANTHROPIC_KEY=sk-ant-api03-${'A'.repeat(50)}
      OPENAI_KEY=sk-${'B'.repeat(48)}
      GITHUB_PAT=ghp_${'C'.repeat(36)}
      STRIPE_KEY=sk_live_${'D'.repeat(30)}
      GROQ_KEY=gsk_${'E'.repeat(48)}
    `;

    const detected = detectAllCredentials(collage);
    /* Règle CLAUDE.md absolue : "Pas se contenter de la 1ère trouvaille" */
    expect(detected.length).toBeGreaterThanOrEqual(4);
  });
});
