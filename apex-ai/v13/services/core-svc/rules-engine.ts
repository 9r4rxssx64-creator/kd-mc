/**
 * APEX v13.4.4 — Rules Engine service (Kevin "charger TOUS les documents + parser règles + erreurs").
 *
 * Étend la version v13.4.3 avec :
 *  - parsing exhaustif (top 50) des sections "RÈGLE PERMANENTE" / "RÈGLE ABSOLUE"
 *  - parsing top 55 erreurs documentées "Erreurs connues à NE PAS reproduire"
 *  - markErrorApplied() : tracking dans `apex_v13_errors_applied`
 *  - buildSystemPromptInjection() : injection compactée pour system prompt IA
 *
 * Source : memory.getDocsContext()['CLAUDE.md'].content (déjà loadé au boot par syncDocsAtBoot).
 */

import { logger } from '../../core/logger.js';
import { memory } from '../../core/memory.js';

export interface ApexRule {
  id: string;
  title: string;
  date: string | null;
  quote: string;
  bodyExcerpt: string;
  fullSection: string;
  index: number;
  severity: 'critical' | 'high' | 'normal';
}

export interface ApexErrorDoc {
  num: number;
  title: string;
  lesson: string;
  applied: boolean;
}

const MAX_RULES = 50;
const MAX_ERRORS = 55;
const APPLIED_KEY = 'apex_v13_errors_applied';

/* Heading "RÈGLE PERMANENTE" / "RÈGLE ABSOLUE" précédé d'emoji optionnel.
 * Format CLAUDE.md : "## <emoji> RÈGLE PERMANENTE — TITRE (Kevin YYYY-MM-DD, ABSOLUE)" */
const RULE_HEADING_RX = /^##\s+(?:[\p{Extended_Pictographic}\p{Emoji_Component}‍️]+\s+)?RÈGLE\s+(PERMANENTE|ABSOLUE|SUPRÊME|CRITIQUE|MAÎTRESSE)\s*[—\-]\s*(.+?)(?:\s+\(Kevin\s+(\d{4}-\d{2}-\d{2}[^)]*)\))?\s*$/iu;

/* Une entrée erreur : "NN. **<titre>** (...)" ou "NN. <titre> (...)"
 * Range numéroté 1..55+ dans la liste "Erreurs connues à NE PAS reproduire". */
const ERROR_ITEM_RX = /^(\d{1,3})\.\s+(?:\*\*)?(.+?)(?:\*\*)?\s*(?:[—\-:](.+))?$/;

class RulesEngineService {
  /* ──────────────────────────────── RULES ──────────────────────────────── */

  list(): ApexRule[] {
    try {
      const docs = memory.getDocsContext();
      const claudeMd = docs['CLAUDE.md']?.content;
      if (!claudeMd) {
        logger.warn('rules-engine', 'CLAUDE.md cache vide — appelle memory.syncDocsAtBoot()');
        return [];
      }
      return this.parseRules(claudeMd);
    } catch (err: unknown) {
      logger.warn('rules-engine', 'list failed', { err });
      return [];
    }
  }

  top(limit = 10): ApexRule[] {
    return this.list().slice(0, limit);
  }

  filter(keyword: string): ApexRule[] {
    const k = (keyword || '').toLowerCase().trim();
    if (!k) return this.list();
    return this.list().filter((r) =>
      r.title.toLowerCase().includes(k) ||
      r.quote.toLowerCase().includes(k) ||
      r.bodyExcerpt.toLowerCase().includes(k),
    );
  }

  /**
   * v13.4.4 — Compteur visible dans health-dashboard.
   */
  getInjectedCount(): { rules: number; errorsApplied: number; errorsTotal: number } {
    const rules = this.list().length;
    const errs = this.listErrors();
    const applied = errs.filter((e) => e.applied).length;
    return { rules, errorsApplied: applied, errorsTotal: errs.length };
  }

  /**
   * v13.4.4 — Top N règles.
   */
  getTopRules(n = 50): ApexRule[] {
    return this.list().slice(0, n);
  }

  renderMarkdown(rules: ApexRule[]): string {
    if (rules.length === 0) {
      return '_Aucune règle trouvée. Lance `memory.syncDocsAtBoot()` ou vérifie ton cache._';
    }
    const lines = rules.map((r, i) => {
      const dateLabel = r.date ? ` _(${r.date})_` : '';
      const quoteLine = r.quote ? `\n  > ${r.quote.slice(0, 200)}` : '';
      return `**${i + 1}. ${r.title}**${dateLabel}${quoteLine}`;
    });
    return `### Règles permanentes Apex (${rules.length})\n\n${lines.join('\n\n')}`;
  }

  /* ──────────────────────────────── ERRORS ──────────────────────────────── */

  /**
   * v13.4.4 — Parse les "Erreurs connues à NE PAS reproduire" du CLAUDE.md.
   * Pattern : "1. titre — leçon ❌" / "55. titre (vXX, Kevin date) — leçon ❌→✅"
   */
  listErrors(): ApexErrorDoc[] {
    try {
      const docs = memory.getDocsContext();
      const claudeMd = docs['CLAUDE.md']?.content ?? '';
      if (!claudeMd) return [];
      return this.parseErrors(claudeMd);
    } catch (err: unknown) {
      logger.warn('rules-engine', 'listErrors failed', { err });
      return [];
    }
  }

  getTopErrors(n = MAX_ERRORS): ApexErrorDoc[] {
    return this.listErrors().slice(0, n);
  }

  /**
   * Marque une erreur comme appliquée (Apex/dev a confirmé qu'elle ne se reproduit plus).
   * Persisté dans `apex_v13_errors_applied` (Set<number>).
   */
  markErrorApplied(num: number): void {
    if (!Number.isFinite(num) || num < 1) return;
    const set = this.loadApplied();
    set.add(num);
    this.saveApplied(set);
  }

  unmarkErrorApplied(num: number): void {
    const set = this.loadApplied();
    set.delete(num);
    this.saveApplied(set);
  }

  isErrorApplied(num: number): boolean {
    return this.loadApplied().has(num);
  }

  private loadApplied(): Set<number> {
    try {
      const raw = localStorage.getItem(APPLIED_KEY);
      if (!raw) return new Set();
      const arr = JSON.parse(raw) as unknown;
      return new Set(Array.isArray(arr) ? arr.filter((n): n is number => typeof n === 'number') : []);
    } catch {
      return new Set();
    }
  }

  private saveApplied(set: Set<number>): void {
    try {
      localStorage.setItem(APPLIED_KEY, JSON.stringify(Array.from(set).sort((a, b) => a - b)));
    } catch {
      /* quota — ignore */
    }
  }

  /* ──────────────────────────────── PROMPT INJECTION ──────────────────────────────── */

  /**
   * v13.4.4 — Concatène top 7 règles critiques + top 10 erreurs + workflow Kevin
   * pour injection system prompt IA (cap 8000 chars).
   *
   * Compat memory.buildSystemPromptDeep — appelée comme PRIORITÉ 10.
   */
  buildSystemPromptInjection(maxChars = 8000): string {
    const rules = this.getTopRules(50);
    const errors = this.getTopErrors(55);

    const sections: string[] = [];

    /* Top 7 règles critiques */
    if (rules.length > 0) {
      const top7 = rules.slice(0, 7).map((r, i) => {
        const q = r.quote ? `\n   > « ${r.quote.slice(0, 180)} »` : '';
        return `${i + 1}. **${r.title.slice(0, 120)}**${q}`;
      });
      sections.push(`## 📜 Top règles permanentes Kevin (${rules.length} total)\n\n${top7.join('\n')}`);
    }

    /* Top 10 erreurs documentées + statut */
    if (errors.length > 0) {
      const top10 = errors.slice(0, 10).map((e) => {
        const tag = e.applied ? '✅' : '⚠️';
        const lesson = e.lesson ? ` — ${e.lesson.slice(0, 200)}` : '';
        return `${tag} #${e.num} ${e.title.slice(0, 100)}${lesson}`;
      });
      sections.push(
        `## 🛡️ Top 10 erreurs documentées (sur ${errors.length}) — JAMAIS REPRODUIRE\n\n${top10.join('\n')}`,
      );
    }

    /* Méthode de travail expert (résumé) */
    sections.push(
      `## 🎓 Méthode de travail (expert pro 200€/h)\n` +
        `1. Audit avant d'agir (matrice d'impact, lire fichiers en entier)\n` +
        `2. Multi-angles (réponse + alternatives + aller plus loin)\n` +
        `3. Tests + node --check + audit cross-feature AVANT push\n` +
        `4. Validation 100/100 réel par axe (sécu/perf/tests/archi/UX)\n` +
        `5. Anti-régression : run tests existants avant tout commit (Erreur #50)\n` +
        `6. SOURCE = BUILD : sync apex-ai/v13/dist/ → apex-ai-v13/ après chaque commit (Erreur #54)\n` +
        `7. CACHE_VERSION sw.js = APP_VER index.html toujours\n` +
        `8. JAMAIS demander à Kevin si Apex peut le faire seul (autonomie totale)`,
    );

    let out = sections.join('\n\n');
    if (out.length > maxChars) out = out.slice(0, maxChars - 80) + '\n[…tronqué pour limite]';
    return out;
  }

  /* ──────────────────────────────── PARSERS internes ──────────────────────────────── */

  private parseRules(md: string): ApexRule[] {
    const rules: ApexRule[] = [];
    const lines = md.split('\n');
    let current: { idx: number; title: string; date: string | null; bodyLines: string[]; severity: 'critical' | 'high' | 'normal' } | null = null;

    const pushCurrent = (): void => {
      if (!current) return;
      const fullSection = current.bodyLines.join('\n').trim();
      const quote = this.extractFirstQuote(fullSection);
      rules.push({
        id: `rule_${current.idx}_${this.slug(current.title)}`,
        title: current.title.slice(0, 200),
        date: current.date,
        quote: quote.slice(0, 400),
        bodyExcerpt: fullSection.slice(0, 500),
        fullSection,
        index: current.idx,
        severity: current.severity,
      });
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const m = line.match(RULE_HEADING_RX);
      if (m) {
        pushCurrent();
        if (rules.length >= MAX_RULES) {
          current = null;
          break;
        }
        const kind = (m[1] ?? '').toUpperCase();
        const severity: 'critical' | 'high' | 'normal' =
          kind === 'CRITIQUE' || kind === 'SUPRÊME' || kind === 'MAÎTRESSE'
            ? 'critical'
            : kind === 'ABSOLUE'
              ? 'high'
              : 'normal';
        current = {
          idx: rules.length,
          title: (m[2] ?? '').trim(),
          date: m[3] ? m[3].trim() : null,
          bodyLines: [],
          severity,
        };
        continue;
      }
      if (current && /^##\s+/.test(line) && !RULE_HEADING_RX.test(line)) {
        pushCurrent();
        current = null;
        continue;
      }
      if (current) current.bodyLines.push(line);
    }
    pushCurrent();
    return rules;
  }

  private parseErrors(md: string): ApexErrorDoc[] {
    /* Trouve la section "## Erreurs connues à NE PAS reproduire" puis extrait items numérotés */
    const sectionRx = /##\s+Erreurs\s+connues\s+à\s+NE\s+PAS\s+reproduire/i;
    const idx = md.search(sectionRx);
    if (idx < 0) return [];
    /* Slice jusqu'à la prochaine ## H2 */
    const afterHeader = md.slice(idx);
    const nextH2 = afterHeader.search(/\n##\s+/);
    const sectionText = nextH2 > 0 ? afterHeader.slice(0, nextH2) : afterHeader;

    const applied = this.loadApplied();
    const out: ApexErrorDoc[] = [];
    const lines = sectionText.split('\n');
    let cur: { num: number; title: string; lessonLines: string[] } | null = null;

    const flush = (): void => {
      if (!cur) return;
      const lesson = cur.lessonLines.join(' ').replace(/\s+/g, ' ').trim();
      out.push({
        num: cur.num,
        title: cur.title.slice(0, 200),
        lesson: lesson.slice(0, 600),
        applied: applied.has(cur.num),
      });
    };

    for (const line of lines) {
      const m = line.match(ERROR_ITEM_RX);
      if (m && m[1] && /^[1-9]\d{0,2}$/.test(m[1])) {
        flush();
        if (out.length >= MAX_ERRORS) {
          cur = null;
          break;
        }
        const num = parseInt(m[1], 10);
        const title = (m[2] ?? '').trim();
        const initialLesson = (m[3] ?? '').trim();
        cur = { num, title, lessonLines: initialLesson ? [initialLesson] : [] };
      } else if (cur && line.trim() && !line.startsWith('#')) {
        cur.lessonLines.push(line.trim());
      }
    }
    flush();
    return out;
  }

  private extractFirstQuote(text: string): string {
    const m = text.match(/^>\s+\*\*(.+?)\*\*/m) ?? text.match(/^>\s+(.+)$/m);
    return m ? (m[1] ?? '').replace(/^["']+|["']+$/g, '').trim() : '';
  }

  private slug(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
  }
}

export const rulesEngine = new RulesEngineService();
