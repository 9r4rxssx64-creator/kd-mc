/**
 * Tests api-worker.js — consolidateKevinIntoAdmin (v1.1.194)
 * Kevin se connecte avec son VRAI numéro : on le rattache TOUJOURS au compte
 * admin historique `kdmc_admin` (qui détient les conversations), on lui donne
 * son vrai numéro (→ résout les stubs local_+<numéro>) et on fusionne le compte
 * non-admin créé par erreur. Idempotent, non destructif.
 */
import { describe, it, expect } from 'vitest';
import { consolidateKevinIntoAdmin } from '../../workers/api-worker.js';

const PHONE = '+33600000001';

function makeEnv(state) {
  const DB = {
    prepare(sql) {
      return {
        _a: [],
        bind(...a) { this._a = a; return this; },
        async first() {
          if (sql.includes("WHERE id='kdmc_admin'")) {
            return state.users.find(u => u.id === 'kdmc_admin') || null;
          }
          if (sql.includes('WHERE phone=? AND id!=')) {
            return state.users.find(u => u.id !== 'kdmc_admin' && u.phone === this._a[0]) || null;
          }
          if (sql.includes('SELECT merged_into FROM users')) {
            const u = state.users.find(x => x.id === this._a[0]);
            return u ? { merged_into: u.merged_into || null } : null;
          }
          if (sql.includes("status != 'deleted' AND phone LIKE")) {
            const tail = String(this._a[0] || '').replace(/%/g, '').replace(/\D/g, '').slice(-8);
            const u = state.users.find(x => x.status !== 'deleted' &&
              String(x.phone || '').replace(/\D/g, '').slice(-8) === tail);
            return u ? { id: u.id } : null;
          }
          if (sql.includes('SELECT MAX(ts)')) return { t: 1 };
          if (sql.includes('SELECT COUNT(*) AS c FROM conversation_members')) {
            const c = new Set(state.members.filter(m => m.conv_id === this._a[0]).map(m => m.user_id)).size;
            return { c };
          }
          return null;
        },
        async all() {
          if (sql.includes("user_id LIKE 'local%'")) {
            const ids = [...new Set(state.members.filter(m => String(m.user_id).startsWith('local')).map(m => m.user_id))];
            return { results: ids.map(user_id => ({ user_id })) };
          }
          if (sql.includes("c.type='dm'")) {
            // DMs du user (this._a[0])
            const uid = this._a[0];
            const convIds = [...new Set(state.members.filter(m => m.user_id === uid).map(m => m.conv_id))];
            return { results: convIds.map(id => ({ id, archived_at: null, created_at: 1, msgs: state.messages.filter(m => m.conv_id === id).length })) };
          }
          if (sql.includes('SELECT user_id FROM conversation_members WHERE conv_id=?')) {
            return { results: state.members.filter(m => m.conv_id === this._a[0]).map(m => ({ user_id: m.user_id })) };
          }
          return { results: [] };
        },
        async run() {
          if (sql.includes("UPDATE users SET phone=?, phone_hash=NULL, status='deleted'")) {
            const [newPhone, , id] = this._a;
            const u = state.users.find(x => x.id === id);
            if (u) { u.phone = newPhone; u.status = 'deleted'; u.merged_into = 'kdmc_admin'; }
          } else if (sql.includes("UPDATE users SET phone=?, phone_hash=?, is_admin=1")) {
            const [newPhone] = this._a;
            const a = state.users.find(x => x.id === 'kdmc_admin');
            if (a) { a.phone = newPhone; a.is_admin = 1; a.status = 'active'; }
          } else if (sql.includes('UPDATE messages SET sender_id=? WHERE sender_id=?')) {
            const [to, from] = this._a;
            for (const m of state.messages) if (m.sender_id === from) m.sender_id = to;
          } else if (sql.includes("SELECT conv_id, 'kdmc_admin'")) {
            // consolidateKevinIntoAdmin : copie les memberships du doublon → kdmc_admin
            const fromId = this._a[0];
            for (const m of state.members.filter(x => x.user_id === fromId)) {
              if (!state.members.some(x => x.conv_id === m.conv_id && x.user_id === 'kdmc_admin')) {
                state.members.push({ conv_id: m.conv_id, user_id: 'kdmc_admin', role: m.role });
              }
            }
          } else if (sql.includes('INSERT OR IGNORE INTO conversation_members') && sql.includes('SELECT conv_id, ?')) {
            // _healLocalConvMembers : (realId, localId)
            const [realId, fromId] = this._a;
            for (const m of state.members.filter(x => x.user_id === fromId)) {
              if (!state.members.some(x => x.conv_id === m.conv_id && x.user_id === realId)) {
                state.members.push({ conv_id: m.conv_id, user_id: realId, role: m.role });
              }
            }
          } else if (sql.includes('DELETE FROM conversation_members WHERE user_id=?')) {
            const id = this._a[0];
            state.members = state.members.filter(m => m.user_id !== id);
          } else if (sql.includes('UPDATE messages SET conv_id=?')) {
            const [to, from] = this._a;
            for (const m of state.messages) if (m.conv_id === from) m.conv_id = to;
          } else if (sql.includes('UPDATE conversations SET archived_at=?')) {
            // no-op pour ce mock
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
    },
  };
  return { APEX_CHAT_DB: DB };
}

describe('consolidateKevinIntoAdmin (v1.1.194)', () => {
  it('donne le vrai numéro à kdmc_admin et résout le stub local_+numéro de Kevin', async () => {
    const state = {
      users: [
        { id: 'kdmc_admin', phone: 'PLACEHOLDER_EVIN', is_admin: 1, status: 'active' },
        { id: 'lolo', phone: '+33600000010', is_admin: 0, status: 'active' },
      ],
      members: [
        { conv_id: 'c1', user_id: 'lolo', role: 'owner' },
        { conv_id: 'c1', user_id: 'local_' + PHONE, role: 'member' }, // Kevin stub
      ],
      messages: [{ conv_id: 'c1', sender_id: 'local_' + PHONE }],
    };
    const env = makeEnv(state);
    const admin = await consolidateKevinIntoAdmin(env, PHONE, 'hash', 1000);
    // kdmc_admin porte désormais le vrai numéro
    expect(admin.phone).toBe(PHONE);
    // le stub a été re-pointé vers kdmc_admin → Kevin est membre, plus aucun local
    expect(state.members.some(m => m.conv_id === 'c1' && m.user_id === 'kdmc_admin')).toBe(true);
    expect(state.members.some(m => String(m.user_id).startsWith('local'))).toBe(false);
    expect(state.messages[0].sender_id).toBe('kdmc_admin');
  });

  it('fusionne le compte non-admin créé par erreur (même numéro) dans kdmc_admin', async () => {
    const state = {
      users: [
        { id: 'kdmc_admin', phone: 'PLACEHOLDER_EVIN', is_admin: 1, status: 'active' },
        { id: 'dup_kevin', phone: PHONE, is_admin: 0, status: 'active' }, // créé par erreur
      ],
      members: [{ conv_id: 'cx', user_id: 'dup_kevin', role: 'owner' }],
      messages: [{ conv_id: 'cx', sender_id: 'dup_kevin' }],
    };
    const env = makeEnv(state);
    const admin = await consolidateKevinIntoAdmin(env, PHONE, 'hash', 2000);
    expect(admin.phone).toBe(PHONE);
    // doublon soft-deleted + merged_into kdmc_admin, numéro libéré
    const dup = state.users.find(u => u.id === 'dup_kevin');
    expect(dup.status).toBe('deleted');
    expect(dup.merged_into).toBe('kdmc_admin');
    expect(dup.phone).not.toBe(PHONE);
    // messages + membership ré-attribués
    expect(state.messages[0].sender_id).toBe('kdmc_admin');
    expect(state.members.some(m => m.conv_id === 'cx' && m.user_id === 'kdmc_admin')).toBe(true);
  });

  it('ne fait rien si kdmc_admin est absent (zéro lockout)', async () => {
    const env = makeEnv({ users: [{ id: 'lolo', phone: PHONE, is_admin: 0 }], members: [], messages: [] });
    const r = await consolidateKevinIntoAdmin(env, PHONE, 'hash', 3000);
    expect(r).toBeNull();
  });
});
