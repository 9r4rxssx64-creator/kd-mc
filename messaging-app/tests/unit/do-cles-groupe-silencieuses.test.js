// Chiffrement de bout en bout des groupes (v1.1.296) : les messages de distribution / demande de clés
// (mime application/x-apex-grpkey, E2EGK1 / E2EGR1) sont relayés et gardés, mais ce ne sont pas des
// messages lus par un humain → ni notification push « 💬 Nouveau message », ni remontée de la conversation.
import { describe, it, expect, vi } from 'vitest';
import { ConversationDO } from '../../workers/durable-objects/ConversationDO.js';

const GRPKEY = 'application/x-apex-grpkey';

function makeDO() {
  const log = [];
  const stmt = (sql) => ({
    bind: (...args) => ({
      sql, args,
      run: async () => { log.push({ sql, args }); return { success: true, meta: { changes: 1 } }; },
      all: async () => { log.push({ sql, args }); return { results: sql.includes('conversation_members') ? [{ user_id: 'alice' }, { user_id: 'bob' }] : [] }; },
      first: async () => null,
    }),
  });
  const DB = {
    prepare: vi.fn(stmt),
    batch: vi.fn(async (stmts) => { for (const s of stmts) log.push({ sql: s.sql, args: s.args }); return stmts.map(() => ({ success: true, meta: { changes: 1 } })); }),
  };
  const state = {
    id: { toString: () => 'do-id' },
    storage: { get: vi.fn(async () => undefined), put: vi.fn(async () => {}), setAlarm: vi.fn(async () => {}) },
    blockConcurrencyWhile: vi.fn(async (fn) => fn()),
  };
  const _do = new ConversationDO(state, { APEX_CHAT_DB: DB });
  return { _do, DB, log };
}

describe('clés de groupe : pas de push, pas de remontée de conversation', () => {
  it('notifyOfflineMembers : message de clés → aucune requête (donc aucun push)', async () => {
    const { _do, DB, log } = makeDO();
    await _do.notifyOfflineMembers({ id: 'k1', conv_id: 'g1', sender_id: 'alice', mime: GRPKEY });
    expect(DB.prepare.mock.calls.some(([sql]) => sql.includes('conversation_members'))).toBe(false);
    expect(log).toEqual([]);
  });

  it('notifyOfflineMembers : message normal → les membres hors ligne sont bien cherchés (témoin)', async () => {
    const { _do, log } = makeDO();
    await _do.notifyOfflineMembers({ id: 'm1', conv_id: 'g1', sender_id: 'alice', mime: 'text/plain' });
    expect(log.some((l) => l.sql.includes('conversation_members'))).toBe(true);
  });

  it('flush : last_msg_ts suit le dernier message VISIBLE, pas la distribution de clés qui le suit', async () => {
    const { _do, log } = makeDO();
    _do.pendingMessages.push(
      { id: 'm1', conv_id: 'g1', sender_id: 'alice', ciphertext: 'E2EG1:x', mime: 'text/plain', ts: 100 },
      { id: 'k1', conv_id: 'g1', sender_id: 'alice', ciphertext: 'E2EGK1:y', mime: GRPKEY, ts: 200 },
    );
    await _do.flushToD1();
    const upd = log.filter((l) => l.sql.startsWith('UPDATE conversations SET last_msg_id'));
    expect(upd).toHaveLength(1);
    expect(upd[0].args).toEqual(['m1', 100, 'g1']);
    expect(log.filter((l) => l.sql.includes('INSERT INTO messages'))).toHaveLength(2);   // les clés sont bien gardées
  });

  it('flush : uniquement des clés → messages gardés, conversation PAS remontée', async () => {
    const { _do, log } = makeDO();
    _do.pendingMessages.push({ id: 'k2', conv_id: 'g1', sender_id: 'bob', ciphertext: 'E2EGR1:z', mime: GRPKEY, ts: 300 });
    await _do.flushToD1();
    expect(log.filter((l) => l.sql.includes('INSERT INTO messages'))).toHaveLength(1);
    expect(log.some((l) => l.sql.startsWith('UPDATE conversations'))).toBe(false);
  });
});
