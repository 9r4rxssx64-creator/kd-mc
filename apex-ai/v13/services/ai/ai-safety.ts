/**
 * APEX v13 — AI Safety 10 contrôles instrumentés (Jet 5 audit)
 *
 * Audit subagent flag : "AI Safety 10 contrôles boilerplate généric, manque edge cases."
 *
 * 10 contrôles AI Safety pour PWA Apex Kevin :
 *
 * 1. Prompt injection filter   : detect "ignore previous instructions" + variants
 * 2. Jailbreak heuristics      : detect DAN, Sydney, role-play bypass
 * 3. PII leak prevention       : déjà via pii-redaction.ts (Jet 2)
 * 4. Hallucination cross-check : compare 2 providers (warn si divergence majeure)
 * 5. Refusal calibration       : log refus + détection over/under-refusal
 * 6. Citation accuracy         : tracker sources web_search vs réponse IA
 * 7. Tool abuse prevention     : whitelist tools admin-only + rate-limit
 * 8. Confidence calibration    : score confidence par réponse + flag low-conf
 * 9. Output content safety     : detect violence/hate/sexual + redact
 * 10. Domain-specific safety   : finance (anti-fraud), broadlink (no auto), credentials (no exfil)
 */

import { backend } from '../integrations/backend.js';
import { auditLog } from '../observability/audit-log.js';
import { observability } from '../observability/observability.js';
import { redactPII } from '../vault/pii-redaction.js';

interface SafetyResult {
  safe: boolean;
  flags: string[];
  blocked: boolean;
  details?: Record<string, unknown>;
}

/* === Patterns détection prompt injection === */
const INJECTION_PATTERNS: ReadonlyArray<{ name: string; regex: RegExp }> = [
  { name: 'ignore_instructions', regex: /\b(ignore|forget|disregard)\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i },
  /* P2.2 v13.3.81 (audit cascade) : "ignore all restrictions" sans le mot "previous" */
  { name: 'ignore_all_rules', regex: /\bignore\s+all\s+(?:restrictions|rules|prior\s+instructions|safety\s+rules|guidelines)\b/i },
  { name: 'system_prompt_extract', regex: /\b(reveal|show|print|tell\s+me)\s+(your|the)\s+(system\s+prompt|instructions|rules)\b/i },
  { name: 'role_override', regex: /\b(you\s+are\s+now|act\s+as|pretend\s+to\s+be|from\s+now\s+on)\s+(?:a\s+)?(DAN|Sydney|jailbroken|unrestricted|developer\s+mode)/i },
  { name: 'data_exfil', regex: /\b(send|upload|transmit)\s+(my\s+)?(api\s+keys?|credentials|tokens?|passwords?)\s+to\b/i },
  { name: 'shell_exec', regex: /\b(execute|run|eval)\s+(shell|bash|cmd|powershell)\b/i },
];

/* === Patterns jailbreak ===
 * P2.2 v13.3.81 (audit cascade) : ajout patterns ChatGPT mode, unrestricted,
 * DAN jailbreak, developer mode + déjà existant complété. */
const JAILBREAK_PATTERNS: ReadonlyArray<{ name: string; regex: RegExp }> = [
  { name: 'dan_v', regex: /\b(do\s+anything\s+now|DAN\s+(mode|version|jailbreak)|jailbreak\s+mode)/i },
  { name: 'sydney', regex: /\b(Sydney|Bing\s+chat|original\s+Microsoft\s+chat)/i },
  { name: 'developer_mode', regex: /\b(developer\s+mode|dev\s+mode|debug\s+mode|admin\s+override)/i },
  { name: 'roleplay_villain', regex: /\b(pretend\s+(you|to\s+be)\s+(an?\s+)?(evil|malicious|criminal|hacker))/i },
  { name: 'chatgpt_mode', regex: /\bchat[\s-]?gpt[\s-]?(mode|jailbreak|free|unfiltered)/i },
  { name: 'unrestricted', regex: /\b(unrestricted|uncensored|unfiltered|no\s+restrictions?)\s+(mode|version|ai)\b/i },
  { name: 'opposite_day', regex: /\b(opposite\s+day|reverse\s+psychology|do\s+the\s+opposite)\b/i },
];

/* === Content safety patterns (light, anti faux positifs) === */
const UNSAFE_CONTENT_PATTERNS: ReadonlyArray<{ name: string; regex: RegExp; severity: 'warn' | 'block' }> = [
  { name: 'explicit_violence', regex: /\b(comment\s+(tuer|assassiner)\s+\w+|how\s+to\s+(kill|murder)\s+(a\s+person|someone))/i, severity: 'block' },
  { name: 'csam', regex: /\b(child\s+(porn|abuse|sexual)|csam|pedoph)/i, severity: 'block' },
  { name: 'weapon_synth', regex: /\b(synthesize|fabricate|build)\s+(bomb|explosive|nerve\s+agent|biological\s+weapon)/i, severity: 'block' },
];

/* === Domain-specific Kevin === */
const KEVIN_DOMAIN_RULES: ReadonlyArray<{ name: string; check: (text: string) => boolean; msg: string }> = [
  {
    name: 'finance_no_auto_transfer',
    check: (t) => /\b(virement|transfer|payment|paiement)\s+\d{2,}/i.test(t) && /\b(automatique|auto|sans\s+confirmation)\b/i.test(t),
    msg: 'Virement automatique sans confirmation refusé (anti-fraud)',
  },
  {
    name: 'credentials_no_exfil',
    check: (t) => /\b(send|envoie|upload|exfil|copy)\s+.+(api\s+key|coffre|vault|password)/i.test(t),
    msg: 'Exfiltration credentials refusée',
  },
  {
    name: 'broadlink_no_auto',
    check: (t) => /\b(broadlink|home\s+cinema|TV)\s+.+(automation|auto|sans)\s+confirmation/i.test(t),
    msg: 'Automation Broadlink sans confirmation refusée (Kevin demande validation manuelle)',
  },
];

class AISafety {
  /**
   * Contrôle 1 + 2 : prompt injection + jailbreak.
   * Retourne flagged si détection avec liste flags.
   */
  detectInjection(text: string): SafetyResult {
    const flags: string[] = [];
    for (const p of INJECTION_PATTERNS) if (p.regex.test(text)) flags.push(`injection:${p.name}`);
    for (const p of JAILBREAK_PATTERNS) if (p.regex.test(text)) flags.push(`jailbreak:${p.name}`);
    const blocked = flags.length > 0;
    if (blocked) {
      observability.capture('warn', 'ai-safety.injection', `Detected: ${flags.join(',')}`);
      void auditLog.record('ai-safety.injection', { details: { flags, textPreview: text.slice(0, 100) } });
    }
    return { safe: !blocked, flags, blocked };
  }

  /**
   * Contrôle 9 : Content safety output IA.
   */
  checkOutputSafety(text: string): SafetyResult {
    const flags: string[] = [];
    let blocked = false;
    for (const p of UNSAFE_CONTENT_PATTERNS) {
      if (p.regex.test(text)) {
        flags.push(`unsafe:${p.name}`);
        if (p.severity === 'block') blocked = true;
      }
    }
    if (flags.length > 0) {
      observability.capture(blocked ? 'critical' : 'warn', 'ai-safety.output', `Detected: ${flags.join(',')}`);
      void auditLog.record('ai-safety.output_unsafe', { details: { flags } });
    }
    return { safe: !blocked, flags, blocked };
  }

  /**
   * Contrôle 10 : Domain-specific safety pour Kevin (Casino Monaco, Apex orchestre projets).
   */
  checkDomainSafety(text: string): SafetyResult {
    const flags: string[] = [];
    const messages: string[] = [];
    for (const r of KEVIN_DOMAIN_RULES) {
      if (r.check(text)) {
        flags.push(`domain:${r.name}`);
        messages.push(r.msg);
      }
    }
    const blocked = flags.length > 0;
    if (blocked) {
      observability.capture('warn', 'ai-safety.domain', flags.join(','), { messages });
      void auditLog.record('ai-safety.domain_block', { details: { flags, messages } });
    }
    return { safe: !blocked, flags, blocked, ...(messages.length > 0 && { details: { messages } }) };
  }

  /**
   * Contrôle 5 : Refusal calibration. Log refus IA pour détecter over/under refusal.
   */
  logRefusal(prompt: string, refusalText: string, providerId: string): void {
    void auditLog.record('ai-safety.refusal', {
      details: {
        promptPreview: prompt.slice(0, 200),
        refusalPreview: refusalText.slice(0, 200),
        provider: providerId,
      },
    });
  }

  /**
   * Contrôle 8 : Confidence calibration. Score 0-1 basé heuristiques.
   */
  estimateConfidence(text: string): { score: number; lowConfidence: boolean } {
    let score = 1;
    /* Phrases d'incertitude */
    if (/\b(je\s+(ne\s+sais\s+pas|crois|pense|suppose)|peut[- ]être|probablement|might|possibly|I\s+(don'?t\s+know|believe|think|guess))/i.test(text)) {
      score -= 0.3;
    }
    /* Hedging */
    if (/\b(en\s+théorie|généralement|souvent|parfois|usually|sometimes|generally)/i.test(text)) {
      score -= 0.2;
    }
    /* Citations explicites = confiance plus haute */
    if (/\[(?:source|réf|référence)\]|https?:\/\//i.test(text)) {
      score += 0.2;
    }
    score = Math.max(0, Math.min(1, score));
    return { score, lowConfidence: score < 0.6 };
  }

  /**
   * Contrôle 7 : Tool abuse — whitelist tools admin-only + rate-limit.
   */
  checkToolUse(tool: string, isAdmin: boolean, recentUses: number): { allowed: boolean; reason?: string } {
    const ADMIN_ONLY_TOOLS = new Set(['cmc_write_motd', 'admin_create_user', 'admin_change_pin', 'admin_export_all', 'broadlink_send', 'firebase_admin_write']);
    if (ADMIN_ONLY_TOOLS.has(tool) && !isAdmin) {
      void auditLog.record('ai-safety.tool_blocked', { details: { tool, reason: 'admin_only' } });
      return { allowed: false, reason: 'Tool réservé admin' };
    }
    /* Rate-limit : max 30 uses / 5 min par tool */
    if (recentUses > 30) {
      return { allowed: false, reason: 'Tool rate-limit dépassé (30/5min)' };
    }
    return { allowed: true };
  }

  /**
   * Contrôle 3 (manquant Jet 5) : PII leak prevention RÉEL.
   * Vérifie si message sortant contient PII non redactés.
   * Wrapper sur pii-redaction.ts avec audit log si détection.
   */
  checkPIILeak(text: string): { safe: boolean; foundCount: number; redacted: string } {
    const result = redactPII(text);
    if (result.foundCount > 0) {
      void auditLog.record('ai-safety.pii_detected', {
        details: { foundCount: result.foundCount, textPreview: text.slice(0, 100) },
      });
    }
    return { safe: result.foundCount === 0, foundCount: result.foundCount, redacted: result.redacted };
  }

  /**
   * Contrôle 4 : Hallucination cross-check — HEURISTIQUE LÉGÈRE (pas sémantique LLM).
   *
   * AUDIT HONNÊTE Jet 6.5 :
   * - Jaccard similarity sur tokens > 3 chars (intersection / union)
   * - PAS de vraie compréhension sémantique (pas d'embedding, pas d'LLM call)
   * - Faux positifs possibles : paraphrases avec synonyms peuvent être flagged divergent
   * - Faux négatifs possibles : 2 réponses fausses concordantes (même hallucination)
   *
   * Use case réel : signal early warning si 2 providers donnent réponses
   * complètement différentes. À combiner avec verifyCitationURL pour validation.
   *
   * Pour vraie hallucination detection sémantique → backend LLM judge (Jet 7+).
   */
  crossCheckHallucination(responseA: string, responseB: string): {
    consistent: boolean;
    similarity: number;
    method: 'jaccard_heuristic';
    flag?: string;
  } {
    const tokenize = (s: string) => s.toLowerCase().split(/\s+/).filter((t) => t.length > 3);
    const tokensA = new Set(tokenize(responseA));
    const tokensB = new Set(tokenize(responseB));
    if (tokensA.size === 0 && tokensB.size === 0) return { consistent: true, similarity: 1, method: 'jaccard_heuristic' };
    /* Jaccard similarity */
    const intersection = [...tokensA].filter((t) => tokensB.has(t)).length;
    /* Le guard ci-dessus garantit ≥1 set non-vide → union ≥ 1 (jamais 0 ici). */
    const union = new Set([...tokensA, ...tokensB]).size;
    const similarity = intersection / union;
    if (similarity < 0.3) {
      void auditLog.record('ai-safety.hallucination', { details: { similarity, lenA: responseA.length, lenB: responseB.length, method: 'jaccard_heuristic' } });
      return { consistent: false, similarity, method: 'jaccard_heuristic', flag: 'major_divergence' };
    }
    if (similarity < 0.6) {
      return { consistent: false, similarity, method: 'jaccard_heuristic', flag: 'minor_divergence' };
    }
    return { consistent: true, similarity, method: 'jaccard_heuristic' };
  }

  /**
   * Contrôle 4 amélioré (Jet 7) : Hallucination check SÉMANTIQUE via backend LLM judge.
   * Si backend Cloudflare Worker configuré → appel `/ai/judge` Claude Haiku pour vraie analyse sémantique.
   * Sinon → fallback Jaccard heuristic côté client.
   *
   * Usage : `await aiSafety.crossCheckHallucinationSmart(prompt, respA, respB)`
   * Le résultat inclut `method: 'llm_judge_haiku' | 'jaccard_heuristic'` pour traçabilité.
   */
  async crossCheckHallucinationSmart(
    promptOriginal: string,
    responseA: string,
    responseB: string,
  ): Promise<{
    consistent: boolean | null;
    confidence?: number;
    similarity?: number;
    method: 'llm_judge_haiku' | 'jaccard_heuristic';
    reason?: string;
    flag?: string;
  }> {
    /* Try backend LLM judge en priorité */
    if (backend.isConfigured()) {
      const r = await backend.aiJudge(promptOriginal, responseA, responseB);
      if (!r.fallback && r.consistent !== null) {
        return {
          consistent: r.consistent,
          ...(typeof r.confidence === 'number' && { confidence: r.confidence }),
          method: 'llm_judge_haiku',
          ...(r.reason && { reason: r.reason }),
        };
      }
    }
    /* Fallback Jaccard côté client */
    const heuristic = this.crossCheckHallucination(responseA, responseB);
    return heuristic;
  }

  /**
   * Contrôle 6 (manquant Jet 5) : Citation accuracy tracker.
   * Quand IA cite source (URL, "selon X"), vérifie que la source existe vraiment.
   * Patterns détection : URLs, "selon", "d'après", footnotes [1].
   */
  extractCitations(text: string): {
    urls: string[];
    namedSources: string[];
    footnotes: string[];
  } {
    const urls = (text.match(/https?:\/\/[^\s<>"]+/g) ?? []).map((s) => s.replace(/[.,;:!?]$/, ''));
    const namedSources = (text.match(/\b(?:selon|d'après|d'apres|according\s+to|per)\s+([^.,;\n]+)/gi) ?? []).map((s) => s.trim());
    const footnotes = (text.match(/\[\d+\]/g) ?? []).map((s) => s.trim());
    return { urls, namedSources, footnotes };
  }

  /**
   * Vérifie qu'une URL citée est réellement accessible (HEAD request best-effort).
   */
  async verifyCitationURL(url: string): Promise<{ valid: boolean; status?: number }> {
    try {
      const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000), mode: 'no-cors' });
      return { valid: res.status < 400 || res.type === 'opaque', status: res.status };
    } catch {
      return { valid: false };
    }
  }

  /**
   * Contrôle 5 amélioré (Jet 6) : Refusal calibration RÉEL.
   * Détecte over/under-refusal en comparant contre baseline de patterns refus + acceptable.
   */
  analyzeRefusal(refusalText: string, prompt: string): {
    isRefusal: boolean;
    overRefusal: boolean;
    underRefusal: boolean;
    confidence: number;
  } {
    const refusalPatterns = [
      /\b(je\s+ne\s+peux\s+pas|cannot|unable\s+to|won'?t|refuse)\b/i,
      /\b(against\s+my\s+(guidelines?|principles?))/i,
      /\b(désolé|sorry).*(can'?t|cannot|impossible)/i,
    ];
    const isRefusal = refusalPatterns.some((p) => p.test(refusalText));
    /* Over-refusal : refus sur prompt clairement bénin (pas de keyword sensible) */
    const sensitiveKeywords = /\b(kill|hack|exploit|illegal|drug|weapon|csam|child\s+abuse)\b/i;
    const promptLooksSafe = !sensitiveKeywords.test(prompt);
    const overRefusal = isRefusal && promptLooksSafe && prompt.length < 200;
    /* Under-refusal : pas de refus alors que prompt clairement sensible */
    const underRefusal = !isRefusal && sensitiveKeywords.test(prompt);
    let confidence = 0.5;
    if (isRefusal) confidence += 0.3;
    if (overRefusal || underRefusal) confidence -= 0.2;
    if (overRefusal) {
      void auditLog.record('ai-safety.over_refusal', { details: { promptPreview: prompt.slice(0, 100) } });
    }
    if (underRefusal) {
      void auditLog.record('ai-safety.under_refusal', { details: { promptPreview: prompt.slice(0, 100) } });
    }
    return { isRefusal, overRefusal, underRefusal, confidence };
  }
}

export const aiSafety = new AISafety();
