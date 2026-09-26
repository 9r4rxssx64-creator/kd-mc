/**
 * APEX v13 — Tests deep apex-orchestration-skills.ts (push 61% → 90%+).
 *
 * Cible les branches admin manquantes :
 *  - RemoteControl: createSession admin, renameSession, listSessions auto-expire,
 *    revokeSession, persist localStorage corrupt fallback
 *  - HiveMind: spawnSwarm cap 20, executeTask happy + errors + invalid swarm,
 *    countActiveAgents avec swarmId filter, dissolveSwarm
 *  - WebScrapper: startScrape admin + whitelist, depth cap 3, runJobInternal
 *    fetch ok/fail/quota, isAllowedDomain, getAllowedDomains
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const authIsAdminSyncMock = vi.fn();
vi.mock('../../services/auth/auth.js', () => ({
  auth: { isAdminSync: () => authIsAdminSyncMock() },
}));

const crewRunMock = vi.fn();
const crewDefaultMembersMock = vi.fn();
vi.mock('../../services/ai/crew-experts.js', () => ({
  crewExperts: {
    run: (...args: unknown[]) => crewRunMock(...args),
    defaultMembers: (mode: string) => crewDefaultMembersMock(mode),
  },
}));

import {
  hiveMind,
  remoteControl,
  webScrapper,
} from '../../services/core-svc/apex-orchestration-skills.js';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 4, 16, 11, 0, 0));
  localStorage.clear();
  /* Reset internal state of singletons */
  (remoteControl as unknown as { sessions: unknown[] }).sessions = [];
  (hiveMind as unknown as { swarms: unknown[]; agents: unknown[] }).swarms = [];
  (hiveMind as unknown as { swarms: unknown[]; agents: unknown[] }).agents = [];
  (webScrapper as unknown as { jobs: unknown[] }).jobs = [];
});

afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe('RemoteControl — createSession', () => {
  it('non-admin → admin_only_rc', () => {
    authIsAdminSyncMock.mockReturnValue(false);
    const r = remoteControl.createSession();
    expect(r.ok).toBe(false);
    expect(r.error).toBe('admin_only_rc');
  });

  it('admin → session avec url + qr_data + flags', () => {
    authIsAdminSyncMock.mockReturnValue(true);
    const r = remoteControl.createSession({ name: 'test', flags: ['verbose'] });
    expect(r.ok).toBe(true);
    expect(r.session?.name).toBe('test');
    expect(r.session?.url).toContain('rc=');
    expect(r.session?.qr_data).toContain('data:image/svg+xml');
    expect(r.session?.flags).toContain('verbose');
    expect(r.session?.status).toBe('pending');
  });

  it('admin sans options → name défaut + ttl 30min', () => {
    authIsAdminSyncMock.mockReturnValue(true);
    const r = remoteControl.createSession();
    expect(r.session?.name).toMatch(/apex-rc-/);
    const expectedTTL = 30 * 60 * 1000;
    const diff = (r.session?.expires_at ?? 0) - (r.session?.created_at ?? 0);
    expect(diff).toBe(expectedTTL);
  });

  it('admin avec ttlMs custom', () => {
    authIsAdminSyncMock.mockReturnValue(true);
    const r = remoteControl.createSession({ ttlMs: 60_000 });
    const diff = (r.session?.expires_at ?? 0) - (r.session?.created_at ?? 0);
    expect(diff).toBe(60_000);
  });

  it('session persiste dans localStorage', () => {
    authIsAdminSyncMock.mockReturnValue(true);
    remoteControl.createSession();
    expect(localStorage.getItem('apex_v13_rc_sessions')).not.toBeNull();
  });
});

describe('RemoteControl — renameSession', () => {
  it('non-admin → admin_only_rc', () => {
    authIsAdminSyncMock.mockReturnValue(false);
    const r = remoteControl.renameSession('any', 'new');
    expect(r.ok).toBe(false);
  });

  it('id inexistant → session_not_found', () => {
    authIsAdminSyncMock.mockReturnValue(true);
    const r = remoteControl.renameSession('inexistant', 'new');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('session_not_found');
  });

  it('admin + valid id → rename + persist', () => {
    authIsAdminSyncMock.mockReturnValue(true);
    const c = remoteControl.createSession({ name: 'old' });
    const r = remoteControl.renameSession(c.session!.id, 'NEW');
    expect(r.ok).toBe(true);
    const all = remoteControl.listSessions();
    expect(all.find((s) => s.id === c.session!.id)?.name).toBe('NEW');
  });
});

describe('RemoteControl — listSessions auto-cleanup', () => {
  it('session pending expirée → marquée expired', () => {
    authIsAdminSyncMock.mockReturnValue(true);
    const c = remoteControl.createSession({ ttlMs: 1000 });
    /* Avance le temps de 2s */
    vi.advanceTimersByTime(2000);
    const list = remoteControl.listSessions();
    expect(list.find((s) => s.id === c.session!.id)?.status).toBe('expired');
  });

  it('listSessions vide → restore depuis localStorage si dispo', () => {
    authIsAdminSyncMock.mockReturnValue(true);
    const c = remoteControl.createSession();
    /* Vide les sessions in-memory */
    (remoteControl as unknown as { sessions: unknown[] }).sessions = [];
    const list = remoteControl.listSessions();
    expect(list.some((s) => s.id === c.session!.id)).toBe(true);
  });
});

describe('RemoteControl — revokeSession', () => {
  it('non-admin → admin_only_rc', () => {
    authIsAdminSyncMock.mockReturnValue(false);
    expect(remoteControl.revokeSession('x').ok).toBe(false);
  });

  it('inexistant → session_not_found', () => {
    authIsAdminSyncMock.mockReturnValue(true);
    expect(remoteControl.revokeSession('unknown').error).toBe('session_not_found');
  });

  it('admin + valid → status revoked', () => {
    authIsAdminSyncMock.mockReturnValue(true);
    const c = remoteControl.createSession();
    expect(remoteControl.revokeSession(c.session!.id).ok).toBe(true);
    const list = remoteControl.listSessions();
    expect(list.find((s) => s.id === c.session!.id)?.status).toBe('revoked');
  });
});

describe('HiveMind — spawnSwarm', () => {
  it('non-admin → admin_only_swarm', () => {
    authIsAdminSyncMock.mockReturnValue(false);
    expect(hiveMind.spawnSwarm().ok).toBe(false);
  });

  it('admin défauts → topology hierarchical, raft, 5 workers', () => {
    authIsAdminSyncMock.mockReturnValue(true);
    const r = hiveMind.spawnSwarm();
    expect(r.ok).toBe(true);
    expect(r.swarm?.topology).toBe('hierarchical');
    expect(r.swarm?.consensus).toBe('raft');
    expect(r.swarm?.queen_type).toBe('adaptive');
    /* 1 queen + ceil(5/5)=1 tactical + 5 workers = 7 */
    expect(r.swarm?.agents_count).toBe(7);
  });

  it('workers_count cap 20 max', () => {
    authIsAdminSyncMock.mockReturnValue(true);
    const r = hiveMind.spawnSwarm({ workers_count: 100 });
    /* 1 queen + 4 tactical + 20 workers = 25 */
    expect(r.swarm?.agents_count).toBe(25);
  });

  it('workers_count min 1', () => {
    authIsAdminSyncMock.mockReturnValue(true);
    const r = hiveMind.spawnSwarm({ workers_count: 0 });
    /* 1 queen + 1 tactical + 1 worker = 3 */
    expect(r.swarm?.agents_count).toBe(3);
  });

  it('topology custom + queen_type custom', () => {
    authIsAdminSyncMock.mockReturnValue(true);
    const r = hiveMind.spawnSwarm({ topology: 'mesh', queen_type: 'strategic', consensus: 'bft' });
    expect(r.swarm?.topology).toBe('mesh');
    expect(r.swarm?.queen_type).toBe('strategic');
    expect(r.swarm?.consensus).toBe('bft');
  });
});

describe('HiveMind — executeTask', () => {
  it('non-admin → admin_only_swarm_exec', async () => {
    authIsAdminSyncMock.mockReturnValue(false);
    const r = await hiveMind.executeTask({ swarmId: 'x', task: 'do' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('admin_only_swarm_exec');
  });

  it('swarm inconnu → swarm_not_found', async () => {
    authIsAdminSyncMock.mockReturnValue(true);
    const r = await hiveMind.executeTask({ swarmId: 'fake', task: 'do' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('swarm_not_found');
  });

  it('task vide → invalid_task', async () => {
    authIsAdminSyncMock.mockReturnValue(true);
    const s = hiveMind.spawnSwarm();
    const r = await hiveMind.executeTask({ swarmId: s.swarm!.id, task: '' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('invalid_task');
  });

  it('admin + swarm valid → crew.run appelé + result returned', async () => {
    authIsAdminSyncMock.mockReturnValue(true);
    const s = hiveMind.spawnSwarm();
    crewDefaultMembersMock.mockReturnValue([{ provider: 'anthropic' }]);
    crewRunMock.mockResolvedValue({ responses: ['result'] });
    const r = await hiveMind.executeTask({ swarmId: s.swarm!.id, task: 'analyse' });
    expect(r.ok).toBe(true);
    expect(crewRunMock).toHaveBeenCalled();
  });

  it('crew throw → error captured', async () => {
    authIsAdminSyncMock.mockReturnValue(true);
    const s = hiveMind.spawnSwarm();
    crewDefaultMembersMock.mockReturnValue([]);
    crewRunMock.mockRejectedValueOnce(new Error('Provider timeout'));
    const r = await hiveMind.executeTask({ swarmId: s.swarm!.id, task: 'x' });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Provider timeout');
  });
});

describe('HiveMind — countActiveAgents / dissolveSwarm', () => {
  it('countActiveAgents sans swarmId → tous actifs', () => {
    authIsAdminSyncMock.mockReturnValue(true);
    hiveMind.spawnSwarm({ workers_count: 5 });
    hiveMind.spawnSwarm({ workers_count: 3 });
    const n = hiveMind.countActiveAgents();
    expect(n).toBeGreaterThan(0);
  });

  it('countActiveAgents avec swarmId filter', () => {
    authIsAdminSyncMock.mockReturnValue(true);
    const s = hiveMind.spawnSwarm({ workers_count: 5 });
    hiveMind.spawnSwarm({ workers_count: 3 });
    const n = hiveMind.countActiveAgents(s.swarm!.id);
    /* 1 queen + 1 tactical + 5 workers = 7 */
    expect(n).toBe(7);
  });

  it('dissolveSwarm non-admin → refus', () => {
    authIsAdminSyncMock.mockReturnValue(false);
    const r = hiveMind.dissolveSwarm('x');
    expect(r.ok).toBe(false);
  });

  it('dissolveSwarm admin → désactive agents + retire swarm', () => {
    authIsAdminSyncMock.mockReturnValue(true);
    const s = hiveMind.spawnSwarm({ workers_count: 3 });
    const r = hiveMind.dissolveSwarm(s.swarm!.id);
    expect(r.ok).toBe(true);
    expect(r.agents_dissolved).toBeGreaterThan(0);
    expect(hiveMind.listSwarms().some((sw) => sw.id === s.swarm!.id)).toBe(false);
  });
});

describe('WebScrapper — startScrape', () => {
  it('non-admin → admin_only_scrape', () => {
    authIsAdminSyncMock.mockReturnValue(false);
    const r = webScrapper.startScrape({ url: 'https://github.com/x' });
    expect(r.ok).toBe(false);
  });

  it('url invalide → invalid_url', () => {
    authIsAdminSyncMock.mockReturnValue(true);
    const r = webScrapper.startScrape({ url: 'not a url' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('invalid_url');
  });

  it('url vide → invalid_url', () => {
    authIsAdminSyncMock.mockReturnValue(true);
    const r = webScrapper.startScrape({ url: '' });
    expect(r.ok).toBe(false);
  });

  it('domaine non whitelisted → domain_not_whitelisted', () => {
    authIsAdminSyncMock.mockReturnValue(true);
    const r = webScrapper.startScrape({ url: 'https://random-evil.com/page' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('domain_not_whitelisted');
  });

  it('domaine whitelisted (github.com) → job créé', () => {
    authIsAdminSyncMock.mockReturnValue(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('content here'),
    }));
    const r = webScrapper.startScrape({ url: 'https://github.com/repo' });
    expect(r.ok).toBe(true);
    expect(r.job?.url).toBe('https://github.com/repo');
    /* status évolue 'pending' → 'running' → 'completed' selon timing async ;
     * on accepte les 3 états valides */
    expect(['pending', 'running', 'completed']).toContain(r.job?.status);
    vi.unstubAllGlobals();
  });

  it('depth cap 3 max', () => {
    authIsAdminSyncMock.mockReturnValue(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('') }));
    const r = webScrapper.startScrape({ url: 'https://github.com/x', depth: 100 });
    expect(r.job?.depth).toBe(3);
    vi.unstubAllGlobals();
  });

  it('depth min 1', () => {
    authIsAdminSyncMock.mockReturnValue(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('') }));
    const r = webScrapper.startScrape({ url: 'https://github.com/x', depth: 0 });
    expect(r.job?.depth).toBe(1);
    vi.unstubAllGlobals();
  });
});

describe('WebScrapper — isAllowedDomain / getAllowedDomains', () => {
  it('github.com → autorisé', () => {
    expect(webScrapper.isAllowedDomain('https://github.com/foo')).toBe(true);
  });

  it('sub.github.com → autorisé (endsWith)', () => {
    expect(webScrapper.isAllowedDomain('https://raw.githubusercontent.com/x')).toBe(true);
  });

  it('evil.com → refusé', () => {
    expect(webScrapper.isAllowedDomain('https://evil.com')).toBe(false);
  });

  it('url malformée → refusé', () => {
    expect(webScrapper.isAllowedDomain('not a url')).toBe(false);
  });

  it('getAllowedDomains retourne ≥ 5 domaines', () => {
    const list = webScrapper.getAllowedDomains();
    expect(list.length).toBeGreaterThan(5);
    expect(list).toContain('github.com');
  });

  it('listJobs retourne copie defensive', () => {
    const a = webScrapper.listJobs();
    const b = webScrapper.listJobs();
    expect(a).not.toBe(b);
  });
});
