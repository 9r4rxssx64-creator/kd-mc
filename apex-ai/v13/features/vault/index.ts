/**
 * APEX v13 — Vue Coffre (Vault) — Refonte visuelle premium (Kevin 2026-05-07)
 *
 * Demande Kevin : "Je veux un visuel de mes codes que je mets au fur à mesure.
 * Classé, organisé, que j'ai accès. Je peux ajouter manuellement ou dans le chat etc."
 *
 * Nouveautés v13.0.83+ :
 *  - 10 catégories avec accordéon (IA / Paiements / DevOps / Comms / Social /
 *    Stockage / E-commerce / Crypto / Identité / Autres)
 *  - Cards premium par credential : status badge live (🟢🟡🔴), valeur masquée,
 *    bouton 🔄 Test, 💰 Recharger, ✏️ Modifier, 🗑 Supprimer
 *  - Modal "+ Ajouter manuellement" : sélecteur catégorie + service + valeur
 *    + bouton "Détecter automatiquement" (auto-detect via patterns)
 *  - Search filter live (fuzzy par nom service + alias)
 *  - Stats header (total / actifs / dégradés / invalides)
 *  - Bouton "🔄 Tester tout" (test toutes les clés en parallèle)
 *
 * Sécurité :
 *  - escapeHtml partout (XSS)
 *  - Confirm avant delete
 *  - Valeurs jamais exposées en clair (toujours masquées 4+••••••+4)
 *  - Touch targets ≥ 32px (mobile-first iPhone 375px)
 */

import { escapeHtml } from '../../core/escape-html.js';
import { createCleanupScope, type CleanupScope } from '../../core/listener-cleanup.js';
import { logger } from '../../core/logger.js';
import { store } from '../../core/store.js';
import { preserveScroll } from '../../core/view-utils.js';
import { guardFeatureEnabled } from '../../services/auth/feature-guard.js';
import { cspStyleHelper } from '../../services/core-svc/csp-style-helper.js';
import { autoDiscoverLinks } from '../../services/integrations/auto-discover-links.js';
import { linksRegistry } from '../../services/integrations/links-registry.js';
import { CREDENTIAL_PATTERNS, detectCredential, type CredentialPattern } from '../../services/vault/credential-patterns.js';
import { genericSecrets } from '../../services/vault/generic-secrets.js';
import { multiKeyVault, type KeyEntry, type KeyStatus } from '../../services/vault/multi-key-vault.js';
import { vault } from '../../services/vault/vault.js';
import { haptic } from '../../ui/haptic.js';
import { skeleton } from '../../ui/skeleton.js';
import { toast } from '../../ui/toast.js';

/* P1-6 (audit v13.2.7) : scope listeners pour anti-leak SPA navigation. */
let activeVaultScope: CleanupScope | null = null;

export function dispose(): void {
  activeVaultScope?.cleanup();
  activeVaultScope = null;
}

export { escapeHtml };

/* ──────────────────────────── Types & domain helpers ──────────────────────────── */

export interface VaultEntry {
  pattern: CredentialPattern;
  status: 'configured' | 'empty' | 'encrypted' | 'plaintext_legacy';
  masked: string;
}

export interface CredentialDisplay {
  /** ID interne unique (multi-key) ou storageKey (legacy) */
  id: string;
  /** Identifiant service (ex: "anthropic", "stripe") */
  service: string;
  /** Nom affichable (ex: "Anthropic Claude") */
  serviceName: string;
  /** Alias optionnel ("perso", "client X") */
  alias?: string;
  /** Catégorie agrégée pour groupement UI (id catégorie) */
  category: string;
  /** Statut runtime (multi-key vault) */
  status: KeyStatus;
  /** Préfixe en clair pour masquage (4+•••+4) — jamais la valeur complète */
  preview?: string;
  /** Timestamps */
  addedAt?: number;
  lastTestedAt?: number;
  /** URL recharge directe (1-clic) si link registry connaît */
  rechargeUrl?: string;
  /** Logo officiel (favicon ou SVG provider) — optional */
  logoUrl?: string;
  /** Source de l'entrée pour wiring actions */
  source: 'multi-key' | 'legacy';
  /** v13.4.284 — description « à quoi ça correspond » (libre, saisie Kevin). */
  label?: string;
  /** v13.4.284 — 'info' = donnée perso non testable (nom/adresse/note). */
  kind?: 'secret' | 'info';
}

export interface CategoryDef {
  id: string;
  label: string;
  /** Liste de mots-clés (substring, case-insensitive) qui rattachent un service à cette catégorie */
  serviceMatchers: ReadonlyArray<string>;
  /** Catégories CredentialPattern["category"] mappées (pour entrées legacy) */
  patternCategories: ReadonlyArray<CredentialPattern['category']>;
}

export const CATEGORIES: ReadonlyArray<CategoryDef> = [
  {
    id: 'ai',
    label: '🤖 IA & LLM',
    serviceMatchers: [
      'anthropic', 'openai', 'groq', 'google', 'gemini', 'openrouter', 'cohere',
      'mistral', 'perplexity', 'deepseek', 'xai', 'elevenlabs', 'replicate',
      'huggingface', 'fireworks', 'togetherai', 'deepl',
    ],
    patternCategories: ['ai'],
  },
  {
    id: 'finance',
    label: '💳 Paiements & Finance',
    serviceMatchers: [
      'stripe', 'paypal', 'revolut', 'wise', 'lydia', 'n26', 'boursorama',
      'fortuneo', 'ing', 'socgen', 'bnp', 'credit_agricole', 'credit_mutuel',
      'banque_postale', 'lbp', 'bpce', 'shopify',
    ],
    patternCategories: ['finance'],
  },
  {
    id: 'devops',
    label: '🛠 DevOps & Code',
    serviceMatchers: [
      'github', 'gitlab', 'cloudflare', 'vercel', 'netlify', 'railway',
      'aws', 'heroku', 'sentry', 'npm',
    ],
    patternCategories: ['devops'],
  },
  {
    id: 'comms',
    label: '📨 Communications',
    serviceMatchers: [
      'telegram', 'discord', 'slack', 'brevo', 'resend', 'twilio',
      'sendgrid', 'mailchimp', 'whatsapp',
    ],
    patternCategories: ['comms'],
  },
  {
    id: 'social',
    label: '🌐 Réseaux sociaux',
    serviceMatchers: [
      'facebook', 'instagram', 'tiktok', 'youtube', 'twitter', 'linkedin',
    ],
    patternCategories: [],
  },
  {
    id: 'storage',
    label: '☁️ Stockage & Cloud',
    serviceMatchers: [
      'firebase', 'supabase', 'airtable', 'notion', 'dropbox', 'pinecone', 'weaviate',
    ],
    patternCategories: ['storage'],
  },
  {
    id: 'ecommerce',
    label: '🛒 E-commerce',
    serviceMatchers: ['shopify', 'stripe_connect', 'paypal_business'],
    patternCategories: [],
  },
  {
    id: 'crypto',
    label: '₿ Crypto',
    serviceMatchers: ['coinbase', 'binance', 'crypto_com', 'kraken'],
    patternCategories: [],
  },
  {
    id: 'identity',
    label: '🆔 Identité Kevin',
    serviceMatchers: [
      'kevin', 'iban', 'siret', 'vat', 'bic', 'apple', 'microsoft',
    ],
    patternCategories: ['identity'],
  },
  {
    /* v13.4.284 (Kevin "il perd aussi les infos appartements / adresses") :
     * catégorie dédiée — alimentée uniquement quand Kevin choisit explicitement
     * « Adresses & appartements » dans le modal (pas de matcher par nom). */
    id: 'addresses',
    label: '🏠 Adresses & appartements',
    serviceMatchers: [],
    patternCategories: [],
  },
  {
    id: 'other',
    label: '📦 Autres',
    serviceMatchers: [],
    patternCategories: ['saas'],
  },
];

/* v13.4.284 — catégories toujours visibles même vides (Kevin doit pouvoir y
 * ajouter ses infos perso : identité, adresses, notes/divers). */
const ALWAYS_VISIBLE_CATS = new Set(['identity', 'addresses', 'other']);

/* Catégories dont le contenu est par défaut une INFO perso (non testable) et
 * non une clé API → kind:'info' (témoin vert « enregistré »). */
const INFO_CATEGORIES = new Set(['identity', 'addresses']);

/**
 * Map service ID → catégorie UI. Match le PLUS LONG mot-clé gagne (préfère
 * "kevin" sur "email" pour kevin_email). Fallback "other".
 */
export function classifyService(service: string, patternCat?: CredentialPattern['category']): string {
  const lc = service.toLowerCase();
  let best: { catId: string; matchLen: number } | null = null;
  for (const cat of CATEGORIES) {
    if (cat.id === 'other') continue;
    for (const m of cat.serviceMatchers) {
      if (lc.includes(m)) {
        if (!best || m.length > best.matchLen) {
          best = { catId: cat.id, matchLen: m.length };
        }
      }
    }
  }
  if (best) return best.catId;
  if (patternCat) {
    for (const cat of CATEGORIES) {
      if (cat.patternCategories.includes(patternCat)) return cat.id;
    }
  }
  return 'other';
}

/* ──────────────────────────── Listings (legacy + multi-key) ──────────────────────────── */

/**
 * Liste credentials legacy (1 clé / storageKey) — back-compat tests + paste auto-detect.
 */
export function listVaultEntries(): VaultEntry[] {
  return CREDENTIAL_PATTERNS.filter((p) => p.category !== 'forbidden').map((p) => {
    const status = vault.getKeyStatus(p.storageKey);
    const raw = (() => {
      try {
        return localStorage.getItem(p.storageKey) ?? '';
      } catch {
        return '';
      }
    })();
    const masked = raw && raw.length > 8 && !raw.startsWith('AXENC1:')
      ? vault.maskKey(raw)
      : raw.startsWith('AXENC1:') ? '🔒 chiffré' : '';
    return { pattern: p, status, masked };
  });
}

/**
 * Filtre les entrées legacy par catégorie ou statut.
 */
export function filterVaultEntries(
  entries: ReadonlyArray<VaultEntry>,
  filter: { category?: CredentialPattern['category']; configuredOnly?: boolean; query?: string },
): VaultEntry[] {
  return entries.filter((e) => {
    if (filter.category && e.pattern.category !== filter.category) return false;
    if (filter.configuredOnly && e.status === 'empty') return false;
    if (filter.query) {
      const q = filter.query.toLowerCase();
      const matches = e.pattern.name.toLowerCase().includes(q) || e.pattern.storageKey.toLowerCase().includes(q);
      if (!matches) return false;
    }
    return true;
  });
}

/**
 * Construit la liste affichable enrichie pour la nouvelle UI : multi-key vault
 * (chaque clé est sa propre card) + rechargeUrl auto-injecté.
 */
export function buildCredentialDisplays(): CredentialDisplay[] {
  const items: CredentialDisplay[] = [];
  let mkAll: KeyEntry[] = [];
  try {
    mkAll = multiKeyVault.listAll(true);
  } catch (err: unknown) {
    logger.warn('feature-vault', 'multiKeyVault.listAll failed', { err });
  }
  for (const k of mkAll) {
    const link = linksRegistry.get(k.service);
    const pattern = CREDENTIAL_PATTERNS.find((p) => p.storageKey.includes(k.service));
    /* v13.4.284 — la catégorie choisie par Kevin (k.category) prime sur la
     * déduction par nom de service → ses infos atterrissent là où il les a mises
     * (Identité Kevin / Adresses / Autres) au lieu de finir toutes dans « Autres ». */
    const display: CredentialDisplay = {
      id: k.id,
      service: k.service,
      serviceName: link?.name ?? capitalize(k.service),
      category: k.category ?? classifyService(k.service, pattern?.category),
      status: k.status,
      source: 'multi-key',
    };
    if (k.label !== undefined) display.label = k.label;
    if (k.kind !== undefined) display.kind = k.kind;
    if (k.alias !== undefined) display.alias = k.alias;
    if (k.addedAt !== undefined) display.addedAt = k.addedAt;
    if (k.lastTestedAt !== undefined) display.lastTestedAt = k.lastTestedAt;
    const recharge = linksRegistry.getRechargeLink(k.service);
    if (recharge) display.rechargeUrl = recharge;
    items.push(display);
  }
  return items;
}

/**
 * Stats agrégées pour le header.
 */
export function computeStats(): { total: number; active: number; failing: number; invalid: number } {
  const items = buildCredentialDisplays();
  const stats = { total: items.length, active: 0, failing: 0, invalid: 0 };
  for (const it of items) {
    if (it.status === 'active') stats.active += 1;
    else if (it.status === 'failing' || it.status === 'rate-limited') stats.failing += 1;
    else if (it.status === 'invalid') stats.invalid += 1;
  }
  return stats;
}

/**
 * Filtrage + groupement par catégorie pour le rendu accordéon.
 */
export function getCredentialsForCategory(cat: CategoryDef, query = ''): CredentialDisplay[] {
  const all = buildCredentialDisplays();
  const q = query.trim().toLowerCase();
  return all.filter((c) => {
    if (c.category !== cat.id) return false;
    if (!q) return true;
    return (
      c.service.toLowerCase().includes(q)
      || c.serviceName.toLowerCase().includes(q)
      || (c.alias?.toLowerCase().includes(q) ?? false)
    );
  });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ──────────────────────────── Auto-detect + persist ──────────────────────────── */

/**
 * Auto-detect + store legacy (kept for back-compat tests + paste textarea).
 */
export async function autoDetectAndStore(
  input: string,
): Promise<
  | { ok: true; pattern_name: string; storage_key: string }
  | { ok: true; generic: true; pattern_name: 'Secret générique'; storage_key: string; generic_id: string }
  | { ok: false; reason: string }
> {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, reason: 'Entrée vide' };
  const detected = detectCredential(trimmed);
  if (detected && detected.category === 'forbidden') {
    return { ok: false, reason: '🚨 Type interdit (cartes/seed phrases jamais stockées)' };
  }
  if (detected) {
    try {
      const encrypted = await vault.encryptAuto(trimmed);
      localStorage.setItem(detected.storageKey, encrypted);
      return { ok: true, pattern_name: detected.name, storage_key: detected.storageKey };
    } catch (err: unknown) {
      logger.warn('vault-feature', 'autoDetectAndStore failed', { err });
      return { ok: false, reason: 'Erreur chiffrement' };
    }
  }
  /* P0.3 catch-all (Kevin v13.3.98) : si > 20 chars et aucun pattern reconnu,
   * proposer stockage en secret générique avec label auto. Kevin renomme ensuite. */
  if (trimmed.length >= 20) {
    const r = await genericSecrets.add(trimmed, undefined, 'Auto-détecté (pattern inconnu)');
    if (r.ok) {
      return {
        ok: true,
        generic: true,
        pattern_name: 'Secret générique',
        storage_key: 'apex_v13_generic_secrets',
        generic_id: r.id,
      };
    }
    return { ok: false, reason: r.reason };
  }
  return { ok: false, reason: 'Aucun pattern reconnu (trop court pour secret générique)' };
}

/**
 * Removes credential from legacy storage.
 */
export function removeCredential(storageKey: string): boolean {
  try {
    localStorage.removeItem(storageKey);
    return true;
  } catch (err: unknown) {
    logger.warn('vault-feature', 'remove failed', { err });
    return false;
  }
}

/**
 * Export coffre legacy en JSON (pour backup).
 */
export function exportVaultJson(entries: ReadonlyArray<VaultEntry>): string {
  const payload = {
    exported_at: new Date().toISOString(),
    version: 1,
    entries: entries
      .filter((e) => e.status !== 'empty')
      .map((e) => {
        const raw = (() => {
          try {
            return localStorage.getItem(e.pattern.storageKey) ?? '';
          } catch {
            return '';
          }
        })();
        return { storage_key: e.pattern.storageKey, name: e.pattern.name, value_encrypted: raw };
      }),
  };
  return JSON.stringify(payload, null, 2);
}

/* ──────────────────────────── Rendering helpers ──────────────────────────── */

/**
 * Card HTML pour un credential (multi-key) — premium look.
 */
export function renderCredentialCard(c: CredentialDisplay): string {
  const isInfo = c.kind === 'info';
  /* v13.4.284 — info perso = témoin VERT « enregistré » (rien à tester). */
  const statusColor = isInfo ? 'var(--ax-green)' : (STATUS_COLORS[c.status] ?? 'var(--ax-text-muted)');
  const statusEmoji = isInfo ? '🟢' : (STATUS_EMOJIS[c.status] ?? '⚪');
  const statusTitle = isInfo ? 'Enregistré' : c.status;
  const previewSafe = (c.preview ?? '').slice(0, 4) + '••••••' + (c.preview ?? '').slice(-4);
  const masked = c.preview ? previewSafe : '••••••';
  const recharge = c.rechargeUrl ?? '';
  const alias = c.alias ? `<span style="color:var(--ax-text-muted);font-size:11px">— ${escapeHtml(c.alias)}</span>` : '';
  /* v13.4.284 — « afficher à quoi correspond » : ligne description sous le nom. */
  const labelLine = c.label
    ? `<div style="font-size:12px;color:var(--ax-gold-deep);margin-top:-2px">📝 ${escapeHtml(c.label)}</div>`
    : '';
  const logoTag = c.logoUrl
    ? `<img src="${escapeHtml(c.logoUrl)}" alt="" loading="lazy" decoding="async" style="width:24px;height:24px;border-radius:6px" onerror="this.style.display='none'">`
    : '';
  const meta: string[] = [];
  if (c.addedAt) meta.push(`Ajouté ${formatRelativeTime(c.addedAt)}`);
  if (c.lastTestedAt) meta.push(`Testé ${formatRelativeTime(c.lastTestedAt)}`);
  const metaLine = meta.length > 0
    ? `<div style="display:flex;gap:8px;font-size:11px;color:var(--ax-text-muted);margin-bottom:10px">${meta.map((m) => `<span>${escapeHtml(m)}</span>`).join('')}</div>`
    : '';

  return `
    <div class="ax-cred-card" data-cred-id="${escapeHtml(c.id)}" data-service="${escapeHtml(c.service)}"
      style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px;transition:all 200ms ease-out;position:relative;display:flex;flex-direction:column;gap:8px">
      <div style="position:absolute;top:14px;right:14px;width:10px;height:10px;border-radius:50%;background:${escapeHtml(statusColor)};box-shadow:0 0 8px ${escapeHtml(statusColor)}" title="${escapeHtml(statusEmoji)} ${escapeHtml(statusTitle)}"></div>
      <div class="ax-gs-120">
        ${logoTag}
        <strong style="font-size:15px;color:#fff">${escapeHtml(c.serviceName)}</strong>
        ${alias}
      </div>
      ${labelLine}
      <code style="display:block;padding:6px 10px;background:rgba(0,0,0,0.3);border-radius:6px;font-size:11px;color:var(--ax-text-muted);font-family:'SF Mono',Menlo,monospace;letter-spacing:1px">${escapeHtml(masked)}</code>
      ${metaLine}
      ${isInfo ? `
      <div class="ax-gs-20">
        <span style="flex:1;min-width:120px;padding:6px 10px;background:rgba(34,204,119,0.1);color:var(--ax-green);border:1px solid rgba(34,204,119,0.25);border-radius:6px;font-size:11px;display:flex;align-items:center;justify-content:center;min-height:44px">🟢 Enregistré (chiffré)</span>
        <button data-action="edit" data-cred-id="${escapeHtml(c.id)}" aria-label="Modifier ${escapeHtml(c.serviceName)}" title="Modifier"
          style="min-width:44px;padding:6px 10px;background:rgba(255,255,255,0.05);color:var(--ax-text-dim);border:1px solid rgba(255,255,255,0.1);border-radius:6px;cursor:pointer;font-size:11px;min-height:44px">✏️</button>
        <button data-action="delete" data-cred-id="${escapeHtml(c.id)}" aria-label="Supprimer ${escapeHtml(c.serviceName)}" title="Supprimer"
          style="min-width:44px;padding:6px 10px;background:rgba(255,91,91,0.1);color:var(--ax-error);border:1px solid rgba(255,91,91,0.3);border-radius:6px;cursor:pointer;font-size:11px;min-height:44px">🗑</button>
      </div>` : `
      <div class="ax-gs-20">
        <button data-action="test" data-cred-id="${escapeHtml(c.id)}" aria-label="Tester la clé ${escapeHtml(c.service)}"
          style="flex:1;min-width:80px;padding:6px 10px;background:rgba(34,204,119,0.1);color:var(--ax-green);border:1px solid rgba(34,204,119,0.3);border-radius:6px;cursor:pointer;font-size:11px;min-height:44px">🔄 Test</button>
        <button data-action="recharge" data-service="${escapeHtml(c.service)}" data-recharge-url="${escapeHtml(recharge)}" ${recharge ? '' : 'disabled'} aria-label="Recharger ${escapeHtml(c.service)}"
          style="flex:1;min-width:80px;padding:6px 10px;background:rgba(201,162,39,0.1);color:var(--ax-gold-deep);border:1px solid rgba(201,162,39,0.3);border-radius:6px;cursor:pointer;font-size:11px;min-height:44px;${recharge ? '' : 'opacity:0.4;cursor:not-allowed'}">💰 Recharger</button>
        <button data-action="discover-links" data-service="${escapeHtml(c.service)}" aria-label="Chercher les liens de ${escapeHtml(c.service)}"
          title="Cherche login/dashboard/billing/api_keys/usage en autonomie"
          style="flex:1;min-width:80px;padding:6px 10px;background:rgba(74,158,255,0.1);color:var(--ax-blue-bright);border:1px solid rgba(74,158,255,0.3);border-radius:6px;cursor:pointer;font-size:11px;min-height:44px">🔍 Chercher liens</button>
        <button data-action="edit" data-cred-id="${escapeHtml(c.id)}" aria-label="Modifier la clé ${escapeHtml(c.service)}" title="Modifier"
          style="min-width:44px;padding:6px 10px;background:rgba(255,255,255,0.05);color:var(--ax-text-dim);border:1px solid rgba(255,255,255,0.1);border-radius:6px;cursor:pointer;font-size:11px;min-height:44px">✏️</button>
        <button data-action="delete" data-cred-id="${escapeHtml(c.id)}" aria-label="Supprimer la clé ${escapeHtml(c.service)}" title="Supprimer"
          style="min-width:44px;padding:6px 10px;background:rgba(255,91,91,0.1);color:var(--ax-error);border:1px solid rgba(255,91,91,0.3);border-radius:6px;cursor:pointer;font-size:11px;min-height:44px">🗑</button>
      </div>`}
    </div>
  `;
}

const STATUS_COLORS: Record<KeyStatus, string> = {
  active: 'var(--ax-green)',
  failing: 'var(--ax-warning)',
  'rate-limited': 'var(--ax-warning)',
  invalid: 'var(--ax-error)',
  unknown: 'var(--ax-text-muted)',
};

const STATUS_EMOJIS: Record<KeyStatus, string> = {
  active: '🟢',
  failing: '🟡',
  'rate-limited': '🟡',
  invalid: '🔴',
  unknown: '⚪',
};

/**
 * Formate un timestamp en "il y a Xmin / Xj".
 */
export function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 0 || !Number.isFinite(diff)) return 'à l\'instant';
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'à l\'instant';
  if (min < 60) return `il y a ${min}min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `il y a ${hr}h`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `il y a ${d}j`;
  const mo = Math.floor(d / 30);
  return `il y a ${mo} mois`;
}

/* ──────────────────────────── Render principal ──────────────────────────── */

let activeQuery = '';

/** v13.4.x — vrai si ≥1 clé credential flat (ax_*_key/_token/_secret/_sk) existe en
 * localStorage (hors clés volontairement supprimées). Détecte un Coffre dont l'index
 * central (apex_v13_multi_keys) est vide alors que les clés sont bien présentes —
 * cas Kevin "clés en mémoire mais pas dans le coffre" (post-restore shadow IDB). */
function hasFlatVaultKeys(): boolean {
  try {
    let deleted: string[] = [];
    try {
      const raw = JSON.parse(localStorage.getItem('ax_credentials_deleted') ?? '[]') as unknown;
      if (Array.isArray(raw)) deleted = raw.filter((x): x is string => typeof x === 'string');
    } catch { /* ignore */ }
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('ax_')) continue;
      if (!(k.endsWith('_key') || k.endsWith('_token') || k.endsWith('_secret') || k.endsWith('_sk'))) continue;
      if (deleted.includes(k)) continue;
      const v = localStorage.getItem(k);
      if (v && v.length > 2) return true;
    }
  } catch { /* ignore */ }
  return false;
}

/** Anti-boucle : une seule tentative de reconstruction auto de l'index par session. */
let vaultRebuildAttempted = false;

export function render(rootEl: HTMLElement): void {
  /* P1-6 : cleanup ancien scope avant re-render */
  activeVaultScope?.cleanup();
  activeVaultScope = createCleanupScope('vault');
  const isAdmin = store.get('isAdmin') as boolean | undefined;
  if (!isAdmin) {
    rootEl.innerHTML = `<div style="padding:40px;text-align:center"><h2 class="ax-gs-372">🔒 Coffre admin</h2><p class="ax-gs-226">Cette section est réservée à l'admin Kevin.</p></div>`;
    return;
  }
  /* Wire admin feature toggle (Kevin règle 2026-05-04 — ON/OFF tout). */
  const uid = (store.get('user') as { id?: string } | null)?.id ?? 'anon';
  if (!guardFeatureEnabled('admin.vault', rootEl, uid)) return;

  /* v13.4.x AUTO-RECOVER (Kevin "clés en mémoire mais pas dans le coffre" + "tout auto") :
   * si l'index central est vide MAIS des clés flat ax_*_key existent (restaurées depuis
   * le shadow IDB après un reset/clear), reconstruire l'index puis re-render. Kevin est
   * loggé ici → passphrase prête. Garde anti-boucle : 1 seule tentative par session. */
  if (!vaultRebuildAttempted && buildCredentialDisplays().length === 0 && hasFlatVaultKeys()) {
    vaultRebuildAttempted = true;
    rootEl.innerHTML = `<div style="padding:40px;text-align:center"><h2 class="ax-gs-372">🔓 Restauration du Coffre…</h2><p class="ax-gs-226">Récupération de tes clés depuis la sauvegarde locale, un instant.</p></div>`;
    void (async () => {
      try {
        const r = await multiKeyVault.migrateLegacyFlatKeys();
        logger.info('feature-vault', `auto-rebuild index : ${r.migrated} clés réinjectées dans le coffre`);
      } catch (err: unknown) {
        logger.warn('feature-vault', 'auto-rebuild migrate failed', { err });
      }
      render(rootEl);
    })();
    return;
  }

  const stats = computeStats();

  rootEl.innerHTML = cspStyleHelper.withNonce(`
    <style>
      /* v13.3.22 UX iPhone PWA fix Kevin "j'ai dû descendre la page on voit plus le haut" :
       * Header + search bar STICKY robustes (top:0 sans interférence padding parent).
       * Compact-mode auto via class .ax-vault-scrolled (ajoutée en JS au scroll > 80px).
       * Bottom safe-area + FAB floating "Tester tout" si scrollé loin. */
      .ax-vault-page button:active { transform: scale(0.96); }
      .ax-vault-page details[open] > summary .ax-chevron { transform: rotate(180deg); }
      .ax-cred-card:hover { transform: translateY(-2px); border-color: rgba(232,184,48,0.3) !important; }
      .ax-vault-sticky-wrap {
        /* Kevin 2026-06-08 : en-tête NON-collant — il restait figé en haut et le
         * reste défilait dessous. Il défile maintenant normalement avec le contenu. */
        position: relative;
        z-index: 1;
        margin: 0 -16px;
        padding: 0 16px;
        background: rgba(8,8,15,0.96);
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        border-bottom: 1px solid rgba(201,162,39,0.15);
        transition: padding 200ms ease, box-shadow 200ms ease;
      }
      /* Cache opaque derrière la barre d'état iPhone (viewport-fit=cover) : le
       * contenu scrollé disparaît proprement derrière l'heure au lieu de "passer
       * dessous". Hauteur = safe-area (0 sur appareils sans notch → invisible). */
      .ax-vault-statusbar-scrim {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: env(safe-area-inset-top, 0px);
        background: rgba(8,8,15,0.92);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        z-index: 45;
        pointer-events: none;
      }
      .ax-vault-page.ax-vault-scrolled .ax-vault-sticky-wrap {
        padding-top: 4px;
        padding-bottom: 4px;
        box-shadow: 0 6px 18px rgba(0,0,0,0.45);
      }
      .ax-vault-page.ax-vault-scrolled .ax-vault-stats { display: none; }
      .ax-vault-page.ax-vault-scrolled .ax-vault-h1 { font-size: 18px; }
      .ax-vault-page.ax-vault-scrolled .ax-vault-search-row {
        margin-top: 6px;
        padding-bottom: 6px;
      }
      .ax-vault-fab {
        position: fixed;
        right: 16px;
        bottom: calc(env(safe-area-inset-bottom, 0px) + 80px);
        z-index: 18;
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: linear-gradient(135deg,var(--ax-gold-deep),var(--ax-gold));
        color: #000;
        font-size: 22px;
        font-weight: 700;
        border: none;
        cursor: pointer;
        box-shadow: 0 8px 24px rgba(201,162,39,0.45);
        opacity: 0;
        transform: translateY(16px) scale(0.9);
        pointer-events: none;
        transition: opacity 220ms ease, transform 220ms cubic-bezier(0.16,1,0.3,1);
      }
      .ax-vault-page.ax-vault-scrolled .ax-vault-fab {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: auto;
      }
      @media (prefers-reduced-motion: reduce) {
        .ax-cred-card, .ax-vault-sticky-wrap, .ax-vault-fab { transition: none !important; }
        .ax-vault-page button:active { transform: none !important; }
      }
    </style>
    <div class="ax-vault-page" style="padding:env(safe-area-inset-top,16px) 16px calc(env(safe-area-inset-bottom,16px) + 96px);max-width:1140px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif">
      <div class="ax-vault-statusbar-scrim" aria-hidden="true"></div>

      <div class="ax-vault-sticky-wrap">
        <header style="padding:12px 0">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
            <h1 class="ax-vault-h1" style="margin:0;font-size:24px;background:linear-gradient(135deg,var(--ax-gold-deep),var(--ax-gold));-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-weight:700;transition:font-size 200ms ease">🔐 Coffre Codes</h1>
            <div class="ax-gs-7">
              <button id="ax-vault-add-manual" style="padding:8px 14px;background:linear-gradient(135deg,var(--ax-gold-deep),var(--ax-gold));color:#000;border:none;border-radius:10px;font-weight:700;cursor:pointer;font-size:13px;min-height:40px">+ Ajouter</button>
              <button id="ax-vault-test-all" style="padding:8px 14px;background:rgba(201,162,39,0.1);color:var(--ax-gold-deep);border:1px solid rgba(201,162,39,0.3);border-radius:10px;cursor:pointer;font-size:13px;min-height:40px">🔄 Tester tout</button>
            </div>
          </div>
          <div class="ax-vault-stats" style="display:flex;gap:14px;padding:8px 0 0;font-size:12px;color:var(--ax-text-dim);flex-wrap:wrap">
            <span>📊 ${stats.total} codes</span>
            <span class="ax-gs-222">🟢 ${stats.active} actifs</span>
            <span class="ax-gs-168">🟡 ${stats.failing} dégradés</span>
            <span class="ax-gs-76">🔴 ${stats.invalid} invalides</span>
          </div>
        </header>

        <div class="ax-vault-search-row" style="padding-bottom:12px;transition:padding 200ms ease">
          <input type="text" id="ax-vault-search" aria-label="Chercher un service dans le coffre" value="${escapeHtml(activeQuery)}" placeholder="🔍 Chercher un service..."
            style="width:100%;padding:12px 16px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;color:#fff;font-size:15px;box-sizing:border-box;-webkit-appearance:none;min-height:44px">
        </div>
      </div>

      <div style="height:14px"></div>

      ${(stats.total === 0 || stats.invalid > 0) ? `
      <section id="ax-vault-empty-rescue" class="ax-empty-banner" style="background:linear-gradient(135deg,rgba(255,91,91,0.10),rgba(232,184,48,0.06));border-color:rgba(255,91,91,0.35)">
        <h3 class="ax-empty-banner-title">${stats.total === 0 ? '🆘 Coffre vide — Restauration possible' : `🚨 ${stats.invalid} clé(s) illisible(s) — récupération ou cleanup`}</h3>
        <p class="ax-empty-banner-body">${stats.total === 0 ? 'Utilise les boutons « 🔓 Restaurer depuis Firebase » ou « 🔄 Scanner toutes sources » dans la section Diagnostic ci-dessous, ou recolle tes clés via « Auto-détection rapide ».' : 'Ces clés ont été chiffrées avec une passphrase historisée perdue (régression v13.3.86 fixée v13.3.88). Soit recoller les clés via « Auto-détection rapide », soit supprimer les illisibles.'}</p>
        ${stats.invalid > 0 ? `<div class="ax-gs-7"><button id="ax-vault-cleanup-invalid" data-action="cleanup-invalid" class="ax-btn-health ax-btn-health-danger">🗑 Supprimer ${stats.invalid} illisibles</button></div>` : ''}
      </section>
      ` : ''}

      <section style="background:linear-gradient(135deg,rgba(20,20,35,0.7),rgba(14,14,28,0.5));border:1px solid rgba(232,184,48,0.18);border-radius:14px;padding:14px;margin-bottom:14px">
        <h3 style="margin:0 0 8px;font-size:13px;color:var(--ax-gold);text-transform:uppercase;letter-spacing:0.08em;font-weight:700">🔍 Auto-détection rapide</h3>
        <p style="color:rgba(255,255,255,0.6);font-size:12px;margin:0 0 10px">Colle ici n'importe quelle clé API, Apex la reconnaît + la range automatiquement.</p>
        <textarea id="ax-vault-paste" placeholder="Colle ta clé ici (sk-ant-..., AIzaSy..., re_...)" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
          style="width:100%;background:rgba(0,0,0,0.35);color:#fff;border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px 12px;font-family:'SF Mono',Menlo,monospace;font-size:16px;min-height:60px;resize:vertical;box-sizing:border-box;-webkit-appearance:none;-webkit-touch-callout:default;-webkit-user-select:text;user-select:text"></textarea>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
          <button id="ax-vault-paste-clipboard-btn" type="button"
            style="padding:10px 16px;background:rgba(106,138,255,0.18);color:var(--ax-blue);border:1px solid rgba(106,138,255,0.35);border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;min-height:44px">📋 Coller du presse-papier</button>
          <button id="ax-vault-paste-btn" type="button"
            style="padding:10px 20px;background:linear-gradient(135deg,var(--ax-gold-deep),var(--ax-gold));color:#000;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;min-height:44px">🔍 Détecter & stocker</button>
        </div>
        <div id="ax-vault-paste-result" class="ax-gs-249"></div>
      </section>

      <details id="ax-vault-proxy-providers" style="background:rgba(34,204,119,0.05);border:1px solid rgba(34,204,119,0.18);border-radius:14px;overflow:hidden;margin-bottom:12px">
        <summary style="padding:14px 16px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;font-weight:600;list-style:none;-webkit-tap-highlight-color:transparent;min-height:44px">
          <span>🌐 Providers via proxy (serveur) <span id="ax-vault-proxy-count" style="color:var(--ax-text-muted);font-weight:400;font-size:13px"></span></span>
          <span class="ax-chevron" style="color:var(--ax-text-muted)">▼</span>
        </summary>
        <div style="padding:0 14px 14px">
          <p style="margin:0 0 10px;color:var(--ax-text-muted);font-size:12px">Clés stockées côté serveur (secrets GitHub → worker Cloudflare). Apex ne les détient jamais, il passe par le proxy.</p>
          <div id="ax-vault-proxy-list" style="display:flex;flex-wrap:wrap;gap:8px"></div>
        </div>
      </details>

      <div id="ax-vault-categories" style="display:flex;flex-direction:column;gap:12px"></div>

      <section style="margin-top:18px;padding:14px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:14px">
        <h3 style="margin:0 0 10px;color:var(--ax-gold);font-size:12px;text-transform:uppercase;letter-spacing:0.08em;font-weight:700">💾 Backup & Restore</h3>
        <p style="margin:0 0 10px;color:rgba(255,255,255,0.7);font-size:12px;line-height:1.5">⚠️ Sauvegarde TES clés AVANT tout reinstall PWA. Firebase rules require auth = ton backup auto Firebase ne marche pas.</p>
        <div class="ax-gs-7">
          <button id="ax-vault-export"
            style="padding:10px 16px;background:rgba(106,138,255,0.15);color:var(--ax-blue);border:1px solid rgba(106,138,255,0.3);border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;min-height:44px">📥 Exporter (JSON)</button>
          <button id="ax-vault-import"
            style="padding:10px 16px;background:rgba(34,204,119,0.15);color:var(--ax-green);border:1px solid rgba(34,204,119,0.3);border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;min-height:44px">📂 Importer JSON (depuis Drive)</button>
          <button id="ax-vault-qr-backup"
            style="padding:10px 16px;background:linear-gradient(135deg,var(--ax-gold-deep),var(--ax-gold));color:#000;border:none;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;min-height:44px">📦 Backup vault QR (Photos iCloud)</button>
        </div>
      </section>

      <section style="margin-top:14px;padding:14px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:14px">
        <h3 style="margin:0 0 8px;color:var(--ax-gold);font-size:12px;text-transform:uppercase;letter-spacing:0.08em;font-weight:700">📊 Diagnostic & restauration</h3>
        <p style="margin:0 0 10px;color:rgba(255,255,255,0.7);font-size:12px;line-height:1.5">Maintenance <strong>automatique au boot</strong> (v13.4.268+) : migration des clés, scan multi-sources et restauration Firebase se font tout seuls. Le diagnostic ci-dessous est juste pour vérifier l'état.</p>
        <div class="ax-gs-7">
          <button id="ax-vault-diag-btn" type="button"
            style="padding:10px 16px;background:rgba(106,138,255,0.18);color:var(--ax-blue);border:1px solid rgba(106,138,255,0.35);border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;min-height:44px">📊 Diagnostic complet</button>
        </div>
        <details style="margin-top:10px">
          <summary style="cursor:pointer;color:rgba(255,255,255,0.55);font-size:12px;padding:8px 0;min-height:36px;list-style:none">🔧 Dépannage avancé <span style="opacity:.7">(rarement utile — tout est auto)</span></summary>
          <div class="ax-gs-7" style="margin-top:8px">
            <button id="ax-vault-rescue-fb" data-action="rescue-firebase" type="button"
              style="padding:10px 16px;background:rgba(232,184,48,0.18);color:var(--ax-gold);border:1px solid rgba(232,184,48,0.40);border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;min-height:44px">🔓 Restaurer depuis Firebase</button>
            <button id="ax-vault-migrate-legacy-btn" type="button"
              style="padding:10px 16px;background:rgba(232,184,48,0.20);color:var(--ax-gold);border:1px solid rgba(232,184,48,0.45);border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;min-height:44px">🔁 Migrer mes clés legacy</button>
            <button id="ax-vault-repair-services-btn" type="button"
              style="padding:10px 16px;background:rgba(247,131,34,0.20);color:var(--ax-orange);border:1px solid rgba(247,131,34,0.45);border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;min-height:44px">♻️ Réparer services</button>
            <button id="ax-vault-push-all-btn" type="button"
              style="padding:10px 16px;background:linear-gradient(135deg,var(--ax-gold-deep),var(--ax-gold));color:#000;border:none;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;min-height:44px">📤 Push backup Firebase</button>
            <button id="ax-vault-rescue-all" data-action="rescue-scan-all" type="button"
              style="padding:10px 16px;background:rgba(106,138,255,0.15);color:var(--ax-blue);border:1px solid rgba(106,138,255,0.30);border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;min-height:44px">🔄 Scanner toutes sources</button>
          </div>
        </details>
        <div id="ax-vault-diag-result" style="margin-top:10px;font-size:12px;color:rgba(255,255,255,0.85)"></div>
        <div id="ax-vault-rescue-result" style="margin-top:10px;font-size:12px;color:rgba(255,255,255,0.85)"></div>
      </section>

      <p style="text-align:center;color:rgba(255,255,255,0.4);font-size:11px;margin-top:16px;padding:14px;background:rgba(255,255,255,0.02);border-radius:12px;line-height:1.6">
        🛡 <strong style="color:rgba(255,255,255,0.6)">Sécurité</strong> : AES-GCM 256 + PBKDF2 200k iterations · Audit log immutable<br>
        <span style="opacity:0.7">FB_LOCAL strict pour ax_pin/ax_user · jamais de plaintext en backup</span>
      </p>

      <button id="ax-vault-fab" class="ax-vault-fab" type="button" aria-label="Tester toutes les clés" title="Tester toutes les clés">🔄</button>
      <div id="ax-vault-modal-root"></div>
    </div>
  `);

  renderCategories(rootEl);
  attachHandlers(rootEl);
  attachScrollUx(rootEl);
  void renderProxyProviders(rootEl);
  logger.info('feature-vault', `rendered (${stats.total} entries)`);
}

/**
 * v13.3.22 UX iPhone PWA — auto compact-mode header au scroll + FAB.
 * Listener scroll passif (perf) + threshold 80px + cleanup auto via scope.
 */
function attachScrollUx(rootEl: HTMLElement): void {
  const page = rootEl.querySelector<HTMLElement>('.ax-vault-page');
  const fab = rootEl.querySelector<HTMLButtonElement>('#ax-vault-fab');
  if (!page) return;

  let lastY = 0;
  let raf = 0;
  const onScroll = (): void => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      if (y === lastY) return;
      lastY = y;
      if (y > 80) page.classList.add('ax-vault-scrolled');
      else page.classList.remove('ax-vault-scrolled');
    });
  };
  if (activeVaultScope) {
    activeVaultScope.bind(window, 'scroll', onScroll, { passive: true });
  } else {
    window.addEventListener('scroll', onScroll, { passive: true });
  }
  /* Initial state */
  onScroll();

  /* FAB → trigger "Tester tout" handler (réutilise listener du bouton header) */
  if (fab && activeVaultScope) {
    activeVaultScope.bind(fab, 'click', () => {
      haptic.tap();
      const headerBtn = rootEl.querySelector<HTMLButtonElement>('#ax-vault-test-all');
      headerBtn?.click();
    });
  }
}

/** v13.4.283 (Kevin « pourquoi les 22 ne s'affichent pas ») : liste les providers
 * servis par le proxy (côté serveur — clés jamais dans l'app), lus depuis le /health
 * du worker. Affichés en vert (= worker a la clé). Visibilité sans stockage local. */
async function renderProxyProviders(rootEl: HTMLElement): Promise<void> {
  const list = rootEl.querySelector<HTMLDivElement>('#ax-vault-proxy-list');
  const count = rootEl.querySelector<HTMLSpanElement>('#ax-vault-proxy-count');
  if (!list) return;
  try {
    const { apexSecretsProxy } = await import('../../services/integrations/apex-secrets-proxy-client.js');
    const h = await apexSecretsProxy.checkHealth();
    if (!h.ok || !h.data) {
      list.innerHTML = '<span style="color:var(--ax-text-muted);font-size:13px">Proxy injoignable</span>';
      return;
    }
    const provs = h.data.available_providers;
    if (count) count.textContent = `(${provs.length}/${h.data.total} actifs)`;
    list.innerHTML = provs
      .map(
        (p) =>
          `<span style="display:inline-flex;align-items:center;gap:5px;padding:5px 10px;background:rgba(34,204,119,0.12);color:var(--ax-green);border:1px solid rgba(34,204,119,0.25);border-radius:999px;font-size:12px">● ${escapeHtml(p)}</span>`,
      )
      .join('');
  } catch (err: unknown) {
    logger.debug('feature-vault', 'renderProxyProviders failed', { err });
    list.innerHTML = '<span style="color:var(--ax-text-muted);font-size:13px">Proxy non configuré</span>';
  }
}

function renderCategories(rootEl: HTMLElement): void {
  const container = rootEl.querySelector<HTMLDivElement>('#ax-vault-categories');
  if (!container) return;
  /* H3 audit fix v13.3.74 — skeleton si pas encore décrypté (computeStats peut être 0 au boot)
   * v13.4.6 fix tests : on rend TOUJOURS les catégories en parallèle du skeleton pour
   * que la règle Kevin "Identité toujours visible" tienne dès le 1er render. */
  const stats = computeStats();
  if (stats.total === 0 && !container.dataset['axInitialized']) {
    container.dataset['axInitialized'] = '1';
    /* Skeleton dans un wrapper séparé pour ne pas écraser la section Identité rendue ensuite. */
    const skel = document.createElement('div');
    skel.className = 'ax-skel-vault-wrapper';
    container.appendChild(skel);
    const dispose = skeleton(skel, 'vault-cards');
    /* Auto-clear après 250ms (decrypt sync localStorage en général < 100ms) */
    setTimeout(() => {
      dispose();
      skel.remove();
      /* Re-render once decrypt done */
      renderCategories(rootEl);
    }, 250);
    /* Fallthrough : on continue le rendu des catégories visibles (Identité) */
  }
  const catsHtml = CATEGORIES.map((cat) => {
    const credsInCat = getCredentialsForCategory(cat, activeQuery);
    /* v13.4.284 — affiche toujours Identité / Adresses / Autres même vides,
     * pour que Kevin puisse y ajouter ses infos perso (sinon « jamais affichées »). */
    if (credsInCat.length === 0 && !ALWAYS_VISIBLE_CATS.has(cat.id)) return '';
    /* Kevin 2026-06-08 "Paiement ouvert par défaut ?!" : catégories FERMÉES par
     * défaut (épuré + ne pas exposer les infos sensibles d'office). Ouvertes
     * uniquement pendant une recherche, pour voir les résultats filtrés. */
    const isOpen = activeQuery.trim().length > 0;
    return `
      <details class="ax-cat" data-cat-id="${escapeHtml(cat.id)}" ${isOpen ? 'open' : ''}
        style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:14px;overflow:hidden">
        <summary style="padding:14px 16px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;font-weight:600;list-style:none;-webkit-tap-highlight-color:transparent;min-height:44px">
          <span>${escapeHtml(cat.label)} <span style="color:var(--ax-text-muted);font-weight:400;font-size:13px">(${credsInCat.length})</span></span>
          <span class="ax-chevron" style="color:var(--ax-text-muted);transition:transform 200ms ease-out">▼</span>
        </summary>
        <div style="padding:0 14px 14px;display:grid;grid-template-columns:repeat(auto-fill, minmax(280px,1fr));gap:10px">
          ${credsInCat.map((c) => renderCredentialCard(c)).join('')}
          ${credsInCat.length === 0 ? `
            <div style="padding:20px;color:var(--ax-text-muted);text-align:center;grid-column:1/-1;font-size:13px">
              Aucun code dans cette catégorie<br>
              <button data-action="add-to-cat" data-cat-id="${escapeHtml(cat.id)}"
                style="margin-top:10px;padding:8px 14px;background:rgba(201,162,39,0.1);color:var(--ax-gold-deep);border:1px solid rgba(201,162,39,0.3);border-radius:8px;cursor:pointer;font-size:12px;min-height:36px">
                + Ajouter ${escapeHtml(cat.label)}
              </button>
            </div>
          ` : ''}
        </div>
      </details>
    `;
  }).join('');
  /* v13.4.6 : préserve skeleton (1er rendu) tout en injectant les catégories visibles.
   * Wrapper séparé pour ne pas casser le skeleton wrapper précédemment ajouté. */
  let catsWrapper = container.querySelector<HTMLDivElement>('.ax-vault-cats-wrapper');
  if (!catsWrapper) {
    catsWrapper = document.createElement('div');
    catsWrapper.className = 'ax-vault-cats-wrapper';
    container.appendChild(catsWrapper);
  }
  catsWrapper.innerHTML = catsHtml;
}

/* ──────────────────────────── Handlers ──────────────────────────── */

/* v13.4.280 (Kevin "les tests doivent se faire auto pour vert ou autre") :
 * auto-test de TOUTES les clés à l'ouverture du Coffre. Throttle 2 min pour
 * éviter le spam ET la boucle (le re-render rappelle attachHandlers mais le
 * throttle bloque le 2e test). Statuts vert/rouge/dégradé live, sans clic. */
let lastCoffreAutoTest = 0;

function attachHandlers(rootEl: HTMLElement): void {
  /* Auto-test à l'ouverture (background, throttlé). */
  if (Date.now() - lastCoffreAutoTest > 120000) {
    lastCoffreAutoTest = Date.now();
    void (async () => {
      try {
        const r = await multiKeyVault.healthCheckAll();
        if (r.tested > 0) render(rootEl); /* throttle bloque le re-test au re-render */
      } catch (err: unknown) {
        logger.debug('feature-vault', 'auto-test coffre skipped', { err });
      }
    })();
  }

  /* Search live (debounced) */
  const searchEl = rootEl.querySelector<HTMLInputElement>('#ax-vault-search');
  if (searchEl) {
    let debounce: ReturnType<typeof setTimeout> | null = null;
    activeVaultScope!.bind(searchEl, 'input', () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        activeQuery = searchEl.value.trim();
        renderCategories(rootEl);
        attachCardHandlers(rootEl);
      }, 240);
    });
  }

  /* "+ Ajouter" header button */
  const addBtn = rootEl.querySelector<HTMLButtonElement>('#ax-vault-add-manual');
  if (addBtn && activeVaultScope) activeVaultScope.bind(addBtn, 'click', () => {
    haptic.tap();
    openAddModal(rootEl);
  });

  /* "🔄 Tester tout" */
  const testAllBtn = rootEl.querySelector<HTMLButtonElement>('#ax-vault-test-all');
  if (testAllBtn && activeVaultScope) activeVaultScope.bind(testAllBtn, 'click', () => {
    void (async () => {
      haptic.tap();
      toast.info('Test de toutes les clés en cours…');
      try {
        const result = await multiKeyVault.healthCheckAll();
        toast.success(`✅ ${result.tested} testées · ${result.recovered} récupérées · ${result.stillDown} HS`);
        render(rootEl);
      } catch (err: unknown) {
        logger.warn('feature-vault', 'testAll failed', { err });
        toast.error('Erreur pendant le test global');
      }
    })();
  });

  /* v13.3.80 Kevin 19:55 — boutons rescue coffre vide */
  const rescueFb = rootEl.querySelector<HTMLButtonElement>('#ax-vault-rescue-fb');
  if (rescueFb && activeVaultScope) activeVaultScope.bind(rescueFb, 'click', () => {
    void (async () => {
      haptic.tap();
      const result = rootEl.querySelector<HTMLDivElement>('#ax-vault-rescue-result');
      if (result) result.innerHTML = '⏳ Lecture Firebase backup chiffré…';
      try {
        const { vaultFirebaseBackup } = await import('../../services/vault/vault-firebase-backup.js');
        const r = await vaultFirebaseBackup.restoreAllFromFirebaseBackup();
        if (result) {
          /* v13.4.133 audit-grade : DOM API, valeurs numériques mais audit XSS strict */
          result.textContent = '';
          const div = document.createElement('div');
          div.style.cssText = 'padding:8px;background:rgba(34,204,119,.1);color:var(--ax-green);border-radius:8px';
          div.textContent = `🔓 ${r.restored} clés restaurées · ${r.failed} échouées · ${r.skipped} ignorées`;
          result.append(div);
        }
        if (r.restored > 0) {
          toast.success(`🔓 ${r.restored} clés restaurées depuis Firebase backup`);
          haptic.success();
          setTimeout(() => void preserveScroll(rootEl, () => render(rootEl)), 600);
        } else {
          toast.info('Aucune clé trouvée dans Firebase backup');
        }
      } catch (err: unknown) {
        logger.warn('feature-vault', 'rescueFb failed', { err });
        if (result) result.innerHTML = `<div class="ax-gs-48">⚠ ${escapeHtml(String(err).slice(0, 120))}</div>`;
        toast.error('Erreur lecture Firebase backup');
        haptic.error();
      }
    })();
  });

  const rescueAll = rootEl.querySelector<HTMLButtonElement>('#ax-vault-rescue-all');
  if (rescueAll && activeVaultScope) activeVaultScope.bind(rescueAll, 'click', () => {
    void (async () => {
      haptic.tap();
      const result = rootEl.querySelector<HTMLDivElement>('#ax-vault-rescue-result');
      if (result) result.innerHTML = '⏳ Scan 4 sources : alias, IDB, Firebase, pattern…';
      try {
        const { autoRestoreCredentials } = await import('../../services/vault/auto-restore-credentials.js');
        const r = await autoRestoreCredentials.restoreAutomatically();
        if (result) {
          result.textContent = '';
          const div = document.createElement('div');
          div.style.cssText = 'padding:8px;background:rgba(34,204,119,.1);color:var(--ax-green);border-radius:8px';
          div.textContent = `🔓 ${r.restored} restaurées · ${r.failed} échouées`;
          result.append(div);
        }
        if (r.restored > 0) {
          toast.success(`🔓 ${r.restored} clés restaurées (4 sources)`);
          haptic.success();
          setTimeout(() => void preserveScroll(rootEl, () => render(rootEl)), 600);
        } else {
          toast.info('Aucune clé trouvable dans les 4 sources. Colle une clé manuellement ci-dessous.');
        }
      } catch (err: unknown) {
        logger.warn('feature-vault', 'rescueAll failed', { err });
        if (result) result.innerHTML = `<div class="ax-gs-48">⚠ ${escapeHtml(String(err).slice(0, 120))}</div>`;
        toast.error('Erreur scan multi-sources');
        haptic.error();
      }
    })();
  });

  /* v13.4.261 Kevin "Problème Cloudflare, pas de mémoire coffre" :
   * Diagnostic complet read-only des 3 couches vault + ping worker proxy.
   * Lecture seule, modifie rien, expose la cause exacte à Kevin. */
  const diagBtn = rootEl.querySelector<HTMLButtonElement>('#ax-vault-diag-btn');
  if (diagBtn && activeVaultScope) activeVaultScope.bind(diagBtn, 'click', () => {
    void (async () => {
      haptic.tap();
      const result = rootEl.querySelector<HTMLDivElement>('#ax-vault-diag-result');
      if (result) result.textContent = '⏳ Diagnostic en cours (local + Firebase + Cloudflare)…';
      try {
        const { vaultDiagnostic } = await import('../../services/admin/vault-diagnostic.js');
        const r = await vaultDiagnostic.run();
        if (!result) return;
        result.textContent = '';
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;flex-direction:column;gap:8px';
        /* Summary */
        const summary = document.createElement('div');
        summary.style.cssText = 'padding:10px;background:rgba(106,138,255,0.08);border:1px solid rgba(106,138,255,0.25);border-radius:8px;font-weight:600';
        summary.textContent = r.summary;
        wrap.append(summary);
        /* Détail local */
        const localBox = document.createElement('div');
        localBox.style.cssText = 'padding:8px 10px;background:rgba(255,255,255,0.03);border-radius:8px;font-size:12px;line-height:1.5';
        const localLine = document.createElement('div');
        const orphanTxt = r.local.legacy_flat_orphans > 0 ? ` · ⚠ ${r.local.legacy_flat_orphans} hors coffre central` : '';
        localLine.textContent = `💾 Local : ${r.local.total} clé(s) — ${r.local.encrypted} chiffrées · ${r.local.multi_keys_count} dans coffre${orphanTxt}`;
        localBox.append(localLine);
        if (r.local.sample.length) {
          const ex = document.createElement('div');
          ex.style.cssText = 'opacity:0.6;font-family:monospace;font-size:11px;margin-top:4px';
          ex.textContent = 'ex. ' + r.local.sample.join(', ');
          localBox.append(ex);
        }
        wrap.append(localBox);
        /* Détail Firebase */
        const fbBox = document.createElement('div');
        fbBox.style.cssText = 'padding:8px 10px;background:rgba(255,255,255,0.03);border-radius:8px;font-size:12px;line-height:1.5';
        const fbLine = document.createElement('div');
        const fbIcon = r.firebase.connected ? '🟢' : '🔴';
        fbLine.textContent = `☁ Firebase ${fbIcon} ${r.firebase.state} — ${r.firebase.backup_count} backup(s)`;
        fbBox.append(fbLine);
        if (r.firebase.drift_detected) {
          const drift = document.createElement('div');
          drift.style.cssText = 'opacity:0.85;color:var(--ax-gold);margin-top:4px';
          drift.textContent = `⚠ Drift : ${r.firebase.in_local_not_fb.length} local-only, ${r.firebase.in_fb_not_local.length} Firebase-only`;
          fbBox.append(drift);
        }
        wrap.append(fbBox);
        /* Détail Cloudflare proxy */
        const cfBox = document.createElement('div');
        cfBox.style.cssText = 'padding:8px 10px;background:rgba(255,255,255,0.03);border-radius:8px;font-size:12px;line-height:1.5';
        const cfLine = document.createElement('div');
        const cfIcon = r.cloudflare_proxy.reachable ? '🟢' : '🔴';
        cfLine.textContent = `🌐 Cloudflare proxy ${cfIcon} ${r.cloudflare_proxy.reachable ? `OK (${r.cloudflare_proxy.latency_ms}ms, ${r.cloudflare_proxy.providers.length} providers)` : 'KO (' + (r.cloudflare_proxy.error ?? 'unreachable') + ')'}`;
        cfBox.append(cfLine);
        const cfUrl = document.createElement('div');
        cfUrl.style.cssText = 'opacity:0.55;font-family:monospace;font-size:10px;margin-top:4px;word-break:break-all';
        cfUrl.textContent = r.cloudflare_proxy.url;
        cfBox.append(cfUrl);
        wrap.append(cfBox);
        /* Reco actions */
        if (r.recommendations.length) {
          const recoBox = document.createElement('div');
          recoBox.style.cssText = 'padding:10px;background:rgba(232,184,48,0.08);border:1px solid rgba(232,184,48,0.25);border-radius:8px;font-size:12px;line-height:1.6';
          const recoTitle = document.createElement('div');
          recoTitle.style.cssText = 'font-weight:700;color:var(--ax-gold);margin-bottom:6px';
          recoTitle.textContent = '💡 À faire :';
          recoBox.append(recoTitle);
          for (const rec of r.recommendations) {
            const item = document.createElement('div');
            item.style.cssText = 'padding:3px 0 3px 12px;position:relative';
            const bullet = document.createElement('span');
            bullet.style.cssText = 'position:absolute;left:0;top:3px';
            bullet.textContent = '→';
            item.append(bullet);
            item.append(document.createTextNode(' ' + rec));
            recoBox.append(item);
          }
          wrap.append(recoBox);
        }
        result.append(wrap);
        haptic.success();
      } catch (err: unknown) {
        logger.warn('feature-vault', 'diag failed', { err });
        if (result) {
          result.textContent = '';
          const errBox = document.createElement('div');
          errBox.style.cssText = 'padding:8px;background:rgba(255,91,91,0.1);color:#ff8b8b;border-radius:8px';
          errBox.textContent = '⚠ Diagnostic échoué : ' + String(err).slice(0, 160);
          result.append(errBox);
        }
        toast.error('Diagnostic impossible');
        haptic.error();
      }
    })();
  });

  /* v13.4.266 Kevin "diag dit 14 clés mais visuel coffre = juste Anthropic" :
   * MIGRATION manuelle des clés legacy flat localStorage → coffre central
   * apex_v13_multi_keys. Lecture seule sur localStorage (n'efface rien). */
  const migrateBtn = rootEl.querySelector<HTMLButtonElement>('#ax-vault-migrate-legacy-btn');
  if (migrateBtn && activeVaultScope) activeVaultScope.bind(migrateBtn, 'click', () => {
    void (async () => {
      haptic.tap();
      const result = rootEl.querySelector<HTMLDivElement>('#ax-vault-diag-result');
      if (result) result.textContent = '⏳ Migration des clés legacy en cours…';
      try {
        const r = await multiKeyVault.migrateLegacyFlatKeys();
        if (!result) return;
        result.textContent = '';
        const box = document.createElement('div');
        const allGood = r.failed === 0 && r.migrated > 0;
        box.style.cssText = `padding:10px;background:${allGood ? 'rgba(34,204,119,.1)' : 'rgba(232,184,48,.08)'};color:${allGood ? 'var(--ax-green)' : 'var(--ax-gold)'};border:1px solid ${allGood ? 'rgba(34,204,119,0.25)' : 'rgba(232,184,48,0.25)'};border-radius:8px;font-size:12px;line-height:1.5`;
        const line1 = document.createElement('div');
        line1.style.cssText = 'font-weight:700;margin-bottom:4px';
        line1.textContent = `🔁 ${r.scanned} clé(s) legacy scannées : ${r.migrated} migrées · ${r.failed} échec(s) · ${r.skipped} ignorées`;
        box.append(line1);
        if (r.failed > 0) {
          const hint = document.createElement('div');
          hint.style.cssText = 'opacity:0.85;color:#ff8b8b;margin-top:4px';
          const failedServices = r.details.filter((d) => d.status === 'failed').map((d) => d.key.replace(/^(ax_|apex_v13_)/, '').replace(/_(key|token|secret)$/, ''));
          const shown = failedServices.slice(0, 5).join(', ');
          hint.textContent = `${r.failed} clé(s) illisibles (passphrase historique perdue, erreur #55) : ${shown}${r.failed > 5 ? `… +${r.failed - 5}` : ''}.`;
          box.append(hint);
          /* v13.4.272 (Kevin "Rappel toi quelles sont dans GitHub secret presque toute") :
           * Tester quels services ont une clé valide côté worker proxy (GitHub Secrets).
           * Si oui → Kevin n'a PAS besoin de re-coller, l'IA y accède via proxyFetch. */
          void (async () => {
            try {
              const mod = await import('../../services/integrations/apex-secrets-proxy-client.js');
              const health = await mod.apexSecretsProxy.checkHealth();
              if (health.ok && health.data?.available_providers?.length) {
                const proxyServices = new Set(health.data.available_providers);
                const recoverable = failedServices.filter((s) => proxyServices.has(s.toLowerCase()));
                if (recoverable.length > 0) {
                  const infoBox = document.createElement('div');
                  infoBox.style.cssText = 'margin-top:8px;padding:8px;background:rgba(34,204,119,.08);color:var(--ax-green);border:1px solid rgba(34,204,119,0.20);border-radius:6px;line-height:1.5';
                  const title = document.createElement('div');
                  title.style.cssText = 'font-weight:700;margin-bottom:2px';
                  title.textContent = `✅ ${recoverable.length} dispo via worker proxy (GitHub Secrets)`;
                  infoBox.append(title);
                  const body = document.createElement('div');
                  body.style.cssText = 'font-size:11px;opacity:0.9';
                  body.textContent = `${recoverable.slice(0, 8).join(', ')}${recoverable.length > 8 ? '…' : ''} — l'IA Apex les utilise via le worker proxy sans avoir besoin de la clé en local. Pour les voir dans l'UI Coffre, recolle-les via « Auto-détection rapide ».`;
                  infoBox.append(body);
                  box.append(infoBox);
                }
              }
            } catch (err: unknown) {
              logger.debug('feature-vault', 'proxy availability check failed', { err });
            }
          })();
        }
        if (r.skipped > 0) {
          const skipHint = document.createElement('div');
          skipHint.style.cssText = 'opacity:0.7;margin-top:4px';
          const skippedKeys = r.details.filter((d) => d.status === 'skipped').slice(0, 5).map((d) => d.key.replace(/^(ax_|apex_v13_)/, '').replace(/_(key|token|secret)$/, ''));
          skipHint.textContent = `Ignorées (déjà dans coffre ou service inconnu) : ${skippedKeys.join(', ')}${r.skipped > 5 ? '…' : ''}.`;
          box.append(skipHint);
        }
        result.append(box);
        if (r.migrated > 0) {
          toast.success(`🔁 ${r.migrated} clés legacy migrées vers le coffre central`);
          haptic.success();
          /* Rafraîchit l'UI pour afficher les nouvelles clés */
          setTimeout(() => void preserveScroll(rootEl, () => render(rootEl)), 600);
        } else if (r.failed > 0) {
          toast.error(`${r.failed} échec(s) decrypt — passphrase perdue`);
          haptic.error();
        } else {
          toast.info('Rien à migrer (tout déjà à jour ou clés legacy absentes)');
        }
      } catch (err: unknown) {
        logger.warn('feature-vault', 'migrateLegacyFlatKeys failed', { err });
        if (result) {
          result.textContent = '';
          const errBox = document.createElement('div');
          errBox.style.cssText = 'padding:8px;background:rgba(255,91,91,0.1);color:#ff8b8b;border-radius:8px';
          errBox.textContent = '⚠ Migration échouée : ' + String(err).slice(0, 160);
          result.append(errBox);
        }
        toast.error('Migration impossible');
        haptic.error();
      }
    })();
  });

  /* v13.4.267 Kevin "bcp de clefs non fonctionnelles et liens pas bons" :
   * Répare les services migrés avec un nom non-canonique (ex : "cloudflare_global"
   * → "cloudflare"). Sans ça : PING_CONFIGS et linksRegistry ne matchent pas
   * → test échoue + lien dashboard invalide. */
  const repairBtn = rootEl.querySelector<HTMLButtonElement>('#ax-vault-repair-services-btn');
  if (repairBtn && activeVaultScope) activeVaultScope.bind(repairBtn, 'click', () => {
    void (async () => {
      haptic.tap();
      const result = rootEl.querySelector<HTMLDivElement>('#ax-vault-diag-result');
      if (result) result.textContent = '⏳ Réparation des services mal nommés…';
      try {
        const r = await multiKeyVault.repairMisnamedServices();
        if (!result) return;
        result.textContent = '';
        const box = document.createElement('div');
        const ok = r.renamed > 0 || r.deleted_duplicate > 0;
        box.style.cssText = `padding:10px;background:${ok ? 'rgba(34,204,119,.1)' : 'rgba(255,255,255,0.03)'};color:${ok ? 'var(--ax-green)' : 'rgba(255,255,255,0.85)'};border:1px solid ${ok ? 'rgba(34,204,119,0.25)' : 'rgba(255,255,255,0.1)'};border-radius:8px;font-size:12px;line-height:1.5`;
        const line1 = document.createElement('div');
        line1.style.cssText = 'font-weight:700;margin-bottom:4px';
        line1.textContent = `♻️ ${r.scanned} entrée(s) scannées : ${r.renamed} renommée(s) · ${r.deleted_duplicate} duplicate(s) marqué(s) invalides · ${r.skipped} déjà canoniques`;
        box.append(line1);
        if (r.renamed > 0) {
          const detail = document.createElement('div');
          detail.style.cssText = 'opacity:0.85;margin-top:4px';
          const sample = r.details
            .filter((d) => d.status === 'renamed')
            .slice(0, 6)
            .map((d) => `${d.from} → ${d.to}`)
            .join(', ');
          detail.textContent = `Renommés : ${sample}${r.renamed > 6 ? '…' : ''}. Liens dashboard + endpoints test devraient maintenant matcher.`;
          box.append(detail);
        }
        result.append(box);
        if (r.renamed > 0) {
          toast.success(`♻️ ${r.renamed} services renommés en canonique`);
          haptic.success();
          setTimeout(() => void preserveScroll(rootEl, () => render(rootEl)), 600);
        } else {
          toast.info('Rien à réparer (services déjà canoniques)');
        }
      } catch (err: unknown) {
        logger.warn('feature-vault', 'repairMisnamedServices failed', { err });
        if (result) {
          result.textContent = '';
          const errBox = document.createElement('div');
          errBox.style.cssText = 'padding:8px;background:rgba(255,91,91,0.1);color:#ff8b8b;border-radius:8px';
          errBox.textContent = '⚠ Réparation échouée : ' + String(err).slice(0, 160);
          result.append(errBox);
        }
        toast.error('Réparation impossible');
        haptic.error();
      }
    })();
  });

  /* v13.4.265 Kevin "Firebase RECONNECTING + 0 backup" : bouton 1-clic qui
   * pousse TOUTES les clés vault locales (préfixes ax_ + apex_v13_) vers
   * `vault_backup/<uid>/<key>` Firebase. Réutilise pushAllLocal() existant.
   * Idempotent : skip throttle 5min par clé, mais avec force:true on bypass. */
  const pushAllBtn = rootEl.querySelector<HTMLButtonElement>('#ax-vault-push-all-btn');
  if (pushAllBtn && activeVaultScope) activeVaultScope.bind(pushAllBtn, 'click', () => {
    void (async () => {
      haptic.tap();
      const result = rootEl.querySelector<HTMLDivElement>('#ax-vault-diag-result');
      if (result) result.textContent = '⏳ Push de toutes les clés chiffrées vers Firebase backup…';
      try {
        const { vaultFirebaseBackup } = await import('../../services/vault/vault-firebase-backup.js');
        const r = await vaultFirebaseBackup.pushAllLocal();
        if (!result) return;
        result.textContent = '';
        const box = document.createElement('div');
        box.style.cssText = 'padding:10px;background:rgba(34,204,119,.1);color:var(--ax-green);border:1px solid rgba(34,204,119,0.25);border-radius:8px;font-size:12px;line-height:1.5';
        const line1 = document.createElement('div');
        line1.style.cssText = 'font-weight:700;margin-bottom:4px';
        line1.textContent = `📤 ${r.pushed} clé(s) backupées · ${r.failed} échec(s) · ${r.skipped} ignorées`;
        box.append(line1);
        if (r.failed > 0) {
          const hint = document.createElement('div');
          hint.style.cssText = 'opacity:0.85;color:var(--ax-gold)';
          hint.textContent = 'Échecs probables : Firebase hors-ligne (RECONNECTING). Relance ce push quand le diag affiche Firebase 🟢 CONNECTED.';
          box.append(hint);
        } else if (r.pushed === 0 && r.skipped > 0) {
          const hint = document.createElement('div');
          hint.style.cssText = 'opacity:0.85';
          hint.textContent = `${r.skipped} clé(s) déjà backupées récemment (throttle 5 min) — rien à faire.`;
          box.append(hint);
        }
        result.append(box);
        if (r.pushed > 0) {
          toast.success(`📤 ${r.pushed} clés backupées vers Firebase`);
          haptic.success();
        } else if (r.failed > 0) {
          toast.error(`${r.failed} échec(s) — Firebase hors-ligne ?`);
          haptic.error();
        } else {
          toast.info('Rien à push (tout est déjà à jour ou throttle)');
        }
      } catch (err: unknown) {
        logger.warn('feature-vault', 'pushAll failed', { err });
        if (result) {
          result.textContent = '';
          const errBox = document.createElement('div');
          errBox.style.cssText = 'padding:8px;background:rgba(255,91,91,0.1);color:#ff8b8b;border-radius:8px';
          errBox.textContent = '⚠ Push échoué : ' + String(err).slice(0, 160);
          result.append(errBox);
        }
        toast.error('Push impossible');
        haptic.error();
      }
    })();
  });

  /* v13.3.90 Kevin "10 clés API illisibles youtube/perplexity/pinecone/xai/mistral" :
   * cleanup auto des entrées invalid (decrypt fail). Permet de supprimer les
   * orphelines chiffrées avec passphrase perdue v13.3.86 XOR-obf. */
  const cleanupBtn = rootEl.querySelector<HTMLButtonElement>('#ax-vault-cleanup-invalid');
  if (cleanupBtn && activeVaultScope) activeVaultScope.bind(cleanupBtn, 'click', () => {
    void (async () => {
      haptic.tap();
      const result = rootEl.querySelector<HTMLDivElement>('#ax-vault-rescue-result');
      if (!confirm('Supprimer définitivement toutes les clés illisibles (decrypt fail) ?\n\nCes clés sont chiffrées avec une passphrase perdue. Tu devras les recoller pour les retrouver.')) {
        return;
      }
      if (result) result.innerHTML = '⏳ Suppression des entrées illisibles…';
      try {
        const items = buildCredentialDisplays();
        const invalid = items.filter((it) => it.status === 'invalid');
        let deleted = 0;
        /* v13.3.91 fix Kevin "j'ai effacé mais il me dit encore 1 illisible" :
         * utiliser multiKeyVault.removeKey() qui fait le triple cleanup
         * (localStorage + IDB + Firebase null + ax_credentials_deleted whitelist).
         * L'ancien cleanup local.removeItem ne touchait pas le multi-key-vault store. */
        for (const item of invalid) {
          try {
            /* Si ID mkv_* (multi-key-vault), utiliser removeKey API */
            if (item.id.startsWith('mkv_') || item.id.includes('_')) {
              multiKeyVault.removeKey(item.id);
              deleted++;
              continue;
            }
            /* Legacy : direct localStorage cleanup */
            const storageKey = item.id.startsWith('ax_') || item.id.startsWith('apex_v13_')
              ? item.id
              : `ax_${item.service}_key`;
            localStorage.removeItem(storageKey);
            const req = indexedDB.open('apex_v13_vault_shadow', 1);
            req.onsuccess = (): void => {
              try {
                req.result.transaction('keys', 'readwrite').objectStore('keys').delete(storageKey);
                req.result.close();
              } catch { /* skip */ }
            };
            deleted++;
          } catch { /* skip */ }
        }
        if (result) {
          result.textContent = '';
          const divDel = document.createElement('div');
          divDel.style.cssText = 'padding:8px;background:rgba(34,204,119,.1);color:var(--ax-green);border-radius:8px';
          divDel.textContent = `🗑 ${deleted} clé(s) illisibles supprimées. Recolle tes clés via "Détecter & stocker" ci-dessous.`;
          result.append(divDel);
        }
        toast.success(`🗑 ${deleted} clés illisibles supprimées`);
        haptic.success();
        setTimeout(() => void preserveScroll(rootEl, () => render(rootEl)), 800);
      } catch (err: unknown) {
        logger.warn('feature-vault', 'cleanupInvalid failed', { err });
        toast.error('Erreur suppression');
        haptic.error();
      }
    })();
  });

  /* v13.4.6 Kevin "je n'arrive pas à coller" — bouton "📋 Coller du presse-papier" iOS PWA safe */
  const pasteClipboardBtn = rootEl.querySelector<HTMLButtonElement>('#ax-vault-paste-clipboard-btn');
  if (pasteClipboardBtn && activeVaultScope) activeVaultScope.bind(pasteClipboardBtn, 'click', () => {
    void (async () => {
      haptic.tap();
      const ta = rootEl.querySelector<HTMLTextAreaElement>('#ax-vault-paste');
      const result = rootEl.querySelector<HTMLDivElement>('#ax-vault-paste-result');
      if (!ta) return;
      try {
        /* Permission auto-request iOS Safari */
        if (!navigator.clipboard?.readText) {
          throw new Error('Clipboard API non supportée');
        }
        const text = await navigator.clipboard.readText();
        if (!text) {
          if (result) result.innerHTML = `<div class="ax-gs-174">⚠ Presse-papier vide</div>`;
          return;
        }
        ta.value = text;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        haptic.success();
        toast.success(`📋 ${text.length} caractères collés — clique "Détecter & stocker"`);
        if (result) result.innerHTML = `<div style="padding:8px;background:rgba(106,138,255,.1);color:var(--ax-blue);border-radius:8px">📋 Collé — clique "Détecter & stocker" pour analyser</div>`;
        ta.focus();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'unknown';
        toast.error(`Clipboard refusé : ${msg}. Utilise long-press → Coller manuellement.`);
        if (result) result.innerHTML = `<div class="ax-gs-48">⚠ Permission refusée. Long-press dans le champ → Coller.</div>`;
      }
    })();
  });

  /* Auto-detect paste */
  const pasteBtn = rootEl.querySelector<HTMLButtonElement>('#ax-vault-paste-btn');
  if (pasteBtn && activeVaultScope) activeVaultScope.bind(pasteBtn, 'click', () => {
    void (async () => {
      haptic.tap();
      const ta = rootEl.querySelector<HTMLTextAreaElement>('#ax-vault-paste');
      const result = rootEl.querySelector<HTMLDivElement>('#ax-vault-paste-result');
      if (!ta || !result) return;
      /* v13.4.6 fix bug : on capture ta.value AVANT de le vider */
      const valueToProcess = ta.value.trim();
      if (!valueToProcess) {
        result.innerHTML = `<div class="ax-gs-174">⚠ Colle quelque chose d'abord</div>`;
        return;
      }
      const r = await autoDetectAndStore(valueToProcess);
      if (r.ok) {
        haptic.success();
        /* Tente aussi addition multi-key (si service connu via storageKey).
         * v13.4.270 : addKey pousse maintenant immédiatement le backup chiffré
         * dédié vers Firebase vault_backup/<uid>/<key> (force:true bypass throttle). */
        const detected = detectCredential(valueToProcess);
        if (detected) {
          const serviceFromKey = detected.storageKey.replace(/^(ax_|apex_v13_)/, '').replace(/_(?:key|token|pat|sk|pk|id|secret)$/, '');
          try {
            await multiKeyVault.addKey(serviceFromKey, valueToProcess);
          } catch {
            /* legacy mode only — not blocking */
          }
        }
        /* v13.4.270 (Kevin "Toutes nouvelles informations dois être sauvegardé
         * sûr immédiatement") : feedback EXPLICITE des 3 couches de sauvegarde. */
        const { firebase } = await import('../../services/storage/firebase.js');
        const fbState = firebase.getConnectionState();
        const fbIcon = fbState === 'CONNECTED' ? '🟢 poussé' : (fbState === 'RECONNECTING' ? '🟡 en queue (push auto à la reconnexion)' : '⚪ ' + fbState);
        toast.success(`✅ ${r.pattern_name} stocké · 🔐 AES-GCM-256 · 💾 local OK · ☁ ${fbIcon}`, { duration: 6000 });
        result.innerHTML = `<div style="padding:10px;background:rgba(34,204,119,.1);color:var(--ax-green);border-radius:8px;line-height:1.55">
          <div style="font-weight:700">✅ ${escapeHtml(r.pattern_name)} → ${escapeHtml(r.storage_key)}</div>
          <div style="font-size:11px;opacity:0.85;margin-top:4px">🔐 Chiffré AES-GCM-256 + PBKDF2 200k · 💾 localStorage + IDB shadow · ☁ Firebase backup ${fbIcon}</div>
        </div>`;
        ta.value = '';
        render(rootEl);
      } else {
        haptic.error();
        toast.error(r.reason);
        result.innerHTML = `<div class="ax-gs-48">⚠ ${escapeHtml(r.reason)}</div>`;
      }
    })();
  });

  /* v13.4.117 (Kevin "Go autonome sans mentir") — Import JSON depuis Drive.
   * iOS oblige gesture user pour <input type="file"> → 1 tap Kevin minimum.
   * Sélection fichier apex-vault-backup-*.json → decrypt + restore complet. */
  const importBtn = rootEl.querySelector<HTMLButtonElement>('#ax-vault-import');
  if (importBtn && activeVaultScope) {
    activeVaultScope.bind(importBtn, 'click', () => {
      void (async () => {
        haptic.tap();
        try {
          const { apexVaultImport } = await import('../../services/vault/apex-vault-import.js');
          const r = await apexVaultImport.promptAndImport();
          if (r.cancelled) {
            toast.info('Import annulé', { duration: 2000 });
            return;
          }
          if (r.ok && r.restored > 0) {
            toast.success(`🔓 ${r.restored} clés restaurées depuis JSON Drive${r.failed > 0 ? ` · ${r.failed} échouées` : ''}`, { duration: 8000 });
            /* Refresh UI */
            setTimeout(() => location.reload(), 1500);
          } else if (r.decrypt_failed > 0) {
            toast.error(`🔒 ${r.decrypt_failed} clés non déchiffrables. PIN admin différent ? Vérifie ton PIN actuel.`, { duration: 10000 });
          } else if (r.error) {
            toast.error(`Import échoué : ${r.error.slice(0, 80)}`, { duration: 8000 });
          } else {
            toast.warn('Aucune clé restaurée depuis ce JSON', { duration: 5000 });
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          toast.error(`Import erreur : ${msg.slice(0, 80)}`, { duration: 8000 });
        }
      })();
    });
  }

  /* Export JSON */
  const exportBtn = rootEl.querySelector<HTMLButtonElement>('#ax-vault-export');
  if (exportBtn && activeVaultScope) activeVaultScope.bind(exportBtn, 'click', () => {
    haptic.tap();
    const json = exportVaultJson(listVaultEntries());
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `apex-vault-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Coffre exporté (chiffré)');
  });

  /* v13.4.115 (Kevin "J'ai tout collé" 18 clés + Firebase backup KO) :
   * Backup vault complet en QR pour sauvegarde Photos iCloud.
   *
   * v13.4.116 (Kevin "Vault 4.9KB > 2.9KB max") :
   * Strategy fallback en cascade :
   * 1. Try LZ-string compress (UTF16) → souvent -70% taille
   * 2. Si toujours trop gros → upload Gist privé chiffré + QR contient juste l'URL
   * 3. Si Gist KO → fallback download JSON */
  const qrBackupBtn = rootEl.querySelector<HTMLButtonElement>('#ax-vault-qr-backup');
  if (qrBackupBtn && activeVaultScope) {
    activeVaultScope.bind(qrBackupBtn, 'click', () => {
      void (async () => {
        haptic.tap();
        try {
          const json = exportVaultJson(listVaultEntries());
          const origSizeKB = (json.length / 1024).toFixed(1);
          const count = listVaultEntries().length;
          const QR_MAX_SAFE = 2500; /* QR v40 binaire ~2953 mais on prend marge */

          /* Strategy 1 : compression LZ-string */
          let compressed = '';
          try {
            const lz = await import('https://cdn.jsdelivr.net/npm/lz-string@1.5.0/+esm' as string) as {
              compressToEncodedURIComponent: (s: string) => string;
            };
            compressed = lz.compressToEncodedURIComponent(json);
            const compSizeKB = (compressed.length / 1024).toFixed(1);
            logger.info('vault-qr-backup', `LZ compress ${origSizeKB}KB → ${compSizeKB}KB (${Math.round((1 - compressed.length / json.length) * 100)}% gain)`);
          } catch (err: unknown) {
            logger.warn('vault-qr-backup', 'LZ-string load failed', { err });
          }

          if (compressed && compressed.length < QR_MAX_SAFE) {
            /* Compress OK + tient dans QR → modal QR */
            const { apexQrBackup } = await import('../../services/vault/apex-qr-backup.js');
            await apexQrBackup.showQrBackupModal({
              text: `APEXVAULT_LZ:${compressed}`, /* prefix pour détection au scan */
              title: '📦 Backup Vault Compressé — Photos iCloud',
              description: `${count} clés compressées LZ (${(compressed.length / 1024).toFixed(1)}KB vs ${origSizeKB}KB orig). JSON chiffré AES-GCM-256. Sauvegarde dans Photos iCloud — au reinstall, scan = restore complet.`,
              filename: `apex-vault-backup-${new Date().toISOString().slice(0, 10)}.png`,
            });
            return;
          }

          /* Strategy 2 : vault trop gros même compressé → upload Gist privé + QR de l'URL */
          toast.info(`Vault compressé ${compressed.length}B encore > QR max. Upload Gist privé chiffré...`, { duration: 4000 });
          try {
            const { apexGithubGistBackup } = await import('../../services/vault/apex-github-gist-backup.js');
            const r = await apexGithubGistBackup.pushBackup({ force: true });
            if (r.ok && r.gist_id) {
              const gistUrl = `https://gist.github.com/${r.gist_id}`;
              const { apexQrBackup } = await import('../../services/vault/apex-qr-backup.js');
              await apexQrBackup.showQrBackupModal({
                text: `APEXVAULT_GIST:${r.gist_id}`,
                title: '📦 Backup Vault → Gist URL — Photos iCloud',
                description: `${count} clés uploadées Gist privé chiffré (${(r.bytes ?? 0) / 1024}KB). QR contient juste l'ID Gist. Au reinstall, scan + PAT GitHub = pull Gist + restore complet. URL : ${gistUrl}`,
                filename: `apex-vault-gist-${new Date().toISOString().slice(0, 10)}.png`,
              });
              return;
            }
            toast.warn(`Gist upload échoué : ${r.error ?? '?'}. Fallback download JSON.`, { duration: 6000 });
          } catch (err: unknown) {
            logger.warn('vault-qr-backup', 'gist push failed', { err });
          }

          /* Strategy 3 : fallback download JSON */
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `apex-vault-backup-${new Date().toISOString().slice(0, 10)}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          toast.success(`📥 Backup JSON téléchargé (${origSizeKB}KB chiffré). Sauvegarde dans iCloud Drive / Notes.`, { duration: 8000 });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          toast.error(`Backup QR échoué : ${msg.slice(0, 60)}`, { duration: 6000 });
        }
      })();
    });
  }

  attachCardHandlers(rootEl);
}

function attachCardHandlers(rootEl: HTMLElement): void {
  /* Per-card actions */
  rootEl.querySelectorAll<HTMLButtonElement>('[data-action="test"]').forEach((btn) => {
    activeVaultScope!.bind(btn, 'click', (e) => {
      e.stopPropagation();
      const credId = btn.dataset['credId'] ?? '';
      void onTestKey(rootEl, credId, btn);
    });
  });
  rootEl.querySelectorAll<HTMLButtonElement>('[data-action="recharge"]').forEach((btn) => {
    activeVaultScope!.bind(btn, 'click', (e) => {
      e.stopPropagation();
      const url = btn.dataset['rechargeUrl'] ?? '';
      const service = btn.dataset['service'] ?? '';
      onRecharge(url, service);
    });
  });
  rootEl.querySelectorAll<HTMLButtonElement>('[data-action="discover-links"]').forEach((btn) => {
    activeVaultScope!.bind(btn, 'click', (e) => {
      e.stopPropagation();
      const service = btn.dataset['service'] ?? '';
      void onDiscoverLinks(rootEl, service, btn);
    });
  });
  rootEl.querySelectorAll<HTMLButtonElement>('[data-action="edit"]').forEach((btn) => {
    activeVaultScope!.bind(btn, 'click', (e) => {
      e.stopPropagation();
      const credId = btn.dataset['credId'] ?? '';
      openEditModal(rootEl, credId);
    });
  });
  rootEl.querySelectorAll<HTMLButtonElement>('[data-action="delete"]').forEach((btn) => {
    activeVaultScope!.bind(btn, 'click', (e) => {
      e.stopPropagation();
      const credId = btn.dataset['credId'] ?? '';
      onDeleteKey(rootEl, credId);
    });
  });
  rootEl.querySelectorAll<HTMLButtonElement>('[data-action="add-to-cat"]').forEach((btn) => {
    activeVaultScope!.bind(btn, 'click', (e) => {
      e.stopPropagation();
      const catId = btn.dataset['catId'] ?? '';
      openAddModal(rootEl, catId);
    });
  });
}

/* ──────────────────────────── Action implementations ──────────────────────────── */

async function onTestKey(rootEl: HTMLElement, credId: string, btn: HTMLButtonElement): Promise<void> {
  if (!credId) return;
  haptic.tap();
  const original = btn.textContent;
  btn.textContent = '⏳ Test…';
  btn.setAttribute('disabled', 'true');
  try {
    const r = await multiKeyVault.testKey(credId);
    if (r.ok) {
      haptic.success();
      toast.success(`✅ Active (${r.latencyMs}ms)`);
    } else {
      haptic.error();
      toast.error(`❌ ${r.reason ?? 'Test échoué'}`);
    }
    /* v13.4.275 (Kevin "Quand je teste une je remonte auto en haut de page") :
     * preserveScroll wrappe le re-render pour garder la position scroll. */
    await preserveScroll(rootEl, () => render(rootEl));
  } catch (err: unknown) {
    logger.warn('feature-vault', 'testKey failed', { err });
    haptic.error();
    toast.error('Erreur pendant le test');
    btn.textContent = original;
    btn.removeAttribute('disabled');
  }
}

function onRecharge(url: string, service: string): void {
  haptic.tap();
  if (!url) {
    toast.warn(`Aucune page recharge connue pour ${service}`);
    return;
  }
  try {
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch (err: unknown) {
    logger.warn('feature-vault', 'recharge open failed', { err });
    toast.error('Impossible d\'ouvrir le lien');
  }
}

/**
 * Cherche en autonomie tous les liens (login/dashboard/billing/api_keys/usage/...)
 * pour un service. Cascade : pre_configured → web_search → pattern_discovery.
 *
 * UI feedback : spinner sur bouton, toast avec count + sources trouvées.
 */
async function onDiscoverLinks(rootEl: HTMLElement, service: string, btn: HTMLButtonElement): Promise<void> {
  if (!service) return;
  haptic.tap();
  const original = btn.textContent;
  btn.textContent = '⏳ Recherche…';
  btn.setAttribute('disabled', 'true');
  try {
    const result = await autoDiscoverLinks.discover(service, { force: true });
    const found: string[] = [];
    if (result.login) found.push('login');
    if (result.dashboard) found.push('dashboard');
    if (result.billing) found.push('billing');
    if (result.api_keys) found.push('api_keys');
    if (result.usage) found.push('usage');
    if (result.docs) found.push('docs');
    if (result.password_reset) found.push('reset_pw');
    if (result.account_settings) found.push('settings');
    if (result.support) found.push('support');
    if (result.status_page) found.push('status');
    if (result.alive && found.length > 0) {
      haptic.success();
      toast.success(`🔗 ${found.length} liens trouvés (${result.source}) : ${found.join(', ')}`);
    } else {
      haptic.error();
      toast.warn(`Aucun lien validé pour ${service} — réessaie plus tard`);
    }
    render(rootEl);
  } catch (err: unknown) {
    logger.warn('feature-vault', 'discoverLinks failed', { err });
    haptic.error();
    toast.error('Erreur pendant la recherche de liens');
  } finally {
    btn.textContent = original;
    btn.removeAttribute('disabled');
  }
}

function onDeleteKey(rootEl: HTMLElement, credId: string): void {
  if (!credId) return;
  haptic.tap();
  /* v13.3.54 fix Kevin "je ne peux pas effacer les doublons api anthropic" :
   * AVANT : appel markInvalid → clé restait dans la liste (juste status invalide).
   * APRÈS : removeKey direct → clé VRAIMENT supprimée + whitelist deleted (POUBELLE-FIX
   * v13.3.51) empêche restoration depuis IDB shadow / Firebase. */
  if (!window.confirm('Supprimer cette clé définitivement ? Elle sera retirée du Coffre + ne sera plus restaurée auto.')) {
    return;
  }
  try {
    multiKeyVault.removeKey(credId);
    haptic.success();
    toast.success('Clé supprimée définitivement ✓');
    render(rootEl);
  } catch (err: unknown) {
    logger.warn('feature-vault', 'delete failed', { err });
    haptic.error();
    toast.error('Suppression échouée');
  }
}

/* ──────────────────────────── Modals ──────────────────────────── */

function modalRoot(rootEl: HTMLElement): HTMLElement {
  let root = rootEl.querySelector<HTMLDivElement>('#ax-vault-modal-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'ax-vault-modal-root';
    rootEl.appendChild(root);
  }
  return root;
}

function closeModal(rootEl: HTMLElement): void {
  const root = modalRoot(rootEl);
  root.innerHTML = '';
}

function openAddModal(rootEl: HTMLElement, presetCategory?: string): void {
  const root = modalRoot(rootEl);
  /* v13.4.284 — toutes les catégories proposées (y compris Adresses & Autres). */
  const catOpts = CATEGORIES
    .map((c) => `<option value="${escapeHtml(c.id)}" ${presetCategory === c.id ? 'selected' : ''}>${escapeHtml(c.label)}</option>`)
    .join('');
  const presetIsInfo = presetCategory ? INFO_CATEGORIES.has(presetCategory) : false;
  root.innerHTML = `
    <div role="dialog" aria-modal="true" aria-label="Ajouter une clé"
      style="position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)">
      <div style="background:var(--ax-bg-flat);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:20px;max-width:440px;width:100%;max-height:90vh;overflow-y:auto">
        <div class="ax-gs-175">
          <h2 class="ax-gs-475">+ Ajouter une clé</h2>
          <button id="ax-vault-modal-close" aria-label="Fermer"
            class="ax-gs-476">×</button>
        </div>
        <label class="ax-gs-477">
          Catégorie
          <select id="ax-vault-add-cat" style="width:100%;margin-top:4px;padding:10px;background:rgba(255,255,255,0.04);color:#fff;border:1px solid rgba(255,255,255,0.1);border-radius:8px;font-size:14px;min-height:44px">
            ${catOpts}
          </select>
        </label>
        <label class="ax-gs-477">
          Type
          <select id="ax-vault-add-kind" style="width:100%;margin-top:4px;padding:10px;background:rgba(255,255,255,0.04);color:#fff;border:1px solid rgba(255,255,255,0.1);border-radius:8px;font-size:14px;min-height:44px">
            <option value="secret" ${presetIsInfo ? '' : 'selected'}>🔑 Clé / token (testable)</option>
            <option value="info" ${presetIsInfo ? 'selected' : ''}>📝 Info / note (nom, email, adresse…)</option>
          </select>
        </label>
        <label class="ax-gs-477">
          <span id="ax-vault-add-service-lbl">Service (ex: anthropic, openai, stripe)</span>
          <input type="text" id="ax-vault-add-service" aria-label="Nom du service" placeholder="anthropic"
            class="ax-gs-478">
        </label>
        <label class="ax-gs-477">
          Description — à quoi ça correspond (optionnel)
          <input type="text" id="ax-vault-add-label" aria-label="Description, à quoi correspond cette information" placeholder="ex : Appartement Nice, Email perso, Token prod…"
            class="ax-gs-478">
        </label>
        <label class="ax-gs-477">
          Alias (optionnel)
          <input type="text" id="ax-vault-add-alias" aria-label="Alias optionnel pour ce service" placeholder="perso, client X..."
            class="ax-gs-478">
        </label>
        <label class="ax-gs-477">
          <span id="ax-vault-add-value-lbl">Valeur (clé / token)</span>
          <textarea id="ax-vault-add-value" placeholder="Colle la clé ici"
            class="ax-gs-479"></textarea>
        </label>
        <div class="ax-gs-176">
          <button id="ax-vault-add-detect"
            style="flex:1;min-width:140px;padding:10px;background:rgba(106,138,255,0.15);color:var(--ax-blue);border:1px solid rgba(106,138,255,0.3);border-radius:8px;cursor:pointer;font-size:13px;min-height:44px">🔍 Détecter automatiquement</button>
          <button id="ax-vault-add-save"
            style="flex:1;min-width:140px;padding:10px;background:linear-gradient(135deg,var(--ax-gold-deep),var(--ax-gold));color:#000;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;min-height:44px">🔒 Chiffrer & Sauvegarder</button>
        </div>
      </div>
    </div>
  `;
  (() => { const __b = root.querySelector<HTMLButtonElement>('#ax-vault-modal-close'); if (__b && activeVaultScope) activeVaultScope.bind(__b, 'click', () => closeModal(rootEl)); })();
  /* Click outside */
  const dialog = root.querySelector<HTMLDivElement>('[role="dialog"]');
  if (dialog && activeVaultScope) activeVaultScope.bind(dialog, 'click', (e) => {
    if (e.target === dialog) closeModal(rootEl);
  });
  /* v13.4.284 — labels dynamiques selon le type (clé vs info perso). */
  const catSel = root.querySelector<HTMLSelectElement>('#ax-vault-add-cat');
  const kindSel = root.querySelector<HTMLSelectElement>('#ax-vault-add-kind');
  const svcLbl = root.querySelector<HTMLSpanElement>('#ax-vault-add-service-lbl');
  const valLbl = root.querySelector<HTMLSpanElement>('#ax-vault-add-value-lbl');
  const svcInput = root.querySelector<HTMLInputElement>('#ax-vault-add-service');
  const valInput = root.querySelector<HTMLTextAreaElement>('#ax-vault-add-value');
  const detectBtnEl = root.querySelector<HTMLButtonElement>('#ax-vault-add-detect');
  const syncKindUi = (): void => {
    const isInfo = kindSel?.value === 'info';
    if (svcLbl) svcLbl.textContent = isInfo ? 'Nom de l\'info (ex : Adresse Nice, Email perso)' : 'Service (ex: anthropic, openai, stripe)';
    if (valLbl) valLbl.textContent = isInfo ? 'Valeur / information' : 'Valeur (clé / token)';
    if (svcInput) svcInput.placeholder = isInfo ? 'Adresse Nice' : 'anthropic';
    if (valInput) valInput.placeholder = isInfo ? 'Colle l\'information ici (chiffrée)' : 'Colle la clé ici';
    if (detectBtnEl) detectBtnEl.style.display = isInfo ? 'none' : '';
  };
  syncKindUi();
  if (kindSel && activeVaultScope) activeVaultScope.bind(kindSel, 'change', syncKindUi);
  /* Choisir une catégorie info → bascule le type sur « info » automatiquement. */
  if (catSel && activeVaultScope) activeVaultScope.bind(catSel, 'change', () => {
    if (kindSel && INFO_CATEGORIES.has(catSel.value)) { kindSel.value = 'info'; syncKindUi(); }
  });
  /* Auto-detect button */
  const addDetectBtn = root.querySelector<HTMLButtonElement>('#ax-vault-add-detect');
  if (addDetectBtn && activeVaultScope) activeVaultScope.bind(addDetectBtn, 'click', () => {
    void (async () => {
      haptic.tap();
      const valueEl = root.querySelector<HTMLTextAreaElement>('#ax-vault-add-value');
      if (!valueEl) return;
      const detected = detectCredential(valueEl.value.trim());
      if (!detected) {
        toast.warn('Aucun pattern reconnu');
        return;
      }
      if (detected.category === 'forbidden') {
        toast.error('🚨 Type interdit');
        return;
      }
      const serviceEl = root.querySelector<HTMLInputElement>('#ax-vault-add-service');
      const catEl = root.querySelector<HTMLSelectElement>('#ax-vault-add-cat');
      if (serviceEl) {
        const sk = detected.storageKey.replace(/^(ax_|apex_v13_)/, '').replace(/_(?:key|token|pat|sk|pk|id|secret)$/, '');
        serviceEl.value = sk;
      }
      if (catEl) catEl.value = classifyService(serviceEl?.value ?? '', detected.category);
      toast.success(`Détecté: ${detected.name}`);
    })();
  });
  /* Save */
  const addSaveBtn = root.querySelector<HTMLButtonElement>('#ax-vault-add-save');
  if (addSaveBtn && activeVaultScope) activeVaultScope.bind(addSaveBtn, 'click', () => {
    void (async () => {
      haptic.tap();
      const service = root.querySelector<HTMLInputElement>('#ax-vault-add-service')?.value.trim() ?? '';
      const alias = root.querySelector<HTMLInputElement>('#ax-vault-add-alias')?.value.trim() ?? '';
      const value = root.querySelector<HTMLTextAreaElement>('#ax-vault-add-value')?.value.trim() ?? '';
      const category = root.querySelector<HTMLSelectElement>('#ax-vault-add-cat')?.value.trim() ?? '';
      const labelTxt = root.querySelector<HTMLInputElement>('#ax-vault-add-label')?.value.trim() ?? '';
      const kind = (root.querySelector<HTMLSelectElement>('#ax-vault-add-kind')?.value === 'info' ? 'info' : 'secret') as 'secret' | 'info';
      if (!service || !value) {
        toast.warn(kind === 'info' ? 'Nom et information requis' : 'Service et valeur requis');
        return;
      }
      try {
        /* v13.4.284 — persiste catégorie + description + type pour que l'info
         * atterrisse là où Kevin l'a mise et affiche « à quoi ça correspond ». */
        const opts: { alias?: string; category?: string; label?: string; kind?: 'secret' | 'info' } = { kind };
        if (alias) opts.alias = alias;
        if (category) opts.category = category;
        if (labelTxt) opts.label = labelTxt;
        await multiKeyVault.addKey(service, value, opts);
        toast.success(kind === 'info' ? `✅ ${service} enregistré (chiffré)` : `✅ Clé ${service} chiffrée + sauvegardée`);
        closeModal(rootEl);
        render(rootEl);
      } catch (err: unknown) {
        logger.warn('feature-vault', 'add manual failed', { err });
        toast.error('Erreur pendant la sauvegarde');
      }
    })();
  });
}

function openEditModal(rootEl: HTMLElement, credId: string): void {
  const root = modalRoot(rootEl);
  const entry = multiKeyVault.listAll(true).find((k) => k.id === credId);
  if (!entry) {
    toast.error('Clé introuvable');
    return;
  }
  root.innerHTML = `
    <div role="dialog" aria-modal="true" aria-label="Modifier une clé"
      style="position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)">
      <div style="background:var(--ax-bg-flat);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:20px;max-width:440px;width:100%">
        <div class="ax-gs-175">
          <h2 class="ax-gs-475">✏️ Modifier ${escapeHtml(entry.service)}</h2>
          <button id="ax-vault-modal-close" aria-label="Fermer"
            class="ax-gs-476">×</button>
        </div>
        <p style="color:rgba(255,255,255,0.6);font-size:12px;margin:0 0 12px">Laisse la valeur vide pour ne changer que la catégorie / la description. Une nouvelle valeur remplacera l'ancienne (chiffrement AES-GCM 256).</p>
        <label class="ax-gs-477">
          Catégorie
          <select id="ax-vault-edit-cat" style="width:100%;margin-top:4px;padding:10px;background:rgba(255,255,255,0.04);color:#fff;border:1px solid rgba(255,255,255,0.1);border-radius:8px;font-size:14px;min-height:44px">
            ${CATEGORIES.map((c) => `<option value="${escapeHtml(c.id)}" ${(entry.category ?? classifyService(entry.service)) === c.id ? 'selected' : ''}>${escapeHtml(c.label)}</option>`).join('')}
          </select>
        </label>
        <label class="ax-gs-477">
          Description — à quoi ça correspond (optionnel)
          <input type="text" id="ax-vault-edit-label" aria-label="Description" value="${escapeHtml(entry.label ?? '')}" placeholder="ex : Appartement Nice, Email perso…"
            class="ax-gs-478">
        </label>
        <label class="ax-gs-477">
          Nouvelle valeur (optionnel)
          <textarea id="ax-vault-edit-value" placeholder="Vide = on garde la valeur actuelle"
            class="ax-gs-479"></textarea>
        </label>
        <label class="ax-gs-477">
          Alias (optionnel)
          <input type="text" id="ax-vault-edit-alias" aria-label="Alias optionnel" value="${escapeHtml(entry.alias ?? '')}"
            class="ax-gs-478">
        </label>
        <div class="ax-gs-176">
          <button id="ax-vault-edit-cancel"
            style="flex:1;min-width:120px;padding:10px;background:rgba(255,255,255,0.04);color:var(--ax-text-dim);border:1px solid rgba(255,255,255,0.1);border-radius:8px;cursor:pointer;font-size:13px;min-height:44px">Annuler</button>
          <button id="ax-vault-edit-save"
            style="flex:1;min-width:120px;padding:10px;background:linear-gradient(135deg,var(--ax-gold-deep),var(--ax-gold));color:#000;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;min-height:44px">💾 Enregistrer</button>
        </div>
      </div>
    </div>
  `;
  (() => { const __b = root.querySelector<HTMLButtonElement>('#ax-vault-modal-close'); if (__b && activeVaultScope) activeVaultScope.bind(__b, 'click', () => closeModal(rootEl)); })();
  (() => { const __c = root.querySelector<HTMLButtonElement>('#ax-vault-edit-cancel'); if (__c && activeVaultScope) activeVaultScope.bind(__c, 'click', () => closeModal(rootEl)); })();
  const editSaveBtn = root.querySelector<HTMLButtonElement>('#ax-vault-edit-save');
  if (editSaveBtn && activeVaultScope) activeVaultScope.bind(editSaveBtn, 'click', () => {
    void (async () => {
      haptic.tap();
      const newValue = root.querySelector<HTMLTextAreaElement>('#ax-vault-edit-value')?.value.trim() ?? '';
      const newAlias = root.querySelector<HTMLInputElement>('#ax-vault-edit-alias')?.value.trim() ?? '';
      const newCat = root.querySelector<HTMLSelectElement>('#ax-vault-edit-cat')?.value.trim() ?? '';
      const newLabel = root.querySelector<HTMLInputElement>('#ax-vault-edit-label')?.value.trim() ?? '';
      const newKind: 'secret' | 'info' = INFO_CATEGORIES.has(newCat) ? 'info' : (entry.kind ?? 'secret');
      try {
        if (newValue) {
          /* v13.4.284 — remplace la valeur : marque l'ancienne invalide + ajoute
           * la nouvelle en reportant catégorie / description / type. */
          multiKeyVault.markInvalid(credId, 'replaced via edit');
          const opts: { alias?: string; category?: string; label?: string; kind?: 'secret' | 'info' } = { kind: newKind };
          if (newAlias) opts.alias = newAlias;
          if (newCat) opts.category = newCat;
          if (newLabel) opts.label = newLabel;
          await multiKeyVault.addKey(entry.service, newValue, opts);
          toast.success('✅ Mis à jour');
        } else {
          /* Valeur inchangée → on met à jour seulement les métadonnées. */
          multiKeyVault.setMeta(credId, { category: newCat, label: newLabel, alias: newAlias, kind: newKind });
          toast.success('✅ Catégorie / description mises à jour');
        }
        closeModal(rootEl);
        render(rootEl);
      } catch (err: unknown) {
        logger.warn('feature-vault', 'edit save failed', { err });
        toast.error('Erreur pendant la modification');
      }
    })();
  });
}
