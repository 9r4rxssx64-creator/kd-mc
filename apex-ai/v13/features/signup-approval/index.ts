/**
 * APEX v13 — Vue Signup-Approval (admin Kevin only)
 *
 * Liste demandes d'inscription en attente avec actions Approve/Reject.
 * Affiche aussi historique signups traités.
 *
 * Mission Kevin 2026-05-08 02h : "validation WhatsApp manuelle Kevin admin"
 */

import { escapeHtml } from '../../core/escape-html.js';
import { createCleanupScope, type CleanupScope } from '../../core/listener-cleanup.js';
import { signup, type SignupRequest } from '../../services/auth/signup.js';
import { haptic } from '../../ui/haptic.js';
import { toast } from '../../ui/toast.js';

let activeScope: CleanupScope | null = null;

export function dispose(): void {
  activeScope?.cleanup();
  activeScope = null;
}

function maskPhone(phone: string): string {
  if (phone.length <= 4) return phone;
  return phone.slice(0, 4) + '***' + phone.slice(-2);
}

export function render(rootEl: HTMLElement): void {
  activeScope?.cleanup();
  activeScope = createCleanupScope('signup-approval');

  renderList(rootEl);
}

function renderList(rootEl: HTMLElement): void {
  const pending = signup.listPending();
  const processed = signup.listProcessed().slice(0, 20);

  rootEl.innerHTML = `
    <div class="ax-gs-364">
      <h1 style="color:#c9a227;margin:0 0 4px;font-size:24px">📥 Demandes d'inscription</h1>
      <p style="color:var(--ax-text-dim,#aaa);margin:0 0 20px;font-size:13px">${pending.length} en attente · ${processed.length} traitées récemment</p>

      <h2 class="ax-gs-446">⏳ En attente (${pending.length})</h2>
      ${pending.length === 0 ? `
        <div style="background:rgba(0,0,0,0.2);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:24px;text-align:center;color:var(--ax-text-dim,#888);margin-bottom:24px">
          Aucune demande en attente
        </div>
      ` : `
        <div style="display:grid;gap:10px;margin-bottom:24px">
          ${pending.map((r) => renderCard(r, true)).join('')}
        </div>
      `}

      <h2 class="ax-gs-446">📋 Historique récent</h2>
      ${processed.length === 0 ? `
        <div style="background:rgba(0,0,0,0.2);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:16px;text-align:center;color:var(--ax-text-dim,#888)">
          Aucun historique
        </div>
      ` : `
        <div style="display:grid;gap:10px">
          ${processed.map((r) => renderCard(r, false)).join('')}
        </div>
      `}
    </div>
  `;

  wireButtons(rootEl);
}

function renderCard(r: SignupRequest, withActions: boolean): string {
  const fullName = `${r.prenom} ${r.nom}`;
  const date = new Date(r.createdAt).toLocaleString('fr-FR');
  const statusBadge = (() => {
    if (r.status === 'approved') return { color: '#10b981', label: '✅ Approuvé' };
    if (r.status === 'rejected') return { color: '#ef4444', label: '❌ Refusé' };
    if (r.status === 'expired') return { color: '#888', label: '⏰ Expiré' };
    return { color: '#c9a227', label: '⏳ En attente' };
  })();

  return `
    <div style="background:rgba(20,20,35,0.6);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px" data-signup-id="${escapeHtml(r.id)}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
        <div class="ax-gs-11">
          <div class="ax-gs-77">
            <strong class="ax-gs-409">${escapeHtml(fullName)}</strong>
            <span style="background:${statusBadge.color}20;color:${statusBadge.color};padding:2px 8px;border-radius:4px;font-size:11px">${statusBadge.label}</span>
          </div>
          <div style="font-size:12px;color:var(--ax-text-dim,#aaa);display:grid;gap:2px">
            <div>📧 ${escapeHtml(r.email)}</div>
            <div>📱 ${escapeHtml(maskPhone(r.whatsapp))}</div>
            <div>💎 Plan: <strong class="ax-gs-266">${escapeHtml(r.plan)}</strong></div>
            <div>📅 ${escapeHtml(date)}</div>
            ${withActions ? `<div style="font-family:'Courier New',monospace;color:#c9a227;font-size:11px">🔑 OTP: ${escapeHtml(r.otp)}</div>` : ''}
            ${r.rejectReason ? `<div class="ax-gs-110">Raison: ${escapeHtml(r.rejectReason)}</div>` : ''}
          </div>
        </div>
        ${withActions ? `
          <div style="display:grid;gap:6px;min-width:160px">
            <button class="ax-btn ax-btn-primary signup-approve-client ax-gs-336" data-id="${escapeHtml(r.id)}">✅ Approuver client</button>
            <button class="ax-btn ax-btn-secondary signup-approve-family ax-gs-336" data-id="${escapeHtml(r.id)}">👨‍👩‍👧 Famille</button>
            <button class="ax-btn ax-btn-ghost signup-reject" data-id="${escapeHtml(r.id)}" style="font-size:11px;padding:6px 10px;color:#ef4444">❌ Refuser</button>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function wireButtons(rootEl: HTMLElement): void {
  if (!activeScope) return;

  rootEl.querySelectorAll<HTMLButtonElement>('.signup-approve-client').forEach((btn) => {
    activeScope!.bind(btn, 'click', () => {
      const id = btn.dataset['id'];
      if (!id) return;
      haptic.tap();
      void approveAction(rootEl, id, 'client');
    });
  });

  rootEl.querySelectorAll<HTMLButtonElement>('.signup-approve-family').forEach((btn) => {
    activeScope!.bind(btn, 'click', () => {
      const id = btn.dataset['id'];
      if (!id) return;
      haptic.tap();
      void approveAction(rootEl, id, 'family');
    });
  });

  rootEl.querySelectorAll<HTMLButtonElement>('.signup-reject').forEach((btn) => {
    activeScope!.bind(btn, 'click', () => {
      const id = btn.dataset['id'];
      if (!id) return;
      haptic.medium();
      void rejectAction(rootEl, id);
    });
  });
}

async function approveAction(rootEl: HTMLElement, requestId: string, type: 'client' | 'family'): Promise<void> {
  const result = await signup.approveSignup({
    requestId,
    type,
    adminUid: 'kdmc_admin',
  });

  if (result.ok) {
    toast.success(`✅ Approuvé ${type === 'family' ? '(famille)' : '(client)'} → uid ${result.uid?.slice(0, 16) ?? '?'}`);
    renderList(rootEl);
  } else {
    toast.error(result.reason ?? 'Erreur approval');
  }
}

async function rejectAction(rootEl: HTMLElement, requestId: string): Promise<void> {
  const reason = prompt('Raison du refus (sera visible client) :');
  if (!reason) return;

  const result = await signup.rejectSignup({
    requestId,
    adminUid: 'kdmc_admin',
    reason,
  });

  if (result.ok) {
    toast.success('Demande rejetée');
    renderList(rootEl);
  } else {
    toast.error(result.reason ?? 'Erreur reject');
  }
}
