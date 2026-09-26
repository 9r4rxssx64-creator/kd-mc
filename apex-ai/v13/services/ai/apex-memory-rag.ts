/**
 * APEX v13.4.346 — Mémoire intelligente (RAG) via le worker kdmc-rag
 * (Workers AI embeddings + Vectorize). Kevin 2026-07-07 « fais la mémoire Apex ».
 *
 * `remember(text)` stocke un souvenir ; `recall(query)` retrouve les souvenirs
 * sémantiquement proches → injectés dans le prompt pour qu'Apex se rappelle.
 *
 * SÛRETÉ (règles CLAUDE.md) :
 * - FLAG `apex_v13_rag_enabled` : un choix EXPLICITE ('1'/'true' ou '0'/'false') gagne
 *   toujours. Sans choix explicite (v13.4.350, audit amélioration Top #1) : AUTO-ON
 *   gated sur une PREUVE /health du worker (sonde au boot via services-bootstrap,
 *   cache 6 h `apex_v13_rag_health_v1`) — mémoire active seulement si le worker
 *   répond, donc jamais de latence ajoutée quand il est KO, et jamais d'activation
 *   à l'aveugle. La sonde n'est JAMAIS lancée depuis le chemin chaud ni au chargement
 *   du module (leçon #89 : pas d'async orphelin au load).
 * - FAIL-OPEN TOTAL : toute erreur réseau/worker → remember=false, recall=[]. Apex
 *   fonctionne exactement comme aujourd'hui si le worker est absent/KO.
 * - AUTH : header x-apex-pin = SHA-256 du PIN admin (le worker le compare à son secret).
 *   Clé jamais exposée. URL = sous-domaine du COMPTE (leçon #85).
 */

import { logger } from '../../core/logger.js';

const RAG_URL = 'https://kdmc-rag.9r4rxssx64.workers.dev';
const FLAG_KEY = 'apex_v13_rag_enabled';
const HEALTH_KEY = 'apex_v13_rag_health_v1';
const HEALTH_TTL_MS = 6 * 60 * 60 * 1000; /* 6 h — même cadence que les sentinelles */

export interface RagMatch {
  id: string;
  score: number;
  text: string;
  meta?: Record<string, unknown>;
}

/** Health-check /health en cache : true seulement si le worker a RÉPONDU il y a < 6 h. */
function healthFresh(): boolean {
  try {
    const raw = localStorage.getItem(HEALTH_KEY);
    if (!raw) return false;
    const h = JSON.parse(raw) as { ok?: boolean; ts?: number };
    return h.ok === true && typeof h.ts === 'number' && Date.now() - h.ts < HEALTH_TTL_MS;
  } catch {
    return false;
  }
}

function ragEnabled(): boolean {
  try {
    const v = localStorage.getItem(FLAG_KEY);
    if (v === 'false' || v === '0') return false; /* opt-out explicite : toujours respecté */
    if (v === 'true' || v === '1') return true;   /* opt-in explicite */
    /* Pas de choix explicite → AUTO-ON si (et seulement si) le worker est prouvé vivant. */
    return healthFresh();
  } catch {
    return false;
  }
}

function setRagEnabled(on: boolean): void {
  try { localStorage.setItem(FLAG_KEY, on ? 'true' : 'false'); } catch { /* quota */ }
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function pinHeader(): Promise<string | null> {
  try {
    const { vault } = await import('../vault/vault.js');
    const pin = (await vault.readKey('ax_pin_kdmc_admin')) ?? (await vault.readKey('ax_pin'));
    if (!pin) return null;
    return await sha256Hex(pin);
  } catch {
    return null;
  }
}

async function ragFetch(path: string, body: unknown, timeoutMs = 12000): Promise<Record<string, unknown> | null> {
  const hash = await pinHeader();
  if (!hash) return null;
  try {
    const res = await fetch(`${RAG_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-apex-pin': hash },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

class ApexMemoryRag {
  isEnabled(): boolean { return ragEnabled(); }
  enable(on: boolean): void { setRagEnabled(on); }

  /**
   * v13.4.350 — Sonde /health du worker (appelée UNIQUEMENT par services-bootstrap,
   * jamais dans le chemin du prompt). Résultat en cache 6 h → sans choix explicite
   * de l'utilisateur, la mémoire s'active toute seule quand le worker est vivant.
   * Fail-open total : erreur réseau → cache {ok:false} → mémoire silencieusement OFF.
   */
  async probeHealth(): Promise<boolean> {
    try {
      const v = localStorage.getItem(FLAG_KEY);
      if (v === 'false' || v === '0') return false; /* opt-out : ne pas sonder pour rien */
      if (healthFresh()) return true;               /* déjà prouvé récemment */
      let ok = false;
      try {
        const res = await fetch(`${RAG_URL}/health`, { method: 'GET', signal: AbortSignal.timeout(4000) });
        ok = res.ok;
      } catch {
        ok = false;
      }
      try { localStorage.setItem(HEALTH_KEY, JSON.stringify({ ok, ts: Date.now() })); } catch { /* quota */ }
      if (ok) logger.info('apex-rag', 'worker vivant → mémoire long terme active');
      return ok;
    } catch {
      return false;
    }
  }

  /** Stocke un souvenir. Fail-open : renvoie false si désactivé/KO. */
  async remember(text: string, meta?: Record<string, unknown>): Promise<boolean> {
    if (!ragEnabled()) return false;
    const t = (text || '').trim();
    if (t.length < 3) return false;
    const id = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const r = await ragFetch('/upsert', { items: [{ id, text: t.slice(0, 4000), meta }] });
    const ok = !!(r && r['ok'] === true && (r['upserted'] as number) > 0);
    if (ok) logger.info('apex-rag', 'remember ok');
    return ok;
  }

  /** Retrouve les souvenirs proches. Fail-open : renvoie [] si désactivé/KO.
   *  timeoutMs court quand appelé dans le chemin du prompt (ne pas retarder le message). */
  async recall(query: string, topK = 5, timeoutMs = 12000): Promise<RagMatch[]> {
    if (!ragEnabled()) return [];
    const q = (query || '').trim();
    if (q.length < 3) return [];
    const r = await ragFetch('/query', { text: q.slice(0, 4000), topK }, timeoutMs);
    if (!r || r['ok'] !== true || !Array.isArray(r['matches'])) return [];
    return (r['matches'] as RagMatch[]).filter((m) => m && typeof m.text === 'string' && m.text.length > 0);
  }

  /**
   * Bloc de contexte prêt à injecter dans le system prompt (ou '' si rien/désactivé).
   * Ne garde que les souvenirs vraiment pertinents (score >= 0.6).
   */
  async recallBlock(query: string, topK = 5, timeoutMs = 2500): Promise<string> {
    const matches = await this.recall(query, topK, timeoutMs);
    const good = matches.filter((m) => (m.score ?? 0) >= 0.6).slice(0, topK);
    if (!good.length) return '';
    const lines = good.map((m) => `- ${m.text.slice(0, 300)}`).join('\n');
    return `Souvenirs pertinents (mémoire long terme d'Apex) :\n${lines}`;
  }
}

export const apexMemoryRag = new ApexMemoryRag();
