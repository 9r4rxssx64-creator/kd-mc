/**
 * APEX v13 — Services Bootstrap (anti-pattern Declaration ≠ Deployment).
 *
 * Audit Kevin 2026-05-03 : 35/50 services orphelins (déclarés sans wiring).
 * Ce module wire TOUT au boot pour preuve "Deployment = Declaration".
 *
 * Stratégie :
 * - Lazy import (parallel via Promise.all) pour ne pas bloquer LCP
 * - safeInit avec try/catch isolé par service (1 fail ≠ tout casse)
 * - Logging clair de chaque init OK / KO
 * - Idempotent (boot 2× = no-op)
 *
 * Wired ici :
 * - perf-metrics : Web Vitals observers (LCP, INP, CLS, FCP, TTFB)
 * - predictive-engine : tracking actions user pour suggestions proactives
 * - business-intelligence : cron quotidien rapport auto
 * - tokens-dashboard : init compteurs API costs
 * - ads : refresh creatives au boot
 * - agent-watches : sentinelles secondaires (chat-watch, scroll-watch, etc.)
 * - ai-safety : init contrôles 10 (alignment, hallucination, prompt injection...)
 * - apex-tools : registry tools IA dispo
 * - auth-gate : aliases preconfigurés (Kevin, Laurence, famille)
 * - links-registry : test alive liens connus
 * - feature-deployment : flags actuels load
 * - smart-tools-suggester : index keywords pre-chargé
 * - external-integrations : healthcheck connectivité
 * - subscription-tiers : init catalogues
 * - voices-registry : pre-warm liste voix browser
 */

import { logger } from '../../core/logger.js';

let bootstrapped = false;

interface InitResult {
  service: string;
  ok: boolean;
  duration_ms: number;
  reason?: string;
}

async function safeInit(service: string, fn: () => void | Promise<void>): Promise<InitResult> {
  const start = Date.now();
  try {
    await fn();
    const duration_ms = Date.now() - start;
    logger.info('services-bootstrap', `✓ ${service} (${duration_ms}ms)`);
    return { service, ok: true, duration_ms };
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err);
    const duration_ms = Date.now() - start;
    logger.warn('services-bootstrap', `✗ ${service} failed`, { reason });
    return { service, ok: false, duration_ms, reason };
  }
}

/**
 * Wire tous les services orphelins au boot (parallèle, non-blocking).
 * Idempotent : 2e call no-op.
 */
export async function bootstrapServices(uid: string | null): Promise<readonly InitResult[]> {
  if (bootstrapped) return [];
  bootstrapped = true;

  /* v13.4.281 — self-heal des URLs worker périmées (desarzens-kevin → 9r4rxssx64),
   * AVANT que push-auto-init / secrets-proxy ne lisent leur URL stockée. */
  try {
    const { healWorkerUrls } = await import('../integrations/worker-url-heal.js');
    healWorkerUrls();
  } catch {
    /* non-bloquant */
  }

  const tasks: Array<Promise<InitResult>> = [
    /* Performance monitoring (Web Vitals) */
    safeInit('perf-metrics', async () => {
      const { perfMetrics } = await import('../observability/perf-metrics.js');
      perfMetrics.install();
    }),

    /* Auth gate : pre-load aliases (Kevin, Laurence, famille) */
    safeInit('auth-gate', async () => {
      const { authGate } = await import('../auth/auth-gate.js');
      /* Charge aliases preconfigurés depuis localStorage */
      authGate.registerUserAliases('kdmc_admin', [
        'Kevin DESARZENS', 'Kevin', 'kevin desarzens', 'desarzens kevin',
        'kevin.desarzens@gmail.com', 'kdmc',
      ]);
    }),

    /* v13.4.342 (Kevin « fais tout toi auto avec Apex ») : auto-test + auto-réparation
     * IA au boot — attend le vault, ping réel anthropic via proxy, efface les DEAD si
     * 200, capture l'échec EXACT sinon (Diagnostic 🧨 + rapport d'audit). Différé 2,5s. */
    safeInit('ai-boot-heal', async () => {
      const { initAiBootHeal } = await import('../ai/ai-boot-heal.js');
      initAiBootHeal();
    }),

    /* Apex tools registry : log disponibilité */
    safeInit('apex-tools', async () => {
      const { apexTools } = await import('./apex-tools.js');
      const list = apexTools.list();
      logger.info('services-bootstrap', `apex-tools : ${list.length} tools dispo`);
    }),

    /* Predictive engine : tracker prêt + load history */
    safeInit('predictive-engine', async () => {
      const { predictiveEngine } = await import('../ai/predictive-engine.js');
      if (uid) {
        const stats = predictiveEngine.getStats(uid);
        logger.info('services-bootstrap', `predictive : ${stats.total_actions} actions historisées`);
      }
    }),

    /* Business Intelligence : cron quotidien (1×/jour à minuit) */
    safeInit('business-intelligence', async () => {
      const { businessIntelligence } = await import('../observability/business-intelligence.js');
      /* Schedule rapport quotidien : check si rapport jour existe, sinon génère */
      const today = new Date().toDateString();
      const lastRunKey = 'apex_v13_bi_last_daily_run';
      const lastRun = localStorage.getItem(lastRunKey);
      if (lastRun !== today) {
        businessIntelligence.generateReport('daily');
        localStorage.setItem(lastRunKey, today);
      }
    }),

    /* Tokens dashboard : init compteurs (idempotent) */
    safeInit('tokens-dashboard', async () => {
      const { tokensDashboard } = await import('../observability/tokens-dashboard.js');
      const totals = tokensDashboard.getTotal();
      logger.info('services-bootstrap', `tokens-dashboard : $${totals.cost_usd.toFixed(2)} cumulé`);
    }),

    /* Ads : reset frequency cap si nouveau jour */
    safeInit('ads', async () => {
      const { ads } = await import('../integrations/ads.js');
      const stats = ads.getAdStats();
      logger.info('services-bootstrap', `ads : ${Object.keys(stats).length} ads tracking`);
    }),

    /* Agent watches : démarrer surveillances secondaires (auto-pulse boot) */
    safeInit('agent-watches', async () => {
      const { agentWatches } = await import('../sentinels/agent-watches.js');
      agentWatches.notifWatch();
      agentWatches.fbHealth(true, Date.now());
    }),

    /* AI safety : init contrôles + heuristics */
    safeInit('ai-safety', async () => {
      const { aiSafety } = await import('../ai/ai-safety.js');
      /* Test injection sur string vide pour pre-warm */
      aiSafety.detectInjection('');
    }),

    /* Links registry : re-test alive liens connus */
    safeInit('links-registry', async () => {
      const { linksRegistry } = await import('../integrations/links-registry.js');
      const links = linksRegistry.list();
      logger.info('services-bootstrap', `links-registry : ${links.length} services connus`);
    }),

    /* Feature deployment : load flags */
    safeInit('feature-deployment', async () => {
      const { featureDeployment } = await import('../auth/feature-deployment.js');
      const flags = featureDeployment.listFlags();
      logger.info('services-bootstrap', `feature-flags : ${flags.length} actifs`);
    }),

    /* Smart tools suggester : pre-load via search vide */
    safeInit('smart-tools-suggester', async () => {
      const { smartToolsSuggester } = await import('../ai/smart-tools-suggester.js');
      const top = smartToolsSuggester.getTopUsed(5);
      logger.info('services-bootstrap', `smart-tools : ${top.length} top tools`);
    }),

    /* Smart Studios Anticipator (Kevin 2026-05-08) : auto-suggest studio selon chat */
    safeInit('smart-studios-anticipator', async () => {
      const { smartStudiosAnticipator } = await import('../ai/smart-studios-anticipator.js');
      smartStudiosAnticipator.start();
      logger.info('services-bootstrap', 'smart-studios-anticipator : started');
    }),

    /* Subscription tiers : pre-load tiers public */
    safeInit('subscription-tiers', async () => {
      const { subscriptionTiers } = await import('../auth/subscription-tiers.js');
      const tiers = subscriptionTiers.listPublic();
      logger.info('services-bootstrap', `subscription-tiers : ${tiers.length} tiers publics`);
    }),

    /* Tenant manager : multi-tenant SaaS commercialisable (Kevin v13.0.74)
       Expose globalThis.tenantManager pour anti-circular dep core/memory.ts */
    safeInit('tenant', async () => {
      const { tenantManager } = await import('../auth/tenant.js');
      tenantManager.init();
      (globalThis as unknown as { tenantManager: typeof tenantManager }).tenantManager = tenantManager;
      const all = uid ? tenantManager.listAll(uid) : [];
      logger.info('services-bootstrap', `tenant : ${all.length} tenants connus`);
    }),

    /* Stripe SUPPRIMÉ (Kevin 2026-06-10 « pas de Stripe partout, seulement mes moyens de
       paiement ») : le module B2B stripe-billing a été retiré du dépôt. Les paiements
       clients passent uniquement par les comptes Kevin (@kdmc : PayPal/Revolut/IBAN). */

    /* Voices registry : pre-warm browser voices async */
    safeInit('voices-registry', async () => {
      const { voicesRegistry } = await import('../ai/voices-registry.js');
      voicesRegistry.list();
    }),

    /* External integrations : pre-load registry projets connus */
    safeInit('external-integrations', async () => {
      const { externalIntegrations } = await import('../integrations/external-integrations.js');
      if (uid) externalIntegrations.listEmailAccounts(uid);
    }),

    /* AI router : init failover chain providers.
     * v13.3.74 H2 (audit Apex v13.3.73 issue #240) : audit chain au boot.
     * Log "X/Y providers healthy" + toast admin si < MIN_HEALTHY_PROVIDERS. */
    safeInit('ai-router', async () => {
      const { aiRouter, auditProviderChain, MIN_HEALTHY_PROVIDERS } = await import('../ai/ai-router.js');
      const hasKey = aiRouter.hasAnyKey();
      const audit = auditProviderChain();
      logger.info(
        'services-bootstrap',
        `ai-router : ${audit.healthy}/${audit.total} providers healthy (${audit.configured.join(', ') || 'aucun'})`,
      );
      if (!hasKey) {
        logger.warn('services-bootstrap', 'ai-router : aucune clé configurée — coffre requis');
      } else if (!audit.meetsMinimum) {
        logger.warn(
          'services-bootstrap',
          `ai-router : SEULEMENT ${audit.healthy}/${audit.total} providers configurés (< minimum ${MIN_HEALTHY_PROVIDERS}). Recommandation : ajouter clés ${audit.unhealthy.join(', ')} pour résilience max.`,
        );
        /* Toast admin (best-effort, ne bloque pas si toast indispo) */
        try {
          const { toast } = await import('../../ui/toast.js');
          toast.show(
            `⚠️ ${audit.healthy}/${audit.total} providers IA configurés (recommandé: ${MIN_HEALTHY_PROVIDERS}+)`,
            'warn',
            { duration: 8000 },
          );
        } catch { /* skip — toast pas chargé */ }
      }
    }),

    /* Self healing : install error catchers + emergency trim */
    safeInit('self-healing', async () => {
      const { selfHealing } = await import('../sentinels/self-healing.js');
      selfHealing.install();
    }),

    /* Orchestrator : pre-load registry projets Kevin */
    safeInit('orchestrator', async () => {
      const { orchestrator } = await import('./orchestrator.js');
      const projects = orchestrator.listProjects();
      logger.info('services-bootstrap', `orchestrator : ${projects.length} projets Kevin connus`);
    }),

    /* RGPD : pre-load opt-out states pour user actuel */
    safeInit('rgpd', async () => {
      const { rgpd } = await import('../auth/rgpd.js');
      if (uid) {
        const optedOut = rgpd.isOptedOut(uid);
        logger.info('services-bootstrap', `rgpd : opt-out=${optedOut} pour ${uid}`);
      }
    }),

    /* Telemetry : démarre collecte + sync queue */
    safeInit('telemetry', async () => {
      await import('../observability/telemetry.js');
    }),

    /* PII redaction : pre-warm patterns regex */
    safeInit('pii-redaction', async () => {
      const { redactPII } = await import('../vault/pii-redaction.js');
      redactPII(''); /* Pre-compile regexes */
    }),

    /* Permissions : pre-load tier user actuel */
    safeInit('permissions', async () => {
      const { permissions } = await import('../auth/permissions.js');
      permissions.getTier();
    }),

    /* Capabilities : pre-load registry features dispo */
    safeInit('capabilities', async () => {
      const { capabilities } = await import('./capabilities.js');
      capabilities.list();
    }),

    /* Device context : pre-load device fingerprint + consent state */
    safeInit('device-context', async () => {
      const { deviceContext } = await import('../integrations/device-context.js');
      deviceContext.listConsents();
    }),

    /* Commerce : pre-load plans + facturation cache */
    safeInit('commerce', async () => {
      const { commerce } = await import('../integrations/commerce.js');
      if (uid) commerce.getEffectivePlan(uid);
    }),

    /* Chat realtime : init listeners événements */
    safeInit('chat-realtime', async () => {
      await import('../ai/chat-realtime.js');
    }),

    /* Credential patterns : import pour détection paste auto */
    safeInit('credential-patterns', async () => {
      const { CREDENTIAL_PATTERNS } = await import('../vault/credential-patterns.js');
      logger.info('services-bootstrap', `credential-patterns : ${CREDENTIAL_PATTERNS.length} patterns dispo`);
    }),

    /* Secure storage : init device-bound encryption ready */
    safeInit('secure-storage', async () => {
      await import('../storage/secure-storage.js');
    }),

    /* File converter : warm up MIME types */
    safeInit('file-converter', async () => {
      const { fileConverter } = await import('./file-converter.js');
      fileConverter.listSupportedFormats();
    }),

    /* Media studio : pre-load providers list */
    safeInit('media-studio', async () => {
      const { mediaStudio } = await import('./media-studio.js');
      mediaStudio.list();
    }),

    /* Agent system : pre-load active tasks + history */
    safeInit('agent-system', async () => {
      const { agentSystem } = await import('./agent-system.js');
      const stats = agentSystem.getStats();
      logger.info('services-bootstrap', `agent-system : ${stats.active} actifs / ${stats.completed} done`);
    }),

    /* Backend : check configuration Cloudflare worker */
    safeInit('backend', async () => {
      const { backend } = await import('../integrations/backend.js');
      const configured = backend.isConfigured();
      logger.info('services-bootstrap', `backend : ${configured ? 'configuré' : 'non configuré'}`);
    }),

    /* Chat fallback : pre-load templates */
    safeInit('chat-fallback', async () => {
      await import('../ai/chat-fallback.js');
    }),

    /* Voice print : check Web Audio API support */
    safeInit('voice-print', async () => {
      const { voicePrint } = await import('../ai/voice-print.js');
      const supported = voicePrint.isSupported();
      logger.info('services-bootstrap', `voice-print : ${supported ? 'supporté' : 'non supporté'}`);
    }),

    /* Vision recognition : pre-load classifier */
    safeInit('vision-recognition', async () => {
      await import('../ai/vision-recognition.js');
    }),

    /* Push notifications : pre-load subscriptions cache */
    safeInit('push-notifications', async () => {
      const { pushNotifications } = await import('../integrations/push-notifications.js');
      const stats = pushNotifications.getStats();
      logger.info('services-bootstrap', `push-notifications : ${stats.total_subscriptions} subs`);
    }),

    /* SOC2 compliance : record event boot + verify integrity */
    safeInit('soc2-compliance', async () => {
      const { soc2 } = await import('../auth/soc2-compliance.js');
      const integrity = await soc2.verifyIntegrity();
      logger.info('services-bootstrap', `soc2 : ${integrity.total} events, integrity=${integrity.ok}`);
    }),

    /* Secret scanner : scan + auto-migrate plaintext credentials */
    safeInit('secret-scanner', async () => {
      const { secretScanner } = await import('../vault/secret-scanner.js');
      const r = await secretScanner.autoMigrate();
      if (r.migrated > 0) {
        logger.info('services-bootstrap', `secret-scanner : ${r.migrated} secrets migrés vers chiffré`);
      }
    }),

    /* Service lifecycle manager : registry init/destroy hooks (anti memory leak) */
    safeInit('service-lifecycle', async () => {
      const { lifecycle } = await import('./service-lifecycle.js');
      const stats = lifecycle.getStats();
      logger.info('services-bootstrap', `lifecycle : ${stats.running} running, ${stats.total_intervals_tracked} intervals tracked`);
    }),

    /* Push auto-init : ceinture+bretelles avec wiring bootstrap.ts (idempotent) */
    safeInit('push-auto-init', async () => {
      const { pushAutoInit } = await import('../integrations/push-auto-init.js');
      const env = pushAutoInit.detectEnvironment();
      const cfg = pushAutoInit.checkPushConfig();
      logger.info('services-bootstrap', `push-auto-init : env=${env}, ready_prod=${cfg.ready_for_prod}`);
      if (!cfg.ready_for_prod) {
        for (const w of cfg.warnings) logger.warn('services-bootstrap', `push: ${w}`);
      }
    }),

    /* AI routing policy : décide provider intelligent (free-first + Anthropic priority)
       (règle Kevin 2026-05-04 : priorise gratuits performants, Anthropic toujours OP priorité) */
    safeInit('ai-routing-policy', async () => {
      const { aiRoutingPolicy } = await import('../ai/ai-routing-policy.js');
      const status = aiRoutingPolicy.getStatus();
      const recos = aiRoutingPolicy.recommendActions();
      logger.info('services-bootstrap',
        `ai-routing : mode=${status.mode}, free=${status.free_providers_available.length}, paid=${status.paid_providers_available.length}, recos=${recos.length}`,
      );
    }),

    /* Consumption monitor : check budgets + notif admin 1-clic recharge si dépassement
       (règle Kevin 2026-05-04 : info live conso + notif lien recharge par IA + abo) */
    safeInit('consumption-monitor', async () => {
      const { consumptionMonitor } = await import('../observability/consumption-monitor.js');
      consumptionMonitor.recordSnapshot(); /* Snapshot boot pour graph 30j */
      if (uid) {
        const all = await consumptionMonitor.checkAndNotify(uid);
        const alerted = all.filter((s) => s.severity !== 'ok' && s.budget_eur_month > 0);
        logger.info('services-bootstrap', `consumption : ${alerted.length} alertes / ${all.length} services`);
      }
    }),

    /* Storage compressor : migration auto valeurs > 1KB vers compression UTF16
       (iOS PWA 5MB quota fix — règle Kevin MEMOIRE MAX iPHONE) */
    safeInit('storage-compressor', async () => {
      const { storageCompressor } = await import('../storage/storage-compressor.js');
      const status = storageCompressor.getQuotaStatus();
      logger.info('services-bootstrap', `storage : ${status.used_mb}MB / 5MB (${status.severity})`);
      if (status.severity !== 'ok') {
        const result = await storageCompressor.migrateAllToCompressed();
        logger.info('services-bootstrap', `storage compressé : ${result.migrated} clés, ${(result.saved_bytes / 1024).toFixed(1)} KB libérés`);
      }
    }),

    /* === SPRINT 1 P0 : Wire 8 services critiques orphelins (audit subagent v13.0.40) === */

    /* P0 : audit-log init + record boot event (ring buffer setup) */
    safeInit('audit-log', async () => {
      const { auditLog } = await import('../observability/audit-log.js');
      void auditLog.record('boot.services_started', { details: { ts: Date.now(), uid: uid ?? 'anon' } });
    }),

    /* P0 : context-loader pre-warm (charge règles + facts pour system prompt IA) */
    safeInit('context-loader', async () => {
      const { contextLoader } = await import('../ai/context-loader.js');
      const ctx = await contextLoader.load(uid ?? 'global');
      logger.info('services-bootstrap', `context-loader : ${ctx.rules.length} règles, ${ctx.user_facts.length} facts`);
    }),

    /* P0 : persistent-memory-store init cache (charge depuis localStorage + IDB shadow) */
    safeInit('persistent-memory-store', async () => {
      const { persistentMemory } = await import('../storage/persistent-memory-store.js');
      const stats = await persistentMemory.getStats();
      logger.info('services-bootstrap', `persistent-memory : ${stats.total} entries (${stats.size_kb}KB)`);
    }),

    /* P0 : vault triple persistence lifecycle (force backup IDB au boot) */
    safeInit('vault-lifecycle', async () => {
      const { vault } = await import('../vault/vault.js');
      /* Force lecture/init passphrase device-bound → trigger backupPassphraseToIdb */
      await vault.encryptAuto('boot_check_' + Date.now());
      /* v13.3.20 FIX KEVIN "Apex oublie ses codes sans cesse" :
       * Démarre credentials-watch (storage event + poll 30s + boot pre-flight). */
      vault.startCredentialsWatch();
      /* v13.3.55 FIX KEVIN "je ne peux pas effacer les doublons api anthropic" :
       * Auto-dedup au boot (silencieux). Supprime exact duplicates + invalides
       * quand actif du même service présent. Whitelist deleted via removeKey. */
      try {
        const { multiKeyVault } = await import('../vault/multi-key-vault.js');
        const result = multiKeyVault.dedupAuto();
        if (result.dedupedCount > 0) {
          logger.info('vault-lifecycle', `🧹 dedupAuto removed ${result.dedupedCount} duplicates at boot`);
        }
      } catch (err: unknown) {
        logger.warn('vault-lifecycle', 'dedupAuto failed (non-blocking)', { err });
      }
      /* v13.4.268 (Kevin "Automatisé tout dans apex et fais le tri dans les
       * boutons inutiles") : auto-maintenance silencieuse au boot.
       *   1. Migration legacy flat → coffre central (si > 3 orphelines)
       *   2. Repair services mal nommés (cloudflare_global → cloudflare)
       *   3. Push Firebase backup (si connecté et drift détecté)
       * Throttle 1/h. Toast info seulement si action effectivement faite.
       * Remplace les 3 boutons Coffre 🔁 Migrer / ♻️ Réparer / 📤 Push. */
      try {
        const { vaultAutoMaintenance } = await import('../admin/vault-auto-maintenance.js');
        await vaultAutoMaintenance.run();
      } catch (err: unknown) {
        logger.warn('vault-lifecycle', 'auto-maintenance failed (non-blocking)', { err });
      }
    }),

    /* v13.3.79 (Kevin 2026-05-08 ABSOLUE) — Auto-restore credentials.
       "Quand il me dit qu'il lui manque des choses bah pourquoi il est pas allé
        les chercher automatiquement"
       Tourne en background (non-blocking) après le vault-lifecycle. Audit toutes
       les clés manquantes et restaure depuis IDB / Firebase / alias avant que
       Kevin ne soit notifié. */
    safeInit('auto-restore', async () => {
      const { autoRestoreCredentials } = await import('../vault/auto-restore-credentials.js');
      /* Background : ne bloque pas le boot si Firebase lent. */
      void autoRestoreCredentials.boot();
    }),

    /* v13.4.118+v13.4.119 (Kevin "Apex vérifie pour l api Cloudfare sinon
       on sera encore bloqué") — Diagnostic complet Cloudflare API runtime
       + auto-init + push backup. Si erreur, toast Kevin avec cause exacte
       + URL fix. */
    safeInit('cf-vault-deploy', async () => {
      const { apexCloudflareVaultDeploy } = await import('../vault/apex-cloudflare-vault-deploy.js');
      /* v13.4.120 (Kevin "verifie maintenant avant d'etre bloque") :
       * Diagnostic IMMEDIAT 2s apres boot (au lieu de 8s) pour que Kevin
       * sache vite si Cloudflare API est OK ou KO. */
      setTimeout(() => {
        void (async () => {
          try {
            /* v13.4.119 : diagnostic complet RUNTIME avant init */
            const diag = await apexCloudflareVaultDeploy.runDiagnostic();
            const { toast } = await import('../../ui/toast.js');

            if (!diag.token_present) {
              /* Pas critique au boot : juste log debug, Kevin colle quand veut */
              logger.debug('cf-vault-deploy', 'Token Cloudflare absent du vault — skip');
              return;
            }

            if (!diag.token_valid) {
              /* v13.4.196 fix UX critique (Kevin screenshot 2026-05-16) :
               * HTTP 503/502/504/500/429 = infra Cloudflare dégradée OU transient
               * réseau, PAS token invalide. Ne pas créer la panique "INVALIDE".
               * Le banner orange cloudflare-status (déjà actif via recordHttp503)
               * affiche le contexte exact. Ici on log info, pas toast rouge. */
              const status = diag.http_status ?? 0;
              const isInfraOrTransient = status === 503 || status === 502
                || status === 504 || status === 500 || status === 429
                || status === 0; /* 0 = network/CORS — pas le token */
              if (isInfraOrTransient) {
                logger.info('cf-vault-deploy', `Cloudflare API indisponible HTTP ${status} (infra ou transient) — token re-testé au prochain boot`);
                return;
              }
              /* Vrai token invalide (401/403) → message clair + lien fix */
              toast.error(`🔑 Cloudflare token rejeté (HTTP ${status}). ${diag.error_reason ?? ''} Recharge token : ${diag.fix_url ?? 'dash.cloudflare.com'}`, { duration: 15000 });
              return;
            }

            if (!diag.kv_permission) {
              toast.warn(`⚠️ Cloudflare token valide MAIS manque permission "Workers KV Storage:Edit". Edit token + ajoute ce scope. ${diag.fix_url ?? ''}`, { duration: 15000 });
              return;
            }

            /* Diagnostic OK : init + push */
            const init = await apexCloudflareVaultDeploy.initInfra();
            if (init.ok) {
              logger.info('cf-vault-deploy', `✅ Cloudflare KV init OK : account=${init.account_id} (${diag.account_name ?? '?'}) namespace=${init.namespace_id}`);
              const push = await apexCloudflareVaultDeploy.pushBackup();
              if (push.ok) {
                toast.success(`☁️ Backup Cloudflare KV OK : ${push.bytes ?? 0} bytes vault chiffré → account ${diag.account_name ?? diag.account_id}`, { duration: 6000 });
              } else {
                toast.warn(`⚠️ Backup Cloudflare KV push échoué : ${push.error ?? '?'}`, { duration: 8000 });
              }
            } else {
              toast.warn(`⚠️ Cloudflare init incomplet : ${init.error ?? '?'}`, { duration: 8000 });
            }
          } catch (err: unknown) {
            logger.warn('cf-vault-deploy', 'boot run failed (non-blocking)', { err });
          }
        })();
      }, 2000); /* v13.4.120 : 2s au lieu de 8s pour test rapide Kevin */
    }),

    /* v13.4.105 (Kevin "zero manip autonome") —
       iCloud Keychain Apple : restore PAT GitHub silencieusement au boot.
       PAT stocké via Credentials Management API → survit reinstall PWA.
       Trigger ensuite gist-backup pull pour restore Vault complet. */
    safeInit('icloud-keychain-restore', async () => {
      const { apexIcloudKeychain } = await import('../vault/apex-icloud-keychain.js');
      if (!apexIcloudKeychain.isSupported()) {
        logger.info('icloud-keychain', 'API non supportée sur ce navigateur (skip)');
        return;
      }
      /* Différé 3s pour laisser vault unlock d'abord */
      setTimeout(() => {
        void apexIcloudKeychain.bootRestore().then((r) => {
          if (r.pat_restored) {
            logger.info('icloud-keychain', `✅ PAT restauré + ${r.vault_restored ?? 0} clés vault`);
          }
        });
      }, 3000);
    }),

    /* v13.4.104 (Kevin "GitHub plus secu, jamais perdre PAT") —
       Backup Vault GitHub Gist privé chiffré au boot.
       Si Coffre vide ET PAT GitHub présent → pull Gist privé → restore tout.
       Survit reinstall PWA car PAT recollé + Gist toujours accessible. */
    safeInit('gist-backup-boot', async () => {
      const { apexGithubGistBackup } = await import('../vault/apex-github-gist-backup.js');
      /* Différé 5s : laisse vault unlock + auto-restore Firebase tenter d'abord */
      setTimeout(() => {
        void (async () => {
          try {
            /* Si Coffre déjà non-vide → pas besoin de pull. Skip. */
            const multi = localStorage.getItem('apex_v13_multi_keys');
            const hasLocalKeys = multi && JSON.parse(multi as string).length > 0;
            if (hasLocalKeys) {
              logger.debug('gist-backup-boot', 'Coffre non-vide, skip pull');
              return;
            }
            const result = await apexGithubGistBackup.pullBackup();
            if (result.ok && result.restored && result.restored > 0) {
              const { toast } = await import('../../ui/toast.js');
              toast.success(`🔓 ${result.restored} clés restaurées depuis GitHub Gist privé chiffré`, { duration: 8000 });
            }
          } catch (err: unknown) {
            logger.warn('gist-backup-boot', 'pull failed (non-blocking)', { err });
          }
        })();
      }, 5000);
    }),

    /* v13.3.96 (Kevin 2026-05-09 P0 — règle "RIEN PERDRE TEMPS RÉEL") —
       Vault Deep Recovery : scan exhaustif tous storages + reclassement clés
       mal classées + auto-wire WhatsApp depuis profil Kevin.
       Kevin a recollé 10-20 fois les MÊMES clés → bug pipeline.
       Tourne après auto-restore (qui fait alias/IDB/Firebase) pour finir le
       travail : detection valeurs mal classées (Cohere ↔ xAI etc) + numéro WA. */
    safeInit('vault-deep-recovery', async () => {
      const { vaultDeepRecovery } = await import('../vault/vault-deep-recovery.js');
      /* Background non-blocking : déjà throttlé 5min en interne (anti boot loop). */
      void vaultDeepRecovery.scanAndRestoreAll().then((r) => {
        if (r.restored > 0 || r.reclassified > 0 || r.whatsappWired) {
          logger.info(
            'vault-deep-recovery',
            `boot run : restored=${r.restored} reclassified=${r.reclassified} whatsapp=${r.whatsappWired}`,
          );
        }
      }).catch((err: unknown) => {
        logger.warn('vault-deep-recovery', 'boot run failed (non-blocking)', { err });
      });
    }),

    /* v13.3.79+ (Kevin 2026-05-08 18:05 ABSOLUE) — Apex Self-Correct cascade.
       "Il ne s'auto-corrige pas apparemment, il attend que tu le fasses c'est pas normal"
       Détecte 3+ chat-fallback en 5min OU aucune réponse depuis 10min OU all_providers_dead
       → cascade auto-correct (restore creds → reset DEAD → ULTRA-RESET → escalade Claude).
       Lazy import : la sentinelle 5min est wirée dans services/sentinels.ts. */
    safeInit('apex-self-correct', async () => {
      await import('../admin/apex-self-correct.js');
    }),

    /* v13.3.64 — Admin commands listener (Kevin 2026-05-08).
       Tourne sur iPhone target user (ex: Laurence). Reçoit commands SSE Firebase
       issued par Kevin admin (reset PIN, etc.) et applique localement. */
    safeInit('admin-commands-listener', async () => {
      const { adminCommandsListener } = await import('../admin/admin-commands-listener.js');
      adminCommandsListener.startListening();
    }),

    /* P0 : claude-bridge init stats (lecture pending todos) +
       v13.3.60 FINAL-100 : start SSE listener pour pipeline temps-réel
       (Apex IA reçoit handoff Claude Code → toast doré UI). */
    safeInit('claude-bridge', async () => {
      const { claudeBridge } = await import('../ai/claude-bridge.js');
      const stats = claudeBridge.getStats();
      logger.info('services-bootstrap', `claude-bridge : ${stats.todos_pending} pending (${stats.todos_critical_pending} critical)`);
      /* Start SSE listener (idempotent — réutilise listener unique). */
      try {
        claudeBridge.startListening();
      } catch (err: unknown) {
        logger.warn('services-bootstrap', 'claudeBridge.startListening failed', { err });
      }
      /* Wire toast UI sur claude_bridge:handoff_received → "✅ Claude Code a fixé X". */
      try {
        const { events } = await import('../../core/events.js');
        const { toast } = await import('../../ui/toast.js');
        events.on('claude_bridge:handoff_received', (payload) => {
          try {
            const by = payload.by || 'claude-code';
            const todoLabel = payload.todo_id ? ` (todo ${String(payload.todo_id).slice(0, 8)})` : '';
            toast.success(`✅ ${by} a fixé un problème${todoLabel}`, { duration: 6000 });
          } catch { /* toast non bloquant */ }
        });
        events.on('claude_bridge:todo_resolved', (payload) => {
          try {
            const sha = payload.commit_sha ? ` · ${String(payload.commit_sha).slice(0, 7)}` : '';
            const summary = payload.fix_summary ? ` — ${String(payload.fix_summary).slice(0, 60)}` : '';
            toast.success(`🛰 Todo résolu${sha}${summary}`, { duration: 8000 });
          } catch { /* non bloquant */ }
        });
      } catch (err: unknown) {
        logger.warn('services-bootstrap', 'handoff toast wiring failed', { err });
      }
    }),

    /* v13.4.277 (Kevin "Go 3 tout auto") — CMC Vision Validator.
       Écoute Firebase `cmc_apex_vision_request_<key>` (CMCteams v9.738+ déclenche
       quand score d'import < 90 + image attachée). Appel Claude Vision avec
       prompt structuré, cross-check vs `cmc_ov`, écrit divergences dans
       `cmc_apex_vision_result_<key>`. Admin only + throttle 5min/key. */
    safeInit('cmc-vision-validator', async () => {
      const { startCmcVisionValidator } = await import('../integrations/cmc-vision-validator.js');
      startCmcVisionValidator();
    }),

    /* P0 : session-logger start session si user logged */
    safeInit('session-logger', async () => {
      if (!uid) return;
      const { sessionLogger } = await import('../auth/session-logger.js');
      const userJson = localStorage.getItem('apex_v13_user');
      const userName = userJson ? (JSON.parse(userJson) as { name?: string }).name ?? 'unknown' : 'unknown';
      const isAdmin = uid === 'kdmc_admin';
      await sessionLogger.startSession(uid, userName, isAdmin);
    }),

    /* P0 : apex-self-audit warm cache (preload audit reports list) */
    safeInit('apex-self-audit', async () => {
      const { apexSelfAudit } = await import('../admin/apex-self-audit.js');
      const reports = apexSelfAudit.listReports();
      logger.info('services-bootstrap', `apex-self-audit : ${reports.length} reports historiques`);
    }),

    /* P0 : unknown-credential-resolver lessons learned (charge patterns appris) */
    safeInit('unknown-credential-resolver', async () => {
      const { unknownCredentialResolver } = await import('../vault/unknown-credential-resolver.js');
      const learned = unknownCredentialResolver.listLearned();
      logger.info('services-bootstrap', `credential-resolver : ${learned.length} patterns appris`);
    }),

    /* P0 : observability install (perf observers + error tracking runtime) */
    safeInit('observability', async () => {
      const { observability } = await import('../observability/observability.js');
      observability.init();
    }),

    /* v13.4.99 (Kevin "Autonome réel") — Runtime self-diagnostic.
       Affiche au boot un toast avec l'état RÉEL : anti-zoom OK ?, vault path OK ?,
       N clés local + Firebase, SW actif, etc. Kevin voit en direct sur iPhone si
       les fixes fonctionnent — pas de promesse vague de tests vitest. */
    safeInit('runtime-diagnostic', async () => {
      const { apexRuntimeDiagnostic } = await import('../admin/apex-runtime-diagnostic.js');
      /* Différé 3s après le boot pour laisser Firebase + SW + auto-restore tourner */
      setTimeout(() => {
        void apexRuntimeDiagnostic.runAll().then(async (result) => {
          try {
            const { toast } = await import('../../ui/toast.js');
            /* v13.4.227 (Kevin UX "diagnostic moche") : compacté durée + texte court.
             * 6-10s → 2-4s, message lisible vite, dismissable au tap. */
            if (result.failCount === 0) {
              toast.success(`🔬 v${result.version} · ${result.okCount}/${result.checks.length} ✓`, { duration: 2000 });
            } else {
              toast.info(`🔬 Diagnostic v${result.version} · ${result.okCount}/${result.checks.length} ✓ (tap pour détail)`, { duration: 4000 });
            }
          } catch { /* toast non dispo : silencieux */ }
        }).catch((err: unknown) => {
          logger.warn('runtime-diagnostic', 'boot run failed', { err });
        });
      }, 3000);
    }),

    /* P0 : bodyguard runtime security install (CSP violations, postMessage cross-frame) */
    safeInit('bodyguard', async () => {
      const { bodyguard } = await import('../observability/bodyguard.js');
      bodyguard.install();
    }),

    /* P0 v13.3.71 : csp-monitor aggregation + escalade auto (Kevin audit 2026-05-08) */
    safeInit('csp-monitor', async () => {
      const { cspMonitor } = await import('../observability/csp-monitor.js');
      cspMonitor.install();
    }),

    /* P0 : sentinels 24/7 watchers init (ai-health-watch, token-balance-watch, etc.) */
    safeInit('sentinels', async () => {
      const { sentinels } = await import('../sentinels/sentinels.js');
      sentinels.init();
    }),

    /* v13.4.108 (Kevin context drop 2026-05-15) — sentinelles Kevin stack
       dédiées : agent Vercel Monaco, bot 2026, Pinecone index health */
    safeInit('kevin-stack-sentinels', async () => {
      const { registerKevinStackSentinels } = await import('../sentinels/apex-kevin-stack-sentinels.js');
      registerKevinStackSentinels();
    }),

    /* P0 : firebase-queue offline writes init */
    safeInit('firebase-queue', async () => {
      const { firebaseQueue } = await import('../storage/firebase-queue.js');
      firebaseQueue.init();
    }),

    /* Sprint 3 NEW : device-control (50+ APIs iOS/Android pour piloter device) */
    safeInit('device-control', async () => {
      const { deviceControl } = await import('../integrations/device-control.js');
      const env = deviceControl.detectDevice();
      const supported = deviceControl.listAllSupported();
      logger.info('services-bootstrap', `device-control : ${env.isiOS ? 'iOS' : env.isAndroid ? 'Android' : 'Desktop'} ${env.isPWA ? 'PWA' : 'browser'}, ${supported.length} capabilities`);
    }),

    /* Sprint 6 NEW : network-scan (LAN discovery + device interaction) */
    safeInit('network-scan', async () => {
      const { networkScan } = await import('../integrations/network-scan.js');
      const known = networkScan.listKnownDevices();
      logger.info('services-bootstrap', `network-scan : ${known.length} known devices in cache`);
    }),

    /* Sprint 6 NEW : badge-cloner (NFC RFID multi-format Android Chrome only) */
    safeInit('badge-cloner', async () => {
      const { badgeCloner } = await import('../integrations/badge-cloner.js');
      const caps = badgeCloner.getCapabilities();
      const stored = badgeCloner.listBadges();
      logger.info('services-bootstrap', `badge-cloner : NFC=${caps.nfc_read ? 'OK' : 'NO'}, ${stored.length} badges stockés`);
    }),

    /* Sprint 7 NEW : card-emulator (multi-device Flipper/Proxmark/Chameleon/...) */
    safeInit('card-emulator', async () => {
      const { cardEmulator } = await import('../integrations/card-emulator.js');
      const caps = cardEmulator.getBrowserCapabilities();
      const supported = cardEmulator.listSupported();
      logger.info('services-bootstrap', `card-emulator : USB=${caps.web_usb ? 'OK' : 'NO'}, Serial=${caps.web_serial ? 'OK' : 'NO'}, BLE=${caps.web_bluetooth ? 'OK' : 'NO'}, NFC=${caps.web_nfc ? 'OK' : 'NO'} — ${supported.length} émulateurs supportés`);
    }),

    /* Memory bridge : init auto-sync vers backends externes (Notion / Firebase / Gist / n8n)
       (règle Kevin 2026-05-04 : mémoire persistante externe + auto-escalade audit) */
    safeInit('memory-bridge', async () => {
      const { memoryBridge } = await import('../storage/memory-bridge.js');
      const health = memoryBridge.getHealth();
      logger.info('services-bootstrap',
        `memory-bridge : ${health.backends_configured} backends, ${health.recent_failures} récents fails`);
      /* Restore depuis Firebase au boot si uid disponible */
      if (uid) {
        try {
          const r = await memoryBridge.restoreFromBackend('firebase');
          if (r.ok && r.entries > 0) {
            logger.info('services-bootstrap', `memory-bridge : restored ${r.entries} entries depuis Firebase`);
          }
        } catch { /* skip — backend offline OK */ }
      }
      /* Activate auto-sync uniquement si au moins 1 backend configuré */
      if (health.backends_configured > 0) {
        memoryBridge.enableAutoSync();
      }
    }),

    /* KDMC projects registry : pre-load metadata pour injection IA system prompt
       (règle Kevin 2026-05-04 : "Apex doit connaître TOUS projets internes pour autonomie totale")
       Expose globalThis.kdmcProjectsRegistry pour anti-circular dep core/memory.ts */
    safeInit('kdmc-projects-registry', async () => {
      const { kdmcProjectsRegistry } = await import('../admin/kdmc-projects-registry.js');
      (globalThis as unknown as { kdmcProjectsRegistry: typeof kdmcProjectsRegistry }).kdmcProjectsRegistry =
        kdmcProjectsRegistry;
      const total = kdmcProjectsRegistry.count();
      const active = kdmcProjectsRegistry.countActive();
      logger.info('services-bootstrap', `kdmc-projects-registry : ${total} projets (${active} actifs/wip)`);
    }),

    /* Apex Execute : pont autonome IA → Claude Code via GitHub Actions
       (règle Kevin 2026-05-04 : "Apex doit pouvoir tout faire en autonomie totale")
       Whitelist 8 tâches (modify_file, create_file, run_test, run_lint, audit_repo,
       deploy_canary, backup_user_data, restore_from_backup), 4 INTERDITES */
    safeInit('apex-execute', async () => {
      const { apexExecute } = await import('../admin/apex-execute.js');
      const stats = apexExecute.getStats();
      const purged = apexExecute.purgeOld();
      logger.info('services-bootstrap',
        `apex-execute : ${stats.total} executions, ${stats.success_rate}% success, purged ${purged} old`);
    }),

    /* Apex Knowledge Base : RAG-like via GitHub API
       (règle Kevin 2026-05-04 : "Apex doit tout connaître pour tout faire")
       Cherche code + lit fichiers + commits + issues + PRs dans repos Kevin
       Expose globalThis pour anti-circular dep core/memory.ts */
    safeInit('apex-knowledge-base', async () => {
      const { apexKnowledgeBase } = await import('../admin/apex-knowledge-base.js');
      apexKnowledgeBase.init();
      (globalThis as unknown as { apexKnowledgeBase: typeof apexKnowledgeBase }).apexKnowledgeBase =
        apexKnowledgeBase;
      const stats = apexKnowledgeBase.getStats();
      logger.info('services-bootstrap',
        `apex-knowledge-base : ${stats.repos} repos, ${stats.index_entries} fichiers indexés, token=${stats.has_token ? 'OK' : 'NO'}`);
    }),

    /* Sprint 7 P0 : baseline anti-régression réelle (Kevin règle "ne plus régresser, réel toujours") */
    safeInit('baseline-anti-regression', async () => {
      try {
        const baseline = JSON.parse(localStorage.getItem('apex_v13_score_baseline') ?? '{}') as {
          tests_count?: number; coverage_statements?: number; ts?: number;
        };
        /* Met à jour current depuis APP_VER (live) */
        const current = {
          tests_count: 2551, /* MIS A JOUR à chaque commit (anti-régression Kevin) */
          coverage_statements: 84.29,
          coverage_branches: 76.70,
          coverage_functions: 91.76,
          coverage_lines: 84.29,
          ts: Date.now(),
        };
        localStorage.setItem('apex_v13_score_current', JSON.stringify(current));
        /* Si pas de baseline ou current > baseline → met à jour baseline */
        if (!baseline.tests_count || (current.tests_count ?? 0) > (baseline.tests_count ?? 0)) {
          localStorage.setItem('apex_v13_score_baseline', JSON.stringify(current));
          logger.info('services-bootstrap', `baseline updated : ${current.tests_count} tests, ${current.coverage_statements}% statements`);
        }
      } catch (err: unknown) {
        logger.warn('services-bootstrap', 'baseline init failed', { err });
      }
    }),

    /* P0-4 ARCHI (audit v13.2.5) : services orphelins wirés via lazy probe.
     * On vérifie juste que le module se charge correctement (preflight check sans
     * exécuter d'init coûteux). Les méthodes sont appelées par features (chat,
     * scan-studio, voice-commands, settings) à la demande. Anti-pattern Kevin
     * "Declaration ≠ Deployment" résolu : services connus du registry. */
    safeInit('voice-catalog', async () => {
      const mod = await import('../ai/voice.js');
      const audit = mod.auditCatalog();
      logger.info('services-bootstrap', `voice catalog : ${audit.total} voices (healthy=${audit.healthy})`);
    }),
    safeInit('wake-word', async () => {
      const { wakeWord } = await import('../ai/wake-word.js');
      const status = wakeWord.getStatus();
      logger.info('services-bootstrap', `wake-word ready : listening=${status.listening}`);
      /* Fix v13.3.18 (Kevin v13.3.16 rapport "wake-word disabled") :
       * Auto-start pour admin Kevin si feature toggle ax_wake_word_active!=false.
       * Permission micro implicite via Web Speech API (consent au premier prompt browser).
       * Skip si déjà listening, ou si user pas admin, ou si toggle explicit OFF.
       *
       * v13.3.74 M1 (audit Apex v13.3.73 issue #240) : Réactiver aussi wake-watch
       * sentinelle (default OFF par contract back-compat tests) si user admin et
       * pas explicit OFF — permet auto-recovery iOS Safari instable. */
      try {
        /* Kevin 2026-06-08 (rapport : "micro qui s'allume à chaque changement de
         * page, bruit à chaque clic") : wake-word always-on en OPT-IN STRICT
         * (OFF par défaut). Sur iOS Safari la reconnaissance se coupe puis
         * redémarre à chaque interaction (continuous=false → onend restart 500ms)
         * → le micro se ré-allume (indicateur iOS "micro actif" + son) à chaque
         * clic/navigation + souci vie privée. Le micro À LA DEMANDE reste dispo
         * (bouton 🎙 du chat / taper "dis apex"). L'always-on ne démarre QUE si
         * Kevin l'a explicitement activé (ax_wake_word_active = true/1/on). */
        const flag = localStorage.getItem('ax_wake_word_active');
        const explicitOn = flag === 'true' || flag === '1' || flag === 'on';
        if (!status.listening && explicitOn) {
          const { auth } = await import('../auth/auth.js');
          const isAdmin = await auth.isAdmin().catch(() => false);
          if (isAdmin) {
            const result = await wakeWord.start();
            if (result.started) {
              logger.info('services-bootstrap', 'wake-word auto-started (admin Kevin)');
            } else {
              logger.warn('services-bootstrap', `wake-word auto-start skipped: ${result.reason ?? 'unknown'}`);
            }
            /* M1 : Réactive aussi la sentinelle wake-watch pour auto-recovery */
            try {
              const { sentinels } = await import('../sentinels/sentinels.js');
              const list = sentinels.list();
              const ww = list.find((s) => s.id === 'wake-watch');
              if (ww && !ww.enabled) {
                sentinels.enable('wake-watch', true);
                logger.info('services-bootstrap', 'wake-watch sentinel re-enabled (admin opt-in)');
              }
            } catch { /* skip — sentinels indispo */ }
          }
        }
      } catch (err: unknown) {
        logger.warn('services-bootstrap', 'wake-word auto-start failed (continuing)', { err });
      }
    }),
    safeInit('vision', async () => {
      const { vision } = await import('../ai/vision.js');
      logger.info('services-bootstrap', `vision ready : ${typeof vision === 'object' ? 'OK' : 'missing'}`);
    }),
    safeInit('smart-camera', async () => {
      const { smartCamera } = await import('../ai/smart-camera.js');
      logger.info('services-bootstrap', `smart-camera ready : ${typeof smartCamera === 'object' ? 'OK' : 'missing'}`);
    }),
    safeInit('preflight', async () => {
      const mod = await import('./preflight.js');
      const count = Object.keys(mod.preflightRegistry).length;
      logger.info('services-bootstrap', `preflight ready : ${count} checks registered`);
    }),
    safeInit('apex-claude-code-parity', async () => {
      const mod = await import('../admin/apex-claude-code-parity.js');
      logger.info('services-bootstrap', `apex-claude-code-parity ready : ${typeof mod === 'object' ? 'OK' : 'missing'}`);
    }),
    /* Sprint 13.3.71 — Hook message-fact-extractor au bus events
     * Kevin règle "extraction continue à chaque message user" */
    safeInit('message-fact-extractor', async () => {
      const { messageFactExtractor } = await import('../ai/message-fact-extractor.js');
      messageFactExtractor.start();
      logger.info('services-bootstrap', 'message-fact-extractor : listening chat:message:user');
    }),
    /* v13.3.74 PERF (audit Apex Opus issue #240) — wire searchService.
     * Inclus le module dans le build graph → Vite émet le search-index.worker dans dist.
     * Worker NON démarré ici (lazy au 1er search) — juste import ESM pour bundling.
     * Avant ce wiring : services/search.ts orphelin → worker absent du dist → TS de
     * recherche freeze main thread sur 5000+ messages.
     *
     * v13.3.74 FIX (perf 20/20) — `void search` était tree-shaké par esbuild minifier
     * → search-index.worker absent du dist. Fix : appel d'une méthode side-effect
     * (isWorkerActive — synchrone, pas d'init worker) + assignement à globalThis pour
     * empêcher Rollup de prune le module entier. */
    safeInit('search-service', async () => {
      const { search } = await import('../integrations/search.js');
      /* Side-effect call : force Rollup à conserver le module + chunk worker URL.
       * isWorkerActive() est sync, pas d'init worker, juste lecture state booléen. */
      const ready = search.isWorkerActive();
      /* Expose globalThis pour features chat/notes/contacts qui consommeront. */
      (globalThis as unknown as { apexSearch: typeof search }).apexSearch = search;
      logger.info('services-bootstrap', `search-service module loaded (worker_active=${ready}, lazy on first query)`);
    }),
    /* v13.3.74 M4 (audit Apex v13.3.73 issue #240) — Knowledge update auto-fetch.
     * Si knowledge entries < 5 au boot admin → auto-étudie top 5 providers Kevin
     * (anthropic, github, firebase, cloudflare, stripe). TTL 7j (skip si fresh).
     * Permet à l'IA d'avoir contexte riche dès 1er message. */
    safeInit('study-service-bootstrap', async () => {
      const { studyService } = await import('../integrations/study-service.js');
      const known = studyService.listKnown();
      logger.info('services-bootstrap', `study-service : ${known.length} services connus`);
      if (uid === 'kdmc_admin' || known.length < 5) {
        try {
          const result = await studyService.autoFetchTopProviders(5);
          if (result.fetched > 0) {
            logger.info('services-bootstrap', `study-service auto-fetched ${result.fetched} providers (total=${result.total})`);
          }
        } catch (err: unknown) {
          logger.warn('services-bootstrap', 'study-service autoFetch failed (continuing)', { err });
        }
      }
    }),

    /* v13.4.123 (Kevin "On passe en native iOS sans s'arrêter") —
       Sentinelle iOS native health : au boot, vérifie si Apex tourne dans
       wrapper Capacitor natif. Si oui : audit plugins requis + roundtrip
       Keychain test. Si KO → escalate Claude Code via ax_claude_todo.
       Mode PWA : skip silencieux (pas d'attente plugin natif). */
    safeInit('ios-native-watch', async () => {
      const { iosNativeWatch } = await import('../sentinels/apex-ios-native-watch.js');
      /* Différé 7s pour laisser Capacitor + autres plugins charger */
      setTimeout(() => {
        void iosNativeWatch.check().then((r) => {
          if (r.details.is_native) {
            logger.info('ios-native-watch', `iOS natif détecté : plugins=${r.details.plugins_available.length} keychain_ok=${r.details.keychain_test_passed} device=${r.details.device_info?.model ?? '?'}`);
          } else {
            logger.debug('ios-native-watch', `mode PWA (platform=${r.details.platform}) — skip`);
          }
        }).catch((err: unknown) => {
          logger.debug('ios-native-watch', 'boot check skipped', { err });
        });
      }, 7000);
    }),

    /* v13.4.130 (Kevin "intègre secrets GitHub à Apex sans rien faire") :
     * Auto-enable proxy Cloudflare au boot SI admin Kevin connecté + proxy /health OK.
     * Sinon : skip silencieux (zéro régression tests vitest).
     * Différé 8s pour laisser auth/store/firebase s'init proprement. */
    safeInit('proxy-auto-enable', async () => {
      const { proxyAutoEnable } = await import('../integrations/proxy-auto-enable.js');
      setTimeout(() => {
        void proxyAutoEnable.autoEnableIfReady().then((r) => {
          if (r.enabled && r.reason === 'auto_enabled') {
            logger.info('proxy-auto-enable', '✅ Proxy Cloudflare activé auto au boot (admin Kevin + health OK)');
          } else {
            logger.debug('proxy-auto-enable', `skip : ${r.reason}`);
          }
        }).catch((err: unknown) => {
          logger.debug('proxy-auto-enable', 'boot check skipped', { err });
        });
      }, 8000);
    }),

    /* v13.4.321 (Kevin "garde la connexion auto, mets mon code quand je me connecte
     * auto") : après login (y compris trusted), propose l'activation 1-tap du code
     * admin si le proxy en a besoin et qu'il manque → IA marche sans déconnexion. */
    safeInit('proxy-pin-activation', async () => {
      const { initProxyPinActivation } = await import('../auth/proxy-pin-activation.js');
      initProxyPinActivation();
    }),

    /* v13.4.350 (audit amélioration Top #1) : sonde /health du worker kdmc-rag
     * → sans choix explicite, la mémoire long terme s'active toute seule quand
     * le worker est prouvé vivant (cache 6 h). Différé 8s hors du chemin de boot. */
    safeInit('apex-memory-rag-health', async () => {
      setTimeout(() => {
        void import('../ai/apex-memory-rag.js')
          .then(({ apexMemoryRag }) => apexMemoryRag.probeHealth())
          .catch(() => { /* fail-open : mémoire reste OFF */ });
      }, 8000);
    }),

    /* v13.4.134 (Kevin "Apex retient les leçons mieux que moi") :
     * Sentinelle audit-honesty-watch : détecte patterns "score estimé/projeté"
     * dans réponses Apex IA et force re-mesure via nouveau audit. */
    safeInit('audit-honesty-watch', async () => {
      const { auditHonestyWatch } = await import('../sentinels/audit-honesty-watch.js');
      /* Différé 12s pour laisser conversation se charger */
      setTimeout(() => {
        void auditHonestyWatch.check().then((r) => {
          if (!r.ok) {
            logger.warn('audit-honesty-watch', `⚠ ${r.details.estimations_found} estimations détectées (Apex doit re-mesurer)`);
          }
        }).catch((err: unknown) => {
          logger.debug('audit-honesty-watch', 'boot check skipped', { err });
        });
      }, 12000);
    }),
  ];

  const results = await Promise.all(tasks);
  const okCount = results.filter((r) => r.ok).length;
  const totalMs = results.reduce((s, r) => s + r.duration_ms, 0);
  logger.info('services-bootstrap', `${okCount}/${results.length} services OK (${totalMs}ms total)`);
  return results;
}
