/**
 * iPhone : un message pas encore accusé par le serveur n'affiche JAMAIS « ✓✓ livré »
 * (audit 16.10.2026 : le défaut était « livré » — un message écrit hors ligne mentait).
 */
import { describe, it, expect } from 'vitest';
import { readIndex, extractDef } from './client-extract.js';

function charger(outbox) {
  const html = readIndex();
  const src = [extractDef(html, 'K._outboxIdSet = function(){'), extractDef(html, 'K._isMsgRead = function(convId, msgId, allMsgs){')].join('\n');
  const K = { user: { id: 'moi' }, _readState: {} };
  // eslint-disable-next-line no-new-func
  new Function('K', 'lg', src)(K, (k, d) => (k === 'outbox' ? outbox : d));
  return K;
}
const msgs = [{ id: 'a' }, { id: 'b' }];

describe('statut d\'envoi', () => {
  it('un message dans l\'outbox est « sending », pas « delivered »', () => {
    expect(charger([{ id: 'a' }])._isMsgRead('c', 'a', msgs)).toBe('sending');
  });
  it('un message refusé est « failed »', () => {
    expect(charger([])._isMsgRead('c', 'b', [{ id: 'a' }, { id: 'b', failed: true }])).toBe('failed');
  });
  it('un message accusé (hors outbox) garde l\'affichage habituel', () => {
    expect(charger([])._isMsgRead('c', 'a', msgs)).toBe('delivered');
  });
  it('le dessin du statut distingue envoi et échec ; le rejet marque le message', () => {
    const html = readIndex();
    expect(html).toContain("readStatus === 'sending' ? '🕓'");
    expect(html).toContain("readStatus === 'failed' ? '⚠️'");
    expect(html).toContain('_m.failed = true');
  });
});
