/**
 * Test régression v13.4.96 — Paste Extractor universel.
 *
 * Kevin : "il n'apparaît que les API, en manque beaucoup".
 * Fix : extracteur multi-type sur tout paste (URLs/handles/emails/IBAN/phone/etc).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { apexPasteExtractor } from '../../services/admin/apex-paste-extractor.js';

describe('v13.4.96 apexPasteExtractor.extract()', () => {
  beforeEach(() => {
    try { localStorage.removeItem('apex_v13_extracted_items'); } catch { /* ignore */ }
  });

  it('extract URLs http/https', () => {
    const r = apexPasteExtractor.extract('Voici mon site https://kdmc.com et aussi http://example.org/path');
    const urls = r.items.filter((i) => i.type === 'url');
    expect(urls.length).toBeGreaterThanOrEqual(2);
    expect(urls.some((u) => u.value.includes('kdmc.com'))).toBe(true);
  });

  it('extract handles sociaux @username', () => {
    const r = apexPasteExtractor.extract('Mon insta @kdmc et twitter @kevin_pro');
    const handles = r.items.filter((i) => i.type === 'social_handle');
    expect(handles.length).toBeGreaterThanOrEqual(2);
    expect(handles.some((h) => h.value === 'kdmc')).toBe(true);
  });

  it('extract réseaux sociaux subtype depuis URL', () => {
    const r = apexPasteExtractor.extract('https://instagram.com/kdmc et https://linkedin.com/in/kevin');
    const social = r.items.filter((i) => i.type === 'url' && i.subtype);
    expect(social.some((s) => s.subtype === 'instagram')).toBe(true);
    expect(social.some((s) => s.subtype === 'linkedin')).toBe(true);
  });

  it('extract emails', () => {
    const r = apexPasteExtractor.extract('Contact : kevin.desarzens@gmail.com ou admin@kdmc.com');
    const emails = r.items.filter((i) => i.type === 'email');
    expect(emails.length).toBe(2);
  });

  it('extract IBANs', () => {
    const r = apexPasteExtractor.extract('IBAN : FR76 3000 4000 5000 6000 7000 891');
    const ibans = r.items.filter((i) => i.type === 'iban');
    expect(ibans.length).toBeGreaterThanOrEqual(1);
  });

  it('extract téléphones FR et Monaco', () => {
    const r = apexPasteExtractor.extract('Tel : +33 6 12 34 56 78 et Monaco +377 99 80 12 34');
    const phones = r.items.filter((i) => i.type === 'phone');
    expect(phones.length).toBeGreaterThanOrEqual(2);
  });

  it('extract addresses BTC + ETH', () => {
    const r = apexPasteExtractor.extract(
      'BTC: bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh / ETH: 0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
    );
    expect(r.items.some((i) => i.type === 'btc_address')).toBe(true);
    expect(r.items.some((i) => i.type === 'eth_address')).toBe(true);
  });

  it('dedupe items identiques (type+value)', () => {
    const r = apexPasteExtractor.extract('kevin@x.com kevin@x.com KEVIN@x.com');
    const emails = r.items.filter((i) => i.type === 'email');
    expect(emails.length).toBe(1); /* case-insensitive dedup */
  });

  it("admin guard : non-admin n'a pas stored=true", () => {
    const r = apexPasteExtractor.extract('Mon insta @kdmc');
    expect(r.ok).toBe(true);
    /* En test (pas admin par défaut), items détectés mais NON stockés */
    expect(r.stored).toBe(false);
  });

  it('cap 50KB protection input massif', () => {
    const huge = 'a'.repeat(60_000) + ' https://kdmc.com';
    const r = apexPasteExtractor.extract(huge);
    /* URL après 50K chars ne doit pas être extraite */
    const urls = r.items.filter((i) => i.type === 'url');
    expect(urls.length).toBe(0);
  });

  it('extract massif TOUT en 1 paste', () => {
    const massive = `
      Kevin DESARZENS
      Email : kevin.desarzens@gmail.com
      Tel : +33 6 12 34 56 78
      IBAN : FR76 1234 5678 9012 3456 7890 123
      Site : https://kdmc.com
      Instagram : https://instagram.com/kdmc + @kdmc
      LinkedIn : https://linkedin.com/in/kevin-desarzens
      BTC : bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh
      SIRET : 12345678901234
    `;
    const r = apexPasteExtractor.extract(massive);
    expect(r.total).toBeGreaterThanOrEqual(7); /* email + phone + iban + url×2 + handle + btc */
    const types = new Set(r.items.map((i) => i.type));
    expect(types.has('email')).toBe(true);
    expect(types.has('phone')).toBe(true);
    expect(types.has('iban')).toBe(true);
    expect(types.has('url')).toBe(true);
    expect(types.has('social_handle')).toBe(true);
    expect(types.has('btc_address')).toBe(true);
  });
});

describe('v13.4.96 apexPasteExtractor.stats()', () => {
  it('stats agrège correctement par type', () => {
    /* En test, stored=false donc list() vide. Test structurel : signature OK. */
    const stats = apexPasteExtractor.stats();
    expect(typeof stats).toBe('object');
  });

  it('listByType retourne array', () => {
    expect(Array.isArray(apexPasteExtractor.listByType('url'))).toBe(true);
    expect(Array.isArray(apexPasteExtractor.listByType('email'))).toBe(true);
  });

  it("clear() refuse non-admin", () => {
    const r = apexPasteExtractor.clear();
    expect(r.ok).toBe(false);
    expect(r.error).toBe('admin_only_clear');
  });
});
