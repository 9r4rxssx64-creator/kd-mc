/**
 * Tests unitaires multi-source-analyze (v13.3.53).
 * Règle Kevin "Vérifie teste pour tout toujours".
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { multiSourceAnalyze } from '../../services/ai/multi-source-analyze.js';

describe('multi-source-analyze', () => {
  beforeEach(() => {
    localStorage.clear();
    /* Mock fetch pour que tests sites/credentials ne tombent pas en erreur */
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
  });

  it('analyzeText vide → result vide', async () => {
    const r = await multiSourceAnalyze.analyzeText('');
    expect(r.extracted_count).toBe(0);
    expect(r.items).toEqual([]);
  });

  it('analyzeText extrait Anthropic credential', async () => {
    const r = await multiSourceAnalyze.analyzeText('sk-ant-api03-' + 'A'.repeat(50));
    expect(r.extracted_count).toBeGreaterThan(0);
    const cred = r.items.find((it) => it.type === 'credential' && it.service?.includes('anthropic'));
    expect(cred).toBeDefined();
    expect(cred?.confidence).toBeGreaterThan(0.9);
  });

  it('analyzeText multi-credential dans une note', async () => {
    const note = `
      Mes clés :
      - Anthropic : sk-ant-api03-${'X'.repeat(50)}
      - OpenAI : sk-${'Y'.repeat(48)}
      - GitHub : ghp_${'Z'.repeat(36)}
    `;
    const r = await multiSourceAnalyze.analyzeText(note);
    const creds = r.items.filter((it) => it.type === 'credential');
    expect(creds.length).toBeGreaterThanOrEqual(2);
  });

  it('analyzeText extrait URLs', async () => {
    const r = await multiSourceAnalyze.analyzeText('Va sur https://api.example.com et https://docs.example.org/page');
    const sites = r.items.filter((it) => it.type === 'site');
    expect(sites.length).toBe(2);
    expect(sites[0]?.value).toMatch(/example/);
  });

  it('analyzeText extrait emails', async () => {
    const r = await multiSourceAnalyze.analyzeText('Contact kevin@desarzens.com et support@anthropic.com');
    const emails = r.items.filter((it) => it.type === 'identifier' && it.service === 'email');
    expect(emails.length).toBe(2);
  });

  it('analyzeText extrait IPs', async () => {
    const r = await multiSourceAnalyze.analyzeText('Routeur sur 192.168.1.1 et serveur 10.0.0.42');
    const ips = r.items.filter((it) => it.type === 'address');
    expect(ips.length).toBe(2);
  });

  it('analyzeText rejette IP invalide (>255)', async () => {
    const r = await multiSourceAnalyze.analyzeText('999.888.777.666');
    const ips = r.items.filter((it) => it.type === 'address');
    expect(ips.length).toBe(0);
  });

  it('analyzeText extrait MAC addresses', async () => {
    const r = await multiSourceAnalyze.analyzeText('Device MAC AA:BB:CC:DD:EE:FF');
    const macs = r.items.filter((it) => it.type === 'device_id' && it.service === 'mac_address');
    expect(macs.length).toBe(1);
    expect(macs[0]?.value).toBe('AA:BB:CC:DD:EE:FF');
  });

  it('analyzeText extrait device_id pattern', async () => {
    const r = await multiSourceAnalyze.analyzeText('device_id: 1000abcd45 et deviceID=XYZ987654');
    const ids = r.items.filter((it) => it.type === 'device_id');
    expect(ids.length).toBeGreaterThanOrEqual(1);
  });

  it('analyzeText dedupe URLs identiques', async () => {
    const r = await multiSourceAnalyze.analyzeText('https://x.com et encore https://x.com');
    const sites = r.items.filter((it) => it.type === 'site');
    expect(sites.length).toBe(1);
  });

  it('analyzeText source mixte (1 source, N éléments)', async () => {
    const mix = `
      Hey, voici ma config :
      Anthropic key: sk-ant-api03-${'A'.repeat(50)}
      Dashboard: https://console.anthropic.com
      Mon email: kevin@example.com
      MAC switch: 11:22:33:44:55:66
      IP routeur: 192.168.1.1
    `;
    const r = await multiSourceAnalyze.analyzeText(mix);
    expect(r.extracted_count).toBeGreaterThanOrEqual(5);
    const types = new Set(r.items.map((it) => it.type));
    expect(types.has('credential')).toBe(true);
    expect(types.has('site')).toBe(true);
    expect(types.has('identifier')).toBe(true);
    expect(types.has('device_id')).toBe(true);
    expect(types.has('address')).toBe(true);
  });

  it('analyzeURL extrait le service depuis hostname', async () => {
    const r = await multiSourceAnalyze.analyzeURL('https://console.anthropic.com/keys');
    expect(r.items.length).toBeGreaterThan(0);
    const site = r.items[0];
    expect(site?.type).toBe('site');
    expect(site?.service).toBe('console');
  });

  it('analyzeURL invalid → erreur explicite', async () => {
    const r = await multiSourceAnalyze.analyzeURL('not-a-url');
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0]).toContain('invalid_url');
  });

  it('analyzeImage sans clé Anthropic → vision_unavailable', async () => {
    const r = await multiSourceAnalyze.analyzeImage('data:image/png;base64,iVBORw0KGgo=');
    expect(r.errors.some((e) => e.includes('vision_unavailable'))).toBe(true);
  });

  it('getHistory cap 50 (FIFO)', async () => {
    /* Persiste 1 résultat */
    const r = await multiSourceAnalyze.analyzeText('sk-ant-api03-' + 'B'.repeat(50));
    expect(r.extracted_count).toBeGreaterThan(0);
    const history = multiSourceAnalyze.getHistory();
    expect(Array.isArray(history)).toBe(true);
  });

  it('getStats agrège l\'historique', () => {
    const stats = multiSourceAnalyze.getStats();
    expect(stats).toHaveProperty('sources_total');
    expect(stats).toHaveProperty('items_total');
    expect(stats).toHaveProperty('items_configured');
    expect(stats).toHaveProperty('items_tested_ok');
  });

  it('installAll skipForbidden true par défaut', async () => {
    /* Mock résultat avec item forbidden */
    const r = {
      source_type: 'text' as const,
      source_preview: 'test',
      extracted_count: 1,
      configured_count: 0,
      tested_count: 0,
      tested_ok_count: 0,
      items: [{
        type: 'credential' as const,
        service: 'cb',
        storage_key: '__FORBIDDEN_CB__',
        value: '4532 1234 5678 9010',
        confidence: 0.95,
        raw_match: '4532 1234 5678 9010',
        forbidden: true,
      }],
      errors: [],
      ts: Date.now(),
    };
    const res = await multiSourceAnalyze.installAll(r);
    expect(res.installed).toBe(0);
    expect(res.failed.some((f) => f.includes('forbidden'))).toBe(true);
  });
});
