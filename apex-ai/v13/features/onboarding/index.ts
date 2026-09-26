/**
 * APEX v13 — Feature Onboarding (5 steps premier login)
 *
 * v13.3.41 (mission INNOVATION-COMM) — Kevin règle :
 * - Anticipation max : "à chaque demande Kevin, ajouter en bonus 1-2 améliorations
 *   adjacentes utiles non demandées"
 * - Préparer commercialisation e-Apex (clients payants)
 * - UX épurée niveau Claude.ai/ChatGPT
 *
 * 5 steps :
 *  1. Bienvenue + nom user (auto-rempli si reconnu)
 *  2. Permissions device (notif/micro/caméra batch)
 *  3. 8 chips capacités à activer (toggle)
 *  4. Mode Sérieux ou Fun (set ax_mode_dual)
 *  5. Tour rapide 3 cards (chat / coffre / studios)
 *
 * Skip possible à tout moment (bouton Skip top-right).
 * Stocké : `apex_v13_onboarding_done_<uid>` = true → ne plus afficher.
 *
 * Bypass admin Kevin : reconnu via aliases → onboarding skipped auto.
 */

import { escapeHtml } from '../../core/escape-html.js';
import { createCleanupScope, type CleanupScope } from '../../core/listener-cleanup.js';
import { logger } from '../../core/logger.js';
import { router } from '../../core/router.js';
import { store } from '../../core/store.js';
import { haptic } from '../../ui/haptic.js';
import { toast } from '../../ui/toast.js';

let activeScope: CleanupScope | null = null;
let currentStep = 1;
const TOTAL_STEPS = 5;

interface OnboardingState {
  name: string;
  permissionsRequested: boolean;
  capabilities: Set<string>;
  mode: 'serious' | 'fun' | 'both';
  done: boolean;
}

const state: OnboardingState = {
  name: '',
  permissionsRequested: false,
  capabilities: new Set(['chat', 'voice', 'studios']),
  mode: 'both',
  done: false,
};

const CAPABILITIES = [
  { id: 'chat', label: '💬 Chat IA', desc: 'Conversation Claude' },
  { id: 'voice', label: '🎙 Voix', desc: 'Dictée + lecture' },
  { id: 'studios', label: '🎨 Studios', desc: 'Music/Video/Logo' },
  { id: 'browser', label: '🌐 Browser', desc: 'Navigation embed' },
  { id: 'pro', label: '💼 Pro modules', desc: 'Cuisine/Médical/Légal' },
  { id: 'crypto', label: '🪙 Crypto', desc: 'Wallets + tracking' },
  { id: 'domotique', label: '🏠 Domotique', desc: 'Maison connectée' },
  { id: 'remote', label: '📺 Remote TV', desc: 'Télécommande univ.' },
];

export function dispose(): void {
  activeScope?.cleanup();
  activeScope = null;
}

export function isOnboardingNeeded(uid: string | null): boolean {
  if (!uid) return false;
  /* Admin Kevin : skip auto */
  if (uid === 'kdmc_admin') return false;
  try {
    const done = localStorage.getItem(`apex_v13_onboarding_done_${uid}`);
    return done !== 'true';
  } catch {
    return false;
  }
}

export function markOnboardingDone(uid: string): void {
  try {
    localStorage.setItem(`apex_v13_onboarding_done_${uid}`, 'true');
    state.done = true;
    logger.info('onboarding', `Marked done for uid=${uid}`);
  } catch {
    /* ignore */
  }
}

export async function render(rootEl: HTMLElement): Promise<void> {
  activeScope?.cleanup();
  activeScope = createCleanupScope('onboarding');
  /* Pre-fill name from store */
  const user = store.get('user') as { id?: string; name?: string } | null;
  if (user?.name) state.name = user.name;
  renderCurrentStep(rootEl);
}

function renderCurrentStep(rootEl: HTMLElement): void {
  const html = `
    <div class="ax-onboarding ax-gs-402">
      <div class="ax-onboarding-card" style="max-width:540px;width:100%;background:rgba(20,20,35,0.85);backdrop-filter:blur(20px);border:1px solid rgba(201,162,39,0.3);border-radius:20px;padding:32px;box-shadow:0 20px 60px rgba(0,0,0,0.5)">
        ${renderHeader()}
        ${renderStep(currentStep)}
        ${renderFooter()}
      </div>
    </div>
  `;
  rootEl.innerHTML = html;
  wireStep(rootEl, currentStep);
}

function renderHeader(): string {
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <div class="ax-gs-88">
        ${Array.from({ length: TOTAL_STEPS }, (_, i) => `
          <div style="width:32px;height:4px;border-radius:2px;background:${i + 1 <= currentStep ? '#c9a227' : 'rgba(255,255,255,0.15)'};transition:background 0.3s"></div>
        `).join('')}
      </div>
      <button id="ax-onboarding-skip" class="ax-btn ax-btn-ghost" style="font-size:12px;padding:6px 12px">Passer</button>
    </div>
    <div style="font-size:11px;color:var(--ax-text-dim,#888);margin-bottom:8px">Étape ${currentStep} / ${TOTAL_STEPS}</div>
  `;
}

function renderStep(step: number): string {
  switch (step) {
    case 1:
      return `
        <h1 style="margin:0 0 8px;color:#c9a227;font-size:28px">Bienvenue ${state.name ? escapeHtml(state.name) : ''}</h1>
        <p style="color:var(--ax-text-dim,#aaa);margin:0 0 24px;font-size:15px;line-height:1.6">
          Apex est ton assistant IA personnel. Configurons-le ensemble en moins de 2 min.
        </p>
        <label class="ax-gs-403">
          <span style="display:block;color:#c9a227;font-size:13px;margin-bottom:6px">Comment dois-je t'appeler ?</span>
          <input type="text" id="ax-onboarding-name" aria-label="Ton prénom" value="${escapeHtml(state.name)}" placeholder="Ton prénom" style="width:100%;padding:12px;background:rgba(0,0,0,0.3);border:1px solid rgba(201,162,39,0.3);border-radius:10px;color:#fff;font-size:15px">
        </label>
        <p style="color:var(--ax-text-dim,#888);font-size:12px;margin:0">
          🔒 Tes données restent sur ton appareil. Apex est local-first.
        </p>
      `;
    case 2:
      return `
        <h1 class="ax-gs-404">🔓 Permissions device</h1>
        <p class="ax-gs-405">
          Pour utiliser toutes les capacités d'Apex, autorise :
        </p>
        <div style="display:grid;gap:10px;margin-bottom:20px">
          <div class="ax-gs-68">
            <strong class="ax-gs-406">🔔 Notifications</strong>
            <div class="ax-gs-69">Alertes urgentes (sentinelles, messages)</div>
          </div>
          <div class="ax-gs-68">
            <strong class="ax-gs-406">🎙 Microphone</strong>
            <div class="ax-gs-69">Dictée vocale + wake word "Dis Apex"</div>
          </div>
          <div class="ax-gs-68">
            <strong class="ax-gs-406">📷 Caméra</strong>
            <div class="ax-gs-69">Scan QR / OCR / Vision IA</div>
          </div>
        </div>
        <button id="ax-onboarding-grant-perms" class="ax-btn ax-btn-primary ax-btn-block" style="margin-bottom:8px">Autoriser tout</button>
        <p style="color:var(--ax-text-dim,#888);font-size:11px;margin:0;text-align:center">
          Tu peux révoquer à tout moment dans Réglages.
        </p>
      `;
    case 3:
      return `
        <h1 class="ax-gs-404">✨ Tes compétences IA</h1>
        <p class="ax-gs-405">
          Active les modules qui t'intéressent (réversible) :
        </p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px" id="ax-onboarding-capabilities">
          ${CAPABILITIES.map((c) => `
            <button class="ax-onboarding-cap" data-cap="${c.id}" style="
              text-align:left;padding:12px;background:${state.capabilities.has(c.id) ? 'rgba(201,162,39,0.2)' : 'rgba(0,0,0,0.2)'};
              border:1px solid ${state.capabilities.has(c.id) ? '#c9a227' : 'rgba(255,255,255,0.1)'};
              border-radius:10px;cursor:pointer;color:#fff;transition:all 0.2s">
              <div style="font-size:14px;font-weight:600">${escapeHtml(c.label)}</div>
              <div style="font-size:11px;color:var(--ax-text-dim,#aaa);margin-top:2px">${escapeHtml(c.desc)}</div>
            </button>
          `).join('')}
        </div>
      `;
    case 4:
      return `
        <h1 class="ax-gs-404">🎭 Sérieux ou Fun ?</h1>
        <p class="ax-gs-407">
          Mode dual : pro + ludique partout. Choisis ton défaut :
        </p>
        <div style="display:grid;gap:12px;margin-bottom:16px">
          <button class="ax-mode-choice" data-mode="serious" style="
            padding:16px;background:${state.mode === 'serious' ? 'rgba(201,162,39,0.2)' : 'rgba(0,0,0,0.2)'};
            border:1px solid ${state.mode === 'serious' ? '#c9a227' : 'rgba(255,255,255,0.1)'};
            border-radius:12px;cursor:pointer;color:#fff;text-align:left">
            <strong class="ax-gs-408">⚙️ Sérieux (par défaut)</strong>
            <div class="ax-gs-70">Réponses pro, sources officielles, expertise</div>
          </button>
          <button class="ax-mode-choice" data-mode="fun" style="
            padding:16px;background:${state.mode === 'fun' ? 'rgba(201,162,39,0.2)' : 'rgba(0,0,0,0.2)'};
            border:1px solid ${state.mode === 'fun' ? '#c9a227' : 'rgba(255,255,255,0.1)'};
            border-radius:12px;cursor:pointer;color:#fff;text-align:left">
            <strong class="ax-gs-408">🎉 Fun (par défaut)</strong>
            <div class="ax-gs-70">Voix rigolotes, blagues, memes</div>
          </button>
          <button class="ax-mode-choice" data-mode="both" style="
            padding:16px;background:${state.mode === 'both' ? 'rgba(201,162,39,0.2)' : 'rgba(0,0,0,0.2)'};
            border:1px solid ${state.mode === 'both' ? '#c9a227' : 'rgba(255,255,255,0.1)'};
            border-radius:12px;cursor:pointer;color:#fff;text-align:left">
            <strong class="ax-gs-408">🌈 Les deux (recommandé)</strong>
            <div class="ax-gs-70">Toggle dans chaque outil. Surprise mode 🎲 dispo.</div>
          </button>
        </div>
      `;
    case 5:
      return `
        <h1 class="ax-gs-404">🚀 Tour rapide</h1>
        <p class="ax-gs-407">
          3 zones clés à connaître :
        </p>
        <div style="display:grid;gap:12px;margin-bottom:20px">
          <div class="ax-gs-71">
            <strong class="ax-gs-409">💬 Chat</strong>
            <div class="ax-gs-72">Pose une question, demande un studio, dicte. Apex sort l'outil adapté automatiquement.</div>
          </div>
          <div class="ax-gs-71">
            <strong class="ax-gs-409">🔐 Coffre</strong>
            <div class="ax-gs-72">Tes clés API, tokens, paiements. Chiffrement AES-GCM 256.</div>
          </div>
          <div class="ax-gs-71">
            <strong class="ax-gs-409">🎨 Studios</strong>
            <div class="ax-gs-72">15 studios créatifs (musique, vidéo, archi, etc.). Apparaissent dans le chat selon le contexte.</div>
          </div>
        </div>
        <p style="color:var(--ax-text-dim,#888);font-size:12px;margin:0;text-align:center">
          🎯 Apex apprend de chaque conversation. Plus tu l'utilises, plus il te connaît.
        </p>
      `;
    default:
      return `<p>Étape inconnue</p>`;
  }
}

function renderFooter(): string {
  const isLast = currentStep === TOTAL_STEPS;
  const isFirst = currentStep === 1;
  return `
    <div style="display:flex;gap:8px;margin-top:24px">
      ${!isFirst ? '<button id="ax-onboarding-prev" class="ax-btn ax-btn-secondary" style="flex:1">← Retour</button>' : ''}
      <button id="ax-onboarding-next" class="ax-btn ax-btn-primary" style="flex:2">${isLast ? '✅ Terminer' : 'Suivant →'}</button>
    </div>
  `;
}

function wireStep(rootEl: HTMLElement, step: number): void {
  if (!activeScope) return;
  /* Skip button (always present) */
  const skipBtn = rootEl.querySelector<HTMLButtonElement>('#ax-onboarding-skip');
  if (skipBtn) {
    activeScope.bind(skipBtn, 'click', () => {
      haptic.tap();
      finishOnboarding();
    });
  }
  /* Next/Prev */
  const nextBtn = rootEl.querySelector<HTMLButtonElement>('#ax-onboarding-next');
  if (nextBtn) {
    activeScope.bind(nextBtn, 'click', () => {
      haptic.tap();
      saveStepAndAdvance(rootEl);
    });
  }
  const prevBtn = rootEl.querySelector<HTMLButtonElement>('#ax-onboarding-prev');
  if (prevBtn) {
    activeScope.bind(prevBtn, 'click', () => {
      haptic.tap();
      currentStep = Math.max(1, currentStep - 1);
      renderCurrentStep(rootEl);
    });
  }
  /* Step-specific */
  if (step === 1) {
    const input = rootEl.querySelector<HTMLInputElement>('#ax-onboarding-name');
    if (input) {
      activeScope.bind(input, 'input', () => {
        state.name = input.value.trim();
      });
    }
  } else if (step === 2) {
    const grantBtn = rootEl.querySelector<HTMLButtonElement>('#ax-onboarding-grant-perms');
    if (grantBtn) {
      activeScope.bind(grantBtn, 'click', () => {
        void requestAllPermissions();
      });
    }
  } else if (step === 3) {
    rootEl.querySelectorAll<HTMLButtonElement>('.ax-onboarding-cap').forEach((btn) => {
      activeScope!.bind(btn, 'click', () => {
        const cap = btn.dataset['cap'];
        if (!cap) return;
        if (state.capabilities.has(cap)) {
          state.capabilities.delete(cap);
        } else {
          state.capabilities.add(cap);
        }
        haptic.tap();
        renderCurrentStep(rootEl);
      });
    });
  } else if (step === 4) {
    rootEl.querySelectorAll<HTMLButtonElement>('.ax-mode-choice').forEach((btn) => {
      activeScope!.bind(btn, 'click', () => {
        const mode = btn.dataset['mode'] as 'serious' | 'fun' | 'both';
        if (!mode) return;
        state.mode = mode;
        haptic.tap();
        renderCurrentStep(rootEl);
      });
    });
  }
}

function saveStepAndAdvance(rootEl: HTMLElement): void {
  /* Save step data */
  if (currentStep === 1) {
    if (!state.name || state.name.length < 2) {
      toast.warn('Tape ton prénom (min 2 caractères)');
      return;
    }
    try {
      localStorage.setItem('apex_v13_user_name', state.name);
    } catch {
      /* ignore */
    }
  } else if (currentStep === 3) {
    try {
      localStorage.setItem('apex_v13_capabilities', JSON.stringify([...state.capabilities]));
    } catch {
      /* ignore */
    }
  } else if (currentStep === 4) {
    try {
      localStorage.setItem('ax_mode_dual', state.mode);
    } catch {
      /* ignore */
    }
  }
  if (currentStep === TOTAL_STEPS) {
    finishOnboarding();
    return;
  }
  currentStep++;
  renderCurrentStep(rootEl);
}

async function requestAllPermissions(): Promise<void> {
  state.permissionsRequested = true;
  let okCount = 0;
  /* Notification */
  if (typeof Notification !== 'undefined') {
    try {
      const r = await Notification.requestPermission();
      if (r === 'granted') okCount++;
    } catch {
      /* ignore */
    }
  }
  /* Mic */
  if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      okCount++;
    } catch {
      /* user refused */
    }
  }
  /* Camera (prompt only — release immediately) */
  if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((t) => t.stop());
      okCount++;
    } catch {
      /* user refused */
    }
  }
  if (okCount > 0) {
    toast.success(`✅ ${okCount} permission${okCount > 1 ? 's' : ''} accordée${okCount > 1 ? 's' : ''}`);
  } else {
    toast.info('Tu pourras autoriser plus tard dans Réglages');
  }
}

function finishOnboarding(): void {
  const user = store.get('user') as { id?: string } | null;
  if (user?.id) {
    markOnboardingDone(user.id);
  }
  toast.success('🚀 Bienvenue dans Apex !');
  /* Navigate to chat */
  setTimeout(() => router.navigate('chat'), 300);
}
