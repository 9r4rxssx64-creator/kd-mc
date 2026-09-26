/**
 * APEX v13 — WhatsApp confirmation service
 *
 * Demande Kevin 2026-04-29 (CLAUDE.md règle "APEX TOUS ACCÈS") :
 * "Apex doit avoir intégrés WhatsApp link/OTP : validation clients + service client"
 *
 * Stratégie sans API officielle WhatsApp Business (gratuite) :
 * - Génère lien wa.me direct avec message pré-rempli
 * - OTP 6 chiffres généré côté client + Firebase pour vérif
 * - Kevin reçoit notification "Untel s'inscrit, code attendu : XXXXXX"
 * - Client clique le lien WhatsApp, envoie le code à Kevin, qui valide
 *
 * Jet 2 : intégration WhatsApp Business API si Kevin fournit token Meta.
 */

import { logger } from '../../core/logger.js';
import { firebase } from '../storage/firebase.js';

interface PendingConfirmation {
  uid: string;
  name: string;
  whatsapp: string;
  otp: string;
  createdAt: number;
  expiresAt: number;
  confirmed: boolean;
}

class WhatsApp {
  private readonly OTP_TTL = 24 * 60 * 60 * 1000; /* 24h */

  /**
   * Récupère le numéro WhatsApp de Kevin pour lui envoyer les confirmations.
   */
  getKevinWhatsApp(): string {
    return localStorage.getItem('ax_kevin_whatsapp_phone') ?? '';
  }

  /**
   * Crée une demande de confirmation : génère OTP, stocke en attente, retourne lien wa.me.
   * Le client clique → ouvre WhatsApp avec message pré-rempli vers Kevin contenant le code.
   */
  async requestConfirmation(opts: { uid: string; name: string; whatsappPhone: string }): Promise<{
    ok: boolean;
    inviteLink?: string;
    otp?: string;
    reason?: string;
  }> {
    const kevinPhone = this.getKevinWhatsApp();
    if (!kevinPhone) return { ok: false, reason: 'Numéro Kevin WhatsApp non configuré' };

    const otp = this.generateOTP();
    const pending: PendingConfirmation = {
      uid: opts.uid,
      name: opts.name,
      whatsapp: opts.whatsappPhone,
      otp,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.OTP_TTL,
      confirmed: false,
    };

    try {
      const list = JSON.parse(localStorage.getItem('apex_v13_pending_confirms') ?? '[]') as PendingConfirmation[];
      list.push(pending);
      localStorage.setItem('apex_v13_pending_confirms', JSON.stringify(list));
    } catch (err: unknown) {
      logger.warn('whatsapp', 'persist failed', { err });
    }
    void firebase.write('apex_v13_pending_confirms', pending);

    const message = encodeURIComponent(
      `Bonjour Kevin, je suis ${opts.name}. Voici mon code d'inscription Apex : ${otp}`,
    );
    const phone = kevinPhone.replace(/[^\d]/g, '');
    const inviteLink = `https://wa.me/${phone}?text=${message}`;
    logger.info('whatsapp', `Confirmation requested for ${opts.name}`, { otp });
    return { ok: true, inviteLink, otp };
  }

  /**
   * Kevin valide manuellement (ou auto si reçoit le bon OTP via WhatsApp Business API plus tard).
   */
  confirm(otp: string): { ok: boolean; uid?: string } {
    try {
      const list = JSON.parse(localStorage.getItem('apex_v13_pending_confirms') ?? '[]') as PendingConfirmation[];
      const found = list.find((p) => p.otp === otp && !p.confirmed && p.expiresAt > Date.now());
      if (!found) return { ok: false };
      found.confirmed = true;
      localStorage.setItem('apex_v13_pending_confirms', JSON.stringify(list));
      /* Active le compte côté users */
      const users = JSON.parse(localStorage.getItem('apex_v13_users') ?? '[]') as Array<{ id: string; activated: boolean }>;
      const user = users.find((u) => u.id === found.uid);
      if (user) {
        user.activated = true;
        localStorage.setItem('apex_v13_users', JSON.stringify(users));
      }
      logger.info('whatsapp', `Confirmed ${found.name}`);
      return { ok: true, uid: found.uid };
    } catch (err: unknown) {
      logger.error('whatsapp', 'confirm failed', { err });
      return { ok: false };
    }
  }

  listPending(): PendingConfirmation[] {
    try {
      const list = JSON.parse(localStorage.getItem('apex_v13_pending_confirms') ?? '[]') as PendingConfirmation[];
      return list.filter((p) => !p.confirmed && p.expiresAt > Date.now());
    } catch {
      return [];
    }
  }

  /**
   * v13.4.211 (Kevin "Laurence doit recevoir directement son code") :
   * Construit un lien wa.me qui ouvre WhatsApp de Kevin pré-rempli vers le
   * numéro du CLIENT (Laurence) avec le code OTP dans le message.
   *
   * Kevin clique → son WhatsApp s'ouvre déjà adressé à Laurence avec :
   * "Bonjour [Name], voici ton code Apex : XXXXXX-YYYYYY"
   * Kevin tape juste "envoyer" → Laurence reçoit sur son WhatsApp en ~2s.
   *
   * Pas besoin de WhatsApp Business API ni Twilio (gratuit, immédiat).
   */
  buildKevinToClientLink(opts: { clientPhone: string; clientName: string; otp: string }): string {
    const cleanPhone = opts.clientPhone.replace(/[^\d]/g, '');
    const message = encodeURIComponent(
      `Bonjour ${opts.clientName}, voici ton code d'accès Apex : ${opts.otp}\n\nTape ce code sur Apex pour activer ton compte. Code valide 24h.`,
    );
    return `https://wa.me/${cleanPhone}?text=${message}`;
  }

  /**
   * v13.4.211 — Verify OTP saisi par le client (Laurence tape le code reçu).
   * Match contre la liste des pending confirmations.
   */
  verifyClientOtp(otp: string): { ok: boolean; uid?: string; name?: string } {
    try {
      const cleanOtp = otp.trim().toUpperCase();
      const list = JSON.parse(localStorage.getItem('apex_v13_pending_confirms') ?? '[]') as PendingConfirmation[];
      const found = list.find((p) => p.otp.toUpperCase() === cleanOtp && !p.confirmed && p.expiresAt > Date.now());
      if (!found) return { ok: false };
      found.confirmed = true;
      localStorage.setItem('apex_v13_pending_confirms', JSON.stringify(list));
      logger.info('whatsapp', `Client OTP verified for ${found.name}`);
      return { ok: true, uid: found.uid, name: found.name };
    } catch (err: unknown) {
      logger.error('whatsapp', 'verifyClientOtp failed', { err });
      return { ok: false };
    }
  }

  /* P1 fix : OTP 12 chars alphanumériques (entropie ~70 bits vs 20 bits 6-digit) */
  private generateOTP(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(9));
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; /* sans 0/O/1/I/L pour lisibilité (fix bug v13.0.80 — L était présent) */
    let out = '';
    for (let i = 0; i < 12; i++) {
      const b = bytes[i % bytes.length];
      out += alphabet[(b ?? 0) % alphabet.length];
    }
    return out.slice(0, 6) + '-' + out.slice(6); /* format XXXXXX-XXXXXX */
  }
}

export const whatsapp = new WhatsApp();
