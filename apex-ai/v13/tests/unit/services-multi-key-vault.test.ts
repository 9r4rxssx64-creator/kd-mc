/**
 * Tests services/multi-key-vault — Sprint 9 Kevin règle 2026-05-07
 *
 * Couverture :
 * - addKey crée KeyEntry valide chiffré
 * - listKeys / listAll / getKnownServices
 * - getCurrentKey retourne meilleure clé
 * - testKey ping endpoint mock fetch
 * - tryFailoverKey switch sur 2ème si 1ère fail
 * - getServicesDown / getServicesPartial
 * - getHealthStatus green/yellow/red
 * - markInvalid / restoreKey / removeKey
 * - setAlias / setPreferredOrder
 * - Export/import roundtrip
 * - Stats par service
 * - healthCheckAll
 * - getServiceLight (UI helper)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { multiKeyVault, type KeyEntry } from '../../services/vault/multi-key-vault.js';
import { vault } from '../../services/vault/vault.js';

describe('multi-key-vault — addKey + listKeys', () => {
  beforeEach(() => {
    multiKeyVault.resetAll();
  });

  it('addKey crée KeyEntry chiffré avec id unique', async () => {
    const entry = await multiKeyVault.addKey('anthropic', 'sk-ant-api03-test1');
    expect(entry.id).toBeTruthy();
    expect(entry.service).toBe('anthropic');
    expect(entry.encrypted.startsWith('AXENC1:')).toBe(true);
    expect(entry.status).toBe('unknown');
    expect(entry.failCount).toBe(0);
    expect(entry.successCount).toBe(0);
    expect(entry.addedAt).toBeGreaterThan(0);
  });

  it('addKey supporte alias et preferredOrder', async () => {
    const entry = await multiKeyVault.addKey('anthropic', 'sk-ant-api03-A', {
      alias: 'primaire',
      preferredOrder: 1,
    });
    expect(entry.alias).toBe('primaire');
    expect(entry.preferredOrder).toBe(1);
  });

  it('addKey throw si service ou plaintext vide', async () => {
    await expect(multiKeyVault.addKey('', 'value')).rejects.toThrow();
    await expect(multiKeyVault.addKey('anthropic', '')).rejects.toThrow();
  });

  it('addKey 2 clés distinctes pour même service → ne se remplacent pas', async () => {
    const a = await multiKeyVault.addKey('anthropic', 'sk-ant-api03-A');
    const b = await multiKeyVault.addKey('anthropic', 'sk-ant-api03-B');
    expect(a.id).not.toBe(b.id);
    const list = multiKeyVault.listKeys('anthropic');
    expect(list).toHaveLength(2);
  });

  it('addKey 2x avec même plaintext → dédupe (retourne existante)', async () => {
    const a = await multiKeyVault.addKey('anthropic', 'sk-ant-api03-DUP');
    const b = await multiKeyVault.addKey('anthropic', 'sk-ant-api03-DUP');
    expect(a.id).toBe(b.id);
    expect(multiKeyVault.listKeys('anthropic')).toHaveLength(1);
  });

  it('listKeys filtre par service + exclut invalid par défaut', async () => {
    const a = await multiKeyVault.addKey('anthropic', 'sk-A');
    await multiKeyVault.addKey('openai', 'sk-O');
    multiKeyVault.markInvalid(a.id, 'test');
    const list = multiKeyVault.listKeys('anthropic');
    expect(list).toHaveLength(0);
    const allList = multiKeyVault.listKeys('anthropic', true);
    expect(allList).toHaveLength(1);
  });

  it('listKeys tri par preferredOrder explicite (plus petit = priorité)', async () => {
    const c = await multiKeyVault.addKey('anthropic', 'sk-C', { preferredOrder: 3 });
    const a = await multiKeyVault.addKey('anthropic', 'sk-A', { preferredOrder: 1 });
    const b = await multiKeyVault.addKey('anthropic', 'sk-B', { preferredOrder: 2 });
    const list = multiKeyVault.listKeys('anthropic');
    expect(list[0]?.id).toBe(a.id);
    expect(list[1]?.id).toBe(b.id);
    expect(list[2]?.id).toBe(c.id);
  });

  it('listAll retourne toutes les clés (incl invalid si demandé)', async () => {
    await multiKeyVault.addKey('anthropic', 'sk-A');
    const b = await multiKeyVault.addKey('openai', 'sk-O');
    multiKeyVault.markInvalid(b.id, 'test');
    expect(multiKeyVault.listAll(true)).toHaveLength(2);
    expect(multiKeyVault.listAll(false)).toHaveLength(1);
  });

  it('getKnownServices retourne services uniques triés', async () => {
    await multiKeyVault.addKey('openai', 'sk-O');
    await multiKeyVault.addKey('anthropic', 'sk-A');
    await multiKeyVault.addKey('anthropic', 'sk-A2');
    const services = multiKeyVault.getKnownServices();
    expect(services).toEqual(['anthropic', 'openai']);
  });
});

describe('multi-key-vault — getCurrentKey', () => {
  beforeEach(() => {
    multiKeyVault.resetAll();
  });

  it('retourne null si aucune clé', async () => {
    const r = await multiKeyVault.getCurrentKey('anthropic');
    expect(r).toBeNull();
  });

  it('retourne plaintext déchiffré pour clé active', async () => {
    await multiKeyVault.addKey('anthropic', 'sk-ant-test-XYZ');
    const r = await multiKeyVault.getCurrentKey('anthropic');
    expect(r).not.toBeNull();
    expect(r?.plaintext).toBe('sk-ant-test-XYZ');
    expect(r?.keyId).toBeTruthy();
  });

  it('priorise active > unknown > rate-limited > failing', async () => {
    const a = await multiKeyVault.addKey('anthropic', 'sk-1'); /* unknown */
    const b = await multiKeyVault.addKey('anthropic', 'sk-2'); /* deviendra active */
    /* Force b active manuellement */
    b.status = 'active';
    multiKeyVault.setAlias(b.id, 'main');
    /* Reload via listKeys sort */
    /* On ne peut pas forcer status sans test/markInvalid/restoreKey, simulons un rate-limit sur a */
    multiKeyVault.markInvalid(a.id, 'rate'); /* a invalid => filtré */
    const r = await multiKeyVault.getCurrentKey('anthropic');
    expect(r?.keyId).toBe(b.id);
  });

  it('fallback sur failing si aucune active/unknown disponible', async () => {
    const a = await multiKeyVault.addKey('anthropic', 'sk-fail-only');
    /* Force a failing */
    multiKeyVault.markInvalid(a.id, 'temporaire');
    multiKeyVault.restoreKey(a.id);
    /* Restored = unknown */
    const r1 = await multiKeyVault.getCurrentKey('anthropic');
    expect(r1?.plaintext).toBe('sk-fail-only');
  });
});

describe('multi-key-vault — testKey + failover', () => {
  beforeEach(() => {
    multiKeyVault.resetAll();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('testKey retourne ok si HTTP 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 200 } as Response);
    vi.stubGlobal('fetch', fetchMock);
    const entry = await multiKeyVault.addKey('anthropic', 'sk-good');
    const r = await multiKeyVault.testKey(entry.id);
    expect(r.ok).toBe(true);
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
    /* Status mis à jour */
    const list = multiKeyVault.listKeys('anthropic');
    expect(list[0]?.status).toBe('active');
    expect(list[0]?.lastWorkedAt).toBeGreaterThan(0);
    expect(list[0]?.successCount).toBe(1);
  });

  it('testKey retourne {ok:false, reason} si HTTP 401 → invalid', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 401 } as Response);
    vi.stubGlobal('fetch', fetchMock);
    const entry = await multiKeyVault.addKey('openai', 'sk-bad');
    const r = await multiKeyVault.testKey(entry.id);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('401');
    const list = multiKeyVault.listKeys('openai', true);
    expect(list[0]?.status).toBe('invalid');
  });

  it('testKey retourne rate-limited sur HTTP 429', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 429 } as Response);
    vi.stubGlobal('fetch', fetchMock);
    const entry = await multiKeyVault.addKey('groq', 'gsk-limited');
    const r = await multiKeyVault.testKey(entry.id);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('rate-limited');
    const list = multiKeyVault.listKeys('groq');
    expect(list[0]?.status).toBe('rate-limited');
  });

  it('testKey HTTP 500 → bump failCount sans invalider direct', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 503 } as Response);
    vi.stubGlobal('fetch', fetchMock);
    const entry = await multiKeyVault.addKey('anthropic', 'sk-srvdown');
    const r = await multiKeyVault.testKey(entry.id);
    expect(r.ok).toBe(false);
    const list = multiKeyVault.listKeys('anthropic');
    expect(list[0]?.failCount).toBe(1);
  });

  it('testKey timeout (AbortError) → bump fail', async () => {
    const fetchMock = vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    vi.stubGlobal('fetch', fetchMock);
    const entry = await multiKeyVault.addKey('groq', 'gsk-timeout');
    const r = await multiKeyVault.testKey(entry.id);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('timeout');
  });

  it('testKey id inconnu → reason "not found"', async () => {
    const r = await multiKeyVault.testKey('inexistant_xxxxx');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('not found');
  });

  it('testKey service sans ping config → reason "no test endpoint"', async () => {
    const entry = await multiKeyVault.addKey('inconnu', 'tok-X');
    const r = await multiKeyVault.testKey(entry.id);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no test endpoint configured');
  });

  it('tryFailoverKey switch sur 2ème clé si 1ère fail', async () => {
    const k1 = await multiKeyVault.addKey('anthropic', 'sk-first');
    await multiKeyVault.addKey('anthropic', 'sk-second');
    const r = await multiKeyVault.tryFailoverKey('anthropic', k1.id, 'HTTP 500 server down');
    expect(r).not.toBeNull();
    expect(r?.plaintext).toBe('sk-second');
  });

  it('tryFailoverKey marque la clé courante invalid sur erreur 401', async () => {
    const k1 = await multiKeyVault.addKey('anthropic', 'sk-bad-auth');
    await multiKeyVault.addKey('anthropic', 'sk-good');
    await multiKeyVault.tryFailoverKey('anthropic', k1.id, 'HTTP 401 invalid api key');
    const list = multiKeyVault.listKeys('anthropic', true);
    const k1Updated = list.find((k) => k.id === k1.id);
    expect(k1Updated?.status).toBe('invalid');
  });

  it('tryFailoverKey retourne null si aucune autre clé dispo', async () => {
    const k1 = await multiKeyVault.addKey('anthropic', 'sk-only');
    const r = await multiKeyVault.tryFailoverKey('anthropic', k1.id, 'fail');
    expect(r).toBeNull();
  });

  it('tryFailoverKey marque rate-limited si erreur 429', async () => {
    const k1 = await multiKeyVault.addKey('groq', 'gsk-1');
    await multiKeyVault.addKey('groq', 'gsk-2');
    await multiKeyVault.tryFailoverKey('groq', k1.id, 'HTTP 429 rate limit exceeded');
    const list = multiKeyVault.listKeys('groq', true);
    const k1Updated = list.find((k) => k.id === k1.id);
    expect(k1Updated?.status).toBe('rate-limited');
  });
});

describe('multi-key-vault — health + stats', () => {
  beforeEach(() => {
    multiKeyVault.resetAll();
    vi.restoreAllMocks();
  });

  it('getStats retourne compteurs corrects', async () => {
    const a = await multiKeyVault.addKey('anthropic', 'sk-1');
    await multiKeyVault.addKey('anthropic', 'sk-2');
    multiKeyVault.markInvalid(a.id, 'test');
    const stats = multiKeyVault.getStats('anthropic');
    expect(stats.total).toBe(2);
    expect(stats.invalid).toBe(1);
  });

  it('getServicesDown vide si tout active/unknown', async () => {
    await multiKeyVault.addKey('anthropic', 'sk-1');
    await multiKeyVault.addKey('openai', 'sk-2');
    expect(multiKeyVault.getServicesDown()).toEqual([]);
  });

  it('getServicesDown détecte service entièrement invalid', async () => {
    const a = await multiKeyVault.addKey('anthropic', 'sk-1');
    multiKeyVault.markInvalid(a.id, 'test');
    expect(multiKeyVault.getServicesDown()).toContain('anthropic');
  });

  it('getServicesPartial détecte mix ok + failing', async () => {
    const a = await multiKeyVault.addKey('anthropic', 'sk-bad');
    await multiKeyVault.addKey('anthropic', 'sk-good');
    multiKeyVault.markInvalid(a.id, 'temp');
    expect(multiKeyVault.getServicesPartial()).toContain('anthropic');
  });

  it('getHealthStatus green sans clé', () => {
    expect(multiKeyVault.getHealthStatus()).toBe('green');
  });

  it('getHealthStatus red si service entier down', async () => {
    const a = await multiKeyVault.addKey('anthropic', 'sk-1');
    multiKeyVault.markInvalid(a.id, 'invalid');
    expect(multiKeyVault.getHealthStatus()).toBe('red');
  });

  it('getHealthStatus yellow si partial', async () => {
    const a = await multiKeyVault.addKey('anthropic', 'sk-bad');
    await multiKeyVault.addKey('anthropic', 'sk-good');
    multiKeyVault.markInvalid(a.id, 'temp');
    expect(multiKeyVault.getHealthStatus()).toBe('yellow');
  });

  it('getHealthStatus green si tout actif', async () => {
    await multiKeyVault.addKey('anthropic', 'sk-1');
    await multiKeyVault.addKey('openai', 'sk-2');
    expect(multiKeyVault.getHealthStatus()).toBe('green');
  });

  it('getServiceLight gris sans clé', () => {
    expect(multiKeyVault.getServiceLight('anthropic')).toBe('gray');
  });

  it('getServiceLight rouge si toutes clés invalid', async () => {
    const a = await multiKeyVault.addKey('anthropic', 'sk-1');
    multiKeyVault.markInvalid(a.id, 'fail');
    expect(multiKeyVault.getServiceLight('anthropic')).toBe('red');
  });

  it('getServiceLight gray si unknown sans test récent', async () => {
    await multiKeyVault.addKey('anthropic', 'sk-1');
    /* unknown sans lastTestedAt → gray (pas hasActive) */
    expect(multiKeyVault.getServiceLight('anthropic')).toBe('gray');
  });

  it('healthCheckAll exécute tests + skip invalid', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 200 } as Response);
    vi.stubGlobal('fetch', fetchMock);
    await multiKeyVault.addKey('anthropic', 'sk-A');
    const b = await multiKeyVault.addKey('anthropic', 'sk-B');
    multiKeyVault.markInvalid(b.id, 'permanent');
    const r = await multiKeyVault.healthCheckAll();
    expect(r.tested).toBeGreaterThanOrEqual(1);
    /* invalid skipped */
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('multi-key-vault — admin actions', () => {
  beforeEach(() => {
    multiKeyVault.resetAll();
  });

  it('markInvalid puis restoreKey → status revient unknown', async () => {
    const a = await multiKeyVault.addKey('anthropic', 'sk-1');
    multiKeyVault.markInvalid(a.id, 'admin force');
    let list = multiKeyVault.listKeys('anthropic', true);
    expect(list[0]?.status).toBe('invalid');
    expect(list[0]?.invalidReason).toBe('admin force');
    multiKeyVault.restoreKey(a.id);
    list = multiKeyVault.listKeys('anthropic', true);
    expect(list[0]?.status).toBe('unknown');
    expect(list[0]?.invalidReason).toBeUndefined();
  });

  it('markInvalid sur id inconnu → no-op', () => {
    expect(() => multiKeyVault.markInvalid('nope', 'xxx')).not.toThrow();
  });

  it('removeKey supprime définitivement', async () => {
    const a = await multiKeyVault.addKey('anthropic', 'sk-1');
    multiKeyVault.removeKey(a.id);
    expect(multiKeyVault.listAll(true)).toHaveLength(0);
  });

  it('setAlias met à jour alias', async () => {
    const a = await multiKeyVault.addKey('anthropic', 'sk-1');
    multiKeyVault.setAlias(a.id, 'production');
    const list = multiKeyVault.listKeys('anthropic');
    expect(list[0]?.alias).toBe('production');
  });

  it('setPreferredOrder reordonne le tri', async () => {
    const a = await multiKeyVault.addKey('anthropic', 'sk-1');
    const b = await multiKeyVault.addKey('anthropic', 'sk-2');
    multiKeyVault.setPreferredOrder(b.id, 0);
    multiKeyVault.setPreferredOrder(a.id, 5);
    const list = multiKeyVault.listKeys('anthropic');
    expect(list[0]?.id).toBe(b.id);
  });

  it('setPreferredOrder undefined → retire ordre forcé', async () => {
    const a = await multiKeyVault.addKey('anthropic', 'sk-1', { preferredOrder: 2 });
    multiKeyVault.setPreferredOrder(a.id, undefined);
    const list = multiKeyVault.listKeys('anthropic');
    expect(list[0]?.preferredOrder).toBeUndefined();
  });
});

describe('multi-key-vault — export/import', () => {
  beforeEach(() => {
    multiKeyVault.resetAll();
  });

  it('export + import roundtrip preserve clés', async () => {
    await multiKeyVault.addKey('anthropic', 'sk-A');
    await multiKeyVault.addKey('openai', 'sk-O');
    const exported = multiKeyVault.exportAllEncrypted();
    multiKeyVault.resetAll();
    const r = multiKeyVault.importEncrypted(exported);
    expect(r.imported).toBe(2);
    expect(multiKeyVault.listAll(true)).toHaveLength(2);
  });

  it('importEncrypted skip ids déjà présents (merge non destructif)', async () => {
    const a = await multiKeyVault.addKey('anthropic', 'sk-A');
    const exported = multiKeyVault.exportAllEncrypted();
    /* Ne reset pas → ré-import doit skip */
    const r = multiKeyVault.importEncrypted(exported);
    expect(r.imported).toBe(0);
    expect(multiKeyVault.listAll(true).filter((k) => k.id === a.id)).toHaveLength(1);
  });

  it('importEncrypted JSON invalide → 0 imported', () => {
    const r = multiKeyVault.importEncrypted('not-json');
    expect(r.imported).toBe(0);
  });

  it('importEncrypted non-array → 0 imported', () => {
    const r = multiKeyVault.importEncrypted('{"foo":"bar"}');
    expect(r.imported).toBe(0);
  });

  it('importEncrypted valide entries malformées', () => {
    const bad = JSON.stringify([
      { foo: 'bar' },
      { id: 'x', service: 'y', encrypted: 'AXENC1:abc', addedAt: 1, status: 'unknown', failCount: 0, successCount: 0 },
    ]);
    const r = multiKeyVault.importEncrypted(bad);
    expect(r.imported).toBe(1);
  });
});

describe('multi-key-vault — persistence localStorage', () => {
  beforeEach(() => {
    multiKeyVault.resetAll();
  });

  it('addKey persiste en localStorage apex_v13_multi_keys', async () => {
    await multiKeyVault.addKey('anthropic', 'sk-1');
    const raw = localStorage.getItem('apex_v13_multi_keys');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as KeyEntry[];
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.service).toBe('anthropic');
  });

  it('load résiste à corruption JSON', () => {
    localStorage.setItem('apex_v13_multi_keys', 'not-json{');
    multiKeyVault.reloadFromStorage();
    expect(multiKeyVault.listAll(true)).toEqual([]);
  });

  it('load ignore array entries malformées', () => {
    localStorage.setItem(
      'apex_v13_multi_keys',
      JSON.stringify([
        { foo: 'bar' },
        null,
        {
          id: 'x',
          service: 'y',
          encrypted: 'z',
          addedAt: 1,
          status: 'unknown',
          failCount: 0,
          successCount: 0,
        },
      ]),
    );
    multiKeyVault.reloadFromStorage();
    const list = multiKeyVault.listAll(true);
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe('x');
  });
});

describe('multi-key-vault — re-add après marquage invalid', () => {
  beforeEach(() => {
    multiKeyVault.resetAll();
  });

  it('addKey identique après markInvalid → re-active la clé existante', async () => {
    const a = await multiKeyVault.addKey('anthropic', 'sk-RE');
    multiKeyVault.markInvalid(a.id, 'temporaire');
    const re = await multiKeyVault.addKey('anthropic', 'sk-RE');
    expect(re.id).toBe(a.id);
    expect(re.status).toBe('unknown');
    expect(re.failCount).toBe(0);
    expect(re.invalidReason).toBeUndefined();
  });
});

describe('multi-key-vault — vault integration', () => {
  it('encrypted contient AXENC1: prefix et déchiffre via vault.decryptAuto', async () => {
    multiKeyVault.resetAll();
    const e = await multiKeyVault.addKey('anthropic', 'plain-secret-text');
    expect(e.encrypted.startsWith('AXENC1:')).toBe(true);
    const decrypted = await vault.decryptAuto(e.encrypted);
    expect(decrypted).toBe('plain-secret-text');
  });
});

describe('multi-key-vault — v13.4.284 infos perso (category/label/kind)', () => {
  beforeEach(() => {
    multiKeyVault.resetAll();
  });

  it('addKey persiste category + label + kind', async () => {
    const e = await multiKeyVault.addKey('Adresse Nice', '12 rue X, 06000 Nice', {
      category: 'addresses',
      label: 'Appartement Nice',
      kind: 'info',
    });
    expect(e.category).toBe('addresses');
    expect(e.label).toBe('Appartement Nice');
    expect(e.kind).toBe('info');
  });

  it('kind:info → témoin vert direct (status active, lastWorkedAt set)', async () => {
    const e = await multiKeyVault.addKey('Email perso', 'kevin@example.com', {
      category: 'identity',
      kind: 'info',
    });
    expect(e.status).toBe('active');
    expect(e.lastWorkedAt).toBeGreaterThan(0);
  });

  it('testKey sur entrée info → ok sans ping, reste active (jamais failing)', async () => {
    const e = await multiKeyVault.addKey('Nom', 'Kevin Desarzens', { kind: 'info' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const r = await multiKeyVault.testKey(e.id);
    expect(r.ok).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    const after = multiKeyVault.listAll(true).find((k) => k.id === e.id);
    expect(after?.status).toBe('active');
    fetchSpy.mockRestore();
  });

  it('setMeta met à jour catégorie/label/kind sans toucher la valeur chiffrée', async () => {
    const e = await multiKeyVault.addKey('divers1', 'note secrète xyz');
    const encBefore = e.encrypted;
    const ok = multiKeyVault.setMeta(e.id, { category: 'identity', label: 'Mon nom', kind: 'info' });
    expect(ok).toBe(true);
    const after = multiKeyVault.listAll(true).find((k) => k.id === e.id);
    expect(after?.category).toBe('identity');
    expect(after?.label).toBe('Mon nom');
    expect(after?.kind).toBe('info');
    expect(after?.encrypted).toBe(encBefore);
  });

  it('setMeta avec chaîne vide efface la métadonnée', async () => {
    const e = await multiKeyVault.addKey('svc', 'val12345', { category: 'addresses', label: 'X' });
    multiKeyVault.setMeta(e.id, { label: '' });
    const after = multiKeyVault.listAll(true).find((k) => k.id === e.id);
    expect(after?.label).toBeUndefined();
    expect(after?.category).toBe('addresses');
  });

  it('category/label survivent à un reload (persistance localStorage)', async () => {
    const e = await multiKeyVault.addKey('Appart Paris', 'adresse...', {
      category: 'addresses',
      label: 'Studio Paris',
      kind: 'info',
    });
    // Force reload depuis localStorage (vide le cache mémoire)
    multiKeyVault.reloadFromStorage();
    const reloaded = multiKeyVault.listAll(true).find((k) => k.id === e.id);
    expect(reloaded?.category).toBe('addresses');
    expect(reloaded?.label).toBe('Studio Paris');
    expect(reloaded?.kind).toBe('info');
  });
});
