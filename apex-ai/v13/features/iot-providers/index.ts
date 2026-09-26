/**
 * APEX v13.3.52 — Vue admin IoT Providers (?view=iot-providers).
 *
 * Demande Kevin (2026-05-07 23h40) :
 *   "Je veux qu'il commande aussi dans mes comptes eWeLink et SmartLife"
 *   "Et qu'il puisse s'installer en autonomie d'autres plus tard"
 *
 * Cette vue (admin only — règle Laurence isolation) permet :
 * 1. Status connexion de chaque provider (🟢/🔴/⚪) + nb devices + bouton test
 * 2. Liste providers disponibles (eWeLink, Tuya, Hue, Sonos, HA, Broadlink) + bouton "Installer"
 * 3. Modal install : form login (champs dynamiques selon provider)
 * 4. Devices détectés cross-provider (tableau unique)
 * 5. Section "Custom provider" : Apex peut auto-add via tool install_iot_provider
 *
 * Pattern :
 * - Aucun secret jamais exposé en HTML (tokens chiffrés via vault déjà)
 * - Bouton 1-clic "Tester" + "Installer" + "Devices"
 * - Admin only (règle Kevin "Laurence isolation totale")
 */

import { escapeHtml } from '../../core/escape-html.js';
import { logger } from '../../core/logger.js';
import { store } from '../../core/store.js';
import { cspStyleHelper } from '../../services/core-svc/csp-style-helper.js';
import {
  iotRegistry,
  type IoTProvider,
  type IoTConnectionResult,
  type IoTDevice,
} from '../../services/integrations/iot-providers-registry.js';
import { toast } from '../../ui/toast.js';

const ADMIN_ID = 'kdmc_admin';

function isAdmin(): boolean {
  const u = store.get('user') as { id?: string } | null;
  return u?.id === ADMIN_ID;
}

interface ProviderStatusRow {
  provider: IoTProvider;
  status: IoTConnectionResult;
}

export async function render(rootEl: HTMLElement): Promise<void> {
  if (!rootEl) return;
  if (!isAdmin()) {
    rootEl.innerHTML = `
      <div class="ax-gs-62">
        <h2 class="ax-gs-266">🔌 IoT Providers</h2>
        <p>🔒 Cette section est réservée à l'admin Kevin.</p>
      </div>
    `;
    return;
  }
  /* Loading state */
  rootEl.innerHTML = `
    <div class="ax-gs-62">
      <h2 class="ax-gs-266">🔌 IoT Providers</h2>
      <p>Chargement des providers et devices…</p>
    </div>
  `;

  try {
    const statuses = await iotRegistry.statusAll();
    const allDevices = await iotRegistry.listAllDevices().catch(() => [] as IoTDevice[]);
    rootEl.innerHTML = cspStyleHelper.withNonce(renderUI(statuses, allDevices));
    wireEvents(rootEl);
  } catch (err) {
    logger.warn('iot-providers-view', 'render fail', { err: String(err) });
    rootEl.innerHTML = `
      <div style="padding:40px;text-align:center;color:#c00">
        <h2>Erreur</h2>
        <p>Impossible de charger les providers IoT.</p>
        <button id="ax-iot-reload" type="button">Recharger</button>
      </div>
    `;
    /* CSP-safe : inline onclick bloqué par script-src nonce/strict-dynamic → addEventListener. */
    rootEl.querySelector('#ax-iot-reload')?.addEventListener('click', () => location.reload());
  }
}

function renderUI(statuses: ProviderStatusRow[], devices: IoTDevice[]): string {
  const installedCount = statuses.filter((s) => s.status.ok).length;
  const totalCount = statuses.length;

  return `
    <div style="padding:16px;font-family:system-ui,-apple-system,sans-serif;max-width:980px;margin:0 auto">
      <h1 style="color:#c9a227;margin:0 0 4px">🔌 IoT Providers (Smart Home)</h1>
      <p style="color:#999;margin:0 0 20px;font-size:14px">
        ${installedCount}/${totalCount} providers connectés · ${devices.length} devices détectés cross-provider
      </p>

      <section class="ax-gs-390">
        <h2 class="ax-gs-391">⚙️ Providers disponibles</h2>
        <div id="iot-providers-grid">
          ${statuses.map((s) => renderProviderCard(s)).join('')}
        </div>
      </section>

      <section class="ax-gs-390">
        <h2 class="ax-gs-391">📡 Devices détectés (cross-provider)</h2>
        ${devices.length === 0
          ? `<p style="color:#888;text-align:center;padding:24px">Aucun device détecté. Installe un provider pour commencer.</p>`
          : `<table class="ax-gs-392">
              <thead>
                <tr style="text-align:left;border-bottom:1px solid #333">
                  <th class="ax-gs-393">Status</th>
                  <th class="ax-gs-393">Provider</th>
                  <th class="ax-gs-393">Nom</th>
                  <th class="ax-gs-393">Type</th>
                  <th class="ax-gs-393">Capacités</th>
                  <th class="ax-gs-393">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${devices.map((d) => renderDeviceRow(d)).join('')}
              </tbody>
            </table>`}
      </section>

      <section class="ax-gs-390">
        <h2 class="ax-gs-391">🛠 Outils admin</h2>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <button class="iot-btn" data-action="refresh-all">🔄 Refresh status</button>
          <button class="iot-btn" data-action="show-proxy">🌐 Configurer CORS proxy</button>
          <button class="iot-btn" data-action="open-broadlink">🔧 Broadlink Setup avancé</button>
        </div>
      </section>

      <section style="background:#1a1a1a;border-radius:12px;padding:16px">
        <h2 class="ax-gs-391">🤖 Apex auto-install</h2>
        <p style="color:#aaa;font-size:13px;margin:0 0 8px">
          Apex IA peut installer un provider en autonomie quand tu lui donnes tes credentials dans le chat.<br>
          Exemples :
        </p>
        <ul style="color:#aaa;font-size:13px;margin:0;padding-left:24px">
          <li><code>"Apex installe eWeLink avec ${escapeHtml('email@example.com')} et mot de passe XXXXX"</code></li>
          <li><code>"Apex configure SmartLife avec mon client_id et client_secret Tuya Cloud"</code></li>
          <li><code>"Apex connecte mon Home Assistant http://192.168.1.X:8123 token YYYYY"</code></li>
        </ul>
      </section>

      <div id="iot-modal-host"></div>

      <style>
        .iot-card{background:#222;border-radius:8px;padding:12px;margin-bottom:8px;display:flex;align-items:center;gap:12px}
        .iot-card .iot-icon{font-size:24px;width:32px;text-align:center}
        .iot-card .iot-info{flex:1;min-width:0}
        .iot-card .iot-name{color:#fff;font-weight:600;font-size:14px;margin:0}
        .iot-card .iot-desc{color:#888;font-size:12px;margin:2px 0 0}
        .iot-card .iot-status-badge{font-size:11px;padding:2px 8px;border-radius:10px;font-weight:600}
        .iot-card .iot-status-ok{background:#0a4d2a;color:#7fdba0}
        .iot-card .iot-status-ko{background:#4d1a1a;color:#ff8888}
        .iot-card .iot-status-no{background:#333;color:#aaa}
        .iot-btn{background:#c9a227;color:#000;border:none;padding:8px 12px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;min-height:36px}
        .iot-btn:hover{background:#dab73f}
        .iot-btn.secondary{background:#333;color:#fff}
        .iot-btn.secondary:hover{background:#444}
        .iot-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px}
        .iot-modal{background:#1a1a1a;border-radius:12px;padding:24px;max-width:480px;width:100%;max-height:90vh;overflow-y:auto}
        .iot-modal h3{color:#c9a227;margin:0 0 12px}
        .iot-modal label{display:block;color:#aaa;font-size:13px;margin:8px 0 4px}
        .iot-modal input{width:100%;background:#0a0a0a;border:1px solid #333;color:#fff;padding:10px;border-radius:6px;font-size:14px;box-sizing:border-box}
        .iot-modal-actions{display:flex;gap:8px;margin-top:16px;justify-content:flex-end}
      </style>
    </div>
  `;
}

function renderProviderCard(row: ProviderStatusRow): string {
  const { provider, status } = row;
  let badgeClass = 'iot-status-no';
  let badgeText = '⚪ Non configuré';
  if (status.ok) {
    badgeClass = 'iot-status-ok';
    badgeText = `🟢 OK · ${status.devices_count ?? 0} devices`;
  } else if (status.reason && status.reason !== 'no_credentials') {
    badgeClass = 'iot-status-ko';
    badgeText = `🔴 ${escapeHtml(status.reason)}`;
  }
  const installed = status.ok;
  return `
    <div class="iot-card" data-provider-id="${escapeHtml(provider.id)}">
      <div class="iot-icon">${provider.icon ?? '🔌'}</div>
      <div class="iot-info">
        <p class="iot-name">${escapeHtml(provider.name)}</p>
        <p class="iot-desc">${escapeHtml(provider.description ?? '')}</p>
        <span class="iot-status-badge ${badgeClass}">${badgeText}</span>
      </div>
      <div class="ax-gs-29">
        <button class="iot-btn" data-action="install" data-provider-id="${escapeHtml(provider.id)}">
          ${installed ? '↻ Reconfig' : '＋ Installer'}
        </button>
        ${installed
          ? `<button class="iot-btn secondary" data-action="test" data-provider-id="${escapeHtml(provider.id)}">Tester</button>`
          : `<a href="${escapeHtml(provider.console_url)}" target="_blank" rel="noopener" class="iot-btn secondary" style="text-align:center;text-decoration:none">Console</a>`}
      </div>
    </div>
  `;
}

function renderDeviceRow(d: IoTDevice): string {
  const onlineDot = d.online ? '🟢' : '⚪';
  return `
    <tr class="ax-gs-232">
      <td class="ax-gs-393">${onlineDot}</td>
      <td style="padding:8px;color:#c9a227">${escapeHtml(d.provider)}</td>
      <td style="padding:8px;color:#fff">${escapeHtml(d.name)}</td>
      <td style="padding:8px;color:#aaa">${escapeHtml(d.type)}</td>
      <td style="padding:8px;color:#888;font-size:11px">${escapeHtml((d.capabilities ?? []).join(', '))}</td>
      <td class="ax-gs-393">
        <button class="iot-btn secondary" data-action="device-on" data-provider-id="${escapeHtml(d.provider)}" data-device-id="${escapeHtml(d.device_id)}" title="Toggle ON">▶</button>
      </td>
    </tr>
  `;
}

function wireEvents(rootEl: HTMLElement): void {
  rootEl.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const btn = target.closest('[data-action]') as HTMLElement | null;
    if (!btn) return;
    const action = btn.dataset['action'] ?? '';
    const providerId = btn.dataset['providerId'] ?? '';
    const deviceId = btn.dataset['deviceId'] ?? '';
    if (action === 'install') void handleInstall(providerId, rootEl);
    else if (action === 'test') void handleTest(providerId);
    else if (action === 'refresh-all') void handleRefreshAll(rootEl);
    else if (action === 'show-proxy') void handleProxy();
    else if (action === 'open-broadlink') location.hash = '#broadlink-setup';
    else if (action === 'device-on' && providerId && deviceId) void handleDeviceToggle(providerId, deviceId);
  });
}

async function handleInstall(providerId: string, rootEl: HTMLElement): Promise<void> {
  const provider = iotRegistry.get(providerId);
  if (!provider) {
    toast.error(`Provider ${providerId} inconnu`);
    return;
  }
  /* Build form fields selon credential_keys */
  const host = rootEl.querySelector('#iot-modal-host');
  if (!host) return;
  /* Champs spécifiques par provider (UX claire) */
  const fields = inferInstallFields(provider);
  host.innerHTML = `
    <div class="iot-modal-bg" data-modal-bg="1">
      <div class="iot-modal">
        <h3>${escapeHtml(provider.icon ?? '🔌')} Installer ${escapeHtml(provider.name)}</h3>
        <p style="color:#aaa;font-size:13px;margin:0 0 12px">${escapeHtml(provider.description ?? '')}</p>
        <p style="color:#888;font-size:12px">Console : <a href="${escapeHtml(provider.console_url)}" target="_blank" rel="noopener" class="ax-gs-198">${escapeHtml(provider.console_url)}</a></p>
        <form id="iot-install-form" autocomplete="off">
          ${fields.map((f) => `
            <label>${escapeHtml(f.label)}${f.required ? ' *' : ''}</label>
            <input name="${escapeHtml(f.name)}" aria-label="${escapeHtml(f.label)}" type="${escapeHtml(f.type)}" placeholder="${escapeHtml(f.placeholder ?? '')}" ${f.required ? 'required' : ''} autocomplete="off" />
          `).join('')}
          <div class="iot-modal-actions">
            <button type="button" class="iot-btn secondary" data-modal-close="1">Annuler</button>
            <button type="submit" class="iot-btn">Installer</button>
          </div>
        </form>
      </div>
    </div>
  `;
  const bg = host.querySelector('[data-modal-bg="1"]') as HTMLElement | null;
  bg?.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.dataset['modalBg'] === '1' || t.dataset['modalClose'] === '1') host.innerHTML = '';
  });
  const form = host.querySelector('#iot-install-form') as HTMLFormElement | null;
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const credentials: Record<string, string> = {};
    for (const f of fields) {
      const v = fd.get(f.name);
      if (typeof v === 'string' && v) credentials[f.credentialKey ?? f.name] = v;
    }
    const region = (fd.get('region') as string) || undefined;
    void doInstall(provider.id, credentials, region, host as HTMLElement, rootEl);
  });
}

interface InstallField {
  name: string;
  label: string;
  type: 'text' | 'password' | 'url' | 'email';
  required: boolean;
  placeholder?: string;
  credentialKey?: string; /* clé envoyée à install (default = name) */
}

function inferInstallFields(provider: IoTProvider): InstallField[] {
  switch (provider.id) {
    case 'ewelink':
      return [
        { name: 'email', label: 'Email eWeLink', type: 'email', required: true },
        { name: 'password', label: 'Mot de passe', type: 'password', required: true },
        { name: 'region', label: 'Région (eu, us, as, cn)', type: 'text', required: false, placeholder: 'eu' },
      ];
    case 'tuya':
      return [
        { name: 'client_id', label: 'Client ID Tuya Cloud', type: 'text', required: true },
        { name: 'client_secret', label: 'Client Secret', type: 'password', required: true },
        { name: 'uid', label: 'User UID Tuya', type: 'text', required: false, placeholder: 'optionnel' },
        { name: 'access_token', label: 'Access Token (si déjà obtenu)', type: 'password', required: false },
        { name: 'region', label: 'Région (eu, us, cn, in)', type: 'text', required: false, placeholder: 'eu' },
      ];
    case 'broadlink':
      return [
        { name: 'email', label: 'Email Broadlink', type: 'email', required: false },
        { name: 'password', label: 'Mot de passe', type: 'password', required: false },
        { name: 'token', label: 'Token (alternative — extrait via vision)', type: 'password', required: false },
      ];
    case 'hue':
      return [
        { name: 'bridge_ip', label: 'IP Hue Bridge (LAN)', type: 'text', required: false, placeholder: '192.168.1.X' },
        { name: 'username', label: 'Username (LAN, généré bouton bridge)', type: 'text', required: false },
        { name: 'oauth_token', label: 'OAuth token (cloud)', type: 'password', required: false },
      ];
    case 'sonos':
      return [
        { name: 'token', label: 'Access Token OAuth2 Sonos', type: 'password', required: true },
        { name: 'household', label: 'Household ID', type: 'text', required: false, placeholder: 'optionnel — détecté auto' },
      ];
    case 'home-assistant':
      return [
        { name: 'url', label: 'URL Home Assistant', type: 'url', required: true, placeholder: 'http://192.168.1.X:8123' },
        { name: 'token', label: 'Long-Lived Access Token', type: 'password', required: true },
      ];
    default:
      return provider.credential_keys.map((k) => ({
        name: k.replace(/^ax_[a-z]+_/, ''),
        credentialKey: k.replace(/^ax_[a-z]+_/, ''),
        label: k,
        type: /password|secret|token/i.test(k) ? 'password' : 'text',
        required: false,
      }));
  }
}

async function doInstall(
  providerId: string,
  credentials: Record<string, string>,
  region: string | undefined,
  host: HTMLElement,
  rootEl: HTMLElement,
): Promise<void> {
  toast.info(`Installation ${providerId}…`);
  const r = await iotRegistry.configureProvider(
    region ? { provider_id: providerId, credentials, region } : { provider_id: providerId, credentials },
  );
  if (r.ok) {
    toast.success(`✅ ${providerId} installé · ${r.devices_found ?? 0} devices`);
    host.innerHTML = '';
    /* Reload view */
    void render(rootEl);
  } else {
    toast.error(`❌ Échec ${providerId} : ${r.error ?? 'inconnu'}`);
  }
}

async function handleTest(providerId: string): Promise<void> {
  toast.info(`Test ${providerId}…`);
  const r = await iotRegistry.testConnection(providerId);
  if (r.ok) {
    toast.success(`🟢 ${providerId} OK · ${r.devices_count ?? 0} devices · ${r.latency_ms ?? '?'}ms`);
  } else {
    toast.warn(`⚠️ ${providerId} : ${r.error ?? r.reason ?? 'inconnu'}`);
  }
}

async function handleRefreshAll(rootEl: HTMLElement): Promise<void> {
  toast.info('Refresh status providers…');
  await render(rootEl);
}

function handleProxy(): void {
  const current = localStorage.getItem('ax_iot_proxy_url') ?? '';
  const next = window.prompt('URL Cloudflare Worker proxy CORS (vide = direct) :', current);
  if (next === null) return;
  if (next.trim()) {
    try { localStorage.setItem('ax_iot_proxy_url', next.trim()); } catch { /* quota */ }
    toast.success('Proxy configuré');
  } else {
    try { localStorage.removeItem('ax_iot_proxy_url'); } catch { /* ignore */ }
    toast.info('Proxy retiré (mode direct)');
  }
}

async function handleDeviceToggle(providerId: string, deviceId: string): Promise<void> {
  /* Mapping commande "on" simple selon provider */
  const cmd = inferOnCommand(providerId, deviceId);
  toast.info(`▶ Envoi ${providerId}/${deviceId.slice(0, 12)}…`);
  const r = await iotRegistry.sendCommand(providerId, deviceId, cmd);
  if (r.ok) toast.success('✅ Commande envoyée');
  else toast.error(`❌ ${r.error ?? r.reason ?? 'fail'}`);
}

function inferOnCommand(providerId: string, deviceId: string): Record<string, unknown> {
  switch (providerId) {
    case 'ewelink':
      return { switch: 'on' };
    case 'tuya':
      return { commands: [{ code: 'switch_led', value: true }] };
    case 'hue':
      return { on: true };
    case 'sonos':
      return { action: 'play' };
    case 'home-assistant': {
      const domain = deviceId.split('.')[0] ?? 'homeassistant';
      const service = domain === 'light' || domain === 'switch' ? 'turn_on' : 'toggle';
      return { service };
    }
    case 'broadlink':
      return { ir_hex: '' }; /* nécessite code IR appris — UI dédiée broadlink-setup */
    default:
      return { on: true };
  }
}
