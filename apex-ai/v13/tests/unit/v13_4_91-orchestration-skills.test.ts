/**
 * Test régression v13.4.91 — Remote Control + Hive Mind + Web Scrapper.
 */
import { describe, it, expect } from 'vitest';
import {
  remoteControl,
  hiveMind,
  webScrapper,
} from '../../services/core-svc/apex-orchestration-skills.js';

describe('v13.4.91 RemoteControl (OpenClaw /rc command)', () => {
  it("singleton défini avec 4 méthodes", () => {
    expect(remoteControl).toBeDefined();
    expect(typeof remoteControl.createSession).toBe('function');
    expect(typeof remoteControl.renameSession).toBe('function');
    expect(typeof remoteControl.listSessions).toBe('function');
    expect(typeof remoteControl.revokeSession).toBe('function');
  });

  it("createSession() refusé non-admin", () => {
    const r = remoteControl.createSession();
    expect(r.ok).toBe(false);
    expect(r.error).toBe('admin_only_rc');
  });

  it("renameSession(id_inexistant) refusé non-admin", () => {
    const r = remoteControl.renameSession('zzz', 'name');
    expect(r.ok).toBe(false);
  });

  it("listSessions() retourne array (lecture pour tous)", () => {
    expect(Array.isArray(remoteControl.listSessions())).toBe(true);
  });

  it("revokeSession(id_inexistant) refusé non-admin", () => {
    const r = remoteControl.revokeSession('zzz');
    expect(r.ok).toBe(false);
  });
});

describe('v13.4.91 HiveMind (claude-flow Duncan)', () => {
  it("singleton défini avec 4 méthodes", () => {
    expect(hiveMind).toBeDefined();
    expect(typeof hiveMind.spawnSwarm).toBe('function');
    expect(typeof hiveMind.listSwarms).toBe('function');
    expect(typeof hiveMind.countActiveAgents).toBe('function');
    expect(typeof hiveMind.dissolveSwarm).toBe('function');
  });

  it("spawnSwarm() refusé non-admin", () => {
    const r = hiveMind.spawnSwarm();
    expect(r.ok).toBe(false);
    expect(r.error).toBe('admin_only_swarm');
  });

  it("listSwarms() retourne array (lecture pour tous)", () => {
    expect(Array.isArray(hiveMind.listSwarms())).toBe(true);
  });

  it("countActiveAgents() retourne number", () => {
    expect(typeof hiveMind.countActiveAgents()).toBe('number');
  });

  it("countActiveAgents('xyz_inexistant') = 0", () => {
    expect(hiveMind.countActiveAgents('inexistant_swarm_zzz')).toBe(0);
  });

  it("dissolveSwarm() refusé non-admin", () => {
    const r = hiveMind.dissolveSwarm('zzz');
    expect(r.ok).toBe(false);
    expect(r.agents_dissolved).toBe(0);
  });
});

describe('v13.4.91 WebScrapper (Doctor AI httrack-like)', () => {
  it("singleton défini avec 4 méthodes", () => {
    expect(webScrapper).toBeDefined();
    expect(typeof webScrapper.startScrape).toBe('function');
    expect(typeof webScrapper.listJobs).toBe('function');
    expect(typeof webScrapper.isAllowedDomain).toBe('function');
    expect(typeof webScrapper.getAllowedDomains).toBe('function');
  });

  it("startScrape() refusé non-admin", () => {
    const r = webScrapper.startScrape({ url: 'https://github.com/test' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('admin_only_scrape');
  });

  it("startScrape(url invalide) refusé non-admin (guard préalable)", () => {
    const r = webScrapper.startScrape({ url: 'not-a-url' });
    expect(r.ok).toBe(false);
    /* Soit admin_only soit invalid_url soit domain_not_whitelisted */
  });

  it("listJobs() retourne array (lecture pour tous)", () => {
    expect(Array.isArray(webScrapper.listJobs())).toBe(true);
  });

  it("isAllowedDomain(github.com) = true", () => {
    expect(webScrapper.isAllowedDomain('https://github.com/foo/bar')).toBe(true);
    expect(webScrapper.isAllowedDomain('https://raw.githubusercontent.com/foo')).toBe(true);
    expect(webScrapper.isAllowedDomain('https://docs.anthropic.com/api')).toBe(true);
  });

  it("isAllowedDomain(domaine random) = false", () => {
    expect(webScrapper.isAllowedDomain('https://random-evil-site.com')).toBe(false);
    expect(webScrapper.isAllowedDomain('https://attacker.example.com')).toBe(false);
  });

  it("isAllowedDomain(URL invalide) = false (no crash)", () => {
    expect(webScrapper.isAllowedDomain('not-a-url')).toBe(false);
    expect(webScrapper.isAllowedDomain('')).toBe(false);
  });

  it("getAllowedDomains() retourne liste ≥ 5 domaines whitelisted", () => {
    const domains = webScrapper.getAllowedDomains();
    expect(Array.isArray(domains)).toBe(true);
    expect(domains.length).toBeGreaterThanOrEqual(5);
    expect(domains).toContain('github.com');
  });
});
