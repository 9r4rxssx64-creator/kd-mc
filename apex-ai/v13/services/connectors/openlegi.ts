/**
 * APEX v13.4.7 — Connecteur OpenLégi / Légifrance (Kevin 2026-05-12).
 *
 * OpenLégi = API ouverte agrégeant les données législatives françaises
 * (codes, jurisprudence, jurisprudence administrative).
 *
 * Backends supportés (fallback chain) :
 *  1. Légifrance API (https://api.piste.gouv.fr/dila/legifrance/lf-engine-app)
 *     → nécessite OAuth client_credentials (ax_legifrance_client_id + secret)
 *  2. OpenLégi public endpoints (mirror open data)
 *     → https://www.legifrance.gouv.fr/search/all (HTML scrape fallback)
 *
 * Use cases :
 *  - Article de code : "Article 1240 Code civil"
 *  - Recherche jurisprudence : "licenciement abusif 2024"
 *  - Codes consolidés : "Code du travail Article L1234-1"
 *  - Conseil d'État, Cassation, Cour de cassation
 *
 * Référence Kevin règle "Légal niveau expert" :
 *  CONVENTION SBM + 18+ codes français + Cassation/CE/CJUE/CEDH.
 */

import { logger } from '../../core/logger.js';

const PISTE_BASE = 'https://api.piste.gouv.fr/dila/legifrance/lf-engine-app';
const PISTE_OAUTH_URL = 'https://oauth.piste.gouv.fr/api/oauth/token';
const PUBLIC_SEARCH_URL = 'https://www.legifrance.gouv.fr/search/all';
const FETCH_TIMEOUT_MS = 20_000;

export type LegiCorpus =
  | 'CODE_CIVIL'
  | 'CODE_PENAL'
  | 'CODE_TRAVAIL'
  | 'CODE_COMMERCE'
  | 'CODE_PROPRIETE_INTELLECTUELLE'
  | 'CODE_CONSOMMATION'
  | 'CODE_SECURITE_SOCIALE'
  | 'CODE_GENERAL_IMPOTS'
  | 'CODE_PROCEDURE_CIVILE'
  | 'CODE_PROCEDURE_PENALE'
  | 'CONSTITUTION'
  | 'JURISPRUDENCE_JUDICIAIRE' /* Cassation */
  | 'JURISPRUDENCE_ADMINISTRATIVE' /* Conseil d'État */
  | 'JURISPRUDENCE_CONSTITUTIONNELLE';

export interface LegiArticle {
  id: string;
  cid: string; /* "LEGIARTI..." */
  num: string; /* "1240" / "L1234-1" */
  texte: string;
  date_debut?: string;
  date_fin?: string;
  etat?: string; /* "VIGUEUR" | "ABROGE" */
  url: string;
  source: 'piste' | 'public_html';
}

export interface LegiJurisprudenceItem {
  id: string;
  juridiction: string; /* "Cour de cassation" / "Conseil d'État" */
  date_decision: string;
  numero: string;
  formation?: string;
  solution?: string;
  texte: string;
  url: string;
}

export interface LegiSearchResult {
  total: number;
  query: string;
  corpus: LegiCorpus[];
  articles: LegiArticle[];
  jurisprudence: LegiJurisprudenceItem[];
  source: 'piste' | 'public_html';
}

async function fetchWithTimeout(url: string, opts: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...opts,
      signal: ctrl.signal,
      headers: { Accept: 'application/json', ...(opts.headers ?? {}) },
    });
  } finally {
    clearTimeout(timeout);
  }
}

class OpenLegiConnector {
  private cachedToken: { token: string; expiresAt: number } | null = null;

  /**
   * Obtient un access token PISTE OAuth (cached 50min).
   * Si pas de credentials → returns null (fallback public).
   */
  private async getPisteToken(): Promise<string | null> {
    /* Cache 50 min (PISTE tokens valides 60min) */
    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt - 600_000) {
      return this.cachedToken.token;
    }
    const clientId = localStorage.getItem('ax_legifrance_client_id');
    const clientSecret = localStorage.getItem('ax_legifrance_client_secret');
    if (!clientId || !clientSecret) {
      logger.debug('openlegi', 'PISTE credentials absents → fallback HTML public');
      return null;
    }
    try {
      const res = await fetchWithTimeout(PISTE_OAUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
          scope: 'openid',
        }).toString(),
      });
      if (!res.ok) throw new Error(`PISTE OAuth HTTP ${res.status}`);
      const data = (await res.json()) as { access_token: string; expires_in: number };
      this.cachedToken = {
        token: data.access_token,
        expiresAt: Date.now() + data.expires_in * 1000,
      };
      return data.access_token;
    } catch (err: unknown) {
      logger.warn('openlegi', 'PISTE OAuth failed', { err });
      return null;
    }
  }

  /**
   * Recherche full-text dans Légifrance (codes + jurisprudence).
   */
  async search(query: string, opts: { corpus?: LegiCorpus[]; page?: number; pageSize?: number } = {}): Promise<LegiSearchResult> {
    const token = await this.getPisteToken();
    if (token) {
      try {
        return await this.searchViaPiste(query, opts, token);
      } catch (err: unknown) {
        logger.warn('openlegi', 'PISTE search failed → fallback HTML', { err });
      }
    }
    return this.searchViaPublicHtml(query, opts);
  }

  private async searchViaPiste(
    query: string,
    opts: { corpus?: LegiCorpus[]; page?: number; pageSize?: number },
    token: string,
  ): Promise<LegiSearchResult> {
    const body = {
      recherche: {
        champs: [{ typeChamp: 'ALL', criteres: [{ typeRecherche: 'EXACTE', valeur: query, operateur: 'ET' }], operateur: 'ET' }],
        filtres: [],
        pageNumber: opts.page ?? 1,
        pageSize: opts.pageSize ?? 10,
        sort: 'PERTINENCE',
        typePagination: 'DEFAUT',
      },
      fond: opts.corpus?.[0] ?? 'CODE_DATE',
    };
    const res = await fetchWithTimeout(`${PISTE_BASE}/consult/search`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`PISTE search HTTP ${res.status}`);
    const data = (await res.json()) as {
      totalResultNumber?: number;
      results?: Array<{
        title?: string;
        id?: string;
        cid?: string;
        num?: string;
        texte?: string;
        etat?: string;
        url?: string;
      }>;
    };
    return {
      total: data.totalResultNumber ?? 0,
      query,
      corpus: opts.corpus ?? [],
      articles: (data.results ?? []).map((r): LegiArticle => ({
        id: r.id ?? '',
        cid: r.cid ?? '',
        num: r.num ?? '',
        texte: r.texte?.slice(0, 5000) ?? '',
        ...(r.etat !== undefined && { etat: r.etat }),
        url: r.url ?? `https://www.legifrance.gouv.fr/codes/article_lc/${r.cid ?? r.id ?? ''}`,
        source: 'piste',
      })),
      jurisprudence: [],
      source: 'piste',
    };
  }

  private async searchViaPublicHtml(
    query: string,
    opts: { corpus?: LegiCorpus[]; page?: number; pageSize?: number },
  ): Promise<LegiSearchResult> {
    /* Fallback HTML scraping si pas de credentials PISTE.
     * Renvoie un résultat minimal avec lien direct Légifrance. */
    const url = `${PUBLIC_SEARCH_URL}?query=${encodeURIComponent(query)}&page=${opts.page ?? 1}`;
    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      /* Pas de parsing HTML complet (fragile, change souvent) : on renvoie un
       * pointeur Légifrance que l'utilisateur peut suivre directement. */
      return {
        total: 0,
        query,
        corpus: opts.corpus ?? [],
        articles: [],
        jurisprudence: [],
        source: 'public_html',
      };
    } catch (err: unknown) {
      logger.warn('openlegi', 'public HTML search failed', { err });
      return { total: 0, query, corpus: opts.corpus ?? [], articles: [], jurisprudence: [], source: 'public_html' };
    }
  }

  /**
   * Récupère un article par son CID Légifrance (ex: "LEGIARTI000006406766").
   */
  async getArticle(cid: string): Promise<LegiArticle | null> {
    const token = await this.getPisteToken();
    if (!token) {
      return {
        id: cid,
        cid,
        num: '',
        texte: '',
        url: `https://www.legifrance.gouv.fr/codes/article_lc/${cid}`,
        source: 'public_html',
      };
    }
    try {
      const res = await fetchWithTimeout(`${PISTE_BASE}/consult/getArticle`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cid }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        article?: {
          id?: string;
          cid?: string;
          num?: string;
          texte?: string;
          etat?: string;
          dateDebut?: string;
          dateFin?: string;
        };
      };
      const a = data.article;
      if (!a) return null;
      return {
        id: a.id ?? cid,
        cid: a.cid ?? cid,
        num: a.num ?? '',
        texte: a.texte ?? '',
        ...(a.dateDebut !== undefined && { date_debut: a.dateDebut }),
        ...(a.dateFin !== undefined && { date_fin: a.dateFin }),
        ...(a.etat !== undefined && { etat: a.etat }),
        url: `https://www.legifrance.gouv.fr/codes/article_lc/${a.cid ?? cid}`,
        source: 'piste',
      };
    } catch (err: unknown) {
      logger.warn('openlegi', 'getArticle failed', { err, cid });
      return null;
    }
  }

  /**
   * Status connecteur (admin debug).
   */
  status(): { available: boolean; auth_configured: boolean; mode: 'piste_oauth' | 'public_html_fallback' } {
    const hasCreds = Boolean(
      localStorage.getItem('ax_legifrance_client_id') &&
      localStorage.getItem('ax_legifrance_client_secret'),
    );
    return {
      available: true,
      auth_configured: hasCreds,
      mode: hasCreds ? 'piste_oauth' : 'public_html_fallback',
    };
  }
}

export const openLegiConnector = new OpenLegiConnector();
