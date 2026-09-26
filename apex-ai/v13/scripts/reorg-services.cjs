#!/usr/bin/env node
/**
 * Chantier 1 — Restructuration services/ (172+ fichiers à plat -> domaines).
 * Déplace les fichiers services/*.ts dans des sous-dossiers par domaine et
 * réécrit TOUS les imports (relatifs + alias @services) du tree v13.
 *
 * Méthode sûre : déplacement pur (aucun changement de type possible). Les
 * chemins sont recalculés avec path.relative (déterministe). Vérification
 * ensuite via scripts/check-imports.cjs (résolveur statique).
 *
 * Usage: node scripts/reorg-services.cjs [--dry]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry');

// --- Catégorisation des 220 services à plat -> 9 domaines -------------------
const DOMAIN = {
  // ai/ — LLM, providers, chat, voix, vision, MCP, raisonnement
  ai: [
    'ai-key-rotation', 'ai-providers-health', 'ai-router', 'ai-routing-policy',
    'ai-safety', 'smart-router', 'crew-experts', 'claude-bridge',
    'claude-code-mcp-bridge', 'claude-mem-bridge', 'chat-fallback',
    'chat-realtime', 'chat-attachments-store', 'hallucination-cross-check',
    'multi-key-health', 'mcp-client', 'mcp-memory-server', 'mcp-memory-stub',
    'mcp-registry', 'voice', 'voice-overlay', 'voice-print', 'voices-registry',
    'wake-word', 'live-transcription', 'vision', 'vision-recognition',
    'vision-device-analyze', 'ocr-offline', 'smart-camera', 'predictive-engine',
    'sequential-thinking', 'message-fact-extractor', 'context-loader',
    'suggestions', 'smart-tools-suggester', 'smart-studios-anticipator',
    'stream-partial-saver', 'superpowers-methodology', 'code-review-multi-agent',
    'multi-source-analyze',
  ],
  // auth/ — authentification, session, permissions, conformité d'accès
  auth: [
    'auth', 'auth-gate', 'admin-action-gate', 'signup', 'permissions',
    'session-logger', 'tenant', 'feature-guard', 'feature-toggles',
    'feature-deployment', 'subscription-tiers', 'rgpd', 'soc2-compliance',
    'webauthn',
  ],
  // vault/ — coffre, credentials, secrets, chiffrement, redaction
  vault: [
    'vault', 'vault-deep-recovery', 'vault-firebase-backup', 'apex-vault-import',
    'multi-key-vault', 'credential-categories', 'credential-patterns',
    'credentials-audit', 'unknown-credential-resolver', 'apex-credential-associator',
    'apex-credential-tester', 'auto-restore-credentials', 'secret-scanner',
    'generic-secrets', 'apex-cloudflare-vault-deploy', 'apex-qr-backup',
    'apex-icloud-keychain', 'apex-github-gist-backup', 'pii-redaction',
  ],
  // admin/ — panneaux admin, auto-gestion Apex, exécution, tests runtime
  admin: [
    'admin-commands', 'admin-commands-listener', 'admin-prompt', 'apex-execute',
    'apex-self-audit', 'apex-self-correct', 'apex-autonomous-mode',
    'apex-claude-code-parity', 'apex-runtime-diagnostic', 'apex-runtime-tester',
    'apex-functional-tester', 'apex-e2e-trigger', 'apex-reports-history',
    'apex-layout-inspector', 'apex-zoom-inspector', 'apex-multi-branch-coordinator',
    'security-review', 'autonomous-loop', 'plan-mode', 'slash-commands',
    'kevin-alerts', 'apex-knowledge-base', 'apex-paste-extractor',
    'kdmc-projects-registry', 'auto-test-everything', 'auto-test-runner',
  ],
  // observability/ — télémétrie, monitoring, perf, logs, BI
  observability: [
    'observability', 'telemetry', 'perf-metrics', 'inp-optimizer', 'csp-monitor',
    'sentry-bridge', 'consumption-monitor', 'consumption-anomaly-detector',
    'business-intelligence', 'tokens-dashboard', 'financial-dashboard',
    'cloudflare-status', 'audit-log', 'log-redaction-wrapper', 'bodyguard',
  ],
  // integrations/ — services externes, devices, bridges, connecteurs
  integrations: [
    'external-integrations', 'telegram-notifier', 'whatsapp', 'broadlink-bridge',
    'pushcut-bridge', 'push-notifications', 'push-auto-init', 'notification-actions',
    'apex-github-notifications', 'apex-secrets-proxy-client', 'apex-tv',
    'device-control', 'device-detect', 'device-context', 'companion-detect',
    'lan-scan-ios', 'network-scan', 'ios-shortcuts', 'ios-simulator',
    'apex-ios-native', 'card-emulator', 'badge-cloner', 'iot-providers-registry',
    'oauth-providers-registry', 'direct-connectors-registry', 'links-registry',
    'auto-discover-links', 'apex-auto-service-finder', 'study-service',
    'stripe-billing', 'commerce', 'ads', 'marketing-psy', 'contacts',
    'geolocation', 'cmc-planning-bridge', 'backend', 'browser-controller',
    'agent-browser', 'search', 'proxy-auto-enable',
  ],
  // sentinels/ — sentinelles auto-poll, watches, auto-réparation
  sentinels: [
    'agent-watches', 'ai-unblock-watch', 'audit-honesty-watch', 'autonomous-watch',
    'credentials-rotation-watch', 'innovation-watch', 'never-forget-watch',
    'no-regression-watch', 'reconsult-kevin-watch', 'rules-injection-watch',
    'skills-watch', 'sentinels', 'sentinels-registry', 'sentinel-auto-repair',
    'apex-kevin-stack-sentinels', 'self-healing', 'auto-improvement',
    'apex-ios-native-watch',
  ],
  // storage/ — persistance, backup, stores mémoire, firebase
  storage: [
    'firebase', 'firebase-queue', 'storage-compressor', 'persistent-memory-store',
    'pinecone-store', 'auto-backup', 'realtime-backup', 'restore-helper',
    'auto-ultra-reset', 'crypto-worker-client', 'secure-storage', 'memory-bridge',
  ],
  // core-svc/ — services transverses, helpers UI, orchestration, outils
  'core-svc': [
    'services-bootstrap', 'service-lifecycle', 'capabilities', 'preflight',
    'i18n', 'style-injector', 'csp-style-helper', 'anti-zoom-ios',
    'global-back-button', 'force-update-banner', 'frontend-design',
    'impeccable-design', 'media-studio', 'hyperframes', 'image-transform',
    'file-converter', 'form-auto-fill', 'click-fallback-guard', 'rules-engine',
    'orchestrator', 'agent-system', 'personal-assistant', 'apex-tools',
    'apex-tools-dispatch', 'apex-tools-types', 'apex-meta-marketplace',
    'apex-meta-marketplace-types', 'apex-plugins-marketplace', 'apex-extra-skills',
    'apex-orchestration-skills', 'gstack-roles', 'economy-mode', 'cross-platform',
    'pwa-capabilities',
  ],
};

// --- Construire la table de déplacement -------------------------------------
const fileToDomain = new Map();
for (const [dom, files] of Object.entries(DOMAIN)) {
  for (const f of files) {
    if (fileToDomain.has(f)) throw new Error('Doublon catégorisation: ' + f);
    fileToDomain.set(f, dom);
  }
}

// Tous les services/*.ts à plat
const flatServices = fs.readdirSync(path.join(ROOT, 'services'))
  .filter((f) => f.endsWith('.ts') && fs.statSync(path.join(ROOT, 'services', f)).isFile());

// Vérifier couverture exhaustive
const missing = flatServices.map((f) => f.replace(/\.ts$/, '')).filter((b) => !fileToDomain.has(b));
if (missing.length) throw new Error('Non catégorisés (' + missing.length + '): ' + missing.join(', '));
const extra = [...fileToDomain.keys()].filter((b) => !flatServices.includes(b + '.ts'));
if (extra.length) throw new Error('Catégorisés mais introuvables: ' + extra.join(', '));

// movedMap : chemin absolu ancien -> chemin absolu nouveau
const movedMap = new Map();
for (const f of flatServices) {
  const base = f.replace(/\.ts$/, '');
  const dom = fileToDomain.get(base);
  movedMap.set(
    path.join(ROOT, 'services', f),
    path.join(ROOT, 'services', dom, f),
  );
}
console.log('Fichiers à déplacer: ' + movedMap.size + ' vers ' + Object.keys(DOMAIN).length + ' domaines');

// --- Réécriture des imports -------------------------------------------------
// Scan exhaustif de tout l'arbre v13 (tout fichier .ts peut importer un service).
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', 'playwright-report']);
const allTsFiles = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(p); }
    else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) allTsFiles.push(p);
  }
})(ROOT);
console.log('Fichiers .ts scannés: ' + allTsFiles.length);

function resolveTarget(fromDir, spec) {
  const base = path.resolve(fromDir, spec);
  const cands = [];
  if (spec.endsWith('.js')) cands.push(base.replace(/\.js$/, '.ts'), base.replace(/\.js$/, '.tsx'));
  cands.push(base, base + '.ts', base + '.tsx', base + '.js',
    path.join(base, 'index.ts'), path.join(base, 'index.tsx'));
  for (const c of cands) {
    try { if (fs.statSync(c).isFile()) return c; } catch { /* noop */ }
  }
  return null;
}

const IMPORT_RE = /\b(?:from|import)\s*\(?\s*(['"])([^'"\n]+)\1/g;

let changedFiles = 0;
let changedImports = 0;
const writes = []; // {dest, content}

for (const file of allTsFiles) {
  const src = fs.readFileSync(file, 'utf8');
  const newImporter = movedMap.get(file) || file;
  let dirty = false;

  const out = src.replace(IMPORT_RE, (full, q, spec) => {
    const isAliasSvc = spec.startsWith('@services/');
    const isRel = spec.startsWith('./') || spec.startsWith('../');
    if (!isAliasSvc && !isRel) return full;

    // Résoudre la cible (sur l'arbre ORIGINAL)
    let resolved;
    if (isAliasSvc) {
      resolved = resolveTarget(path.join(ROOT, 'services'), './' + spec.slice('@services/'.length));
    } else {
      resolved = resolveTarget(path.dirname(file), spec);
    }
    if (!resolved) return full; // externe / introuvable -> laisser

    // node = fichier, ou dossier si import d'index
    const isDirIndex = /[/\\]index\.tsx?$/.test(resolved) && !/index/.test(spec.split('/').pop());
    const nodeOld = isDirIndex ? path.dirname(resolved) : resolved;
    const nodeNew = movedMap.get(nodeOld) || nodeOld;

    const specBase = spec.split('/').pop();
    let newSpec;
    if (isAliasSvc) {
      const relDir = path.relative(path.join(ROOT, 'services'), path.dirname(nodeNew)).split(path.sep).join('/');
      newSpec = '@services/' + (relDir ? relDir + '/' : '') + specBase;
    } else {
      let pre = path.relative(path.dirname(newImporter), path.dirname(nodeNew)).split(path.sep).join('/');
      if (pre === '') pre = '.';
      newSpec = (pre.startsWith('.') ? pre : './' + pre) + '/' + specBase;
    }
    if (newSpec === spec) return full;
    dirty = true;
    changedImports++;
    return full.replace(q + spec + q, q + newSpec + q);
  });

  if (dirty || newImporter !== file) {
    writes.push({ dest: newImporter, src: file, content: out, moved: newImporter !== file });
    if (dirty) changedFiles++;
  }
}

console.log('Imports réécrits: ' + changedImports + ' dans ' + changedFiles + ' fichiers');

if (DRY) { console.log('(dry-run, aucun changement écrit)'); process.exit(0); }

// --- Appliquer : créer dossiers, git mv, écrire contenus --------------------
const { execSync } = require('child_process');
for (const dom of Object.keys(DOMAIN)) {
  const d = path.join(ROOT, 'services', dom);
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}
// git mv d'abord (préserve l'historique)
for (const [oldP, newP] of movedMap) {
  const rel = (p) => path.relative(ROOT, p);
  execSync('git mv ' + JSON.stringify(rel(oldP)) + ' ' + JSON.stringify(rel(newP)), { cwd: ROOT });
}
// puis écrire les contenus réécrits (à leur emplacement final)
for (const w of writes) {
  fs.writeFileSync(w.dest, w.content);
}
console.log('OK — ' + movedMap.size + ' fichiers déplacés, ' + writes.length + ' fichiers réécrits.');
