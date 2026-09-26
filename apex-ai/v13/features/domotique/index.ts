/**
 * APEX v13 — Feature Domotique (Home Assistant + objets connectés).
 * Stub Sprint 2 — sera enrichi avec WebBLE + NFC + IR/RF universal remote.
 */

import { safeSetHTML } from '../../core/html-safe.js';
import { logger } from '../../core/logger.js';
import { store } from '../../core/store.js';
import { guardFeatureEnabled } from '../../services/auth/feature-guard.js';

export function render(rootEl: HTMLElement): void {
  /* Wire admin feature toggle (Kevin règle 2026-05-04 — ON/OFF tout). */
  const uid = (store.get('user') as { id?: string } | null)?.id ?? 'anon';
  if (!guardFeatureEnabled('module.domotique', rootEl, uid)) return;
  safeSetHTML(rootEl, `
    <div class="ax-page ax-gs-368">
      <h1 class="ax-gs-369">🏠 Domotique</h1>
      <p class="ax-gs-226">Pilote tes objets connectés depuis Apex.</p>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px">
        <div class="ax-gs-43">
          <div class="ax-gs-28">💡</div>
          <strong class="ax-gs-229">Lumières</strong>
          <button class="ax-btn ax-btn-sm ax-gs-379">Configurer</button>
        </div>
        <div class="ax-gs-43">
          <div class="ax-gs-28">🌡️</div>
          <strong class="ax-gs-229">Thermostat</strong>
          <button class="ax-btn ax-btn-sm ax-gs-379">Configurer</button>
        </div>
        <div class="ax-gs-43">
          <div class="ax-gs-28">📺</div>
          <strong class="ax-gs-229">TV</strong>
          <button class="ax-btn ax-btn-sm ax-gs-379">Télécommande</button>
        </div>
        <div class="ax-gs-43">
          <div class="ax-gs-28">🔒</div>
          <strong class="ax-gs-229">Sécurité</strong>
          <button class="ax-btn ax-btn-sm ax-gs-379">Caméras</button>
        </div>
      </div>

      <p class="ax-gs-212"><a href="#chat" class="ax-gs-198">← Retour chat</a></p>
    </div>
  `);
  logger.info('feature-domotique', 'rendered');
}
