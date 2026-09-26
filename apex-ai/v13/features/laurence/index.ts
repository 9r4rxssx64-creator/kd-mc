/**
 * APEX v13 — Vue Laurence (épurée, créative, innovante).
 *
 * Demandes Kevin (CLAUDE.md règles permanentes) :
 * - "Vue Laurence : bulles emoji + wallpaper + diaporama + commandes vocales"
 *   (ref Apex v12.226-227)
 * - Isolation totale : pas de menu admin, pas de visibilité autres clients
 * - Historique complet remonte admin Kevin pour TOUT (questions, projets, erreurs)
 * - Permissions tiered (auto / notify / validate Kevin)
 * - UX épurée comme un enfant de 5 ans
 *
 * Innovations design :
 * - Hero gradient personnalisé (rose Laurence vs or Kevin)
 * - Bulles emoji rondes style iOS messages
 * - Wallpaper diaporama fade-in 8s auto
 * - Bouton 🎙 voice prominent (big touch target 80px)
 * - Suggestions intelligentes basées historique
 * - Animations subtle (pulse douce, fade gracieux)
 * - Mode "Bonjour Laurence" personnalisé selon heure
 * - Cards arrondies soft shadows
 */

import { escapeAttr, escapeHtml } from '../../core/escape-html.js';
import { store } from '../../core/store.js';
import { guardFeatureEnabled } from '../../services/auth/feature-guard.js';
import { permissions } from '../../services/auth/permissions.js';
import { auditLog } from '../../services/observability/audit-log.js';

const LAURENCE_WALLPAPERS = [
  'linear-gradient(135deg, #ffd6e8 0%, #c9a4ff 50%, #a4c8ff 100%)', /* Rose-violet-bleu */
  'linear-gradient(135deg, #ffe4ec 0%, #ffb3d9 50%, #d4a5ff 100%)', /* Rose pastel */
  'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',              /* Violet-bleu doux */
  'linear-gradient(135deg, #f6d365 0%, #fda085 100%)',              /* Sunset doux */
  'linear-gradient(135deg, #d4fc79 0%, #96e6a1 100%)',              /* Vert pastel */
];

function getGreetingByHour(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Bonne nuit';
  if (h < 12) return 'Bonjour';
  if (h < 18) return 'Bon après-midi';
  if (h < 22) return 'Bonsoir';
  return 'Bonne soirée';
}

function getRandomWallpaper(): string {
  /* Stable au cours d'une session : seed = jour de l'année */
  const day = Math.floor(Date.now() / 86400000);
  const idx = day % LAURENCE_WALLPAPERS.length;
  return LAURENCE_WALLPAPERS[idx] ?? LAURENCE_WALLPAPERS[0] ?? '#ffd6e8';
}

function renderSuggestionChip(emoji: string, label: string, action: string): string {
  return `
    <button type="button" class="ax-laurence-chip" data-action="${escapeAttr(action)}">
      <span class="ax-laurence-chip-emoji">${escapeHtml(emoji)}</span>
      <span class="ax-laurence-chip-label">${escapeHtml(label)}</span>
    </button>
  `;
}

/**
 * Render vue Laurence (router-compatible).
 */
export function render(root: HTMLElement): void {
  /* Wire admin feature toggle (Kevin règle 2026-05-04 — ON/OFF tout). */
  const uid = (store.get('user') as { id?: string } | null)?.id ?? 'anon';
  if (!guardFeatureEnabled('module.laurence', root, uid)) return;
  const greeting = getGreetingByHour();
  const wallpaper = getRandomWallpaper();
  /* P1-10 fix (audit v13.2.5) : récup userName depuis store ou fallback localStorage. */
  const storedUser = store.get('user') as { name?: string } | null;
  const userName = storedUser?.name?.split(/\s+/)[0]
    ?? localStorage.getItem('apex_v13_laurence_name')
    ?? 'Laurence';

  /* Audit log : ouverture vue Laurence (remonte Kevin) */
  void auditLog.record('laurence.view_opened', {
    details: { greeting, ts: Date.now() },
  });

  root.innerHTML = `
    <div class="ax-laurence-app" style="background:${wallpaper}">
      <!-- Wallpaper diaporama overlay -->
      <div class="ax-laurence-wallpaper-overlay" aria-hidden="true"></div>

      <!-- Hero -->
      <header class="ax-laurence-hero">
        <div class="ax-laurence-greeting">
          <span class="ax-laurence-emoji-big">🌸</span>
          <h1>${escapeHtml(greeting)} <strong>${escapeHtml(userName)}</strong></h1>
          <p class="ax-laurence-subtitle">Qu'est-ce que je peux faire pour toi ?</p>
        </div>
      </header>

      <!-- Suggestions chips -->
      <section class="ax-laurence-suggestions" aria-label="Suggestions">
        ${renderSuggestionChip('🎵', 'Mixer une musique', 'studio:music')}
        ${renderSuggestionChip('🎬', 'Monter une vidéo', 'studio:video')}
        ${renderSuggestionChip('💬', 'Discuter', 'chat:open')}
        ${renderSuggestionChip('🎙', 'Dicter', 'voice:start')}
        ${renderSuggestionChip('📸', 'Scanner', 'studio:scan')}
        ${renderSuggestionChip('🌐', 'Traduire', 'pro:translator')}
        ${renderSuggestionChip('🍳', 'Cuisine', 'pro:cuisine')}
        ${renderSuggestionChip('🌱', 'Plantes', 'studio:plant')}
      </section>

      <!-- Bouton voice central prominent -->
      <div class="ax-laurence-voice-zone">
        <button type="button" class="ax-laurence-voice-btn" data-action="voice:start" aria-label="Parler à Apex">
          <span class="ax-laurence-voice-emoji">🎙</span>
          <span class="ax-laurence-voice-pulse"></span>
        </button>
        <p class="ax-laurence-voice-hint">Touche pour parler<br>ou dis <strong>"Dis Apex"</strong></p>
      </div>

      <!-- Mes derniers projets -->
      <section class="ax-laurence-projects" aria-label="Mes projets récents">
        <h2>📂 Mes derniers projets</h2>
        <div class="ax-laurence-projects-list" id="ax-laurence-projects-list">
          <!-- Empty state élégant -->
          <div class="ax-laurence-empty">
            <span class="ax-laurence-empty-emoji">✨</span>
            <p>Tes projets apparaîtront ici dès la première création.</p>
          </div>
        </div>
      </section>

      <!-- Footer minimaliste -->
      <footer class="ax-laurence-footer">
        <span class="ax-laurence-footer-brand">APEX AI</span>
        <span class="ax-laurence-footer-by">Créé par DK</span>
      </footer>
    </div>
  `;

  /* Wire suggestions click → audit log + navigation */
  root.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest<HTMLElement>('[data-action]');
    if (!btn) return;
    const action = btn.dataset['action'];
    if (!action) return;

    /* Audit log obligatoire (historique remonte Kevin) */
    void auditLog.record('laurence.action_clicked', {
      details: { action, ts: Date.now() },
    });

    /* Permissions check */
    const perm = permissions.check(action);
    if (perm === 'denied') {
      /* Permission refusée — ne devrait jamais arriver pour Laurence sur ces actions */
      return;
    }
    if (perm === 'validate') {
      /* Action niveau C → notif Kevin pour validation */
      void auditLog.record('laurence.action_pending_kevin_validation', {
        details: { action },
      });
      /* P1-10 fix (audit v13.2.5) : modal blocking en attente validation Kevin. */
      void import('../../ui/toast.js').then(({ toast }) => {
        toast.warn(
          `⏳ Demande envoyée à Kevin pour validation (${action}). Tu seras notifiée dès qu'il aura répondu.`,
        );
      });
      return;
    }
    if (perm === 'notify') {
      /* Action niveau B → push Kevin */
      void auditLog.record('laurence.action_notified_kevin', {
        details: { action },
      });
    }

    /* Dispatch action via hash router (chat / studio / voice / pro) */
    if (action.startsWith('studio:')) {
      window.location.hash = `#/studios?focus=${action.slice(7)}`;
    } else if (action.startsWith('pro:')) {
      window.location.hash = `#/pro?focus=${action.slice(4)}`;
    } else if (action === 'chat:open') {
      window.location.hash = '#/chat';
    } else if (action === 'voice:start') {
      /* Fire event pour wake-word service */
      window.dispatchEvent(new CustomEvent('apex:voice:start'));
    }
  });

  /* Animation diaporama wallpaper : change toutes les 8s */
  let wallpaperIdx = 0;
  const wallpaperInterval = setInterval(() => {
    wallpaperIdx = (wallpaperIdx + 1) % LAURENCE_WALLPAPERS.length;
    const app = root.querySelector<HTMLElement>('.ax-laurence-app');
    const wp = LAURENCE_WALLPAPERS[wallpaperIdx];
    if (app && wp) app.style.background = wp;
  }, 8000);

  /* Cleanup au unmount (SPA navigation) */
  const observer = new MutationObserver(() => {
    if (!document.body.contains(root) || !root.querySelector('.ax-laurence-app')) {
      clearInterval(wallpaperInterval);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

/**
 * Permissions tier "laurence" déjà géré par services/permissions.ts.
 * Ce module se contente de la VUE — la logique permissions est centralisée.
 */
export const LAURENCE_VIEW_VERSION = 'v13.0.20';
