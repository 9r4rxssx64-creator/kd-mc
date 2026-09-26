/**
 * APEX v13.3.98 — Vue admin "Mes Secrets" (Kevin 2026-05-09 P0.4)
 *
 * Demande Kevin : "Je veux un dossier admin visuel avec TOUS mes secrets,
 * sécurisé admin-only".
 *
 * Affiche en UN endroit :
 *  - API keys (multi-key vault → multi-key-vault.ts)
 *  - Clés legacy ax_* (tokens Cloudflare/GitHub/Stripe etc., détectées via
 *    storageKey CREDENTIAL_PATTERNS et localStorage)
 *  - Connection strings DB (postgres/mysql/redis/mongo) — patterns v13.3.98
 *  - Webhooks (Discord/Slack/GitHub) — patterns v13.3.98
 *  - URLs services (Railway, Cloudflare Worker)
 *  - Tokens OAuth (Google refresh, JWT)
 *  - Secrets génériques (apex_v13_generic_secrets) — labels custom Kevin
 *
 * Catégorisation visuelle (groupes) :
 *  🤖 IA & LLM | 💰 Paiements | 🔧 DevOps | 💬 Comms | 🌐 Social
 *  📦 Storage | 🛒 E-commerce | ₿ Crypto | 👤 Identité
 *  🗃 Bases de données | 🔗 Webhooks | 🔐 Génériques
 *
 * Pour chaque entry :
 *  - Nom service + label optionnel
 *  - Préfixe masqué (4+•••+4)
 *  - Date ajout / dernière utilisation
 *  - Boutons : 👁 voir (5s) | 📋 copier | ✏️ renommer | 🗑 supprimer
 *
 * Sécurité :
 *  - Guard admin-only via store.get('isAdmin') → sinon redirect chat
 *  - Reveal plaintext 5s puis clear DOM
 *  - Confirm avant delete
 *  - Audit log immutable sur chaque action sensible
 *  - escapeHtml partout
 *
 * Wired :
 *  - core/bootstrap.ts : router.register('admin-all-secrets', requiresAdmin: true)
 */

import { escapeHtml } from '../../../core/escape-html.js';
import { createCleanupScope, type CleanupScope } from '../../../core/listener-cleanup.js';
import { logger } from '../../../core/logger.js';
import { router } from '../../../core/router.js';
import { store } from '../../../core/store.js';
import { auditLog } from '../../../services/observability/audit-log.js';
import { CREDENTIAL_PATTERNS } from '../../../services/vault/credential-patterns.js';
import { genericSecrets, type GenericSecret } from '../../../services/vault/generic-secrets.js';
import { multiKeyVault, type KeyEntry } from '../../../services/vault/multi-key-vault.js';
import { vault } from '../../../services/vault/vault.js';
import { haptic } from '../../../ui/haptic.js';
import { toast } from '../../../ui/toast.js';

let activeScope: CleanupScope | null = null;

export function dispose(): void {
  activeScope?.cleanup();
  activeScope = null;
}

function formatDate(ts?: number): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch { return '—'; }
}

function maskValue(plain: string): string {
  if (!plain) return '—';
  if (plain.length <= 10) return '••••••';
  return `${plain.slice(0, 4)}•••${plain.slice(-4)}`;
}

/* ──────────────────────── Catégorisation ──────────────────────── */

interface SecretRow {
  id: string;
  source: 'multi-key' | 'legacy' | 'generic';
  service: string;
  label: string;
  category: string;
  preview: string;
  addedAt?: number | undefined;
  lastUsedAt?: number | undefined;
  rawStorageKey?: string | undefined;
  /** Pour generic secrets, on stocke aussi l'id pour rename/remove */
  genericId?: string | undefined;
}

const CAT_CONNECT = 'db_cache';
const CAT_WEBHOOK = 'webhook';
const CAT_GENERIC = 'generic';

const CATEGORY_LABELS: Record<string, string> = {
  ai: '🤖 IA & LLM',
  finance: '💰 Paiements & Crypto',
  devops: '🔧 DevOps & Hosting',
  comms: '💬 Communications',
  storage: '📦 Stockage / Productivité',
  identity: '👤 Identité / OAuth',
  saas: '🌐 SaaS & Workers',
  [CAT_CONNECT]: '🗃 Bases de données',
  [CAT_WEBHOOK]: '🔗 Webhooks',
  [CAT_GENERIC]: '🔐 Secrets génériques',
};

/** Map storageKey → category override (DB connections, webhooks). */
const STORAGE_KEY_OVERRIDE: Record<string, string> = {
  ax_postgres_url: CAT_CONNECT,
  ax_mysql_url: CAT_CONNECT,
  ax_mongodb_url: CAT_CONNECT,
  ax_redis_url: CAT_CONNECT,
  ax_websocket_url: CAT_CONNECT,
  ax_discord_webhook_url: CAT_WEBHOOK,
  ax_slack_webhook_url: CAT_WEBHOOK,
  ax_github_webhook_url: CAT_WEBHOOK,
  ax_railway_url: 'devops',
  ax_cloudflare_worker_url: 'devops',
};

function categoryFor(storageKey: string, fallback: string): string {
  return STORAGE_KEY_OVERRIDE[storageKey] ?? fallback;
}

/* ──────────────────────── Data assembly ──────────────────────── */

function listMultiKeyRows(): SecretRow[] {
  const out: SecretRow[] = [];
  try {
    const keys = multiKeyVault.listAll(true);
    for (const k of keys) {
      const pattern = CREDENTIAL_PATTERNS.find(
        (p) => p.storageKey.includes(k.service) || p.name.toLowerCase().includes(k.service.toLowerCase()),
      );
      const cat = pattern?.category ?? 'ai';
      const row: SecretRow = {
        id: `mk:${k.id}`,
        source: 'multi-key',
        service: k.service,
        label: k.alias ? `${capitalize(k.service)} — ${k.alias}` : capitalize(k.service),
        category: cat,
        preview: '••••••',
        addedAt: k.addedAt,
      };
      if (k.lastWorkedAt !== undefined) row.lastUsedAt = k.lastWorkedAt;
      if (pattern?.storageKey) row.rawStorageKey = pattern.storageKey;
      out.push(row);
    }
  } catch (err: unknown) {
    logger.warn('all-secrets', 'multi-key list failed', { err });
  }
  return out;
}

function listLegacyRows(): SecretRow[] {
  const out: SecretRow[] = [];
  const seen = new Set<string>();
  for (const p of CREDENTIAL_PATTERNS) {
    if (p.category === 'forbidden') continue;
    if (seen.has(p.storageKey)) continue;
    seen.add(p.storageKey);
    let raw: string | null = null;
    try { raw = localStorage.getItem(p.storageKey); } catch { /* quota */ }
    if (!raw) continue;
    out.push({
      id: `lg:${p.storageKey}`,
      source: 'legacy',
      service: p.name,
      label: p.name,
      category: categoryFor(p.storageKey, p.category),
      preview: '••••••',
      rawStorageKey: p.storageKey,
    });
  }
  return out;
}

function listGenericRows(): SecretRow[] {
  return genericSecrets.list().map((g: GenericSecret): SecretRow => {
    const row: SecretRow = {
      id: `gn:${g.id}`,
      source: 'generic',
      service: 'Secret générique',
      label: g.label,
      category: CAT_GENERIC,
      preview: '••••••',
      addedAt: g.addedAt,
      genericId: g.id,
    };
    if (g.lastUsed !== undefined) row.lastUsedAt = g.lastUsed;
    return row;
  });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function groupByCategory(rows: SecretRow[]): Record<string, SecretRow[]> {
  const groups: Record<string, SecretRow[]> = {};
  for (const r of rows) {
    let bucket = groups[r.category];
    if (!bucket) {
      bucket = [];
      groups[r.category] = bucket;
    }
    bucket.push(r);
  }
  return groups;
}

/* ──────────────────────── Render ──────────────────────── */

function renderRow(row: SecretRow): string {
  const masked = escapeHtml(row.preview);
  const added = formatDate(row.addedAt);
  const used = formatDate(row.lastUsedAt);
  const labelEsc = escapeHtml(row.label);
  const idAttr = escapeHtml(row.id);

  return `
    <article style="background:rgba(255,255,255,0.02);border:1px solid rgba(201,162,39,0.18);border-radius:10px;padding:12px;margin-bottom:8px" data-secret-id="${idAttr}">
      <div style="display:flex;justify-content:space-between;align-items:start;flex-wrap:wrap;gap:10px">
        <div class="ax-gs-11">
          <div style="font-weight:600;color:#c9a227;font-size:14px">${labelEsc}</div>
          <div style="font-family:monospace;font-size:12px;color:var(--ax-text-dim);margin-top:4px" class="ax-sec-preview">${masked}</div>
          <div class="ax-gs-82">
            ${row.addedAt ? `Ajouté ${escapeHtml(added)}` : ''}
            ${row.lastUsedAt ? ` · Utilisé ${escapeHtml(used)}` : ''}
          </div>
        </div>
        <div class="ax-gs-20">
          <button class="ax-btn ax-sec-reveal ax-gs-263" data-id="${idAttr}" aria-label="Voir 5s la valeur">👁</button>
          <button class="ax-btn ax-sec-copy ax-gs-263" data-id="${idAttr}" aria-label="Copier dans presse-papier">📋</button>
          ${row.source === 'generic' ? `<button class="ax-btn ax-sec-rename ax-gs-263" data-id="${idAttr}" aria-label="Renommer">✏️</button>` : ''}
          <button class="ax-btn ax-sec-delete" data-id="${idAttr}" aria-label="Supprimer" style="padding:6px 10px;font-size:12px;min-height:36px;color:#ff6b6b">🗑</button>
        </div>
      </div>
    </article>
  `;
}

function renderCategorySection(catId: string, rows: SecretRow[]): string {
  const label = CATEGORY_LABELS[catId] ?? `📁 ${catId}`;
  return `
    <section class="ax-gs-180">
      <h2 style="font-size:15px;color:#c9a227;margin:0 0 10px;display:flex;align-items:center;gap:8px">
        ${escapeHtml(label)}
        <span style="background:rgba(201,162,39,0.15);color:#c9a227;font-size:11px;padding:2px 8px;border-radius:8px">${rows.length}</span>
      </h2>
      <div>${rows.map(renderRow).join('')}</div>
    </section>
  `;
}

function applySearch(rows: SecretRow[], q: string): SecretRow[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter(
    (r) =>
      r.label.toLowerCase().includes(needle)
      || r.service.toLowerCase().includes(needle)
      || (r.rawStorageKey?.toLowerCase().includes(needle) ?? false),
  );
}

function applyCategoryFilter(rows: SecretRow[], cat: string): SecretRow[] {
  if (!cat || cat === 'all') return rows;
  return rows.filter((r) => r.category === cat);
}

async function refresh(rootEl: HTMLElement, opts?: { search?: string; cat?: string }): Promise<void> {
  const search = opts?.search ?? '';
  const cat = opts?.cat ?? 'all';

  const rows = [
    ...listMultiKeyRows(),
    ...listLegacyRows(),
    ...listGenericRows(),
  ];
  const filtered = applyCategoryFilter(applySearch(rows, search), cat);
  const groups = groupByCategory(filtered);
  const orderedCats = Object.keys(CATEGORY_LABELS).filter((c) => groups[c]?.length);

  const totalLegacy = rows.filter((r) => r.source === 'legacy').length;
  const totalMK = rows.filter((r) => r.source === 'multi-key').length;
  const totalGN = rows.filter((r) => r.source === 'generic').length;

  const filterChips = ['all', ...Object.keys(CATEGORY_LABELS)]
    .map((c) => {
      const active = c === cat;
      const lbl = c === 'all' ? `📁 Tous (${rows.length})` : `${CATEGORY_LABELS[c]} (${groups[c]?.length ?? 0})`;
      return `<button class="ax-btn ax-sec-cat" data-cat="${escapeHtml(c)}" style="padding:6px 10px;font-size:12px;min-height:36px;${active ? 'background:rgba(201,162,39,0.25);border:1px solid #c9a227' : 'border:1px solid rgba(255,255,255,0.1)'}">${escapeHtml(lbl)}</button>`;
    })
    .join('');

  rootEl.innerHTML = `
    <div style="padding:20px;max-width:1000px;margin:0 auto">
      <header class="ax-gs-181">
        <div class="ax-gs-83">
          <button id="ax-sec-back" class="ax-btn ax-gs-263" aria-label="Retour chat">← Chat</button>
          <h1 style="margin:0;color:#c9a227;font-size:20px">🔐 Mes Secrets — Dossier admin</h1>
        </div>
        <p style="color:var(--ax-text-dim);font-size:12px;margin:8px 0 0">
          Tous tes secrets en 1 endroit (admin-only). API keys, connexions DB,
          webhooks, tokens OAuth, secrets génériques étiquetables.
        </p>
      </header>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:18px">
        <div style="background:rgba(201,162,39,0.1);border:1px solid rgba(201,162,39,0.3);border-radius:10px;padding:12px">
          <div style="font-size:22px;color:#c9a227;font-weight:600">${rows.length}</div>
          <div class="ax-gs-2">Total secrets</div>
        </div>
        <div class="ax-gs-52">
          <div class="ax-gs-53">${totalMK}</div>
          <div class="ax-gs-2">Multi-key vault</div>
        </div>
        <div class="ax-gs-52">
          <div class="ax-gs-53">${totalLegacy}</div>
          <div class="ax-gs-2">Legacy (ax_*)</div>
        </div>
        <div class="ax-gs-52">
          <div class="ax-gs-53">${totalGN}</div>
          <div class="ax-gs-2">Génériques</div>
        </div>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
        <input id="ax-sec-search" type="search" placeholder="🔎 Rechercher (nom, service, alias…)" value="${escapeHtml(search)}" style="flex:1;min-width:200px;padding:10px 12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:var(--ax-text);font-size:16px" aria-label="Rechercher un secret" />
        <button id="ax-sec-export" class="ax-btn ax-gs-264" aria-label="Exporter JSON chiffré">📤 Export JSON chiffré</button>
        <button id="ax-sec-refresh" class="ax-btn ax-gs-264" aria-label="Rafraîchir">🔄</button>
      </div>

      <div style="display:flex;gap:6px;margin-bottom:18px;flex-wrap:wrap" role="tablist" aria-label="Filtre catégorie">${filterChips}</div>

      <div id="ax-sec-list">
        ${orderedCats.length === 0
          ? `<p style="text-align:center;color:var(--ax-text-dim);padding:40px">Aucun secret pour ce filtre.</p>`
          : orderedCats.map((c) => renderCategorySection(c, groups[c] ?? [])).join('')}
      </div>

      <p class="ax-gs-265">
        🔒 Reveal = audit log immutable. Suppression = backup 30j (restaurable).
      </p>
    </div>
  `;

  attachHandlers(rootEl, { search, cat });
}

/* ──────────────────────── Handlers ──────────────────────── */

function attachHandlers(rootEl: HTMLElement, state: { search: string; cat: string }): void {
  if (!activeScope) return;

  const back = rootEl.querySelector<HTMLButtonElement>('#ax-sec-back');
  if (back) {
    activeScope.bind(back, 'click', () => {
      haptic.tap();
      router.navigate('chat');
    });
  }

  const refreshBtn = rootEl.querySelector<HTMLButtonElement>('#ax-sec-refresh');
  if (refreshBtn) {
    activeScope.bind(refreshBtn, 'click', () => { haptic.tap(); void refresh(rootEl, state); });
  }

  const exportBtn = rootEl.querySelector<HTMLButtonElement>('#ax-sec-export');
  if (exportBtn) {
    activeScope.bind(exportBtn, 'click', () => { void handleExport(); });
  }

  const search = rootEl.querySelector<HTMLInputElement>('#ax-sec-search');
  if (search) {
    let debounce: ReturnType<typeof setTimeout> | null = null;
    activeScope.bind(search, 'input', () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => { void refresh(rootEl, { search: search.value, cat: state.cat }); }, 250);
    });
  }

  rootEl.querySelectorAll<HTMLButtonElement>('.ax-sec-cat').forEach((btn) => {
    if (!activeScope) return;
    activeScope.bind(btn, 'click', () => {
      haptic.tap();
      void refresh(rootEl, { search: state.search, cat: btn.dataset['cat'] ?? 'all' });
    });
  });

  rootEl.querySelectorAll<HTMLButtonElement>('.ax-sec-reveal').forEach((btn) => {
    if (!activeScope) return;
    activeScope.bind(btn, 'click', () => { void handleReveal(rootEl, btn); });
  });
  rootEl.querySelectorAll<HTMLButtonElement>('.ax-sec-copy').forEach((btn) => {
    if (!activeScope) return;
    activeScope.bind(btn, 'click', () => { void handleCopy(btn); });
  });
  rootEl.querySelectorAll<HTMLButtonElement>('.ax-sec-rename').forEach((btn) => {
    if (!activeScope) return;
    activeScope.bind(btn, 'click', () => { void handleRename(rootEl, btn, state); });
  });
  rootEl.querySelectorAll<HTMLButtonElement>('.ax-sec-delete').forEach((btn) => {
    if (!activeScope) return;
    activeScope.bind(btn, 'click', () => { void handleDelete(rootEl, btn, state); });
  });
}

async function decryptForRow(id: string): Promise<string | null> {
  const idx = id.indexOf(':');
  if (idx < 0) return null;
  const src = id.slice(0, idx);
  const key = id.slice(idx + 1);
  if (!key) return null;
  if (src === 'gn') {
    const r = await genericSecrets.reveal(key);
    return r.ok ? r.plaintext : null;
  }
  if (src === 'lg') {
    /* Legacy storage : storageKey direct */
    try {
      const cipher = localStorage.getItem(key);
      if (!cipher) return null;
      return await vault.decryptAuto(cipher);
    } catch { return null; }
  }
  if (src === 'mk') {
    /* Multi-key vault : trouve KeyEntry par id et decrypt */
    try {
      const entries = multiKeyVault.listAll(true);
      const entry = entries.find((e: KeyEntry) => e.id === key);
      if (!entry) return null;
      return await vault.decryptAuto(entry.encrypted);
    } catch { return null; }
  }
  return null;
}

async function handleReveal(rootEl: HTMLElement, btn: HTMLButtonElement): Promise<void> {
  const id = btn.dataset['id'];
  if (!id) return;
  const card = rootEl.querySelector<HTMLElement>(`[data-secret-id="${CSS.escape(id)}"]`);
  const previewEl = card?.querySelector<HTMLElement>('.ax-sec-preview');
  if (!previewEl) return;
  haptic.tap();
  btn.disabled = true;
  try {
    const plain = await decryptForRow(id);
    if (!plain) { toast.error('❌ Impossible de déchiffrer'); return; }
    previewEl.textContent = plain;
    previewEl.style.color = '#22cc77';
    void auditLog.record('vault.secret_revealed', { details: { id } });
    /* Auto-clear 5s */
    setTimeout(() => {
      previewEl.textContent = maskValue(plain);
      previewEl.style.color = '';
    }, 5000);
  } finally {
    btn.disabled = false;
  }
}

async function handleCopy(btn: HTMLButtonElement): Promise<void> {
  const id = btn.dataset['id'];
  if (!id) return;
  haptic.tap();
  const plain = await decryptForRow(id);
  if (!plain) { toast.error('❌ Impossible de déchiffrer'); return; }
  try {
    await navigator.clipboard.writeText(plain);
    toast.success('📋 Copié 30s puis effacé du presse-papier');
    void auditLog.record('vault.secret_copied', { details: { id } });
    /* Best-effort : tente d'effacer après 30s */
    setTimeout(() => { void navigator.clipboard.writeText(''); }, 30000);
  } catch (err: unknown) {
    logger.warn('all-secrets', 'clipboard failed', { err });
    toast.error('❌ Copie refusée par le navigateur');
  }
}

async function handleRename(rootEl: HTMLElement, btn: HTMLButtonElement, state: { search: string; cat: string }): Promise<void> {
  const id = btn.dataset['id'];
  if (!id || !id.startsWith('gn:')) return;
  const genId = id.slice(3);
  const current = genericSecrets.list().find((g) => g.id === genId);
  if (!current) return;
  const newLabel = window.prompt('Nouveau label :', current.label);
  if (!newLabel || newLabel.trim() === current.label) return;
  const newHintRaw = window.prompt('Aide-mémoire (optionnel) :', current.hint ?? '');
  const newHint = newHintRaw ?? undefined;
  if (newHint === undefined ? genericSecrets.rename(genId, newLabel) : genericSecrets.rename(genId, newLabel, newHint)) {
    toast.success('✅ Renommé');
    await refresh(rootEl, state);
  } else {
    toast.error('❌ Renommage échoué');
  }
}

async function handleDelete(rootEl: HTMLElement, btn: HTMLButtonElement, state: { search: string; cat: string }): Promise<void> {
  const id = btn.dataset['id'];
  if (!id) return;
  const idx = id.indexOf(':');
  if (idx < 0) return;
  const src = id.slice(0, idx);
  const key = id.slice(idx + 1);
  if (!key) return;
  const confirmed = window.confirm('Supprimer ce secret ?\n\n(backup 30j conservé pour restauration)');
  if (!confirmed) return;
  haptic.medium();
  let ok = false;
  if (src === 'gn') {
    ok = genericSecrets.remove(key);
  } else if (src === 'lg') {
    try {
      const backupKey = `apex_v13_recovery_backup_${key}_${Date.now()}`;
      const cur = localStorage.getItem(key);
      if (cur) localStorage.setItem(backupKey, cur);
      localStorage.removeItem(key);
      ok = true;
    } catch { ok = false; }
  } else if (src === 'mk') {
    try {
      multiKeyVault.removeKey(key);
      ok = true;
    } catch (err: unknown) {
      logger.warn('all-secrets', 'multi-key remove failed', { err });
    }
  }
  if (ok) {
    void auditLog.record('vault.secret_deleted', { details: { id, src } });
    toast.success('🗑 Supprimé (backup 30j)');
    await refresh(rootEl, state);
  } else {
    toast.error('❌ Suppression échouée');
  }
}

async function handleExport(): Promise<void> {
  try {
    const payload = {
      exported_at: new Date().toISOString(),
      version: 1,
      multi_key_vault: multiKeyVault.listAll(true),
      legacy: CREDENTIAL_PATTERNS
        .filter((p) => p.category !== 'forbidden')
        .map((p) => ({ key: p.storageKey, name: p.name, cipher: localStorage.getItem(p.storageKey) }))
        .filter((e) => e.cipher),
      generic: genericSecrets.list(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `apex-secrets-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    void auditLog.record('vault.secrets_exported', {});
    toast.success('📤 Export téléchargé (chiffré)');
  } catch (err: unknown) {
    logger.warn('all-secrets', 'export failed', { err });
    toast.error('❌ Export échoué');
  }
}

/* ──────────────────────── Public render ──────────────────────── */

export async function render(rootEl: HTMLElement): Promise<void> {
  const isAdmin = store.get('isAdmin') === true;
  if (!isAdmin) {
    rootEl.innerHTML = `
      <div class="ax-gs-21">
        <h2 class="ax-gs-266">🔒 Accès admin uniquement</h2>
        <p>Cette section est réservée à Kevin.</p>
      </div>
    `;
    return;
  }

  activeScope?.cleanup();
  activeScope = createCleanupScope('all-secrets');

  await refresh(rootEl);
}
