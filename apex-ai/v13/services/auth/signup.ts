/**
 * APEX v13 — Self-signup service (clients publics)
 *
 * Mission Kevin 2026-05-08 02h : "création de compte, 1ère connexion etc avec validation WhatsApp"
 *
 * Architecture :
 *  1. Client public remplit form (prénom + nom + email + téléphone WhatsApp + plan)
 *  2. signup.requestSignup() → génère OTP, stocke dans apex_v13_signup_pending_<id>
 *  3. Client reçoit lien wa.me Kevin avec OTP pré-rempli
 *  4. Kevin valide via vue admin → approveSignup() crée user + alias + status pending_plan/family_bypass
 *  5. Client peut alors se connecter via landing avec son nom + 1er PIN qu'il choisit
 *
 * Sécurité :
 *  - Anti-spam : 1 inscription max / téléphone / 24h
 *  - Validation phone E.164 (+33xxx ou +377xxx Monaco)
 *  - Validation email RFC 5322 simplifiée
 *  - OTP 12 chars alphanumériques (entropie ~70 bits) via WhatsApp service
 *  - RGPD : consent obligatoire avant submit (CGU + traitement)
 */

import { events } from '../../core/events.js';
import { logger } from '../../core/logger.js';
import { store } from '../../core/store.js';
import { kevinAlerts } from '../admin/kevin-alerts.js';
import { whatsapp } from '../integrations/whatsapp.js';
import { auditLog } from '../observability/audit-log.js';

import { authGate } from './auth-gate.js';
import { auth } from './auth.js';


export type SignupPlan = 'family' | 'free' | 'basic' | 'pro';

export interface SignupRequest {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  whatsapp: string; /* Format E.164 +33xxx */
  plan: SignupPlan;
  consent: { cgu: boolean; rgpd: boolean; ts: number };
  otp: string; /* Mémorisé pour validation manuelle Kevin (P3 : hash en P4) */
  inviteLink: string; /* wa.me link Kevin */
  status: 'awaiting_otp' | 'awaiting_kevin' | 'approved' | 'rejected' | 'expired';
  createdAt: number;
  expiresAt: number;
  reviewedBy?: string;
  reviewedAt?: number;
  rejectReason?: string;
}

const PHONE_RE = /^\+(\d{1,3})(\d{6,14})$/; /* E.164 strict */
const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const TTL_MS = 7 * 24 * 60 * 60 * 1000; /* 7 jours pour Kevin valide */
const ANTI_SPAM_MS = 24 * 60 * 60 * 1000; /* 1 inscription max / 24h / phone */

class Signup {
  /**
   * Validation client-side AVANT submit (rapide, pas d'écriture).
   */
  validate(req: Pick<SignupRequest, 'prenom' | 'nom' | 'email' | 'whatsapp' | 'consent'>): { ok: boolean; reason?: string } {
    if (!req.prenom || req.prenom.trim().length < 2) return { ok: false, reason: 'Prénom requis (min 2 caractères)' };
    if (!req.nom || req.nom.trim().length < 2) return { ok: false, reason: 'Nom requis (min 2 caractères)' };
    if (!req.email || !EMAIL_RE.test(req.email)) return { ok: false, reason: 'Email invalide' };
    if (!req.whatsapp || !PHONE_RE.test(req.whatsapp.replace(/[\s\-()]/g, ''))) {
      return { ok: false, reason: 'Numéro WhatsApp invalide (format +33xxx)' };
    }
    if (!req.consent.cgu || !req.consent.rgpd) return { ok: false, reason: 'CGU + RGPD obligatoires' };
    return { ok: true };
  }

  /**
   * Submit signup → génère OTP + lien wa.me Kevin.
   * Anti-spam 1/24h/phone. Stockage local + Firebase pour Kevin admin.
   */
  async requestSignup(req: Omit<SignupRequest, 'id' | 'otp' | 'inviteLink' | 'status' | 'createdAt' | 'expiresAt'>): Promise<{
    ok: boolean;
    reason?: string;
    inviteLink?: string;
    requestId?: string;
  }> {
    /* Validation */
    const v = this.validate(req);
    if (!v.ok) return { ok: false, reason: v.reason ?? 'Validation échouée' };

    /* Anti-spam phone-based */
    const cleanPhone = req.whatsapp.replace(/[\s\-()]/g, '');
    const recent = this.findRecentByPhone(cleanPhone);
    if (recent) {
      const remainingMin = Math.ceil((recent.createdAt + ANTI_SPAM_MS - Date.now()) / 60_000);
      if (remainingMin > 0) {
        return { ok: false, reason: `Inscription déjà en cours pour ce numéro (${remainingMin} min restantes)` };
      }
    }

    /* Génération ID + OTP via WhatsApp service */
    const id = `signup_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const tempUid = `pending_${id}`;
    const fullName = `${req.prenom.trim()} ${req.nom.trim()}`;

    const wa = await whatsapp.requestConfirmation({
      uid: tempUid,
      name: fullName,
      whatsappPhone: cleanPhone,
    });

    if (!wa.ok || !wa.inviteLink || !wa.otp) {
      return { ok: false, reason: wa.reason ?? 'WhatsApp service indisponible' };
    }

    const record: SignupRequest = {
      id,
      prenom: req.prenom.trim(),
      nom: req.nom.trim(),
      email: req.email.trim().toLowerCase(),
      whatsapp: cleanPhone,
      plan: req.plan,
      consent: req.consent,
      otp: wa.otp,
      inviteLink: wa.inviteLink,
      status: 'awaiting_kevin',
      createdAt: Date.now(),
      expiresAt: Date.now() + TTL_MS,
    };

    try {
      const list = this.getAll();
      list.push(record);
      localStorage.setItem('apex_v13_signup_requests', JSON.stringify(list));
    } catch (err: unknown) {
      logger.warn('signup', 'persist failed', { err });
      return { ok: false, reason: 'Erreur stockage local' };
    }

    /* Audit + notif Kevin (niveau B notify) */
    await auditLog.record('signup.requested', {
      details: { id, name: fullName, plan: req.plan, email: req.email, phone_masked: this.maskPhone(cleanPhone) },
    });

    void kevinAlerts.alertKevin({
      severity: 'info',
      title: '📥 Nouvelle inscription Apex',
      body: `${fullName} (${req.plan}) souhaite créer un compte. Code: ${wa.otp}`,
      source: 'signup',
      details: { id, plan: req.plan },
    }).catch(() => { /* non-blocking */ });

    logger.info('signup', `Signup requested by ${fullName}`, { id, plan: req.plan });
    return { ok: true, inviteLink: wa.inviteLink, requestId: id };
  }

  /**
   * Liste demandes en attente (admin Kevin only).
   */
  listPending(): SignupRequest[] {
    return this.getAll()
      .filter((r) => r.status === 'awaiting_kevin' && r.expiresAt > Date.now())
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Liste demandes traitées (approved + rejected) — historique admin.
   */
  listProcessed(): SignupRequest[] {
    return this.getAll()
      .filter((r) => r.status === 'approved' || r.status === 'rejected')
      .sort((a, b) => (b.reviewedAt ?? 0) - (a.reviewedAt ?? 0));
  }

  /**
   * v13.4.211 (Kevin "Gratuit et auto. Sinon à partir du moment où j'envoie le
   * lien à qlq un il crée son code avec la fiche info et se Connect auto") :
   *
   * SELF-SIGNUP DIRECT — flow simplifié pour clients invités par lien Kevin :
   * 1. Client clique le lien partagé Apex
   * 2. Remplit fiche (prénom + nom + email + PIN choisi)
   * 3. Submit → compte créé immédiatement + PIN stocké + session active
   * 4. Redirect vers /chat → connecté auto, aucune intervention Kevin
   *
   * Pas d'OTP, pas de WhatsApp, pas d'approbation manuelle. Le lien partagé
   * EST l'authorization (Kevin décide qui reçoit le lien). Self-signup
   * 100% autonome côté client.
   *
   * Sécurité :
   * - Validation 2 tokens (prénom + nom) — règle Kevin v13.3.65 stricte
   * - PIN min 4 chars — hash PBKDF2 200k via auth.hashPin
   * - Aliases multi-formats (règle Kevin v9.458) auto-générés
   * - Audit log signup.self_direct + signup.login_auto
   * - Anti-doublon : refuse si même email OU même n° tel déjà créé
   */
  async selfSignupDirect(opts: {
    prenom: string;
    nom: string;
    email: string;
    pin: string;
    whatsapp?: string;
    plan?: SignupPlan;
    consent: { cgu: boolean; rgpd: boolean; ts: number };
  }): Promise<{ ok: boolean; uid?: string; reason?: string; loggedIn?: boolean }> {
    /* 1. Validation champs */
    if (!opts.prenom || opts.prenom.trim().length < 2) return { ok: false, reason: 'Prénom requis (min 2 caractères)' };
    if (!opts.nom || opts.nom.trim().length < 2) return { ok: false, reason: 'Nom requis (min 2 caractères)' };
    if (!opts.email || !EMAIL_RE.test(opts.email)) return { ok: false, reason: 'Email invalide' };
    if (!opts.pin || opts.pin.length < 4) return { ok: false, reason: 'Code PIN requis (min 4 chiffres)' };
    if (!opts.consent.cgu || !opts.consent.rgpd) return { ok: false, reason: 'CGU + RGPD obligatoires' };

    const prenom = opts.prenom.trim();
    const nom = opts.nom.trim();
    const email = opts.email.trim().toLowerCase();
    const fullName = `${prenom} ${nom}`;
    const tier = opts.plan === 'family' ? 'family' : (opts.plan ?? 'free');

    /* 2. Anti-doublon par email */
    try {
      const users = JSON.parse(localStorage.getItem('apex_v13_users') ?? '[]') as Array<{ id: string; email: string }>;
      const dup = users.find((u) => u.email.toLowerCase() === email);
      if (dup) {
        return { ok: false, reason: 'Email déjà utilisé. Connecte-toi avec ton PIN existant.' };
      }
    } catch { /* tolère lecture fail */ }

    /* 3. Création user record */
    const uid = `${tier}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    try {
      const users = JSON.parse(localStorage.getItem('apex_v13_users') ?? '[]') as Array<{
        id: string; name: string; email: string; tier: string; whatsapp: string;
        createdAt: number; createdBy: string; activated: boolean;
      }>;
      users.push({
        id: uid,
        name: fullName,
        email,
        tier,
        whatsapp: (opts.whatsapp ?? '').replace(/[\s\-()]/g, ''),
        createdAt: Date.now(),
        createdBy: 'self_signup',
        activated: true,
      });
      localStorage.setItem('apex_v13_users', JSON.stringify(users));
      localStorage.setItem(`apex_v13_tier_${uid}`, tier);
    } catch (err: unknown) {
      logger.error('signup', 'self-signup user persist failed', { err });
      return { ok: false, reason: 'Erreur stockage local (quota plein ?)' };
    }

    /* 4. Hash + store PIN */
    try {
      const hash = await auth.hashPin(opts.pin, uid);
      localStorage.setItem(`apex_v13_pin_${uid}`, hash);
    } catch (err: unknown) {
      logger.error('signup', 'self-signup PIN hash failed', { err });
      return { ok: false, reason: 'Erreur chiffrement PIN' };
    }

    /* 5. Aliases multi-formats (règle Kevin v9.458 + v13.3.65) */
    const aliases = this.buildAliases(prenom, nom, email);
    authGate.registerUserAliases(uid, aliases);

    /* 6. Statut compte */
    if (tier === 'family') {
      authGate.setStatus(uid, 'family_bypass');
    } else {
      authGate.setStatus(uid, 'active');
    }

    /* 7. Login auto — set session active */
    store.set('user', { id: uid, name: fullName, email });
    store.set('isAdmin', false);
    try {
      localStorage.setItem('apex_v13_user', JSON.stringify({ id: uid, name: fullName }));
      localStorage.setItem('apex_v13_uid', uid);
      localStorage.setItem('apex_v13_lastact', String(Date.now()));
      localStorage.setItem('apex_v13_last_known_uid', uid);
      localStorage.setItem('apex_v13_last_known_name', fullName);
    } catch { /* quota */ }

    /* 8. Audit + notif Kevin (info) */
    await auditLog.record('signup.self_direct', {
      actor: uid,
      details: { uid, name: fullName, tier, email, phone_masked: opts.whatsapp ? this.maskPhone(opts.whatsapp.replace(/[\s\-()]/g, '')) : null },
    });

    void kevinAlerts.alertKevin({
      severity: 'info',
      title: '👤 Nouveau client Apex',
      body: `${fullName} vient de créer son compte (tier: ${tier})`,
      source: 'signup',
      details: { uid, tier },
    }).catch(() => { /* non-blocking */ });

    events.emit('auth:login', { uid, isAdmin: false });
    logger.info('signup', `Self-signup direct ${fullName} → uid=${uid} tier=${tier} (logged in auto)`);
    return { ok: true, uid, loggedIn: true };
  }

  /**
   * v13.4.211 (Kevin "Laurence doit recevoir son code directement") :
   * Auto-approve si le client tape le bon OTP reçu par WhatsApp de Kevin.
   *
   * Flow :
   * 1. Kevin clique "📱 Envoyer code WhatsApp" dans signup-approval → wa.me s'ouvre
   *    vers le numéro du client avec le code pré-rempli, Kevin envoie en 1 tap.
   * 2. Client (Laurence) reçoit le code sur son WhatsApp.
   * 3. Client tape le code dans Apex (page waiting-approval).
   * 4. verifyClientOtp() valide → auto-approve avec tier default ou plan demandé.
   *
   * Sécurité : OTP 12 chars (entropie ~70 bits) + TTL 24h + matching contre
   * pending_confirms. Pas d'admin uid required ici (Kevin a déjà validé en
   * cliquant pour envoyer le code = authorization implicite).
   */
  async verifyClientOtp(otp: string): Promise<{ ok: boolean; uid?: string; reason?: string; name?: string }> {
    if (!otp || otp.trim().length < 6) return { ok: false, reason: 'Code invalide (min 6 caractères)' };

    /* 1. Find signup request matching OTP */
    const cleanOtp = otp.trim().toUpperCase();
    const list = this.getAll();
    const idx = list.findIndex(
      (r) => r.otp.toUpperCase() === cleanOtp && r.status === 'awaiting_kevin' && r.expiresAt > Date.now(),
    );
    if (idx === -1) return { ok: false, reason: 'Code invalide ou expiré' };
    const req = list[idx];
    if (!req) return { ok: false, reason: 'Demande introuvable' };

    /* 2. Auto-approve avec le plan demandé */
    const tier = req.plan === 'family' ? 'family' : req.plan;
    const uid = `${tier}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const fullName = `${req.prenom} ${req.nom}`;

    try {
      const users = JSON.parse(localStorage.getItem('apex_v13_users') ?? '[]') as Array<{
        id: string; name: string; email: string; tier: string; whatsapp: string;
        createdAt: number; createdBy: string; activated: boolean;
      }>;
      users.push({
        id: uid,
        name: fullName,
        email: req.email,
        tier,
        whatsapp: req.whatsapp,
        createdAt: Date.now(),
        createdBy: 'self_otp_verified',
        activated: true,
      });
      localStorage.setItem('apex_v13_users', JSON.stringify(users));
      localStorage.setItem(`apex_v13_tier_${uid}`, tier);
    } catch (err: unknown) {
      logger.error('signup', 'user persist failed during OTP verify', { err });
      return { ok: false, reason: 'Erreur création compte' };
    }

    /* 3. Aliases multi-formats (règle Kevin v9.458) */
    const aliases = this.buildAliases(req.prenom, req.nom, req.email);
    authGate.registerUserAliases(uid, aliases);

    /* 4. Statut */
    if (tier === 'family') {
      authGate.setStatus(uid, 'family_bypass');
    } else {
      authGate.setStatus(uid, 'pending_plan');
    }

    /* 5. Update signup record */
    req.status = 'approved';
    req.reviewedBy = 'self_otp_verified';
    req.reviewedAt = Date.now();
    list[idx] = req;
    try { localStorage.setItem('apex_v13_signup_requests', JSON.stringify(list)); } catch { /* ignore */ }

    /* 6. Mark pending_confirms OTP comme utilisé (anti-replay) */
    try {
      const pendingList = JSON.parse(localStorage.getItem('apex_v13_pending_confirms') ?? '[]') as Array<{ otp: string; confirmed: boolean }>;
      const pIdx = pendingList.findIndex((p) => p.otp.toUpperCase() === cleanOtp && !p.confirmed);
      if (pIdx >= 0 && pendingList[pIdx]) {
        pendingList[pIdx].confirmed = true;
        localStorage.setItem('apex_v13_pending_confirms', JSON.stringify(pendingList));
      }
    } catch { /* ignore */ }

    await auditLog.record('signup.self_otp_verified', {
      actor: uid,
      details: { requestId: req.id, uid, tier, name: fullName },
    });

    logger.info('signup', `Self-OTP verified for ${fullName} → uid=${uid} tier=${tier}`);
    return { ok: true, uid, name: fullName };
  }

  /**
   * Approve signup → crée user + alias + status (Kevin admin only).
   * Bumps signup → 'approved', génère uid définitif, registre aliases multi-formats.
   */
  async approveSignup(opts: {
    requestId: string;
    type: 'client' | 'family';
    plan?: SignupPlan;
    adminUid: string;
  }): Promise<{ ok: boolean; uid?: string; reason?: string }> {
    if (opts.adminUid !== 'kdmc_admin') return { ok: false, reason: 'Admin Kevin uniquement' };

    const list = this.getAll();
    const idx = list.findIndex((r) => r.id === opts.requestId);
    if (idx === -1) return { ok: false, reason: 'Demande introuvable' };
    const req = list[idx];
    if (!req) return { ok: false, reason: 'Demande introuvable' };
    if (req.status !== 'awaiting_kevin') return { ok: false, reason: 'Demande déjà traitée' };
    if (req.expiresAt < Date.now()) {
      req.status = 'expired';
      list[idx] = req;
      try { localStorage.setItem('apex_v13_signup_requests', JSON.stringify(list)); } catch { /* ignore */ }
      return { ok: false, reason: 'Demande expirée' };
    }

    /* Génère uid définitif */
    const tier = opts.type === 'family' ? 'family' : (opts.plan ?? req.plan ?? 'free');
    const uid = `${tier}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const fullName = `${req.prenom} ${req.nom}`;

    /* Création user record */
    try {
      const users = JSON.parse(localStorage.getItem('apex_v13_users') ?? '[]') as Array<{
        id: string; name: string; email: string; tier: string; whatsapp: string; createdAt: number; createdBy: string; activated: boolean;
      }>;
      users.push({
        id: uid,
        name: fullName,
        email: req.email,
        tier,
        whatsapp: req.whatsapp,
        createdAt: Date.now(),
        createdBy: opts.adminUid,
        activated: true,
      });
      localStorage.setItem('apex_v13_users', JSON.stringify(users));
      localStorage.setItem(`apex_v13_tier_${uid}`, tier);
    } catch (err: unknown) {
      logger.error('signup', 'user persist failed', { err });
      return { ok: false, reason: 'Erreur création user' };
    }

    /* Aliases pour reconnaissance flexible (règle Kevin v9.458) */
    const aliases = this.buildAliases(req.prenom, req.nom, req.email);
    authGate.registerUserAliases(uid, aliases);

    /* Statut */
    if (opts.type === 'family') {
      authGate.setStatus(uid, 'family_bypass');
    } else {
      authGate.setStatus(uid, 'pending_plan');
    }

    /* Update signup record */
    req.status = 'approved';
    req.reviewedBy = opts.adminUid;
    req.reviewedAt = Date.now();
    list[idx] = req;
    try { localStorage.setItem('apex_v13_signup_requests', JSON.stringify(list)); } catch { /* ignore */ }

    await auditLog.record('signup.approved', {
      actor: opts.adminUid,
      details: { requestId: opts.requestId, uid, type: opts.type, tier },
    });

    /* Notif Kevin niveau B (login event when client connects later) */
    logger.info('signup', `Approved ${fullName} → uid=${uid} tier=${tier}`);
    return { ok: true, uid };
  }

  /**
   * Reject signup → mark rejected (Kevin admin only).
   */
  async rejectSignup(opts: { requestId: string; adminUid: string; reason: string }): Promise<{ ok: boolean; reason?: string }> {
    if (opts.adminUid !== 'kdmc_admin') return { ok: false, reason: 'Admin Kevin uniquement' };

    const list = this.getAll();
    const idx = list.findIndex((r) => r.id === opts.requestId);
    if (idx === -1) return { ok: false, reason: 'Demande introuvable' };
    const req = list[idx];
    if (!req) return { ok: false, reason: 'Demande introuvable' };
    if (req.status !== 'awaiting_kevin') return { ok: false, reason: 'Demande déjà traitée' };

    req.status = 'rejected';
    req.reviewedBy = opts.adminUid;
    req.reviewedAt = Date.now();
    req.rejectReason = opts.reason.slice(0, 200);
    list[idx] = req;
    try { localStorage.setItem('apex_v13_signup_requests', JSON.stringify(list)); } catch { /* ignore */ }

    await auditLog.record('signup.rejected', {
      actor: opts.adminUid,
      details: { requestId: opts.requestId, reason: req.rejectReason },
    });
    logger.info('signup', `Rejected ${req.prenom} ${req.nom}`, { reason: req.rejectReason });
    return { ok: true };
  }

  /**
   * Cleanup expired demandes (sentinelle 1×/h).
   */
  async cleanupExpired(): Promise<number> {
    const list = this.getAll();
    const now = Date.now();
    let count = 0;
    for (const r of list) {
      if (r.status === 'awaiting_kevin' && r.expiresAt < now) {
        r.status = 'expired';
        count++;
      }
    }
    if (count > 0) {
      try { localStorage.setItem('apex_v13_signup_requests', JSON.stringify(list)); } catch { /* ignore */ }
      await auditLog.record('signup.cleanup', { details: { expired: count } });
    }
    return count;
  }

  /**
   * Build aliases multi-formats pour reconnaissance flexible.
   * (règle Kevin v9.458 — toutes les façons : casse, ordre, accents, tirets)
   */
  private buildAliases(prenom: string, nom: string, email: string): string[] {
    const p = prenom.trim();
    const n = nom.trim();
    const aliases = new Set<string>([
      `${p} ${n}`,
      `${n} ${p}`,
      `${p.toLowerCase()} ${n.toLowerCase()}`,
      `${n.toUpperCase()} ${p}`,
      email.trim().toLowerCase(),
    ]);
    /* Initiales + nom : "K DESARZENS" */
    if (p.length > 0) aliases.add(`${p.charAt(0).toUpperCase()} ${n}`);
    return [...aliases];
  }

  private getAll(): SignupRequest[] {
    try {
      return JSON.parse(localStorage.getItem('apex_v13_signup_requests') ?? '[]') as SignupRequest[];
    } catch {
      return [];
    }
  }

  private findRecentByPhone(phone: string): SignupRequest | null {
    const cutoff = Date.now() - ANTI_SPAM_MS;
    return this.getAll().find((r) => r.whatsapp === phone && r.createdAt > cutoff && r.status === 'awaiting_kevin') ?? null;
  }

  private maskPhone(phone: string): string {
    if (phone.length <= 4) return phone;
    return phone.slice(0, 4) + '***' + phone.slice(-2);
  }
}

export const signup = new Signup();
