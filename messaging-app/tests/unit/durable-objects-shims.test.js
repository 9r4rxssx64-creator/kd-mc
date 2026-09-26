/*
 * 10/09/2026 — BroadcastDO.js et PresenceDO.js sont des SHIMS : un `export { X } from
 * './ConversationDO.js'` chacun. api-worker.js les réexporte (lignes ~6043-6045) et
 * wrangler.toml lie les trois classes par NOM. Les tests unitaires importaient les classes
 * depuis ConversationDO.js directement → les deux shims restaient à 0 % de couverture sous
 * la mesure AST de vitest 5, alors qu'ils sont sur le chemin réel de déploiement.
 *
 * Ce test charge les shims eux-mêmes et prouve le contrat : la classe exportée par le shim
 * EST la classe définie dans ConversationDO.js (même référence), et api-worker expose bien
 * les trois classes attendues par wrangler.toml. Un shim qui casserait (typo, mauvais
 * chemin, export renommé) ferait échouer le déploiement des Durable Objects — ce test
 * l'attrape avant.
 */
import { describe, it, expect } from 'vitest';
import { BroadcastDO as ShimBroadcast } from '../../workers/durable-objects/BroadcastDO.js';
import { PresenceDO as ShimPresence } from '../../workers/durable-objects/PresenceDO.js';
import { BroadcastDO, PresenceDO, ConversationDO } from '../../workers/durable-objects/ConversationDO.js';

describe('Durable Objects — shims BroadcastDO.js / PresenceDO.js', () => {
  it('BroadcastDO.js réexporte exactement la classe de ConversationDO.js', () => {
    expect(ShimBroadcast).toBe(BroadcastDO);
    expect(typeof ShimBroadcast).toBe('function');
    expect(ShimBroadcast.name).toBe('BroadcastDO');
  });

  it('PresenceDO.js réexporte exactement la classe de ConversationDO.js', () => {
    expect(ShimPresence).toBe(PresenceDO);
    expect(typeof ShimPresence).toBe('function');
    expect(ShimPresence.name).toBe('PresenceDO');
  });

  it('les trois classes liées par wrangler.toml sont distinctes et nommées', () => {
    const names = [ConversationDO, BroadcastDO, PresenceDO].map(c => c.name);
    expect(names).toEqual(['ConversationDO', 'BroadcastDO', 'PresenceDO']);
    expect(new Set([ConversationDO, BroadcastDO, PresenceDO]).size).toBe(3);
  });
});
