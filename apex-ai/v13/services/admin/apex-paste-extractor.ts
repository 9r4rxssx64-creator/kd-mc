/**
 * APEX v13.4.96 — Paste Extractor universel (Kevin 2026-05-15)
 *
 * Kevin : "j'ai pas accès au visuel comme demandé avec tous mes liens TP les
 * réseaux etc. cetera de tous les codes que j'ai posé, il n'apparaît que les
 * API pour l'instant et quelques unes il en manque beaucoup".
 *
 * Cause : les patterns AX_CREDENTIAL_PATTERNS ne matchent que tokens API
 * (sk-ant-..., AIzaSy..., re_...). Les URLs, handles sociaux, emails ne sont
 * pas extraits → quand Kevin colle "instagram.com/kdmc" ou "@kdmc" ou un
 * lien dashboard service, rien n'est stocké.
 *
 * Ce service complète : extrait TOUS éléments d'un texte collé (multi-line OK) :
 *   - URLs : https://*, http://*, www.*
 *   - Handles sociaux : @username (instagram/twitter/tiktok)
 *   - Emails : user@domain.tld
 *   - IBANs : FR76 1234...
 *   - Téléphones : +33..., 06..., 07...
 *   - SIRET : 14 chiffres
 *   - VAT : FR12345678901
 *   - BTC/ETH addresses
 *
 * Persiste dans `apex_v13_extracted_<type>_<ts>` localStorage + push events.
 * Admin only pour write (per règle Kevin tier-aware).
 */

import { logger } from '../../core/logger.js';
import { auth } from '../auth/auth.js';

export type ExtractedType =
  | 'url'
  | 'social_handle'
  | 'email'
  | 'iban'
  | 'phone'
  | 'siret'
  | 'vat'
  | 'btc_address'
  | 'eth_address';

export interface ExtractedItem {
  type: ExtractedType;
  value: string;
  /** Sous-classification ex: "instagram", "twitter", "linkedin" pour social */
  subtype?: string;
  /** Position dans le texte source (pour debug) */
  offset: number;
  ts: number;
}

export interface ExtractionResult {
  ok: boolean;
  total: number;
  items: ExtractedItem[];
  /** Si admin : items stockés et persistés. Sinon : items détectés mais non stockés. */
  stored: boolean;
  error?: string;
}

/** Patterns regex non-credentials (Kevin "TP réseaux sites etc") */
const EXTRACTION_PATTERNS: ReadonlyArray<{
  type: ExtractedType;
  regex: RegExp;
  /** Optionnel : extrait subtype depuis match[0] */
  subtype?: (match: string) => string | undefined;
}> = [
  {
    type: 'url',
    /* URLs http(s) et www. */
    regex: /(?:https?:\/\/|www\.)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?/gi,
    subtype: (m: string) => {
      try {
        const url = m.startsWith('http') ? new URL(m) : new URL('https://' + m);
        const host = url.hostname.toLowerCase().replace(/^www\./, '');
        /* Detect réseaux sociaux par host */
        if (/instagram\.com$/.test(host)) return 'instagram';
        if (/facebook\.com$/.test(host) || /fb\.com$/.test(host)) return 'facebook';
        if (/(?:twitter|x)\.com$/.test(host)) return 'twitter';
        if (/tiktok\.com$/.test(host)) return 'tiktok';
        if (/linkedin\.com$/.test(host)) return 'linkedin';
        if (/youtube\.com$/.test(host) || host === 'youtu.be') return 'youtube';
        if (/github\.com$/.test(host)) return 'github';
        if (/discord\.(?:com|gg)$/.test(host)) return 'discord';
        if (/t\.me$/.test(host)) return 'telegram';
        return host;
      } catch {
        return undefined;
      }
    },
  },
  {
    type: 'social_handle',
    /* @handle (3+ chars, alphanumeric + underscore + dot) */
    regex: /(?:^|\s|>|"|')@([a-zA-Z0-9_.]{3,30})\b/g,
  },
  {
    type: 'email',
    regex: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
  },
  {
    type: 'iban',
    /* IBAN : 2 lettres + 2 chiffres + 11-30 alphanum (avec/sans espaces) */
    regex: /\b[A-Z]{2}\d{2}[\s]?(?:[A-Z0-9]{4}[\s]?){2,7}[A-Z0-9]{1,4}\b/g,
  },
  {
    type: 'phone',
    /* FR : +33|0 + 9 chiffres (1+4×2), Monaco : +377 + 8 chiffres (4×2) */
    regex: /(?:(?:\+?33|0)[\s.-]?[1-9](?:[\s.-]?\d{2}){4})|(?:\+?377[\s.-]?\d{2}(?:[\s.-]?\d{2}){3})/g,
  },
  {
    type: 'siret',
    regex: /\b\d{14}\b/g,
  },
  {
    type: 'vat',
    regex: /\b[A-Z]{2}\d{8,12}\b/g,
  },
  {
    type: 'btc_address',
    regex: /\b(?:bc1[a-z0-9]{25,62}|[13][a-zA-HJ-NP-Z0-9]{25,34})\b/g,
  },
  {
    type: 'eth_address',
    regex: /\b0x[a-fA-F0-9]{40}\b/g,
  },
];

class ApexPasteExtractor {
  /**
   * Extrait tous les items détectables d'un texte. Idempotent, ne stocke que si admin.
   * Émet `paste-extracted` event pour wirage UI (ex: vault registry refresh).
   */
  extract(rawText: string): ExtractionResult {
    if (!rawText || typeof rawText !== 'string') {
      return { ok: false, total: 0, items: [], stored: false, error: 'invalid_input' };
    }
    /* Cap 50KB de paste */
    const text = rawText.slice(0, 50_000);
    const items: ExtractedItem[] = [];
    const seen = new Set<string>(); /* dedup par type+value */

    for (const pattern of EXTRACTION_PATTERNS) {
      const matches = Array.from(text.matchAll(pattern.regex));
      for (const m of matches) {
        const rawValue = (m[1] ?? m[0]).trim();
        if (!rawValue || rawValue.length < 3) continue;
        const dedupKey = `${pattern.type}::${rawValue.toLowerCase()}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);
        const item: ExtractedItem = {
          type: pattern.type,
          value: rawValue,
          offset: m.index ?? -1,
          ts: Date.now(),
        };
        const sub = pattern.subtype?.(rawValue);
        if (sub) item.subtype = sub;
        items.push(item);
      }
    }

    /* Persist si admin (règle Kevin tier-aware) */
    const isAdmin = auth.isAdminSync();
    let stored = false;
    if (isAdmin && items.length > 0) {
      try {
        const existing = this.list();
        const merged = [...existing, ...items].slice(-500); /* cap 500 récents */
        localStorage.setItem('apex_v13_extracted_items', JSON.stringify(merged));
        stored = true;
      } catch (err: unknown) {
        logger.warn('paste-extractor', 'persist failed (quota?)', { err });
      }
    }

    /* Dispatch CustomEvent natif (events bus typé n'a pas 'paste-extracted' dans EventMap).
     * UI peut écouter window.addEventListener('apex:paste-extracted', ...). */
    try {
      if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
        window.dispatchEvent(new CustomEvent('apex:paste-extracted', {
          detail: { total: items.length, items },
        }));
      }
    } catch { /* silent */ }

    logger.info('paste-extractor', `Extracted ${items.length} items (admin=${isAdmin}, stored=${stored})`);
    return { ok: true, total: items.length, items, stored };
  }

  /** Liste tous items extraits (lecture pour tous, pas sensible). */
  list(): ExtractedItem[] {
    try {
      const raw = localStorage.getItem('apex_v13_extracted_items');
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as ExtractedItem[]) : [];
    } catch {
      return [];
    }
  }

  /** Filtre par type. */
  listByType(type: ExtractedType): ExtractedItem[] {
    return this.list().filter((i) => i.type === type);
  }

  /** Stats agrégées par type (pour dashboard). */
  stats(): Record<ExtractedType, number> {
    const out: Partial<Record<ExtractedType, number>> = {};
    for (const item of this.list()) {
      out[item.type] = (out[item.type] ?? 0) + 1;
    }
    return out as Record<ExtractedType, number>;
  }

  /** Reset (admin only). */
  clear(): { ok: boolean; error?: string } {
    if (!auth.isAdminSync()) return { ok: false, error: 'admin_only_clear' };
    try {
      localStorage.removeItem('apex_v13_extracted_items');
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

export const apexPasteExtractor = new ApexPasteExtractor();
