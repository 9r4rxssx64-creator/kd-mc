/**
 * Pont tâche 22 (22.10.2026) — « à chaque chargement, Apex réenregistre le jeton GitHub » :
 * le coffre qui se recharge tout seul ouvrait un QR du jeton EN CLAIR + un push Gist (qui échouait sans dire pourquoi),
 * et « telemetry pushIncoming persist failed » = mémoire du navigateur pleine.
 * Ces tests rougissent sur l'ancien code (QR ouvert en restauration, 2ᵉ gist créé après un 401, file de 200 entrées).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { qr, gist, trousseau } = vi.hoisted(() => ({
  qr: vi.fn(async () => undefined),
  gist: vi.fn(async () => ({ ok: true })),
  trousseau: { isSupported: vi.fn(() => true), saveGithubPat: vi.fn(async () => ({ ok: true })) },
}));
vi.mock('../../services/vault/apex-qr-backup.js', () => ({ apexQrBackup: { showQrBackupModal: qr } }));
vi.mock('../../services/vault/apex-icloud-keychain.js', () => ({ apexIcloudKeychain: trousseau }));

import { vault } from '../../services/vault/vault.js';

const PAT = 'ghp_' + 'A'.repeat(36);
const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('coffre : un jeton GitHub restauré n’ouvre plus le QR ni le Gist', () => {
  beforeEach(async () => {
    localStorage.clear();
    vault.setPassphrase('test-passphrase-strong');
    qr.mockClear(); gist.mockClear(); trousseau.saveGithubPat.mockClear();
    const mod = await import('../../services/vault/apex-github-gist-backup.js');
    vi.spyOn(mod.apexGithubGistBackup, 'pushBackup').mockImplementation(gist as never);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('restauration au chargement : ni QR, ni Gist, ni trousseau', async () => {
    const r = await vault.setKey('ax_github_pat_classic', PAT, { origine: 'restauration' });
    expect(r.ok).toBe(true);
    await attendre(1700);
    expect(qr).not.toHaveBeenCalled();
    expect(gist).not.toHaveBeenCalled();
    expect(trousseau.saveGithubPat).not.toHaveBeenCalled();
  });

  it('écriture sans origine (code inconnu) : jamais le QR du jeton en clair', async () => {
    await vault.setKey('ax_github_pat_classic', PAT);
    await attendre(1700);
    expect(qr).not.toHaveBeenCalled();
  });

  it('saisie de Kevin : le QR s’ouvre et le Gist part', async () => {
    await vault.setKey('ax_github_pat_classic', PAT, { origine: 'saisie' });
    await attendre(1700);
    expect(qr).toHaveBeenCalledTimes(1);
    expect(gist).toHaveBeenCalled();
  });

  it('collage dans le chat (autoStore) = saisie : un seul QR', async () => {
    const r = await vault.autoStore(PAT);
    expect(r.ok).toBe(true);
    await attendre(1700);
    expect(qr).toHaveBeenCalledTimes(1);
  });

  it('les chemins de récupération passent { origine: "restauration" }', async () => {
    const fs = await import('node:fs');
    const lire = (f: string) => fs.readFileSync(`${process.cwd()}/services/vault/${f}`, 'utf8');
    for (const f of ['auto-restore-credentials.ts', 'apex-icloud-keychain.ts', 'apex-github-gist-backup.ts', 'vault-deep-recovery.ts', 'apex-vault-import.ts']) {
      const code = lire(f).split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
      const appels = code.match(/vault\.setKey\([^)]*\)/g) || [];
      expect(appels.length, f).toBeGreaterThan(0);
      for (const a of appels) expect(a, f).toContain("origine: 'restauration'");
    }
  });
});

describe('Gist : la vraie cause, et pas de 2ᵉ gist après un refus', () => {
  it('liste refusée (401) → cause lisible, aucune création, jeton jamais dans l’erreur', async () => {
    vi.resetModules();
    vi.doMock('../../services/auth/auth.js', () => ({ auth: { isAdminSync: () => true } }));
    vi.doMock('../../services/vault/vault.js', () => ({ vault: {
      readKey: async () => PAT, encryptAuto: async () => 'AXENC1:x', decryptAuto: async () => null, setKey: async () => ({ ok: true }),
    } }));
    const { apexGithubGistBackup, causeGithub } = await import('../../services/vault/apex-github-gist-backup.js');
    localStorage.setItem('ax_anthropic_key', 'AXENC1:blob');
    const appels: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      appels.push(`${init?.method ?? 'GET'} ${url}`);
      return new Response('{"message":"Bad credentials"}', { status: 401 });
    }));
    const r = await apexGithubGistBackup.pushBackup({ force: true });
    vi.unstubAllGlobals();
    vi.doUnmock('../../services/auth/auth.js'); vi.doUnmock('../../services/vault/vault.js');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('jeton GitHub refusé');
    expect(r.error).not.toContain(PAT);
    expect(appels.some((a) => a.startsWith('POST'))).toBe(false);
    expect(causeGithub(403)).toContain('gist');
    expect(causeGithub(404)).toContain('gist');
    expect(causeGithub(503)).toBe('GitHub indisponible');
    expect(causeGithub(0)).toBe('réseau injoignable');
    expect(causeGithub(418)).toContain('418');
  });
});

describe('Gist : un ancien jeton sans le droit « gist » ne bloque plus le nouveau (pont 249)', () => {
  it('le 1er jeton est refusé (404 à la création) → le 2ᵉ est essayé et réussit', async () => {
    vi.resetModules();
    const NEUF = 'ghp_' + 'B'.repeat(36);
    const VIEUX = 'github_pat_' + 'C'.repeat(82);
    vi.doMock('../../services/auth/auth.js', () => ({ auth: { isAdminSync: () => true } }));
    vi.doMock('../../services/vault/vault.js', () => ({ vault: {
      /* le neuf ne se déchiffre pas sous son nom ; il est retrouvé par le balayage du coffre */
      readKey: async (k: string) => (k === 'ax_github_token' ? VIEUX : k === 'ax_gh_colle' ? NEUF : k === 'ax_anthropic_key' ? 'sk-ant-x' : ''),
      encryptAuto: async () => 'AXENC1:x', decryptAuto: async () => null, setKey: async () => ({ ok: true }),
    } }));
    const { apexGithubGistBackup } = await import('../../services/vault/apex-github-gist-backup.js');
    localStorage.clear();
    localStorage.setItem('ax_anthropic_key', 'AXENC1:blob');
    localStorage.setItem('ax_gh_colle', 'AXENC1:blob2');
    const vus: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const auth = String((init?.headers as Record<string, string>)?.Authorization ?? '');
      vus.push(`${init?.method ?? 'GET'} ${auth.includes(NEUF) ? 'neuf' : 'vieux'}`);
      if ((init?.method ?? 'GET') === 'GET') return new Response('[]', { status: 200 });
      if (auth.includes(VIEUX)) return new Response('{}', { status: 404 });
      return new Response('{"id":"g123456789"}', { status: 201 });
    }));
    const r = await apexGithubGistBackup.pushBackup({ force: true });
    vi.unstubAllGlobals();
    vi.doUnmock('../../services/auth/auth.js'); vi.doUnmock('../../services/vault/vault.js');
    expect(r.ok).toBe(true);
    expect(vus).toEqual(['GET vieux', 'POST vieux', 'GET neuf', 'POST neuf']);
  });
});

describe('télémétrie : la file locale ne remplit plus la mémoire', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('50 entrées au plus, texte et détails réduits', async () => {
    const { persisterTelemetrie, TELEMETRIE_MAX } = await import('../../services/observability/telemetry.js');
    for (let i = 0; i < 120; i++) {
      persisterTelemetrie({ id: `t${i}`, kind: 'err', msg: 'x'.repeat(5000), details: { gros: 'y'.repeat(9000) }, src: 'apex', v: '1', user: 'u', ts: i, processed: false });
    }
    const buf = JSON.parse(localStorage.getItem('ax_telemetry_in') ?? '[]');
    expect(TELEMETRIE_MAX).toBe(50);
    expect(buf.length).toBe(50);
    expect(buf[49].id).toBe('t119');
    expect(buf[0].msg.length).toBe(500);
    expect(JSON.stringify(buf[0].details).length).toBeLessThan(2100);
  });

  it('mémoire pleine : garde 10, puis vide la file sans planter', async () => {
    const { persisterTelemetrie } = await import('../../services/observability/telemetry.js');
    const e = (id: string) => ({ id, kind: 'err' as const, msg: 'm', details: {}, src: 'apex' as const, v: '1', user: 'u', ts: 1, processed: false });
    for (let i = 0; i < 30; i++) persisterTelemetrie(e(`a${i}`));
    const vrai = localStorage.setItem.bind(localStorage);
    const espion = vi.spyOn(localStorage, 'setItem').mockImplementation((k: string, v: string) => {
      if (k === 'ax_telemetry_in' && JSON.parse(v).length > 10) throw new DOMException('plein', 'QuotaExceededError');
      return vrai(k, v);
    });
    persisterTelemetrie(e('b'));
    expect(JSON.parse(localStorage.getItem('ax_telemetry_in') ?? '[]').length).toBe(10);
    espion.mockImplementation(() => { throw new DOMException('plein', 'QuotaExceededError'); });
    expect(() => persisterTelemetrie(e('c'))).not.toThrow();
    expect(localStorage.getItem('ax_telemetry_in')).toBeNull();
  });
});
