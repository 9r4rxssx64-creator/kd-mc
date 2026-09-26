/**
 * ai-boot-heal.ts — v13.4.342 (Kevin « fais tout toi auto avec Apex »).
 *
 * APEX RÉPARE SON IA TOUT SEUL AU DÉMARRAGE — zéro geste de Kevin :
 * 1. ATTEND que le vault soit prêt (lecture du PIN, retries) — tue la course au
 *    boot qui faisait échouer le 1er appel anthropic (cause racine v341).
 * 2. PING RÉEL anthropic via le proxy (max_tokens=1, ~0,0001€) :
 *    - 200 → efface les marques DEAD + le dernier échec → le prochain message
 *      part sur Anthropic (premium) au lieu d'openai.
 *    - échec → capture le status+message EXACT dans last-ai-fail (visible au
 *      Diagnostic Coffre 🧨 ET dans le rapport d'audit que Kevin partage).
 * 3. Résultat persisté dans `apex_v13_boot_heal` (lu par le rapport d'audit).
 *
 * Fail-open ABSOLU : jamais d'exception propagée, jamais de blocage du boot
 * (tourne en différé ~2,5 s après le boot). Admin + flag proxy ON uniquement.
 */
import { logger } from '../../core/logger.js';

const PROXY_FLAG_KEY = 'apex_v13_use_secrets_proxy';
const RESULT_KEY = 'apex_v13_boot_heal';
const WORKER_BASE = 'https://apex-secrets-proxy.9r4rxssx64.workers.dev';

export interface BootHealResult {
  ts: number;
  ok: boolean;
  step: string;
  detail: string;
  latency_ms?: number;
}

function persist(r: BootHealResult): void {
  try { localStorage.setItem(RESULT_KEY, JSON.stringify(r)); } catch { /* ignore */ }
}

export function getBootHealResult(): BootHealResult | null {
  try {
    const raw = localStorage.getItem(RESULT_KEY);
    return raw ? (JSON.parse(raw) as BootHealResult) : null;
  } catch {
    return null;
  }
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Attend que le PIN soit lisible dans le vault (course au boot). */
async function waitPinReady(maxTries = 10, delayMs = 300): Promise<string | null> {
  for (let i = 0; i < maxTries; i += 1) {
    try {
      const { vault } = await import('../vault/vault.js');
      const pin = (await vault.readKey('ax_pin_kdmc_admin')) ?? (await vault.readKey('ax_pin'));
      if (pin) return pin;
    } catch { /* vault pas prêt */ }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

/** Auto-test + auto-réparation. Appelé en différé au boot (admin uniquement). */
export async function runBootHeal(): Promise<BootHealResult> {
  const t0 = Date.now();
  const done = (ok: boolean, step: string, detail: string): BootHealResult => {
    const r: BootHealResult = { ts: Date.now(), ok, step, detail, latency_ms: Date.now() - t0 };
    persist(r);
    logger.info('ai-boot-heal', `${ok ? '✅' : '🧨'} ${step} — ${detail}`);
    return r;
  };
  try {
    /* Admin uniquement (le ping consomme ~0,0001€ sur la clé serveur) */
    let uid = '';
    try { uid = localStorage.getItem('apex_v13_uid') ?? ''; } catch { /* ignore */ }
    if (uid !== 'kdmc_admin') return done(true, 'skip', 'non-admin (rien à faire)');

    const flag = localStorage.getItem(PROXY_FLAG_KEY);
    if (flag !== 'true' && flag !== '1') return done(true, 'skip', 'proxy désactivé (clé locale attendue)');

    /* 1. Vault prêt ? (cause racine v341 : PIN illisible au 1er message) */
    const pin = await waitPinReady();
    if (!pin) {
      return done(false, 'vault', 'PIN illisible après 3s — reconnecte-toi (Déco puis code) pour réactiver le proxy IA');
    }

    /* 2. Ping RÉEL anthropic via le proxy (le chemin exact du chat) */
    const pinHash = await sha256Hex(pin);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    let status = 0;
    let body = '';
    try {
      const res = await fetch(`${WORKER_BASE}/anthropic/v1/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-apex-pin': pinHash },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001', /* le moins cher pour un ping */
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        }),
        signal: ctrl.signal,
      });
      status = res.status;
      if (!res.ok) body = (await res.text().catch(() => '')).slice(0, 300);
    } catch (e) {
      body = String((e as Error)?.message ?? e).slice(0, 300);
    } finally {
      clearTimeout(timer);
    }

    if (status === 200) {
      /* 3. SUCCÈS → auto-réparation : DEAD effacés + dernier échec purgé */
      try {
        const { aiKeyRotation } = await import('./ai-key-rotation.js');
        aiKeyRotation.clearAllDead();
      } catch { /* ignore */ }
      try {
        const { clearLastAiFail } = await import('./last-ai-fail.js');
        clearLastAiFail('anthropic');
      } catch { /* ignore */ }
      return done(true, 'ping', `anthropic 200 via proxy (${Date.now() - t0}ms) — DEAD effacés, Claude prêt`);
    }

    /* ÉCHEC → capture EXACTE (Diagnostic 🧨 + rapport d'audit) */
    try {
      const { recordLastAiFail } = await import('./last-ai-fail.js');
      recordLastAiFail('anthropic', `boot-heal ping: ${body || 'sans corps'}`, status || undefined);
    } catch { /* ignore */ }
    return done(false, 'ping', `anthropic HTTP ${status || 'network'} — ${body || 'pas de réponse'}`);
  } catch (e) {
    return done(false, 'exception', String((e as Error)?.message ?? e).slice(0, 200));
  }
}

/** Wire boot : différé pour ne pas ralentir le démarrage. Idempotent. */
let scheduled = false;
export function initAiBootHeal(): void {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => { void runBootHeal(); }, 2_500);
}
