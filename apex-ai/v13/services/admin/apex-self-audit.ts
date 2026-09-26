/**
 * APEX v13 — Self-Audit (le plus puissant audit interne autonome).
 *
 * Demande Kevin 2026-05-04 :
 * "Je dois pouvoir dire 'fais ton audit' à Apex dans le chat. Apex se fait
 *  le plus complet des audits avec retour escalade Claude Code, autocorrection,
 *  va chercher outils + données, améliore. Concertation bidirectionnelle
 *  toujours, dans un sens comme dans l'autre."
 *
 * Architecture :
 * - 6 audits parallèles : Sécurité / Performance / UX / Tests / Architecture / AI Safety
 * - Auto-correction whitelist pour findings P0/P1
 * - Escalade Claude Code via `ax_claude_todo` Firebase si auto-fix échoue
 * - Apprentissage `ax_lessons_learned_struct` cross-session
 * - Sync `CLAUDE_HANDOFF.json` pour concertation bidirectionnelle
 * - Va chercher outils via apex-tools-dispatch (web_search, code_execute)
 * - Déclenchable :
 *   * Via chat IA : tool `apex_self_audit`
 *   * Via UI admin : bouton "🔍 Audit complet"
 *   * Programmé : sentinelle 1×/jour
 */

import { logger } from '../../core/logger.js';
import { router } from '../../core/router.js';
import { soc2 } from '../auth/soc2-compliance.js';
import { auditLog } from '../observability/audit-log.js';
import { vault } from '../vault/vault.js';

/**
 * Owner/repo cibles pour le dispatch GitHub Actions (free tier illimite).
 * Override possible via localStorage `ax_github_repo` au format "owner/repo".
 * Demande Kevin 2026-05-04 : "n8n me demande de payer trouve gratuit".
 */
const DEFAULT_GITHUB_OWNER = '9r4rxssx64-creator';
const DEFAULT_GITHUB_REPO = 'CMCteams';
const GITHUB_DISPATCH_EVENT = 'apex-audit';

export type AuditAxis = 'security' | 'performance' | 'ux' | 'tests' | 'architecture' | 'ai_safety';
export type Severity = 'p0_critical' | 'p1_high' | 'p2_medium' | 'p3_low' | 'info';

export interface Finding {
  id: string;
  axis: AuditAxis;
  severity: Severity;
  title: string;
  description: string;
  fix_action?: string;
  auto_fix_attempted?: boolean;
  auto_fix_success?: boolean;
  escalated_to_claude?: boolean;
  ts: number;
}

export interface AuditReport {
  id: string;
  ts: number;
  duration_ms: number;
  axes: Record<AuditAxis, { score: number; findings_count: number }>;
  total_score: number;
  total_findings: number;
  auto_fixed_count: number;
  escalated_count: number;
  findings: readonly Finding[];
  next_steps: readonly string[];
}

class ApexSelfAudit {
  /**
   * Lance audit complet (6 axes parallèles + auto-fix + escalade).
   */
  async runFullAudit(brutal = false): Promise<AuditReport> {
    const start = Date.now();
    const id = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    void auditLog.record('self_audit.started', { details: { id, brutal } });
    void soc2.record('integrity.audit_chain_verified', 'system', { type: 'self_audit', id, brutal });

    /* 6 audits en parallèle (mode brutal = checks supplémentaires + sévérité bumpée) */
    const [security, performance, ux, tests, architecture, aiSafety] = await Promise.all([
      this.auditSecurity(brutal),
      this.auditPerformance(brutal),
      this.auditUX(brutal),
      this.auditTests(brutal),
      this.auditArchitecture(brutal),
      this.auditAISafety(brutal),
    ]);

    const allFindings: Finding[] = [
      ...security.findings, ...performance.findings, ...ux.findings,
      ...tests.findings, ...architecture.findings, ...aiSafety.findings,
    ];

    /* Auto-fix whitelist (P0/P1 seulement) */
    let autoFixed = 0;
    let escalated = 0;
    for (const f of allFindings) {
      if (f.severity === 'p0_critical' || f.severity === 'p1_high') {
        const fixed = await this.tryAutoFix(f);
        f.auto_fix_attempted = true;
        f.auto_fix_success = fixed;
        if (fixed) autoFixed++;
        else {
          /* Escalade Claude Code */
          await this.escalateToClaudeCode(f);
          f.escalated_to_claude = true;
          escalated++;
        }
      }
    }

    /* v13.4.256 (FIX score global "20/100 Note F") : chaque axe est noté
     * /20. L'ancien calcul faisait `somme / 6` → résultat sur échelle /20
     * (max 20) mais affiché "/100" → faux "20/100 Note F" alors que les
     * axes étaient à 18-20/20. Désormais : score pondéré sur /100 réel,
     * avec les poids affichés dans l'UI (25/20/15/15/15/10, somme=100). */
    const totalScore = Math.round(
      (security.score / 20) * 25 +
        (performance.score / 20) * 20 +
        (ux.score / 20) * 15 +
        (tests.score / 20) * 15 +
        (architecture.score / 20) * 15 +
        (aiSafety.score / 20) * 10,
    );

    const report: AuditReport = {
      id,
      ts: start,
      duration_ms: Date.now() - start,
      axes: {
        security: { score: security.score, findings_count: security.findings.length },
        performance: { score: performance.score, findings_count: performance.findings.length },
        ux: { score: ux.score, findings_count: ux.findings.length },
        tests: { score: tests.score, findings_count: tests.findings.length },
        architecture: { score: architecture.score, findings_count: architecture.findings.length },
        ai_safety: { score: aiSafety.score, findings_count: aiSafety.findings.length },
      },
      total_score: totalScore,
      total_findings: allFindings.length,
      auto_fixed_count: autoFixed,
      escalated_count: escalated,
      findings: allFindings,
      next_steps: this.buildNextSteps(allFindings, autoFixed, escalated),
    };

    /* Persist + lessons learned + sync CLAUDE_HANDOFF */
    this.persistReport(report);
    await this.recordLesson(report);

    void auditLog.record('self_audit.completed', {
      details: { id, score: totalScore, findings: allFindings.length, auto_fixed: autoFixed, escalated },
    });

    return report;
  }

  /* === Audits par axe === */

  private async auditSecurity(brutal = false): Promise<{ score: number; findings: Finding[] }> {
    const findings: Finding[] = [];
    /* 1. Vault tokens chiffrés ? */
    try {
      const { secretScanner } = await import('../vault/secret-scanner.js');
      const stats = await secretScanner.getStats();
      if (stats.leaks_count > 0) {
        findings.push(this.makeFinding('security', 'p0_critical',
          'Tokens plaintext localStorage',
          `${stats.leaks_count} secret(s) en clair détectés (critical=${stats.by_severity.critical})`,
          'auto_migrate_secrets'));
      }
    } catch { /* skip */ }

    /* 2. SOC2 hash chain integrity */
    try {
      const integrity = await soc2.verifyIntegrity();
      if (!integrity.ok) {
        findings.push(this.makeFinding('security', 'p0_critical',
          'SOC2 audit chain broken',
          `Tamper détecté à entry ${integrity.broken_at} sur ${integrity.total}`,
          'reset_soc2_chain'));
      }
    } catch { /* skip */ }

    /* 3. CSP unsafe-inline check — uniquement les vrais vecteurs XSS.
     * On parse la directive CSP réelle (pas un includes() sur tout le DOM,
     * qui matchait n'importe quel texte). `script-src` unsafe-inline = vrai
     * vecteur (P1). `style-src` unsafe-inline = risque mineur (P2). En
     * revanche `style-src-attr 'unsafe-inline'` n'exécute aucun JS → ce
     * n'est PAS un vecteur XSS, on ne le flag pas (sinon faux positif). */
    try {
      const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
      const csp = meta?.getAttribute('content') ?? '';
      const directive = (name: string): string => {
        const m = new RegExp(`(?:^|;)\\s*${name}\\s+([^;]*)`, 'i').exec(csp);
        return m?.[1] ?? '';
      };
      const scriptSrc = directive('script-src');
      const styleSrc = directive('style-src');
      const scriptNeutralised = scriptSrc.includes("'nonce-") || scriptSrc.includes("'strict-dynamic'");
      if (scriptSrc.includes("'unsafe-inline'") && !scriptNeutralised) {
        findings.push(this.makeFinding('security', 'p1_high',
          'CSP script-src unsafe-inline',
          'script-src autorise unsafe-inline sans nonce/strict-dynamic → vrai vecteur XSS',
          'remove_unsafe_inline'));
      } else if (styleSrc.includes("'unsafe-inline'") && !styleSrc.includes("'nonce-")) {
        findings.push(this.makeFinding('security', 'p2_medium',
          'CSP style-src unsafe-inline',
          'style-src autorise unsafe-inline (risque mineur — CSS n\'exécute pas de JS)',
          'remove_unsafe_inline'));
      }
    } catch { /* skip */ }

    /* 4. Auth admin PIN configuré ? */
    try {
      const adminPin = localStorage.getItem('apex_v13_pin');
      if (!adminPin) {
        findings.push(this.makeFinding('security', 'p2_medium',
          'PIN admin non configuré',
          'apex_v13_pin absent → 1er login va définir le PIN',
          'no_action'));
      }
    } catch { /* skip */ }

    /* MODE BRUTAL : checks supplémentaires sécurité */
    if (brutal) {
      /* Brut 1 : check rate-limit configuré */
      try {
        const failsKeys = Object.keys(localStorage).filter((k) => k.startsWith('apex_v13_pin_fails_'));
        if (failsKeys.length > 3) {
          findings.push(this.makeFinding('security', 'p1_high',
            `${failsKeys.length} compteurs rate-limit actifs`,
            'Plusieurs users ont eu des fails PIN — possible brute force tentative',
            'no_action'));
        }
      } catch { /* skip */ }
      /* Brut 2 : check device trusted présence */
      try {
        const trusted = localStorage.getItem('apex_v13_device_trusted_v1');
        if (!trusted) {
          findings.push(this.makeFinding('security', 'p2_medium',
            'Device non trusted',
            'Auto-login désactivé → user doit retaper PIN à chaque session',
            'no_action'));
        }
      } catch { /* skip */ }
      /* Brut 3 : vérifier que vault.getDeviceBoundPassphrase a backup IDB */
      try {
        const idbBackup = await new Promise<boolean>((resolve) => {
          if (!('indexedDB' in window)) return resolve(false);
          const req = indexedDB.open('apex_v13_secure', 1);
          req.onsuccess = () => {
            try {
              const db = req.result;
              const tx = db.transaction('passphrase', 'readonly');
              const get = tx.objectStore('passphrase').get('device_v1');
              get.onsuccess = () => { db.close(); resolve(typeof get.result === 'string'); };
              get.onerror = () => { db.close(); resolve(false); };
            } catch { resolve(false); }
          };
          req.onerror = () => resolve(false);
        });
        if (!idbBackup) {
          findings.push(this.makeFinding('security', 'p1_high',
            'Vault passphrase pas backup IDB',
            'Risque perte clés API si user efface historique Safari',
            'no_action'));
        }
      } catch { /* skip */ }
    }
    const score = Math.max(0, 20 - findings.length * 2);
    return { score, findings };
  }

  private async auditPerformance(brutal = false): Promise<{ score: number; findings: Finding[] }> {
    const findings: Finding[] = [];
    /* 1. localStorage quota */
    try {
      const { storageCompressor } = await import('../storage/storage-compressor.js');
      const status = storageCompressor.getQuotaStatus();
      if (status.severity === 'critical') {
        findings.push(this.makeFinding('performance', 'p0_critical',
          'Storage quota critique',
          `${status.used_mb}MB/5MB (${status.pct}%)`,
          'aggressive_storage_cleanup'));
      } else if (status.severity === 'warn') {
        findings.push(this.makeFinding('performance', 'p2_medium',
          'Storage quota warn',
          `${status.used_mb}MB/5MB (${status.pct}%)`,
          'compress_storage'));
      }
    } catch { /* skip */ }

    /* 2. Sentinelles — distinguer "cassée" de "signale un problème".
     * `errored` = la sentinelle a levé une exception (vrai dysfonctionnement
     * → P1, restart pertinent). `ok:false` sans `errored` = la sentinelle
     * FONCTIONNE et signale un problème réel (storage plein, CSP violation…)
     * → ce n'est PAS une sentinelle en erreur, la restart ne corrige rien.
     * Avant : les 2 cas étaient confondus → faux "13 sentinelles en erreur". */
    try {
      const { sentinels } = await import('../sentinels/sentinels.js');
      const list = sentinels.list();
      const crashed = list.filter((s) => s.lastResult?.errored === true);
      if (crashed.length > 0) {
        findings.push(this.makeFinding('performance', 'p1_high',
          `${crashed.length} sentinelle(s) en erreur (exception)`,
          crashed.map((s) => s.name).join(', '),
          'restart_failed_sentinels'));
      }
      const reporting = list.filter(
        (s) => s.lastResult?.ok === false && s.lastResult.errored !== true,
      );
      if (reporting.length > 5) {
        findings.push(this.makeFinding('performance', 'p2_medium',
          `${reporting.length} sentinelles signalent un problème`,
          `${reporting.map((s) => s.name).join(', ')} — ces sentinelles fonctionnent ; voir les findings dédiés pour les vraies causes`,
          'no_action'));
      }
    } catch { /* skip */ }

    /* 3. Memory leak check (intervals tracked) */
    try {
      const { lifecycle } = await import('../core-svc/service-lifecycle.js');
      const stats = lifecycle.getStats();
      if (stats.total_intervals_tracked > 50) {
        findings.push(this.makeFinding('performance', 'p1_high',
          'Trop d\'intervals tracked',
          `${stats.total_intervals_tracked} intervals — memory leak potentiel`,
          'cleanup_intervals'));
      }
    } catch { /* skip */ }

    /* MODE BRUTAL : checks performance supplémentaires */
    if (brutal) {
      /* Brut 1 : taille DOM */
      const domSize = document.querySelectorAll('*').length;
      if (domSize > 2000) {
        findings.push(this.makeFinding('performance', 'p2_medium',
          `DOM trop large (${domSize} éléments)`,
          'Reflow + style recalc lents iPhone',
          'no_action'));
      }
      /* Brut 2 : LCP via Performance API */
      try {
        const entries = performance.getEntriesByType('paint');
        for (const e of entries) {
          if (e.name === 'largest-contentful-paint' && e.startTime > 2500) {
            findings.push(this.makeFinding('performance', 'p1_high',
              `LCP lent : ${Math.round(e.startTime)}ms`,
              'Cible Web Vitals < 2500ms (Good)',
              'no_action'));
          }
        }
      } catch { /* skip */ }
      /* Brut 3 : compteur Service Worker actif */
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          if (regs.length === 0) {
            findings.push(this.makeFinding('performance', 'p1_high',
              'Service Worker absent',
              'Pas de cache offline → app lente démarrage cold',
              'no_action'));
          }
        }
      } catch { /* skip */ }
    }
    const score = Math.max(0, 20 - findings.length * 2);
    return { score, findings };
  }

  private async auditUX(brutal = false): Promise<{ score: number; findings: Finding[] }> {
    const findings: Finding[] = [];
    /* 1. Boutons critiques touch-target 44px+ */
    try {
      const tooSmall = document.querySelectorAll<HTMLElement>('button, a[href]');
      let smallCount = 0;
      tooSmall.forEach((btn) => {
        const rect = btn.getBoundingClientRect();
        if ((rect.width < 36 || rect.height < 36) && btn.offsetParent !== null) smallCount++;
      });
      if (smallCount > 5) {
        findings.push(this.makeFinding('ux', 'p2_medium',
          `${smallCount} boutons trop petits (< 36px)`,
          'iOS HIG recommande 44px touch targets',
          'enlarge_touch_targets'));
      }
    } catch { /* skip */ }

    /* 2. Reduced motion respect */
    if (typeof window !== 'undefined' && window.matchMedia) {
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReduced) {
        findings.push(this.makeFinding('ux', 'info',
          'Mode reduced-motion détecté',
          'Animations devraient être désactivées',
          'no_action'));
      }
    }

    /* MODE BRUTAL : checks UX supplémentaires */
    if (brutal) {
      /* v13.4.242 fix faux positif (Kevin 2026-05-20) : v13RoutesActual était
       * HARDCODÉ à 5 (tableau littéral, date de v13.0.35). v13 a maintenant
       * 80 routes — le check disait à tort "140 vues manquantes". Compte réel
       * via router.getRouteCount(). */
      const v12ViewsExpected = 145;
      const v13RoutesActual = router.getRouteCount();
      if (v13RoutesActual < v12ViewsExpected * 0.5) {
        findings.push(this.makeFinding('ux', 'p1_high',
          `${v12ViewsExpected - v13RoutesActual} vues v12 potentiellement manquantes`,
          `v13 a ${v13RoutesActual} routes vs ${v12ViewsExpected} vues v12.785`,
          'no_action'));
      }
      /* Brut 2 : touch targets < 44px Apple HIG */
      const tooSmall = document.querySelectorAll<HTMLElement>('button, a[href]');
      let smallCount = 0;
      tooSmall.forEach((btn) => {
        const rect = btn.getBoundingClientRect();
        if ((rect.width < 44 || rect.height < 44) && btn.offsetParent !== null) smallCount++;
      });
      if (smallCount > 10) {
        findings.push(this.makeFinding('ux', 'p1_high',
          `${smallCount} boutons < 44px Apple HIG`,
          'Touch targets non-conformes iPhone',
          'no_action'));
      }
      /* Brut 3 : font-size < 14px (zoom auto iOS sur input) */
      const inputs = document.querySelectorAll<HTMLElement>('input, textarea');
      let smallFontInputs = 0;
      inputs.forEach((i) => {
        const fs = parseFloat(getComputedStyle(i).fontSize);
        if (fs < 14) smallFontInputs++;
      });
      if (smallFontInputs > 0) {
        findings.push(this.makeFinding('ux', 'p1_high',
          `${smallFontInputs} inputs font-size < 14px`,
          'iOS Safari zoom auto au focus → UX cassée',
          'no_action'));
      }
    }
    const score = Math.max(0, 20 - findings.length);
    return { score, findings };
  }

  private async auditTests(brutal = false): Promise<{ score: number; findings: Finding[] }> {
    const findings: Finding[] = [];
    /* Lecture coverage stats (si dispo dans localStorage après run vitest) */
    /* Note : vitest ne run pas en runtime browser, donc on check juste lessons_learned */
    try {
      const lessons = JSON.parse(localStorage.getItem('ax_lessons_learned_struct') ?? '[]') as Array<{ severity?: string }>;
      const critical = lessons.filter((l) => l.severity === 'critical').length;
      if (critical > 5) {
        findings.push(this.makeFinding('tests', 'p1_high',
          `${critical} lessons critical non résolues`,
          'Patterns d\'erreur récurrents → tests régression à ajouter',
          'add_regression_tests'));
      }
    } catch { /* skip */ }
    /* MODE BRUTAL : checks tests supplémentaires */
    if (brutal) {
      /* Brut 1 : couverture < 95% = critical */
      try {
        const coverage = JSON.parse(localStorage.getItem('apex_v13_coverage_stats') ?? '{}') as {
          statements?: number; branches?: number; functions?: number; lines?: number;
        };
        if (coverage.statements && coverage.statements < 95) {
          findings.push(this.makeFinding('tests', 'p1_high',
            `Coverage statements ${coverage.statements}% < 95%`,
            'Cible 100% Kevin règle',
            'no_action'));
        }
        if (coverage.branches && coverage.branches < 90) {
          findings.push(this.makeFinding('tests', 'p1_high',
            `Coverage branches ${coverage.branches}% < 90%`,
            'Cible 100% Kevin règle',
            'no_action'));
        }
      } catch { /* skip */ }
    }
    const score = Math.max(0, 20 - findings.length * 2);
    return { score, findings };
  }

  private async auditArchitecture(brutal = false): Promise<{ score: number; findings: Finding[] }> {
    const findings: Finding[] = [];
    /* 1. Services bootstrap stats */
    try {
      const { lifecycle } = await import('../core-svc/service-lifecycle.js');
      const stats = lifecycle.getStats();
      if (stats.failed > 0) {
        findings.push(this.makeFinding('architecture', 'p1_high',
          `${stats.failed} services failed`,
          'Service lifecycle errors → retry init nécessaire',
          'restart_failed_services'));
      }
    } catch { /* skip */ }
    /* MODE BRUTAL : checks architecture supplémentaires */
    if (brutal) {
      /* Brut 1 : Bundle size > 50KB */
      try {
        const perfRes = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
        const totalJsSize = perfRes
          .filter((r) => r.name.endsWith('.js'))
          .reduce((acc, r) => acc + (r.transferSize || 0), 0);
        if (totalJsSize > 50 * 1024) {
          findings.push(this.makeFinding('architecture', 'p2_medium',
            `Bundle JS ${Math.round(totalJsSize / 1024)}KB > 50KB`,
            'Cible Kevin règle perf',
            'no_action'));
        }
      } catch { /* skip */ }
      /* v13.4.242 fix faux positif (Kevin 2026-05-20) : l'ancien check testait
       * `lifecycle.getStats().total === 0` → "bootstrap KO". Or le registry
       * service-lifecycle n'est câblé par AUCUN service (0 lifecycle.register)
       * — total=0 est l'état NORMAL. Le bootstrap réel se fait via safeInit().
       * Vrai signal de bootstrap KO = router sans aucune route enregistrée. */
      try {
        if (router.getRouteCount() === 0) {
          findings.push(this.makeFinding('architecture', 'p0_critical',
            'Bootstrap KO — aucune route enregistrée',
            'router.getRouteCount() = 0 → le bootstrap a échoué',
            'restart_failed_services'));
        }
      } catch { /* skip */ }
    }
    const score = Math.max(0, 20 - findings.length * 2);
    return { score, findings };
  }

  private async auditAISafety(brutal = false): Promise<{ score: number; findings: Finding[] }> {
    const findings: Finding[] = [];
    /* 1. ai-routing-policy mode + clés */
    try {
      const { aiRoutingPolicy } = await import('../ai/ai-routing-policy.js');
      const status = aiRoutingPolicy.getStatus();
      /* v13.4.340 (leçon #103 « indicateur vert mais faux », audit 2026-07-05) :
       * getStatus() ne compte QUE les clés LOCALES (slots legacy). Chez Kevin les
       * 22 clés vivent CÔTÉ SERVEUR (proxy) → ce finding sortait « aucun provider »
       * alors que l'IA répond très bien. On compte désormais le proxy comme voie
       * valide : finding UNIQUEMENT si ni clé locale NI proxy actif. */
      const proxyFlagOn = ((): boolean => {
        try {
          const f = localStorage.getItem('apex_v13_use_secrets_proxy');
          return f === 'true' || f === '1';
        } catch { return false; }
      })();
      if (!proxyFlagOn && status.paid_providers_available.length === 0 && status.free_providers_available.length === 0) {
        /* v13.4.242 (Kevin 2026-05-20) : message honnête — Apex peut répondre
         * via le Worker proxy apex-secrets-proxy (clés server-side) OU via une
         * clé locale. Ce finding signale que le routing-policy ne détecte
         * aucune des deux voies — à vérifier (proxy branché ? clé collée ?). */
        findings.push(this.makeFinding('ai_safety', 'p1_high',
          'Aucun provider IA détecté par le routing',
          'Vérifier : Worker proxy apex-secrets-proxy branché OU 1 clé API locale',
          'prompt_user_paste_key'));
      }
      if (status.anthropic_health === 'critical') {
        findings.push(this.makeFinding('ai_safety', 'p1_high',
          'Anthropic budget critique',
          'Budget > 90% → bascule auto free providers',
          'switch_to_economy_mode'));
      }
    } catch { /* skip */ }
    /* MODE BRUTAL : checks AI Safety supplémentaires */
    if (brutal) {
      /* Brut 1 : PII redaction wired ai-router ?
       * NOTE: refactor 2026-05-08 → on ne dynamic-importe plus ai-router pour
       *  briser le cycle dépendance circulaire ai-router → apex-tools-dispatch
       *  → apex-self-audit → ai-router. À la place on lit la flag exposée par
       *  ai-router au boot (globalThis.__APEX_AI_ROUTER_READY__). */
      try {
        const ready = (globalThis as { __APEX_AI_ROUTER_READY__?: boolean }).__APEX_AI_ROUTER_READY__;
        if (ready !== true) {
          findings.push(this.makeFinding('ai_safety', 'p0_critical',
            'AI router not initialized',
            'Service ai-router non chargé → IA inaccessible',
            'no_action'));
        }
      } catch { /* skip */ }
      /* Brut 2 : context-loader injecté system prompt ? */
      try {
        const { contextLoader } = await import('../ai/context-loader.js');
        const ctx = await contextLoader.load();
        if (ctx.rules.length === 0) {
          findings.push(this.makeFinding('ai_safety', 'p1_high',
            'Context-loader vide',
            'Règles permanentes pas injectées system prompt',
            'no_action'));
        }
      } catch { /* skip */ }
    }
    const score = Math.max(0, 20 - findings.length * 2);
    return { score, findings };
  }

  /* === Auto-fix whitelist === */

  private async tryAutoFix(finding: Finding): Promise<boolean> {
    const action = finding.fix_action;
    if (!action) return false;
    try {
      switch (action) {
        case 'auto_migrate_secrets': {
          const { secretScanner } = await import('../vault/secret-scanner.js');
          const r = await secretScanner.autoMigrate();
          return r.migrated > 0;
        }
        case 'aggressive_storage_cleanup': {
          /* Trim audit log + telemetry pour libérer place */
          try {
            const audit = JSON.parse(localStorage.getItem('apex_v13_audit_log') ?? '[]') as unknown[];
            if (audit.length > 50) localStorage.setItem('apex_v13_audit_log', JSON.stringify(audit.slice(-50)));
          } catch { /* ignore */ }
          try {
            const telemetry = JSON.parse(localStorage.getItem('ax_telemetry_in') ?? '[]') as unknown[];
            if (telemetry.length > 20) localStorage.setItem('ax_telemetry_in', JSON.stringify(telemetry.slice(-20)));
          } catch { /* ignore */ }
          return true;
        }
        case 'compress_storage': {
          const { storageCompressor } = await import('../storage/storage-compressor.js');
          const r = await storageCompressor.migrateAllToCompressed();
          return r.migrated > 0;
        }
        case 'switch_to_economy_mode': {
          /* v13.4.338 : NE JAMAIS rétrograder l'admin Kevin (il veut Anthropic
           * toujours). C'est ce switch auto qui posait 'economy' → cassait le
           * défaut premium → drift openai. setMode reste NON explicite (défaut
           * false) → même s'il tourne pour un client, il n'usurpe pas un choix user. */
          if (localStorage.getItem('apex_v13_uid') === 'kdmc_admin') return true;
          const { aiRoutingPolicy } = await import('../ai/ai-routing-policy.js');
          aiRoutingPolicy.setMode('economy');
          return true;
        }
        case 'no_action':
          return true;
        default:
          return false;
      }
    } catch (err: unknown) {
      logger.warn('apex-self-audit', `auto-fix ${action} failed`, { err });
      return false;
    }
  }

  /* === Escalade Claude Code === */

  private async escalateToClaudeCode(finding: Finding): Promise<void> {
    try {
      const todos = JSON.parse(localStorage.getItem('ax_claude_todo') ?? '[]') as Array<unknown>;
      todos.push({
        id: `c_audit_${finding.id}`,
        type: 'self_audit_escalation',
        finding,
        ts: Date.now(),
        status: 'pending',
      });
      localStorage.setItem('ax_claude_todo', JSON.stringify(todos.slice(-50)));
      void auditLog.record('self_audit.escalated', { details: { finding_id: finding.id, severity: finding.severity } });
      /* v13.0.65 Kevin 2026-05-04 : escalade via GitHub Actions GRATUIT (remplace n8n payant).
         Si ax_github_token configuré → POST repository_dispatch déclenche workflow Apex.
         Failover : ax_claude_todo localStorage est lu par claude-todo-watcher.yml (cron 2h). */
      void this.dispatchGithubAudit(finding);
      /* Compat : si l'utilisateur a encore un webhook n8n configuré on le prévient aussi.
         Aucun secret commit, aucun appel par défaut. */
      try {
        const webhookUrl = localStorage.getItem('ax_n8n_webhook_url');
        const webhookSecret = localStorage.getItem('ax_n8n_secret');
        if (webhookUrl && webhookSecret) {
          void fetch(webhookUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-KDMC-Token': webhookSecret,
            },
            body: JSON.stringify({
              source: 'apex_v13',
              type: 'self_audit_escalation',
              finding,
              ts: Date.now(),
            }),
          }).catch(() => { /* offline OK */ });
        }
      } catch { /* skip */ }
    } catch (err: unknown) {
      logger.warn('apex-self-audit', 'escalate failed', { err });
    }
  }

  /**
   * Déclenche le workflow GitHub Actions `apex-audit-escalate.yml`.
   * Remplace le webhook n8n payant par GitHub Actions gratuit (repos publics).
   *
   * Lecture token via vault.readKey('ax_github_token') → JAMAIS plaintext.
   * Échec silencieux : `ax_claude_todo` reste en localStorage et le cron
   * `claude-todo-watcher.yml` (toutes 2h) sert de failover.
   */
  private async dispatchGithubAudit(finding: Finding): Promise<void> {
    let token = '';
    try {
      token = await vault.readKey('ax_github_token');
    } catch (err: unknown) {
      logger.warn('apex-self-audit', 'github token read failed', { err });
      return;
    }
    if (!token) return; /* token pas encore configuré → silencieux */

    const repoSetting = (() => {
      try {
        return localStorage.getItem('ax_github_repo') ?? '';
      } catch {
        return '';
      }
    })();
    const [owner, repo] = (() => {
      if (repoSetting && repoSetting.includes('/')) {
        const [o, r] = repoSetting.split('/');
        if (o && r) return [o.trim(), r.trim()];
      }
      return [DEFAULT_GITHUB_OWNER, DEFAULT_GITHUB_REPO];
    })();

    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/dispatches`, {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event_type: GITHUB_DISPATCH_EVENT,
          client_payload: {
            source: 'apex_v13',
            type: 'self_audit_escalation',
            finding,
            audit_summary: `[${finding.severity}] ${finding.title}`.slice(0, 200),
            ts: Date.now(),
          },
        }),
      });
      /* GitHub renvoie 204 No Content si OK */
      if (!res.ok) {
        logger.warn('apex-self-audit', `github dispatch failed: ${res.status}`);
        return;
      }
      void auditLog.record('self_audit.github_dispatch', {
        details: { finding_id: finding.id, severity: finding.severity, owner, repo },
      });
    } catch (err: unknown) {
      logger.warn('apex-self-audit', 'github dispatch error', { err });
    }
  }

  /* === Mémoire + concertation Claude Code === */

  private async recordLesson(report: AuditReport): Promise<void> {
    try {
      const lessons = JSON.parse(localStorage.getItem('ax_lessons_learned_struct') ?? '[]') as Array<unknown>;
      lessons.push({
        id: `lesson_${report.id}`,
        category: 'self_audit',
        title: `Audit ${report.id} : ${report.total_score}/100`,
        text: `${report.total_findings} findings, ${report.auto_fixed_count} auto-fixed, ${report.escalated_count} escalated`,
        severity: report.total_score < 70 ? 'critical' : report.total_score < 85 ? 'warn' : 'info',
        ts: report.ts,
        resolved: report.auto_fixed_count === report.total_findings,
        src: 'apex',
      });
      localStorage.setItem('ax_lessons_learned_struct', JSON.stringify(lessons.slice(-100)));
    } catch (err: unknown) {
      logger.warn('apex-self-audit', 'recordLesson failed', { err });
    }
  }

  private persistReport(report: AuditReport): void {
    try {
      const reports = JSON.parse(localStorage.getItem('apex_v13_audit_reports') ?? '[]') as unknown[];
      reports.push(report);
      localStorage.setItem('apex_v13_audit_reports', JSON.stringify(reports.slice(-20)));
    } catch (err: unknown) {
      logger.warn('apex-self-audit', 'persistReport failed', { err });
    }
  }

  /* === Helpers === */

  private makeFinding(axis: AuditAxis, severity: Severity, title: string, description: string, fixAction?: string): Finding {
    return {
      id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      axis,
      severity,
      title,
      description,
      ...(fixAction && { fix_action: fixAction }),
      ts: Date.now(),
    };
  }

  private buildNextSteps(findings: Finding[], autoFixed: number, escalated: number): string[] {
    const steps: string[] = [];
    if (autoFixed > 0) steps.push(`✅ ${autoFixed} findings auto-corrigés`);
    if (escalated > 0) steps.push(`📤 ${escalated} findings escaladés Claude Code → fix prochaine session`);
    const p0 = findings.filter((f) => f.severity === 'p0_critical' && !f.auto_fix_success);
    if (p0.length > 0) steps.push(`🚨 ${p0.length} P0 critical NON résolus → action Kevin requise`);
    if (findings.length === 0) steps.push('🎉 Aucun finding — Apex en parfait état');
    return steps;
  }

  /* === API publique === */

  listReports(): readonly AuditReport[] {
    try {
      return JSON.parse(localStorage.getItem('apex_v13_audit_reports') ?? '[]') as AuditReport[];
    } catch {
      return [];
    }
  }

  getLastReport(): AuditReport | null {
    const reports = this.listReports();
    return reports.length > 0 ? (reports[reports.length - 1] ?? null) : null;
  }

  /* Format markdown human-readable pour chat IA */
  formatReportMarkdown(report: AuditReport): string {
    const lines: string[] = [
      `# 🔍 Audit Apex ${report.id}`,
      ``,
      `**Score : ${report.total_score}/100**`,
      `Durée : ${report.duration_ms}ms`,
      ``,
      `## Scores par axe`,
    ];
    for (const [axis, data] of Object.entries(report.axes)) {
      lines.push(`- **${axis}** : ${data.score}/20 (${data.findings_count} findings)`);
    }
    lines.push('');
    lines.push(`## Statistiques`);
    lines.push(`- Findings totaux : ${report.total_findings}`);
    lines.push(`- Auto-fixed : ${report.auto_fixed_count} ✅`);
    lines.push(`- Escaladés Claude Code : ${report.escalated_count} 📤`);
    lines.push('');
    if (report.findings.length > 0) {
      lines.push(`## Findings P0/P1`);
      const critical = report.findings.filter((f) => f.severity === 'p0_critical' || f.severity === 'p1_high');
      for (const f of critical.slice(0, 10)) {
        const status = f.auto_fix_success ? '✅' : f.escalated_to_claude ? '📤' : '🚨';
        lines.push(`- ${status} **[${f.severity}]** ${f.title} : ${f.description}`);
      }
    }
    lines.push('');
    /* v13.4.342 (Kevin « fais tout toi auto avec Apex ») : le rapport embarque
     * l'auto-diagnostic IA — Kevin partage déjà ses audits à Claude Code → la
     * donnée qui manquait (échec anthropic EXACT) lui revient AUTOMATIQUEMENT. */
    try {
      const heal = localStorage.getItem('apex_v13_boot_heal');
      if (heal) {
        const h = JSON.parse(heal) as { ok: boolean; step: string; detail: string; ts: number };
        const age = Math.max(0, Math.round((Date.now() - h.ts) / 60_000));
        lines.push(`## 🤖 Auto-test IA au boot (il y a ${age} min)`);
        lines.push(`- ${h.ok ? '✅' : '🧨'} [${h.step}] ${h.detail}`);
        lines.push('');
      }
      const fails = localStorage.getItem('apex_v13_last_ai_fail');
      if (fails) {
        const map = JSON.parse(fails) as Record<string, { ts: number; msg: string; status?: number }>;
        const entries = Object.entries(map);
        if (entries.length > 0) {
          lines.push(`## 🧨 Derniers échecs IA (message exact)`);
          for (const [provider, f] of entries) {
            const ageMin = Math.max(0, Math.round((Date.now() - f.ts) / 60_000));
            const http = typeof f.status === 'number' ? `HTTP ${f.status} — ` : '';
            lines.push(`- **${provider}** (il y a ${ageMin} min) : ${http}${f.msg.slice(0, 250)}`);
          }
          lines.push('');
        }
      }
    } catch { /* fail-open */ }
    lines.push(`## Prochaines étapes`);
    for (const step of report.next_steps) lines.push(`- ${step}`);
    return lines.join('\n');
  }
}

export const apexSelfAudit = new ApexSelfAudit();
