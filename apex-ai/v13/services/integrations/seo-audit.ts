/**
 * APEX v13 — SEO Audit service (Kevin 2026-05-30 — parité skill claude-seo MIT).
 *
 * Donne à Apex IA la même compétence SEO que le skill Claude Code `seo`
 * (AgriciDaniel/claude-seo v2.0.0, MIT — vendored dans `.claude/skills/seo/`).
 * Analyse on-page 100% client-side (aucune clé API requise) :
 *  - Technique : title, meta description, canonical, robots, viewport, lang, hreflang
 *  - Structure : H1 unique, hiérarchie Hn, ratio texte
 *  - Schema.org : JSON-LD détecté + types
 *  - Social/GEO : Open Graph, Twitter Card, llms.txt-readiness
 *  - Images : couverture alt, lazy-loading
 *  - Liens : internes/externes, nofollow
 * Score /100 + findings priorisés P0/P1/P2 + plan d'action.
 * Synthèse E-E-A-T / GEO qualitative optionnelle via aiRouter.
 *
 * Storage : `apex_v13_seo_audit_history` (max 30).
 * Règle Kevin "DÉTAILLER LES ERREURS PARTOUT" : chaque échec fetch expose la cause exacte.
 */

import { logger } from '../../core/logger.js';
import { aiRouter } from '../ai/ai-router.js';
import { auditLog } from '../observability/audit-log.js';

const HISTORY_KEY = 'apex_v13_seo_audit_history';
const HISTORY_MAX = 30;
const PROXY_KEY = 'ax_proxy_url';

export type SeoSeverity = 'P0' | 'P1' | 'P2';
export type SeoCategory =
  | 'technical'
  | 'content'
  | 'schema'
  | 'social-geo'
  | 'images'
  | 'links';

export interface SeoFinding {
  severity: SeoSeverity;
  category: SeoCategory;
  issue: string;
  fix: string;
}

export interface SeoAuditInput {
  url: string;
  /** 'page' = analyse on-page seule (défaut), 'geo' = focus AI Overviews/citabilité */
  mode?: 'page' | 'geo';
  /** true = ajoute une synthèse E-E-A-T/GEO via IA (défaut true) */
  aiSynthesis?: boolean;
}

export interface SeoAuditOutput {
  id: string;
  url: string;
  ok: boolean;
  score: number; // 0-100
  grade: string; // A+, A, B, C, D, F
  fetched: boolean;
  fetchError?: string;
  signals: Record<string, unknown>;
  findings: SeoFinding[];
  synthesis?: string;
  generatedAt: number;
  durationMs: number;
}

interface ParsedSignals {
  title: string;
  titleLen: number;
  metaDescription: string;
  metaDescLen: number;
  canonical: string;
  robots: string;
  viewport: boolean;
  lang: string;
  h1Count: number;
  h1Text: string;
  headingOutlineOk: boolean;
  wordCount: number;
  jsonLdTypes: string[];
  ogCount: number;
  twitterCard: boolean;
  imgTotal: number;
  imgMissingAlt: number;
  imgLazy: number;
  linksInternal: number;
  linksExternal: number;
  hreflangCount: number;
}

class SeoAuditService {
  /** Lance un audit SEO on-page complet. */
  async analyze(input: SeoAuditInput): Promise<SeoAuditOutput> {
    const start = Date.now();
    const id = `seo_${start}_${Math.random().toString(36).slice(2, 7)}`;
    const mode = input.mode ?? 'page';
    const url = this.normalizeUrl(input.url);

    if (!url) {
      return this.fail(id, input.url, start, 'URL invalide ou manquante.');
    }

    let html = '';
    let fetched = false;
    let fetchError: string | undefined;
    try {
      html = await this.fetchHtml(url);
      fetched = true;
    } catch (err: unknown) {
      fetchError = err instanceof Error ? err.message : String(err);
      logger.warn('seo-audit', 'fetch failed', { url, fetchError });
    }

    const signals = fetched ? this.parse(html, url) : this.emptySignals();
    const findings = this.evaluate(signals, mode, fetched);
    const score = this.score(signals, findings, fetched);
    const grade = this.grade(score);

    let synthesis: string | undefined;
    if (fetched && (input.aiSynthesis ?? true)) {
      synthesis = await this.aiSynthesis(url, signals, findings, mode);
    }

    const out: SeoAuditOutput = {
      id,
      url,
      ok: fetched,
      score,
      grade,
      fetched,
      ...(fetchError !== undefined ? { fetchError } : {}),
      signals: signals as unknown as Record<string, unknown>,
      findings,
      ...(synthesis !== undefined ? { synthesis } : {}),
      generatedAt: start,
      durationMs: Date.now() - start,
    };

    this.persist(out);
    void auditLog.record('seo_audit', { details: { url, score, grade, findings: findings.length, mode } });
    return out;
  }

  private normalizeUrl(raw: string): string {
    const v = (raw || '').trim();
    if (!v) return '';
    if (/^https?:\/\//i.test(v)) return v;
    if (/^[\w.-]+\.[a-z]{2,}/i.test(v)) return `https://${v}`;
    return '';
  }

  /** Fetch direct, repli sur proxy trusté si CORS bloque. */
  private async fetchHtml(url: string): Promise<string> {
    const tryFetch = async (target: string): Promise<string> => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 20000);
      try {
        const r = await fetch(target, { signal: ctrl.signal, redirect: 'follow' });
        if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
        return await r.text();
      } finally {
        clearTimeout(t);
      }
    };
    try {
      return await tryFetch(url);
    } catch (errDirect: unknown) {
      const proxy = this.proxyUrl();
      if (proxy) {
        try {
          return await tryFetch(`${proxy}?url=${encodeURIComponent(url)}`);
        } catch (errProxy: unknown) {
          throw new Error(
            `direct: ${errDirect instanceof Error ? errDirect.message : String(errDirect)} | ` +
              `proxy: ${errProxy instanceof Error ? errProxy.message : String(errProxy)}`,
          );
        }
      }
      throw errDirect instanceof Error ? errDirect : new Error(String(errDirect));
    }
  }

  private proxyUrl(): string {
    try {
      return localStorage.getItem(PROXY_KEY) ?? '';
    } catch {
      return '';
    }
  }

  private emptySignals(): ParsedSignals {
    return {
      title: '', titleLen: 0, metaDescription: '', metaDescLen: 0, canonical: '',
      robots: '', viewport: false, lang: '', h1Count: 0, h1Text: '',
      headingOutlineOk: false, wordCount: 0, jsonLdTypes: [], ogCount: 0,
      twitterCard: false, imgTotal: 0, imgMissingAlt: 0, imgLazy: 0,
      linksInternal: 0, linksExternal: 0, hreflangCount: 0,
    };
  }

  private parse(html: string, url: string): ParsedSignals {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const host = (() => { try { return new URL(url).host; } catch { return ''; } })();

    const title = (doc.querySelector('title')?.textContent ?? '').trim();
    const metaDescription = (
      doc.querySelector('meta[name="description"]')?.getAttribute('content') ?? ''
    ).trim();
    const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '';
    const robots = (doc.querySelector('meta[name="robots"]')?.getAttribute('content') ?? '').trim();
    const viewport = !!doc.querySelector('meta[name="viewport"]');
    const lang = doc.documentElement.getAttribute('lang') ?? '';

    const h1s = Array.from(doc.querySelectorAll('h1'));
    const headings = Array.from(doc.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((h) =>
      Number(h.tagName.slice(1)),
    );
    const headingOutlineOk = this.outlineOk(headings);

    const bodyText = (doc.body?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const wordCount = bodyText ? bodyText.split(' ').length : 0;

    const jsonLdTypes: string[] = [];
    doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
      try {
        const data = JSON.parse(s.textContent ?? '');
        const collect = (o: unknown): void => {
          if (Array.isArray(o)) { o.forEach(collect); return; }
          if (o && typeof o === 'object') {
            const t = (o as Record<string, unknown>)['@type'];
            if (typeof t === 'string') jsonLdTypes.push(t);
            else if (Array.isArray(t)) t.forEach((x) => typeof x === 'string' && jsonLdTypes.push(x));
            const graph = (o as Record<string, unknown>)['@graph'];
            if (Array.isArray(graph)) graph.forEach(collect);
          }
        };
        collect(data);
      } catch {
        /* JSON-LD invalide ignoré (sera signalé par findings si 0 type) */
      }
    });

    const ogCount = doc.querySelectorAll('meta[property^="og:"]').length;
    const twitterCard = !!doc.querySelector('meta[name="twitter:card"]');

    const imgs = Array.from(doc.querySelectorAll('img'));
    const imgMissingAlt = imgs.filter((i) => !(i.getAttribute('alt') ?? '').trim()).length;
    const imgLazy = imgs.filter((i) => i.getAttribute('loading') === 'lazy').length;

    let linksInternal = 0;
    let linksExternal = 0;
    doc.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href') ?? '';
      if (/^https?:\/\//i.test(href)) {
        try {
          if (new URL(href).host === host) linksInternal++;
          else linksExternal++;
        } catch { /* href cassé */ }
      } else if (href.startsWith('/') || href.startsWith('#') || href.startsWith('.')) {
        linksInternal++;
      }
    });

    const hreflangCount = doc.querySelectorAll('link[rel="alternate"][hreflang]').length;

    return {
      title, titleLen: title.length,
      metaDescription, metaDescLen: metaDescription.length,
      canonical, robots, viewport, lang,
      h1Count: h1s.length, h1Text: (h1s[0]?.textContent ?? '').trim().slice(0, 120),
      headingOutlineOk, wordCount, jsonLdTypes: Array.from(new Set(jsonLdTypes)),
      ogCount, twitterCard,
      imgTotal: imgs.length, imgMissingAlt, imgLazy,
      linksInternal, linksExternal, hreflangCount,
    };
  }

  private outlineOk(levels: number[]): boolean {
    if (!levels.length) return false;
    let prev = 0;
    for (const lv of levels) {
      if (prev && lv > prev + 1) return false; // saut de niveau (ex: h2 → h4)
      prev = lv;
    }
    return true;
  }

  private evaluate(s: ParsedSignals, mode: 'page' | 'geo', fetched: boolean): SeoFinding[] {
    const f: SeoFinding[] = [];
    if (!fetched) {
      f.push({
        severity: 'P0', category: 'technical',
        issue: 'Page non récupérable (fetch échoué — souvent CORS sans proxy, ou page protégée).',
        fix: 'Configurer un proxy trusté (ax_proxy_url) ou tester depuis le serveur. L\'analyse on-page nécessite le HTML.',
      });
      return f;
    }

    // Title
    if (!s.title) f.push({ severity: 'P0', category: 'technical', issue: 'Balise <title> absente.', fix: 'Ajouter un <title> unique de 50-60 caractères ciblant le mot-clé principal.' });
    else if (s.titleLen < 30 || s.titleLen > 65) f.push({ severity: 'P1', category: 'technical', issue: `Title ${s.titleLen} caractères (cible 50-60).`, fix: 'Reformuler le title entre 50 et 60 caractères, mot-clé en tête.' });

    // Meta description
    if (!s.metaDescription) f.push({ severity: 'P1', category: 'technical', issue: 'Meta description absente.', fix: 'Ajouter une meta description de 120-158 caractères avec CTA + mot-clé.' });
    else if (s.metaDescLen < 80 || s.metaDescLen > 165) f.push({ severity: 'P2', category: 'technical', issue: `Meta description ${s.metaDescLen} caractères (cible 120-158).`, fix: 'Ajuster la longueur entre 120 et 158 caractères.' });

    // Canonical
    if (!s.canonical) f.push({ severity: 'P1', category: 'technical', issue: 'Lien canonical absent.', fix: 'Ajouter <link rel="canonical" href="URL absolue self-référente"> pour éviter le contenu dupliqué.' });

    // Robots noindex
    if (/noindex/i.test(s.robots)) f.push({ severity: 'P0', category: 'technical', issue: 'Page en noindex — exclue de l\'index Google.', fix: 'Retirer noindex de la meta robots si la page doit être indexée.' });

    // Viewport / mobile
    if (!s.viewport) f.push({ severity: 'P0', category: 'technical', issue: 'Meta viewport absente — page non mobile-friendly.', fix: 'Ajouter <meta name="viewport" content="width=device-width, initial-scale=1">.' });

    // Lang
    if (!s.lang) f.push({ severity: 'P2', category: 'technical', issue: 'Attribut lang absent sur <html>.', fix: 'Ajouter lang="fr" (ou la langue cible) sur <html> pour l\'accessibilité et l\'i18n.' });

    // H1
    if (s.h1Count === 0) f.push({ severity: 'P0', category: 'content', issue: 'Aucun H1.', fix: 'Ajouter exactement un H1 décrivant le sujet principal de la page.' });
    else if (s.h1Count > 1) f.push({ severity: 'P1', category: 'content', issue: `${s.h1Count} balises H1 (1 recommandée).`, fix: 'Ne garder qu\'un seul H1, passer les autres en H2.' });

    if (!s.headingOutlineOk) f.push({ severity: 'P2', category: 'content', issue: 'Hiérarchie de titres incohérente (saut de niveau Hn).', fix: 'Respecter l\'ordre H1→H2→H3 sans sauter de niveau.' });

    // Content depth
    if (s.wordCount < 300) f.push({ severity: 'P1', category: 'content', issue: `Contenu mince (${s.wordCount} mots).`, fix: 'Étoffer à 600+ mots utiles (E-E-A-T) — couvrir l\'intention de recherche en profondeur.' });

    // Schema
    if (s.jsonLdTypes.length === 0) f.push({ severity: 'P1', category: 'schema', issue: 'Aucun balisage Schema.org (JSON-LD) détecté.', fix: 'Ajouter du JSON-LD adapté (Article, Organization, BreadcrumbList, FAQPage...) pour les rich results.' });

    // Social / GEO
    if (s.ogCount === 0) f.push({ severity: 'P2', category: 'social-geo', issue: 'Aucune balise Open Graph.', fix: 'Ajouter og:title, og:description, og:image, og:url pour le partage social et l\'aperçu IA.' });
    if (!s.twitterCard) f.push({ severity: 'P2', category: 'social-geo', issue: 'Twitter Card absente.', fix: 'Ajouter <meta name="twitter:card" content="summary_large_image">.' });
    if (mode === 'geo' && s.wordCount < 500) f.push({ severity: 'P1', category: 'social-geo', issue: 'Citabilité IA faible (contenu court, peu de passages autonomes).', fix: 'Structurer en passages auto-suffisants (réponse directe en tête de section) pour AI Overviews/Perplexity, ajouter FAQPage + données chiffrées sourcées.' });

    // Images
    if (s.imgTotal > 0 && s.imgMissingAlt > 0) f.push({ severity: 'P1', category: 'images', issue: `${s.imgMissingAlt}/${s.imgTotal} images sans attribut alt.`, fix: 'Ajouter un alt descriptif (mot-clé naturel) sur chaque image porteuse de sens.' });

    // Links
    if (s.linksInternal < 3) f.push({ severity: 'P2', category: 'links', issue: `Maillage interne faible (${s.linksInternal} liens internes).`, fix: 'Ajouter des liens internes contextuels vers les pages piliers/connexes.' });

    return f;
  }

  private score(s: ParsedSignals, findings: SeoFinding[], fetched: boolean): number {
    if (!fetched) return 0;
    let score = 100;
    for (const fd of findings) {
      score -= fd.severity === 'P0' ? 18 : fd.severity === 'P1' ? 8 : 3;
    }
    // bonus signaux forts
    if (s.jsonLdTypes.length >= 2) score += 4;
    if (s.ogCount >= 4 && s.twitterCard) score += 3;
    if (s.wordCount >= 800) score += 3;
    return Math.max(0, Math.min(100, score));
  }

  private grade(score: number): string {
    if (score >= 95) return 'A+';
    if (score >= 85) return 'A';
    if (score >= 70) return 'B';
    if (score >= 55) return 'C';
    if (score >= 40) return 'D';
    return 'F';
  }

  /** Synthèse qualitative E-E-A-T / GEO via IA (best-effort, non bloquant). */
  private async aiSynthesis(
    url: string, s: ParsedSignals, findings: SeoFinding[], mode: 'page' | 'geo',
  ): Promise<string | undefined> {
    const sys =
      'Tu es un expert SEO technique senior (référentiel Google Search Essentials + QRG E-E-A-T + GEO 2026). ' +
      'À partir des signaux on-page extraits, donne une synthèse actionnable en 5-8 puces FR : ' +
      'priorités business, E-E-A-T, citabilité IA (AI Overviews/ChatGPT/Perplexity), quick wins. ' +
      'Sois concret et falsifiable, pas de généralités. Pas de markdown lourd.';
    const facts =
      `URL: ${url}\nMode: ${mode}\nTitle(${s.titleLen}): ${s.title}\n` +
      `MetaDesc(${s.metaDescLen}): ${s.metaDescription}\nH1(${s.h1Count}): ${s.h1Text}\n` +
      `Mots: ${s.wordCount} | Schema: ${s.jsonLdTypes.join(',') || 'aucun'} | OG: ${s.ogCount} | ` +
      `Img sans alt: ${s.imgMissingAlt}/${s.imgTotal} | Liens int/ext: ${s.linksInternal}/${s.linksExternal} | hreflang: ${s.hreflangCount}\n` +
      `Findings: ${findings.map((f) => `[${f.severity}] ${f.issue}`).join(' ; ')}`;
    let collected = '';
    try {
      await aiRouter.stream(
        [{ role: 'user', content: facts }],
        sys,
        (chunk) => { if (chunk.text) collected += chunk.text; },
        (err) => { logger.warn('seo-audit', 'ai stream err', { err }); },
      );
    } catch (err: unknown) {
      logger.warn('seo-audit', 'ai synthesis throw', { err });
    }
    const out = collected.trim();
    return out ? out.slice(0, 2000) : undefined;
  }

  private fail(id: string, url: string, start: number, reason: string): SeoAuditOutput {
    return {
      id, url, ok: false, score: 0, grade: 'F', fetched: false, fetchError: reason,
      signals: {}, findings: [{ severity: 'P0', category: 'technical', issue: reason, fix: 'Fournir une URL http(s) valide.' }],
      generatedAt: start, durationMs: Date.now() - start,
    };
  }

  private persist(out: SeoAuditOutput): void {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const list = raw ? (JSON.parse(raw) as SeoAuditOutput[]) : [];
      list.unshift(out);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_MAX)));
    } catch (err: unknown) {
      logger.warn('seo-audit', 'persist failed', { err });
    }
  }

  /** Historique des audits (lecture admin). */
  history(): SeoAuditOutput[] {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      return raw ? (JSON.parse(raw) as SeoAuditOutput[]) : [];
    } catch {
      return [];
    }
  }
}

export const seoAudit = new SeoAuditService();
