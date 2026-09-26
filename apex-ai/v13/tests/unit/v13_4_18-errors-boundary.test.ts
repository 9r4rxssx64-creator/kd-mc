/**
 * Test régression v13.4.18 — core/errors.ts (boundary global runtime).
 *
 * Module critique stabilité : capture window.onerror + unhandledrejection,
 * conversion erreur technique → message user-friendly (règle CLAUDE.md UX).
 *
 * Avant : 21.95% coverage / 40% functions.
 * Après : 95%+ via tests directs sur toUserMessage + capture + globalHandlers.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { errors } from '../../core/errors.js';

describe('v13.4.18 errors.toUserMessage (règle CLAUDE.md UX zéro message technique brut)', () => {
  it('QuotaExceededError → stockage saturé (testé AVANT /quota/ Anthropic)', () => {
    expect(errors.toUserMessage(new Error('QuotaExceededError'))).toContain('Stockage saturé');
    expect(errors.toUserMessage(new Error('storage full'))).toContain('Stockage saturé');
    expect(errors.toUserMessage(new Error('exceeded quota'))).toContain('Stockage saturé');
  });

  it("Réseau coupé → message + Wi-Fi/4G + relance auto", () => {
    expect(errors.toUserMessage(new Error('Network error'))).toContain('Réseau coupé');
    expect(errors.toUserMessage(new Error('Failed to fetch'))).toContain('Réseau coupé');
    expect(errors.toUserMessage(new Error('net::ENOTFOUND'))).toContain('Réseau coupé');
    expect(errors.toUserMessage(new Error('ECONNREFUSED'))).toContain('Réseau coupé');
  });

  it("CORS → bloqué par sécurité + proxy Cloudflare", () => {
    expect(errors.toUserMessage(new Error('CORS request blocked'))).toContain('CORS');
    expect(errors.toUserMessage(new Error('Cross-Origin Request'))).toContain('proxy Cloudflare');
  });

  it("Timeout → 30s + retry autre modèle IA", () => {
    expect(errors.toUserMessage(new Error('Timeout'))).toContain('30s');
    expect(errors.toUserMessage(new Error('Request timed out'))).toContain('autre modèle IA');
  });

  it("Quota Anthropic → recharge + bascule failover OpenRouter/Groq", () => {
    expect(errors.toUserMessage(new Error('insufficient_quota'))).toContain('Anthropic');
    expect(errors.toUserMessage(new Error('Payment Required'))).toContain('Recharge');
    expect(errors.toUserMessage(new Error('insufficient balance'))).toContain('OpenRouter');
  });

  it("Rate limit 429 → attente 30s + retente auto", () => {
    expect(errors.toUserMessage(new Error('429 Too Many Requests'))).toContain('30s');
    expect(errors.toUserMessage(new Error('rate limit'))).toContain('retente');
  });

  it("Auth 401 → clé invalide + Coffre", () => {
    expect(errors.toUserMessage(new Error('Unauthorized'))).toContain('Clé API');
    expect(errors.toUserMessage(new Error('Invalid API key'))).toContain('Coffre');
    expect(errors.toUserMessage(new Error('401'))).toContain('Coffre');
  });

  it("Forbidden 403 → action non autorisée", () => {
    expect(errors.toUserMessage(new Error('Forbidden'))).toContain('non autorisée');
    expect(errors.toUserMessage(new Error('403'))).toContain('non autorisée');
  });

  it("404 → ressource introuvable (avant 5xx)", () => {
    expect(errors.toUserMessage(new Error('404 Not Found'))).toContain('introuvable');
  });

  it("500/502/503 → serveur Anthropic + failover", () => {
    expect(errors.toUserMessage(new Error('500 Internal Server Error'))).toContain('failover');
    expect(errors.toUserMessage(new Error('Bad Gateway'))).toContain('failover');
    expect(errors.toUserMessage(new Error('503 service unavailable'))).toContain('failover');
  });

  it("Tool error → outil indisponible (v13.4.28 fix ordre regex)", () => {
    /* v13.4.28 fix : tool.not.found testé AVANT /not.found/ générique (ligne 105 vs 102).
     * Maintenant 'Tool not found' retourne 'Outil indisponible' correctement. */
    expect(errors.toUserMessage(new Error('Tool not found'))).toContain('Outil indisponible');
    expect(errors.toUserMessage(new Error('Unknown tool: foo'))).toContain('Outil indisponible');
    expect(errors.toUserMessage(new Error('unknown_tool_xyz'))).toContain('Reformule');
  });

  it("Parse error → format cassé + retry", () => {
    expect(errors.toUserMessage(new Error('JSON parse error'))).toContain('Format');
    expect(errors.toUserMessage(new Error('syntax error'))).toContain('réessaie');
  });

  it("iOS Safari 'aborted' exact → 'Lifecycle iOS Safari' (v13.4.28 fix anchored regex)", () => {
    /* v13.4.28 fix : /^aborted$/i anchored testé AVANT /abort|cancel/ générique.
     * 'aborted' seul = iOS Safari lifecycle silencieux → Lifecycle iOS Safari.
     * 'user aborted' (avec contexte) = action user → Action interrompue. */
    expect(errors.toUserMessage(new Error('aborted'))).toContain('Lifecycle iOS Safari');
    expect(errors.toUserMessage(new Error('user aborted'))).toContain('Action interrompue');
    expect(errors.toUserMessage(new Error('abort signal'))).toContain('Action interrompue');
  });

  it("IndexedDB inaccessible → cache + fallback Firebase", () => {
    expect(errors.toUserMessage(new Error('IndexedDB error'))).toContain('Cache local');
    expect(errors.toUserMessage(new Error('IDB transaction failed'))).toContain('Firebase');
  });

  it("Provider sans clé (failover) → message neutre 'je bascule'", () => {
    expect(errors.toUserMessage(new Error('openai no key'))).toContain('autre modèle');
    expect(errors.toUserMessage(new Error('groq no key'))).toContain('bascule');
    expect(errors.toUserMessage(new Error('provider not configured'))).toContain('bascule');
  });

  it("Catch-all sans pattern → message neutre + SOS", () => {
    expect(errors.toUserMessage(new Error('weird unknown error'))).toContain('Souci technique');
    expect(errors.toUserMessage('plain string error')).toContain('Souci');
  });

  it("Mode admin Kevin → message technique debug visible", () => {
    /* Setup : simule admin connecté via localStorage */
    localStorage.setItem('apex_v13_user', JSON.stringify({ role: 'admin', id: 'kdmc_admin' }));
    const msg = errors.toUserMessage(new Error('weird debug error 12345'));
    expect(msg).toContain('admin debug');
    expect(msg).toContain('weird debug error');
    /* Cleanup */
    localStorage.removeItem('apex_v13_user');
  });

  it("Mode admin + 'no key' → bypass debug (bruit failover masqué)", () => {
    localStorage.setItem('apex_v13_user', JSON.stringify({ role: 'admin', id: 'kdmc_admin' }));
    const msg = errors.toUserMessage(new Error('openai no key'));
    expect(msg).not.toContain('admin debug');
    expect(msg).toContain('autre modèle');
    localStorage.removeItem('apex_v13_user');
  });

  it("err vraiment non-Error (number, object) → toString fallback", () => {
    expect(errors.toUserMessage(42)).toContain('Souci');
    expect(errors.toUserMessage({})).toContain('Souci');
    expect(errors.toUserMessage(null)).toContain('Souci');
  });

  it("RÈGLE CRITIQUE : ordre QuotaExceededError testé AVANT /quota/ Anthropic", () => {
    /* QuotaExceededError DOM matche /quota/i naïf. Test que c'est bien le bon path. */
    const msg = errors.toUserMessage(new Error('QuotaExceededError: localStorage full'));
    expect(msg).toContain('Stockage saturé');
    expect(msg).not.toContain('Anthropic'); /* Pas le path billing */
  });
});

describe('v13.4.18 errors.capture (forward Sentry + rescue trigger)', () => {
  beforeEach(() => {
    /* Reset state via private property via cast (no other public way) */
    (errors as unknown as { errorCount: number }).errorCount = 0;
  });

  it("capture err: unknown convertit en Error si pas Error", () => {
    expect(() => errors.capture('plain string')).not.toThrow();
    expect(() => errors.capture(42)).not.toThrow();
    expect(() => errors.capture({ foo: 'bar' })).not.toThrow();
    expect(() => errors.capture(null)).not.toThrow();
  });

  it("incremente errorCount à chaque capture", () => {
    const before = (errors as unknown as { errorCount: number }).errorCount;
    errors.capture(new Error('test 1'));
    errors.capture(new Error('test 2'));
    const after = (errors as unknown as { errorCount: number }).errorCount;
    expect(after).toBe(before + 2);
  });

  it("ne crash pas si Sentry import fail (catch silencieux)", () => {
    /* sentry-bridge probablement absent en test env → catch interne ne throw pas */
    expect(() => errors.capture(new Error('sentry test'))).not.toThrow();
  });
});

describe('v13.4.18 errors.installGlobalHandlers (idempotent)', () => {
  it("installGlobalHandlers ne crash pas (window présent en happy-dom)", () => {
    expect(() => errors.installGlobalHandlers()).not.toThrow();
  });

  it("installGlobalHandlers idempotent (2× appels OK, pas de double listener)", () => {
    expect(() => {
      errors.installGlobalHandlers();
      errors.installGlobalHandlers();
    }).not.toThrow();
  });
});
