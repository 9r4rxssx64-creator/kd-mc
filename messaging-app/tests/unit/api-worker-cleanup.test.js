/**
 * Tests api-worker.js — cleanupEmptyConversations (v1.1.195)
 * Supprime les DM VIDES (0 message) archivés ou orphelins ; ne touche JAMAIS
 * une conversation contenant le moindre message, ni un DM actif à 2 membres.
 */
import { describe, it, expect } from 'vitest';
import { cleanupEmptyConversations } from '../../workers/api-worker.js';

function makeDB(state) {
  return {
    prepare(sql) {
      return {
        _a: [],
        bind(...a) { this._a = a; return this; },
        async all() {
          if (sql.includes("c.type='dm'")) {
            return {
              results: state.convs.map(c => ({
                id: c.id,
                msgs: state.messages.filter(m => m.conv_id === c.id).length,
                mem: state.members.filter(m => m.conv_id === c.id).length,
                archived_at: c.archived_at || null,
              })),
            };
          }
          return { results: [] };
        },
        async run() {
          if (sql.includes('DELETE FROM conversation_members WHERE conv_id=?')) {
            state.members = state.members.filter(m => m.conv_id !== this._a[0]);
          } else if (sql.includes('DELETE FROM conversations WHERE id=?')) {
            state.convs = state.convs.filter(c => c.id !== this._a[0]);
          }
          return { success: true };
        },
      };
    },
  };
}

describe('cleanupEmptyConversations (v1.1.195)', () => {
  it('supprime les DM vides archivés et orphelins, garde le reste', async () => {
    const state = {
      convs: [
        { id: 'good', archived_at: null },        // actif, 1 message → garder
        { id: 'arch_empty', archived_at: 123 },    // archivé, 0 msg → supprimer
        { id: 'orphan', archived_at: null },        // actif mais 1 membre, 0 msg → supprimer
        { id: 'active2', archived_at: null },       // actif, 2 membres, 0 msg → garder
        { id: 'arch_with_msg', archived_at: 99 },   // archivé MAIS 1 msg → garder
      ],
      members: [
        { conv_id: 'good', user_id: 'a' }, { conv_id: 'good', user_id: 'b' },
        { conv_id: 'arch_empty', user_id: 'a' },
        { conv_id: 'orphan', user_id: 'a' },
        { conv_id: 'active2', user_id: 'a' }, { conv_id: 'active2', user_id: 'b' },
        { conv_id: 'arch_with_msg', user_id: 'a' },
      ],
      messages: [
        { conv_id: 'good' },
        { conv_id: 'arch_with_msg' },
      ],
    };
    const removed = await cleanupEmptyConversations(makeDB(state));
    expect(removed).toBe(2);
    const ids = state.convs.map(c => c.id).sort();
    expect(ids).toEqual(['active2', 'arch_with_msg', 'good']);
    // les membres des convs supprimées sont partis aussi
    expect(state.members.some(m => m.conv_id === 'arch_empty')).toBe(false);
    expect(state.members.some(m => m.conv_id === 'orphan')).toBe(false);
  });

  it('ne supprime rien quand tout contient des messages', async () => {
    const state = {
      convs: [{ id: 'x', archived_at: 1 }],
      members: [{ conv_id: 'x', user_id: 'a' }],
      messages: [{ conv_id: 'x' }],
    };
    const removed = await cleanupEmptyConversations(makeDB(state));
    expect(removed).toBe(0);
    expect(state.convs.length).toBe(1);
  });
});
