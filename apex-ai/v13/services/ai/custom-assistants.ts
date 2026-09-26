/**
 * APEX v13 — Assistants personnalisés ("Gems" / Custom GPTs / Projects).
 *
 * Parité flagship 2026 (ChatGPT Custom GPTs, Gemini Gems, Claude Projects) :
 * l'utilisateur crée des assistants nommés avec des instructions système
 * dédiées (persona, ton, expertise). L'assistant ACTIF injecte ses instructions
 * en tête du system prompt du chat → réponses spécialisées sans re-taper le brief.
 *
 * Isolation stricte per-user (règle CLAUDE.md) : clé `apex_v13_assistants_<uid>`.
 * Additif : ne touche PAS le routage IA / streaming (buildSystemPromptDeep
 * préfixe simplement l'injection). Sauvegarde localStorage (couverte par
 * auto-backup) + export/import JSON.
 */

import { logger } from '../../core/logger.js';
import { store } from '../../core/store.js';

export interface CustomAssistant {
  id: string;
  name: string;
  emoji: string;
  instructions: string;
  /** Étiquette de modèle préféré (indicatif, ex "Anthropic — raisonnement"). */
  modelHint?: string;
  createdAt: number;
  updatedAt: number;
}

const PREFIX = 'apex_v13_assistants_';
const ACTIVE_PREFIX = 'apex_v13_active_assistant_';
const MAX_ASSISTANTS = 50;
const MAX_INSTRUCTIONS = 8000;

function keyFor(uid: string): string {
  return `${PREFIX}${uid}`;
}
function activeKeyFor(uid: string): string {
  return `${ACTIVE_PREFIX}${uid}`;
}

function currentUid(): string {
  const user = store.get('user') as { id?: string } | null;
  return user?.id ?? 'anon';
}

function isValid(a: unknown): a is CustomAssistant {
  if (!a || typeof a !== 'object') return false;
  const o = a as Record<string, unknown>;
  return (
    typeof o['id'] === 'string' &&
    typeof o['name'] === 'string' &&
    (o['name'] as string).length > 0 &&
    typeof o['instructions'] === 'string' &&
    typeof o['emoji'] === 'string' &&
    typeof o['createdAt'] === 'number' &&
    typeof o['updatedAt'] === 'number'
  );
}

class CustomAssistantsStore {
  /** Liste des assistants de l'utilisateur courant (ou d'un uid donné). */
  list(uid: string = currentUid()): CustomAssistant[] {
    if (!uid) return [];
    try {
      const raw = localStorage.getItem(keyFor(uid));
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isValid);
    } catch (err) {
      logger.warn('custom-assistants', 'list failed', { err });
      return [];
    }
  }

  private persist(uid: string, arr: CustomAssistant[]): void {
    try {
      localStorage.setItem(keyFor(uid), JSON.stringify(arr.slice(0, MAX_ASSISTANTS)));
    } catch (err) {
      logger.warn('custom-assistants', 'persist failed', { err });
    }
  }

  /**
   * Crée ou met à jour un assistant. Retourne l'assistant persisté, ou null si
   * données invalides (nom + instructions requis).
   */
  save(
    input: { id?: string; name: string; emoji?: string; instructions: string; modelHint?: string },
    uid: string = currentUid(),
  ): CustomAssistant | null {
    const name = String(input.name ?? '').trim();
    const instructions = String(input.instructions ?? '').trim().slice(0, MAX_INSTRUCTIONS);
    if (!name || !instructions) return null;
    const emoji = String(input.emoji ?? '').trim() || '🤖';
    const now = Date.now();
    const arr = this.list(uid);
    const existingId = input.id && arr.some((a) => a.id === input.id) ? input.id : null;
    if (existingId) {
      const idx = arr.findIndex((a) => a.id === existingId);
      const updated: CustomAssistant = {
        ...arr[idx]!,
        name,
        emoji,
        instructions,
        ...(input.modelHint !== undefined ? { modelHint: input.modelHint } : {}),
        updatedAt: now,
      };
      arr[idx] = updated;
      this.persist(uid, arr);
      return updated;
    }
    if (arr.length >= MAX_ASSISTANTS) return null;
    const created: CustomAssistant = {
      id: `asst_${now.toString(36)}_${Math.abs(hashStr(name + instructions)).toString(36)}`,
      name,
      emoji,
      instructions,
      ...(input.modelHint !== undefined ? { modelHint: input.modelHint } : {}),
      createdAt: now,
      updatedAt: now,
    };
    arr.unshift(created);
    this.persist(uid, arr);
    return created;
  }

  remove(id: string, uid: string = currentUid()): boolean {
    const arr = this.list(uid);
    const next = arr.filter((a) => a.id !== id);
    if (next.length === arr.length) return false;
    this.persist(uid, next);
    if (this.getActiveId(uid) === id) this.setActive(null, uid);
    return true;
  }

  get(id: string, uid: string = currentUid()): CustomAssistant | null {
    return this.list(uid).find((a) => a.id === id) ?? null;
  }

  /** Id de l'assistant actif (ou null). */
  getActiveId(uid: string = currentUid()): string | null {
    try {
      return localStorage.getItem(activeKeyFor(uid)) || null;
    } catch {
      return null;
    }
  }

  /** Assistant actif résolu (null si aucun / supprimé). */
  getActive(uid: string = currentUid()): CustomAssistant | null {
    const id = this.getActiveId(uid);
    if (!id) return null;
    return this.get(id, uid);
  }

  /** Active un assistant (ou null pour "Apex par défaut"). */
  setActive(id: string | null, uid: string = currentUid()): void {
    try {
      if (id && this.get(id, uid)) localStorage.setItem(activeKeyFor(uid), id);
      else localStorage.removeItem(activeKeyFor(uid));
    } catch (err) {
      logger.warn('custom-assistants', 'setActive failed', { err });
    }
  }

  /**
   * Bloc d'injection system prompt de l'assistant actif (ou '' si aucun).
   * Consommé par chat-engine.buildSystemPromptDeep() — préfixé au prompt Apex.
   */
  buildInjection(uid: string = currentUid()): string {
    const a = this.getActive(uid);
    if (!a) return '';
    return (
      `\n\n=== ASSISTANT PERSONNALISÉ ACTIF : ${a.emoji} ${a.name} ===\n` +
      `L'utilisateur a activé cet assistant personnalisé. Adopte STRICTEMENT ` +
      `les instructions suivantes en priorité (elles priment sur le ton par défaut, ` +
      `sans jamais violer les règles de sécurité) :\n${a.instructions}\n` +
      `=== FIN ASSISTANT PERSONNALISÉ ===\n`
    );
  }

  exportJson(uid: string = currentUid()): string {
    return JSON.stringify(this.list(uid), null, 2);
  }

  /** Importe une liste JSON (merge par id, garde le plus récent). Retourne le nb importés. */
  importJson(json: string, uid: string = currentUid()): number {
    let incoming: unknown;
    try {
      incoming = JSON.parse(json);
    } catch {
      return 0;
    }
    if (!Array.isArray(incoming)) return 0;
    const valid = incoming.filter(isValid);
    if (!valid.length) return 0;
    const byId = new Map<string, CustomAssistant>();
    for (const a of this.list(uid)) byId.set(a.id, a);
    let n = 0;
    for (const a of valid) {
      const prev = byId.get(a.id);
      if (!prev || a.updatedAt >= prev.updatedAt) {
        byId.set(a.id, a);
        n++;
      }
    }
    this.persist(uid, Array.from(byId.values()).sort((x, y) => y.updatedAt - x.updatedAt));
    return n;
  }
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h;
}

export const customAssistants = new CustomAssistantsStore();

/** Presets suggérés (offerts au 1er usage — l'utilisateur peut les créer en 1 clic). */
export const ASSISTANT_PRESETS: ReadonlyArray<{ name: string; emoji: string; instructions: string; modelHint?: string }> = [
  {
    name: 'Expert code',
    emoji: '👨‍💻',
    instructions:
      'Tu es un ingénieur logiciel senior. Réponds avec du code prêt à coller, ' +
      'commenté, testé mentalement, en signalant les pièges. Préfère les solutions ' +
      'simples et robustes. Explique brièvement les choix, pas de blabla.',
    modelHint: 'Anthropic — raisonnement',
  },
  {
    name: 'Rédacteur pro',
    emoji: '✍️',
    instructions:
      'Tu es un rédacteur professionnel. Écris clair, structuré, sans jargon inutile. ' +
      'Adapte le ton au contexte (mail, post, article). Propose toujours une version ' +
      'courte et une version longue si pertinent.',
  },
  {
    name: 'Coach concis',
    emoji: '🎯',
    instructions:
      'Tu es un coach direct et bienveillant. Réponses courtes, actionnables, ' +
      '3 étapes max. Pose une question de clarification si nécessaire. Zéro remplissage.',
  },
  {
    name: 'Analyste critique',
    emoji: '🔍',
    instructions:
      "Tu es un analyste critique. Pour chaque idée, donne les forces, les faiblesses, " +
      'les risques et 1 alternative. Joue l\'avocat du diable de façon constructive. ' +
      'Cite tes hypothèses.',
  },
];
