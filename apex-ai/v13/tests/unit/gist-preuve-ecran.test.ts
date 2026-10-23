/**
 * 23.10.2026 (tâche 4, pont 622/628) : Kevin colle son jeton, mais ni le Lenovo (page des jetons refusée) ni la liste publique des gists
 * (un gist secret n'y est pas) ne peuvent le prouver → Apex AI le DIT à l'écran. Et la fausse alerte « Firebase backup KO 0/1 » est supprimée.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bilanFirebase } from '../../services/vault/bilan-sauvegarde.js';

const PAT = 'ghp_' + 'E'.repeat(36);

describe('bilanFirebase : plus de fausse alarme', () => {
  it('clé bien au cloud → OK', () => {
    expect(bilanFirebase(['ax_github_pat_classic'], new Set(['ax_github_pat_classic']), true).niveau).toBe('ok');
  });
  it('hors ligne (Firebase non joignable) → attente rassurante, JAMAIS « KO / RISQUE »', () => {
    const b = bilanFirebase(['ax_github_pat_classic'], new Set(), false);
    expect(b.niveau).toBe('attente');
    expect(b.texte).not.toMatch(/KO|RISQUE/);
    expect(b.texte).toContain('bien rangées');
  });
  it('connecté mais rien au cloud → KO ; une sur deux → partiel', () => {
    expect(bilanFirebase(['a', 'b'], new Set(), true).niveau).toBe('ko');
    expect(bilanFirebase(['a', 'b'], new Set(['a']), true).niveau).toBe('partiel');
  });
  it('le câblage lit le VRAI nom de la clé rangée (storageKey), pas un nom deviné', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(`${process.cwd()}/features/chat/chat-input-wiring.ts`, 'utf8');
    expect(src).toContain('s.pattern.storageKey');
    expect(src).not.toMatch(/ax_\$\{s\.pattern\.name\.toLowerCase/);
  });
});

describe('Gist : le résultat est noté et dit en français', () => {
  beforeEach(() => { localStorage.clear(); vi.resetModules(); });
  afterEach(() => { vi.unstubAllGlobals(); vi.doUnmock('../../services/auth/auth.js'); vi.doUnmock('../../services/vault/vault.js'); });

  async function charger(reponses: (url: string, init?: RequestInit) => Response) {
    vi.doMock('../../services/auth/auth.js', () => ({ auth: { isAdminSync: () => true } }));
    vi.doMock('../../services/vault/vault.js', () => ({ vault: {
      readKey: async (k: string) => (k === 'ax_github_pat_classic' ? PAT : k === 'ax_anthropic_key' ? 'sk-ant-x' : ''),
      encryptAuto: async () => 'AXENC1:x', decryptAuto: async () => null, setKey: async () => ({ ok: true }),
    } }));
    localStorage.setItem('ax_anthropic_key', 'AXENC1:blob');
    vi.stubGlobal('fetch', vi.fn(async (u: string, i?: RequestInit) => reponses(String(u), i)));
    return import('../../services/vault/apex-github-gist-backup.js');
  }

  it('envoi réussi (collage, sans pushSiDu) : la note dit « faite », avec le nombre de clés, et la phrase le répète', async () => {
    const m = await charger((u, i) => ((i?.method ?? 'GET') === 'GET' ? new Response('[]', { status: 200 }) : new Response('{"id":"g1234567890"}', { status: 201 })));
    const r = await m.apexGithubGistBackup.pushBackup();
    expect(r.ok).toBe(true);
    const n = JSON.parse(localStorage.getItem(m.NOTE_GIST) ?? 'null');
    expect(n).toMatchObject({ ok: true, jeton: 'ax_github_pat_classic' });
    expect(n.clefs).toBeGreaterThan(0);
    const p = m.phraseGist() as string;
    expect(p).toMatch(/^☁️ Sauvegarde GitHub faite à l'instant : \d+ clé/);
    expect(p).not.toContain(PAT);
  });

  it('refus 401 : la note garde la cause, la phrase commence par ⚠️ et ne contient pas le jeton', async () => {
    const m = await charger(() => new Response('{}', { status: 401 }));
    const r = await m.apexGithubGistBackup.pushBackup();
    expect(r.ok).toBe(false);
    const p = m.phraseGist() as string;
    expect(p.startsWith('⚠️ Sauvegarde GitHub non faite')).toBe(true);
    expect(p).toContain('refusé');
    expect(p).not.toContain(PAT);
  });

  it('aucun envoi tenté (pas de jeton / coffre vide) : pas de phrase', async () => {
    const m = await charger(() => new Response('[]', { status: 200 }));
    expect(m.phraseGist()).toBeNull();
  });

  it('phraseGist : « il y a N min / h »', async () => {
    const m = await charger(() => new Response('[]', { status: 200 }));
    localStorage.setItem(m.NOTE_GIST, JSON.stringify({ ts: 1_000_000, ok: true, clefs: 3 }));
    expect(m.phraseGist(1_000_000 + 5 * 60_000)).toContain('il y a 5 min');
    expect(m.phraseGist(1_000_000 + 3 * 3600_000)).toContain('il y a 3 h');
  });
});
