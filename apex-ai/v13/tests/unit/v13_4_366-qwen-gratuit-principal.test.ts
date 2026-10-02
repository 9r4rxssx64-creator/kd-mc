/**
 * APEX v13.4.366 — Qwen GRATUIT en IA principale + bascule auto par question
 * (Kevin 2026-09-05 : « Fait tourner Apex sur Qwen l'IA gratuite, privilégie les IA
 * gratuites en tâche principale pour l'instant, et suivant les questions elle bascule
 * automatiquement sur la plus polyvalente, la plus pertinente pour la tâche demandée »).
 *
 * ── Ce que ces tests verrouillent ───────────────────────────────────────────
 * 1. La POLITIQUE : par défaut (admin, proxy actif), les questions courantes vont à
 *    Qwen ; code / raisonnement / admin / créatif → Anthropic ; vision → Gemini ;
 *    recherche → Perplexity ; vitesse → Groq. Qwen/Anthropic restent en secours.
 * 2. Le CÂBLAGE (déclaré ≠ déployé, #28) : qwen existe dans le routeur (config +
 *    chaîne + liste « supported » du mapping policy→routeur + reconnaissance du proxy
 *    natif), dans le client proxy, dans le crew, dans le libellé du bouton ⚡.
 * 3. Le WORKER (source dans le workflow de déploiement) : binding Workers AI, route
 *    /qwen, /health qui annonce qwen, modèle Qwen 3.8 en tête.
 * 4. Une DEMANDE D'ACTION (« lance l'audit ») reste sur Anthropic (seul provider à
 *    outils) — sinon Qwen répondrait du texte au lieu d'agir.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, it, expect, beforeEach } from 'vitest';

import { aiRoutingPolicy } from '../../services/ai/ai-routing-policy.js';
import { PROXY_PROVIDERS } from '../../services/integrations/apex-secrets-proxy-client.js';

function readSource(relPath: string): string {
  for (const base of ['.', 'apex-ai/v13', '../..', '../../..']) {
    const p = resolve(process.cwd(), base, relPath);
    if (existsSync(p)) return readFileSync(p, 'utf8');
  }
  throw new Error(`Source introuvable : ${relPath} (cwd=${process.cwd()})`);
}

const FREE = ['qwen', 'groq', 'gemini', 'openrouter'];

describe('v13.4.366 — politique : Qwen gratuit en principal, bascule auto par question', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('apex_v13_uid', 'kdmc_admin'); /* proxy actif par défaut */
  });

  it('défaut admin = free-smart (inchangé) et la question COURANTE part sur QWEN', () => {
    expect(aiRoutingPolicy.getMode()).toBe('free-smart');
    const d = aiRoutingPolicy.decide('general');
    expect(d.primary).toBe('qwen');
    expect(d.is_free_tier).toBe(true);
    expect(d.estimated_cost_eur).toBe(0);
    /* Anthropic reste joignable en secours → jamais bloqué */
    expect(d.fallback_chain).toContain('anthropic');
  });

  it('résumé / traduction → Qwen ; vitesse → Groq (plus rapide), Qwen juste derrière', () => {
    expect(aiRoutingPolicy.decide('summary').primary).toBe('qwen');
    expect(aiRoutingPolicy.decide('translation').primary).toBe('qwen');
    const speed = aiRoutingPolicy.decide('speed');
    expect(speed.primary).toBe('groq');
    expect(speed.fallback_chain[0]).toBe('qwen');
  });

  it('BASCULE AUTO : code / raisonnement / admin / créatif → Anthropic (la plus polyvalente), Qwen en secours gratuit', () => {
    for (const dom of ['code', 'reasoning', 'admin', 'creative'] as const) {
      const d = aiRoutingPolicy.decide(dom);
      expect(d.primary).toBe('anthropic');
      expect(d.fallback_chain).toContain('qwen');
    }
  });

  it('BASCULE AUTO : vision → Gemini, recherche → Perplexity, très long contexte → Gemini', () => {
    expect(aiRoutingPolicy.decide('vision').primary).toBe('gemini');
    expect(aiRoutingPolicy.decide('search').primary).toBe('perplexity');
    expect(aiRoutingPolicy.decide('long_context').primary).toBe('gemini');
    /* Qwen (texte seul sur Workers AI) n'est JAMAIS proposé pour une image */
    const v = aiRoutingPolicy.decide('vision');
    expect([v.primary, ...v.fallback_chain].indexOf('qwen')).toBeLessThan(
      [v.primary, ...v.fallback_chain].indexOf('anthropic') + 99,
    );
  });

  it('une DEMANDE D\'ACTION va sur Anthropic (outils) — pas sur Qwen', () => {
    for (const msg of ['lance l\'audit complet', 'déploie la nouvelle version', 'corrige le bug du planning', 'vérifie que tout marche']) {
      expect(aiRoutingPolicy.detectDomain(msg)).toBe('admin');
      expect(aiRoutingPolicy.decide(aiRoutingPolicy.detectDomain(msg)).primary).toBe('anthropic');
    }
    /* une QUESTION sur une action reste une question courante → Qwen */
    expect(aiRoutingPolicy.detectDomain('comment lancer un audit ?')).not.toBe('admin');
    expect(aiRoutingPolicy.decide(aiRoutingPolicy.detectDomain('bonjour, quel temps fait-il ?')).primary).toBe('qwen');
  });

  it('mode economy → Qwen (le gratuit choisi en premier) ; premium explicite (⚡) → Anthropic (leçon #124)', () => {
    aiRoutingPolicy.setMode('economy', true);
    expect(aiRoutingPolicy.decide('general').primary).toBe('qwen');
    aiRoutingPolicy.setMode('premium', true);
    expect(aiRoutingPolicy.decide('general').primary).toBe('anthropic');
  });

  it('proxy OFF → Qwen impossible (0 clé locale possible) → Anthropic reprend, pas de crash', () => {
    localStorage.setItem('apex_v13_use_secrets_proxy', 'false');
    const d = aiRoutingPolicy.decide('general');
    expect(d.primary).not.toBe('qwen');
    expect(FREE.includes(d.primary) || d.primary === 'anthropic').toBe(true);
  });

  it('l\'admin peut FORCER qwen (override reconnu)', () => {
    aiRoutingPolicy.setAdminOverride('qwen');
    expect(aiRoutingPolicy.getAdminOverride()).toBe('qwen');
    aiRoutingPolicy.setMode('forced', true);
    expect(aiRoutingPolicy.decide('code').primary).toBe('qwen');
    aiRoutingPolicy.setAdminOverride(null);
  });
});

describe('v13.4.366 — câblage réel (déclaré ≠ déployé, #28)', () => {
  it('client proxy : qwen est un provider du proxy', () => {
    expect(PROXY_PROVIDERS).toContain('qwen');
  });

  it('routeur : config qwen (endpoint = le worker, format OpenAI), dans la chaîne, dans « supported », proxy natif reconnu', () => {
    const src = readSource('services/ai/ai-router.ts');
    expect(src).toMatch(/\|\s*'qwen'\s*\|/);                                    /* type Provider */
    expect(src).toMatch(/qwen:\s*\{\s*endpoint:\s*'https:\/\/apex-secrets-proxy\.9r4rxssx64\.workers\.dev\/qwen\/v1\/chat\/completions'/);
    expect(src).toMatch(/DEFAULT_CHAIN[^\n]*=\s*\['anthropic',\s*'qwen'/);     /* gratuit juste après anthropic */
    expect(src).toMatch(/const supported: readonly Provider\[\] = \['anthropic',\s*'qwen'/); /* sinon décision policy ignorée */
    expect(src).toMatch(/nativeToWorker = u\.origin === workerBase/);         /* pas de /qwen/qwen/… */
    expect(src).toMatch(/case 'qwen':\s*\n\s*return 'qwen_cf'/);                /* coût 0 tracé */
  });

  it('crew multi-IA (v13.4.367 « concertation d\'IA gratuites ») : les voix gratuites d\'abord, Anthropic reste membre + chef d\'orchestre', async () => {
    localStorage.clear();
    const { crewExperts } = await import('../../services/ai/crew-experts.js');
    const list = crewExperts.availableProviders();
    expect(list[0]).toBe('qwen');
    expect(list).toContain('anthropic');
    expect(list.indexOf('anthropic')).toBeGreaterThan(list.indexOf('groq'));
  });

  it('bouton ⚡ : le libellé du mode par défaut dit Qwen', () => {
    const src = readSource('features/chat/chat-misc-wiring.ts');
    expect(src).toMatch(/'free-smart':\s*'[^']*Qwen[^']*'/);
  });

  it('WORKER (source dans le workflow de déploiement) : binding Workers AI + route /qwen + /health annonce qwen + Qwen 3.8 en tête', () => {
    const wf = readSource('.github/workflows/sync-apex-secrets-to-cf-worker.yml');
    expect(wf).toMatch(/\[ai\]\s*\n\s*binding = "AI"/);
    expect(wf).toMatch(/if \(provider === 'qwen'\)/);
    expect(wf).toMatch(/return handleQwen\(req, env, CORS\)/);
    expect(wf).toMatch(/if \(env\.AI\) available\.push\('qwen'\)/);
    expect(wf).toMatch(/const QWEN_MODELS = \[\s*\n\s*'@cf\/qwen\/qwen3\.8-27b'/);
    /* le déploiement PROUVE que Qwen répond (appel réel en CI, leçon #135) */
    expect(wf).toMatch(/\/qwen\/v1\/chat\/completions/);
    /* la sortie est traduite au format OpenAI que le client sait lire */
    expect(wf).toMatch(/object: 'chat\.completion\.chunk'/);
  });
});
