/**
 * Vue membre simulée (Kevin 23.10.2026, tâche 56 de cloud-installer) : quand Kevin ouvre l'app en « 👁 Vue membre », il est abonné au
 * meilleur forfait partout et peut acheter en SIMULATION (0 €, accès 24 h, jamais compté).
 * SÉCURITÉ : ces deux champs (`simulation`, `apercu`) n'arrivent QUE à l'admin prouvé (garde du routeur) ; on ne les déduit JAMAIS d'un nom,
 * d'un localStorage ou d'un paramètre d'adresse. Rien n'est conservé hors mémoire : fermer l'app = retour à la normale.
 */
import { logger } from '../../core/logger.js';

let actif = false;

/** Vrai seulement si le domaine a dit « simulation + aperçu membre » à l'admin prouvé. */
export function vueMembreActive(): boolean { return actif; }

/** Pur : lit la réponse de /__sso/whoami. */
export function lireVueMembre(j: unknown): boolean {
  const o = (j && typeof j === 'object' ? j : {}) as { simulation?: unknown; apercu?: unknown };
  return o.simulation === true && o.apercu === 'membre';
}

export async function rafraichirVueMembre(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const headers: Record<string, string> = {};
    let tok = '';
    try { tok = localStorage.getItem('kdmc_sso_token') || ''; } catch { /* ignore */ }
    if (tok) headers['Authorization'] = 'Bearer ' + tok;
    const r = await fetchImpl('/__sso/whoami', { credentials: 'include', cache: 'no-store', headers });
    actif = r.ok ? lireVueMembre(await r.json()) : false;
  } catch (err: unknown) {
    actif = false;
    logger.debug('vue-membre', 'whoami illisible', { err });
  }
  majBandeau();
  return actif;
}

function majBandeau(): void {
  if (typeof document === 'undefined') return;
  const ancien = document.getElementById('ax-vue-membre-bandeau');
  if (!actif) { ancien?.remove(); return; }
  if (ancien) return;
  const b = document.createElement('div');
  b.id = 'ax-vue-membre-bandeau';
  b.setAttribute('role', 'status');
  b.textContent = '👁 Vue membre simulée : abonné au maximum, achats simulés';
  b.style.cssText = 'position:fixed;left:8px;right:8px;bottom:calc(env(safe-area-inset-bottom,0px) + 8px);z-index:99999;padding:10px 14px;min-height:44px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;text-align:center;font-size:13px;font-weight:600;border-radius:12px;background:#1d3b8b;color:#fff;border:1px solid #6a8aff;pointer-events:none';
  document.body.appendChild(b);
}

/** Achat en simulation : un vrai accès de 24 h, 0 €, jamais compté. Refusé hors vue membre. */
export async function acheterEnSimulation(produit: string, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; erreur?: string }> {
  if (!actif) return { ok: false, erreur: 'achat simulé réservé à la vue membre' };
  if (!/^[a-z0-9_-]{1,64}$/i.test(produit)) return { ok: false, erreur: 'produit inconnu' };
  try {
    const p = await fetchImpl('/__sso/pass', { credentials: 'include', cache: 'no-store' });
    const pj = (await p.json().catch(() => ({}))) as { token?: string };
    if (!p.ok || !pj.token) return { ok: false, erreur: 'laissez-passer du domaine indisponible' };
    const r = await fetchImpl('https://kdmc-vente.9r4rxssx64.workers.dev/caisse/simulation', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + pj.token },
      body: JSON.stringify({ produit }),
    });
    return r.ok ? { ok: true } : { ok: false, erreur: `caisse de simulation refusée (HTTP ${r.status})` };
  } catch (err: unknown) {
    return { ok: false, erreur: err instanceof Error ? err.message : 'réseau' };
  }
}

/** Test seulement. */
export function _reinitialiserVueMembre(): void { actif = false; document?.getElementById('ax-vue-membre-bandeau')?.remove(); }
