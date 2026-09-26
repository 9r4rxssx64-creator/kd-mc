/**
 * APEX v13.4.194 — Cloudflare infra status detector.
 *
 * Kevin 2026-05-16 16:39 : screenshot diagnostic Cloudflare HTTP 503 alors
 * que token valide. Confirmé sur cloudflarestatus.com :
 * - Bot Management : "Degraded Performance" depuis 15 mai 2026
 * - Email Routing : "Degraded Performance"
 * - "We have disabled the affected feature globally"
 *
 * Quand Apex détecte HTTP 503 sur api.cloudflare.com → afficher banner
 * informationnel pour que Kevin SACHE que ce n'est PAS son token mais
 * l'infra Cloudflare elle-même. Pas d'action nécessaire de sa part.
 *
 * Auto-cleared dès que Cloudflare API répond 200 OK.
 */

import { safeSetHTML } from '../../core/html-safe.js';
import { logger } from '../../core/logger.js';

const STATUS_PAGE = 'https://www.cloudflarestatus.com/';
const BANNER_ID = 'apex-cloudflare-infra-banner';
const LAST_503_KEY = 'apex_v13_last_cloudflare_503_ts';
const RECENT_THRESHOLD_MS = 5 * 60 * 1000; /* 5 min */

/* Auto-guérison : pendant que le banner est affiché (Cloudflare 503), on resonde
 * périodiquement un endpoint Cloudflare (Worker /health, CORS *). Dès qu'il répond
 * 200 → Cloudflare est revenu → on efface le banner tout seul (pas d'action Kevin).
 * Le loop ne tourne QUE pendant l'incident (anti-spam : stop dès recover/hide). */
const REPROBE_MS = 45 * 1000;
const PROBE_URLS = [
  'https://apex-auth-worker.9r4rxssx64.workers.dev/health',
  'https://apex-secrets-proxy.9r4rxssx64.workers.dev/health',
];
let _reprobeTimer: ReturnType<typeof setInterval> | null = null;

let _banner: HTMLDivElement | null = null;

export function recordHttp503(): void {
  try {
    localStorage.setItem(LAST_503_KEY, String(Date.now()));
  } catch { /* quota */ }
  showBanner();
}

export function recordHttpOk(): void {
  try {
    localStorage.removeItem(LAST_503_KEY);
  } catch { /* skip */ }
  hideBanner();
}

function isRecentlyDown(): boolean {
  try {
    const last = parseInt(localStorage.getItem(LAST_503_KEY) ?? '0', 10);
    return last > 0 && Date.now() - last < RECENT_THRESHOLD_MS;
  } catch {
    return false;
  }
}

/** Resonde Cloudflare (Worker /health). Si 200 → CF revenu → efface le banner. */
async function probeCloudflare(): Promise<boolean> {
  for (const url of PROBE_URLS) {
    try {
      const r = await fetch(url, { method: 'GET', cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (r.ok) { recordHttpOk(); return true; }
    } catch { /* toujours down → essaie l'URL suivante */ }
  }
  return false;
}

function startReprobe(): void {
  if (_reprobeTimer !== null || typeof setInterval === 'undefined') return;
  _reprobeTimer = setInterval(() => { void probeCloudflare(); }, REPROBE_MS);
}

function stopReprobe(): void {
  if (_reprobeTimer !== null) { clearInterval(_reprobeTimer); _reprobeTimer = null; }
}

function showBanner(): void {
  if (_banner || typeof document === 'undefined') return;
  _banner = document.createElement('div');
  _banner.id = BANNER_ID;
  _banner.setAttribute('role', 'status');
  _banner.setAttribute('aria-live', 'polite');
  /* Discret : fine pastille collée en haut, une seule ligne, semi-transparente —
   * ne recouvre pas le contenu central (Kevin "plus discret, pas en plein milieu"). */
  _banner.style.cssText = [
    'position:fixed',
    'top:max(6px,env(safe-area-inset-top,6px))',
    'left:50%',
    'transform:translateX(-50%)',
    'z-index:2147483640',
    'max-width:min(86vw,340px)',
    'padding:4px 8px 4px 10px',
    'display:flex',
    'align-items:center',
    'gap:8px',
    'background:rgba(247,131,34,0.82)',
    'color:#1a1200',
    'border-radius:999px',
    'font-size:11px',
    'font-weight:600',
    'line-height:1.2',
    'box-shadow:0 2px 8px rgba(0,0,0,0.22)',
    'backdrop-filter:blur(6px)',
    '-webkit-backdrop-filter:blur(6px)',
    'cursor:pointer',
    'opacity:0.92',
    'animation:ax-banner-slide-in 200ms ease-out',
  ].join(';');
  safeSetHTML(_banner, `
    <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">☁️ Cloudflare ralenti · pas ta clé</span>
    <button type="button" aria-label="Fermer" style="background:rgba(0,0,0,0.18);border:none;color:#1a1200;width:18px;height:18px;border-radius:50%;cursor:pointer;font-size:12px;line-height:1;flex-shrink:0;padding:0">×</button>
  `);
  document.body.appendChild(_banner);
  startReprobe(); /* auto-guérison : efface le banner dès que Cloudflare répond 200 */
  _banner.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.tagName === 'BUTTON') {
      hideBanner();
    } else {
      window.open(STATUS_PAGE, '_blank', 'noopener');
    }
  });
  logger.info('cloudflare-status', 'Banner shown — HTTP 503 detected');
}

function hideBanner(): void {
  stopReprobe();
  if (_banner) {
    _banner.remove();
    _banner = null;
  }
}

/** Init au boot : check si 503 récent, restore banner si besoin. */
export function init(): void {
  if (isRecentlyDown()) {
    showBanner();
  }
}

export const cloudflareStatus = {
  recordHttp503,
  recordHttpOk,
  probeCloudflare,
  init,
};
