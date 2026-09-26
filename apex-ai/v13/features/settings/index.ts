/**
 * APEX v13 — Feature Settings (réglages utilisateur).
 * Stub Sprint 2 P0 — sera enrichi avec parité v12.785 vSettings.
 */

import { escapeHtml } from '../../core/escape-html.js';
import { createCleanupScope, type CleanupScope } from '../../core/listener-cleanup.js';
import { logger } from '../../core/logger.js';
import { store } from '../../core/store.js';
import { cspStyleHelper } from '../../services/core-svc/csp-style-helper.js';
import { renderRechargeAction } from '../../ui/recharge-action.js';

/* P1-6 (audit v13.2.7) : scope listeners pour anti-leak SPA navigation. */
let activeSettingsScope: CleanupScope | null = null;

export function dispose(): void {
  activeSettingsScope?.cleanup();
  activeSettingsScope = null;
}

const AUTO_READ_KEY = 'apex_v13_chat_auto_read';

function isAutoReadEnabled(): boolean {
  try {
    return localStorage.getItem(AUTO_READ_KEY) === '1';
  } catch {
    return false;
  }
}

function setAutoReadEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_READ_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore quota */
  }
}

interface VoiceListItem {
  readonly id: string;
  readonly name: string;
  readonly emoji?: string;
  readonly category: 'pro' | 'fun' | 'thematic';
  readonly description?: string;
}

/**
 * Wire la section Voice : auto-read toggle, liste 60+ voix avec
 * Test ▶ + Définir comme défaut. Lazy-load voice service.
 *
 * Exposé pour tests.
 */
export async function wireVoiceSection(rootEl: HTMLElement): Promise<void> {
  try {
    const voiceMod = await import('../../services/ai/voice.js');
    const { listVoices, getActiveVoice, setActiveVoice, speak, stopAll } = voiceMod;

    const autoReadInput = rootEl.querySelector<HTMLInputElement>('#ax-settings-auto-read');
    const currentEl = rootEl.querySelector<HTMLDivElement>('#ax-voice-current');
    const listEl = rootEl.querySelector<HTMLDivElement>('#ax-voice-list');
    const catBtns = rootEl.querySelectorAll<HTMLButtonElement>('.ax-voice-cat-btn');

    /* v13.4.346 — toggle Mémoire long terme (RAG). Avant le guard voix pour toujours wirer. */
    const ragInput = rootEl.querySelector<HTMLInputElement>('#ax-settings-rag');
    if (ragInput) {
      void import('../../services/ai/apex-memory-rag.js').then(({ apexMemoryRag }) => {
        ragInput.checked = apexMemoryRag.isEnabled();
      });
      activeSettingsScope!.bind(ragInput, 'change', () => {
        void (async () => {
          const { apexMemoryRag } = await import('../../services/ai/apex-memory-rag.js');
          apexMemoryRag.enable(ragInput.checked);
          const { toast } = await import('../../ui/toast.js');
          toast.success(ragInput.checked ? '🧠 Mémoire long terme activée' : 'Mémoire long terme désactivée');
        })();
      });
    }

    /* 2026-07-10 — toggle Mémoire compacte (faits durables, sans clé ni coût IA). */
    const cmemInput = rootEl.querySelector<HTMLInputElement>('#ax-settings-cmem');
    if (cmemInput) {
      void import('../../services/ai/compact-memory.js').then(({ compactMemory }) => {
        cmemInput.checked = compactMemory.isEnabled();
      });
      activeSettingsScope!.bind(cmemInput, 'change', () => {
        void (async () => {
          const { compactMemory } = await import('../../services/ai/compact-memory.js');
          compactMemory.enable(cmemInput.checked);
          const { toast } = await import('../../ui/toast.js');
          toast.success(cmemInput.checked ? '⚡ Mémoire compacte activée' : 'Mémoire compacte désactivée');
        })();
      });
    }

    if (!listEl) return;

    /* Init auto-read toggle */
    if (autoReadInput) {
      autoReadInput.checked = isAutoReadEnabled();
      activeSettingsScope!.bind(autoReadInput, 'change', () => {
        setAutoReadEnabled(autoReadInput.checked);
        void (async () => {
          const { toast } = await import('../../ui/toast.js');
          toast.success(autoReadInput.checked ? 'Lecture auto activée' : 'Lecture auto désactivée');
        })();
      });
    }

    /* Affiche voix active */
    const refreshCurrent = (): void => {
      if (!currentEl) return;
      const id = getActiveVoice();
      const list = listVoices() as readonly VoiceListItem[];
      const v = list.find((x) => x.id === id);
      currentEl.textContent = v ? `Voix active : ${v.emoji ?? '🔊'} ${v.name} (${v.category})` : `Voix active : ${id}`;
    };
    refreshCurrent();

    /* Render liste filtrée */
    const renderList = (filter: 'all' | 'pro' | 'fun' | 'thematic'): void => {
      const list = listVoices() as readonly VoiceListItem[];
      const filtered = filter === 'all' ? list : list.filter((v) => v.category === filter);
      const activeId = getActiveVoice();
      /* v13.4.233 finding POST-FIX P2 — retire aria-busy quand liste rendue (skeleton remplacé) */
      listEl.setAttribute('aria-busy', 'false');
      listEl.innerHTML = filtered
        .map((v) => {
          const isActive = v.id === activeId;
          const emoji = v.emoji ?? (v.category === 'pro' ? '🎙️' : v.category === 'fun' ? '🎉' : '🎨');
          const desc = v.description ? escapeHtml(v.description) : '';
          return `
            <div class="ax-voice-item${isActive ? ' is-active' : ''}" data-voice-id="${escapeHtml(v.id)}">
              <span class="ax-gs-17">${emoji}</span>
              <div class="ax-gs-6">
                <div class="ax-voice-item__name">${escapeHtml(v.name)}${isActive ? ' <span style="color:var(--ax-gold);font-size:11px">★ active</span>' : ''}</div>
                <div class="ax-voice-item__meta">${escapeHtml(v.category)}${desc ? ' · ' + desc : ''}</div>
              </div>
              <button class="ax-voice-item__action ax-voice-item__action--test" data-test-voice="${escapeHtml(v.id)}" title="Tester cette voix" aria-label="Tester ${escapeHtml(v.name)}">▶</button>
              <button class="ax-voice-item__action ax-voice-item__action--set" data-set-voice="${escapeHtml(v.id)}" title="Définir comme voix par défaut" aria-label="Définir ${escapeHtml(v.name)} par défaut">★</button>
            </div>
          `;
        })
        .join('');
    };
    renderList('all');

    /* Wire boutons catégorie */
    catBtns.forEach((btn) => {
      activeSettingsScope!.bind(btn, 'click', () => {
        const cat = btn.getAttribute('data-cat') as 'all' | 'pro' | 'fun' | 'thematic' | null;
        if (cat) renderList(cat);
      });
    });

    /* Event delegation pour boutons test ▶ + définir comme défaut */
    activeSettingsScope!.bind(listEl, 'click', (e) => {
      const target = e.target as HTMLElement;
      const testBtn = target.closest('[data-test-voice]') as HTMLButtonElement | null;
      const setBtn = target.closest('[data-set-voice]') as HTMLButtonElement | null;

      if (testBtn) {
        const id = testBtn.getAttribute('data-test-voice');
        if (!id) return;
        void (async () => {
          stopAll();
          const r = await speak('Bonjour Kevin, je suis ta voix.', id);
          if (!r.ok) {
            const { toast } = await import('../../ui/toast.js');
            toast.warn(`Test échoué : ${r.reason ?? 'erreur'}`);
          }
        })();
        return;
      }

      if (setBtn) {
        const id = setBtn.getAttribute('data-set-voice');
        if (!id) return;
        void (async () => {
          await setActiveVoice(id);
          refreshCurrent();
          /* Re-render avec nouvelle active */
          const activeFilter = (rootEl.querySelector<HTMLButtonElement>('.ax-voice-cat-btn[data-cat]:focus')?.getAttribute('data-cat') ?? 'all') as 'all' | 'pro' | 'fun' | 'thematic';
          renderList(activeFilter);
          const { toast } = await import('../../ui/toast.js');
          const list = listVoices() as readonly VoiceListItem[];
          const v = list.find((x) => x.id === id);
          toast.success(v ? `Voix par défaut : ${v.name}` : 'Voix mise à jour');
        })();
      }
    });
  } catch (err: unknown) {
    logger.warn('feature-settings', 'wireVoiceSection failed', { err });
  }
}

export function render(rootEl: HTMLElement): void {
  /* P1-6 : cleanup ancien scope avant re-render */
  activeSettingsScope?.cleanup();
  activeSettingsScope = createCleanupScope('settings');
  const user = store.get('user');
  const isAdmin = (store.get('isAdmin') as boolean | undefined) ?? false;
  /* Premium settings sections with glass + lift hover + section icon */
  /* v13.4.190 fix Kevin "30 boutons cachés right" : max-width:100% +
   * box-sizing:border-box force section à respecter viewport iPhone même
   * avec padding:20px (sinon section déborde de 40px = boutons droite cachés). */
  const sectionStyle = 'background:linear-gradient(135deg,rgba(20,20,35,0.7),rgba(14,14,28,0.5));backdrop-filter:blur(16px) saturate(140%);-webkit-backdrop-filter:blur(16px) saturate(140%);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:20px;margin-top:14px;max-width:100%;box-sizing:border-box;transition:all 240ms cubic-bezier(0.16,1,0.3,1)';
  const sectionHeaderStyle = 'margin:0 0 12px;font-size:15px;font-weight:700;color:#fff;letter-spacing:-0.01em;display:flex;align-items:center;gap:10px';
  const iconBadgeStyle = 'display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;background:linear-gradient(135deg,rgba(232,184,48,0.2),rgba(201,162,39,0.08));border:1px solid rgba(232,184,48,0.25);border-radius:10px;font-size:16px';
  const btnFullWidthStyle = 'width:100%;max-width:100%;box-sizing:border-box;min-height:44px;padding:12px 16px;font-size:14px;font-weight:600;border-radius:10px;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:all 180ms cubic-bezier(0.16,1,0.3,1);white-space:normal;word-break:break-word;overflow-wrap:anywhere;text-align:left';

  rootEl.innerHTML = cspStyleHelper.withNonce(`
    <style>
      @keyframes ax-fade-up {
        0% { opacity: 0; transform: translateY(12px); }
        100% { opacity: 1; transform: translateY(0); }
      }
      .ax-modernized-card { animation: ax-fade-up 320ms cubic-bezier(0.16,1,0.3,1) backwards; }
      .ax-modernized-card:hover {
        transform: translateY(-2px);
        border-color: rgba(232,184,48,0.25) !important;
        box-shadow: 0 8px 24px rgba(0,0,0,0.3);
      }
      @media (prefers-reduced-motion: reduce) {
        .ax-modernized-card { animation: none !important; transition: none !important; }
        .ax-modernized-card:hover { transform: none !important; }
      }
    </style>
    <div class="ax-page" style="padding:24px 16px max(24px, env(safe-area-inset-bottom)) 16px;max-width:680px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif">
      <header style="margin-bottom:24px;animation:ax-fade-up 360ms cubic-bezier(0.16,1,0.3,1) backwards">
        <h1 style="margin:0 0 6px;font-size:clamp(26px,5.5vw,32px);font-weight:700;background:linear-gradient(135deg,var(--ax-gold-deep) 0%,var(--ax-gold) 50%,var(--ax-gold-bright) 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;font-family:Georgia,serif;letter-spacing:-0.025em">⚙️ Réglages</h1>
        <p class="ax-gs-399">Utilisateur : <strong style="color:rgba(255,255,255,0.9)">${escapeHtml(user?.name ?? 'inconnu')}</strong> ${isAdmin ? '<span style="color:var(--ax-gold)">👑 Admin</span>' : ''}</p>
      </header>

      <section class="ax-modernized-card" style="${sectionStyle};animation-delay:60ms">
        <h2 style="${sectionHeaderStyle}"><span style="${iconBadgeStyle}">🔑</span> Clés API</h2>
        <p class="ax-gs-437">Gère tes clés API (Anthropic, OpenAI, Stripe, etc.) dans le Coffre sécurisé.</p>
        <button class="ax-btn ax-btn-primary" data-nav-route="vault" style="${btnFullWidthStyle};background:linear-gradient(135deg,var(--ax-gold-deep),var(--ax-gold));color:#000;border:none">🔐 Ouvrir le Coffre</button>
      </section>

      <section class="ax-modernized-card" style="${sectionStyle};animation-delay:100ms">
        <h2 style="${sectionHeaderStyle}"><span style="${iconBadgeStyle}">🎨</span> Apparence</h2>
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:rgba(255,255,255,0.03);border-radius:10px">
          <span class="ax-gs-164">Thème actuel</span>
          <span style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;background:rgba(232,184,48,0.12);color:var(--ax-gold);border-radius:24px;font-size:12px;font-weight:700;letter-spacing:0.04em">
            <span style="width:8px;height:8px;background:var(--ax-gold);border-radius:50%;box-shadow:0 0 10px var(--ax-gold)"></span> DARK
          </span>
        </div>
      </section>

      <section class="ax-modernized-card" style="${sectionStyle};animation-delay:140ms">
        <h2 style="${sectionHeaderStyle}"><span style="${iconBadgeStyle}">🔔</span> Notifications</h2>
        <p class="ax-gs-437">Active les notifications push pour rester informé en temps réel.</p>
        <button class="ax-btn ax-btn-secondary" id="ax-settings-notif-test" style="${btnFullWidthStyle};background:rgba(106,138,255,0.15);color:var(--ax-blue);border:1px solid rgba(106,138,255,0.3)">🔔 Tester notification push</button>
      </section>

      <section class="ax-modernized-card" style="${sectionStyle};animation-delay:180ms">
        <h2 style="${sectionHeaderStyle}"><span style="${iconBadgeStyle}">🧠</span> Mémoire externe</h2>
        <p style="margin:0 0 10px;color:rgba(255,255,255,0.6);font-size:13px;line-height:1.5">
          Backup mémoire vers Notion / GitHub Gist / Firebase. Tokens lus depuis le Coffre.
        </p>
        <label style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:rgba(255,255,255,0.03);border-radius:10px;margin:0 0 10px;cursor:pointer">
          <span class="ax-gs-164">Mémoire long terme — Apex se souvient de tes échanges</span>
          <input type="checkbox" id="ax-settings-rag" aria-label="Activer la mémoire long terme d'Apex (RAG)" class="ax-gs-439">
        </label>
        <label style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:rgba(255,255,255,0.03);border-radius:10px;margin:0 0 10px;cursor:pointer">
          <span class="ax-gs-164">Mémoire compacte — faits durables, sans coût (0 clé, 0 token)</span>
          <input type="checkbox" id="ax-settings-cmem" aria-label="Activer la mémoire compacte d'Apex" class="ax-gs-439">
        </label>
        <div id="ax-memory-bridge-status" class="ax-gs-438"></div>
        <button class="ax-btn ax-btn-secondary" id="ax-memory-bridge-sync" style="${btnFullWidthStyle};background:rgba(160,96,255,0.15);color:var(--ax-purple);border:1px solid rgba(160,96,255,0.3)">🔄 Sync maintenant</button>
      </section>

      <section class="ax-modernized-card" style="${sectionStyle};animation-delay:220ms">
        <h2 style="${sectionHeaderStyle}"><span style="${iconBadgeStyle}">📊</span> Conso API temps réel</h2>
        <p class="ax-gs-437">
          Apex surveille ta conso et détecte si une clé est utilisée anormalement (potentielle compromission).
        </p>
        <button class="ax-btn ax-btn-secondary" id="ax-conso-scan" style="${btnFullWidthStyle};margin-bottom:10px;background:rgba(34,204,119,0.15);color:var(--ax-green);border:1px solid rgba(34,204,119,0.3)">🔍 Scanner toutes mes API maintenant</button>
        <div id="ax-conso-results" class="ax-gs-196"></div>
        <!-- v13.4.331 (Kevin "trop de boutons") : outils de debug repliés (rarement utiles au quotidien). -->
        <details style="margin-top:6px">
          <summary style="cursor:pointer;color:rgba(255,255,255,0.6);font-size:13px;font-weight:600;padding:8px 0;min-height:36px;list-style:none">🔧 Diagnostics avancés (debug)</summary>
          <button class="ax-btn ax-btn-secondary" id="ax-zoom-inspector-btn" style="${btnFullWidthStyle};margin-top:10px;background:rgba(201,162,39,0.15);color:var(--ax-gold-deep);border:1px solid rgba(201,162,39,0.3)">🔍 Zoom Inspector live (debug UX zoom Kevin)</button>
          <button class="ax-btn ax-btn-secondary" id="ax-cf-diagnostic-btn" style="${btnFullWidthStyle};margin-top:10px;background:rgba(247,131,34,0.15);color:var(--ax-warning);border:1px solid rgba(247,131,34,0.3)">☁️ Tester Cloudflare API maintenant</button>
          <div id="ax-cf-diagnostic-results" class="ax-gs-249"></div>
          <button class="ax-btn ax-btn-secondary" id="ax-functional-test-btn" style="${btnFullWidthStyle};margin-top:10px;background:rgba(106,138,255,0.15);color:var(--ax-blue);border:1px solid rgba(106,138,255,0.35)">🧪 Tester tous les boutons + auto-fix</button>
          <div id="ax-functional-test-results" class="ax-gs-249"></div>
          <button class="ax-btn ax-btn-secondary" id="ax-layout-inspect-btn" style="${btnFullWidthStyle};margin-top:10px;background:rgba(180,90,200,0.15);color:var(--ax-purple);border:1px solid rgba(180,90,200,0.35)">📐 Scanner la vue actuelle (overflow, boutons cachés)</button>
          <div id="ax-layout-inspect-results" class="ax-gs-249"></div>
        </details>
      </section>

      <section class="ax-modernized-card" style="${sectionStyle};animation-delay:240ms">
        <h2 style="${sectionHeaderStyle}"><span style="${iconBadgeStyle}">🔊</span> Voix &amp; Lecture</h2>
        <p class="ax-gs-437">
          Apex peut lire ses réponses à voix haute. Choisis ta voix préférée parmi 60+ (PRO, FUN, Thématique).
        </p>
        <label style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:rgba(255,255,255,0.03);border-radius:10px;margin-bottom:10px;cursor:pointer">
          <span class="ax-gs-164">Lire automatiquement les réponses</span>
          <input type="checkbox" id="ax-settings-auto-read" aria-label="Lire automatiquement les réponses à voix haute" class="ax-gs-439">
        </label>
        <div id="ax-voice-current" class="ax-gs-438">Voix active : ...</div>
        <div id="ax-voice-categories" style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">
          <button class="ax-btn ax-btn-secondary ax-voice-cat-btn" data-cat="all" style="padding:6px 12px;font-size:12px;border-radius:14px;background:rgba(232,184,48,0.15);color:var(--ax-gold);border:1px solid rgba(232,184,48,0.3);cursor:pointer">Tous</button>
          <button class="ax-btn ax-btn-secondary ax-voice-cat-btn" data-cat="pro" style="padding:6px 12px;font-size:12px;border-radius:14px;background:rgba(106,138,255,0.15);color:var(--ax-blue);border:1px solid rgba(106,138,255,0.3);cursor:pointer">PRO</button>
          <button class="ax-btn ax-btn-secondary ax-voice-cat-btn" data-cat="fun" style="padding:6px 12px;font-size:12px;border-radius:14px;background:rgba(255,170,0,0.15);color:var(--ax-warning);border:1px solid rgba(255,170,0,0.3);cursor:pointer">FUN</button>
          <button class="ax-btn ax-btn-secondary ax-voice-cat-btn" data-cat="thematic" style="padding:6px 12px;font-size:12px;border-radius:14px;background:rgba(160,96,255,0.15);color:var(--ax-purple);border:1px solid rgba(160,96,255,0.3);cursor:pointer">Thématique</button>
        </div>
        <div id="ax-voice-list" style="max-height:360px;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:10px;padding:8px" aria-busy="true" aria-live="polite">
          <div class="ax-voice-skeleton" style="display:flex;flex-direction:column;gap:6px">
            <div style="height:48px;background:linear-gradient(90deg,rgba(255,255,255,0.04) 0%,rgba(255,255,255,0.08) 50%,rgba(255,255,255,0.04) 100%);background-size:200% 100%;animation:ax-shimmer-loading 1.4s linear infinite;border-radius:8px"></div>
            <div style="height:48px;background:linear-gradient(90deg,rgba(255,255,255,0.04) 0%,rgba(255,255,255,0.08) 50%,rgba(255,255,255,0.04) 100%);background-size:200% 100%;animation:ax-shimmer-loading 1.4s linear infinite 200ms;border-radius:8px"></div>
            <div style="height:48px;background:linear-gradient(90deg,rgba(255,255,255,0.04) 0%,rgba(255,255,255,0.08) 50%,rgba(255,255,255,0.04) 100%);background-size:200% 100%;animation:ax-shimmer-loading 1.4s linear infinite 400ms;border-radius:8px"></div>
          </div>
        </div>
      </section>

      <section class="ax-modernized-card" style="${sectionStyle};animation-delay:250ms">
        <h2 style="${sectionHeaderStyle}"><span style="${iconBadgeStyle}">🧰</span> Suggestions outils</h2>
        <p class="ax-gs-437">
          Quand Apex détecte un outil pertinent dans tes messages (Studio Music, Finance Pro, etc.), il l'affiche directement dans le chat en plus du toast.
        </p>
        <label style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:rgba(255,255,255,0.03);border-radius:10px;cursor:pointer">
          <span style="color:rgba(255,255,255,0.85);font-size:14px">Cards outils dans le chat</span>
          <input type="checkbox" id="ax-settings-tools-auto-embed" aria-label="Afficher cards outils dans le chat" class="ax-gs-439">
        </label>
        <p style="margin:8px 0 0;color:rgba(255,255,255,0.4);font-size:12px;line-height:1.4">Décoche pour n'avoir que le toast (5s) sans card permanente. Le bouton ✕ sur chaque card permet aussi de la fermer.</p>
      </section>

      <section class="ax-modernized-card" style="${sectionStyle};animation-delay:260ms">
        <h2 style="${sectionHeaderStyle}"><span style="${iconBadgeStyle}">🔄</span> Mise à jour</h2>
        <p class="ax-gs-437">
          Si Apex reste bloqué sur une ancienne version malgré le reload (bug Safari iOS PWA cache), force le reset complet : Service Worker + caches + reload propre vers la dernière version.
        </p>
        <div id="ax-force-update-status" class="ax-gs-438"></div>
        <button class="ax-btn ax-btn-secondary" id="ax-force-update-btn" style="${btnFullWidthStyle};background:rgba(232,184,48,0.15);color:var(--ax-gold);border:1px solid rgba(232,184,48,0.3)">🔄 Force reset PWA + reload</button>
      </section>

      <section class="ax-modernized-card" style="${sectionStyle};animation-delay:280ms">
        <h2 style="${sectionHeaderStyle}"><span style="${iconBadgeStyle}">🔐</span> Compte</h2>
        <button class="ax-btn ax-btn-danger" id="ax-settings-logout" style="${btnFullWidthStyle};background:rgba(255,91,91,0.15);color:var(--ax-error);border:1px solid rgba(255,91,91,0.3)">🚪 Se déconnecter</button>
      </section>

      <p class="ax-gs-235"><a href="#chat" style="color:var(--ax-gold);text-decoration:none;font-size:14px;font-weight:500;display:inline-flex;align-items:center;gap:6px;padding:10px 20px;background:rgba(232,184,48,0.08);border-radius:24px;border:1px solid rgba(232,184,48,0.2);transition:all 200ms">← Retour chat</a></p>
    </div>
  `);
  /* Wire memory-bridge section : status read-only + sync button */
  void (async () => {
    try {
      const { memoryBridge } = await import('../../services/storage/memory-bridge.js');
      const statusEl = rootEl.querySelector<HTMLElement>('#ax-memory-bridge-status');
      const syncBtn = rootEl.querySelector<HTMLButtonElement>('#ax-memory-bridge-sync');
      const refreshStatus = (): void => {
        if (!statusEl) return;
        const health = memoryBridge.getHealth();
        const allStatus = memoryBridge.getStatus();
        const lastOk = allStatus.filter((s) => s.last_success).length;
        statusEl.textContent =
          `${health.backends_configured} backends configurés · ${lastOk}/${allStatus.length} dernier sync OK`;
      };
      refreshStatus();
      if (syncBtn && activeSettingsScope) activeSettingsScope.bind(syncBtn, 'click', () => {
        void (async () => {
          if (syncBtn) syncBtn.disabled = true;
          const results = await memoryBridge.runAutoSync();
          const ok = results.filter((r) => r.ok).length;
          const { toast } = await import('../../ui/toast.js');
          if (results.length === 0) toast.warn('Aucun backend configuré');
          else if (ok === results.length) toast.success(`Sync OK (${ok}/${results.length})`);
          else toast.warn(`Sync partielle (${ok}/${results.length})`);
          refreshStatus();
          if (syncBtn) syncBtn.disabled = false;
        })();
      });
    } catch (err: unknown) {
      logger.warn('feature-settings', 'memory-bridge wire failed', { err });
    }
  })();
  /* Sprint 8 v13.0.71 : Wire consumption-anomaly-detector (Kevin demande conso temps réel) */
  const consoBtn = rootEl.querySelector<HTMLButtonElement>('#ax-conso-scan');
  if (consoBtn && activeSettingsScope) activeSettingsScope.bind(consoBtn, 'click', () => {
    void (async () => {
      try {
        const { consumptionAnomalyDetector } = await import('../../services/observability/consumption-anomaly-detector.js');
        const reports = consumptionAnomalyDetector.scanAllVerbose();
        const out = rootEl.querySelector<HTMLDivElement>('#ax-conso-results');
        if (!out) return;
        out.innerHTML = reports.map((r) => {
          /* v13.4.232 finding P0.9 — severity color mapping Apple HIG :
           * critical=red, high=orange-bright, medium=yellow, low=blue */
          const color = r.severity === 'critical' ? 'var(--ax-sev-critical)'
            : r.severity === 'high' ? 'var(--ax-sev-high)'
            : r.severity === 'medium' ? 'var(--ax-sev-medium)'
            : r.severity === 'low' ? 'var(--ax-sev-low)' : 'var(--ax-green)';
          const sevClass = r.severity === 'critical' ? 'ax-sev-critical'
            : r.severity === 'high' ? 'ax-sev-high'
            : r.severity === 'medium' ? 'ax-sev-medium'
            : r.severity === 'low' ? 'ax-sev-low' : 'ax-sev-low';
          const icon = r.severity === 'critical' ? '🚨'
            : r.severity === 'high' ? '⚠️'
            : r.severity === 'medium' ? '🟡'
            : r.severity === 'low' ? '🔵' : '✅';
          return `<div style="background:rgba(255,255,255,0.03);border-left:3px solid ${color};padding:8px 12px;margin-top:6px;border-radius:4px">
            <strong style="color:${color}">${icon} ${r.service}</strong> <span class="ax-sev ${sevClass}">${r.severity}</span>
            <div class="ax-gs-165">${r.reason}</div>
            <div style="font-size:11px;margin-top:4px">${r.recommended_action}</div>
            ${renderRechargeAction({ rechargeUrl: r.recharge_url, rotateUrl: r.rotate_url, variant: 'inline' })}
          </div>`;
        }).join('');
      } catch (err: unknown) {
        logger.warn('feature-settings', 'conso scan failed', { err });
      }
    })();
  });

  /* v13.4.111 — Zoom Inspector live (Kevin "UX zoom encore" 8e fois). */
  const zoomBtn = rootEl.querySelector<HTMLButtonElement>('#ax-zoom-inspector-btn');
  if (zoomBtn && activeSettingsScope) {
    activeSettingsScope.bind(zoomBtn, 'click', () => {
      void (async () => {
        const { apexZoomInspector } = await import('../../services/admin/apex-zoom-inspector.js');
        if (apexZoomInspector.isVisible()) {
          apexZoomInspector.hide();
        } else {
          apexZoomInspector.show();
        }
      })();
    });
  }

  /* v13.4.182 (Kevin "intègre un bouton" + "rapport historique auto dans admin") :
   * Bouton 🧪 Tester tous les boutons + auto-fix. Persist historique pour vue admin. */
  const functionalBtn = rootEl.querySelector<HTMLButtonElement>('#ax-functional-test-btn');
  if (functionalBtn && activeSettingsScope) {
    activeSettingsScope.bind(functionalBtn, 'click', () => {
      void (async () => {
        const resultsEl = rootEl.querySelector<HTMLDivElement>('#ax-functional-test-results');
        if (!resultsEl) return;
        resultsEl.innerHTML = '<div style="color:var(--ax-blue)">⏳ Test des boutons en cours (jusqu\'à 40 boutons, ~30s)...</div>';
        try {
          const { apexFunctionalTester } = await import('../../services/admin/apex-functional-tester.js');
          const { reportsHistory } = await import('../../services/admin/apex-reports-history.js');
          const out = await apexFunctionalTester.testAndAutoFix({ maxButtons: 30 });
          reportsHistory.recordFunctional(out.before, out.fixes, out.after, out.improvement);
          const okPct = out.before.tested > 0 ? Math.round((out.before.ok / out.before.tested) * 100) : 0;
          const improveStr = out.after
            ? ` → après fix : ${Math.round((out.after.ok / Math.max(1, out.after.tested)) * 100)}% OK (${out.improvement > 0 ? '+' : ''}${Math.round(out.improvement * 100)}%)`
            : '';
          const sampleBugs = out.before.details
            .filter((d) => d.status === 'no_response' || d.status === 'error')
            .slice(0, 5)
            .map(
              (d) =>
                `<li class="ax-gs-250">${escapeHtml(d.label || '(no label)')} → ${escapeHtml(d.status)}</li>`,
            )
            .join('');
          const appliedSafe = out.fixes.applied.map((f) => escapeHtml(String(f))).join(', ');
          resultsEl.innerHTML = `
            <div style="background:rgba(106,138,255,0.08);border:1px solid rgba(106,138,255,0.3);border-radius:8px;padding:10px;color:#fff;font-size:12px">
              <div class="ax-gs-166">🧪 Test fonctionnel terminé</div>
              <div>Testés : <b>${out.before.tested}</b>/${out.before.totalButtons} · OK : <b class="ax-gs-222">${out.before.ok} (${okPct}%)</b> · No-response : <b style="color:var(--ax-sev-high)">${out.before.noResponse}</b> · Erreurs : <b style="color:var(--ax-error)">${out.before.errors}</b> · Skipped : ${out.before.skipped}${improveStr}</div>
              ${out.fixes.applied.length ? `<div class="ax-gs-75">🔧 Auto-fix appliqué : ${appliedSafe}</div>` : ''}
              ${out.fixes.escalated ? '<div style="margin-top:6px;color:var(--ax-error)">⚠ Escaladé à Claude Code (ax_claude_todo)</div>' : ''}
              ${sampleBugs ? `<ul style="margin:6px 0 0 16px;padding:0">${sampleBugs}</ul>` : ''}
              <div class="ax-gs-167">→ Historique complet dans Admin (Apex Audits Live)</div>
            </div>
          `;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          resultsEl.innerHTML = `<div class="ax-gs-76">❌ Erreur test : ${escapeHtml(msg)}</div>`;
        }
      })();
    });
  }

  /* v13.4.182 — Bouton 📐 Scanner la vue actuelle (layout inspector) */
  const layoutBtn = rootEl.querySelector<HTMLButtonElement>('#ax-layout-inspect-btn');
  if (layoutBtn && activeSettingsScope) {
    activeSettingsScope.bind(layoutBtn, 'click', () => {
      void (async () => {
        const resultsEl = rootEl.querySelector<HTMLDivElement>('#ax-layout-inspect-results');
        if (!resultsEl) return;
        resultsEl.innerHTML = '<div style="color:var(--ax-purple)">⏳ Scan layout...</div>';
        try {
          const { apexLayoutInspector } = await import('../../services/admin/apex-layout-inspector.js');
          const { reportsHistory } = await import('../../services/admin/apex-reports-history.js');
          const r = apexLayoutInspector.scanDom();
          reportsHistory.recordLayout(r);
          const sampleHidden = r.hiddenButtons.slice(0, 5).map(
            (b) => `<li class="ax-gs-250">"${b.label}" → ${b.reason}</li>`
          ).join('');
          const sampleOverflow = r.overflowingElements.slice(0, 5).map(
            (e) => `<li style="color:var(--ax-error);font-size:11px">${e.tag} (+${e.overflowBy}px)</li>`
          ).join('');
          resultsEl.innerHTML = `
            <div style="background:rgba(180,90,200,0.08);border:1px solid rgba(180,90,200,0.3);border-radius:8px;padding:10px;color:#fff;font-size:12px">
              <div class="ax-gs-166">📐 Layout scan</div>
              <div>Viewport : ${r.viewport.width}×${r.viewport.height} · Document : ${r.documentScroll.width}px</div>
              <div>Overflow horizontal : <b style="color:${r.hasHorizontalOverflow ? 'var(--ax-error)' : 'var(--ax-green)'}">${r.hasHorizontalOverflow ? 'OUI' : 'NON'}</b> · Boutons cachés : <b style="color:${r.hiddenButtons.length ? 'var(--ax-sev-high)' : 'var(--ax-green)'}">${r.hiddenButtons.length}</b> · Touch < 44px : ${r.smallTouchTargets.length}</div>
              ${sampleHidden ? `<div class="ax-gs-75">Boutons cachés:</div><ul class="ax-gs-440">${sampleHidden}</ul>` : ''}
              ${sampleOverflow ? `<div class="ax-gs-75">Éléments overflow:</div><ul class="ax-gs-440">${sampleOverflow}</ul>` : ''}
              <div class="ax-gs-167">→ Historique complet dans Admin (Apex Audits Live)</div>
            </div>
          `;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          /* v13.4.187 audit XSS gap #1 closure : escape même les Error.message
           * internes (peut contenir données user-controlled via stack traces). */
          resultsEl.innerHTML = `<div class="ax-gs-76">❌ Erreur scan : ${escapeHtml(msg)}</div>`;
        }
      })();
    });
  }

  /* v13.4.120 (Kevin "verifie maintenant avant d'etre bloque") :
   * Bouton manuel diagnostic Cloudflare API. Run on-demand + affiche
   * resultat detaille des 6 checks dans la div ax-cf-diagnostic-results. */
  const cfDiagBtn = rootEl.querySelector<HTMLButtonElement>('#ax-cf-diagnostic-btn');
  if (cfDiagBtn && activeSettingsScope) {
    activeSettingsScope.bind(cfDiagBtn, 'click', () => {
      void (async () => {
        const resultsEl = rootEl.querySelector<HTMLDivElement>('#ax-cf-diagnostic-results');
        if (!resultsEl) return;
        resultsEl.innerHTML = '<div class="ax-gs-168">⏳ Test Cloudflare API en cours...</div>';
        try {
          const { apexCloudflareVaultDeploy } = await import('../../services/vault/apex-cloudflare-vault-deploy.js');
          const diag = await apexCloudflareVaultDeploy.runDiagnostic();
          const row = (label: string, ok: boolean, detail?: string): string => `
            <div style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:13px">
              <span style="color:${ok ? 'var(--ax-green)' : 'var(--ax-error)'};font-weight:700">${ok ? '✅' : '❌'}</span>
              <span style="flex:1;color:rgba(255,255,255,0.85)">${label}</span>
              ${detail ? `<span class="ax-gs-107">${detail}</span>` : ''}
            </div>`;
          let html = '<div style="background:rgba(15,15,25,0.8);border:1px solid rgba(247,131,34,0.3);border-radius:10px;padding:12px;margin-top:10px">';
          html += '<div style="color:var(--ax-warning);font-weight:700;margin-bottom:8px">☁️ Diagnostic Cloudflare</div>';
          html += row('Token Cloudflare présent', diag.token_present);
          html += row('Token valide (HTTP 200)', diag.token_valid, diag.http_status ? `HTTP ${diag.http_status}` : '');
          html += row('Account ID accessible', !!diag.account_id, diag.account_name ?? diag.account_id ?? '');
          html += row('Permission KV (Workers KV Storage:Edit)', diag.kv_permission, diag.namespace_id ? `ns ${diag.namespace_id.slice(0, 8)}…` : '');
          html += row('Permission Workers (auto-deploy futur)', diag.workers_permission);
          html += row('Namespace apex-vault-kevin existe', diag.namespace_exists);
          if (diag.error_reason) {
            html += `<div style="margin-top:10px;padding:8px;background:rgba(255,91,91,0.1);border-left:3px solid var(--ax-error);color:var(--ax-error);font-size:12px;border-radius:4px">${diag.error_reason}</div>`;
          }
          if (diag.fix_url) {
            html += `<div class="ax-gs-114"><a href="${diag.fix_url}" target="_blank" rel="noopener" style="color:var(--ax-blue);font-size:12px">🔗 Fix : ${diag.fix_url}</a></div>`;
          }
          html += '</div>';
          resultsEl.innerHTML = html;
          logger.info('cf-diag-manual', `Diagnostic result : token=${diag.token_valid} kv=${diag.kv_permission} workers=${diag.workers_permission}`);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          /* v13.4.133 audit-grade : DOM API (msg pourrait contenir HTML user-controlled) */
          resultsEl.textContent = '';
          const errDiv = document.createElement('div');
          errDiv.style.color = 'var(--ax-error)';
          errDiv.textContent = `❌ Erreur : ${msg.slice(0, 100)}`;
          resultsEl.append(errDiv);
        }
      })();
    });
  }

  /* Wire new data-nav-route buttons (CSP strict, no inline onclick) */
  rootEl.querySelectorAll<HTMLElement>('[data-nav-route]').forEach((el) => {
    activeSettingsScope!.bind(el, 'click', () => {
      const route = el.getAttribute('data-nav-route');
      if (route) location.hash = '#' + route;
    });
  });
  const logoutBtn = rootEl.querySelector<HTMLButtonElement>('#ax-settings-logout');
  if (logoutBtn && activeSettingsScope) activeSettingsScope.bind(logoutBtn, 'click', () => {
    void (async () => {
      const { auth } = await import('../../services/auth/auth.js');
      auth.logout();
      location.hash = '#login';
    })();
  });

  /* Toggle "tools auto embed in chat" — Kevin bug "modules apparaissent tout seuls" 2026-05-07 */
  const toolsAutoEmbedToggle = rootEl.querySelector<HTMLInputElement>('#ax-settings-tools-auto-embed');
  if (toolsAutoEmbedToggle && activeSettingsScope) {
    try {
      const settings = JSON.parse(localStorage.getItem('ax_settings') ?? '{}') as Record<string, unknown>;
      toolsAutoEmbedToggle.checked = settings['tools_auto_embed'] !== false; /* default true */
    } catch { toolsAutoEmbedToggle.checked = true; }
    activeSettingsScope.bind(toolsAutoEmbedToggle, 'change', () => {
      try {
        const settings = JSON.parse(localStorage.getItem('ax_settings') ?? '{}') as Record<string, unknown>;
        settings['tools_auto_embed'] = toolsAutoEmbedToggle.checked;
        localStorage.setItem('ax_settings', JSON.stringify(settings));
      } catch { /* silent */ }
    });
  }

  /* Force update PWA — fix bug Safari iOS cache tenace (Kevin 2026-05-07) */
  const forceUpdateBtn = rootEl.querySelector<HTMLButtonElement>('#ax-force-update-btn');
  const forceUpdateStatus = rootEl.querySelector<HTMLElement>('#ax-force-update-status');
  if (forceUpdateBtn && activeSettingsScope) activeSettingsScope.bind(forceUpdateBtn, 'click', () => {
    void (async () => {
      const updateStatus = (msg: string): void => {
        if (forceUpdateStatus) forceUpdateStatus.textContent = msg;
      };
      forceUpdateBtn.disabled = true;
      forceUpdateBtn.textContent = '⏳ Reset en cours…';
      try {
        updateStatus('🔍 Désinstallation Service Workers…');
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          for (const r of regs) await r.unregister();
          updateStatus(`✅ ${regs.length} SW désinstallés`);
        }
        updateStatus('🔍 Vidage caches PWA…');
        if ('caches' in window) {
          const keys = await caches.keys();
          for (const k of keys) await caches.delete(k);
          updateStatus(`✅ ${keys.length} caches vidés`);
        }
        updateStatus('✅ Reset terminé. Rechargement dans 2s…');
        const { toast } = await import('../../ui/toast.js');
        toast.info('🔄 Reset OK — reload imminent');
        setTimeout(() => {
          location.href = location.pathname + '?_forceupd=1&_reset=' + Date.now();
        }, 2000);
      } catch (err) {
        updateStatus(`❌ Erreur : ${String(err)}`);
        forceUpdateBtn.disabled = false;
        forceUpdateBtn.textContent = '🔄 Force reset PWA + reload';
      }
    })();
  });
  /* Wire voice section : auto-read toggle + voice list (61 voix) + test ▶ + définir comme défaut.
     Demande Kevin : "qu'il puisse me lire les choses, me raconter etc, que je choisisse les voix". */
  void wireVoiceSection(rootEl);

  const notifBtn = rootEl.querySelector<HTMLButtonElement>('#ax-settings-notif-test');
  if (notifBtn && activeSettingsScope) activeSettingsScope.bind(notifBtn, 'click', () => {
    void (async () => {
      try {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Test Apex', { body: 'Si tu vois ça, push notif fonctionne ✅' });
        } else if ('Notification' in window) {
          const perm = await Notification.requestPermission();
          if (perm === 'granted') {
            new Notification('Test Apex', { body: 'Push activé ✅' });
          } else {
            const { toast } = await import('../../ui/toast.js');
            toast.warn('Permission notifications refusée');
          }
        } else {
          const { toast } = await import('../../ui/toast.js');
          toast.warn('Notifications non supportées par ce navigateur');
        }
      } catch {
        const { toast } = await import('../../ui/toast.js');
        toast.warn('Test notification échoué');
      }
    })();
  });
  logger.info('feature-settings', 'rendered');
}
