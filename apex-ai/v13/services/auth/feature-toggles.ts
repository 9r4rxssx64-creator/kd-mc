/**
 * APEX v13 — Feature Toggles ON/OFF (général + per-user).
 *
 * Règle absolue Kevin 2026-05-04 :
 *   "Boutons admin onoff pour tout et tout le monde. Général et individuel"
 *
 * Implémente un registre de 100+ features avec :
 *  - Toggle global (admin Kevin) : `setGlobal(featureId, enabled)`
 *  - Toggle per-user (admin Kevin) : `setForUser(featureId, userId, enabled)`
 *  - Resolution priority : per-user > global > default
 *  - Audit log immuable de chaque mutation (max 500 entries)
 *  - Persistence localStorage (clés ax_feature_toggles_*)
 *  - Bulk operations : enableAll, disableAll, resetDefaults
 *  - Export/Import JSON pour backup admin
 *
 * Helper exporté `isFeatureEnabled(featureId, userId?)` à câbler dans chaque
 * `render(rootEl)` pour court-circuiter les modules désactivés.
 */

import { logger } from '../../core/logger.js';

/* ============================================================
   Types publics
   ============================================================ */

export type FeatureCategory =
  | 'tool'
  | 'module'
  | 'studio'
  | 'pro'
  | 'voice'
  | 'browser'
  | 'sentinel'
  | 'auth'
  | 'admin';

export interface FeatureToggle {
  /** Identifiant stable (ex: 'studio.music', 'voice.tts'). Utilisé dans isEnabled(). */
  id: string;
  /** Catégorie pour regroupement UI */
  category: FeatureCategory;
  /** Description courte pour la vue admin */
  description: string;
  /** État par défaut si pas de toggle global ni per-user défini */
  defaultEnabled: boolean;
}

export interface ToggleHistoryEntry {
  ts: number;
  actor: string;
  action:
    | 'set_global'
    | 'set_user'
    | 'remove_user'
    | 'enable_all'
    | 'disable_all'
    | 'reset_defaults'
    | 'import_config';
  featureId: string;
  userId?: string;
  value: boolean;
}

/* ============================================================
   Storage keys
   ============================================================ */

const STORAGE_GLOBAL = 'ax_feature_toggles_global';
const STORAGE_USER_PREFIX = 'ax_feature_toggles_user_';
const STORAGE_HISTORY = 'ax_feature_toggles_history';
const MAX_HISTORY = 500;

/* ============================================================
   Registry — 100+ features (Kevin règle MAX)
   ============================================================ */

const REGISTRY: readonly FeatureToggle[] = [
  /* === Studios (15) === */
  { id: 'studio.music', category: 'studio', description: 'Studio Mix Musique (12 pistes EQ reverb)', defaultEnabled: true },
  { id: 'studio.video', category: 'studio', description: 'Studio Montage Vidéo', defaultEnabled: true },
  { id: 'studio.cv', category: 'studio', description: 'Studio CV (templates + IA)', defaultEnabled: true },
  { id: 'studio.invoice', category: 'studio', description: 'Studio Facture / Devis', defaultEnabled: true },
  { id: 'studio.contract', category: 'studio', description: 'Studio Contrat (NDA/CDI/CDD)', defaultEnabled: true },
  { id: 'studio.logo', category: 'studio', description: 'Studio Logo / Branding', defaultEnabled: true },
  { id: 'studio.presentation', category: 'studio', description: 'Studio Présentation / Slides', defaultEnabled: true },
  { id: 'studio.prefecture', category: 'studio', description: 'Studio Préfecture (titre séjour, CNI)', defaultEnabled: true },
  { id: 'studio.clip', category: 'studio', description: 'Studio Clip (photo → vidéo)', defaultEnabled: true },
  { id: 'studio.photo', category: 'studio', description: 'Studio Photo (retouche)', defaultEnabled: true },
  { id: 'studio.scan', category: 'studio', description: 'Studio Scan multi-format (OCR/QR/vCard)', defaultEnabled: true },
  { id: 'studio.camera', category: 'studio', description: 'Studio Caméra live', defaultEnabled: true },
  { id: 'studio.architecture', category: 'studio', description: 'Studio Architecture (RE2020, surfaces)', defaultEnabled: true },
  { id: 'studio.plant', category: 'studio', description: 'Studio Plantes (calendrier biodynamique)', defaultEnabled: true },
  { id: 'studio.geo', category: 'studio', description: 'Studio Géolocalisation', defaultEnabled: true },
  { id: 'studio.building', category: 'studio', description: 'Studio Bâtiment (DTU, dimensions, métré)', defaultEnabled: true },
  { id: 'studio.lunar', category: 'studio', description: 'Studio Jardin Lunaire (biodynamie)', defaultEnabled: true },
  { id: 'studio.pet', category: 'studio', description: 'Studio Animaux (santé, ration, vaccins)', defaultEnabled: true },
  { id: 'feature.smart-studios-anticipator', category: 'module', description: 'Smart Studios Anticipator (auto-suggest selon chat)', defaultEnabled: true },

  /* === Modules pro (8) === */
  { id: 'pro.cuisine', category: 'pro', description: 'Cuisine Pro (10 recettes, 22 cuissons, INCO)', defaultEnabled: true },
  { id: 'pro.medical', category: 'pro', description: 'Médical Pro (Vidal, IMC, urgences)', defaultEnabled: true },
  { id: 'pro.finance', category: 'pro', description: 'Finance Pro (IR FR 2026, crédit, PV)', defaultEnabled: true },
  { id: 'pro.legal', category: 'pro', description: 'Légal Pro (18+ codes FR + Cassation)', defaultEnabled: true },
  { id: 'pro.translator', category: 'pro', description: 'Traducteur Pro (30 langues)', defaultEnabled: true },
  { id: 'pro.business', category: 'pro', description: 'Business Intelligence + KPI', defaultEnabled: true },
  { id: 'pro.education', category: 'pro', description: 'Education Pro (cours, exos)', defaultEnabled: true },
  { id: 'pro.certifications', category: 'pro', description: 'Certifications & diplômes', defaultEnabled: true },

  /* === Voice (5) === */
  { id: 'voice.tts', category: 'voice', description: 'Text-to-Speech (50+ voix)', defaultEnabled: true },
  { id: 'voice.stt', category: 'voice', description: 'Speech-to-Text (dictée)', defaultEnabled: true },
  { id: 'voice.wake_word', category: 'voice', description: 'Wake word "Dis Apex"', defaultEnabled: true },
  { id: 'voice.elevenlabs', category: 'voice', description: 'ElevenLabs voix premium', defaultEnabled: false },
  { id: 'voice.biometric', category: 'voice', description: 'Reconnaissance vocale biométrique', defaultEnabled: true },

  /* === Browser (3) === */
  { id: 'browser.iframe', category: 'browser', description: 'Browser intégré (multi-tab + iframe)', defaultEnabled: true },
  { id: 'browser.bookmarks', category: 'browser', description: 'Favoris navigation', defaultEnabled: true },
  { id: 'browser.history', category: 'browser', description: 'Historique de navigation', defaultEnabled: true },

  /* === Sentinelles (22) === */
  { id: 'sentinel.token-watch', category: 'sentinel', description: 'Surveillance quotas tokens IA', defaultEnabled: true },
  { id: 'sentinel.backup-watch', category: 'sentinel', description: 'Backup quotidien Firebase', defaultEnabled: true },
  { id: 'sentinel.security-watch', category: 'sentinel', description: 'Détection intrusions / login suspect', defaultEnabled: true },
  { id: 'sentinel.performance-watch', category: 'sentinel', description: 'Monitoring perf (FPS, latence)', defaultEnabled: true },
  { id: 'sentinel.data-integrity', category: 'sentinel', description: 'Intégrité données + dédup', defaultEnabled: true },
  { id: 'sentinel.error-watch', category: 'sentinel', description: 'Capture erreurs + auto-fix', defaultEnabled: true },
  { id: 'sentinel.ux-watch', category: 'sentinel', description: 'Frustrations UX + clic failures', defaultEnabled: true },
  { id: 'sentinel.import-watch', category: 'sentinel', description: 'Audit imports PDF', defaultEnabled: true },
  { id: 'sentinel.presence-watch', category: 'sentinel', description: 'Heartbeat présence en ligne', defaultEnabled: true },
  { id: 'sentinel.conflict-watch', category: 'sentinel', description: 'Détection conflits sync', defaultEnabled: true },
  { id: 'sentinel.compliance-watch', category: 'sentinel', description: 'CGU + RGPD + permissions', defaultEnabled: true },
  { id: 'sentinel.sentinel-meta', category: 'sentinel', description: 'Surveille les sentinelles', defaultEnabled: true },
  { id: 'sentinel.link-validation', category: 'sentinel', description: 'Re-test liens dashboards quotidien', defaultEnabled: true },
  { id: 'sentinel.credentials-watch', category: 'sentinel', description: 'Re-test validité credentials', defaultEnabled: true },
  { id: 'sentinel.connectivity-watch', category: 'sentinel', description: 'Test ping providers IA / Cloudflare', defaultEnabled: true },
  { id: 'sentinel.ai-health-watch', category: 'sentinel', description: 'Health-check providers IA', defaultEnabled: true },
  { id: 'sentinel.api-quota-watch', category: 'sentinel', description: 'Surveillance rate-limit API', defaultEnabled: true },
  { id: 'sentinel.feature-watch', category: 'sentinel', description: 'Tests scénarios principaux 1×/h', defaultEnabled: true },
  { id: 'sentinel.persistence-watch', category: 'sentinel', description: 'Vérif persistence clés critiques', defaultEnabled: true },
  { id: 'sentinel.dedup-watch', category: 'sentinel', description: 'Dédup UI sources', defaultEnabled: true },
  { id: 'sentinel.malware-blocklist', category: 'sentinel', description: 'Blocklist URL malware/phishing', defaultEnabled: true },
  { id: 'sentinel.csp-violation', category: 'sentinel', description: 'CSP violations watch', defaultEnabled: true },
  { id: 'sentinel.auto-ultra-reset', category: 'sentinel', description: 'Auto Ultra Reset autonome (cache stale + bugs persistants)', defaultEnabled: true },
  { id: 'sentinel.apex-self-correct', category: 'sentinel', description: 'Apex Self-Correct cascade (Kevin "ne JAMAIS attendre")', defaultEnabled: true },
  { id: 'sentinel.global-health', category: 'sentinel', description: 'Global Health méta auto-fix cascade (escalade Claude Code si > 30% fail)', defaultEnabled: true },

  /* === Tools IA (32) === */
  { id: 'tool.web_search', category: 'tool', description: 'Web Search (Brave/Tavily/DDG)', defaultEnabled: true },
  { id: 'tool.image_analyze', category: 'tool', description: 'Analyse image (Vision IA)', defaultEnabled: true },
  { id: 'tool.image_generate', category: 'tool', description: 'Génération image (FLUX/DALL-E)', defaultEnabled: true },
  { id: 'tool.code_execute', category: 'tool', description: 'Exécution code sandbox', defaultEnabled: true },
  { id: 'tool.weather', category: 'tool', description: 'Météo open-meteo', defaultEnabled: true },
  { id: 'tool.calculator', category: 'tool', description: 'Calculatrice scientifique', defaultEnabled: true },
  { id: 'tool.translate', category: 'tool', description: 'Traduction inline', defaultEnabled: true },
  { id: 'tool.qr_generate', category: 'tool', description: 'Générateur QR codes', defaultEnabled: true },
  { id: 'tool.qr_scan', category: 'tool', description: 'Scanner QR codes', defaultEnabled: true },
  { id: 'tool.barcode_scan', category: 'tool', description: 'Scanner codes-barres', defaultEnabled: true },
  { id: 'tool.ocr', category: 'tool', description: 'OCR Tesseract', defaultEnabled: true },
  { id: 'tool.geocode', category: 'tool', description: 'Géocodage / inverse', defaultEnabled: true },
  { id: 'tool.send_email', category: 'tool', description: 'Envoi email (Brevo/Resend)', defaultEnabled: true },
  { id: 'tool.send_sms', category: 'tool', description: 'Envoi SMS (Twilio)', defaultEnabled: false },
  { id: 'tool.send_whatsapp', category: 'tool', description: 'Envoi WhatsApp', defaultEnabled: true },
  { id: 'tool.calendar_create', category: 'tool', description: 'Création évènement calendrier', defaultEnabled: true },
  { id: 'tool.calendar_read', category: 'tool', description: 'Lecture calendrier', defaultEnabled: true },
  { id: 'tool.contacts_read', category: 'tool', description: 'Accès contacts', defaultEnabled: true },
  { id: 'tool.location', category: 'tool', description: 'Géolocalisation GPS', defaultEnabled: true },
  { id: 'tool.notif_send', category: 'tool', description: 'Push notifications', defaultEnabled: true },
  { id: 'tool.share_target', category: 'tool', description: 'Web Share Target', defaultEnabled: true },
  { id: 'tool.bluetooth', category: 'tool', description: 'Web Bluetooth', defaultEnabled: false },
  { id: 'tool.nfc_read', category: 'tool', description: 'Web NFC lecture', defaultEnabled: false },
  { id: 'tool.nfc_write', category: 'tool', description: 'Web NFC écriture', defaultEnabled: false },
  { id: 'tool.usb', category: 'tool', description: 'Web USB', defaultEnabled: false },
  { id: 'tool.midi', category: 'tool', description: 'Web MIDI', defaultEnabled: false },
  { id: 'tool.serial', category: 'tool', description: 'Web Serial', defaultEnabled: false },
  { id: 'tool.print', category: 'tool', description: 'Impression', defaultEnabled: true },
  { id: 'tool.pdf_export', category: 'tool', description: 'Export PDF', defaultEnabled: true },
  { id: 'tool.markdown', category: 'tool', description: 'Rendu Markdown', defaultEnabled: true },
  { id: 'tool.timer', category: 'tool', description: 'Timers / chronos', defaultEnabled: true },
  { id: 'tool.unit_convert', category: 'tool', description: 'Conversion unités universelles', defaultEnabled: true },
  { id: 'feature.cross-check-ia', category: 'tool', description: 'Cross-check IA dual-provider (anti-hallucination)', defaultEnabled: false },

  /* === Auth (4) === */
  { id: 'auth.pin', category: 'auth', description: 'Authentification PIN', defaultEnabled: true },
  { id: 'auth.webauthn', category: 'auth', description: 'WebAuthn / FaceID / TouchID', defaultEnabled: true },
  { id: 'auth.voice_print', category: 'auth', description: 'Auth voix biométrique', defaultEnabled: true },
  { id: 'auth.biometric', category: 'auth', description: 'Auth biométrique générique', defaultEnabled: true },

  /* === Admin views (10) === */
  { id: 'admin.dashboard', category: 'admin', description: 'Dashboard admin', defaultEnabled: true },
  { id: 'admin.vault', category: 'admin', description: 'Coffre-fort secrets', defaultEnabled: true },
  { id: 'admin.kb', category: 'admin', description: 'Knowledge Base GitHub', defaultEnabled: true },
  { id: 'admin.bilan', category: 'admin', description: 'Bilan financier', defaultEnabled: true },
  { id: 'admin.consumption', category: 'admin', description: 'Consommation IA temps réel', defaultEnabled: true },
  { id: 'admin.users', category: 'admin', description: 'Gestion utilisateurs', defaultEnabled: true },
  { id: 'admin.commerce', category: 'admin', description: 'Toggle commercialisation', defaultEnabled: true },
  { id: 'admin.executions', category: 'admin', description: 'Exécutions autonomes', defaultEnabled: true },
  { id: 'admin.toggles', category: 'admin', description: 'Centre de contrôle ON/OFF', defaultEnabled: true },
  { id: 'admin.audit-log', category: 'admin', description: 'Audit log immuable', defaultEnabled: true },

  /* === Modules globaux (12) === */
  { id: 'module.chat', category: 'module', description: 'Chat IA principal', defaultEnabled: true },
  { id: 'module.landing', category: 'module', description: 'Landing page publique', defaultEnabled: true },
  { id: 'module.notes', category: 'module', description: 'Bloc-notes / mémo', defaultEnabled: true },
  { id: 'module.assistants', category: 'module', description: 'Assistants personnalisés (Gems / Custom GPTs)', defaultEnabled: true },
  { id: 'module.canvas', category: 'module', description: 'Canvas / Artifacts (édition + aperçu live)', defaultEnabled: true },
  { id: 'module.projects', category: 'module', description: 'Projets / Workspaces (instructions + base de connaissances)', defaultEnabled: true },
  { id: 'module.scheduled', category: 'module', description: 'Tâches programmées (prompts récurrents)', defaultEnabled: true },
  { id: 'module.calendar', category: 'module', description: 'Calendrier intégré', defaultEnabled: true },
  { id: 'module.calculators', category: 'module', description: 'Calculateurs (impôts, crédit, IMC)', defaultEnabled: true },
  { id: 'module.archive', category: 'module', description: 'Archives projets', defaultEnabled: true },
  { id: 'module.billing', category: 'module', description: 'Facturation utilisateur', defaultEnabled: true },
  { id: 'module.crypto', category: 'module', description: 'Module crypto (wallets pub)', defaultEnabled: true },
  { id: 'module.domotique', category: 'module', description: 'Domotique (Home Assistant)', defaultEnabled: false },
  { id: 'module.remote', category: 'module', description: 'Télécommande universelle', defaultEnabled: true },
  { id: 'module.workflow', category: 'module', description: 'Workflow automation', defaultEnabled: true },
  { id: 'module.laurence', category: 'module', description: 'Vue dédiée Laurence', defaultEnabled: true },

  /* === Memory & Backup (Kevin 2026-05-08 — Pinecone optionnel + realtime backup) === */
  { id: 'feature.pinecone-rag', category: 'tool', description: 'RAG mémoire long-terme via Pinecone (vector search)', defaultEnabled: true },
  { id: 'feature.realtime-backup', category: 'sentinel', description: 'Backup temps-réel persistent_memory (5min) + chat (2min)', defaultEnabled: true },

  /* === Verbosity (Kevin 2026-05-08 — "trop verbeux Plan A/B/C") === */
  { id: 'feature.ia-verbose-plans', category: 'module', description: 'IA verbose : énumère Plan A/B/C quand ambigu (default OFF — Kevin trouve trop verbeux). ON = ancien comportement debug.', defaultEnabled: false },

  /* === Persona (Kevin 2026-09-16 — "que je puisse l'activer et le désactiver quand je veux") === */
  { id: 'persona.javis', category: 'module', description: 'Persona "Javis" (ton, 8 traits, injecté en tête du system prompt). ON par défaut, désactivable global ou par user (OFF = identité neutre "Apex AI", sans le bloc persona).', defaultEnabled: true },
];

/* Index pour lookup O(1) */
const REGISTRY_BY_ID = new Map<string, FeatureToggle>(REGISTRY.map((f) => [f.id, f]));

/* ============================================================
   Helpers JSON safe
   ============================================================ */

function readJsonSafe<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJsonSafe(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    logger.warn('feature-toggles', 'persist failed', { key, err });
    return false;
  }
}

/* ============================================================
   FeatureToggles class
   ============================================================ */

class FeatureToggles {
  /** Retourne la liste readonly des features enregistrées */
  list(): readonly FeatureToggle[] {
    return REGISTRY;
  }

  /** Récupère une feature par id, ou null si inconnue */
  get(id: string): FeatureToggle | null {
    return REGISTRY_BY_ID.get(id) ?? null;
  }

  /** Catégories disponibles (utiles pour rendu UI groupé) */
  listCategories(): readonly FeatureCategory[] {
    const set = new Set<FeatureCategory>();
    for (const f of REGISTRY) set.add(f.category);
    return [...set];
  }

  /** Filtre features par catégorie */
  listByCategory(cat: FeatureCategory): readonly FeatureToggle[] {
    return REGISTRY.filter((f) => f.category === cat);
  }

  /* ---------- Global toggles ---------- */

  private readGlobalMap(): Record<string, boolean> {
    return readJsonSafe<Record<string, boolean>>(STORAGE_GLOBAL, {});
  }

  /** True si la feature est activée globalement (override admin > defaultEnabled) */
  isEnabledGlobal(featureId: string): boolean {
    const f = REGISTRY_BY_ID.get(featureId);
    if (!f) return false; /* feature inconnue → off */
    const map = this.readGlobalMap();
    if (Object.prototype.hasOwnProperty.call(map, featureId)) return Boolean(map[featureId]);
    return f.defaultEnabled;
  }

  /** Mute admin → applique override global enabled/disabled */
  setGlobal(featureId: string, enabled: boolean, actor = 'admin'): boolean {
    if (!REGISTRY_BY_ID.has(featureId)) {
      logger.warn('feature-toggles', 'setGlobal: unknown feature', { featureId });
      return false;
    }
    const map = this.readGlobalMap();
    map[featureId] = enabled;
    if (!writeJsonSafe(STORAGE_GLOBAL, map)) return false;
    this.appendHistory({ ts: Date.now(), actor, action: 'set_global', featureId, value: enabled });
    return true;
  }

  /** Bulk set : `{ id: bool, ... }` (valide chaque id, ignore les inconnus) */
  setGlobalBulk(map: Record<string, boolean>, actor = 'admin'): { applied: number; skipped: number } {
    const current = this.readGlobalMap();
    let applied = 0;
    let skipped = 0;
    for (const [id, val] of Object.entries(map)) {
      if (!REGISTRY_BY_ID.has(id)) {
        skipped++;
        continue;
      }
      current[id] = Boolean(val);
      this.appendHistory({ ts: Date.now(), actor, action: 'set_global', featureId: id, value: Boolean(val) });
      applied++;
    }
    writeJsonSafe(STORAGE_GLOBAL, current);
    return { applied, skipped };
  }

  /* ---------- Per-user toggles ---------- */

  private readUserMap(userId: string): Record<string, boolean> {
    return readJsonSafe<Record<string, boolean>>(STORAGE_USER_PREFIX + userId, {});
  }

  /**
   * Vérifie si la feature est activée pour un user particulier.
   * Resolution : per-user override > global > default.
   */
  isEnabledForUser(featureId: string, userId: string): boolean {
    if (!userId) return this.isEnabledGlobal(featureId);
    const userMap = this.readUserMap(userId);
    if (Object.prototype.hasOwnProperty.call(userMap, featureId)) {
      return Boolean(userMap[featureId]);
    }
    return this.isEnabledGlobal(featureId);
  }

  /** Définit override per-user */
  setForUser(featureId: string, userId: string, enabled: boolean, actor = 'admin'): boolean {
    if (!REGISTRY_BY_ID.has(featureId)) {
      logger.warn('feature-toggles', 'setForUser: unknown feature', { featureId });
      return false;
    }
    if (!userId) return false;
    const map = this.readUserMap(userId);
    map[featureId] = enabled;
    if (!writeJsonSafe(STORAGE_USER_PREFIX + userId, map)) return false;
    this.appendHistory({ ts: Date.now(), actor, action: 'set_user', featureId, userId, value: enabled });
    return true;
  }

  /** Retire l'override per-user (reviendra au global) */
  removeUserOverride(featureId: string, userId: string, actor = 'admin'): boolean {
    if (!userId) return false;
    const map = this.readUserMap(userId);
    if (!Object.prototype.hasOwnProperty.call(map, featureId)) return false;
    delete map[featureId];
    if (!writeJsonSafe(STORAGE_USER_PREFIX + userId, map)) return false;
    this.appendHistory({
      ts: Date.now(),
      actor,
      action: 'remove_user',
      featureId,
      userId,
      value: this.isEnabledGlobal(featureId),
    });
    return true;
  }

  /**
   * Resolution finale : si userId fourni → per-user > global > default.
   * Sinon → global > default.
   */
  isEnabled(featureId: string, userId?: string): boolean {
    if (userId) return this.isEnabledForUser(featureId, userId);
    return this.isEnabledGlobal(featureId);
  }

  /* ---------- Bulk operations admin ---------- */

  /** Active toutes les features globalement */
  enableAll(actor = 'admin'): number {
    const map: Record<string, boolean> = {};
    for (const f of REGISTRY) map[f.id] = true;
    writeJsonSafe(STORAGE_GLOBAL, map);
    this.appendHistory({ ts: Date.now(), actor, action: 'enable_all', featureId: '*', value: true });
    return REGISTRY.length;
  }

  /** Désactive toutes les features globalement */
  disableAll(actor = 'admin'): number {
    const map: Record<string, boolean> = {};
    for (const f of REGISTRY) map[f.id] = false;
    writeJsonSafe(STORAGE_GLOBAL, map);
    this.appendHistory({ ts: Date.now(), actor, action: 'disable_all', featureId: '*', value: false });
    return REGISTRY.length;
  }

  /** Reset → suppression du map global, on retombe sur defaultEnabled */
  resetDefaults(actor = 'admin'): number {
    try {
      localStorage.removeItem(STORAGE_GLOBAL);
    } catch {
      /* ignore */
    }
    this.appendHistory({ ts: Date.now(), actor, action: 'reset_defaults', featureId: '*', value: true });
    return REGISTRY.length;
  }

  /* ---------- Audit history ---------- */

  getHistory(): readonly ToggleHistoryEntry[] {
    return readJsonSafe<ToggleHistoryEntry[]>(STORAGE_HISTORY, []);
  }

  private appendHistory(entry: ToggleHistoryEntry): void {
    const buf = readJsonSafe<ToggleHistoryEntry[]>(STORAGE_HISTORY, []);
    buf.push(entry);
    if (buf.length > MAX_HISTORY) buf.splice(0, buf.length - MAX_HISTORY);
    writeJsonSafe(STORAGE_HISTORY, buf);
  }

  /* ---------- Export / Import ---------- */

  /** Exporte la config globale + per-user en JSON sérialisé */
  exportConfig(): string {
    const global = this.readGlobalMap();
    const users: Record<string, Record<string, boolean>> = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(STORAGE_USER_PREFIX)) continue;
        const uid = k.substring(STORAGE_USER_PREFIX.length);
        users[uid] = this.readUserMap(uid);
      }
    } catch {
      /* localStorage indisponible — on retourne quand même global */
    }
    return JSON.stringify({ version: 1, ts: Date.now(), global, users }, null, 2);
  }

  /** Importe une config exportée précédemment ; valide les ids inconnus → skip */
  importConfig(json: string, actor = 'admin'): { ok: boolean; appliedGlobal: number; appliedUsers: number; skipped: number } {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return { ok: false, appliedGlobal: 0, appliedUsers: 0, skipped: 0 };
    }
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, appliedGlobal: 0, appliedUsers: 0, skipped: 0 };
    }
    const obj = parsed as { global?: Record<string, boolean>; users?: Record<string, Record<string, boolean>> };
    let appliedGlobal = 0;
    let appliedUsers = 0;
    let skipped = 0;
    if (obj.global && typeof obj.global === 'object') {
      const r = this.setGlobalBulk(obj.global, actor);
      appliedGlobal = r.applied;
      skipped += r.skipped;
    }
    if (obj.users && typeof obj.users === 'object') {
      for (const [uid, map] of Object.entries(obj.users)) {
        if (!map || typeof map !== 'object') continue;
        for (const [id, val] of Object.entries(map)) {
          if (!REGISTRY_BY_ID.has(id)) {
            skipped++;
            continue;
          }
          this.setForUser(id, uid, Boolean(val), actor);
          appliedUsers++;
        }
      }
    }
    this.appendHistory({ ts: Date.now(), actor, action: 'import_config', featureId: '*', value: true });
    return { ok: true, appliedGlobal, appliedUsers, skipped };
  }

  /* ---------- Stats ---------- */

  /** Stats agrégées pour vue admin */
  getStats(): { total: number; enabledGlobal: number; disabledGlobal: number; users: number } {
    const total = REGISTRY.length;
    let enabledGlobal = 0;
    for (const f of REGISTRY) {
      if (this.isEnabledGlobal(f.id)) enabledGlobal++;
    }
    let users = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(STORAGE_USER_PREFIX)) users++;
      }
    } catch {
      /* ignore */
    }
    return { total, enabledGlobal, disabledGlobal: total - enabledGlobal, users };
  }
}

export const featureToggles = new FeatureToggles();

/* ============================================================
   Helper exporté — wire global dans render()
   ============================================================ */

/**
 * Helper utilitaire pour câbler dans chaque `feature/*.ts → render(rootEl)`.
 *
 * Pattern :
 * ```ts
 * import { isFeatureEnabled } from '../../services/feature-toggles.js';
 * export function render(rootEl: HTMLElement): void {
 *   const userId = store.get('user')?.id;
 *   if (!isFeatureEnabled('studio.music', userId)) {
 *     rootEl.innerHTML = '<div class="ax-card"><h2>🚫 Désactivé par admin</h2></div>';
 *     return;
 *   }
 *   // ... rendu normal
 * }
 * ```
 */
export function isFeatureEnabled(featureId: string, userId?: string): boolean {
  return featureToggles.isEnabled(featureId, userId);
}

/**
 * HTML standard à afficher quand une feature est désactivée par l'admin.
 * Pratique pour wirer rapidement dans render().
 */
export function renderDisabledNotice(featureId: string): string {
  const f = featureToggles.get(featureId);
  const desc = f?.description ?? featureId;
  return `
    <div class="ax-card" style="padding:32px;text-align:center;color:#999">
      <h2 style="color:#c9a227;margin:0 0 12px 0">🚫 Module désactivé</h2>
      <p style="margin:0 0 16px 0">${desc}</p>
      <p style="font-size:12px;color:#777">Cette fonctionnalité a été désactivée par l'administrateur. Reviens plus tard ou contacte Kevin.</p>
    </div>
  `;
}
