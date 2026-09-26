/**
 * APEX v13 — Vue Waiting-Approval (post-signup, attendre Kevin)
 *
 * Affiche état demande client après submit signup. Polling toutes les 30s pour
 * détecter approval/rejection.
 */

import { escapeHtml } from '../../core/escape-html.js';
import { createCleanupScope, type CleanupScope } from '../../core/listener-cleanup.js';
import { router } from '../../core/router.js';
import { type SignupRequest } from '../../services/auth/signup.js';
import { haptic } from '../../ui/haptic.js';
import { toast } from '../../ui/toast.js';

let activeScope: CleanupScope | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

export function dispose(): void {
  activeScope?.cleanup();
  activeScope = null;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}


function getCurrentRequest(): SignupRequest | null {
  try {
    const id = localStorage.getItem('apex_v13_signup_pending_id');
    if (!id) return null;
    const all = JSON.parse(localStorage.getItem('apex_v13_signup_requests') ?? '[]') as SignupRequest[];
    return all.find((r) => r.id === id) ?? null;
  } catch {
    return null;
  }
}

export function render(rootEl: HTMLElement): void {
  activeScope?.cleanup();
  activeScope = createCleanupScope('waiting-approval');

  renderState(rootEl);

  /* Polling 30s pour détecter approval Kevin */
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    const req = getCurrentRequest();
    if (!req) return;
    if (req.status === 'approved') {
      toast.success('🎉 Compte approuvé ! Tu peux te connecter.');
      try { localStorage.removeItem('apex_v13_signup_pending_id'); } catch { /* ignore */ }
      setTimeout(() => router.navigate('landing'), 1500);
    } else if (req.status === 'rejected') {
      renderState(rootEl);
    } else if (req.status === 'expired') {
      renderState(rootEl);
    }
  }, 30_000);
}

function renderState(rootEl: HTMLElement): void {
  const req = getCurrentRequest();
  const inviteLink = (() => {
    try { return localStorage.getItem('apex_v13_signup_invite_link') ?? ''; } catch { return ''; }
  })();

  if (!req) {
    rootEl.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px">
        <div style="max-width:480px;text-align:center;color:#fff">
          <h1 class="ax-gs-266">Aucune demande en cours</h1>
          <p style="color:var(--ax-text-dim,#aaa)">Tu n'as pas de demande d'inscription en attente.</p>
          <button id="wa-back" class="ax-btn ax-btn-primary ax-gs-211">← Retour à la connexion</button>
        </div>
      </div>
    `;
    const btn = rootEl.querySelector<HTMLButtonElement>('#wa-back');
    if (btn && activeScope) {
      activeScope.bind(btn, 'click', () => router.navigate('landing'));
    }
    return;
  }

  const fullName = `${req.prenom} ${req.nom}`;
  const otp = req.otp;
  const remainingMs = req.expiresAt - Date.now();
  const remainingDays = Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));

  const statusBadge = (() => {
    if (req.status === 'approved') return { color: '#10b981', icon: '✅', label: 'Approuvé' };
    if (req.status === 'rejected') return { color: '#ef4444', icon: '❌', label: 'Refusé' };
    if (req.status === 'expired') return { color: '#888', icon: '⏰', label: 'Expiré' };
    return { color: '#c9a227', icon: '⏳', label: 'En attente Kevin' };
  })();

  rootEl.innerHTML = `
    <div class="ax-gs-402">
      <div class="ax-gs-441">
        <div style="text-align:center;margin-bottom:20px">
          <div style="font-size:42px;margin-bottom:8px">${statusBadge.icon}</div>
          <h1 style="margin:0 0 4px;color:${statusBadge.color};font-size:24px">${statusBadge.label}</h1>
          <p class="ax-gs-442">${escapeHtml(fullName)}</p>
        </div>

        ${req.status === 'awaiting_kevin' ? `
          <div class="ax-gs-287">
            <h3 style="margin:0 0 8px;color:#c9a227;font-size:15px">📱 Ouvre WhatsApp et envoie ce code à Kevin</h3>
            <div style="background:rgba(0,0,0,0.5);border-radius:10px;padding:14px;text-align:center;font-family:'Courier New',monospace;font-size:24px;color:#c9a227;letter-spacing:2px;margin-bottom:12px">
              ${escapeHtml(otp)}
            </div>
            <a href="${escapeHtml(inviteLink || '#')}" target="_blank" rel="noopener" id="wa-open-link"
              class="ax-btn ax-btn-primary ax-btn-block" style="text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:6px">
              💬 Ouvrir WhatsApp
            </a>
          </div>
          <div style="font-size:13px;color:var(--ax-text-dim,#aaa);line-height:1.6">
            <p style="margin:0 0 8px"><strong class="ax-gs-327">Étapes suivantes :</strong></p>
            <ol style="margin:0;padding-left:20px">
              <li>Ouvre WhatsApp via le bouton ci-dessus (lien pré-rempli)</li>
              <li>Envoie le message à Kevin</li>
              <li>Attends sa validation (généralement &lt; 24h)</li>
              <li>Tu recevras un message WhatsApp de confirmation</li>
              <li>Reviens ici et clique "Vérifier" ou tu seras redirigé automatiquement</li>
            </ol>
          </div>
          <p style="margin:14px 0 0;font-size:11px;color:var(--ax-text-dim,#888);text-align:center">
            Demande valide ${remainingDays}j · Vérification auto toutes les 30s
          </p>
        ` : ''}

        ${req.status === 'rejected' ? `
          <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:12px;padding:16px;margin-bottom:16px">
            <p style="margin:0;color:#ef4444;font-size:14px"><strong>Raison :</strong> ${escapeHtml(req.rejectReason ?? 'Non précisée')}</p>
          </div>
          <p style="color:var(--ax-text-dim,#aaa);font-size:13px;text-align:center">
            Tu peux contacter Kevin directement pour comprendre et resoumettre une demande corrigée.
          </p>
        ` : ''}

        ${req.status === 'expired' ? `
          <p style="color:var(--ax-text-dim,#aaa);font-size:13px;text-align:center;margin-bottom:16px">
            Cette demande a expiré (validité 7 jours). Tu peux soumettre une nouvelle demande.
          </p>
        ` : ''}

        ${req.status === 'approved' ? `
          <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:12px;padding:16px;margin-bottom:16px;text-align:center">
            <p style="margin:0;color:#10b981;font-size:14px">🎉 Bienvenue dans Apex !</p>
            <p style="margin:8px 0 0;color:var(--ax-text-dim,#aaa);font-size:12px">Connecte-toi avec ton prénom + nom + un code PIN de ton choix.</p>
          </div>
        ` : ''}

        <div style="display:grid;gap:8px;margin-top:16px">
          <button id="wa-check" class="ax-btn ax-btn-secondary ax-btn-block">🔄 Vérifier maintenant</button>
          <button id="wa-cancel" class="ax-btn ax-btn-ghost ax-btn-block ax-gs-270">${req.status === 'rejected' || req.status === 'expired' ? '📝 Nouvelle demande' : 'Annuler ma demande'}</button>
          <button id="wa-back" class="ax-btn ax-btn-ghost ax-btn-block ax-gs-270">← Connexion</button>
        </div>
      </div>
    </div>
  `;

  wireButtons(rootEl);
}

function wireButtons(rootEl: HTMLElement): void {
  if (!activeScope) return;

  const checkBtn = rootEl.querySelector<HTMLButtonElement>('#wa-check');
  if (checkBtn) {
    activeScope.bind(checkBtn, 'click', () => {
      haptic.tap();
      renderState(rootEl);
      const req = getCurrentRequest();
      if (req?.status === 'awaiting_kevin') {
        toast.info('Toujours en attente Kevin');
      }
    });
  }

  const cancelBtn = rootEl.querySelector<HTMLButtonElement>('#wa-cancel');
  if (cancelBtn) {
    activeScope.bind(cancelBtn, 'click', () => {
      haptic.medium();
      try {
        localStorage.removeItem('apex_v13_signup_pending_id');
        localStorage.removeItem('apex_v13_signup_invite_link');
      } catch { /* ignore */ }
      router.navigate('signup');
    });
  }

  const backBtn = rootEl.querySelector<HTMLButtonElement>('#wa-back');
  if (backBtn) {
    activeScope.bind(backBtn, 'click', () => router.navigate('landing'));
  }
}
