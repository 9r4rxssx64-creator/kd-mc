/**
 * v13.4.377 — capture de Kevin (16.10, 22h56) : une bulle orange « Cloudflare ralenti · pas ta clé » recouvrait l'en-tête
 * d'Apex à l'ouverture. Elle venait du diagnostic Cloudflare lancé tout seul 2 s après le démarrage (travail de fond) :
 * une info qui ne demande rien à Kevin. Règle : le diagnostic de fond est silencieux ; celui que Kevin lance (Réglages)
 * garde la bulle.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recordHttpOk } from '../../services/observability/cloudflare-status.js'; /* pré-chargé : l'import dynamique du service répond vite */

/* Le Coffre est remplacé pour le test : il rend la clé Cloudflare (le vrai Coffre garde un état entre deux lectures). */
vi.mock('../../services/vault/vault.js', async (orig) => {
  const m = (await orig()) as Record<string, unknown>;
  const vault = m['vault'] as Record<string, unknown>;
  return { ...m, vault: { ...vault, readKey: async (k: string) => (k === 'ax_cloudflare_token' ? 'cf_xxx_long_enough_token_377' : null) } };
});

const BANNER_ID = 'apex-cloudflare-infra-banner';
/* la bulle arrive par un import dynamique : on attend jusqu'à 2 s qu'elle apparaisse (ou non) */
const attendreBulle = async (presente: boolean) => { for (let i = 0; i < 40; i++) { if (!!document.getElementById(BANNER_ID) === presente) return; await new Promise((r) => setTimeout(r, 50)); } };

describe('v13.4.377 — diagnostic Cloudflare de fond sans bulle', () => {
  beforeEach(() => { localStorage.clear(); document.getElementById(BANNER_ID)?.remove(); });
  afterEach(() => { vi.restoreAllMocks(); recordHttpOk(); document.getElementById(BANNER_ID)?.remove(); });

  const avecJeton = () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Service Unavailable', { status: 503 }));
  };

  it('en silencieux (démarrage) : 503 noté dans le diagnostic, AUCUNE bulle à l\'écran', async () => {
    avecJeton();
    const { apexCloudflareVaultDeploy } = await import('../../services/vault/apex-cloudflare-vault-deploy.js');
    const diag = await apexCloudflareVaultDeploy.runDiagnostic({ silencieux: true });
    await attendreBulle(true); /* on laisse 2 s à une bulle éventuelle : elle ne doit PAS venir */
    expect(diag.error_reason ?? '').toMatch(/dégradée/);
    expect(document.getElementById(BANNER_ID)).toBeNull();
  });

  it('lancé par Kevin (Réglages, sans option) : la bulle reste', async () => {
    avecJeton();
    const { apexCloudflareVaultDeploy } = await import('../../services/vault/apex-cloudflare-vault-deploy.js');
    await apexCloudflareVaultDeploy.runDiagnostic();
    await attendreBulle(true);
    expect(document.getElementById(BANNER_ID)).not.toBeNull();
  });
});
