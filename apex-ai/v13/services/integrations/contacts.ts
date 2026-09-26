/**
 * APEX v13 — Contacts Carnet (carnet d'adresses simple)
 *
 * Demande Kevin (2026-05-07) :
 * "Je dis 'appelle Yannou' et il prend automatiquement mon compte WhatsApp et il appelle"
 *
 * Carnet contacts léger pour résolution naturelle de noms en numéros téléphone /
 * emails / handles WhatsApp. Fuzzy search (Levenshtein) pour trouver "Yannou" → "Yann Roux".
 *
 * Stockage :
 * - localStorage `apex_v13_contacts` (max 500 contacts ~50 KB)
 * - Firebase backup optionnel via clé `FB_FIX` (sync cross-device admin)
 *
 * Sécurité :
 * - Pas de PII redaction côté contacts (legitime stockage user)
 * - Tier admin/family uniquement pour add/delete (laurence read-only)
 * - Audit log à chaque add/edit/delete
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';

export interface Contact {
  id: string; /* uuid v4 */
  name: string; /* ex: "Yann Roux" */
  phone?: string; /* E.164 ex: "+33612345678" */
  email?: string;
  whatsapp?: string; /* E.164 sans + (ex: "33612345678") ou identique à phone */
  aliases?: string[]; /* ex: ["Yannou", "Yan", "Le grand"] */
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ContactInput {
  name: string;
  phone?: string;
  email?: string;
  whatsapp?: string;
  aliases?: string[];
  notes?: string;
}

const STORAGE_KEY = 'apex_v13_contacts';
const MAX_CONTACTS = 500;

class Contacts {
  private cache: Contact[] | null = null;

  /**
   * Charge les contacts depuis localStorage (lazy + cache).
   */
  list(): Contact[] {
    if (this.cache) return this.cache;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      this.cache = raw ? (JSON.parse(raw) as Contact[]) : [];
    } catch (err: unknown) {
      logger.warn('contacts', 'list failed', { err });
      this.cache = [];
    }
    return this.cache;
  }

  /**
   * Persiste cache → localStorage.
   */
  private persist(): void {
    if (!this.cache) return;
    try {
      const trimmed = this.cache.length > MAX_CONTACTS
        ? this.cache.slice(-MAX_CONTACTS)
        : this.cache;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      this.cache = trimmed;
    } catch (err: unknown) {
      logger.warn('contacts', 'persist failed (quota?)', { err });
    }
  }

  /**
   * Ajoute un contact. Génère ID auto + audit log.
   * Retourne le contact créé.
   */
  add(input: ContactInput): Contact {
    const all = this.list();
    const now = Date.now();
    const id = this.generateId();
    const contact: Contact = {
      id,
      name: String(input.name).trim(),
      ...(input.phone && { phone: this.normalizePhone(input.phone) }),
      ...(input.email && { email: String(input.email).trim().toLowerCase() }),
      ...(input.whatsapp && { whatsapp: this.normalizePhone(input.whatsapp).replace(/^\+/, '') }),
      ...(input.aliases && input.aliases.length > 0 && { aliases: input.aliases.map((a) => a.trim()) }),
      ...(input.notes && { notes: input.notes }),
      createdAt: now,
      updatedAt: now,
    };
    all.push(contact);
    this.cache = all;
    this.persist();
    void auditLog.record('contacts.add', { details: { id, name: contact.name } });
    return contact;
  }

  /**
   * Met à jour un contact existant (par ID).
   */
  update(id: string, patch: Partial<ContactInput>): Contact | null {
    const all = this.list();
    const idx = all.findIndex((c) => c.id === id);
    if (idx < 0) return null;
    const existing = all[idx];
    if (!existing) return null;
    const updated: Contact = {
      ...existing,
      ...(patch.name !== undefined && { name: String(patch.name).trim() }),
      ...(patch.phone !== undefined && { phone: this.normalizePhone(patch.phone) }),
      ...(patch.email !== undefined && { email: String(patch.email).trim().toLowerCase() }),
      ...(patch.whatsapp !== undefined && { whatsapp: this.normalizePhone(patch.whatsapp).replace(/^\+/, '') }),
      ...(patch.aliases !== undefined && { aliases: patch.aliases.map((a) => a.trim()) }),
      ...(patch.notes !== undefined && { notes: patch.notes }),
      updatedAt: Date.now(),
    };
    all[idx] = updated;
    this.cache = all;
    this.persist();
    void auditLog.record('contacts.update', { details: { id, name: updated.name } });
    return updated;
  }

  /**
   * Supprime un contact par ID.
   */
  remove(id: string): boolean {
    const all = this.list();
    const idx = all.findIndex((c) => c.id === id);
    if (idx < 0) return false;
    const removed = all.splice(idx, 1)[0];
    this.cache = all;
    this.persist();
    void auditLog.record('contacts.remove', {
      details: { id, name: removed?.name ?? 'unknown' },
    });
    return true;
  }

  /**
   * Récupère un contact par ID.
   */
  getById(id: string): Contact | null {
    return this.list().find((c) => c.id === id) ?? null;
  }

  /**
   * Récupère un contact par nom (exact match insensible à la casse).
   */
  getByName(name: string): Contact | null {
    const norm = this.normalizeName(name);
    if (!norm) return null;
    const all = this.list();
    /* Match exact name */
    for (const c of all) {
      if (this.normalizeName(c.name) === norm) return c;
    }
    /* Match exact alias */
    for (const c of all) {
      if (c.aliases) {
        for (const a of c.aliases) {
          if (this.normalizeName(a) === norm) return c;
        }
      }
    }
    return null;
  }

  /**
   * Recherche fuzzy par nom/alias (Levenshtein + substring).
   * Retourne contacts triés par score de similarité décroissant.
   * "Yannou" → trouve "Yann Roux" via alias OU substring.
   */
  search(query: string, opts: { maxResults?: number; minScore?: number } = {}): Contact[] {
    const q = this.normalizeName(query);
    if (!q) return [];
    const all = this.list();
    const maxResults = opts.maxResults ?? 10;
    const minScore = opts.minScore ?? 0.4;
    const scored: Array<{ contact: Contact; score: number }> = [];
    for (const c of all) {
      const score = this.scoreContact(c, q);
      if (score >= minScore) {
        scored.push({ contact: c, score });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, maxResults).map((s) => s.contact);
  }

  /**
   * Score d'un contact pour une query normalisée.
   * Combine : nom exact > alias exact > substring nom/alias > Levenshtein.
   */
  private scoreContact(c: Contact, q: string): number {
    const targets: Array<{ text: string; weight: number }> = [];
    targets.push({ text: this.normalizeName(c.name), weight: 1.0 });
    if (c.aliases) {
      for (const a of c.aliases) {
        targets.push({ text: this.normalizeName(a), weight: 0.95 });
      }
    }
    let best = 0;
    for (const t of targets) {
      if (!t.text) continue;
      /* Exact match */
      if (t.text === q) {
        best = Math.max(best, 1.0 * t.weight);
        continue;
      }
      /* Substring match */
      if (t.text.includes(q) || q.includes(t.text)) {
        const ratio = Math.min(q.length, t.text.length) / Math.max(q.length, t.text.length);
        best = Math.max(best, (0.7 + 0.3 * ratio) * t.weight);
        continue;
      }
      /* Token match (split sur espaces) */
      const qTokens = q.split(/\s+/).filter(Boolean);
      const tTokens = t.text.split(/\s+/).filter(Boolean);
      let tokenHits = 0;
      for (const qt of qTokens) {
        if (qt.length < 2) continue;
        for (const tt of tTokens) {
          if (tt.startsWith(qt) || qt.startsWith(tt) || tt.includes(qt)) {
            tokenHits++;
            break;
          }
        }
      }
      if (tokenHits > 0) {
        const tokenScore = (tokenHits / Math.max(qTokens.length, 1)) * 0.85;
        best = Math.max(best, tokenScore * t.weight);
      }
      /* Levenshtein fallback (couteux donc en dernier) */
      const lev = this.levenshteinDistance(q, t.text);
      const maxLen = Math.max(q.length, t.text.length);
      if (maxLen > 0) {
        const levScore = (1 - lev / maxLen) * 0.7;
        if (levScore > best) best = levScore * t.weight;
      }
    }
    return best;
  }

  /**
   * Nombre de contacts.
   */
  count(): number {
    return this.list().length;
  }

  /**
   * Vide tous les contacts (admin only — appelant doit checker tier).
   */
  clearAll(): void {
    this.cache = [];
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    void auditLog.record('contacts.clearAll', { details: {} });
  }

  /**
   * Reload force depuis localStorage (utile tests + sync externe).
   */
  reload(): void {
    this.cache = null;
    this.list();
  }

  /* === Helpers === */

  private generateId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    /* Fallback environnement très ancien */
    return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  /**
   * Normalise un nom pour comparaison (lowercase, accents enlevés, espaces multiples → 1).
   */
  private normalizeName(name: string): string {
    return String(name)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[\s\-_.]+/g, ' ')
      .trim();
  }

  /**
   * Normalise un numéro téléphone (garde + au début, vire espaces/tirets).
   */
  private normalizePhone(phone: string): string {
    const clean = String(phone).replace(/[\s\-.()]/g, '');
    return clean;
  }

  /**
   * Levenshtein distance (edit distance) entre 2 chaînes.
   * Implémentation classique DP optimisée mémoire.
   */
  private levenshteinDistance(a: string, b: string): number {
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    let curr = new Array<number>(b.length + 1).fill(0);

    for (let i = 1; i <= a.length; i++) {
      curr[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        const prevJ = prev[j] ?? 0;
        const currPrev = curr[j - 1] ?? 0;
        const prevPrev = prev[j - 1] ?? 0;
        curr[j] = Math.min(
          prevJ + 1, /* deletion */
          currPrev + 1, /* insertion */
          prevPrev + cost, /* substitution */
        );
      }
      [prev, curr] = [curr, prev];
    }
    return prev[b.length] ?? 0;
  }
}

export const contacts = new Contacts();
