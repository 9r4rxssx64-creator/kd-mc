/**
 * APEX v13.4.321 — Activation IA en 1 tap (Kevin 2026-06-08, « tout auto »).
 *
 * Problème récurrent : le proxy Cloudflare (clés serveur) s'authentifie avec le
 * CODE admin en clair (`ax_pin_kdmc_admin`), stocké uniquement au login PIN. Or
 * Kevin force-quit l'app (= re-login auto SANS code) → code jamais stocké → IA KO.
 *
 * Solution sans déconnexion : quand l'IA est KO ET que le code manque, on affiche
 * un mini-écran « Tape ton code pour activer l'IA ». Le code est stocké chiffré
 * (vault) dans `ax_pin_kdmc_admin` → le proxy s'authentifie. v13.4.322 : PLUS de
 * validation locale (apex_v13_pin absent/instable au login trusted → faux « code
 * incorrect ») — le PROXY est la source de vérité (sha256(code)==APEX_ADMIN_PIN_SHA256).
 */

import { events } from '../../core/events.js';
import { logger } from '../../core/logger.js';
import { toast } from '../../ui/toast.js';

const OVERLAY_ID = 'apex-pin-activate';
const ADMIN_UID = 'kdmc_admin';

function ls(k: string): string {
  try { return localStorage.getItem(k) ?? ''; } catch { return ''; }
}

/**
 * L'IA a-t-elle besoin que Kevin tape son code (proxy activé + code admin absent
 * + aucune clé locale) ? Pur/sync — testable.
 */
export function needsProxyPinActivation(): boolean {
  try {
    const isAdmin = ls('apex_v13_uid') === ADMIN_UID;
    const proxyFlag = ls('apex_v13_use_secrets_proxy');
    const proxyOn = proxyFlag === 'true' || proxyFlag === '1';
    const pinStored = !!(ls('ax_pin_kdmc_admin') || ls('ax_pin'));
    const hasLocalKey = ['anthropic', 'openai', 'openrouter', 'groq', 'google', 'mistral', 'deepseek']
      .some((p) => ls('ax_' + p + '_key').length > 0);
    return isAdmin && proxyOn && !pinStored && !hasLocalKey;
  } catch {
    return false;
  }
}

/**
 * Stocke le code (chiffré) dans `ax_pin_kdmc_admin` pour l'auth proxy.
 * v13.4.322 (Kevin « code incorrect » alors que le code est bon) : on NE valide
 * plus contre `apex_v13_pin` (absent/instable selon l'historique de login trusted)
 * — c'est le PROXY (sha256(code) == APEX_ADMIN_PIN_SHA256 côté serveur) qui est la
 * vraie source de vérité. On stocke + on laisse le proxy valider au prochain message.
 */
export async function activateWithCode(code: string): Promise<{ ok: boolean; error?: string }> {
  const c = (code || '').trim();
  if (c.length < 4) return { ok: false, error: 'Code trop court.' };
  try {
    const { vault } = await import('../vault/vault.js');
    await vault.setKey('ax_pin_kdmc_admin', c);
    logger.info('proxy-pin-activation', 'code admin stocké → auth proxy (validé par le serveur au prochain appel)');
    return { ok: true };
  } catch (err: unknown) {
    logger.warn('proxy-pin-activation', 'activate failed', { err });
    return { ok: false, error: 'Erreur, réessaie.' };
  }
}

/** Affiche le mini-écran d'activation (1×). No-op si déjà ouvert ou non nécessaire. */
export function promptProxyPinActivation(): void {
  try {
    if (typeof document === 'undefined') return;
    if (document.getElementById(OVERLAY_ID)) return;
    if (!needsProxyPinActivation()) return;

    const ov = document.createElement('div');
    ov.id = OVERLAY_ID;
    ov.style.cssText =
      'position:fixed;inset:0;z-index:2147483600;background:rgba(0,0,0,0.72);' +
      'backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:flex;' +
      'align-items:center;justify-content:center;padding:20px;' +
      'padding-top:max(env(safe-area-inset-top,20px),20px)';
    ov.innerHTML =
      '<div role="dialog" aria-modal="true" aria-label="Activer l\'IA" style="background:#12121c;' +
      'border:1px solid rgba(232,184,48,0.3);border-radius:16px;padding:22px;max-width:380px;width:100%;' +
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif\">" +
      '<h2 style="color:#e8b830;margin:0 0 8px;font-size:18px">🔑 Activer l\'IA</h2>' +
      '<p style="color:rgba(255,255,255,0.7);font-size:13px;margin:0 0 14px;line-height:1.5">' +
      'Tape ton code <strong>une fois</strong> pour qu\'Apex utilise tes clés serveur (proxy). ' +
      'Pas besoin de te déconnecter.</p>' +
      '<input id="apex-pin-activate-input" type="password" inputmode="numeric" autocomplete="off" ' +
      'autocapitalize="off" placeholder="Ton code" style="width:100%;box-sizing:border-box;padding:12px;' +
      'font-size:16px;background:rgba(0,0,0,0.4);color:#fff;border:1px solid rgba(255,255,255,0.15);' +
      'border-radius:10px;margin-bottom:10px">' +
      '<div id="apex-pin-activate-msg" style="color:#f78322;font-size:12px;min-height:16px;margin-bottom:8px"></div>' +
      '<button id="apex-pin-activate-ok" type="button" style="width:100%;padding:12px;font-size:15px;' +
      'font-weight:700;background:linear-gradient(135deg,#c9a227,#e8b830);color:#000;border:none;' +
      'border-radius:10px;cursor:pointer;min-height:44px">✅ Activer</button>' +
      '<button id="apex-pin-activate-cancel" type="button" style="width:100%;padding:10px;margin-top:8px;' +
      'font-size:13px;background:none;color:rgba(255,255,255,0.5);border:none;cursor:pointer;min-height:44px">' +
      'Plus tard</button></div>';
    document.body.appendChild(ov);

    const input = ov.querySelector<HTMLInputElement>('#apex-pin-activate-input');
    const msgEl = ov.querySelector<HTMLElement>('#apex-pin-activate-msg');
    const close = (): void => { ov.remove(); };
    input?.focus();

    ov.querySelector('#apex-pin-activate-cancel')?.addEventListener('click', close);
    const submit = async (): Promise<void> => {
      const r = await activateWithCode(input?.value ?? '');
      if (r.ok) {
        close();
        toast.success('✅ IA activée — réessaie ton message.', { duration: 4000 });
      } else if (msgEl) {
        msgEl.textContent = '⚠️ ' + (r.error ?? 'Code incorrect.');
      }
    };
    ov.querySelector('#apex-pin-activate-ok')?.addEventListener('click', () => { void submit(); });
    input?.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') void submit(); });
  } catch (err: unknown) {
    logger.warn('proxy-pin-activation', 'prompt failed', { err });
  }
}

/**
 * Au boot : après CHAQUE login (y compris auto/trusted — Kevin « garde la connexion
 * auto, mets mon code quand je me connecte auto »), propose l'activation 1-tap si le
 * code admin manque pour le proxy. Délai = laisser proxy-auto-enable poser son flag
 * + l'UI se monter. Self-gated (promptProxyPinActivation vérifie needs). Idempotent.
 */
let inited = false;
export function initProxyPinActivation(): void {
  if (inited) return;
  inited = true;
  try {
    events.on('auth:login', () => {
      setTimeout(() => { try { promptProxyPinActivation(); } catch { /* ignore */ } }, 6000);
    });
  } catch { /* ignore */ }
}
