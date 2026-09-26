/**
 * Régression v13.4.312 — Kevin 2026-06-08 :
 * « Pas de connexion alors que tout est vert. Il me demande une clé alors qu'il a
 *  le Coffre plein (22/22 providers actifs). L'orchestration des IA devrait agir. »
 *
 * Cause : `aiRouter.hasAnyKey()` ne testait QUE les clés locales et rejetait le chat
 * (« Aucune clé API configurée ») même quand le proxy Cloudflare est activé et
 * fournit les clés côté serveur. proxy-auto-enable pose `apex_v13_use_secrets_proxy
 * = 'true'` au boot (admin Kevin + proxy healthy) → hasAnyKey() doit alors être true.
 *
 * Ce test est câblé dans la suite (test:ci) pour ne JAMAIS reproduire le blocage.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { aiRouter } from '../../services/ai/ai-router.js';

const PROXY_FLAG_KEY = 'apex_v13_use_secrets_proxy';
const LOCAL_KEYS = ['ax_anthropic_key', 'ax_openai_key', 'ax_openrouter_key', 'ax_groq_key', 'ax_google_key'];

describe('v13.4.312 — connexion via proxy sans clé locale (régression Kevin)', () => {
  beforeEach(() => {
    localStorage.clear();
    LOCAL_KEYS.forEach((k) => localStorage.removeItem(k));
  });

  it('hasAnyKey() = TRUE si proxy activé (flag true) même SANS clé locale', () => {
    expect(aiRouter.hasAnyKey()).toBe(false); /* pré-condition : aucune clé locale */
    localStorage.setItem(PROXY_FLAG_KEY, 'true');
    expect(aiRouter.hasAnyKey()).toBe(true); /* le chat ne doit PLUS se bloquer */
  });

  it('hasAnyKey() accepte aussi le flag legacy "1"', () => {
    localStorage.setItem(PROXY_FLAG_KEY, '1');
    expect(aiRouter.hasAnyKey()).toBe(true);
  });

  it('hasAnyKey() = FALSE sans clé locale ET sans proxy (back-compat, zéro régression)', () => {
    expect(aiRouter.hasAnyKey()).toBe(false);
  });

  it('hasAnyKey() = FALSE si proxy explicitement désactivé (flag "false")', () => {
    localStorage.setItem(PROXY_FLAG_KEY, 'false');
    expect(aiRouter.hasAnyKey()).toBe(false);
  });

  it('hasAnyKey() = TRUE dès qu’une clé locale existe (comportement historique intact)', () => {
    localStorage.setItem('ax_anthropic_key', 'sk-ant-api03-xxx');
    expect(aiRouter.hasAnyKey()).toBe(true);
  });
});
