/**
 * Tests api-worker.js — _healOverpopulatedDms (v1.1.215)
 * Kevin « on est TOUJOURS 3 dans la conv avec Laurence » : un DM ne doit avoir
 * QUE 2 personnes. Si un DM a >2 membres (un correspondant a des comptes
 * doublon), on soigne aussi les PAIRS (autoHealPerson) → leurs doublons fusionnent
 * → cleanupGhostMembers recale ensuite member_count à 2.
 */
import { describe, it, expect } from 'vitest';
import { _healOverpopulatedDms } from '../../workers/api-worker.js';

function makeEnv({ dms }) {
  const calls = { othersConvIds: [], healCandidates: 0 };
  const DB = {
    prepare(sql) {
      const stmt = {
        _a: [],
        bind(...a) { this._a = a; return this; },
        async all() {
          // 1) DMs (surpeuplés ou non) de l'appelant
          if (sql.includes('AS conv_id') && sql.includes("c.type='dm'")) {
            return { results: dms };
          }
          // 2) autres membres d'un DM (non-admin, non supprimés)
          if (sql.includes('FROM conversation_members cm JOIN users u') && sql.includes('cm.user_id!=?')) {
            calls.othersConvIds.push(this._a[0]);
            return { results: [{ id: 'lau2', phone: '+33600000002', real_name: 'Laurence', pseudo: 'lolo', source: 'core_pair', last_seen: 0 }] };
          }
          // 3) autoHealPerson : candidats doublons → [] (no-op rapide, early return)
          if (sql.includes('FROM users') && sql.includes("status != 'deleted'") && sql.includes('phone LIKE')) {
            calls.healCandidates++;
            return { results: [] };
          }
          // 4) consolidateUserDms : DMs du keeper → []
          if (sql.includes('FROM conversations c JOIN conversation_members m')) {
            return { results: [] };
          }
          return { results: [] };
        },
        async first() { return null; },
        async run() { return { success: true }; },
      };
      return stmt;
    },
  };
  return { env: { APEX_CHAT_DB: DB }, calls };
}

describe('_healOverpopulatedDms (v1.1.215)', () => {
  it('soigne les pairs UNIQUEMENT des DM > 2 membres', async () => {
    const { env, calls } = makeEnv({ dms: [
      { conv_id: 'c1', n: 3 },  // surpeuplé → heal du pair
      { conv_id: 'c2', n: 2 },  // sain → ignoré
    ] });
    await _healOverpopulatedDms(env, 'kdmc_admin');
    expect(calls.othersConvIds).toEqual(['c1']);            // c2 (n=2) jamais touché
    expect(calls.healCandidates).toBeGreaterThanOrEqual(1); // autoHealPerson lancé sur le pair
  });

  it('aucun DM surpeuplé → no-op (aucun heal)', async () => {
    const { env, calls } = makeEnv({ dms: [{ conv_id: 'c2', n: 2 }] });
    await _healOverpopulatedDms(env, 'kdmc_admin');
    expect(calls.othersConvIds).toEqual([]);
    expect(calls.healCandidates).toBe(0);
  });

  it('DB en erreur → best-effort, pas de crash', async () => {
    const env = { APEX_CHAT_DB: { prepare() { return { bind() { return this; }, async all() { throw new Error('db down'); } }; } } };
    await expect(_healOverpopulatedDms(env, 'x')).resolves.toBeUndefined();
  });
});
