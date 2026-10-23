/**
 * Pont 497 / tâche 4 (23.10.2026) — la sauvegarde Gist ne partait jamais : le seul jeton lisible du coffre était refusé par GitHub
 * (le bon, « Apex-AI-GIST », n'y est pas). Remède : une alerte avec un lien qui ouvre la page de création déjà remplie.
 * Pont 464 — 7 « KEY ERASED » : des clés RANGÉES sous un autre nom par la récupération étaient prises pour des effacements.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { alerte } = vi.hoisted(() => ({ alerte: vi.fn(async () => ({})) }));
vi.mock('../../services/admin/kevin-alerts.js', () => ({ kevinAlerts: { alertKevin: alerte } }));

const PAT = 'ghp_' + 'D'.repeat(36);

describe('Gist : jeton refusé par GitHub → alerte avec lien prérempli, une fois par 24 h', () => {
  beforeEach(() => { localStorage.clear(); alerte.mockClear(); vi.resetModules(); });
  afterEach(() => { vi.unstubAllGlobals(); vi.doUnmock('../../services/auth/auth.js'); vi.doUnmock('../../services/vault/vault.js'); });

  async function charger() {
    vi.doMock('../../services/auth/auth.js', () => ({ auth: { isAdminSync: () => true } }));
    vi.doMock('../../services/vault/vault.js', () => ({ vault: {
      readKey: async (k: string) => (k === 'ax_github_pat_classic' ? PAT : k === 'ax_anthropic_key' ? 'sk-ant-x' : ''),
      encryptAuto: async () => 'AXENC1:x', decryptAuto: async () => null, setKey: async () => ({ ok: true }),
    } }));
    localStorage.setItem('ax_anthropic_key', 'AXENC1:blob');
    return import('../../services/vault/apex-github-gist-backup.js');
  }

  it('jetonAChanger : refus = oui ; panne GitHub, réseau, succès, rien = non', async () => {
    const { jetonAChanger } = await import('../../services/vault/apex-github-gist-backup.js');
    expect(jetonAChanger('gist_refus: ax_github_pat_classic : jeton GitHub refusé (expiré ou révoqué)')).toBe(true);
    expect(jetonAChanger('gist_refus: ax_github_token : jeton GitHub sans le droit « gist » ou limite atteinte')).toBe(true);
    expect(jetonAChanger('gist_refus: ax_github_token : jeton GitHub sans accès aux gists (droit « gist » manquant)')).toBe(true);
    expect(jetonAChanger('gist_refus: ax_github_token : GitHub indisponible')).toBe(false);
    expect(jetonAChanger('gist_refus: ax_github_token : réseau injoignable')).toBe(false);
    expect(jetonAChanger('github_token_missing')).toBe(false);
    expect(jetonAChanger(undefined)).toBe(false);
  });

  it('401 : une alerte, le lien ouvre la création avec la case gist, aucun jeton dans l’alerte ; pas de 2ᵉ alerte avant 24 h', async () => {
    const { apexGithubGistBackup, LIEN_NOUVEAU_JETON_GIST } = await charger();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"Bad credentials"}', { status: 401 })));
    const r = await apexGithubGistBackup.pushSiDu();
    await new Promise((x) => setTimeout(x, 20));
    expect(r).toMatchObject({ fait: true, ok: false });
    expect(alerte).toHaveBeenCalledTimes(1);
    const a = (alerte.mock.calls[0] as unknown as [Record<string, string>])[0];
    expect(a.cta_url).toBe(LIEN_NOUVEAU_JETON_GIST);
    expect(a.cta_url).toMatch(/^https:\/\/github\.com\/settings\/tokens\/new\?scopes=gist&description=/);
    expect(JSON.stringify(a)).not.toContain(PAT);
    /* une heure plus tard : nouvel essai de l'envoi, mais PAS de nouvelle alerte */
    localStorage.setItem('apex_v13_gist_backup_dernier', JSON.stringify({ ts: Date.now() - 2 * 3600_000, ok: false }));
    await apexGithubGistBackup.pushSiDu();
    await new Promise((x) => setTimeout(x, 20));
    expect(alerte).toHaveBeenCalledTimes(1);
  });

  it('GitHub en panne (503) : pas d’alerte « jeton à changer »', async () => {
    const { apexGithubGistBackup } = await charger();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
    await apexGithubGistBackup.pushSiDu();
    await new Promise((x) => setTimeout(x, 20));
    expect(alerte).not.toHaveBeenCalled();
  });
});

describe('Coffre : une clé rangée sous un autre nom n’est pas un « KEY ERASED »', () => {
  beforeEach(() => { localStorage.clear(); vi.resetModules(); });
  afterEach(() => vi.restoreAllMocks());

  async function effacer(cle: string, retiree: boolean) {
    const { logger } = await import('../../core/logger.js');
    const erreurs = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const { vault } = await import('../../services/vault/vault.js');
    vault.startCredentialsWatch();
    if (retiree) localStorage.setItem('ax_credentials_deleted', JSON.stringify([cle]));
    window.dispatchEvent(new StorageEvent('storage', { key: cle, oldValue: 'AXENC1:ancienne', newValue: null }));
    await new Promise((x) => setTimeout(x, 20));
    vault.stopCredentialsWatch?.();
    return erreurs.mock.calls.filter((c) => /KEY ERASED/.test(String(c[1]))).length;
  }

  it('clé notée comme retirée : aucune erreur', async () => {
    expect(await effacer('ax_github_key', true)).toBe(0);
  });

  it('clé NON notée (vrai effacement) : l’erreur reste', async () => {
    expect(await effacer('ax_cohere_key', false)).toBe(1);
  });
});
