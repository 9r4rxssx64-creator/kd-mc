/**
 * APEX v13.3.74 — Admin PWA Capabilities (audit M6 issue #240).
 *
 * Vue admin : liste 8 APIs PWA + status courant + toggle ON/OFF + bouton "Activer".
 *
 * APIs gérées :
 * - Geolocation, Notifications, Bluetooth, NFC, USB, Serial, Wake Lock, Screen Capture
 *
 * Toggle feature.capabilities-<api> ON/OFF via feature-toggles.ts
 * Cliquer sur "Activer" déclenche pwaCapabilities.request(api) (UA prompt)
 *
 * Conformité brief :
 * - Tests via tests/unit/m6-capabilities-apis.test.ts
 * - Vue admin standalone réutilisable
 */

import { escapeHtml } from '../../../core/escape-html.js';
import { pwaCapabilities, type PwaApiId, type PwaCapabilityInfo } from '../../../services/core-svc/pwa-capabilities.js';
import { toast } from '../../../ui/toast.js';

function statusBadge(status: PwaCapabilityInfo['status']): string {
  switch (status) {
    case 'permission_granted':
      return '<span class="ax-gs-92">🟢 Accordée</span>';
    case 'permission_denied':
      return '<span style="color:#f44336">🔴 Refusée</span>';
    case 'permission_required':
      return '<span style="color:#ff9800">🟡 À demander</span>';
    case 'supported':
      return '<span class="ax-gs-92">🟢 Supportée</span>';
    case 'unsupported':
    default:
      return '<span class="ax-gs-25">⚫ Non supportée</span>';
  }
}

function isFeatureToggleEnabled(api: PwaApiId): boolean {
  try {
    const key = `apex_v13_feature_capability_${api}`;
    const v = localStorage.getItem(key);
    /* default ON, sauf explicit OFF */
    return v !== 'false' && v !== '0' && v !== 'off';
  } catch {
    return true;
  }
}

function setFeatureToggle(api: PwaApiId, enabled: boolean): void {
  try {
    localStorage.setItem(`apex_v13_feature_capability_${api}`, enabled ? 'true' : 'false');
  } catch {
    /* skip quota */
  }
}

async function renderRows(): Promise<string> {
  const all = await pwaCapabilities.getAllStatus();
  return all
    .map((cap) => {
      const toggle = isFeatureToggleEnabled(cap.id);
      return `
        <tr data-api="${cap.id}">
          <td>${escapeHtml(cap.label)}</td>
          <td class="ax-muted ax-gs-189">${escapeHtml(cap.description)}</td>
          <td>${statusBadge(cap.status)}</td>
          <td>
            <label class="ax-toggle">
              <input type="checkbox" data-toggle-api="${cap.id}" aria-label="Activer ou désactiver ${escapeHtml(cap.id)}" ${toggle ? 'checked' : ''}>
              <span class="ax-toggle-slider"></span>
            </label>
          </td>
          <td>
            ${cap.status === 'unsupported'
              ? '<span class="ax-muted">—</span>'
              : `<button class="ax-btn ax-btn-small" data-enable-api="${cap.id}" ${cap.status === 'permission_granted' ? 'disabled' : ''}>
                  ${cap.status === 'permission_granted' ? '✓ Activée' : 'Activer'}
                </button>`
            }
          </td>
        </tr>
      `;
    })
    .join('');
}

export async function renderCapabilitiesAdmin(rootEl: HTMLElement): Promise<void> {
  const stat = pwaCapabilities.countSupported();
  rootEl.innerHTML = `
    <div class="ax-admin-section">
      <h2>🔌 PWA Capabilities</h2>
      <p class="ax-muted">
        ${stat.supported}/${stat.total} APIs PWA supportées par ce navigateur.
        Active une par une : Apex demande la permission user via prompt natif UA.
      </p>
      <div class="ax-table-wrapper">
        <table class="ax-table">
          <thead>
            <tr>
              <th>API</th>
              <th>Description</th>
              <th>Statut</th>
              <th>Activée</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody id="ax-cap-tbody">
            ${await renderRows()}
          </tbody>
        </table>
      </div>
    </div>
  `;

  /* Listeners boutons "Activer" */
  rootEl.querySelectorAll<HTMLButtonElement>('[data-enable-api]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const api = btn.getAttribute('data-enable-api') as PwaApiId | null;
      if (!api) return;
      btn.disabled = true;
      btn.textContent = '...';
      const r = await pwaCapabilities.request(api);
      if (r.ok) {
        toast.show(`✅ ${api} activé`, 'success');
      } else {
        toast.show(`❌ ${api} refusé : ${r.error ?? r.status}`, 'error');
      }
      /* Refresh rows */
      const tbody = rootEl.querySelector('#ax-cap-tbody');
      if (tbody) tbody.innerHTML = await renderRows();
      /* Re-bind listeners */
      void renderCapabilitiesAdmin(rootEl);
    });
  });

  /* Listeners toggles ON/OFF feature */
  rootEl.querySelectorAll<HTMLInputElement>('[data-toggle-api]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const api = cb.getAttribute('data-toggle-api') as PwaApiId | null;
      if (!api) return;
      setFeatureToggle(api, cb.checked);
      toast.show(`${api} feature ${cb.checked ? 'ON' : 'OFF'}`, 'info');
    });
  });
}

export const capabilitiesAdmin = { render: renderCapabilitiesAdmin };

/* v13.4.246 — wire routeur : le routeur appelle `mod.render(rootEl)`.
   Alias exporté pour que la route `admin-capabilities` fonctionne. */
export const render = renderCapabilitiesAdmin;
