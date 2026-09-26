/**
 * BroadcastDO — re-export depuis ConversationDO.js (où la classe est définie).
 *
 * Permet au api-worker.js de faire `export { BroadcastDO } from './durable-objects/BroadcastDO.js'`
 * pour binding séparé wrangler.toml sans dupliquer la classe.
 */
export { BroadcastDO } from './ConversationDO.js';
