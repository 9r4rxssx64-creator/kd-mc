/**
 * 08.10.2026 — l'interrupteur « chiffrement de bout en bout obligatoire » (e2e_strict)
 * refusait TOUT message sans préfixe E2E. Or un groupe n'a pas de chiffrement de bout en
 * bout (l'app le dit depuis v1.1.294) : activer l'interrupteur coupait tous les groupes.
 * La règle ne vaut désormais que pour les conversations à deux (dm).
 */
import { describe, it, expect, vi } from 'vitest';
import { ConversationDO } from '../../workers/durable-objects/ConversationDO.js';

class WS { constructor() { this.sent = []; } send(m) { this.sent.push(JSON.parse(m)); } close() {} }

function makeDo({ strict = true, type = 'dm', typeThrows = false } = {}) {
  const state = { id: { toString: () => 'x' }, storage: { get: async () => 0, put: async () => {}, setAlarm: async () => {} }, blockConcurrencyWhile: async (fn) => { await fn(); } };
  const dbm = {
    prepare: (sql) => ({
      bind() { return this; },
      first: async () => {
        if (sql.includes('SELECT type FROM conversations')) { if (typeThrows) throw new Error('D1 KO'); return { type }; }
        return null;
      },
      run: async () => ({ success: true, meta: { changes: 1 } }),
      all: async () => ({ results: strict ? [{ key: 'FEATURE_E2E_STRICT', value: 'true' }] : [] }),
    }),
    batch: async () => ({}),
  };
  return new ConversationDO(state, { JWT_SIGN_KEY: 's', APEX_CHAT_DB: dbm });
}
const sess = () => ({ userId: 'u1', deviceId: 'd', convId: 'c', lastSeq: 0, connectedAt: Date.now(), authAt: Date.now(), lastMemberCheck: Date.now(), messageCount: 0, lastReset: Date.now() });

async function send(d, msg) {
  vi.spyOn(d, 'notifyOfflineMembers').mockResolvedValue();
  const ws = new WS(); d.sessions.set(ws, sess());
  await d.handleMessage(ws, msg);
  return ws.sent.pop();
}

describe('e2e_strict : conversations à deux seulement', () => {
  it('groupe + interrupteur ON : un message en clair PASSE', async () => {
    const d = makeDo({ type: 'group' }); await new Promise((r) => setTimeout(r, 5));
    expect((await send(d, { type: 'message', ciphertext: 'bonjour le groupe' })).type).toBe('ack');
  });
  it('dm + interrupteur ON : un message en clair est REFUSÉ', async () => {
    const d = makeDo({ type: 'dm' }); await new Promise((r) => setTimeout(r, 5));
    expect(await send(d, { type: 'message', ciphertext: 'en clair' })).toMatchObject({ type: 'error', code: 'e2e_required' });
  });
  it('type illisible (base en panne) : la règle s\'applique (sûr)', async () => {
    const d = makeDo({ typeThrows: true }); await new Promise((r) => setTimeout(r, 5));
    expect(await send(d, { type: 'message', ciphertext: 'en clair' })).toMatchObject({ code: 'e2e_required' });
  });
  it('groupe : la modification en clair passe aussi', async () => {
    const d = makeDo({ type: 'group' }); await new Promise((r) => setTimeout(r, 5));
    vi.spyOn(d, 'notifyOfflineMembers').mockResolvedValue();
    const ws = new WS(); d.sessions.set(ws, sess());
    await d.handleMessage(ws, { type: 'edit_message', message_id: 'm1', new_text: 'corrigé' });
    expect(ws.sent.some((f) => f.code === 'e2e_required')).toBe(false);
  });
});
