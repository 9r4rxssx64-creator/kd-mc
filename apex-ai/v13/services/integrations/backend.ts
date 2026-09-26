/**
 * APEX v13 — Client backend Cloudflare Worker.
 *
 * Connecte Apex PWA à apex-v13-backend Worker pour fonctionnalités serveur :
 * - Idempotency atomique (vraie déduplication writes Firebase)
 * - WebAuthn server-side verify (vs client-only spoofable)
 * - Stripe webhooks (commerce public)
 * - AI judge LLM pour vraie hallucination detection
 *
 * Backend URL stockée dans `apex_v13_backend_url` localStorage.
 * Si non configurée → tous les appels retournent { ok: false, fallback: true } et
 * Apex utilise les fallbacks client-side (héuristiques moins solides mais fonctionnent).
 */

import { logger } from '../../core/logger.js';

class Backend {
  private baseUrl(): string {
    return localStorage.getItem('apex_v13_backend_url') ?? '';
  }

  isConfigured(): boolean {
    return this.baseUrl().length > 0;
  }

  private async call<T>(path: string, opts: { method?: string; body?: unknown; auth?: string } = {}): Promise<T | { fallback: true }> {
    const base = this.baseUrl();
    if (!base) return { fallback: true };
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (opts.auth) headers['Authorization'] = `Bearer ${opts.auth}`;
      const init: RequestInit = {
        method: opts.method ?? 'POST',
        headers,
        signal: AbortSignal.timeout(8000),
      };
      if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
      const res = await fetch(`${base}${path}`, init);
      if (!res.ok) {
        logger.warn('backend', `${path} returned ${res.status}`);
        return { fallback: true };
      }
      return (await res.json()) as T;
    } catch (err: unknown) {
      logger.warn('backend', `${path} failed`, { err });
      return { fallback: true };
    }
  }

  /**
   * Idempotency check serveur-side (atomic vs client localStorage).
   * @returns { skip: true } si même hash vu < 60s côté serveur
   */
  async checkIdempotency(hash: string): Promise<{ skip: boolean; fallback?: boolean }> {
    const r = await this.call<{ skip: boolean; seenAt?: number }>('/idempotency/check', { body: { hash } });
    if ('fallback' in r) return { skip: false, fallback: true };
    return { skip: r.skip };
  }

  /**
   * WebAuthn register : pousse credential public au serveur après enroll côté client.
   */
  async registerWebAuthn(uid: string, credentialId: string, publicKey: string): Promise<{ ok: boolean; fallback?: boolean }> {
    const r = await this.call<{ ok: boolean }>('/webauthn/register', {
      body: { uid, credentialId, publicKey },
    });
    if ('fallback' in r) return { ok: false, fallback: true };
    return { ok: r.ok };
  }

  /**
   * WebAuthn verify : valide assertion côté serveur (counter anti-replay).
   */
  async verifyWebAuthn(uid: string, credentialId: string, counter: number): Promise<{ verified: boolean; fallback?: boolean }> {
    const r = await this.call<{ ok: boolean; verified: boolean }>('/webauthn/verify', {
      body: { uid, credentialId, counter },
    });
    if ('fallback' in r) return { verified: false, fallback: true };
    return { verified: r.verified === true };
  }

  /**
   * Auth verify : valide token session côté serveur.
   */
  async verifyAuth(token: string): Promise<{ valid: boolean; uid?: string; isAdmin?: boolean; fallback?: boolean }> {
    const r = await this.call<{ valid: boolean; uid: string; isAdmin: boolean }>('/auth/verify', {
      method: 'GET',
      auth: token,
    });
    if ('fallback' in r) return { valid: false, fallback: true };
    return { valid: r.valid, uid: r.uid, isAdmin: r.isAdmin };
  }

  /**
   * Escalate : push event critical au serveur (vs ax_claude_todo localStorage).
   */
  async escalate(reason: string, severity: 'warn' | 'critical', context: Record<string, unknown>): Promise<{ ok: boolean; id?: string; fallback?: boolean }> {
    const r = await this.call<{ ok: boolean; id: string }>('/escalate', {
      body: { reason, severity, context },
    });
    if ('fallback' in r) return { ok: false, fallback: true };
    return { ok: r.ok, id: r.id };
  }

  /**
   * AI Judge : LLM Claude Haiku judge sémantique pour vraie hallucination check.
   * Vs heuristique Jaccard côté client.
   */
  async aiJudge(promptOriginal: string, responseA: string, responseB: string): Promise<{
    consistent: boolean | null;
    confidence?: number;
    reason?: string;
    method?: string;
    fallback?: boolean;
  }> {
    const r = await this.call<{ consistent: boolean | null; confidence: number; reason: string; method: string }>('/ai/judge', {
      body: { promptOriginal, responseA, responseB },
    });
    if ('fallback' in r) return { consistent: null, fallback: true };
    return r;
  }

  /**
   * Health check du backend.
   */
  async health(): Promise<{ ok: boolean; ver?: string }> {
    const r = await this.call<{ ok: boolean; ver: string }>('/health', { method: 'GET' });
    if ('fallback' in r) return { ok: false };
    return r;
  }
}

export const backend = new Backend();
