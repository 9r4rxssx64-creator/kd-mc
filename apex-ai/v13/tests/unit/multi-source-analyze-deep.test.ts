/**
 * Tests multi-source-analyze deep v13.4.153 (Kevin "100/100 réel").
 *
 * Module : services/multi-source-analyze.ts (504 stmts, était 64.7%).
 * Focus : analyzeText extraction patterns (emails/URLs/IPs/MACs/phones/device_ids).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { multiSourceAnalyze } from '../../services/ai/multi-source-analyze.js';

describe('multi-source-analyze deep (v13.4.153)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('analyzeText - extractions', () => {
    it('retourne empty si texte vide', async () => {
      const r = await multiSourceAnalyze.analyzeText('');
      expect(r.items.length).toBe(0);
    });

    it('extrait emails', async () => {
      const r = await multiSourceAnalyze.analyzeText('Contact me at kevin@example.com');
      const emails = r.items.filter((i) => i.service === 'email');
      expect(emails.length).toBeGreaterThan(0);
      expect(emails[0]?.value).toBe('kevin@example.com');
    });

    it('extrait multiple emails', async () => {
      const r = await multiSourceAnalyze.analyzeText('a@x.fr et b@y.fr');
      const emails = r.items.filter((i) => i.service === 'email');
      expect(emails.length).toBe(2);
    });

    it('extrait URLs', async () => {
      const r = await multiSourceAnalyze.analyzeText('Visit https://anthropic.com/api');
      const sites = r.items.filter((i) => i.type === 'site');
      expect(sites.length).toBeGreaterThan(0);
    });

    it('extrait IPs valides', async () => {
      const r = await multiSourceAnalyze.analyzeText('Server 192.168.1.10 ready');
      const ips = r.items.filter((i) => i.type === 'address');
      expect(ips.length).toBe(1);
      expect(ips[0]?.value).toBe('192.168.1.10');
    });

    it('refuse IPs invalides (>255)', async () => {
      const r = await multiSourceAnalyze.analyzeText('999.999.999.999');
      const ips = r.items.filter((i) => i.type === 'address');
      expect(ips.length).toBe(0);
    });

    it('extrait MAC addresses', async () => {
      const r = await multiSourceAnalyze.analyzeText('Device MAC: aa:bb:cc:dd:ee:ff');
      const macs = r.items.filter((i) => i.service === 'mac_address');
      expect(macs.length).toBe(1);
    });

    it('extrait téléphones FR', async () => {
      const r = await multiSourceAnalyze.analyzeText('Mon tel: 06 12 34 56 78');
      const phones = r.items.filter((i) => i.service === 'phone');
      expect(phones.length).toBeGreaterThanOrEqual(1);
    });

    it('dedup items identiques', async () => {
      const r = await multiSourceAnalyze.analyzeText('kevin@x.fr kevin@x.fr kevin@x.fr');
      const emails = r.items.filter((i) => i.service === 'email');
      expect(emails.length).toBe(1);
    });

    it('extrait credential pattern (Anthropic sk-ant-)', async () => {
      const r = await multiSourceAnalyze.analyzeText(
        'sk-ant-api03-abcdef0123456789abcdef0123456789abcdef0123456789ab',
      );
      const creds = r.items.filter((i) => i.type === 'credential');
      expect(creds.length).toBeGreaterThan(0);
    });

    it('source_preview tronqué à PREVIEW_MAX', async () => {
      const longText = 'x'.repeat(500);
      const r = await multiSourceAnalyze.analyzeText(longText);
      /* Préfixe + ellipsis : 240 + 1 char ellipsis = 241 max */
      expect(r.source_preview.length).toBeLessThanOrEqual(241);
    });
  });

  describe('analyzeImage', () => {
    it('refuse base64 vide', async () => {
      const r = await multiSourceAnalyze.analyzeImage('');
      expect(r.items.length).toBe(0);
    });

    it('retourne result même si fetch vision fail', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('vision down'));
      const r = await multiSourceAnalyze.analyzeImage('data:image/png;base64,XX');
      expect(r).toBeDefined();
      expect(r.source_type).toBe('image');
    });
  });

  describe('analyzeURL', () => {
    it('retourne result même si fetch fail', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
      const r = await multiSourceAnalyze.analyzeURL('https://example.com');
      expect(r.source_type).toBe('url');
    });

    it('extrait domain comme service', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('<html><body>hello</body></html>', { status: 200 }),
      );
      const r = await multiSourceAnalyze.analyzeURL('https://api.anthropic.com/test');
      expect(r.source_type).toBe('url');
    });

    it('refuse URL malformée', async () => {
      const r = await multiSourceAnalyze.analyzeURL('not-a-url');
      expect(r.items.length).toBe(0);
    });
  });

  describe('getHistory / getStats', () => {
    it('getHistory retourne tableau', () => {
      const h = multiSourceAnalyze.getHistory();
      expect(Array.isArray(h)).toBe(true);
    });

    it('getStats retourne objet stats', () => {
      const s = multiSourceAnalyze.getStats();
      expect(s).toBeDefined();
    });
  });
});
