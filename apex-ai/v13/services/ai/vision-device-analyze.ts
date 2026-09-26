/**
 * APEX v13.3.51 — Vision device analyse (Kevin 2026-05-07).
 *
 * Demande Kevin : "j'ai donné photo de mon compte broadlink et photo des
 * info réseau de ma smart tv clayton pour qu'elle se connecte et pilote
 * mais Apex n'a rien fait".
 *
 * Mission : extraire info devices depuis screenshots user (compte
 * Broadlink, écran info Smart TV, etc.) via Claude Vision multimodal,
 * et les structurer pour configuration auto.
 *
 * Use cases :
 * - Photo compte Broadlink → extrait email, token, devices liés
 * - Photo Smart TV info réseau → extrait MAC, IP, marque, modèle
 * - Photo Hue Bridge / Sonos / Generic → extrait fields utiles
 *
 * Pipeline :
 * 1. Compress image si > 1 MB (économie tokens)
 * 2. Build prompt structuré JSON pour extraction fiable
 * 3. Appelle vision.analyze() (failover Anthropic → fallbacks)
 * 4. Parse JSON response → structured data
 * 5. Audit log + lessons learned
 *
 * Reference Kevin règle 1-CLIC :
 * - Helper aussi ouvre modal "Configurer maintenant ?" 1-clic après extract.
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';

import { vision } from './vision.js';

/* ============================================================================
 * Types publics
 * ============================================================================ */

export type DeviceImageType =
  | 'broadlink_account'
  | 'smart_tv'
  | 'hue_bridge'
  | 'sonos'
  | 'router_admin'
  | 'unknown';

export interface BroadlinkAccountAnalysis {
  email?: string;
  token?: string;
  devices?: Array<{ id?: string; name?: string; mac?: string; type?: string }>;
  raw_text: string;
  confidence: number;
}

export interface SmartTVAnalysis {
  mac?: string;
  ip?: string;
  ssid?: string;
  brand?: string;
  model?: string;
  /** Codes IR ou identifiant CEC repérés */
  ir_codes?: string[];
  raw_text: string;
  confidence: number;
}

export interface DeviceInfoAnalysis {
  type: DeviceImageType;
  /** Champs extraits libres (clés normalisées snake_case) */
  extracted_fields: Record<string, string>;
  raw_text: string;
  confidence: number;
}

export interface AnalyzeImageInput {
  imageBase64?: string;
  imageBlob?: Blob;
  imageDataUrl?: string;
}

/* ============================================================================
 * Prompts structurés (JSON-out)
 * ============================================================================ */

const PROMPT_BROADLINK_ACCOUNT = `Tu es un expert configuration domotique.
Cette image est un screenshot d'un compte Broadlink (app mobile, web dashboard, ou export config).
Extrais TOUTES les infos visibles utiles pour piloter les devices Broadlink :
- email (compte)
- token (API token, access_token, ou clé d'API)
- devices : liste {id, name, mac, type} pour chaque device visible

Réponds UNIQUEMENT en JSON strict, sans markdown, sans backticks :
{
  "email": "...",
  "token": "...",
  "devices": [{"id":"...","name":"...","mac":"...","type":"..."}],
  "raw_text": "tout le texte visible (utile pour debug)",
  "confidence": 0.0-1.0
}

Si une info manque, omet-la (ne mets pas null/empty). Si l'image n'est PAS un compte Broadlink, mets confidence: 0 et explique dans raw_text.`;

const PROMPT_SMART_TV = `Tu es un expert configuration TV connectée.
Cette image est un screenshot d'un écran "Information réseau" / "Network Info" / "À propos" d'une Smart TV.
Extrais TOUTES les infos visibles :
- mac (adresse MAC, format XX:XX:XX:XX:XX:XX)
- ip (IPv4)
- ssid (nom du Wi-Fi)
- brand (marque : Samsung, LG, Sony, TCL, Hisense, Clayton, ...)
- model (référence modèle)
- ir_codes (codes IR/CEC visibles si dispo)

Réponds UNIQUEMENT en JSON strict, sans markdown, sans backticks :
{
  "mac": "...",
  "ip": "...",
  "ssid": "...",
  "brand": "...",
  "model": "...",
  "ir_codes": [],
  "raw_text": "tout le texte visible",
  "confidence": 0.0-1.0
}

Si une info manque, omet-la. Si pas une TV, mets confidence: 0.`;

const PROMPT_GENERIC_DEVICE = `Tu es un expert configuration objets connectés.
Cette image est un screenshot d'un device IoT / domotique. Détermine d'abord son type :
- broadlink_account : compte / dashboard Broadlink
- smart_tv : info réseau / à propos d'une Smart TV
- hue_bridge : Philips Hue (bridge ou app)
- sonos : enceinte Sonos
- router_admin : interface admin routeur (OUI/MAC table)
- unknown : autre

Puis extrais TOUS les champs utiles (mac, ip, ssid, token, brand, model, serial, port, etc.).

Réponds UNIQUEMENT en JSON strict :
{
  "type": "broadlink_account|smart_tv|hue_bridge|sonos|router_admin|unknown",
  "extracted_fields": { "field_name": "value", ... },
  "raw_text": "tout le texte visible",
  "confidence": 0.0-1.0
}`;

/* ============================================================================
 * Helpers
 * ============================================================================ */

function dataUrlToBase64(dataUrl: string): string {
  const idx = dataUrl.indexOf('base64,');
  if (idx >= 0) return dataUrl.slice(idx + 7);
  return dataUrl;
}

/** Forme libre du JSON renvoyé par Claude (champs optionnels). */
interface ParsedVisionJson {
  email?: unknown;
  token?: unknown;
  devices?: unknown;
  mac?: unknown;
  ip?: unknown;
  ssid?: unknown;
  brand?: unknown;
  model?: unknown;
  ir_codes?: unknown;
  type?: unknown;
  extracted_fields?: unknown;
  raw_text?: unknown;
  confidence?: unknown;
}

/** Parse robuste : JSON pur, JSON dans markdown, ou texte brut. */
function parseJsonResponse(text: string): ParsedVisionJson | null {
  const trimmed = text.trim();
  /* 1. JSON pur */
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed) as ParsedVisionJson;
    } catch {
      /* fallthrough */
    }
  }
  /* 2. JSON dans bloc markdown ```json ... ``` */
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch && fenceMatch[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as ParsedVisionJson;
    } catch {
      /* fallthrough */
    }
  }
  /* 3. Premier objet JSON trouvé dans le texte */
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]) as ParsedVisionJson;
    } catch {
      /* fallthrough */
    }
  }
  return null;
}

/* ============================================================================
 * Service
 * ============================================================================ */

class VisionDeviceAnalyze {
  /**
   * Analyse photo compte Broadlink → extrait token + devices liés.
   */
  async analyzeBroadlinkAccount(input: AnalyzeImageInput): Promise<BroadlinkAccountAnalysis> {
    const result = await this.runVisionPrompt(input, PROMPT_BROADLINK_ACCOUNT);
    if (!result) {
      return { raw_text: '', confidence: 0 };
    }
    const parsed = parseJsonResponse(result.description);
    if (!parsed) {
      void auditLog.record('vision_device.broadlink.no_json', {
        details: { description: result.description.slice(0, 200) },
      });
      return { raw_text: result.description, confidence: 0 };
    }
    const out: BroadlinkAccountAnalysis = {
      raw_text: typeof parsed.raw_text === 'string' ? parsed.raw_text : result.description,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    };
    if (typeof parsed.email === 'string' && parsed.email) out.email = parsed.email;
    if (typeof parsed.token === 'string' && parsed.token) out.token = parsed.token;
    if (Array.isArray(parsed.devices)) {
      out.devices = parsed.devices.map((d): { id?: string; name?: string; mac?: string; type?: string } => {
        const device = d as Record<string, unknown>;
        const o: { id?: string; name?: string; mac?: string; type?: string } = {};
        if (typeof device['id'] === 'string') o.id = device['id'];
        if (typeof device['name'] === 'string') o.name = device['name'];
        if (typeof device['mac'] === 'string') o.mac = device['mac'];
        if (typeof device['type'] === 'string') o.type = device['type'];
        return o;
      });
    }
    void auditLog.record('vision_device.broadlink.success', {
      details: { has_token: !!out.token, devices_count: out.devices?.length ?? 0, confidence: out.confidence },
    });
    logger.info('vision-device-analyze', 'Broadlink account analyzed', {
      hasToken: !!out.token,
      devicesCount: out.devices?.length ?? 0,
    });
    return out;
  }

  /**
   * Analyse photo Smart TV → extrait MAC, IP, brand, model.
   */
  async analyzeSmartTV(input: AnalyzeImageInput): Promise<SmartTVAnalysis> {
    const result = await this.runVisionPrompt(input, PROMPT_SMART_TV);
    if (!result) return { raw_text: '', confidence: 0 };
    const parsed = parseJsonResponse(result.description);
    if (!parsed) {
      void auditLog.record('vision_device.smart_tv.no_json', {
        details: { description: result.description.slice(0, 200) },
      });
      return { raw_text: result.description, confidence: 0 };
    }
    const out: SmartTVAnalysis = {
      raw_text: typeof parsed.raw_text === 'string' ? parsed.raw_text : result.description,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    };
    if (typeof parsed.mac === 'string' && parsed.mac) out.mac = parsed.mac;
    if (typeof parsed.ip === 'string' && parsed.ip) out.ip = parsed.ip;
    if (typeof parsed.ssid === 'string' && parsed.ssid) out.ssid = parsed.ssid;
    if (typeof parsed.brand === 'string' && parsed.brand) out.brand = parsed.brand;
    if (typeof parsed.model === 'string' && parsed.model) out.model = parsed.model;
    if (Array.isArray(parsed.ir_codes)) {
      out.ir_codes = parsed.ir_codes.filter((c): c is string => typeof c === 'string');
    }
    void auditLog.record('vision_device.smart_tv.success', {
      details: { brand: out.brand, model: out.model, has_mac: !!out.mac, confidence: out.confidence },
    });
    logger.info('vision-device-analyze', 'Smart TV analyzed', {
      brand: out.brand,
      model: out.model,
    });
    return out;
  }

  /**
   * Generic device info extraction (auto-détecte le type).
   */
  async analyzeDeviceInfo(input: AnalyzeImageInput): Promise<DeviceInfoAnalysis> {
    const result = await this.runVisionPrompt(input, PROMPT_GENERIC_DEVICE);
    if (!result) return { type: 'unknown', extracted_fields: {}, raw_text: '', confidence: 0 };
    const parsed = parseJsonResponse(result.description);
    if (!parsed) {
      return { type: 'unknown', extracted_fields: {}, raw_text: result.description, confidence: 0 };
    }
    const validTypes: DeviceImageType[] = [
      'broadlink_account',
      'smart_tv',
      'hue_bridge',
      'sonos',
      'router_admin',
      'unknown',
    ];
    const type: DeviceImageType =
      typeof parsed.type === 'string' && (validTypes as string[]).includes(parsed.type)
        ? (parsed.type as DeviceImageType)
        : 'unknown';
    const extracted: Record<string, string> = {};
    if (parsed.extracted_fields && typeof parsed.extracted_fields === 'object') {
      const fields = parsed.extracted_fields as Record<string, unknown>;
      for (const [k, v] of Object.entries(fields)) {
        if (typeof v === 'string' && v) extracted[k] = v;
        else if (typeof v === 'number') extracted[k] = String(v);
      }
    }
    const out: DeviceInfoAnalysis = {
      type,
      extracted_fields: extracted,
      raw_text: typeof parsed.raw_text === 'string' ? parsed.raw_text : result.description,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    };
    void auditLog.record('vision_device.generic.success', {
      details: { type: out.type, fields_count: Object.keys(extracted).length, confidence: out.confidence },
    });
    return out;
  }

  /**
   * Détecte automatiquement le type d'image (broadlink/smarttv/...) puis lance l'analyse appropriée.
   * Utilisé par chat handler pour reconnaitre upload device-related sans prompt user.
   */
  async autoDetectAndAnalyze(input: AnalyzeImageInput): Promise<{
    type: DeviceImageType;
    broadlink?: BroadlinkAccountAnalysis;
    smartTv?: SmartTVAnalysis;
    generic: DeviceInfoAnalysis;
  }> {
    const generic = await this.analyzeDeviceInfo(input);
    const out: {
      type: DeviceImageType;
      broadlink?: BroadlinkAccountAnalysis;
      smartTv?: SmartTVAnalysis;
      generic: DeviceInfoAnalysis;
    } = { type: generic.type, generic };
    if (generic.type === 'broadlink_account' && generic.confidence >= 0.5) {
      out.broadlink = await this.analyzeBroadlinkAccount(input);
    } else if (generic.type === 'smart_tv' && generic.confidence >= 0.5) {
      out.smartTv = await this.analyzeSmartTV(input);
    }
    return out;
  }

  /* ============================================================================
   * Internal — appelle vision.analyze() avec normalisation input
   * ============================================================================ */
  private async runVisionPrompt(
    input: AnalyzeImageInput,
    prompt: string,
  ): Promise<{ description: string } | null> {
    try {
      const opts: {
        prompt: string;
        imageBase64?: string;
        imageBlob?: Blob;
      } = { prompt };
      if (input.imageBlob) {
        opts.imageBlob = input.imageBlob;
      } else if (input.imageDataUrl) {
        opts.imageBase64 = dataUrlToBase64(input.imageDataUrl);
      } else if (input.imageBase64) {
        opts.imageBase64 = input.imageBase64;
      } else {
        return null;
      }
      const result = await vision.analyze(opts);
      return { description: result.description };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('vision-device-analyze', 'runVisionPrompt failed', { err: msg });
      void auditLog.record('vision_device.fail', { details: { error: msg.slice(0, 200) } });
      return null;
    }
  }
}

export const visionDeviceAnalyze = new VisionDeviceAnalyze();
