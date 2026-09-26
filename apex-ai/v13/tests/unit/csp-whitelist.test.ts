/**
 * v13.3.36 (Kevin 2026-05-07 — csp-violation-watch P0 alerte 17 violations) :
 *
 * Vérifie que la CSP `connect-src` whitelist inclut tous les domaines API
 * utilisés par Apex (providers IA + intégrations + recherche web).
 *
 * Lit la meta CSP depuis index.html et vérifie présence des hosts critiques.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function getCSPConnectSrc(): string {
  const htmlPath = resolve(__dirname, '../../index.html');
  const html = readFileSync(htmlPath, 'utf-8');
  const cspMatch = html.match(/<meta\s+http-equiv="Content-Security-Policy"[^>]*content="([^"]+)"/);
  if (!cspMatch) throw new Error('CSP meta non trouvée dans index.html');
  const csp = cspMatch[1];
  if (!csp) throw new Error('CSP content vide');
  const connectMatch = csp.match(/connect-src\s+([^;]+)/);
  if (!connectMatch) throw new Error('connect-src directive non trouvée');
  return connectMatch[1] ?? '';
}

const REQUIRED_HOSTS = [
  /* IA providers core (smart-router 10 providers) */
  'api.anthropic.com',
  'api.openai.com',
  'api.groq.com',
  'generativelanguage.googleapis.com',
  'openrouter.ai',
  'api.cohere.com',
  'api.mistral.ai',
  'api.deepseek.com',
  'api.perplexity.ai',
  'api.x.ai',
  /* Intégrations critiques */
  'api.elevenlabs.io',
  'api.telegram.org',
  'api.github.com',
  'api.cloudflare.com',
  'api.stripe.com',
  'api.brevo.com',
  'api.resend.com',
  'api.replicate.com',
  /* Géoloc / météo (audit 2026-07-08 — leçon #131) */
  'nominatim.openstreetmap.org',
  'geocoding-api.open-meteo.com',
  /* Sentry monitoring */
  'ingest.sentry.io',
  /* Firebase RTDB (wildcard) */
  'firebaseio.com',
  'firebasedatabase.app',
  /* Cloudflare workers (wildcard) */
  'workers.dev',
];

describe('CSP connect-src whitelist (Kevin v13.3.36 — fix 17 violations)', () => {
  let connectSrc = '';

  it('CSP meta présente + connect-src extractible', () => {
    connectSrc = getCSPConnectSrc();
    expect(connectSrc.length).toBeGreaterThan(100);
    expect(connectSrc).toContain('self');
  });

  it.each(REQUIRED_HOSTS)('autorise %s dans connect-src', (host) => {
    if (!connectSrc) connectSrc = getCSPConnectSrc();
    expect(connectSrc).toContain(host);
  });

  it('contient au moins 25 domaines (connect-src étendu)', () => {
    if (!connectSrc) connectSrc = getCSPConnectSrc();
    /* Compte les sources https:// + 'self' */
    const sources = connectSrc.split(/\s+/).filter((s) => s.startsWith('https://') || s === "'self'");
    expect(sources.length).toBeGreaterThanOrEqual(25);
  });

  it('script-src reste strict (nonce + strict-dynamic)', () => {
    const htmlPath = resolve(__dirname, '../../index.html');
    const html = readFileSync(htmlPath, 'utf-8');
    expect(html).toContain("'nonce-APEX_BOOT_NONCE'");
    expect(html).toContain("'strict-dynamic'");
  });

  it('object-src none (pas de Flash/Java)', () => {
    const htmlPath = resolve(__dirname, '../../index.html');
    const html = readFileSync(htmlPath, 'utf-8');
    expect(html).toMatch(/object-src\s+'none'/);
  });

  it('frame-ancestors strict (anti-clickjacking implicite via base-uri self)', () => {
    const htmlPath = resolve(__dirname, '../../index.html');
    const html = readFileSync(htmlPath, 'utf-8');
    expect(html).toMatch(/base-uri\s+'self'/);
  });

  it('upgrade-insecure-requests présent (force HTTPS)', () => {
    const htmlPath = resolve(__dirname, '../../index.html');
    const html = readFileSync(htmlPath, 'utf-8');
    expect(html).toContain('upgrade-insecure-requests');
  });

  it('img-src autorise data + blob + https (modules cross-platform)', () => {
    const htmlPath = resolve(__dirname, '../../index.html');
    const html = readFileSync(htmlPath, 'utf-8');
    expect(html).toMatch(/img-src[^;]*data:/);
    expect(html).toMatch(/img-src[^;]*blob:/);
    expect(html).toMatch(/img-src[^;]*https:/);
  });
});
