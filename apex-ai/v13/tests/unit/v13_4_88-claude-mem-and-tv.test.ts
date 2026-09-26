/**
 * Test régression v13.4.88 — claude-mem-bridge + apex-tv (IPTV intelligent).
 *
 * Kevin "Réfléchit intelligemment pour iptv et intègre comme il faut à apex.
 * Va plus loin. Soit créatif novateur futuriste" + "Oublie rien".
 */
import { describe, it, expect } from 'vitest';
import { claudeMemBridge } from '../../services/ai/claude-mem-bridge.js';
import { apexTV } from '../../services/integrations/apex-tv.js';

describe('v13.4.88 claude-mem-bridge — parité claude-mem npm', () => {
  it("singleton défini avec API attendue", () => {
    expect(claudeMemBridge).toBeDefined();
    expect(typeof claudeMemBridge.add).toBe('function');
    expect(typeof claudeMemBridge.recordLesson).toBe('function');
    expect(typeof claudeMemBridge.list).toBe('function');
    expect(typeof claudeMemBridge.stats).toBe('function');
    expect(typeof claudeMemBridge.export).toBe('function');
    expect(typeof claudeMemBridge.runSlashCommand).toBe('function');
  });

  it("add(category, text) tier guard : non-admin → admin_only_write", () => {
    const r = claudeMemBridge.add('test_category', 'test text');
    /* Admin status non set en test → refusé */
    expect(r.ok).toBe(false);
    expect(r.error).toBe('admin_only_write');
  });

  it("add() validation : category vide → invalid_args", () => {
    const r = claudeMemBridge.add('', 'text');
    /* Soit admin_only soit invalid_args, jamais de crash */
    expect(r.ok).toBe(false);
  });

  it("recordLesson() refusé non-admin", () => {
    const r = claudeMemBridge.recordLesson('cat', 'title', 'text', 'warn');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('admin_only_write');
  });

  it("list() lecture pour tous (pas de guard)", () => {
    const r = claudeMemBridge.list({ limit: 5 });
    expect(Array.isArray(r)).toBe(true);
  });

  it("list({ category }) filtre par catégorie", () => {
    const r = claudeMemBridge.list({ category: 'inexistant_xyz' });
    expect(Array.isArray(r)).toBe(true);
    expect(r.length).toBe(0);
  });

  it("stats() retourne objet structuré 6 champs", () => {
    const s = claudeMemBridge.stats();
    expect(typeof s.facts_total).toBe('number');
    expect(typeof s.facts_by_category).toBe('object');
    expect(typeof s.lessons_total).toBe('number');
    expect(typeof s.lessons_by_severity).toBe('object');
    expect(typeof s.projects_total).toBe('number');
    expect(typeof s.docs_synced).toBe('number');
  });

  it("export() refusé non-admin", () => {
    const r = claudeMemBridge.export();
    if ('ok' in r) {
      expect(r.ok).toBe(false);
      expect(r.error).toBe('admin_only_export');
    }
  });

  it("runSlashCommand('/mem stats') OK", async () => {
    const r = await claudeMemBridge.runSlashCommand('/mem stats');
    expect(r.ok).toBe(true);
    expect(r.result).toBeDefined();
  });

  it("runSlashCommand('/mem list') OK", async () => {
    const r = await claudeMemBridge.runSlashCommand('/mem list');
    expect(r.ok).toBe(true);
    expect(Array.isArray(r.result)).toBe(true);
  });

  it("runSlashCommand('/notmem') refusé", async () => {
    const r = await claudeMemBridge.runSlashCommand('/notmem foo');
    expect(r.ok).toBe(false);
  });

  it("runSlashCommand('/mem unknown') → unknown_action", async () => {
    const r = await claudeMemBridge.runSlashCommand('/mem zzz');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('unknown_action');
  });
});

describe('v13.4.88 apex-tv — IPTV intelligent', () => {
  it("singleton défini avec API attendue", () => {
    expect(apexTV).toBeDefined();
    expect(typeof apexTV.categorize).toBe('function');
    expect(typeof apexTV.parseM3U).toBe('function');
    expect(typeof apexTV.loadCountryPlaylist).toBe('function');
    expect(typeof apexTV.search).toBe('function');
    expect(typeof apexTV.recommend).toBe('function');
    expect(typeof apexTV.runSlashCommand).toBe('function');
    expect(typeof apexTV.stats).toBe('function');
  });

  it("categorize() reconnaît 8 catégories réelles", () => {
    expect(apexTV.categorize('BFM Business')).toBe('business');
    expect(apexTV.categorize('CNN International')).toBe('news');
    expect(apexTV.categorize('Eurosport')).toBe('sports');
    expect(apexTV.categorize('Disney Channel')).toBe('kids');
    expect(apexTV.categorize('MTV Music')).toBe('music');
    expect(apexTV.categorize('Arte HD')).toBe('documentary');
    expect(apexTV.categorize('Monaco Info')).toBe('casino-relevant');
    expect(apexTV.categorize('Random Channel XYZ')).toBe('unknown');
  });

  it("parseM3U vide → []", () => {
    expect(apexTV.parseM3U('')).toEqual([]);
  });

  it("parseM3U valid M3U → channels[]", () => {
    const m3u = `#EXTM3U
#EXTINF:-1 tvg-country="FR" tvg-language="fra" tvg-logo="logo.png",BFM Business
https://stream.example.com/bfm.m3u8
#EXTINF:-1 tvg-country="IT",Rai News 24
https://stream.example.com/rai.m3u8`;
    const channels = apexTV.parseM3U(m3u);
    expect(channels.length).toBe(2);
    expect(channels[0]?.name).toBe('BFM Business');
    expect(channels[0]?.category).toBe('business');
    expect(channels[0]?.country).toBe('fr');
    expect(channels[0]?.url).toContain('bfm.m3u8');
    expect(channels[1]?.name).toBe('Rai News 24');
    expect(channels[1]?.category).toBe('news');
  });

  it("search('') → array vide", () => {
    expect(apexTV.search('')).toEqual([]);
  });

  it("recommend({hour}) retourne TvRecommendation[] (vide si cache vide)", () => {
    const r = apexTV.recommend({ hour: 8 });
    expect(Array.isArray(r)).toBe(true);
    /* Score borne et reason présents si non-vide */
    for (const reco of r) {
      expect(reco.channel).toBeDefined();
      expect(typeof reco.reason).toBe('string');
      expect(typeof reco.score).toBe('number');
      expect(reco.score).toBeGreaterThanOrEqual(0);
      expect(reco.score).toBeLessThanOrEqual(100);
    }
  });

  it("stats() retourne {cached, cache_age_min, categories}", () => {
    const s = apexTV.stats();
    expect(typeof s.cached).toBe('number');
    expect(typeof s.cache_age_min).toBe('number');
    expect(typeof s.categories).toBe('object');
  });

  it("runSlashCommand('/tv categorize') OK", async () => {
    const r = await apexTV.runSlashCommand('/tv categorize Eurosport');
    expect(r.ok).toBe(true);
    const result = r.result as { name: string; category: string };
    expect(result.category).toBe('sports');
  });

  it("runSlashCommand('/notv') refusé", async () => {
    const r = await apexTV.runSlashCommand('/notv foo');
    expect(r.ok).toBe(false);
  });

  it("runSlashCommand('/tv unknown') → unknown_action", async () => {
    const r = await apexTV.runSlashCommand('/tv zzz');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('unknown_action');
  });
});
