/**
 * v13.4.370 — Apex répond SANS clé, par les IA gratuites du domaine (Kevin 15.10 : « Apex ne fonctionne plus »).
 *
 * Mesuré le 15.10 dans un vrai Chromium (Apex v13.4.369, ouverte comme Kevin) : « Bonjour Apex… » →
 * « ⚠ Aucune clé API configurée ». Ces tests verrouillent la réparation :
 *  - sans clé dans le téléphone, la question part à apis.kd-mc.com/ai et la réponse s'affiche ;
 *  - une photo sans clé → phrase claire, aucun appel ;
 *  - la date exacte de Monaco accompagne chaque question (mesuré : « samedi » au lieu de « jeudi ») ;
 *  - question courte → type « speed » (Groq gratuit, 0,5 s mesuré) ; demande de travail → conférence ;
 *  - le jeton du domaine part (outils de Kevin) ; l'écran « tape ton code » ne recouvre plus le chat ;
 *  - l'interrupteur OFF rend l'ancien comportement.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  KDMC_AI_URL, askKdmcGateway, dateMonaco, gatewayEnabled, gatewayMode, gatewayReasonFr, isTextOnly, toGatewayMessages,
} from '../../services/ai/kdmc-gateway.js';
import { aiRouter } from '../../services/ai/ai-router.js';
import { needsProxyPinActivation } from '../../services/auth/proxy-pin-activation.js';
import { detectIntent } from '../../services/apex-tools-dispatch/utils-misc.js';

function fauxFetch(reponse: unknown, status = 200): ReturnType<typeof vi.fn> {
  return vi.fn(async () => new Response(JSON.stringify(reponse), { status, headers: { 'content-type': 'application/json' } }));
}

describe('v13.4.370 — passerelle IA du domaine', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('allumée par défaut, interrupteur OFF respecté', () => {
    expect(gatewayEnabled()).toBe(true);
    localStorage.setItem('apex_v13_passerelle', '0');
    expect(gatewayEnabled()).toBe(false);
  });

  it('question ou demande courte → rapide (speed) ; demande longue → conférence (pas de domaine imposé)', () => {
    expect(gatewayMode('Quel jour sommes-nous ?')).toEqual({ analyse: 'regex', domain: 'speed' });
    expect(gatewayMode('Rédige un message pour mon équipe')).toEqual({ analyse: 'regex', domain: 'speed' });
    expect(gatewayMode('x'.repeat(400))).toEqual({ analyse: 'regex', domain: 'speed' });
    expect(gatewayMode('x'.repeat(401))).toEqual({ analyse: 'regex' });
  });

  it('tours propres : sans system ni outils, fusionnés, commencent par Kevin, 12 au plus', () => {
    const t = toGatewayMessages([
      { role: 'assistant', content: 'Bonjour' },
      { role: 'system', content: 'ignoré' },
      { role: 'user', content: 'a' },
      { role: 'user', content: [{ type: 'text', text: 'b' }] },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'x' }] },
      { role: 'assistant', content: 'c' },
    ]);
    expect(t).toEqual([{ role: 'user', content: 'a\nb' }, { role: 'assistant', content: 'c' }]);
    const long = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'm' + i }));
    expect(toGatewayMessages(long).length).toBeLessThanOrEqual(12);
    expect(toGatewayMessages(long)[0]?.role).toBe('user');
  });

  it('texte seulement : une image ou un document reste hors passerelle', () => {
    expect(isTextOnly([{ role: 'user', content: 'salut' }])).toBe(true);
    expect(isTextOnly([{ role: 'user', content: [{ type: 'text', text: 'vois' }, { type: 'image', source: {} }] }])).toBe(false);
  });

  it('envoie la date de Monaco, le jeton du domaine et le mode ; rend le texte', async () => {
    localStorage.setItem('kdmc_sso_token', 'jeton.signe');
    const f = fauxFetch({ ok: true, provider: 'groq', model: 'openai/gpt-oss-120b', text: 'Nous sommes jeudi.' });
    const r = await askKdmcGateway([{ role: 'user', content: 'Quel jour ?' }], 'Tu es Apex.', { fetchImpl: f as unknown as typeof fetch });
    expect(r).toMatchObject({ ok: true, text: 'Nous sommes jeudi.', provider: 'groq' });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(KDMC_AI_URL);
    const h = init.headers as Record<string, string>;
    expect(h['x-kdmc-sso']).toBe('jeton.signe');
    expect(init.credentials).toBe('include'); /* le cookie du domaine voyage : la passerelle ne répond qu'à un compte ouvert (15.10) */
    const body = JSON.parse(String(init.body)) as { system: string; domain?: string; analyse: string; messages: unknown[] };
    expect(body.system.startsWith('Nous sommes le ' + dateMonaco().slice(0, 6))).toBe(true);
    expect(body.system).toContain('Tu es Apex.');
    expect(body).toMatchObject({ analyse: 'regex', domain: 'speed', messages: [{ role: 'user', content: 'Quel jour ?' }] });
  });

  it('la date de Monaco porte le bon jour de la semaine (15.10.2026 = jeudi)', () => {
    expect(dateMonaco(new Date('2026-10-15T07:30:00Z'))).toMatch(/^jeudi 15 octobre 2026/);
  });

  it('échecs : 429 → « attends une minute », réseau → raison, jamais d\'exception', async () => {
    const r429 = await askKdmcGateway([{ role: 'user', content: 'x' }], '', { fetchImpl: fauxFetch({ ok: false }, 429) as unknown as typeof fetch });
    expect(r429.ok).toBe(false);
    if (!r429.ok) expect(gatewayReasonFr(r429)).toMatch(/minute/);
    const rNet = await askKdmcGateway([{ role: 'user', content: 'x' }], '', { fetchImpl: (async () => { throw new Error('net'); }) as unknown as typeof fetch });
    expect(rNet).toMatchObject({ ok: false, reason: 'reseau' });
    const rVide = await askKdmcGateway([{ role: 'user', content: 'x' }], '', { fetchImpl: fauxFetch({ ok: true, text: '  ' }) as unknown as typeof fetch });
    expect(rVide.ok).toBe(false);
  });

  it('aiRouter.stream SANS clé : la passerelle répond, le texte s\'affiche, aucune erreur', async () => {
    const f = fauxFetch({ ok: true, provider: 'groq', text: 'Bonjour Kevin !' });
    vi.stubGlobal('fetch', f);
    const chunks: string[] = [];
    const errs: string[] = [];
    let fini = false;
    await aiRouter.stream([{ role: 'user', content: 'Bonjour Apex' }], 'Tu es Apex.', (c) => { if (c.text) chunks.push(c.text); if (c.done) fini = true; }, (e) => errs.push(e.message));
    expect(errs).toEqual([]);
    expect(chunks.join('')).toBe('Bonjour Kevin !');
    expect(fini).toBe(true);
    expect(f.mock.calls.some((c) => c[0] === KDMC_AI_URL)).toBe(true);
  });

  it('aiRouter.stream SANS clé avec une photo : phrase claire, aucun appel', async () => {
    const f = fauxFetch({ ok: true, text: 'non' });
    vi.stubGlobal('fetch', f);
    const errs: string[] = [];
    await aiRouter.stream([{ role: 'user', content: [{ type: 'text', text: 'vois' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AA' } }] as never }], 'Tu es Apex.', () => {}, (e) => errs.push(e.message));
    expect(errs[0]).toMatch(/photo/);
    expect(f.mock.calls.some((c) => c[0] === KDMC_AI_URL)).toBe(false);
  });

  it('interrupteur OFF : retour à l\'ancien « Aucune clé API », aucun appel à la passerelle', async () => {
    localStorage.setItem('apex_v13_passerelle', '0');
    const f = fauxFetch({ ok: true, text: 'x' });
    vi.stubGlobal('fetch', f);
    const errs: string[] = [];
    await aiRouter.stream([{ role: 'user', content: 'Bonjour' }], '', () => {}, (e) => errs.push(e.message));
    expect(errs[0]).toMatch(/Aucune clé API/);
    expect(f).not.toHaveBeenCalled();
  });

  it('l\'écran « tape ton code » ne recouvre plus le chat quand la passerelle marche', () => {
    localStorage.setItem('apex_v13_uid', 'kdmc_admin');
    localStorage.setItem('apex_v13_use_secrets_proxy', 'true');
    expect(needsProxyPinActivation()).toBe(false);
    localStorage.setItem('apex_v13_passerelle', '0');
    expect(needsProxyPinActivation()).toBe(true);
  });

  it('la politique de sécurité de la page autorise la passerelle (sinon le navigateur bloque l\'appel)', () => {
    const html = readFileSync('index.html', 'utf8');
    const csp = html.slice(html.indexOf('connect-src'), html.indexOf(';', html.indexOf('connect-src')));
    expect(csp).toContain('https://apis.kd-mc.com');
  });

  it('clés présentes mais toutes en panne (401) : dernier recours, la passerelle répond', async () => {
    localStorage.setItem('ax_groq_key', 'gsk_cle_expiree_0000000000000000');
    const f = vi.fn(async (url: string) => (String(url) === KDMC_AI_URL
      ? new Response(JSON.stringify({ ok: true, provider: 'cerebras', text: 'Relais gratuit OK' }), { status: 200, headers: { 'content-type': 'application/json' } })
      : new Response(JSON.stringify({ error: { message: 'invalid api key' } }), { status: 401, headers: { 'content-type': 'application/json' } })));
    vi.stubGlobal('fetch', f);
    const chunks: string[] = [];
    await aiRouter.stream([{ role: 'user', content: 'Bonjour' }], 'Tu es Apex.', (c) => { if (c.text) chunks.push(c.text); }, () => {});
    expect(chunks.join('')).toContain('Relais gratuit OK');
    expect(f.mock.calls.some((c) => String(c[0]) !== KDMC_AI_URL)).toBe(true); /* la cascade à clés a bien été essayée d'abord */
  });

  it('détection d\'intention en mots entiers : plus de faux outils (mesuré : « prévenir » ouvrait Finances)', () => {
    expect(detectIntent('Rédige un court message pour prévenir mon équipe que la réunion de lundi est décalée à 15h.').intent).not.toBe('finance_calc');
    expect(detectIntent('Mon emploi du temps de la semaine').intent).not.toBe('legal_kb');
    expect(detectIntent('Montre-moi le planning de demain').intent).not.toBe('studio_archi');
    expect(detectIntent('La machine à café est en panne').intent).not.toBe('greeting');
    expect(detectIntent('Une méthode de travail efficace').intent).not.toBe('crypto_price');
    expect(detectIntent('Avant le travail, réveille-moi').intent).not.toBe('open_url');
    /* les vrais mots marchent toujours */
    expect(detectIntent('calcul impôt').intent).toBe('finance_calc');
    expect(detectIntent('Quelle est la météo à Monaco ?').intent).toBe('weather');
    expect(detectIntent('Les actualités du jour').intent).toBe('news');
    expect(detectIntent('rappelle-toi de mon rendez-vous').intent).toBe('calendar');
  });
});
