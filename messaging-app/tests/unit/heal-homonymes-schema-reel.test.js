// @vitest-environment node
/**
 * Revue 08.10.2026 — autoHealPerson fusionnait deux PERSONNES différentes au
 * même nom (l'une invitée, ou sans message) : la seconde perdait messages et
 * conversations, et son jeton menait au compte de l'autre. Prouvé ici sur le
 * vrai schéma : deux vrais numéros différents = jamais fusionnés ; un
 * brouillon sans numéro rejoint bien le vrai compte (la réparation utile reste).
 */
import { describe, it, expect } from 'vitest';
import { autoHealPerson } from '../../workers/api-worker.js';
import { ENV } from './api-worker-helpers.js';
import { d1Reel } from './_support/d1-sqlite.js';

function add(DB, id, pseudo, name, phone, source, last_seen) {
  DB.raw.prepare(`INSERT INTO users (id,pseudo,real_name,phone,phone_hash,created_at,identity_key_pub,pq_key_pub,prekey_signed,status,source,last_seen,is_admin)
    VALUES (?,?,?,?,?,1,'k','k','k','active',?,?,0)`).run(id, pseudo, name, phone, 'h_' + id, source, last_seen);
}

describe('autoHealPerson — homonymes', () => {
  it('deux « Marie Dupont » avec deux vrais numéros différents ne sont JAMAIS fusionnées', async () => {
    const DB = d1Reel();
    add(DB, 'u_marie_a', 'mariea', 'Marie Dupont', '+33611111111', 'apex-chat-direct', Date.now());
    add(DB, 'u_marie_b', 'marieb', 'Marie Dupont', '+41791111111', 'user-invitation', 0);
    DB.raw.prepare(`INSERT INTO messages (id,conv_id,sender_id,ciphertext,ts) VALUES ('m1','c1','u_marie_a','x',1)`).run();
    const env = ENV({ APEX_CHAT_DB: DB });
    const caller = DB.raw.prepare("SELECT * FROM users WHERE id='u_marie_a'").get();
    const r = await autoHealPerson(env, { ...caller });
    expect(r.merged).toBe(0);
    const b = DB.raw.prepare("SELECT status, merged_into FROM users WHERE id='u_marie_b'").get();
    expect(b.status).toBe('active');
    expect(b.merged_into).toBeNull();
  });

  it('un brouillon SANS numéro au même nom rejoint bien le vrai compte', async () => {
    const DB = d1Reel();
    add(DB, 'u_paul', 'paul', 'Paul Martin', '+33622222222', 'apex-chat-direct', Date.now());
    add(DB, 'stub_paul', 'paulm', 'Paul Martin', 'PENDING_PAUL', 'core_pair', 0);
    DB.raw.prepare(`INSERT INTO messages (id,conv_id,sender_id,ciphertext,ts) VALUES ('m1','c1','u_paul','x',1)`).run();
    const env = ENV({ APEX_CHAT_DB: DB });
    const caller = DB.raw.prepare("SELECT * FROM users WHERE id='u_paul'").get();
    const r = await autoHealPerson(env, { ...caller });
    expect(r.merged).toBe(1);
    expect(DB.raw.prepare("SELECT merged_into FROM users WHERE id='stub_paul'").get().merged_into).toBe('u_paul');
  });
});
