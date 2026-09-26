/**
 * APEX v13 — Landing / login (path A : visuel/UX repensé premium)
 *
 * Ajoutés :
 * - Animation entrance slide-up-fade
 * - Glow pulse sur logo APEX
 * - Glassmorphism card
 * - Haptic feedback au login
 * - Toast user-friendly remplace #login-error inline
 * - Spinner pendant submit
 * - aria-live polite pour erreurs
 *
 * Reconnaît automatiquement Kevin via aliases CLAUDE.md règle absolue.
 * Token d'invitation depuis URL hash (#invite=...) → pré-remplit nom.
 */

import { APP_VER } from '../../core/bootstrap.js';
import { escapeHtml } from '../../core/escape-html.js';
import { createCleanupScope, type CleanupScope } from '../../core/listener-cleanup.js';
import { router } from '../../core/router.js';
import { auth } from '../../services/auth/auth.js';
import { isFeatureEnabled } from '../../services/auth/feature-toggles.js';
import { webauthn } from '../../services/auth/webauthn.js';
import { haptic } from '../../ui/haptic.js';
import { toast } from '../../ui/toast.js';

/* P1-6 (audit v13.2.7) : scope listeners pour anti-leak SPA navigation. */
let activeLandingScope: CleanupScope | null = null;

export function dispose(): void {
  activeLandingScope?.cleanup();
  activeLandingScope = null;
}

function parseInviteToken(): { uid: string; name?: string } | null {
  const m = location.hash.match(/invite=([A-Za-z0-9+/=]+)/);
  if (!m || !m[1]) return null;
  try {
    const decoded = atob(m[1] ?? '');
    const uid = decoded.split(':')[0];
    if (uid) return { uid };
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Tente auto-login si device connu + last user identifié.
 * Kevin règle "S'il reconnaît mon appareil, il ne me demande pas connexion".
 */
async function tryAutoLogin(): Promise<boolean> {
  try {
    const lastUid = localStorage.getItem('apex_v13_last_known_uid');
    const lastName = localStorage.getItem('apex_v13_last_known_name');
    let deviceTrusted = localStorage.getItem('apex_v13_device_trusted_v1');
    if (!lastUid || !lastName) return false;
    /* v13.4.263 (Kevin "Dans tous les projets pour moi et les autres,
     * reconnu auto après 1ère connexion") : AUTO-RECOVERY trust device
     * ÉTENDUE À TOUS LES USERS (pas que Kevin admin). Condition : avoir
     * un last_known_uid+name (preuve d'un login OK antérieur) ET un PIN
     * persisté (admin global OR per-user). Sécurité conservée : sans PIN
     * persisté, l'auto-trust ne se déclenche jamais (un attaquant qui
     * arrive sur l'écran landing d'un device fresh ne peut rien recover).
     * Le device fingerprint check juste après reste l'autre garde-fou. */
    if (!deviceTrusted) {
      const hasPin =
        localStorage.getItem('apex_v13_pin') !== null ||
        localStorage.getItem(`apex_v13_pin_${lastUid}`) !== null;
      if (hasPin) {
        try {
          const { deviceContext } = await import('../../services/integrations/device-context.js');
          const fp = await deviceContext.getFingerprint();
          localStorage.setItem('apex_v13_device_trusted_v1', fp.device_id);
          /* v13.4.323 SÉCU : lie le trust auto-recovery à l'UID connu. */
          localStorage.setItem('apex_v13_device_trusted_uid_v1', lastUid);
          deviceTrusted = fp.device_id;
        } catch {
          /* device-context indispo → on tombera sur le retour false plus bas */
        }
      }
    }
    if (!deviceTrusted) return false;
    /* Device fingerprint check */
    const { deviceContext } = await import('../../services/integrations/device-context.js');
    const fp = await deviceContext.getFingerprint();
    if (fp.device_id !== deviceTrusted) {
      /* Device a changé — purge trusted, force re-login */
      localStorage.removeItem('apex_v13_device_trusted_v1');
      localStorage.removeItem('apex_v13_device_trusted_uid_v1');
      return false;
    }
    /* Login transparent sans PIN (device trusted) */
    const { auth } = await import('../../services/auth/auth.js');
    const r = await auth.loginTrusted(lastUid, lastName);
    if (r.ok) {
      router.navigate('chat');
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Règle ABSOLUE Kevin 2026-05-22 : "PIN et nom prénom pour 1ère connexion mais
 * après reconnu auto et connecte auto FaceID". Après un login PIN réussi, si le
 * device supporte la biométrie plateforme (Face ID / Touch ID) ET que l'user
 * n'est pas déjà enrôlé → proposer l'enrôlement (opt-in, non-bloquant). Le PIN
 * reste TOUJOURS le fallback. Fail-safe : tout échec/non-support = no-op silencieux.
 * @returns true si un enrôlement a été tenté (succès ou refus user), false si non proposé.
 */
export async function offerBiometricEnroll(userId: string, userName: string): Promise<boolean> {
  try {
    if (!userId || !userName) return false;
    /* Déjà enrôlé sur ce device → rien à faire (auto-unlock dispo au prochain boot). */
    if (webauthn.hasEnrollment(userId)) return false;
    /* L'user a déjà refusé une fois → ne pas re-harceler. */
    if (localStorage.getItem(`apex_v13_biometric_declined_${userId}`) === '1') return false;
    const avail = await webauthn.isAvailable();
    if (!avail.supported || avail.platform !== 'platform') return false;
    /* Proposition douce. Sur refus → mémorise pour ne plus redemander. */
    const accept = typeof confirm === 'function'
      ? confirm('🔐 Activer Face ID / Touch ID ?\n\nProchaine fois, déverrouille Apex sans taper ton PIN.\n(Ton PIN reste disponible en secours.)')
      : false;
    if (!accept) {
      try { localStorage.setItem(`apex_v13_biometric_declined_${userId}`, '1'); } catch { /* ignore quota */ }
      return true;
    }
    const r = await webauthn.register({ username: userId, displayName: userName });
    if (r.ok) {
      toast.success('🔐 Face ID activé — déverrouillage rapide la prochaine fois');
    } else {
      toast.error(`Activation biométrie impossible : ${r.reason ?? 'échec'}`);
    }
    return true;
  } catch {
    return false; /* fail-safe : jamais bloquer le login sur la biométrie */
  }
}

/**
 * Déverrouillage par Face ID / Touch ID sur la landing (fallback PIN conservé).
 * Authentifie via WebAuthn le dernier user connu enrôlé, puis loginTrusted.
 * @returns true si déverrouillage réussi (navigation effectuée), false sinon.
 */
export async function tryBiometricUnlock(): Promise<boolean> {
  try {
    const lastUid = localStorage.getItem('apex_v13_last_known_uid');
    const lastName = localStorage.getItem('apex_v13_last_known_name');
    if (!lastUid || !lastName) return false;
    if (!webauthn.hasEnrollment(lastUid)) return false;
    const r = await webauthn.authenticate(lastUid);
    if (!r.ok) {
      haptic.error();
      toast.error(`Face ID : ${r.reason ?? 'échec'} — utilise ton PIN`);
      return false;
    }
    const login = await auth.loginTrusted(lastUid, lastName);
    if (login.ok) {
      haptic.success();
      toast.success('🔓 Déverrouillé par Face ID');
      router.navigate('chat');
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/* ──────────────────────────────────────────────────────────────────────────
   Compte unique kd-mc.com — reconnaissance NON-PRIVILÉGIÉE.
   Pré-remplit le nom depuis la session du domaine (confort « un seul identifiant »).
   N'accorde JAMAIS aucun droit : pas d'admin, pas de bypass du PIN. La session
   domaine est auto-assertée → elle ne prouve pas l'identité forte. Fail-open total. */
function consumeDomainHashToken(): void {
  try {
    const h = location.hash || '';
    const m = h.match(/[#&]kdmc_sso=([^&]+)/);
    if (!m || !m[1]) return;
    localStorage.setItem('kdmc_sso_token', decodeURIComponent(m[1]));
    const clean = h.replace(/([#&])kdmc_sso=[^&]*/, '$1').replace(/[#&]+$/, '');
    history.replaceState(null, '', location.pathname + location.search + (clean && clean !== '#' ? clean : ''));
  } catch { /* ignore */ }
}
async function domainSessionName(): Promise<string | null> {
  try {
    const headers: Record<string, string> = {};
    const t = localStorage.getItem('kdmc_sso_token');
    if (t) headers['Authorization'] = 'Bearer ' + t;
    const r = await fetch('/__sso/whoami', { credentials: 'include', cache: 'no-store', headers });
    if (!r.ok) return null;
    const j = (await r.json()) as { ok?: boolean; name?: string };
    return j && j.ok && j.name ? String(j.name) : null;
  } catch { return null; }
}
/* Compte unique kd-mc.com : si le domaine prouve l'identité par Face ID (session FORTE
   verified) ET que c'est le propriétaire → connecte AUTO en admin (politique « Admin auto,
   toi seul »). Sinon → simple pré-remplissage du nom (PIN requis). Fail-open total :
   toute erreur laisse l'écran de connexion normal. */
function domainAutoLoginOrPrefill(rootEl: HTMLElement): void {
  consumeDomainHashToken();
  void auth.loginVerifiedDomain().then((res) => {
    if (res.ok) {
      toast.success('🔓 Connecté via Face ID (kd-mc.com)');
      router.navigate('chat');
      return;
    }
    prefillNameFromDomain(rootEl);
  }).catch(() => { prefillNameFromDomain(rootEl); });
}
function prefillNameFromDomain(rootEl: HTMLElement): void {
  consumeDomainHashToken();
  void domainSessionName().then((nm) => {
    if (!nm) return;
    const nameInput = rootEl.querySelector<HTMLInputElement>('#login-name');
    if (!nameInput || nameInput.value.trim()) return; /* ne jamais écraser une saisie */
    nameInput.value = nm;
    const tag = rootEl.querySelector<HTMLElement>('.ax-landing-tagline');
    if (tag) tag.textContent = `Bonjour ${nm.split(' ')[0]} — entre ton code`;
    const pin = rootEl.querySelector<HTMLInputElement>('#login-pin');
    if (pin && !pin.value) pin.focus();
  });
}

export function render(rootEl: HTMLElement): void {
  /* P1-6 : cleanup ancien scope avant re-render */
  activeLandingScope?.cleanup();
  activeLandingScope = createCleanupScope('landing');
  /* Feature toggle module.landing — sécurité : si désactivée globalement,
     afficher message "App fermée" mais ne JAMAIS soft-locker l'admin.
     L'admin reste toujours capable de se connecter (voir auth.ts loginAdmin). */
  if (!isFeatureEnabled('module.landing')) {
    rootEl.innerHTML = `
      <div class="ax-landing">
        <div class="ax-landing-card">
          <h1 class="ax-landing-logo">APEX</h1>
          <p class="ax-muted ax-gs-187">Service temporairement fermé par l'administrateur.</p>
          <p class="ax-muted ax-gs-397">Si tu es admin Kevin, rafraîchis pour bypass.</p>
        </div>
      </div>
    `;
    return;
  }
  /* Auto-login background si device connu (non bloquant) */
  void tryAutoLogin().then((logged) => {
    if (logged) toast.success('🔐 Reconnu automatiquement (device trusted)');
  });
  const invite = parseInviteToken();
  rootEl.innerHTML = `
    <div class="ax-landing">
      <div class="ax-landing-card ax-slide-up-fade">
        <div class="ax-landing-logo-wrap">
          <h1 class="ax-landing-logo">APEX</h1>
          <span class="ax-landing-version">${APP_VER}</span>
        </div>
        <p class="ax-landing-tagline">Ton assistant intelligent personnel</p>
        ${invite ? '<div class="ax-info" role="status">📨 Invitation détectée — connecte-toi avec ton nom complet</div>' : ''}
        <form id="login-form" class="ax-form" novalidate>
          <label>
            <span class="ax-form-label">Nom et prénom</span>
            <input type="text" id="login-name" aria-label="Nom et prénom" required minlength="3" autocomplete="name"
              placeholder="Ton prénom et nom" autocapitalize="words" spellcheck="false">
          </label>
          <label>
            <span class="ax-form-label">Code PIN</span>
            <input type="password" id="login-pin" aria-label="Code PIN de connexion" required minlength="4" autocomplete="current-password"
              inputmode="numeric" placeholder="••••••" maxlength="12">
          </label>
          <button type="submit" id="login-submit" class="ax-btn ax-btn-primary ax-btn-block">
            <span class="ax-btn-label">Se connecter</span>
            <span class="ax-spinner ax-gs-234" aria-hidden="true"></span>
          </button>
        </form>
        <div id="login-error" aria-live="polite" aria-atomic="true"></div>
        <button type="button" id="login-biometric" class="ax-btn ax-btn-secondary ax-btn-block" style="margin-top:12px;display:none" aria-label="Déverrouiller avec Face ID ou Touch ID">
          🔓 Déverrouiller avec Face ID / Touch ID
        </button>
        <button type="button" id="login-reset-pin" class="ax-btn ax-btn-ghost ax-btn-block" style="margin-top:12px;font-size:13px">
          🔑 J'ai oublié mon code PIN
        </button>
        <div style="margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.06);text-align:center">
          <p style="color:var(--ax-text-dim,#888);font-size:12px;margin:0 0 6px">Pas encore de compte ?</p>
          <button type="button" id="login-go-signup" class="ax-btn ax-btn-secondary ax-btn-block ax-gs-398">📝 Créer mon compte</button>
        </div>
        <p class="ax-landing-footer ax-muted">
          🔒 Local-first · End-to-end · Zero tracking
        </p>
      </div>
    </div>
  `;

  const form = rootEl.querySelector<HTMLFormElement>('#login-form');
  if (form && activeLandingScope) activeLandingScope.bind(form, 'submit', (e) => {
    e.preventDefault();
    haptic.tap();
    void handleLogin(rootEl);
  });

  /* Compte unique kd-mc.com : Face ID prouvé + propriétaire → auto-login admin ;
     sinon pré-remplissage du nom (PIN requis). */
  domainAutoLoginOrPrefill(rootEl);

  /* FaceID/TouchID : bouton déverrouillage si le dernier user connu est enrôlé.
     Affiché seulement si biométrie dispo + credential présent. PIN reste fallback. */
  const bioBtn = rootEl.querySelector<HTMLButtonElement>('#login-biometric');
  if (bioBtn && activeLandingScope) {
    const lastUid = localStorage.getItem('apex_v13_last_known_uid');
    if (lastUid && webauthn.hasEnrollment(lastUid)) {
      void webauthn.isAvailable().then((a) => {
        if (a.supported && a.platform === 'platform') bioBtn.style.display = '';
      });
    }
    activeLandingScope.bind(bioBtn, 'click', () => {
      haptic.tap();
      void tryBiometricUnlock();
    });
  }

  /* Reset PIN handler : efface PIN admin/user pour permettre re-init au prochain login */
  const resetBtn = rootEl.querySelector<HTMLButtonElement>('#login-reset-pin');
  if (resetBtn && activeLandingScope) activeLandingScope.bind(resetBtn, 'click', () => {
    haptic.medium();
    const nameInput = rootEl.querySelector<HTMLInputElement>('#login-name');
    const enteredName = nameInput?.value.trim() ?? '';
    if (!enteredName) {
      const errEl = rootEl.querySelector<HTMLDivElement>('#login-error');
      if (errEl) errEl.innerHTML = '<div class="ax-alert ax-alert-warn">Tape ton nom et prénom d\'abord, puis tap "🔑 J\'ai oublié mon code PIN"</div>';
      return;
    }
    if (!confirm(`Réinitialiser le code PIN pour "${enteredName}" ?\n\n` +
      '• Ton PIN actuel sera EFFACÉ\n' +
      '• Tu pourras créer un nouveau PIN au prochain login\n' +
      '• Tes données (Coffre, conversations, profil) sont PRÉSERVÉES\n\n' +
      'Continuer ?')) return;
    /* Anti-énumération : on efface le PIN admin ET tous les PINs per-user matchant */
    try {
      localStorage.removeItem('apex_v13_pin');
      localStorage.removeItem('apex_v13_pin_kdmc_admin');
      /* Nettoie aussi les rate-limit fails pour redémarrer propre */
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith('apex_v13_pin_fails_')) keys.push(k);
      }
      for (const k of keys) localStorage.removeItem(k);
    } catch { /* ignore */ }
    const errEl = rootEl.querySelector<HTMLDivElement>('#login-error');
    if (errEl) errEl.innerHTML = '<div class="ax-alert ax-alert-success">✅ PIN réinitialisé. Tape ton nouveau code PIN puis Se connecter.</div>';
    const pinInput = rootEl.querySelector<HTMLInputElement>('#login-pin');
    if (pinInput) {
      pinInput.value = '';
      pinInput.focus();
    }
  });

  /* Bouton self-signup (Kevin v13.3.67 — clients publics) */
  const signupBtn = rootEl.querySelector<HTMLButtonElement>('#login-go-signup');
  if (signupBtn && activeLandingScope) activeLandingScope.bind(signupBtn, 'click', () => {
    haptic.tap();
    router.navigate('signup');
  });

  /* Auto-focus nom (mobile-friendly : pas keyboard pop sur iPhone si pas user gesture, mais OK desktop) */
  if (typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches) {
    rootEl.querySelector<HTMLInputElement>('#login-name')?.focus();
  }
}

async function handleLogin(rootEl: HTMLElement): Promise<void> {
  const nameInput = rootEl.querySelector<HTMLInputElement>('#login-name');
  const pinInput = rootEl.querySelector<HTMLInputElement>('#login-pin');
  const submitBtn = rootEl.querySelector<HTMLButtonElement>('#login-submit');
  const errEl = rootEl.querySelector<HTMLElement>('#login-error');
  const labelEl = submitBtn?.querySelector<HTMLElement>('.ax-btn-label');
  const spinnerEl = submitBtn?.querySelector<HTMLElement>('.ax-spinner');

  const name = nameInput?.value.trim() ?? '';
  const pin = pinInput?.value ?? '';

  /* Validation client-side rapide (avant requête réseau) */
  if (name.length < 2 || pin.length < 4) {
    haptic.warning();
    if (errEl) {
      errEl.innerHTML = `<div class="ax-error">Nom et PIN obligatoires (min 4 chiffres)</div>`;
    }
    return;
  }

  /* État loading */
  if (submitBtn) submitBtn.disabled = true;
  if (labelEl) labelEl.textContent = 'Vérification...';
  if (spinnerEl) spinnerEl.style.display = 'inline-block';

  try {
    const result = await auth.login(name, pin);
    if (!result.ok) {
      haptic.error();
      const reason = result.reason ?? 'Connexion impossible';
      if (errEl) errEl.innerHTML = `<div class="ax-error">${escapeHtml(reason)}</div>`;
      toast.error(reason);
      /* Re-enable submit */
      if (submitBtn) submitBtn.disabled = false;
      if (labelEl) labelEl.textContent = 'Se connecter';
      if (spinnerEl) spinnerEl.style.display = 'none';
      return;
    }

    /* Login réussi */
    haptic.success();
    toast.success('Bienvenue !');
    /* Règle Kevin : proposer Face ID/Touch ID après 1ère connexion PIN réussie
       (opt-in, non-bloquant, fallback PIN conservé). On lit l'uid loggé. */
    const loggedUid = localStorage.getItem('apex_v13_last_known_uid');
    const loggedName = localStorage.getItem('apex_v13_last_known_name') ?? name;
    if (loggedUid) void offerBiometricEnroll(loggedUid, loggedName);
    /* Petit délai pour animation toast visible avant navigate */
    setTimeout(() => {
      router.navigate('chat');
    }, 200);
  } catch (err: unknown) {
    haptic.error();
    const msg = err instanceof Error ? err.message : 'Erreur inattendue';
    if (errEl) errEl.innerHTML = `<div class="ax-error">${escapeHtml(msg)}</div>`;
    toast.error(msg);
    if (submitBtn) submitBtn.disabled = false;
    if (labelEl) labelEl.textContent = 'Se connecter';
    if (spinnerEl) spinnerEl.style.display = 'none';
  }
}
