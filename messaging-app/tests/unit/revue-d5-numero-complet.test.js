// @vitest-environment node
/**
 * Revue 08.10.2026 — D5 (P1) : _canonicalId résolvait un membre « local_<numéro> »
 * par `phone LIKE '%<8 derniers chiffres>'` : deux personnes de pays différents
 * (+33 6 12 34 56 78 et +221 12 34 56 78) se confondaient, et _healLocalConvMembers
 * réécrivait sender_id de leurs messages sur la mauvaise personne.
 *
 * Prouvé sur le VRAI schéma : résolution sur le numéro E.164 complet normalisé.
 * Sabotage : remettre le LIKE sur 8 chiffres → le Français (vu plus récemment) est
 * choisi à la place du Sénégalais → rouge.
 */
import { describe, it, expect } from 'vitest';
import { _canonicalId, _healLocalConvMembers } from '../../workers/api-worker.js';
import { d1Reel } from './_support/d1-sqlite.js';

function seed(db, id, phone, lastSeen) {
  db.raw.prepare(`INSERT INTO users (id,pseudo,real_name,phone,phone_hash,created_at,last_seen,identity_key_pub,pq_key_pub,prekey_signed,status)
    VALUES (?,?,?,?,?,1,?,'k','k','k','active')`).run(id, 'p_' + id, 'Nom ' + id, phone, 'h_' + id, lastSeen);
}

function monde() {
  const DB = d1Reel();
  seed(DB, 'u_fr', '+33612345678', 9);   // vu le plus récemment
  seed(DB, 'u_sn', '+22112345678', 1);   // mêmes 8 derniers chiffres, autre pays
  return DB;
}

describe('D5 — local_<numéro> résolu sur le numéro E.164 complet', () => {
  it('deux numéros aux mêmes 8 derniers chiffres → chacun vers le bon compte', async () => {
    const DB = monde();
    expect(await _canonicalId(DB, 'local_+22112345678')).toBe('u_sn');
    expect(await _canonicalId(DB, 'local_+33612345678')).toBe('u_fr');
    expect(await _canonicalId(DB, 'local_0612345678')).toBe('u_fr');   // national FR normalisé
    expect(await _canonicalId(DB, 'local_12345678')).toBe('local_12345678'); // pas d\'indicatif → non résolu
  });

  it('_healLocalConvMembers re-pointe le membre et ses messages vers la BONNE personne', async () => {
    const DB = monde();
    DB.raw.prepare("INSERT INTO conversation_members (conv_id,user_id,role,joined_at) VALUES ('c1','u_fr','owner',1)").run();
    DB.raw.prepare("INSERT INTO conversation_members (conv_id,user_id,role,joined_at) VALUES ('c1','local_+22112345678','member',1)").run();
    DB.raw.prepare("INSERT INTO messages (id,conv_id,sender_id,ciphertext,ts) VALUES ('m1','c1','local_+22112345678','x',1)").run();
    expect(await _healLocalConvMembers(DB)).toBe(1);
    expect(DB.raw.prepare("SELECT sender_id FROM messages WHERE id='m1'").get().sender_id).toBe('u_sn');
    const membres = DB.raw.prepare("SELECT user_id FROM conversation_members WHERE conv_id='c1' ORDER BY user_id").all().map((r) => r.user_id);
    expect(membres).toEqual(['u_fr', 'u_sn']);
  });
});
