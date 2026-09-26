/**
 * APEX v13 — chat-misc-wiring.ts
 * Wiring de boutons header autonomes du chat : logo (long-press → diagnostic
 * admin) + bascule de mode IA (#ax-chat-mode-toggle).
 *
 * Extrait de features/chat/index.ts render() (v13.4.300, refactor monolithe
 * sans régression). Aucune dépendance d'état module. Appelé par render().
 */
import { logger } from '../../core/logger.js';
import { store } from '../../core/store.js';
import { vault } from '../../services/vault/vault.js';
import { haptic } from '../../ui/haptic.js';
import { modalSheet } from '../../ui/modal-sheet.js';
import { toast } from '../../ui/toast.js';

import { escapeHtml } from './chat-markdown.js';

/** Câble le logo (long-press diag) + la bascule de mode IA. */
export function wireLogoAndModeToggle(rootEl: HTMLElement): void {
  const logoEl = rootEl.querySelector<HTMLHeadingElement>('#ax-chat-logo');
  if (logoEl) {
    let pressTimer: number | null = null;
    const startPress = (): void => {
      if (pressTimer !== null) return;
      pressTimer = window.setTimeout(async () => {
        pressTimer = null;
        const isAdminUser = store.get('isAdmin');
        if (!isAdminUser) return; /* discret : long-press silencieux pour non-admin */
        haptic.tap();
        try {
          const { router } = await import('../../core/router.js');
          router.navigate('admin-health-dashboard');
        } catch {
          /* fallback : ouvrir diagnostic SOS direct si dashboard non chargeable */
          try {
            const { sosRescue } = await import('../../ui/sos-rescue.js');
            sosRescue.openDiagnosticDirect();
          } catch { /* ignore */ }
        }
      }, 3000);
    };
    const cancelPress = (): void => {
      if (pressTimer !== null) {
        window.clearTimeout(pressTimer);
        pressTimer = null;
      }
    };
    logoEl.addEventListener('mousedown', startPress);
    logoEl.addEventListener('mouseup', cancelPress);
    logoEl.addEventListener('mouseleave', cancelPress);
    logoEl.addEventListener('touchstart', startPress, { passive: true });
    logoEl.addEventListener('touchend', cancelPress);
    logoEl.addEventListener('touchcancel', cancelPress);
  }

  /* v13.4.273 (Kevin "Revois l'utilisation des différentes ia que tout soit
   * bien en place avec eco token") : toggle 1-tap mode routing IA depuis le
   * header chat. Cycle auto → economy → premium → auto. Toast indique le
   * nouveau mode + icône bouton change pour refléter l'état courant. */
  const modeToggleBtn = rootEl.querySelector<HTMLButtonElement>('#ax-chat-mode-toggle');
  const MODE_ICONS: Record<string, string> = { auto: '⚡', economy: '💚', premium: '👑', forced: '🎯', 'free-smart': '🆓' };
  const MODE_LABELS: Record<string, string> = {
    auto: 'Auto (intelligent, free fallback si budget)',
    economy: 'Économie (gratuit d\'abord — haiku, max_tokens /2)',
    premium: 'Premium (Anthropic Opus toujours)',
    forced: 'Forced (provider admin override)',
    /* v13.4.362 (Kevin « privilégie les IA gratuites suivant les questions »)
     * v13.4.366 (Kevin « Fait tourner Apex sur Qwen ») : Qwen gratuit en principal. */
    'free-smart': 'Gratuit malin (Qwen gratuit en principal, bascule auto vers l\'IA la plus pertinente : Anthropic pour code/raisonnement/admin, Gemini vision, Perplexity recherche)',
  };
  /* Set icon initial selon mode persisté */
  void (async () => {
    try {
      const { aiRoutingPolicy } = await import('../../services/ai/ai-routing-policy.js');
      const m = aiRoutingPolicy.getMode();
      if (modeToggleBtn) {
        modeToggleBtn.textContent = MODE_ICONS[m] ?? '⚡';
        modeToggleBtn.setAttribute('title', `Mode IA : ${MODE_LABELS[m] ?? m} — clic pour basculer`);
      }
    } catch { /* ignore */ }
  })();
  modeToggleBtn?.addEventListener('click', () => {
    haptic.tap();
    void (async () => {
      try {
        const { aiRoutingPolicy } = await import('../../services/ai/ai-routing-policy.js');
        const current = aiRoutingPolicy.getMode();
        /* v13.4.362 — Cycle : free-smart → premium → economy → auto → free-smart
         * (skip forced, admin-only). free-smart = défaut Kevin (gratuit selon la question). */
        const next: 'auto' | 'economy' | 'premium' | 'free-smart' =
          current === 'free-smart' ? 'premium'
            : current === 'premium' ? 'economy'
              : current === 'economy' ? 'auto'
                : 'free-smart';
        aiRoutingPolicy.setMode(next, true); /* choix EXPLICITE user (⚡) */
        if (modeToggleBtn) {
          modeToggleBtn.textContent = MODE_ICONS[next] ?? '⚡';
          modeToggleBtn.setAttribute('title', `Mode IA : ${MODE_LABELS[next]} — clic pour basculer`);
        }
        toast.success(`${MODE_ICONS[next]} Mode IA : ${MODE_LABELS[next]}`);
        haptic.success();
      } catch (err: unknown) {
        logger.warn('chat', 'mode-toggle failed', { err });
        toast.error('Impossible de changer de mode');
      }
    })();
  });
}


/** Câble le bouton menu hamburger (#ax-chat-menu) du chat. */
export function wireMenuButton(rootEl: HTMLElement): void {
  const menuBtn = rootEl.querySelector<HTMLButtonElement>('#ax-chat-menu');
  menuBtn?.addEventListener('click', () => {
    haptic.tap();
    const isAdminUser = store.get('isAdmin');
    const sheet = modalSheet.open({
      title: '☰ Menu',
      content: `
        <div class="ax-gs-123">
          <button class="ax-btn ax-btn-primary ax-gs-360" data-menu-nav="chat">💬 Chat</button>
          <button class="ax-btn ax-btn-primary ax-gs-360" data-menu-nav="commands">⌨️ Commandes (liste + descriptions)</button>
          ${isAdminUser ? '<button class="ax-btn ax-btn-primary ax-gs-360" data-menu-nav="admin-health-dashboard">🔗 Liens utiles &amp; santé</button>' : ''}
          ${isAdminUser ? '<button class="ax-btn ax-btn-primary ax-gs-360" data-menu-nav="admin">👑 Centre Admin</button>' : ''}
          <button class="ax-btn ax-btn-primary ax-gs-360" data-menu-nav="studios">🎨 Studios</button>
          <button class="ax-btn ax-btn-primary ax-gs-360" data-menu-nav="studio-music">🎚 Mix Musique</button>
          <button class="ax-btn ax-btn-primary ax-gs-360" data-menu-nav="studio-video">🎬 Vidéo</button>
          <button class="ax-btn ax-btn-primary ax-gs-360" data-menu-nav="studio-cv">📄 CV</button>
          <button class="ax-btn ax-btn-primary ax-gs-360" data-menu-nav="studio-invoice">🧾 Facture</button>
          <button class="ax-btn ax-btn-primary ax-gs-360" data-menu-nav="studio-contract">📋 Contrat</button>
          <button class="ax-btn ax-btn-primary ax-gs-360" data-menu-nav="pro">💼 Pro</button>
          <button class="ax-btn ax-btn-primary ax-gs-360" data-menu-nav="remote">📡 Télécommande</button>
          <button class="ax-btn ax-btn-primary ax-gs-360" data-menu-nav="browser">🌐 Browser</button>
          <button class="ax-btn ax-btn-primary ax-gs-360" data-menu-nav="domotique">🏠 Domotique</button>
          <button class="ax-btn ax-btn-primary ax-gs-360" data-menu-nav="workflow">⚡ Workflows</button>
          <button class="ax-btn ax-btn-primary ax-gs-360" data-menu-nav="crypto">₿ Crypto</button>
          <button class="ax-btn ax-btn-primary ax-gs-360" data-menu-nav="notes">📝 Bloc-notes</button>
          <button class="ax-btn ax-btn-primary ax-gs-360" data-menu-nav="calendar">📅 Calendrier</button>
          <button class="ax-btn ax-btn-primary ax-gs-360" data-menu-nav="calculators">🧮 Calculatrices</button>
          <button class="ax-btn ax-btn-primary ax-gs-360" data-menu-nav="archive">🗄 Archive</button>
          ${isAdminUser ? '<button class="ax-btn ax-btn-primary ax-gs-360" data-menu-nav="billing">💳 Comptes &amp; Factures</button>' : ''}
          ${isAdminUser ? '<button class="ax-btn ax-btn-primary ax-gs-360" data-menu-nav="sentinels">🛡 Sentinelles</button>' : ''}
          <button class="ax-btn ax-btn-primary ax-gs-360" data-menu-nav="settings">⚙️ Réglages</button>
          <button class="ax-btn ax-gs-360" data-menu-action="paste-key">🔑 Coller une clé API</button>
          <button class="ax-btn" data-menu-action="logout" style="width:100%;text-align:left;padding:14px;color:var(--ax-error)">🚪 Déconnexion</button>
        </div>
      `,
      actions: [
        { label: 'Fermer', variant: 'ghost', onClick: () => sheet.close() },
      ],
    });
    /* Wire boutons du drawer après render */
    setTimeout(() => {
      document.querySelectorAll<HTMLButtonElement>('[data-menu-nav]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const target = btn.dataset['menuNav'] ?? '';
          haptic.tap();
          sheet.close();
          if (target) location.hash = `#${target}`;
        });
      });
      document.querySelectorAll<HTMLButtonElement>('[data-menu-action]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const action = btn.dataset['menuAction'] ?? '';
          haptic.tap();
          sheet.close();
          if (action === 'paste-key') {
            /* Trigger paste flow réutilisant la modal existante */
            rootEl.querySelector<HTMLButtonElement>('#ax-paste-key-nav')?.click();
          } else if (action === 'logout') {
            rootEl.querySelector<HTMLButtonElement>('#ax-logout-nav')?.click();
          }
        });
      });
    }, 50);
  });
}


/** Câble le bouton réglages (drawer) + le flux "coller une clé API" (vault auto-detect). */
export function wireSettingsAndPasteKey(rootEl: HTMLElement, rerender: () => void): void {
  const settingsBtn = rootEl.querySelector<HTMLButtonElement>('#ax-chat-settings');
  if (!settingsBtn) {
    /* Fallback : event delegation si bouton pas wired (ex: re-render) */
    rootEl.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('#ax-chat-settings')) {
        location.hash = '#settings';
      }
    });
  }
  settingsBtn?.addEventListener('click', () => {
    haptic.tap();
    void (async () => {
      try {
        const { aiRoutingPolicy } = await import('../../services/ai/ai-routing-policy.js');
        const status = aiRoutingPolicy.getStatus();
        const recos = aiRoutingPolicy.recommendActions();
        const recosHtml = recos.length
          ? recos
              .map(
                (r) => `
              <li class="ax-gs-220">
                <span style="color:${r.priority === 'high' ? 'var(--ax-error)' : r.priority === 'medium' ? 'var(--ax-warning)' : 'var(--ax-text-dim)'}">●</span>
                ${escapeHtml(r.action)}
                ${r.url ? ` <a href="${escapeHtml(r.url)}" target="_blank" rel="noopener" class="ax-gs-221">→</a>` : ''}
              </li>
            `,
              )
              .join('')
          : '<li class="ax-gs-222">✅ Tout est configuré au mieux</li>';
        const sheet = modalSheet.open({
          title: '⚙️ Paramètres',
          content: `
            <div style="display:flex;flex-direction:column;gap:14px">
              <div>
                <h4 class="ax-gs-223">Routing IA</h4>
                <label style="display:block;margin:6px 0">
                  Mode :
                  <select id="ax-settings-mode" style="margin-left:8px;padding:6px;background:var(--ax-bg-flat);color:#fff;border:1px solid var(--ax-gold-deep);border-radius:4px">
                    <option value="auto" ${status.mode === 'auto' ? 'selected' : ''}>Auto (intelligent)</option>
                    <option value="economy" ${status.mode === 'economy' ? 'selected' : ''}>Économie (gratuit d'abord)</option>
                    <option value="premium" ${status.mode === 'premium' ? 'selected' : ''}>Premium (Anthropic toujours)</option>
                  </select>
                </label>
                <p style="margin:6px 0;color:var(--ax-text-dim);font-size:12px">
                  Anthropic : <span style="color:${status.anthropic_health === 'ok' ? 'var(--ax-green)' : status.anthropic_health === 'warn' ? 'var(--ax-warning)' : 'var(--ax-error)'}">${status.anthropic_health}</span>
                  · Gratuits dispo : ${status.free_providers_available.length}
                  · Payants dispo : ${status.paid_providers_available.length}
                </p>
              </div>
              <div>
                <h4 class="ax-gs-223">Clés API</h4>
                <button type="button" class="ax-btn ax-btn-primary ax-gs-361" id="ax-settings-paste-key">🔑 Coller une clé API</button>
              </div>
              <div>
                <h4 class="ax-gs-223">Recommandations</h4>
                <ul class="ax-gs-362">${recosHtml}</ul>
              </div>
            </div>
          `,
          actions: [
            { label: 'Fermer', variant: 'ghost', onClick: () => sheet.close() },
          ],
        });
        /* Wire mode select + paste-key trigger */
        setTimeout(() => {
          const modeSelect = document.getElementById('ax-settings-mode') as HTMLSelectElement | null;
          modeSelect?.addEventListener('change', () => {
            const newMode = modeSelect.value as 'auto' | 'economy' | 'premium' | 'forced';
            aiRoutingPolicy.setMode(newMode, true); /* choix EXPLICITE user (réglages) */
            toast.success(`Mode routing : ${newMode}`);
            haptic.medium();
          });
          const pasteBtn = document.getElementById('ax-settings-paste-key') as HTMLButtonElement | null;
          pasteBtn?.addEventListener('click', () => {
            sheet.close();
            rootEl.querySelector<HTMLButtonElement>('#ax-paste-key-nav')?.click();
          });
        }, 50);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'erreur';
        toast.error(`Paramètres indisponibles : ${msg}`);
      }
    })();
  });

  /* Paste API key handler avec auto-detect 130+ patterns + auto-test + auto-link
   * Path A repensé : modal-sheet half-bottom au lieu de prompt/alert bloquants */
  const attachPasteKey = (sel: string) => {
    const btn = rootEl.querySelector<HTMLButtonElement>(sel);
    btn?.addEventListener('click', () => {
      haptic.tap();
      const sheet = modalSheet.open({
        title: '🔑 Coller ta clé API',
        content: `
          <p class="ax-gs-363">
            Apex détecte automatiquement le service (Anthropic, OpenAI, Stripe, GitHub, etc.) et la range au bon endroit.
          </p>
          <button type="button" id="ax-paste-clipboard-btn"
            style="width:100%;padding:12px;background:linear-gradient(135deg,var(--ax-gold-deep),var(--ax-gold));color:#000;border:none;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;margin-bottom:12px;-webkit-tap-highlight-color:transparent">
            📋 Coller automatiquement depuis presse-papiers
          </button>
          <textarea id="ax-paste-input" rows="4"
            placeholder="Ou colle ici manuellement (long press → Coller)"
            style="width:100%;padding:14px;background:var(--ax-bg-flat);border:2px solid var(--ax-gold-deep);border-radius:10px;color:#ffffff !important;-webkit-text-fill-color:#ffffff;font-family:'Courier New',monospace;font-size:14px;line-height:1.5;box-sizing:border-box;resize:vertical;min-height:90px"
            autofocus spellcheck="false" autocomplete="off"
            autocapitalize="off" autocorrect="off"
            inputmode="text"></textarea>
          <div id="ax-paste-preview" style="margin-top:8px;padding:8px;background:rgba(201,162,39,0.08);border-radius:6px;font-size:12px;color:var(--ax-gold-deep);display:none">
            <span id="ax-paste-detection"></span>
          </div>
          <p class="ax-muted ax-gs-186">130+ patterns reconnus · 0 stockage des données interdites (CB, seed)</p>
        `,
        actions: [
          {
            label: 'Annuler',
            variant: 'ghost',
            onClick: () => {
              haptic.tap();
              sheet.close();
            },
          },
          {
            label: 'Coller + ranger',
            variant: 'primary',
            onClick: () => {
              const input = document.getElementById('ax-paste-input') as HTMLTextAreaElement | null;
              const value = input?.value.trim() ?? '';
              if (!value) {
                toast.warn('⚠️ Textarea vide — utilise "📋 Coller automatiquement" ou long press dans le rectangle blanc');
                return;
              }
              sheet.close();
              void (async () => {
                const result = await vault.autoStore(value);
                if (result.forbidden) {
                  haptic.error();
                  toast.error(`${result.pattern?.name} : Apex ne stocke jamais ce type de donnée pour ta sécurité.`, { duration: 6000 });
                  return;
                }
                if (!result.ok) {
                  haptic.warning();
                  toast.warn('Format non reconnu : ' + (result.reason ?? 'inconnu') + ` (taille ${value.length} chars, début: "${value.slice(0, 12)}...")`, { duration: 8000 });
                  return;
                }
                haptic.success();
                const validMsg = result.valid === true ? ' ✅ validée' : result.valid === false ? ' ⚠️ ping échoué' : '';
                toast.success(`${result.pattern?.name} rangée${validMsg}`);
                rerender();
              })();
            },
          },
        ],
      });
      /* Wire bouton "📋 Coller automatiquement" via Clipboard API */
      setTimeout(() => {
        const clipboardBtn = document.getElementById('ax-paste-clipboard-btn') as HTMLButtonElement | null;
        const input = document.getElementById('ax-paste-input') as HTMLTextAreaElement | null;
        const preview = document.getElementById('ax-paste-preview') as HTMLDivElement | null;
        const detectionEl = document.getElementById('ax-paste-detection') as HTMLSpanElement | null;
        clipboardBtn?.addEventListener('click', async () => {
          haptic.tap();
          try {
            if (!navigator.clipboard?.readText) {
              toast.warn('Clipboard API non supportée. Long press dans le textarea → Coller manuellement.');
              return;
            }
            const text = await navigator.clipboard.readText();
            const trimmed = text.trim();
            if (!trimmed) {
              toast.warn('Presse-papiers vide. Copie d\'abord ta clé puis tap ce bouton.');
              return;
            }
            if (input) input.value = trimmed;
            /* Auto-detect immédiat pour preview */
            const { detectCredential } = await import('../../services/vault/credential-patterns.js');
            const detected = detectCredential(trimmed);
            if (preview && detectionEl) {
              if (detected) {
                detectionEl.textContent = `✅ Détecté : ${detected.name} (${trimmed.length} chars)`;
                preview.style.display = 'block';
                preview.style.background = 'rgba(34,204,119,0.1)';
                preview.style.color = 'var(--ax-green)';
              } else {
                detectionEl.textContent = `⚠️ Format inconnu (${trimmed.length} chars, début "${trimmed.slice(0, 15)}...")`;
                preview.style.display = 'block';
                preview.style.background = 'rgba(255,170,0,0.1)';
                preview.style.color = 'var(--ax-warning)';
              }
            }
            toast.success('Clé collée — vérifie + tap "Coller + ranger"');
            haptic.medium();
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'erreur';
            toast.warn(`Permission presse-papiers refusée. Long press dans le textarea blanc → Coller. (${msg})`);
          }
        });
        /* Live detection au paste/input dans textarea */
        input?.addEventListener('input', async () => {
          const value = input.value.trim();
          if (!value || !preview || !detectionEl) {
            if (preview) preview.style.display = 'none';
            return;
          }
          const { detectCredential } = await import('../../services/vault/credential-patterns.js');
          const detected = detectCredential(value);
          if (detected) {
            detectionEl.textContent = `✅ Détecté : ${detected.name} (${value.length} chars)`;
            preview.style.display = 'block';
            preview.style.background = 'rgba(34,204,119,0.1)';
            preview.style.color = 'var(--ax-green)';
          } else {
            detectionEl.textContent = `⚠️ Format inconnu (${value.length} chars)`;
            preview.style.display = 'block';
            preview.style.background = 'rgba(255,170,0,0.1)';
            preview.style.color = 'var(--ax-warning)';
          }
        });
      }, 100);
    });
  };
  attachPasteKey('#ax-paste-key');
  attachPasteKey('#ax-paste-key-nav');
}
