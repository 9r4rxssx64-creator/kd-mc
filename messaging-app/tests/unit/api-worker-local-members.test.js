/**
 * Tests api-worker.js — résolution des membres "local_+numéro" (v1.1.192).
 * Cause des "messages qui n'arrivent pas" : des conversations avaient pour
 * membre un id bidon local_+<numéro> au lieu du vrai compte.
 */
import { describe, it, expect } from 'vitest';
import { _canonicalId, _healLocalConvMembers } from '../../workers/api-worker.js';

function makeDB(state) {
  return {
    _s: state,
    prepare(sql) {
      return {
        _a: [],
        bind(...a) { this._a = a; return this; },
        async first() {
          if (sql.includes('SELECT merged_into FROM users')) {
            const u = state.users.find(x => x.id === this._a[0]);
            return u ? { merged_into: u.merged_into || null } : null;
          }
          if (sql.includes("status != 'deleted' AND phone LIKE")) {
            const tail = String(this._a[0] || '').replace(/%/g, '');
            const u = state.users.find(x => x.status !== 'deleted' && String(x.phone || '').replace(/\D/g, '').slice(-8) === tail.replace(/\D/g, '').slice(-8));
            return u ? { id: u.id } : null;
          }
          return null;
        },
        async all() {
          if (sql.includes("user_id LIKE 'local%'")) {
            const ids = [...new Set(state.members.filter(m => String(m.user_id).startsWith('local')).map(m => m.user_id))];
            return { results: ids.map(user_id => ({ user_id })) };
          }
          return { results: [] };
        },
        async run() {
          if (sql.includes('INSERT OR IGNORE INTO conversation_members') && sql.includes('SELECT conv_id')) {
            const [realId, localId] = this._a;
            for (const m of state.members.filter(x => x.user_id === localId)) {
              if (!state.members.some(x => x.conv_id === m.conv_id && x.user_id === realId)) {
                state.members.push({ conv_id: m.conv_id, user_id: realId, role: m.role });
              }
            }
            return { success: true };
          }
          if (sql.includes('UPDATE messages SET sender_id=?')) {
            const [to, from] = this._a;
            for (const m of state.messages) if (m.sender_id === from) m.sender_id = to;
            return { success: true };
          }
          if (sql.includes('DELETE FROM conversation_members WHERE user_id=?')) {
            const id = this._a[0];
            state.members = state.members.filter(m => m.user_id !== id);
            return { success: true };
          }
          return { success: true };
        },
      };
    },
  };
}

describe('local_+numéro → vrai compte', () => {
  it('_canonicalId résout local_+33600000010 vers le compte au même numéro', async () => {
    const db = makeDB({ users: [{ id: 'lolo', phone: '+33600000010', status: 'active', last_seen: 1 }], members: [], messages: [] });
    const id = await _canonicalId(db, 'local_+33600000010');
    expect(id).toBe('lolo');
  });

  it('_canonicalId suit aussi merged_into après résolution', async () => {
    const db = makeDB({ users: [
      { id: 'stub', phone: '+33600000010', status: 'active', merged_into: 'lolo', last_seen: 2 },
      { id: 'lolo', phone: '+33600000010b', status: 'active', merged_into: null },
    ], members: [], messages: [] });
    // local résout vers le 1er match (stub, vu le + récemment) puis suit merged_into → lolo
    const id = await _canonicalId(db, 'local_+33600000010');
    expect(id).toBe('lolo');
  });

  it('_healLocalConvMembers re-pointe le membre bidon + ses messages vers le vrai compte', async () => {
    const state = {
      users: [
        { id: 'kdmc_admin', phone: '+33600000001', status: 'active', last_seen: 9 },
        { id: 'lolo', phone: '+33600000010', status: 'active', last_seen: 8 },
      ],
      members: [
        { conv_id: 'c1', user_id: 'lolo', role: 'owner' },
        { conv_id: 'c1', user_id: 'local_+33600000001', role: 'member' }, // bidon = Kevin
      ],
      messages: [{ conv_id: 'c1', sender_id: 'local_+33600000001' }],
    };
    const fixed = await _healLocalConvMembers(makeDB(state));
    expect(fixed).toBe(1);
    // le vrai Kevin est désormais membre, le bidon est parti
    expect(state.members.some(m => m.conv_id === 'c1' && m.user_id === 'kdmc_admin')).toBe(true);
    expect(state.members.some(m => String(m.user_id).startsWith('local'))).toBe(false);
    // ses messages réattribués
    expect(state.messages[0].sender_id).toBe('kdmc_admin');
  });
});
