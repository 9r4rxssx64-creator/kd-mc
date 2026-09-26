/**
 * Test régression v13.4.31 — services/multi-source-analyze.ts (extraction multi-credentials).
 *
 * Utilisé par v13.4.14 paste intelligent : extrait credentials + URLs + IPs + MACs
 * + device IDs depuis text/image/PDF/URL pastes.
 *
 * Tests : analyzeText (chemin principal, sync, sans network).
 * analyzeImage/URL/installAll non testés ici (mock Anthropic Vision API requis).
 */
import { describe, it, expect } from 'vitest';
import { multiSourceAnalyze } from '../../services/ai/multi-source-analyze.js';

describe('v13.4.31 analyzeText — extraction credentials', () => {
  it("text vide → result avec 0 items", async () => {
    const r = await multiSourceAnalyze.analyzeText('');
    expect(r.items).toEqual([]);
    expect(r.extracted_count).toBe(0);
  });

  it("text sans credential → 0 items", async () => {
    const r = await multiSourceAnalyze.analyzeText('bonjour comment vas-tu kevin');
    expect(r.items.filter((i) => i.type === 'credential')).toHaveLength(0);
  });

  it("1 Anthropic API key → 1 credential extrait", async () => {
    const text = `Voici ma clé : sk-ant-api03-${'a'.repeat(95)}`;
    const r = await multiSourceAnalyze.analyzeText(text);
    const creds = r.items.filter((i) => i.type === 'credential');
    expect(creds.length).toBeGreaterThanOrEqual(1);
    /* service name lowercased par patternToService */
    expect(creds[0]?.service?.toLowerCase()).toContain('anthropic');
  });

  it(".env multi-key → tous credentials extraits", async () => {
    const env = `
ANTHROPIC_API_KEY=sk-ant-api03-${'a'.repeat(95)}
OPENAI_API_KEY=sk-${'b'.repeat(48)}
`;
    const r = await multiSourceAnalyze.analyzeText(env);
    const creds = r.items.filter((i) => i.type === 'credential');
    expect(creds.length).toBeGreaterThanOrEqual(2);
  });
});

describe('v13.4.31 analyzeText — extraction sites/URLs', () => {
  it("1 URL standalone → 1 site item", async () => {
    const r = await multiSourceAnalyze.analyzeText('check https://anthropic.com please');
    const sites = r.items.filter((i) => i.type === 'site');
    expect(sites.length).toBeGreaterThanOrEqual(1);
    expect(sites[0]?.service).toContain('anthropic');
  });

  it("plusieurs URLs → plusieurs items", async () => {
    const text = 'sites: https://anthropic.com et https://github.com et https://openai.com';
    const r = await multiSourceAnalyze.analyzeText(text);
    const sites = r.items.filter((i) => i.type === 'site');
    expect(sites.length).toBeGreaterThanOrEqual(3);
  });

  it("URL invalide skip silencieux", async () => {
    const r = await multiSourceAnalyze.analyzeText('text avec http:// invalide');
    /* Pas de crash */
    expect(Array.isArray(r.items)).toBe(true);
  });

  it("service détecté depuis hostname (sans www., sans TLD)", async () => {
    const r = await multiSourceAnalyze.analyzeText('https://www.example.com/path');
    const sites = r.items.filter((i) => i.type === 'site');
    expect(sites[0]?.service).toBe('example');
  });
});

describe('v13.4.31 analyzeText — result structure', () => {
  it("result a source_preview + items + extracted_count (structure stable)", async () => {
    const r = await multiSourceAnalyze.analyzeText('hello world');
    expect(typeof r.source_preview).toBe('string');
    expect(Array.isArray(r.items)).toBe(true);
    expect(typeof r.extracted_count).toBe('number');
    /* type peut être 'text' ou undefined selon emptyResult implementation */
  });

  it("source_preview truncate texte long", async () => {
    const longText = 'a'.repeat(500);
    const r = await multiSourceAnalyze.analyzeText(longText);
    expect(r.source_preview.length).toBeLessThanOrEqual(longText.length);
  });

  it("extracted_count === items.length", async () => {
    const env = `KEY=sk-ant-api03-${'a'.repeat(95)}\nhttps://anthropic.com`;
    const r = await multiSourceAnalyze.analyzeText(env);
    expect(r.extracted_count).toBe(r.items.length);
  });
});

describe('v13.4.31 analyzeText — mixed paste (credentials + URLs)', () => {
  it("paste mixte → credentials + sites extraits ensemble", async () => {
    const mixed = `
Voici ma config Apex :
ANTHROPIC_API_KEY=sk-ant-api03-${'a'.repeat(95)}
Dashboard : https://console.anthropic.com
Billing : https://console.anthropic.com/settings/billing
`;
    const r = await multiSourceAnalyze.analyzeText(mixed);
    const creds = r.items.filter((i) => i.type === 'credential');
    const sites = r.items.filter((i) => i.type === 'site');
    expect(creds.length).toBeGreaterThanOrEqual(1);
    expect(sites.length).toBeGreaterThanOrEqual(1);
  });

  it("paste mixed compte total CREDENTIAL + SITE + autres", async () => {
    const mixed = `
sk-${'a'.repeat(48)}
https://github.com
https://openai.com
`;
    const r = await multiSourceAnalyze.analyzeText(mixed);
    expect(r.extracted_count).toBeGreaterThanOrEqual(2); /* min 1 cred + 1 site */
  });
});

describe('v13.4.31 analyzeText — robustesse anti-crash', () => {
  it("text avec caractères spéciaux (emoji, accents) → no crash", async () => {
    const t = `🔑 ma clé : ${`sk-ant-api03-${'a'.repeat(95)}`} 🎉 voilà !`;
    const r = await multiSourceAnalyze.analyzeText(t);
    expect(r.items.length).toBeGreaterThan(0);
  });

  it("text très long (10000 chars) → traité sans throw", async () => {
    const long = 'lorem ipsum '.repeat(1000);
    const r = await multiSourceAnalyze.analyzeText(long);
    expect(r).toBeDefined();
    expect(Array.isArray(r.items)).toBe(true);
  });
});
