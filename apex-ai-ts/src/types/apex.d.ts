/**
 * apex.d.ts — Déclarations TypeScript globales pour Apex AI
 *
 * Couvre les structures principales :
 * - Objet K (state global)
 * - axState namespace
 * - AX_PROJECTS_REGISTRY
 * - Helpers Apex Code Companion
 * - Helpers Compliance / AI Safety / Architecture
 */

declare global {
  // ==================== STATE GLOBAL K ====================
  interface ApexUser {
    id: string;
    name: string;
    email?: string;
    role?: "admin" | "user";
  }

  interface ApexSettings {
    model?: string;
    lang?: string;
    theme?: string;
    apiTimeout?: number;
    webSearch?: boolean;
    ttsEnabled?: boolean;
    voice?: string;
    persona?: string;
  }

  interface ApexMessage {
    role: "user" | "assistant" | "system";
    content: string | Array<{ type: string; text?: string; source?: any }>;
    ts: number;
    id?: string;
    incomplete?: boolean;
    reaction?: string;
    _scanned?: boolean;
    _semanticScanned?: boolean;
    _hallucinationFlags?: string[];
    _lowConfidence?: boolean;
    _lowAdaptiveConfidence?: boolean;
  }

  interface ApexConversation {
    id: string;
    title?: string;
    ts: number;
    project?: string;
    pinned?: boolean;
    archived?: boolean;
  }

  interface ApexState {
    user: ApexUser | null;
    settings: ApexSettings;
    messages: ApexMessage[];
    conversations: ApexConversation[];
    activeConvId: string | null;
    isStreaming: boolean;
    view: string;
    kb?: { facts: any[]; instructions: any[] };
  }

  interface Window {
    K: ApexState;
    APP_VER: string;
    ADMIN_ID: string;
    axState: ApexState;

    // ==================== APEX CODE COMPANION ====================
    AX_GH_REPO: string;
    AX_GH_BRANCH_DEFAULT: string;
    axCodeReadFile: (path: string, ref?: string) => Promise<string | null>;
    axCodeListFiles: (dir?: string, ref?: string) => Promise<Array<{
      name: string; path: string; type: string; size: number; sha: string;
    }>>;
    axCodeWriteFile: (
      path: string,
      content: string,
      message?: string,
      branch?: string
    ) => Promise<{ ok?: boolean; error?: string; content?: any; commit?: any }>;
    axCodeCreateBranch: (name: string, fromBranch?: string) => Promise<any>;
    axCodeCreatePR: (title: string, head: string, base?: string, body?: string) => Promise<any>;
    axCodeMergePR: (num: number, method?: "squash" | "merge" | "rebase") => Promise<any>;
    axCodeListWorkflowRuns: (workflow?: string, status?: string) => Promise<any[]>;
    axCodeAskClaudeToFix: (filePath: string, issue: string) => Promise<any>;

    // ==================== COMPLIANCE ====================
    axComputeAge: (birthdateISO: string) => number | null;
    axApdpEscalate: (breachId?: string) => any;
    axShowConsentBanner: (force?: boolean) => void;
    axGetConsent: (feature: string) => boolean | null;
    axDPAStatus: () => Record<string, string | null>;
    axMarkDPASigned: (party: string, dateStr?: string) => boolean;

    // ==================== AI SAFETY ====================
    axDetectJailbreak: (text: string) => { jailbreak: boolean; pattern?: string };
    axValidatePersona: (persona: string) => string;
    axScanResponseForFakeUrls: (text: string) => { ok: boolean; fakeUrls?: string[] };
    axScanSemanticHallucination: (text: string) => { suspect: boolean; types: string[] };
    axJailbreakMetrics: () => { total: number; tp: number; fp: number; precision_pct: number | null };
    axAdaptiveConfidence: (model: string, response: { confidence?: number }) => {
      model: string;
      threshold: number;
      confidence: number;
      ok: boolean;
      recommend_action: string;
    };
    AX_PERSONA_WHITELIST: string[];
    AX_CONFIDENCE_THRESHOLDS: Record<string, number>;

    // ==================== SECURITY ====================
    axIsAdminStrict: () => boolean;
    axCheckPin: (pin: string) => boolean;
    axRecordPinFail: () => { count: number; until: number };
    axResetPinFails: () => void;
    axMigrateLSEncrypt: () => Promise<void>;
    axSafeHTML: (target: HTMLElement | null, html: string) => void;
    axFirebaseAuthSignIn: (uid: string, pinHash: string) => Promise<{ ok: boolean; uid?: string; error?: string }>;
    axFirebaseAuthIsValid: () => boolean;

    // ==================== CODE QUALITY ====================
    _axSafeCatch: (ctx: string, e: Error | unknown, level?: "info" | "warn" | "err" | "critical") => void;
    _axSafeRun: <T>(label: string, fn: () => T, defaultVal?: T) => T;
    _axSafeRunAsync: <T>(label: string, fn: () => Promise<T>, defaultVal?: T) => Promise<T>;
    axSafeCatchLogQuery: (filter?: { level?: string; ctx?: string; sinceMs?: number }) => any[];
    axJsdocLint: (fnName?: string) => {
      total?: number;
      with_jsdoc?: number;
      coverage_pct?: number;
      missing?: string[];
      has_jsdoc?: boolean;
    };
    axCyclomaticComplexity: (fnName: string) => { fnName: string; complexity: number; length: number } | null;
    axComplexityReport: (threshold?: number) => { ts: number; threshold: number; count: number; functions: any[] };

    // ==================== ARCHITECTURE ====================
    axDependencyGraph: () => {
      ts: number;
      nodes: Array<{ id: string; type: string }>;
      edges: Array<{ from: string; to: string }>;
      summary: { node_count: number; edge_count: number };
    };
    AX_MODULE_MANIFEST: Array<{ id: string; fns: string[]; deps: string[] }>;
    axModuleHealth: () => {
      ts: number;
      modules: Array<{ id: string; status: string; missing: string[]; total: number }>;
      summary: { ok: number; missing: number };
    };

    // ==================== PROJECTS ====================
    AX_PROJECTS_REGISTRY: Array<{
      id: string;
      name: string;
      path: string;
      health_keys: string[];
      required_tokens: string[];
    }>;
    AX_APEX_PROJECTS_TOKENS: Array<{
      key: string;
      label: string;
      url: string;
      required: boolean;
      project: string;
    }>;
    axProjectsAudit: () => {
      ts: number;
      projects: Array<{ id: string; name: string; status: string; issues: string[] }>;
      summary: { ok: number; warn: number; err: number; missing_tokens: string[] };
    };
    axAuditApexProjectsTokens: () => { present: any[]; missing: any[]; total: number };
    axCreateSocialVideo: (opts: {
      topic?: string;
      niche?: string;
      format?: "long" | "short";
      template?: string;
      platform?: string;
      lang?: string;
      schedule?: string | null;
    }) => Promise<{ ok: boolean; error?: string }>;

    // ==================== UTILITIES ====================
    lg: (key: string, defaultVal?: any) => any;
    ls: (key: string, value: any) => void;
    esc: (str: string) => string;
    toast: (msg: string, type?: "ok" | "warn" | "err" | "info", opts?: any) => void;
    dc: () => void;
    sv: (view: string) => void;
    now: () => number;

    // ==================== EVENT HOOKS ====================
    _axInnerHTMLPatched?: boolean;
    _axAdminHardened?: boolean;
    _axCheckPinWrapped?: boolean;
    _axCallClaudeWrapped?: boolean;
    _axStreamScanWired?: boolean;
    _axSemanticHallucinationWired?: boolean;
    _axListenerTrackerActive?: boolean;
    _axIntervalRegistryActive?: boolean;
    _axLsCriticalAudit?: boolean;
    _axApexCodeRouteWired?: boolean;
    _axPhase5Wired?: boolean;
  }
}

export {};
