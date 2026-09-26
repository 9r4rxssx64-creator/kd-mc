/**
 * Tests unitaires study-service (v13.3.53).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { studyService } from '../../services/integrations/study-service.js';

describe('study-service', () => {
  beforeEach(() => {
    /* Clear knowledge cache */
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith('ax_services_knowledge_')) localStorage.removeItem(k);
    }
  });

  it('studyByName retourne seed Anthropic', async () => {
    const s = await studyService.studyByName('anthropic');
    expect(s.service_name).toBe('anthropic');
    expect(s.homepage).toContain('anthropic.com');
    expect(s.api_format).toBe('rest');
    expect(s.capabilities).toContain('chat');
    expect(s.pricing?.length).toBeGreaterThanOrEqual(2);
  });

  it('studyByName retourne seed OpenAI', async () => {
    const s = await studyService.studyByName('openai');
    expect(s.service_name).toBe('openai');
    expect(s.console_url).toContain('platform.openai.com');
    expect(s.capabilities).toContain('chat');
    expect(s.capabilities).toContain('vision');
  });

  it('studyByName retourne seed Stripe', async () => {
    const s = await studyService.studyByName('stripe');
    expect(s.service_name).toBe('stripe');
    expect(s.capabilities).toContain('payments');
  });

  it('studyByName retourne seed eWeLink IoT', async () => {
    const s = await studyService.studyByName('ewelink');
    expect(s.capabilities).toContain('iot_control');
  });

  it('studyByName service inconnu → fallback minimal', async () => {
    const s = await studyService.studyByName('xyz_unknown_42');
    expect(s.service_name).toBe('xyz_unknown_42');
    expect(s.homepage).toBeDefined();
    expect(s.capabilities).toEqual([]);
    expect(s.studied_at).toBeGreaterThan(0);
  });

  it('studyByCredential infère depuis pattern', async () => {
    const token = 'sk-ant-api03-' + 'A'.repeat(50);
    const s = await studyService.studyByCredential(token);
    expect(s.service_name.toLowerCase()).toContain('anthropic');
  });

  it('studyByCredential rejette tokens inconnus', async () => {
    await expect(studyService.studyByCredential('totalement-inconnu-xyz')).rejects.toThrow();
  });

  it('studyByURL extrait service du hostname', async () => {
    const s = await studyService.studyByURL('https://api.anthropic.com/v1/messages');
    expect(s.service_name).toBe('anthropic');
  });

  it('compareToAlternatives retourne competitors si seed', async () => {
    const c = await studyService.compareToAlternatives('anthropic');
    expect(c.length).toBeGreaterThanOrEqual(2);
    expect(c[0]?.service).toBeDefined();
    expect(c[0]?.pros.length).toBeGreaterThan(0);
  });

  it('compareToAlternatives service sans seed → array vide', async () => {
    const c = await studyService.compareToAlternatives('xyz_notseed');
    expect(c).toEqual([]);
  });

  it('getKnown lit cache après studyByName', async () => {
    await studyService.studyByName('groq');
    const cached = studyService.getKnown('groq');
    expect(cached).not.toBeNull();
    expect(cached?.service_name).toBe('groq');
  });

  it('listKnown agrège tous services étudiés', async () => {
    await studyService.studyByName('anthropic');
    await studyService.studyByName('openai');
    await studyService.studyByName('groq');
    const list = studyService.listKnown();
    expect(list.length).toBeGreaterThanOrEqual(3);
    const names = list.map((s) => s.service_name);
    expect(names).toContain('anthropic');
    expect(names).toContain('openai');
  });

  it('refreshAll re-fetch tous les services', async () => {
    await studyService.studyByName('hue');
    await studyService.studyByName('broadlink');
    const r = await studyService.refreshAll();
    expect(r.refreshed).toBeGreaterThanOrEqual(2);
  });
});
