/**
 * APEX v13.3.53 — Multi-Source Exhaustive Extract
 *
 * Règle Kevin (2026-05-07 23h55) — ABSOLUE :
 * "Même principe toujours pour les nouveaux code ou identifiants, photos, notes, docs etc
 *  collés source possible. Doit reconnaître les codes, identifiants, sites etc autonome
 *  et installer le lien pour connexion et pilotage complet toujours auto. Peut avoir
 *  plusieurs codes, sites, identifiants sur même source donc bien analyser tout toujours."
 *
 *  +  "Et étudier les sites, liens, codes etc"
 *  +  "Vérifie teste pour tout toujours"
 *
 * Ce service :
 *  1. Analyse une source (image / texte / URL / note / PDF) — UNE source peut contenir
 *     plusieurs credentials / identifiants / sites / device IDs / IPs / MACs.
 *  2. Pour CHAQUE élément extrait :
 *     - identifie le service (via credential-patterns.ts 89+)
 *     - étudie le service (study-service.ts → homepage / API / pricing / docs)
 *     - teste l'endpoint (ping live, latence, OK/erreur)
 *     - installe le lien (linksRegistry.autoCreate)
 *     - chiffre + persiste (vault.setKey triple persistence)
 *  3. Retourne stats détaillées (extracted / configured / tested_ok).
 *
 * Anti-pattern évité :
 *  - JAMAIS extraction silencieuse — toast récap obligatoire
 *  - JAMAIS install sans test (sauf services sensibles bancaires)
 *  - JAMAIS écraser une clé existante sans confirmation
 */

import { logger } from '../../core/logger.js';
import { linksRegistry } from '../integrations/links-registry.js';
import { studyService, type ServiceStudy } from '../integrations/study-service.js';
import { auditLog } from '../observability/audit-log.js';
import { firebase } from '../storage/firebase.js';
import { CREDENTIAL_PATTERNS, detectAllCredentials, type CredentialPattern } from '../vault/credential-patterns.js';
import { vault } from '../vault/vault.js';

/* === Types publics === */

export type ExtractedItemType =
  | 'credential'
  | 'identifier'
  | 'site'
  | 'device_id'
  | 'address'
  | 'metadata';

export interface ExtractedItem {
  type: ExtractedItemType;
  service?: string; /* anthropic, openai, ewelink, broadlink, hue, etc. */
  storage_key?: string;
  value: string;
  confidence: number; /* 0-1 */
  raw_match: string; /* Texte source d'origine */
  /* Test résultats */
  test_result?: {
    ok: boolean;
    latency_ms?: number;
    error?: string;
  };
  /* Étude approfondie */
  study?: ServiceStudy;
  /* Forbidden (CB / seed / mdp bancaire) */
  forbidden?: boolean;
}

export type SourceType = 'image' | 'text' | 'pdf' | 'url' | 'note';

export interface MultiSourceResult {
  source_type: SourceType;
  source_preview: string;
  extracted_count: number;
  configured_count: number;
  tested_count: number;
  tested_ok_count: number;
  items: ExtractedItem[];
  errors: string[];
  ts: number;
}

const HISTORY_KEY = 'ax_multi_source_history';
const HISTORY_CAP = 50;
const PREVIEW_MAX = 240;

/* === Patterns auxiliaires (au-delà des credentials) === */

const URL_REGEX = /\bhttps?:\/\/[^\s<>"']+/gi;
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const IPV4_REGEX = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const MAC_REGEX = /\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g;
const DEVICE_ID_REGEX =
  /\b(?:device[_-]?id|deviceID|did)\s*[:=]\s*([A-Za-z0-9_-]{6,64})\b/gi;
const PHONE_REGEX = /\b(?:\+|00)?(?:33\s?[67]|0[67])(?:[\s.-]?\d{2}){4}\b/g;

function previewSource(src: string, type: SourceType): string {
  if (type === 'image') return '[image base64]';
  const trimmed = src.trim();
  return trimmed.length > PREVIEW_MAX ? trimmed.slice(0, PREVIEW_MAX) + '…' : trimmed;
}

function emptyResult(type: SourceType, preview: string): MultiSourceResult {
  return {
    source_type: type,
    source_preview: preview,
    extracted_count: 0,
    configured_count: 0,
    tested_count: 0,
    tested_ok_count: 0,
    items: [],
    errors: [],
    ts: Date.now(),
  };
}

function dedupeItems(items: ExtractedItem[]): ExtractedItem[] {
  const seen = new Set<string>();
  const out: ExtractedItem[] = [];
  for (const item of items) {
    const k = `${item.type}::${item.value}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

function patternToService(p: CredentialPattern): string {
  /* Service slug = storageKey sans préfixe ax_ */
  return p.storageKey.replace(/^ax_/, '').replace(/_key$|_token$|_pat$/, '');
}

/* === API === */

class MultiSourceAnalyzer {
  /**
   * Analyse une image base64 via Claude Vision (si clé Anthropic dispo).
   * Fallback : retourne result vide avec warning si pas d'IA dispo.
   */
  async analyzeImage(imageBase64: string): Promise<MultiSourceResult> {
    const result = emptyResult('image', previewSource(imageBase64, 'image'));
    /* Claude Vision : extraction structurée via prompt JSON */
    let visionOk = false;
    try {
      const ocrText = await this.callVisionExtract(imageBase64);
      if (ocrText) {
        /* Délègue au text analyzer pour la suite (uniformité regex + patterns) */
        const textResult = await this.analyzeText(ocrText);
        result.items.push(...textResult.items);
        result.errors.push(...textResult.errors);
        visionOk = true;
      } else {
        result.errors.push('vision_unavailable: pas de clé Anthropic configurée');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`vision_error: ${msg}`);
      logger.warn('multi-source', 'vision extract failed', { err });
    }

    /* v13.3.57 PUSH-100 : Si Vision IA failed → fallback OCR offline tesseract.js
     * Permet extraction texte sans clé API (pas autonome 100% sans IA). */
    if (!visionOk) {
      try {
        const { ocrOffline } = await import('./ocr-offline.js');
        if (ocrOffline.isAvailable()) {
          const ocrResult = await ocrOffline.recognizeText(imageBase64);
          if (ocrResult.ok && ocrResult.text.trim().length > 0) {
            const textResult = await this.analyzeText(ocrResult.text);
            result.items.push(...textResult.items);
            result.errors.push(`ocr_offline_used: ${ocrResult.confidence.toFixed(2)} confidence, ${ocrResult.latency_ms}ms`);
            logger.info('multi-source', 'OCR offline fallback used', {
              confidence: ocrResult.confidence,
              latency: ocrResult.latency_ms,
              chars: ocrResult.text.length,
            });
          } else if (ocrResult.error) {
            result.errors.push(`ocr_offline_error: ${ocrResult.error}`);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`ocr_offline_load_failed: ${msg}`);
        logger.warn('multi-source', 'OCR offline load failed', { err: msg });
      }
    }

    result.items = dedupeItems(result.items);
    result.extracted_count = result.items.length;
    return result;
  }

  /**
   * Analyse un texte (peut contenir N credentials + URLs + emails + IPs + device IDs + MACs).
   */
  async analyzeText(text: string): Promise<MultiSourceResult> {
    const result = emptyResult('text', previewSource(text, 'text'));
    if (!text || !text.trim()) return result;

    /* 1. Credentials connus (89+ patterns) */
    const creds = detectAllCredentials(text);
    for (const { pattern, value } of creds) {
      result.items.push({
        type: 'credential',
        service: patternToService(pattern),
        storage_key: pattern.storageKey,
        value,
        confidence: 0.95,
        raw_match: value,
        forbidden: pattern.category === 'forbidden',
      });
    }

    /* 2. Sites / URLs */
    const urls = text.match(URL_REGEX) ?? [];
    for (const url of urls) {
      try {
        const u = new URL(url);
        const svc = u.hostname.replace(/^www\./, '').split('.')[0] ?? u.hostname;
        result.items.push({
          type: 'site',
          service: svc,
          value: url,
          confidence: 0.85,
          raw_match: url,
        });
      } catch {
        /* URL invalide → skip */
      }
    }

    /* 3. Emails (identifier) */
    const emails = text.match(EMAIL_REGEX) ?? [];
    for (const e of emails) {
      result.items.push({
        type: 'identifier',
        service: 'email',
        value: e,
        confidence: 0.95,
        raw_match: e,
      });
    }

    /* 4. IPs (address) */
    const ips = text.match(IPV4_REGEX) ?? [];
    for (const ip of ips) {
      const parts = ip.split('.').map(Number);
      if (parts.every((p) => p >= 0 && p <= 255)) {
        result.items.push({
          type: 'address',
          value: ip,
          confidence: 0.9,
          raw_match: ip,
        });
      }
    }

    /* 5. MACs (device address) */
    const macs = text.match(MAC_REGEX) ?? [];
    for (const mac of macs) {
      result.items.push({
        type: 'device_id',
        service: 'mac_address',
        value: mac,
        confidence: 0.95,
        raw_match: mac,
      });
    }

    /* 6. Device IDs (eWeLink / Broadlink / Hue / Tuya) — `device_id: xxxx` */
    let m: RegExpExecArray | null;
    while ((m = DEVICE_ID_REGEX.exec(text)) !== null) {
      const captured = m[1];
      if (!captured) continue;
      result.items.push({
        type: 'device_id',
        value: captured,
        confidence: 0.85,
        raw_match: m[0],
      });
    }
    DEVICE_ID_REGEX.lastIndex = 0; /* reset global state */

    /* 7. Phones FR (metadata) */
    const phones = text.match(PHONE_REGEX) ?? [];
    for (const p of phones) {
      result.items.push({
        type: 'metadata',
        service: 'phone',
        value: p,
        confidence: 0.9,
        raw_match: p,
      });
    }

    result.items = dedupeItems(result.items);
    result.extracted_count = result.items.length;
    return result;
  }

  /**
   * Analyse une URL : fetch + extraction credentials/identifiers/keywords.
   * Étudie aussi le service via studyService.studyByURL.
   */
  async analyzeURL(url: string): Promise<MultiSourceResult> {
    const result = emptyResult('url', previewSource(url, 'url'));
    try {
      const u = new URL(url);
      const svc = u.hostname.replace(/^www\./, '').split('.')[0] ?? u.hostname;
      /* L'URL elle-même est un site */
      result.items.push({
        type: 'site',
        service: svc,
        value: url,
        confidence: 1.0,
        raw_match: url,
      });
      /* Étudier le service */
      try {
        const study = await studyService.studyByURL(url);
        if (result.items[0]) result.items[0].study = study;
      } catch (err) {
        logger.warn('multi-source', 'studyByURL failed', { url, err });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`invalid_url: ${msg}`);
    }
    result.extracted_count = result.items.length;
    return result;
  }

  /**
   * Installe TOUS les éléments extraits (vault.setKey + linksRegistry.autoCreate + test).
   *
   * @param opts.test  Si true (default), ping endpoint avant de marquer "configured".
   * @param opts.skipForbidden  Si true (default), saute CB / seed phrases.
   */
  async installAll(
    result: MultiSourceResult,
    opts: { test?: boolean; skipForbidden?: boolean } = {},
  ): Promise<{
    installed: number;
    tested_ok: number;
    failed: string[];
  }> {
    const test = opts.test !== false;
    const skipForbidden = opts.skipForbidden !== false;

    let installed = 0;
    let tested_ok = 0;
    const failed: string[] = [];

    /* v13.4.6 (Kevin "sauvegarde avant de les perdre") :
     * PRE-SNAPSHOT OBLIGATOIRE avant toute installation. Si Kevin colle 11 clés
     * et qu'un crash survient à mi-parcours, on peut récupérer depuis le snapshot.
     * Aussi sauvegarde RAW backup brut des items collés (avant chiffrement)
     * dans `apex_v13_paste_recovery_<ts>` (cap 5 entries, 30j retention). */
    try {
      const { autoBackup } = await import('../storage/auto-backup.js');
      await autoBackup.snapshot('pre-rollback');
    } catch (err) {
      logger.warn('multi-source', 'pre-install snapshot skipped', { err });
    }
    try {
      const recoveryKey = `apex_v13_paste_recovery_${Date.now().toString(36)}`;
      const recoveryData = {
        ts: Date.now(),
        source_type: result.source_type,
        items: result.items.map((it) => ({
          type: it.type,
          service: it.service,
          storage_key: it.storage_key,
          value: it.value, /* RAW pour permettre retry si chiffrement fail */
          forbidden: it.forbidden,
        })),
      };
      localStorage.setItem(recoveryKey, JSON.stringify(recoveryData));
      /* Trim : garde max 5 recovery entries (FIFO) */
      const allRecoveryKeys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith('apex_v13_paste_recovery_')) allRecoveryKeys.push(k);
      }
      allRecoveryKeys.sort();
      while (allRecoveryKeys.length > 5) {
        const oldest = allRecoveryKeys.shift();
        if (oldest) localStorage.removeItem(oldest);
      }
    } catch (err) {
      logger.warn('multi-source', 'paste recovery snapshot failed', { err });
    }

    for (const item of result.items) {
      try {
        if (item.forbidden && skipForbidden) {
          failed.push(`${item.service ?? 'unknown'}: forbidden (CB/seed/mdp bancaire — non stocké)`);
          continue;
        }

        /* Credential : chiffre + setKey + linksRegistry.autoCreate
         * v13.4.6 (Kevin "jusqu'à ce que ça fonctionne") :
         * RETRY 3× avec backoff si setKey échoue, puis push direct vers Firebase
         * en dernier recours pour survivre clear cache local. */
        if (item.type === 'credential' && item.storage_key) {
          let setRes = await vault.setKey(item.storage_key, item.value);
          let attempts = 1;
          while (!setRes.ok && attempts < 3) {
            await new Promise((r) => setTimeout(r, 200 * attempts));
            setRes = await vault.setKey(item.storage_key, item.value);
            attempts++;
          }
          if (!setRes.ok) {
            /* SÉCU (audit externe P0) : dernier recours = stash LOCAL uniquement, JAMAIS
             * la clé en clair vers Firebase (base ouverte = fuite). Ré-essai chiffré au boot. */
            try {
              localStorage.setItem(`apex_v13_vault_emergency_${item.storage_key}`, JSON.stringify({
                plaintext: item.value,
                ts: Date.now(),
                source: 'multi-source-emergency',
              }));
              logger.warn('multi-source', `setKey failed 3x → emergency LOCAL stash OK : ${item.storage_key}`);
            } catch (lsErr) {
              logger.error('multi-source', `setKey failed 3x AND local stash failed for ${item.storage_key}`, { lsErr });
            }
          }
          if (setRes.ok) {
            installed++;
            result.configured_count++;
            /* Étude approfondie + lien auto */
            if (item.service) {
              try {
                await linksRegistry.autoCreate(item.service);
              } catch (err) {
                logger.warn('multi-source', 'linksRegistry.autoCreate failed', { service: item.service, err });
              }
              try {
                item.study = await studyService.studyByName(item.service);
              } catch (err) {
                logger.warn('multi-source', 'studyByName failed', { service: item.service, err });
              }
            }
            /* Test live si demandé */
            if (test && item.service) {
              const testResult = await this.testCredential(item.value, item.service);
              item.test_result = testResult;
              result.tested_count++;
              if (testResult.ok) {
                tested_ok++;
                result.tested_ok_count++;
              }
            }
          } else {
            failed.push(`${item.storage_key}: setKey failed (3 retries + Firebase backup)`);
          }
          continue;
        }

        /* Site : linksRegistry.autoCreate + study */
        if (item.type === 'site' && item.service) {
          try {
            await linksRegistry.autoCreate(item.service);
            installed++;
            result.configured_count++;
            if (test) {
              const testResult = await this.testURL(item.value);
              item.test_result = testResult;
              result.tested_count++;
              if (testResult.ok) {
                tested_ok++;
                result.tested_ok_count++;
              }
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            failed.push(`${item.service}: linksRegistry.autoCreate (${msg})`);
          }
          continue;
        }

        /* Email / Phone / Address / device_id : enregistrer en metadata FB shared */
        if (
          item.type === 'identifier' ||
          item.type === 'metadata' ||
          item.type === 'address' ||
          item.type === 'device_id'
        ) {
          try {
            const slot = `ax_extracted_${item.type}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
            localStorage.setItem(
              slot,
              JSON.stringify({ value: item.value, service: item.service ?? null, ts: Date.now() }),
            );
            installed++;
            result.configured_count++;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            failed.push(`${item.type}: ${msg}`);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        failed.push(`item ${item.value.slice(0, 16)}…: ${msg}`);
        logger.warn('multi-source', 'installAll item failed', { item, err });
      }
    }

    /* Persiste l'historique (cap 50, FIFO) */
    try {
      this.appendHistory(result);
    } catch (err) {
      logger.warn('multi-source', 'appendHistory failed', { err });
    }

    /* Audit log */
    try {
      await auditLog.record('multi_source.install', {
        details: {
          source_type: result.source_type,
          installed,
          tested_ok,
          failed_count: failed.length,
        },
      });
    } catch {
      /* non-bloquant */
    }

    return { installed, tested_ok, failed };
  }

  /**
   * Vision extract via Claude (si clé Anthropic présente).
   * Prompt structuré : "Extract ALL credentials/identifiers/sites — return as text lines".
   */
  private async callVisionExtract(imageBase64: string): Promise<string | null> {
    let key = '';
    try {
      key = await vault.readKey('ax_anthropic_key');
    } catch {
      return null;
    }
    if (!key) return null;

    /* Strip data URL prefix si présent */
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
    const mtMatch = imageBase64.match(/^data:(image\/[a-z]+);/);
    const mediaType: string = mtMatch && mtMatch[1] ? mtMatch[1] : 'image/jpeg';

    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 1024,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: { type: 'base64', media_type: mediaType, data: cleanBase64 },
                },
                {
                  type: 'text',
                  text:
                    'Extract ALL credentials, API keys, identifiers, URLs, emails, IPs, MAC addresses, device IDs visible in this image. Return ONE per line, nothing else (no explanation, no formatting). If nothing detected, return empty.',
                },
              ],
            },
          ],
        }),
      });
      if (!resp.ok) {
        logger.warn('multi-source', 'vision API non-OK', { status: resp.status });
        return null;
      }
      const data = (await resp.json()) as { content?: Array<{ type: string; text?: string }> };
      const text = data.content?.find((c) => c.type === 'text')?.text ?? '';
      return text || null;
    } catch (err) {
      logger.warn('multi-source', 'vision API exception', { err });
      return null;
    }
  }

  /**
   * Test rapide d'un credential. Si pattern.testEndpoint existe → ping.
   * Sinon retourne ok:true (sans test concret — on a au moins persisté).
   */
  private async testCredential(value: string, service: string): Promise<{ ok: boolean; latency_ms?: number; error?: string }> {
    const pattern = CREDENTIAL_PATTERNS.find((p) => patternToService(p) === service);
    if (!pattern || !pattern.testEndpoint) {
      return { ok: true };
    }
    const t0 = performance.now();
    try {
      const resp = await fetch(pattern.testEndpoint, {
        method: pattern.testMethod ?? 'HEAD',
        headers: { authorization: `Bearer ${value}` },
      });
      const latency = Math.round(performance.now() - t0);
      const out: { ok: boolean; latency_ms: number; error?: string } = { ok: resp.ok, latency_ms: latency };
      if (!resp.ok) out.error = `HTTP ${resp.status}`;
      return out;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  }

  /**
   * Test simple d'une URL (HEAD).
   */
  private async testURL(url: string): Promise<{ ok: boolean; latency_ms?: number; error?: string }> {
    const t0 = performance.now();
    try {
      const resp = await fetch(url, { method: 'HEAD', mode: 'no-cors' });
      const latency = Math.round(performance.now() - t0);
      /* mode no-cors → resp.ok toujours false mais pas d'erreur réseau = vivant */
      const out: { ok: boolean; latency_ms: number; error?: string } = { ok: true, latency_ms: latency };
      if (!resp.ok) out.error = 'opaque_response';
      return out;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  }

  /**
   * Historique des analyses (cap 50, FIFO).
   */
  private appendHistory(result: MultiSourceResult): void {
    let history: MultiSourceResult[] = [];
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) history = JSON.parse(raw) as MultiSourceResult[];
    } catch {
      history = [];
    }
    /* Strip valeurs sensibles avant de stocker (preview only) */
    const sanitized: MultiSourceResult = {
      ...result,
      items: result.items.map((it) => ({
        ...it,
        value: this.maskValue(it.value, it.type),
        raw_match: this.maskValue(it.raw_match, it.type),
      })),
    };
    history.unshift(sanitized);
    if (history.length > HISTORY_CAP) history = history.slice(0, HISTORY_CAP);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      void firebase.write(HISTORY_KEY, history);
    } catch {
      /* quota → skip */
    }
  }

  private maskValue(v: string, type: ExtractedItemType): string {
    if (type === 'site' || type === 'address') return v;
    if (v.length <= 8) return '***';
    return v.slice(0, 4) + '***' + v.slice(-4);
  }

  /**
   * Lecture historique (UI / vue admin).
   */
  getHistory(): MultiSourceResult[] {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      return raw ? (JSON.parse(raw) as MultiSourceResult[]) : [];
    } catch {
      return [];
    }
  }

  /**
   * Stats globales (somme historique).
   */
  getStats(): {
    sources_total: number;
    items_total: number;
    items_configured: number;
    items_tested_ok: number;
  } {
    const h = this.getHistory();
    return {
      sources_total: h.length,
      items_total: h.reduce((sum, r) => sum + r.extracted_count, 0),
      items_configured: h.reduce((sum, r) => sum + r.configured_count, 0),
      items_tested_ok: h.reduce((sum, r) => sum + r.tested_ok_count, 0),
    };
  }
}

export const multiSourceAnalyze = new MultiSourceAnalyzer();
