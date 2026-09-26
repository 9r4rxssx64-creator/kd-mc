/**
 * APEX v13 — Feature Signup (self-service inscription DIRECT)
 *
 * Mission Kevin 2026-05-17 v13.4.211 :
 * "Gratuit et auto. À partir du moment où j'envoie le lien à qlq un il crée
 *  son code avec la fiche info et se Connect auto"
 *
 * Form public :
 *  - Prénom + Nom (séparés, validation 2-tokens règle v13.3.65)
 *  - Email
 *  - **Code PIN choisi par l'user (4-8 chiffres)**
 *  - Téléphone (optionnel, pour notifs futures)
 *  - Plan Free/Basic/Pro/Family
 *  - Consentements CGU + RGPD obligatoires
 *
 * Submit → signup.selfSignupDirect() → compte créé + PIN stocké + login auto
 * → redirect chat. ZERO intervention Kevin, ZERO OTP WhatsApp.
 *
 * Le lien partagé EST l'authorization (Kevin choisit à qui il envoie).
 *
 * RGPD : consent enregistré dans audit log signup.self_direct.
 */

import { escapeHtml } from '../../core/escape-html.js';
import { createCleanupScope, type CleanupScope } from '../../core/listener-cleanup.js';
import { router } from '../../core/router.js';
import { signup, type SignupPlan } from '../../services/auth/signup.js';
import { haptic } from '../../ui/haptic.js';
import { toast } from '../../ui/toast.js';

let activeScope: CleanupScope | null = null;

export function dispose(): void {
  activeScope?.cleanup();
  activeScope = null;
}

const PLANS: Array<{ id: SignupPlan; label: string; price: string; features: string[] }> = [
  { id: 'free', label: '🆓 Découverte', price: '0 €', features: ['Chat IA basique', '50 messages/jour'] },
  { id: 'basic', label: '✨ Basic', price: '9,90 €/mois', features: ['Chat illimité', 'Studios', 'Voix'] },
  { id: 'pro', label: '💎 Pro', price: '29,90 €/mois', features: ['Tout Basic', 'Modules pro', 'Coffre, IoT'] },
  { id: 'family', label: '👨‍👩‍👧 Famille (sur invitation)', price: 'Gratuit', features: ['Accès complet', 'Validation Kevin'] },
];

export function render(rootEl: HTMLElement): void {
  activeScope?.cleanup();
  activeScope = createCleanupScope('signup');

  rootEl.innerHTML = `
    <div class="ax-signup ax-gs-402">
      <div class="ax-signup-card ax-gs-441">
        <div style="text-align:center;margin-bottom:24px">
          <h1 class="ax-gs-324">📝 Créer mon compte Apex</h1>
          <p class="ax-gs-442">Inscription instantanée · Choisis ton code · Connecté auto</p>
        </div>

        <form id="signup-form" novalidate style="display:grid;gap:14px">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <label>
              <span class="ax-gs-35">Prénom *</span>
              <input type="text" id="signup-prenom" aria-label="Prénom" required minlength="2" autocomplete="given-name"
                class="ax-gs-443"
                placeholder="Marc">
            </label>
            <label>
              <span class="ax-gs-35">Nom *</span>
              <input type="text" id="signup-nom" aria-label="Nom de famille" required minlength="2" autocomplete="family-name"
                class="ax-gs-443"
                placeholder="Dupont">
            </label>
          </div>
          <label>
            <span class="ax-gs-35">Email *</span>
            <input type="email" id="signup-email" aria-label="Adresse email" required autocomplete="email" inputmode="email"
              class="ax-gs-443"
              placeholder="marc@example.com">
          </label>
          <label>
            <span class="ax-gs-35">Téléphone WhatsApp (format +33xxx)</span>
            <input type="tel" id="signup-whatsapp" aria-label="Numéro WhatsApp avec indicatif pays" autocomplete="tel" inputmode="tel" pattern="^\\+\\d{6,15}$"
              class="ax-gs-443"
              placeholder="+33612345678">
          </label>
          <label>
            <span class="ax-gs-35">🔑 Ton code d'accès * (min 4 chiffres)</span>
            <input type="password" id="signup-pin" aria-label="Code PIN personnel pour te connecter" required minlength="4" maxlength="20" inputmode="numeric" autocomplete="new-password"
              style="width:100%;padding:11px;background:rgba(0,0,0,0.3);border:1px solid rgba(201,162,39,0.3);border-radius:8px;color:#fff;font-size:14px;letter-spacing:4px"
              placeholder="••••">
            <span style="display:block;color:var(--ax-text-dim,#888);font-size:11px;margin-top:4px">Tu utiliseras ce code à chaque connexion. Choisis-le bien.</span>
          </label>

          <div>
            <span style="display:block;color:#c9a227;font-size:12px;margin-bottom:8px">Plan souhaité *</span>
            <div id="signup-plans" class="ax-gs-251">
              ${PLANS.map((p, i) => `
                <label style="display:flex;align-items:center;gap:10px;padding:10px;background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.08);border-radius:10px;cursor:pointer">
                  <input type="radio" name="signup-plan" aria-label="Plan ${escapeHtml(p.label)}" value="${p.id}" ${i === 0 ? 'checked' : ''} style="accent-color:#c9a227">
                  <div class="ax-gs-26">
                    <div class="ax-gs-219">
                      <strong class="ax-gs-406">${escapeHtml(p.label)}</strong>
                      <span style="color:#c9a227;font-size:13px">${escapeHtml(p.price)}</span>
                    </div>
                    <div style="color:var(--ax-text-dim,#888);font-size:11px;margin-top:2px">${escapeHtml(p.features.join(' · '))}</div>
                  </div>
                </label>
              `).join('')}
            </div>
          </div>

          <div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:14px;display:grid;gap:8px">
            <label class="ax-gs-444">
              <input type="checkbox" id="signup-cgu" aria-label="Accepter CGU et politique de confidentialité" required class="ax-gs-252">
              <span>J'accepte les <a href="#" id="signup-link-cgu" class="ax-gs-445">CGU</a> et la <a href="#" id="signup-link-privacy" class="ax-gs-445">Politique de confidentialité</a></span>
            </label>
            <label class="ax-gs-444">
              <input type="checkbox" id="signup-rgpd" aria-label="Autoriser le traitement des données RGPD" required class="ax-gs-252">
              <span>J'autorise le traitement de mes données pour la création + gestion de mon compte Apex (RGPD Art. 6.1.b contrat)</span>
            </label>
          </div>

          <button type="submit" id="signup-submit" class="ax-btn ax-btn-primary ax-btn-block ax-gs-186">
            <span class="ax-btn-label">🚀 Créer mon compte et me connecter</span>
            <span class="ax-spinner ax-gs-234" aria-hidden="true"></span>
          </button>
        </form>

        <div id="signup-error" aria-live="polite" aria-atomic="true" class="ax-gs-248"></div>

        <div style="text-align:center;margin-top:20px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.08)">
          <p style="color:var(--ax-text-dim,#888);font-size:12px;margin:0 0 8px">Déjà un compte ?</p>
          <button type="button" id="signup-go-login" class="ax-btn ax-btn-ghost ax-gs-398">← Retour à la connexion</button>
        </div>
      </div>
    </div>
  `;

  wireForm(rootEl);
}

function wireForm(rootEl: HTMLElement): void {
  if (!activeScope) return;

  const form = rootEl.querySelector<HTMLFormElement>('#signup-form');
  if (form) {
    activeScope.bind(form, 'submit', (e) => {
      e.preventDefault();
      haptic.tap();
      void handleSubmit(rootEl);
    });
  }

  const backBtn = rootEl.querySelector<HTMLButtonElement>('#signup-go-login');
  if (backBtn) {
    activeScope.bind(backBtn, 'click', () => {
      haptic.tap();
      router.navigate('landing');
    });
  }

  const linkCgu = rootEl.querySelector<HTMLAnchorElement>('#signup-link-cgu');
  if (linkCgu) {
    activeScope.bind(linkCgu, 'click', (e) => {
      e.preventDefault();
      router.navigate('legal');
    });
  }
  const linkPrivacy = rootEl.querySelector<HTMLAnchorElement>('#signup-link-privacy');
  if (linkPrivacy) {
    activeScope.bind(linkPrivacy, 'click', (e) => {
      e.preventDefault();
      router.navigate('legal');
    });
  }
}

async function handleSubmit(rootEl: HTMLElement): Promise<void> {
  const prenom = (rootEl.querySelector<HTMLInputElement>('#signup-prenom')?.value ?? '').trim();
  const nom = (rootEl.querySelector<HTMLInputElement>('#signup-nom')?.value ?? '').trim();
  const email = (rootEl.querySelector<HTMLInputElement>('#signup-email')?.value ?? '').trim();
  const whatsapp = (rootEl.querySelector<HTMLInputElement>('#signup-whatsapp')?.value ?? '').trim();
  const pin = (rootEl.querySelector<HTMLInputElement>('#signup-pin')?.value ?? '').trim();
  const plan = (rootEl.querySelector<HTMLInputElement>('input[name="signup-plan"]:checked')?.value ?? 'free') as SignupPlan;
  const cgu = rootEl.querySelector<HTMLInputElement>('#signup-cgu')?.checked ?? false;
  const rgpdConsent = rootEl.querySelector<HTMLInputElement>('#signup-rgpd')?.checked ?? false;

  const submitBtn = rootEl.querySelector<HTMLButtonElement>('#signup-submit');
  const labelEl = submitBtn?.querySelector<HTMLElement>('.ax-btn-label');
  const spinnerEl = submitBtn?.querySelector<HTMLElement>('.ax-spinner');
  const errEl = rootEl.querySelector<HTMLElement>('#signup-error');

  if (errEl) errEl.innerHTML = '';

  if (submitBtn) submitBtn.disabled = true;
  if (labelEl) labelEl.textContent = 'Création de ton compte...';
  if (spinnerEl) spinnerEl.style.display = 'inline-block';

  try {
    /* v13.4.211 (Kevin "se Connect auto") : self-signup direct, plus de waiting-approval */
    const opts: {
      prenom: string;
      nom: string;
      email: string;
      pin: string;
      plan: SignupPlan;
      consent: { cgu: boolean; rgpd: boolean; ts: number };
      whatsapp?: string;
    } = {
      prenom,
      nom,
      email,
      pin,
      plan,
      consent: { cgu, rgpd: rgpdConsent, ts: Date.now() },
    };
    if (whatsapp) opts.whatsapp = whatsapp;
    const result = await signup.selfSignupDirect(opts);

    if (!result.ok) {
      haptic.error();
      if (errEl) errEl.innerHTML = `<div class="ax-alert ax-alert-warn">⚠️ ${escapeHtml(result.reason ?? 'Erreur')}</div>`;
      toast.error(result.reason ?? 'Erreur');
      if (submitBtn) submitBtn.disabled = false;
      if (labelEl) labelEl.textContent = '🚀 Créer mon compte et me connecter';
      if (spinnerEl) spinnerEl.style.display = 'none';
      return;
    }

    /* Success — login auto déjà fait par selfSignupDirect (store.set user + session) */
    haptic.success();
    toast.success('🎉 Bienvenue ! Tu es connecté.');
    setTimeout(() => router.navigate('chat'), 500);
  } catch (err: unknown) {
    haptic.error();
    const msg = err instanceof Error ? err.message : 'Erreur inattendue';
    if (errEl) errEl.innerHTML = `<div class="ax-alert ax-alert-error">${escapeHtml(msg)}</div>`;
    toast.error(msg);
    if (submitBtn) submitBtn.disabled = false;
    if (labelEl) labelEl.textContent = '🚀 Créer mon compte et me connecter';
    if (spinnerEl) spinnerEl.style.display = 'none';
  }
}
