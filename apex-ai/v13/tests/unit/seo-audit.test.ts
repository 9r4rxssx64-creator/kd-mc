import { describe, it, expect, vi, beforeEach } from 'vitest';

import { seoAudit } from '../../services/integrations/seo-audit.js';

/* Mock aiRouter pour éviter tout appel réseau IA pendant le test. */
vi.mock('../../services/ai/ai-router.js', () => ({
  aiRouter: { stream: vi.fn().mockResolvedValue(undefined) },
}));

const GOOD_HTML = `<!doctype html><html lang="fr"><head>
<title>Casino de Monaco — Planning des équipes en temps réel</title>
<meta name="description" content="Gérez les plannings, rotations et échanges de shifts du Casino de Monaco. Outil interne CMCteams pour 258 employés sur 36 équipes.">
<link rel="canonical" href="https://example.com/">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta property="og:title" content="CMCteams"><meta property="og:description" content="x">
<meta property="og:image" content="https://example.com/og.png"><meta property="og:url" content="https://example.com/">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"CMC"}</script>
<script type="application/ld+json">{"@type":"BreadcrumbList"}</script>
</head><body>
<h1>Planning des équipes</h1><h2>Rotations</h2><p>${'mot '.repeat(900)}</p>
<img src="a.png" alt="logo casino"><img src="b.png" alt="grille planning" loading="lazy">
<a href="/equipe">Équipe</a><a href="/departs">Départs</a><a href="/chat">Chat</a>
<a href="https://google.com">G</a>
</body></html>`;

const BAD_HTML = `<!doctype html><html><head>
<meta name="robots" content="noindex"></head><body><p>court</p>
<img src="x.png"></body></html>`;

describe('seoAudit.analyze (on-page)', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });

  it('note haut une page bien optimisée + extrait les signaux', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, status: 200, statusText: 'OK', text: async () => GOOD_HTML,
    });
    const r = await seoAudit.analyze({ url: 'https://example.com', aiSynthesis: false });
    expect(r.ok).toBe(true);
    expect(r.fetched).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(80);
    const sig = r.signals as Record<string, unknown>;
    expect(sig.h1Count).toBe(1);
    expect((sig.jsonLdTypes as string[]).length).toBeGreaterThanOrEqual(2);
    expect(sig.twitterCard).toBe(true);
    // pas de P0 sur une page saine
    expect(r.findings.filter((f) => f.severity === 'P0').length).toBe(0);
  });

  it('détecte les P0 (noindex, pas de title/H1/viewport) sur une page cassée', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, status: 200, statusText: 'OK', text: async () => BAD_HTML,
    });
    const r = await seoAudit.analyze({ url: 'example.com', aiSynthesis: false });
    const p0 = r.findings.filter((f) => f.severity === 'P0').map((f) => f.issue).join(' | ');
    expect(p0).toMatch(/noindex/i);
    expect(p0).toMatch(/title/i);
    expect(p0).toMatch(/H1/i);
    expect(r.score).toBeLessThan(55);
  });

  it('expose la cause exacte si le fetch échoue (règle DÉTAILLER LES ERREURS)', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('HTTP 403 Forbidden'));
    const r = await seoAudit.analyze({ url: 'https://blocked.example', aiSynthesis: false });
    expect(r.ok).toBe(false);
    expect(r.fetchError).toMatch(/403/);
    expect(r.findings[0]?.severity).toBe('P0');
  });

  it('rejette une URL invalide', async () => {
    const r = await seoAudit.analyze({ url: 'pas une url' });
    expect(r.ok).toBe(false);
    expect(r.grade).toBe('F');
  });
});
