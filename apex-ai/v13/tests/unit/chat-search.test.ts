/**
 * Tests chat-search v13.4.174 (refactor minutieux extraction depuis chat/index.ts).
 *
 * Vérifie zéro régression :
 * - searchConversation filtre case-insensitive
 * - snippet tronqué à 200 chars + ellipse
 * - format `**N. 👤 Toi** : extrait` ou `**N. 🤖 Apex** : extrait`
 * - buildSearchResultMessage gère 0 / N résultats
 */
import { describe, expect, it } from 'vitest';

import {
  type SearchableMessage,
  buildSearchResultMessage,
  searchConversation,
} from '../../features/chat/chat-search.js';

describe('chat-search searchConversation (v13.4.174)', () => {
  it('keyword vide → tableau vide', () => {
    const msgs: SearchableMessage[] = [{ role: 'user', text: 'hello' }];
    expect(searchConversation(msgs, '')).toEqual([]);
  });

  it('conversation vide → tableau vide', () => {
    expect(searchConversation([], 'hello')).toEqual([]);
  });

  it('aucune correspondance → tableau vide', () => {
    const msgs: SearchableMessage[] = [
      { role: 'user', text: 'bonjour Apex' },
      { role: 'assistant', text: 'salut Kevin' },
    ];
    expect(searchConversation(msgs, 'xyz')).toEqual([]);
  });

  it('match case-insensitive', () => {
    const msgs: SearchableMessage[] = [
      { role: 'user', text: 'HELLO World' },
      { role: 'assistant', text: 'goodbye' },
    ];
    const res = searchConversation(msgs, 'hello');
    expect(res).toHaveLength(1);
    expect(res[0]).toContain('👤 Toi');
    expect(res[0]).toContain('HELLO World');
  });

  it('format user → 👤 Toi', () => {
    const msgs: SearchableMessage[] = [{ role: 'user', text: 'bonjour' }];
    const res = searchConversation(msgs, 'bonjour');
    expect(res[0]).toMatch(/\*\*1\. 👤 Toi\*\*/);
  });

  it('format assistant → 🤖 Apex', () => {
    const msgs: SearchableMessage[] = [{ role: 'assistant', text: 'salut' }];
    const res = searchConversation(msgs, 'salut');
    expect(res[0]).toMatch(/\*\*1\. 🤖 Apex\*\*/);
  });

  it('snippet > 200 chars → tronqué + ellipse', () => {
    const long = 'a'.repeat(250);
    const msgs: SearchableMessage[] = [{ role: 'user', text: long }];
    const res = searchConversation(msgs, 'a');
    expect(res[0]).toContain('…');
    /* Compte les "a" pour vérifier qu'ils sont 200 max */
    const aCount = (res[0]!.match(/a/g) ?? []).length;
    expect(aCount).toBe(200);
  });

  it('snippet ≤ 200 chars → pas d ellipse', () => {
    const msgs: SearchableMessage[] = [{ role: 'user', text: 'court message' }];
    const res = searchConversation(msgs, 'court');
    expect(res[0]).not.toContain('…');
  });

  it('numérotation continue à travers les matches', () => {
    const msgs: SearchableMessage[] = [
      { role: 'user', text: 'q1 hello' },
      { role: 'assistant', text: 'r1 hello' },
      { role: 'user', text: 'q2 sans match' },
      { role: 'assistant', text: 'r2 hello' },
    ];
    const res = searchConversation(msgs, 'hello');
    expect(res).toHaveLength(3);
    expect(res[0]).toContain('**1.');
    expect(res[1]).toContain('**2.');
    expect(res[2]).toContain('**3.');
  });
});

describe('chat-search buildSearchResultMessage (v13.4.174)', () => {
  it('0 matches → message "Aucun résultat"', () => {
    expect(buildSearchResultMessage([], 'foo')).toBe('🔎 Aucun résultat pour "foo"');
  });

  it('N matches → header + liste séparée par \\n\\n', () => {
    const matches = ['**1. 👤 Toi** : a', '**2. 🤖 Apex** : b'];
    const out = buildSearchResultMessage(matches, 'test');
    expect(out).toContain('🔎 **2 résultat(s) pour "test"**');
    expect(out).toContain('**1. 👤 Toi** : a\n\n**2. 🤖 Apex** : b');
  });

  it('keyword inclus tel quel (quotes preserved)', () => {
    const out = buildSearchResultMessage([], 'mon "test"');
    expect(out).toContain('"mon "test""');
  });
});
