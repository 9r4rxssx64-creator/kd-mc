/**
 * APEX v13.4.7 — Connecteur data.gouv.fr (Kevin 2026-05-12).
 *
 * API publique du gouvernement français (datasets ouverts).
 * Doc : https://doc.data.gouv.fr/api/reference/
 * Base : https://www.data.gouv.fr/api/1/
 *
 * Endpoints exposés :
 *  - searchDatasets(query) : recherche full-text dans tous les datasets
 *  - getDataset(slug) : métadonnées détaillées + resources téléchargeables
 *  - searchOrganizations(query) : organisations publiques
 *  - getReuses(datasetId) : ré-utilisations connues d'un dataset
 *
 * Pas d'authentification requise (API publique).
 * Rate limit : 60 req/min/IP (politique data.gouv.fr).
 */

import { logger } from '../../core/logger.js';

const BASE_URL = 'https://www.data.gouv.fr/api/1';
const DEFAULT_PAGE_SIZE = 20;
const FETCH_TIMEOUT_MS = 15_000;

export interface DataGouvDataset {
  id: string;
  title: string;
  slug: string;
  description: string;
  organization: { id: string; name: string; slug: string } | null;
  page: string;
  uri: string;
  resources: Array<{
    id: string;
    title: string;
    url: string;
    format: string;
    filesize?: number;
    last_modified?: string;
  }>;
  tags: string[];
  created_at: string;
  last_modified: string;
  metrics?: { views?: number; followers?: number; reuses?: number };
}

export interface DataGouvSearchResult {
  total: number;
  page: number;
  page_size: number;
  datasets: DataGouvDataset[];
}

export interface DataGouvOrganization {
  id: string;
  name: string;
  slug: string;
  description: string;
  page: string;
  members_count?: number;
  datasets_count?: number;
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

class DataGouvConnector {
  /**
   * Recherche full-text dans le catalogue data.gouv.fr.
   * Exemples : "élections", "covid", "code postal", "transport public".
   */
  async searchDatasets(query: string, opts: { page?: number; pageSize?: number; tag?: string } = {}): Promise<DataGouvSearchResult> {
    const params = new URLSearchParams({
      q: query,
      page: String(opts.page ?? 1),
      page_size: String(opts.pageSize ?? DEFAULT_PAGE_SIZE),
    });
    if (opts.tag) params.set('tag', opts.tag);
    const url = `${BASE_URL}/datasets/?${params.toString()}`;
    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        total: number;
        page: number;
        page_size: number;
        data: DataGouvDataset[];
      };
      return {
        total: data.total,
        page: data.page,
        page_size: data.page_size,
        datasets: data.data.map((d) => this.normalizeDataset(d)),
      };
    } catch (err: unknown) {
      logger.warn('datagouv', 'searchDatasets failed', { err, query });
      throw err;
    }
  }

  /**
   * Récupère un dataset par son slug ou ID.
   */
  async getDataset(slugOrId: string): Promise<DataGouvDataset> {
    const url = `${BASE_URL}/datasets/${encodeURIComponent(slugOrId)}/`;
    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as DataGouvDataset;
      return this.normalizeDataset(data);
    } catch (err: unknown) {
      logger.warn('datagouv', 'getDataset failed', { err, slugOrId });
      throw err;
    }
  }

  /**
   * Recherche d'organisations publiques.
   */
  async searchOrganizations(query: string, opts: { page?: number; pageSize?: number } = {}): Promise<{
    total: number;
    organizations: DataGouvOrganization[];
  }> {
    const params = new URLSearchParams({
      q: query,
      page: String(opts.page ?? 1),
      page_size: String(opts.pageSize ?? DEFAULT_PAGE_SIZE),
    });
    const url = `${BASE_URL}/organizations/?${params.toString()}`;
    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { total: number; data: DataGouvOrganization[] };
      return { total: data.total, organizations: data.data };
    } catch (err: unknown) {
      logger.warn('datagouv', 'searchOrganizations failed', { err, query });
      throw err;
    }
  }

  /**
   * Liste les ré-utilisations d'un dataset (qui s'en sert et comment).
   */
  async getReuses(datasetId: string): Promise<Array<{ id: string; title: string; url: string; description: string }>> {
    const url = `${BASE_URL}/datasets/${encodeURIComponent(datasetId)}/reuses/`;
    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { data: Array<{ id: string; title: string; url: string; description: string }> };
      return data.data;
    } catch (err: unknown) {
      logger.warn('datagouv', 'getReuses failed', { err, datasetId });
      throw err;
    }
  }

  private normalizeDataset(d: DataGouvDataset): DataGouvDataset {
    return {
      id: d.id,
      title: d.title,
      slug: d.slug,
      description: d.description?.slice(0, 2000) ?? '',
      organization: d.organization
        ? { id: d.organization.id, name: d.organization.name, slug: d.organization.slug }
        : null,
      page: d.page,
      uri: d.uri,
      resources: (d.resources ?? []).slice(0, 10).map((r) => ({
        id: r.id,
        title: r.title,
        url: r.url,
        format: r.format,
        ...(r.filesize !== undefined && { filesize: r.filesize }),
        ...(r.last_modified !== undefined && { last_modified: r.last_modified }),
      })),
      tags: d.tags ?? [],
      created_at: d.created_at,
      last_modified: d.last_modified,
      ...(d.metrics !== undefined && { metrics: d.metrics }),
    };
  }
}

export const dataGouvConnector = new DataGouvConnector();
