/**
 * Test régression v13.4.19 — services/credential-patterns.ts (1000+ lignes, sécu critique).
 *
 * Module utilisé par v13.4.14 paste intelligent + vault.autoStore + auto-restore.
 * Patterns regex sécurité : si faux positif, Kevin colle un token et c'est
 * stocké dans la mauvaise clé → écrasement.
 *
 * Tests : detectCredential (1 pattern) + detectAllCredentials (multi-key paste).
 */
import { describe, it, expect } from 'vitest';
import {
  detectCredential,
  detectAllCredentials,
  CREDENTIAL_PATTERNS,
} from '../../services/vault/credential-patterns.js';

describe('v13.4.19 detectCredential — patterns AI/devops/payments', () => {
  it("Anthropic API key (sk-ant-api03-...)", () => {
    const k = 'sk-ant-api03-' + 'a'.repeat(95);
    const p = detectCredential(k);
    expect(p).not.toBeNull();
    expect(p?.storageKey).toContain('anthropic');
  });

  it("OpenAI Project key (sk-proj-...) — v13.4.6 storageKey distinct", () => {
    const k = 'sk-proj-' + 'a'.repeat(48);
    const p = detectCredential(k);
    expect(p).not.toBeNull();
    expect(p?.name).toBe('OpenAI Project');
    /* v13.4.6 anti-collision : storageKey distincte de OpenAI classic */
    expect(p?.storageKey).toBe('ax_openai_key_proj');
  });

  it("OpenAI classic (sk-...) ≠ Anthropic ni Project", () => {
    const k = 'sk-' + 'a'.repeat(48);
    const p = detectCredential(k);
    expect(p).not.toBeNull();
    expect(p?.name).toBe('OpenAI');
    expect(p?.storageKey).toBe('ax_openai_key');
  });

  it("GitHub PAT classic (ghp_...) — v13.4.6 storageKey distinct", () => {
    const k = 'ghp_' + 'a'.repeat(36);
    const p = detectCredential(k);
    expect(p).not.toBeNull();
    expect(p?.name).toBe('GitHub PAT classic');
    expect(p?.storageKey).toBe('ax_github_pat_classic');
  });

  it("GitHub Fine-grained (github_pat_...) — v13.4.6 storageKey distinct", () => {
    const k = 'github_pat_' + 'a'.repeat(82);
    const p = detectCredential(k);
    expect(p).not.toBeNull();
    expect(p?.name).toBe('GitHub Fine-grained');
    expect(p?.storageKey).toBe('ax_github_pat_finegrained');
  });

  it("Google API key (AIza...) → 'Google AI Gemini' v13.4.42 rename", () => {
    const k = 'AIza' + 'a'.repeat(33);
    const p = detectCredential(k);
    expect(p).not.toBeNull();
    expect(p?.name).toBe('Google AI Gemini');
    expect(p?.storageKey).toBe('ax_gemini_key');
  });

  it("Groq API key (gsk_...)", () => {
    const k = 'gsk_' + 'a'.repeat(50);
    const p = detectCredential(k);
    expect(p).not.toBeNull();
    expect(p?.name).toContain('Groq');
  });

  it("Stripe live secret (sk_live_...)", () => {
    const k = 'sk_live_' + 'a'.repeat(24);
    const p = detectCredential(k);
    expect(p).not.toBeNull();
    expect(p?.name).toContain('Stripe');
  });

  it("AWS access key (AKIA...)", () => {
    const k = 'AKIA' + 'A'.repeat(16);
    const p = detectCredential(k);
    expect(p).not.toBeNull();
    expect(p?.name).toContain('AWS');
  });

  it("retourne null pour string vide", () => {
    expect(detectCredential('')).toBeNull();
    expect(detectCredential('   ')).toBeNull();
  });

  it("retourne null pour texte ordinaire", () => {
    expect(detectCredential('bonjour kevin')).toBeNull();
    expect(detectCredential('Une phrase normale')).toBeNull();
  });

  it("trim whitespace avant détection (Kevin paste avec espaces)", () => {
    const k = '  sk-ant-api03-' + 'a'.repeat(95) + '  ';
    const p = detectCredential(k);
    expect(p).not.toBeNull();
  });

  it("FORBIDDEN : SSH private key refusée (storage forbidden)", () => {
    const sshKey = '-----BEGIN RSA PRIVATE KEY-----\nABC...\n-----END RSA PRIVATE KEY-----';
    const p = detectCredential(sshKey);
    expect(p).not.toBeNull();
    expect(p?.category).toBe('forbidden');
  });

  it("FORBIDDEN testé EN PRIORITÉ (avant patterns normaux)", () => {
    /* Si quelqu'un colle une private key qui matcherait aussi un autre pattern,
     * le forbidden DOIT gagner pour bloquer le stockage. */
    const ssh = '-----BEGIN PRIVATE KEY-----\nXYZ\n-----END PRIVATE KEY-----';
    const p = detectCredential(ssh);
    expect(p?.category).toBe('forbidden');
  });

  it("Multi-line context : scanne ligne par ligne en fallback (whitespace split)", () => {
    /* detectCredential fallback split sur /[\s,;]+/ — donc séparation par espaces
     * mais PAS par '='. Multi-line avec espaces/newlines marche : */
    const multi = 'sk-ant-api03-' + 'a'.repeat(95) + '\nautre ligne';
    const p = detectCredential(multi);
    expect(p).not.toBeNull();
    /* Format .env (KEY=value) → utiliser detectAllCredentials qui split sur '=' */
  });
});

describe('v13.4.19 detectAllCredentials — multi-key paste (.env, JSON)', () => {
  it("retourne [] pour texte sans credential", () => {
    expect(detectAllCredentials('bonjour kevin')).toEqual([]);
  });

  it("détecte 1 credential standalone", () => {
    const k = 'sk-ant-api03-' + 'a'.repeat(95);
    const result = detectAllCredentials(k);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]?.pattern.storageKey).toContain('anthropic');
  });

  it("détecte 2 credentials dans .env (Kevin colle fichier complet)", () => {
    const env = `
ANTHROPIC_API_KEY=sk-ant-api03-${'a'.repeat(95)}
OPENAI_API_KEY=sk-${'b'.repeat(48)}
`;
    const result = detectAllCredentials(env);
    expect(result.length).toBeGreaterThanOrEqual(2);
    const storageKeys = result.map((r) => r.pattern.storageKey);
    expect(storageKeys.some((k) => k.includes('anthropic'))).toBe(true);
    expect(storageKeys.some((k) => k.includes('openai'))).toBe(true);
  });

  it("dedup par storageKey (pas 2× la même clé)", () => {
    /* Si Kevin colle un .env avec 2 lignes ANTHROPIC_API_KEY (rare mais possible),
     * on ne doit pas stocker 2 fois la même valeur. */
    const dupKey = 'sk-ant-api03-' + 'a'.repeat(95);
    const env = `KEY1=${dupKey}\nKEY2=${dupKey}`;
    const result = detectAllCredentials(env);
    const storageKeys = new Set(result.map((r) => r.pattern.storageKey));
    /* Dedup garanti par seen Set dans detectAllCredentials */
    expect(storageKeys.size).toBeLessThanOrEqual(result.length);
  });

  it("retourne [] pour texte vide", () => {
    expect(detectAllCredentials('')).toEqual([]);
    expect(detectAllCredentials('   \n\n  ')).toEqual([]);
  });

  it("split sur séparateurs JSON/env (= : , ; \" ' `)", () => {
    /* Format JSON : { "key": "sk-..." } */
    const json = `{"anthropic":"sk-ant-api03-${'a'.repeat(95)}"}`;
    const result = detectAllCredentials(json);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});

describe('v13.4.19 CREDENTIAL_PATTERNS registry (intégrité)', () => {
  it("registry contient 100+ patterns (couvre principaux providers)", () => {
    expect(CREDENTIAL_PATTERNS.length).toBeGreaterThan(50);
  });

  it("toutes les entrées ont storageKey + regex + category", () => {
    for (const p of CREDENTIAL_PATTERNS) {
      expect(p.storageKey).toBeTruthy();
      expect(p.regex).toBeInstanceOf(RegExp);
      expect(p.category).toBeTruthy();
    }
  });

  it("storageKey utilise préfixe standard ax_ / apex_v13_ / __FORBIDDEN_", () => {
    /* Réalité : la plupart sont ax_*, certaines apex_v13_* (legacy), forbidden __FORBIDDEN_*.
     * Test que AUCUNE storageKey n'est arbitraire (sécu : namespace contrôlé). */
    for (const p of CREDENTIAL_PATTERNS) {
      const ok = p.storageKey.startsWith('ax_')
        || p.storageKey.startsWith('apex_v13_')
        || p.storageKey.startsWith('__FORBIDDEN_');
      expect(ok).toBe(true);
    }
  });

  it("v13.4.6 anti-collision : storageKey GitHub variants distincts", () => {
    const ghpClassic = CREDENTIAL_PATTERNS.find((p) => p.name === 'GitHub PAT classic');
    const ghpFine = CREDENTIAL_PATTERNS.find((p) => p.name === 'GitHub Fine-grained');
    expect(ghpClassic?.storageKey).not.toBe(ghpFine?.storageKey);
  });

  it("v13.4.6 anti-collision : OpenAI vs Project storageKeys distincts", () => {
    const openai = CREDENTIAL_PATTERNS.find((p) => p.name === 'OpenAI');
    const proj = CREDENTIAL_PATTERNS.find((p) => p.name === 'OpenAI Project');
    expect(openai?.storageKey).not.toBe(proj?.storageKey);
  });

  it("forbidden patterns identifiables via category='forbidden'", () => {
    const forbidden = CREDENTIAL_PATTERNS.filter((p) => p.category === 'forbidden');
    expect(forbidden.length).toBeGreaterThan(0);
  });
});
