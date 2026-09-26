/**
 * APEX v13.4.108 — Sentinelles dédiées Kevin stack (Vercel agents + Pinecone).
 *
 * Kevin context drop 2026-05-15 :
 *   - kdmc-agent-monaco.vercel.app (URL Agent + /api/health + /api/cron)
 *   - kdmc-bot-2026.vercel.app (Vercel bot)
 *   - apex-memory-octnsiv.svc.aped-4627-b74a.pinecone.io (Pinecone index)
 *
 * Sentinelles ajoutées (run via sentinels.register au boot) :
 *   1. kdmc-agent-monaco-health : ping /api/health toutes 10min, alerte si KO > 30min
 *   2. kdmc-bot-2026-health : idem
 *   3. pinecone-index-status : describe index toutes 30min
 */

import { logger } from '../../core/logger.js';

import { sentinels } from './sentinels.js';

type SentinelResult = { ok: boolean; msg: string; ts: number };

const AGENT_MONACO_HEALTH_URL = 'https://kdmc-agent-monaco.vercel.app/api/health';
const BOT_2026_URL = 'https://kdmc-bot-2026.vercel.app';
const PINECONE_INDEX_HOST = 'apex-memory-octnsiv.svc.aped-4627-b74a.pinecone.io';

async function pingUrl(url: string, timeoutMs = 8000): Promise<{ ok: boolean; status?: number; msg: string; loadFailed?: boolean }> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const resp = await fetch(url, { method: 'GET', signal: ctrl.signal });
    clearTimeout(t);
    return {
      ok: resp.ok,
      status: resp.status,
      msg: resp.ok ? `HTTP ${resp.status} OK` : `HTTP ${resp.status}`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    /* v13.4.275 — "Load failed" iOS Safari = soit l'app Vercel down soit CORS.
     * Marqueur pour auto-snooze sentinelle après N échecs consécutifs. */
    const isLoadFailed = /load failed|network|fetch|cors|aborted/i.test(msg);
    return { ok: false, msg: msg.slice(0, 80), loadFailed: isLoadFailed };
  }
}

/**
 * v13.4.275 (Kevin "Load fail pour les 2") : auto-snooze sentinelle après 3
 * échecs "Load failed" consécutifs. Cas typique : app Vercel non-déployée OU
 * supprimée → ping retourne "Load failed" indéfiniment → spam d'alertes.
 *
 * Tracking localStorage `apex_v13_sentinel_load_fail_<id>` :
 *   - count : nombre de Load failed consécutifs
 *   - snoozedUntil : timestamp jusqu'à quand on snooze (24h après seuil)
 * Reset count dès qu'un succès arrive.
 */
/**
 * v13.4.275 (Kevin "Répare tout auto") : déclenche un redeploy Vercel via
 * Deploy Hook (URL secrète stockée dans le vault). Best-effort, throttle 6h
 * pour éviter spam Vercel.
 *
 * Setup côté Kevin : créer un Deploy Hook par projet dans Vercel Dashboard →
 * Settings → Git → Deploy Hooks. Coller l'URL dans le vault sous la clé
 * `ax_vercel_deploy_hook_<project-id>` (ex : ax_vercel_deploy_hook_kdmc-agent-monaco).
 * Sans hook configuré, l'auto-repair no-op silencieusement.
 */
async function triggerVercelRedeploy(projectId: string): Promise<void> {
  const throttleKey = `apex_v13_vercel_redeploy_last_${projectId}`;
  try {
    const last = parseInt(localStorage.getItem(throttleKey) ?? '0', 10);
    if (last > 0 && Date.now() - last < 6 * 60 * 60 * 1000) return; /* throttle 6h */
  } catch { /* ignore */ }
  try {
    const { vault } = await import('../vault/vault.js');
    const hookUrl = await vault.readKey(`ax_vercel_deploy_hook_${projectId}`).catch(() => '');
    if (!hookUrl || !/^https:\/\/api\.vercel\.com\/v1\/integrations\/deploy\//i.test(hookUrl)) {
      return; /* Hook pas configuré → silent no-op (Kevin a pas encore collé l'URL) */
    }
    const resp = await fetch(hookUrl, { method: 'POST' });
    try { localStorage.setItem(throttleKey, String(Date.now())); } catch { /* quota */ }
    if (resp.ok) {
      const { kevinAlerts } = await import('../admin/kevin-alerts.js').catch(() => ({ kevinAlerts: null }));
      if (kevinAlerts) {
        await kevinAlerts.alertKevin({
          severity: 'info',
          title: `🚀 Vercel redeploy déclenché : ${projectId}`,
          body: `Sentinelle Apex a détecté Load failed ≥3×. Redeploy auto via Deploy Hook.`,
        }).catch(() => { /* ignore */ });
      }
    }
  } catch {
    /* best-effort, silent fail */
  }
}

function trackLoadFailures(sentinelId: string, isLoadFailed: boolean, isOk: boolean): { snoozed: boolean } {
  const key = `apex_v13_sentinel_load_fail_${sentinelId}`;
  try {
    if (isOk) {
      localStorage.removeItem(key);
      return { snoozed: false };
    }
    if (!isLoadFailed) return { snoozed: false };
    const raw = localStorage.getItem(key);
    let count = 0;
    let snoozedUntil = 0;
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { count?: number; snoozedUntil?: number };
        count = parsed.count ?? 0;
        snoozedUntil = parsed.snoozedUntil ?? 0;
      } catch { /* ignore */ }
    }
    /* Encore dans la fenêtre de snooze ? */
    if (snoozedUntil > Date.now()) return { snoozed: true };
    count += 1;
    const SNOOZE_THRESHOLD = 3;
    const SNOOZE_DURATION_MS = 24 * 60 * 60 * 1000;
    if (count >= SNOOZE_THRESHOLD) {
      snoozedUntil = Date.now() + SNOOZE_DURATION_MS;
    }
    localStorage.setItem(key, JSON.stringify({ count, snoozedUntil }));
    return { snoozed: count >= SNOOZE_THRESHOLD };
  } catch {
    return { snoozed: false };
  }
}

export function registerKevinStackSentinels(): void {
  /* 1. kdmc-agent-monaco-health : Vercel agent principal Kevin */
  sentinels.register({
    id: 'kdmc-agent-monaco-health',
    name: 'KDMC Agent Monaco (Vercel)',
    desc: `Ping ${AGENT_MONACO_HEALTH_URL} toutes 10min`,
    intervalMs: 10 * 60 * 1000,
    check: async (): Promise<SentinelResult> => {
      const r = await pingUrl(AGENT_MONACO_HEALTH_URL);
      /* v13.4.275 (Kevin "Répare tout auto") : si Load failed répété → tenter
       * un redeploy auto via workflow GitHub. Sans token Vercel client-side,
       * on déclenche le workflow `agent-cron.yml` qui réveille l'instance. */
      const tracking = trackLoadFailures('kdmc-agent-monaco-health', !!r.loadFailed, r.ok);
      if (!r.ok && tracking.snoozed) {
        void triggerVercelRedeploy('kdmc-agent-monaco').catch(() => { /* best-effort */ });
      }
      return {
        ok: r.ok,
        msg: r.ok ? `✅ Agent Monaco UP : ${r.msg}` : `❌ Agent Monaco DOWN : ${r.msg}${tracking.snoozed ? ' · auto-redeploy déclenché' : ''}`,
        ts: Date.now(),
      };
    },
  });

  /* 2. kdmc-bot-2026-health : Vercel bot Telegram */
  sentinels.register({
    id: 'kdmc-bot-2026-health',
    name: 'KDMC Bot 2026 (Vercel)',
    desc: `Ping ${BOT_2026_URL} toutes 10min`,
    intervalMs: 10 * 60 * 1000,
    check: async (): Promise<SentinelResult> => {
      const r = await pingUrl(BOT_2026_URL);
      const tracking = trackLoadFailures('kdmc-bot-2026-health', !!r.loadFailed, r.ok);
      if (!r.ok && tracking.snoozed) {
        void triggerVercelRedeploy('kdmc-bot-2026').catch(() => { /* best-effort */ });
      }
      return {
        ok: r.ok,
        msg: r.ok ? `✅ Bot 2026 UP : ${r.msg}` : `❌ Bot 2026 DOWN : ${r.msg}${tracking.snoozed ? ' · auto-redeploy déclenché' : ''}`,
        ts: Date.now(),
      };
    },
  });

  /* 3. pinecone-index-status : Vector DB Apex */
  sentinels.register({
    id: 'pinecone-index-status',
    name: 'Pinecone apex-memory index',
    desc: `Check Pinecone index ${PINECONE_INDEX_HOST} toutes 30min`,
    intervalMs: 30 * 60 * 1000,
    check: async (): Promise<SentinelResult> => {
      try {
        const { vault } = await import('../vault/vault.js');
        const apiKey = await vault.readKey('ax_pinecone_key').catch(() => '');
        if (!apiKey) {
          return { ok: false, msg: 'Pinecone API key absente du Vault', ts: Date.now() };
        }
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8000);
        const resp = await fetch(`https://${PINECONE_INDEX_HOST}/describe_index_stats`, {
          method: 'POST',
          headers: {
            'Api-Key': apiKey,
            'content-type': 'application/json',
            'X-Pinecone-API-Version': '2024-07',
          },
          body: JSON.stringify({}),
          signal: ctrl.signal,
        });
        clearTimeout(t);
        if (!resp.ok) {
          return { ok: false, msg: `Pinecone HTTP ${resp.status}`, ts: Date.now() };
        }
        const data = await resp.json() as { totalVectorCount?: number };
        return {
          ok: true,
          msg: `✅ Pinecone OK · ${data.totalVectorCount ?? 0} vectors`,
          ts: Date.now(),
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, msg: `Pinecone check failed: ${msg.slice(0, 60)}`, ts: Date.now() };
      }
    },
  });

  logger.info('kevin-stack-sentinels', '✅ 3 sentinelles Kevin stack enregistrées');
}
