/**
 * APEX v13.4.318 — Commandes personnalisées (Kevin 2026-06-08).
 *
 * Kevin : « Que je puisse ajouter aussi une commande et je rajoute sur qui/quoi/où
 *  il doit l'appliquer. » + « préremplit le chat et je rajoute si besoin ».
 *
 * Une commande perso = { nom, emoji, action (ce qu'Apex fait), target (sur qui/
 * quoi/où) }. Au clic dans la vue /commands → prefill du chat avec
 * `action + target` (Kevin complète/édite puis envoie lui-même, pas d'auto-submit).
 *
 * Stockage : localStorage `apex_v13_custom_commands` (prefs user, non sensible).
 * Source de vérité unique → la vue /commands se met à jour seule.
 */

const KEY = 'apex_v13_custom_commands';
const MAX = 100;

export interface CustomCommand {
  id: string;
  name: string;
  emoji: string;
  action: string;
  target: string;
  ts: number;
}

/** Liste les commandes perso (tri par création desc). Tolérant au JSON corrompu. */
export function listCustomCommands(): CustomCommand[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    const out: CustomCommand[] = [];
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      if (typeof o['id'] !== 'string' || typeof o['name'] !== 'string' || typeof o['action'] !== 'string') continue;
      out.push({
        id: o['id'],
        name: o['name'],
        action: o['action'],
        emoji: typeof o['emoji'] === 'string' && o['emoji'] ? o['emoji'] : '⭐',
        target: typeof o['target'] === 'string' ? o['target'] : '',
        ts: typeof o['ts'] === 'number' ? o['ts'] : 0,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** Texte injecté dans le chat au clic : action + cible (trim). */
export function customCommandPrompt(c: Pick<CustomCommand, 'action' | 'target'>): string {
  return `${c.action} ${c.target}`.trim();
}

/**
 * Ajoute une commande perso. Valide nom + action non vides. Retourne la commande
 * créée ou { error }. Cap MAX (FIFO si dépassé).
 */
export function addCustomCommand(input: {
  name: string;
  action: string;
  target?: string;
  emoji?: string;
}): { ok: true; command: CustomCommand } | { ok: false; error: string } {
  const name = (input.name || '').trim().slice(0, 40);
  const action = (input.action || '').trim().slice(0, 500);
  const target = (input.target || '').trim().slice(0, 200);
  const emoji = (input.emoji || '⭐').trim().slice(0, 4) || '⭐';
  if (!name) return { ok: false, error: 'Donne un nom à ta commande.' };
  if (!action) return { ok: false, error: 'Écris ce qu’Apex doit faire (l’action).' };

  const cmd: CustomCommand = {
    id: 'cc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name,
    emoji,
    action,
    target,
    ts: Date.now(),
  };
  try {
    const list = listCustomCommands();
    list.unshift(cmd);
    while (list.length > MAX) list.pop();
    localStorage.setItem(KEY, JSON.stringify(list));
    void pushCloud(list);
  } catch {
    return { ok: false, error: 'Stockage plein, impossible d’enregistrer.' };
  }
  return { ok: true, command: cmd };
}

/** Supprime une commande perso par id. */
export function removeCustomCommand(id: string): void {
  try {
    const list = listCustomCommands().filter((c) => c.id !== id);
    localStorage.setItem(KEY, JSON.stringify(list));
    void pushCloud(list);
  } catch {
    /* ignore */
  }
}

/* ── Sync Firebase per-uid (Kevin « retrouver mes commandes sur tous mes appareils »).
 * localStorage reste la couche locale/offline ; Firebase = backup cross-device.
 * Path dédié `custom_commands/<uid>` (cf. firebase.shouldSync v13.4.319). ───────── */

function currentUid(): string {
  try { return localStorage.getItem('apex_v13_uid') || 'anon'; } catch { return 'anon'; }
}

/** Push la liste vers Firebase (per-uid). Best-effort, fire-and-forget. */
async function pushCloud(list: CustomCommand[]): Promise<void> {
  try {
    const { firebase } = await import('../storage/firebase.js');
    await firebase.write('custom_commands/' + currentUid(), list);
  } catch {
    /* offline / Firebase indispo → localStorage reste la source de vérité */
  }
}

/**
 * Restaure les commandes perso depuis Firebase SI le local est vide (nouvel
 * appareil / réinstall). Retourne true si la liste locale a changé. Best-effort.
 */
export async function restoreCustomCommandsFromCloud(): Promise<boolean> {
  try {
    if (listCustomCommands().length > 0) return false; /* local déjà peuplé */
    const { firebase } = await import('../storage/firebase.js');
    const remote = await firebase.read<CustomCommand[]>('custom_commands/' + currentUid());
    if (Array.isArray(remote) && remote.length > 0) {
      localStorage.setItem(KEY, JSON.stringify(remote));
      return listCustomCommands().length > 0;
    }
  } catch {
    /* ignore */
  }
  return false;
}
