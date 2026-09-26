/**
 * APEX v13 — Multi-tenant manager (commercialisation B2B/B2C)
 *
 * Bloquant audit Kevin 2026-05-04 : "Apex = 1 seul user (Kevin). Pour commercialiser
 * à 100 clients = workspace isolé par client requis."
 *
 * Architecture :
 * - Chaque client = 1 Tenant (workspace isolé)
 * - Tenant détient : ownerId (user admin de ce tenant), brand, plan, quotas, status
 * - Isolation données : préfixe localStorage `tenant_<id>_*` pour user non-admin
 * - Hard isolation : `canAccess(userId, tenantId)` check membership avant lecture/écriture
 * - Kevin admin (kdmc_admin) = bypass total (cf. CLAUDE.md règle absolue 2026-05-03)
 *
 * Anti-patterns évités :
 * - Pas de fuite cross-tenant (user A ne voit JAMAIS data tenant B)
 * - Pas de stockage credentials côté tenant (vault gère)
 * - Default plan 'free' (jamais 'admin' par défaut)
 * - Status 'trial' 14 jours puis 'past_due' si pas de paiement
 *
 * Quotas par plan :
 * ┌─────────┬──────────┬──────────┬──────────┬──────────────┐
 * │ Plan    │ Msg/jour │ Studios  │ Voix     │ API/mois     │
 * ├─────────┼──────────┼──────────┼──────────┼──────────────┤
 * │ free    │ 50       │ 1        │ basic    │ 1 000        │
 * │ basic   │ 500      │ 5        │ basic    │ 10 000       │
 * │ pro     │ -1       │ 23       │ premium  │ 100 000      │
 * │ business│ -1       │ all      │ premium  │ 1 000 000    │
 * │ admin   │ -1       │ all      │ premium  │ -1 (illim.)  │
 * └─────────┴──────────┴──────────┴──────────┴──────────────┘
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';


export type TenantPlan = 'free' | 'basic' | 'pro' | 'business' | 'admin';
export type TenantStatus = 'trial' | 'active' | 'past_due' | 'cancelled';

export interface Tenant {
  id: string; /* tenant_xxx */
  ownerId: string; /* user admin de ce tenant */
  brandName: string;
  brandColor?: string;
  brandLogoUrl?: string;
  plan: TenantPlan;
  createdAt: number;
  status: TenantStatus;
  trialEndsAt?: number;
  monthlyTokenBudget: number;
  tokensConsumed: number;
  customDomain?: string;
  /* Membres autorisés (uids) — owner inclus implicitement */
  memberIds?: string[];
}

export interface TenantQuotas {
  msgPerDay: number; /* -1 = illimité */
  studiosCount: number | 'all';
  voicesQuality: 'basic' | 'premium';
  apiCallsPerMonth: number; /* -1 = illimité */
}

export interface CreateTenantOpts {
  ownerId: string;
  brandName: string;
  plan?: TenantPlan;
  brandColor?: string;
  brandLogoUrl?: string;
  customDomain?: string;
  memberIds?: string[];
}

const STORAGE_KEY = 'apex_v13_tenants';
const TRIAL_DURATION_MS = 14 * 24 * 60 * 60 * 1000; /* 14 jours */
const ADMIN_USER_ID = 'kdmc_admin';

/* Quotas par plan — invariants commerciaux */
const QUOTAS: Record<TenantPlan, TenantQuotas> = {
  free: { msgPerDay: 50, studiosCount: 1, voicesQuality: 'basic', apiCallsPerMonth: 1_000 },
  basic: { msgPerDay: 500, studiosCount: 5, voicesQuality: 'basic', apiCallsPerMonth: 10_000 },
  pro: { msgPerDay: -1, studiosCount: 23, voicesQuality: 'premium', apiCallsPerMonth: 100_000 },
  business: { msgPerDay: -1, studiosCount: 'all', voicesQuality: 'premium', apiCallsPerMonth: 1_000_000 },
  admin: { msgPerDay: -1, studiosCount: 'all', voicesQuality: 'premium', apiCallsPerMonth: -1 },
};

/* Budget tokens mensuel par plan (pour anti-abus + usage-based billing future) */
const TOKEN_BUDGETS: Record<TenantPlan, number> = {
  free: 100_000,
  basic: 1_000_000,
  pro: 10_000_000,
  business: 100_000_000,
  admin: Number.MAX_SAFE_INTEGER,
};

class TenantManager {
  private tenants: Tenant[] = [];
  private initialized = false;

  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.reload();
  }

  /* Force reload depuis localStorage — utile post-modif externe + tests */
  reload(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      this.tenants = raw ? (JSON.parse(raw) as Tenant[]) : [];
    } catch (err: unknown) {
      logger.warn('tenant', 'reload failed (corruption?)', { err });
      this.tenants = [];
    }
  }

  /**
   * Crée un nouveau tenant isolé.
   * Status initial = 'trial' (14 jours), plan défaut 'free'.
   * Audit log obligatoire (tenant.create).
   */
  async create(opts: CreateTenantOpts): Promise<Tenant> {
    if (!this.initialized) this.init();
    if (!opts.ownerId || opts.ownerId.trim() === '') {
      throw new Error('ownerId required');
    }
    if (!opts.brandName || opts.brandName.trim() === '') {
      throw new Error('brandName required');
    }
    const plan = opts.plan ?? 'free';
    if (!Object.keys(QUOTAS).includes(plan)) {
      throw new Error(`invalid plan: ${plan}`);
    }
    const id = `tenant_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    const tenant: Tenant = {
      id,
      ownerId: opts.ownerId,
      brandName: opts.brandName.slice(0, 80),
      plan,
      createdAt: now,
      status: 'trial',
      trialEndsAt: now + TRIAL_DURATION_MS,
      monthlyTokenBudget: TOKEN_BUDGETS[plan],
      tokensConsumed: 0,
      ...(opts.brandColor !== undefined && { brandColor: opts.brandColor }),
      ...(opts.brandLogoUrl !== undefined && { brandLogoUrl: opts.brandLogoUrl }),
      ...(opts.customDomain !== undefined && { customDomain: opts.customDomain }),
      ...(opts.memberIds !== undefined && { memberIds: [...opts.memberIds] }),
    };
    this.tenants.push(tenant);
    this.persist();
    await auditLog.record('tenant.create', {
      actor: opts.ownerId,
      target: id,
      details: { brandName: tenant.brandName, plan },
    });
    logger.info('tenant', `created ${id} for owner ${opts.ownerId} plan=${plan}`);
    return tenant;
  }

  /**
   * Récupère le tenant courant pour un user (owner ou membre).
   * Retourne null si user n'appartient à aucun tenant.
   */
  getCurrent(userId: string): Tenant | null {
    if (!this.initialized) this.init();
    if (!userId) return null;
    /* 1. Tenant dont user est owner */
    const owned = this.tenants.find((t) => t.ownerId === userId);
    if (owned) return owned;
    /* 2. Tenant dont user est membre */
    const member = this.tenants.find((t) => Array.isArray(t.memberIds) && t.memberIds.includes(userId));
    return member ?? null;
  }

  /**
   * Liste tous tenants (admin Kevin only — sinon retourne array vide).
   */
  listAll(callerId?: string): Tenant[] {
    if (!this.initialized) this.init();
    if (callerId && callerId !== ADMIN_USER_ID) return [];
    return [...this.tenants];
  }

  /**
   * Récupère un tenant par id (sans check accès — utiliser canAccess séparément).
   */
  getById(tenantId: string): Tenant | null {
    if (!this.initialized) this.init();
    return this.tenants.find((t) => t.id === tenantId) ?? null;
  }

  /**
   * Update tenant (plan, status, branding).
   * Retourne true si update OK, false si tenant introuvable.
   * Audit log obligatoire (tenant.update).
   */
  update(tenantId: string, changes: Partial<Omit<Tenant, 'id' | 'createdAt' | 'ownerId'>>): boolean {
    if (!this.initialized) this.init();
    const idx = this.tenants.findIndex((t) => t.id === tenantId);
    if (idx < 0) return false;
    const current = this.tenants[idx];
    if (!current) return false;
    /* Si plan change → recalcule budget tokens */
    let monthlyTokenBudget = current.monthlyTokenBudget;
    if (changes.plan && changes.plan !== current.plan) {
      monthlyTokenBudget = TOKEN_BUDGETS[changes.plan];
    }
    const updated: Tenant = {
      ...current,
      ...changes,
      monthlyTokenBudget: changes.monthlyTokenBudget ?? monthlyTokenBudget,
      id: current.id, /* immutable */
      createdAt: current.createdAt, /* immutable */
      ownerId: current.ownerId, /* immutable, transfert via méthode dédiée */
    };
    this.tenants[idx] = updated;
    this.persist();
    void auditLog.record('tenant.update', {
      actor: current.ownerId,
      target: tenantId,
      details: { changes: Object.keys(changes) },
    });
    logger.info('tenant', `updated ${tenantId}`, { changedKeys: Object.keys(changes) });
    return true;
  }

  /**
   * Quotas pour un plan donné (lecture seule).
   */
  getQuotas(plan: TenantPlan): TenantQuotas {
    return QUOTAS[plan];
  }

  /**
   * Quotas du tenant courant d'un user (helper pratique).
   */
  getQuotasForUser(userId: string): TenantQuotas {
    const t = this.getCurrent(userId);
    if (!t) return QUOTAS.free;
    return QUOTAS[t.plan];
  }

  /**
   * Préfixe une clé localStorage avec le tenantId pour isolation données.
   * Kevin admin (admin tenant) = pas de préfixe (compat backward Apex).
   */
  scopeStorageKey(key: string, tenantId: string): string {
    if (!key) return key;
    if (!tenantId) return key;
    /* Si déjà préfixé tenant_xxx_, retourne tel quel */
    if (key.startsWith(`tenant_${tenantId}_`)) return key;
    /* Admin tenant : pas de préfixe (compat Kevin actuel) */
    const t = this.getById(tenantId);
    if (t && t.plan === 'admin') return key;
    return `tenant_${tenantId}_${key}`;
  }

  /**
   * Hard isolation : check user appartient au tenant avant accès data.
   * Kevin admin (kdmc_admin) = bypass total (cross-tenant access).
   */
  canAccess(userId: string, tenantId: string): boolean {
    if (!this.initialized) this.init();
    if (!userId || !tenantId) return false;
    /* Kevin admin = bypass total */
    if (userId === ADMIN_USER_ID) return true;
    const t = this.getById(tenantId);
    if (!t) return false;
    if (t.ownerId === userId) return true;
    if (Array.isArray(t.memberIds) && t.memberIds.includes(userId)) return true;
    return false;
  }

  /**
   * Ajoute membre à un tenant. Retourne false si déjà membre ou tenant introuvable.
   */
  addMember(tenantId: string, userId: string): boolean {
    if (!this.initialized) this.init();
    const t = this.getById(tenantId);
    if (!t) return false;
    if (!userId) return false;
    if (t.ownerId === userId) return false; /* owner pas en membres */
    const members = Array.isArray(t.memberIds) ? [...t.memberIds] : [];
    if (members.includes(userId)) return false;
    members.push(userId);
    return this.update(tenantId, { memberIds: members });
  }

  /**
   * Retire membre d'un tenant.
   */
  removeMember(tenantId: string, userId: string): boolean {
    if (!this.initialized) this.init();
    const t = this.getById(tenantId);
    if (!t || !Array.isArray(t.memberIds)) return false;
    const filtered = t.memberIds.filter((id) => id !== userId);
    if (filtered.length === t.memberIds.length) return false;
    return this.update(tenantId, { memberIds: filtered });
  }

  /**
   * Track consommation tokens (pour anti-abus + usage-based billing future).
   */
  trackTokenUsage(tenantId: string, tokens: number): void {
    if (!this.initialized) this.init();
    if (tokens <= 0) return;
    const idx = this.tenants.findIndex((t) => t.id === tenantId);
    if (idx < 0) return;
    const current = this.tenants[idx];
    if (!current) return;
    const updated: Tenant = {
      ...current,
      tokensConsumed: current.tokensConsumed + tokens,
    };
    this.tenants[idx] = updated;
    this.persist();
  }

  /**
   * Reset compteur tokens (cron mensuel).
   */
  resetMonthlyUsage(tenantId: string): boolean {
    return this.update(tenantId, { tokensConsumed: 0 });
  }

  /**
   * Vérifie si tenant a dépassé son budget tokens mensuel.
   */
  isOverBudget(tenantId: string): boolean {
    const t = this.getById(tenantId);
    if (!t) return false;
    if (t.monthlyTokenBudget < 0) return false; /* illimité */
    return t.tokensConsumed >= t.monthlyTokenBudget;
  }

  /**
   * Vérifie si trial expiré (passe en past_due si oui).
   */
  checkTrialExpiry(tenantId: string): boolean {
    const t = this.getById(tenantId);
    if (!t) return false;
    if (t.status !== 'trial') return false;
    if (!t.trialEndsAt) return false;
    if (Date.now() >= t.trialEndsAt) {
      this.update(tenantId, { status: 'past_due' });
      return true;
    }
    return false;
  }

  /**
   * Supprime un tenant (admin Kevin only — soft archive en réalité, conserve audit).
   */
  async delete(tenantId: string, callerId: string): Promise<boolean> {
    if (!this.initialized) this.init();
    if (callerId !== ADMIN_USER_ID) return false;
    const idx = this.tenants.findIndex((t) => t.id === tenantId);
    if (idx < 0) return false;
    const tenant = this.tenants[idx];
    if (!tenant) return false;
    this.tenants.splice(idx, 1);
    this.persist();
    await auditLog.record('tenant.delete', {
      actor: callerId,
      target: tenantId,
      details: { brandName: tenant.brandName, plan: tenant.plan },
    });
    logger.warn('tenant', `deleted ${tenantId} by ${callerId}`);
    return true;
  }

  /**
   * Format pour system prompt Apex IA — informe le LLM du tenant courant.
   */
  formatForSystemPrompt(userId: string): string {
    const t = this.getCurrent(userId);
    if (!t) {
      return `## Tenant courant\nAucun tenant associé (mode legacy ou user non onboardé).`;
    }
    const quotas = this.getQuotas(t.plan);
    const trialInfo = t.status === 'trial' && t.trialEndsAt
      ? ` · Trial expire ${new Date(t.trialEndsAt).toISOString().slice(0, 10)}`
      : '';
    return [
      `## Tenant courant`,
      `${t.brandName} (id: ${t.id}, plan: ${t.plan}, status: ${t.status}${trialInfo})`,
      `Quotas : ${quotas.msgPerDay === -1 ? 'illimité' : quotas.msgPerDay} msg/j · ${quotas.studiosCount} studios · voix ${quotas.voicesQuality} · ${quotas.apiCallsPerMonth === -1 ? 'illimité' : quotas.apiCallsPerMonth} API/mois`,
      `Budget tokens : ${t.tokensConsumed}/${t.monthlyTokenBudget === Number.MAX_SAFE_INTEGER ? '∞' : t.monthlyTokenBudget}`,
    ].join('\n');
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.tenants));
    } catch (err: unknown) {
      logger.warn('tenant', 'persist failed (quota?)', { err });
    }
  }
}

export const tenantManager = new TenantManager();
