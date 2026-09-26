/**
 * APEX v13.3.51 — Vue Configuration Broadlink (?view=broadlink-setup)
 *
 * Demande Kevin (2026-05-07) : "j'ai donné photo compte broadlink + photo
 * info Smart TV Clayton pour pilotage et Apex n'a rien fait".
 *
 * Cette vue (admin only) permet :
 * 1. Status connexion compte Broadlink (token configuré ? quand ?)
 * 2. Login email + password (fallback si pas extraction vision)
 * 3. Liste des devices liés (refresh, online status)
 * 4. Test commande IR (TV Clayton détectée → bouton power/vol)
 * 5. Codes IR appris (ajout manuel + test)
 * 6. Reset config (si bug)
 * 7. Configuration proxy Cloudflare Worker (si CORS bloque API directe)
 *
 * Sécurité :
 * - Admin only (Kevin règle "Laurence isolation totale")
 * - Token chiffré AES-GCM-256 via vault (`ax_broadlink_token`)
 */

import { escapeHtml } from '../../core/escape-html.js';
import { logger } from '../../core/logger.js';
import { store } from '../../core/store.js';
import { broadlinkBridge, type BroadlinkDevice } from '../../services/integrations/broadlink-bridge.js';
import { toast } from '../../ui/toast.js';

const ADMIN_ID = 'kdmc_admin';

function isAdmin(): boolean {
  const u = store.get('user') as { id?: string } | null;
  return u?.id === ADMIN_ID;
}

export async function render(rootEl: HTMLElement): Promise<void> {
  if (!rootEl) return;
  if (!isAdmin()) {
    rootEl.innerHTML = `
      <div class="ax-gs-62">
        <h2 class="ax-gs-266">🔌 Broadlink Setup</h2>
        <p>🔒 Cette section est réservée à l'admin Kevin.</p>
      </div>
    `;
    return;
  }

  const status = await broadlinkBridge.status();
  const devices = status.configured ? await broadlinkBridge.listDevices() : [];

  rootEl.innerHTML = renderUI(status, devices);
  wireEvents(rootEl);
}

function renderUI(
  status: { configured: boolean; email?: string; deviceCount: number; proxyUrl?: string },
  devices: BroadlinkDevice[],
): string {
  const statusBadge = status.configured
    ? `<span style="background:#0a4d2c;color:#4ade80;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:600">🟢 CONFIGURÉ</span>`
    : `<span style="background:#4a1a1a;color:#f87171;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:600">🔴 NON CONFIGURÉ</span>`;

  return `
    <div style="max-width:840px;margin:0 auto;padding:18px;font-family:system-ui,-apple-system,sans-serif;color:var(--ax-text,#e5e5e5)">
      <h2 style="color:#c9a227;margin-top:0;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        🔌 Broadlink Setup ${statusBadge}
      </h2>
      <p class="ax-gs-340">
        Pilote tes devices Broadlink (Smart TV via RM Pro/Mini, prises SP, hub MP1) directement depuis Apex.
        Token chiffré AES-GCM-256 dans le Coffre. Cross-device via Firebase backup.
      </p>

      <!-- Section 1 : Status compte -->
      <section style="margin:20px 0;background:rgba(201,162,39,0.05);border:1px solid rgba(201,162,39,0.2);border-radius:12px;padding:18px">
        <h3 class="ax-gs-341">📋 Statut du compte</h3>
        ${status.configured
          ? `<p class="ax-gs-342">📧 Email : <strong>${escapeHtml(status.email ?? '(non visible)')}</strong></p>
             <p class="ax-gs-342">📱 Devices détectés : <strong>${status.deviceCount}</strong></p>
             ${status.proxyUrl ? `<p style="margin:6px 0;font-size:12px;color:#888">🌐 Proxy : <code>${escapeHtml(status.proxyUrl)}</code></p>` : ''}
             <button class="ax-btn" id="ax-bl-reset" style="margin-top:12px;padding:10px 16px;background:#4a1a1a;color:#f87171;border:1px solid #f87171;border-radius:8px;cursor:pointer">🗑 Déconnecter / Reset</button>`
          : `<p style="margin:6px 0;color:#aaa">Pas encore configuré. Login ci-dessous OU colle photo compte Broadlink dans le chat (Apex extrait automatiquement le token).</p>`
        }
      </section>

      <!-- Section 2 : Login -->
      <section class="ax-gs-343">
        <h3 class="ax-gs-341">🔑 Connexion compte Broadlink</h3>
        <p style="font-size:13px;color:#aaa;margin-bottom:12px">
          Saisis ton email + password Broadlink (compte mobile app). Apex récupère automatiquement le token.
          <br/>📷 <strong>Astuce</strong> : tu peux aussi coller un screenshot du compte dans le chat — Apex extrait token + devices via Vision.
        </p>
        <div class="ax-gs-123">
          <input type="email" id="ax-bl-email" aria-label="Email du compte Broadlink" placeholder="email@example.com"
            value="${escapeHtml(status.email ?? '')}"
            class="ax-gs-344"
            autocomplete="email" autocapitalize="off" autocorrect="off"
          />
          <input type="password" id="ax-bl-password" aria-label="Mot de passe du compte Broadlink" placeholder="Mot de passe Broadlink"
            class="ax-gs-344"
            autocomplete="current-password"
          />
          <button class="ax-btn ax-btn-primary" id="ax-bl-login-btn"
            style="padding:14px;background:linear-gradient(135deg,#c9a227,#e8b830);color:#000;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:15px;min-height:48px">
            ⚡ Connexion (1-clic)
          </button>
        </div>
      </section>

      <!-- Section 3 : Devices -->
      ${status.configured ? renderDevicesSection(devices) : ''}

      <!-- Section 4 : Settings avancés -->
      <section style="margin:20px 0;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:18px">
        <h3 class="ax-gs-341">⚙️ Avancé</h3>
        <p style="font-size:13px;color:#aaa">Si CORS bloque l'API Broadlink directe (Safari iOS PWA), configure un proxy Cloudflare Worker :</p>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <input type="url" id="ax-bl-proxy-url" aria-label="URL du proxy Cloudflare Worker Broadlink" placeholder="https://apex-broadlink-proxy.workers.dev"
            value="${escapeHtml(status.proxyUrl ?? '')}"
            style="flex:1;min-width:220px;padding:10px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.4);color:#fff;font-size:13px"
          />
          <button class="ax-btn" id="ax-bl-proxy-save" style="padding:10px 16px;background:rgba(201,162,39,0.2);color:#c9a227;border:1px solid #c9a227;border-radius:8px;cursor:pointer">💾 Sauvegarder</button>
        </div>
      </section>

      <p style="font-size:12px;color:#666;margin-top:24px;line-height:1.5">
        💡 <strong>Note Kevin</strong> : la 1ère version utilise l'API Broadlink Cloud directement.
        Si ça bloque côté CORS, déployer le worker proxy (à venir : Apex peut générer le code worker tout seul).
      </p>
    </div>
  `;
}

function renderDevicesSection(devices: BroadlinkDevice[]): string {
  if (devices.length === 0) {
    return `
      <section class="ax-gs-343">
        <h3 class="ax-gs-341">📱 Devices liés au compte</h3>
        <p class="ax-gs-216">Aucun device chargé. Clique <button class="ax-btn ax-btn-sm" id="ax-bl-refresh-empty" style="margin-left:6px;padding:4px 10px;border-radius:6px;background:rgba(201,162,39,0.2);color:#c9a227;border:1px solid #c9a227;cursor:pointer">🔄 Refresh</button>.</p>
      </section>
    `;
  }
  const rows = devices
    .map(
      (d) => `
        <div style="display:flex;align-items:center;gap:10px;padding:10px;background:rgba(0,0,0,0.25);border-radius:8px;margin-bottom:6px;flex-wrap:wrap">
          <span class="ax-gs-17">${typeIcon(d.type)}</span>
          <div style="flex:1;min-width:140px">
            <div style="font-weight:600">${escapeHtml(d.name)}</div>
            <div class="ax-gs-124">${escapeHtml(d.type)} · <code>${escapeHtml(d.mac)}</code></div>
          </div>
          <span style="font-size:11px;padding:2px 8px;border-radius:8px;${d.online ? 'background:#0a4d2c;color:#4ade80' : 'background:#4a1a1a;color:#f87171'}">${d.online ? '🟢 online' : '🔴 offline'}</span>
          ${d.type === 'rm'
            ? `<button class="ax-btn ax-btn-sm ax-bl-test" data-device-id="${escapeHtml(d.id)}"
                 style="padding:6px 10px;border-radius:6px;background:rgba(201,162,39,0.2);color:#c9a227;border:1px solid #c9a227;cursor:pointer;font-size:12px">🧪 Tester IR</button>`
            : ''}
        </div>`,
    )
    .join('');
  return `
    <section class="ax-gs-343">
      <h3 style="margin-top:0;color:#c9a227;font-size:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        📱 Devices liés (${devices.length})
        <button class="ax-btn ax-btn-sm" id="ax-bl-refresh" style="padding:6px 12px;border-radius:6px;background:rgba(201,162,39,0.2);color:#c9a227;border:1px solid #c9a227;cursor:pointer">🔄 Refresh</button>
      </h3>
      ${rows}
    </section>
  `;
}

function typeIcon(t: BroadlinkDevice['type']): string {
  switch (t) {
    case 'rm': return '📺';
    case 'sp': return '🔌';
    case 'mp1': return '🔋';
    case 'a1': return '🌡';
    default: return '📦';
  }
}

function wireEvents(rootEl: HTMLElement): void {
  /* Login */
  rootEl.querySelector<HTMLButtonElement>('#ax-bl-login-btn')?.addEventListener('click', () => {
    const email = rootEl.querySelector<HTMLInputElement>('#ax-bl-email')?.value.trim() ?? '';
    const password = rootEl.querySelector<HTMLInputElement>('#ax-bl-password')?.value ?? '';
    if (!email || !password) {
      toast.warn('Email et mot de passe requis');
      return;
    }
    void (async () => {
      toast.info('🔄 Connexion à Broadlink...');
      const r = await broadlinkBridge.login(email, password);
      if (r.ok) {
        toast.success('✅ Connecté à Broadlink');
        await render(rootEl);
      } else {
        toast.error(`❌ ${r.error ?? 'login échoué'}`);
      }
    })();
  });

  /* Reset */
  rootEl.querySelector<HTMLButtonElement>('#ax-bl-reset')?.addEventListener('click', () => {
    if (!confirm('Déconnecter le compte Broadlink ? Devices et token seront supprimés.')) return;
    void (async () => {
      await broadlinkBridge.reset();
      toast.success('Compte Broadlink déconnecté');
      await render(rootEl);
    })();
  });

  /* Refresh devices */
  for (const id of ['#ax-bl-refresh', '#ax-bl-refresh-empty']) {
    rootEl.querySelector<HTMLButtonElement>(id)?.addEventListener('click', () => {
      void (async () => {
        toast.info('🔄 Refresh devices...');
        const list = await broadlinkBridge.listDevices(true);
        toast.success(`${list.length} device(s) trouvé(s)`);
        await render(rootEl);
      })();
    });
  }

  /* Test IR (placeholder code commun TV power) */
  rootEl.querySelectorAll<HTMLButtonElement>('.ax-bl-test').forEach((btn) => {
    btn.addEventListener('click', () => {
      const deviceId = btn.dataset['deviceId'] ?? '';
      if (!deviceId) return;
      void (async () => {
        const codes = await broadlinkBridge.getLearnedCodes(deviceId);
        if (codes.length === 0) {
          toast.warn('Aucun code IR appris pour ce device. Apprends-en via app Broadlink → ils s\'importent ici.');
          return;
        }
        const first = codes[0];
        if (!first) return;
        toast.info(`Test envoi : ${first.name}`);
        const r = await broadlinkBridge.sendIR(deviceId, first.ir_hex);
        if (r.ok) toast.success(`✅ ${first.name} envoyé`);
        else toast.error(`❌ ${r.error ?? 'envoi échoué'}`);
      })();
    });
  });

  /* Save proxy URL */
  rootEl.querySelector<HTMLButtonElement>('#ax-bl-proxy-save')?.addEventListener('click', () => {
    const url = rootEl.querySelector<HTMLInputElement>('#ax-bl-proxy-url')?.value.trim() ?? '';
    if (!url) {
      try { localStorage.removeItem('ax_broadlink_proxy_url'); } catch { /* ignore */ }
      toast.success('Proxy retiré');
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      toast.warn('URL doit commencer par https://');
      return;
    }
    try { localStorage.setItem('ax_broadlink_proxy_url', url); } catch { /* quota */ }
    toast.success('Proxy sauvegardé');
  });

  logger.info('broadlink-setup', 'view rendered');
}

export function dispose(): void {
  /* No long-living subscriptions to clean — listeners attached to DOM only */
}
