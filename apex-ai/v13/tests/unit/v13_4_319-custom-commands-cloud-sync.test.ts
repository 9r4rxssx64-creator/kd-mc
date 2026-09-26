/**
 * v13.4.319 — Sync Firebase des commandes perso (Kevin « retrouver sur tous mes
 * appareils »). Le réseau Firebase n'est pas joignable en test → on vérifie la
 * partie déterministe : le routage shouldSync du sous-arbre per-uid + la garde
 * « ne restaure que si local vide ». Câblé dans test:ci.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  addCustomCommand,
  restoreCustomCommandsFromCloud,
} from '../../services/admin/custom-commands.js';
import { firebase } from '../../services/storage/firebase.js';

describe('v13.4.319 — sync Firebase commandes perso', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('firebase.shouldSync autorise le sous-arbre per-uid custom_commands/<uid>', () => {
    expect(firebase.shouldSync('custom_commands/U11804')).toBe(true);
    expect(firebase.shouldSync('custom_commands/kdmc_admin')).toBe(true);
    /* une clé hors whitelist reste refusée (non-régression). */
    expect(firebase.shouldSync('un_truc_random')).toBe(false);
  });

  it('restore ne touche PAS le local s’il est déjà peuplé (garde)', async () => {
    addCustomCommand({ name: 'Local', action: 'fais local', target: 'ici' });
    const changed = await restoreCustomCommandsFromCloud();
    expect(changed).toBe(false); /* local non vide → pas de restore, pas d'écrasement */
  });
});
