/**
 * APEX v13 — Voice Diagnostic (Kevin 2026-05-08 21h05).
 *
 * Demande Kevin :
 * "Je ne comprends pas pourquoi le micro ne marcherait plus alors qu'il a
 *  marché jusqu'à maintenant. Et dit apex, c'est un micro, donc pourquoi il
 *  ne marcherait pas. Tout doit fonctionner même en arrière-plan."
 *
 * Vue diagnostic exhaustive qui surface RÉELLEMENT pourquoi le micro / wake
 * word peut ou non fonctionner :
 *
 * 1. Détection environnement (iOS/Android/Desktop, Safari/Chrome/PWA)
 * 2. Test SpeechRecognition (existence + lang FR)
 * 3. Test MediaRecorder + getUserMedia microphone
 * 4. Test SpeechSynthesis voices (compte FR/EN)
 * 5. Test AudioContext + Web Audio API
 * 6. État permission micro (granted/denied/prompt)
 * 7. Mode Background : indique limitations Apple iOS PWA + workarounds
 * 8. **One-click fixes** :
 *    - "🎤 Tester maintenant" → demande permission + transcription live
 *    - "🔁 Réinitialiser permission micro" → instructions iOS Settings
 *    - "🌐 Ouvrir dans Safari classique" (workaround PWA)
 *    - "📞 Activer wake-bridge background via Web Push" (innovation)
 */

import { logger } from '../../../core/logger.js';
import { escapeHtml } from '../../../ui/markdown.js';
import { toast } from '../../../ui/toast.js';

interface DiagnosticResult {
  category: string;
  ok: boolean;
  status: string;
  detail?: string;
}

class VoiceDiagnostic {
  /** Lance tous les tests + retourne tableau résultats. */
  async runAll(): Promise<DiagnosticResult[]> {
    const results: DiagnosticResult[] = [];

    /* 1. Environnement */
    const ua = navigator.userAgent;
    const isiOS = /iPhone|iPad|iPod/.test(ua);
    const isAndroid = /Android/.test(ua);
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua);
    results.push({
      category: 'Environnement',
      ok: true,
      status: `${isiOS ? '📱 iOS' : isAndroid ? '🤖 Android' : '🖥 Desktop'} · ${isSafari ? 'Safari' : 'Autre'} · ${isStandalone ? 'PWA standalone' : 'Browser'}`,
      detail: `UA: ${ua.slice(0, 80)}…`,
    });

    /* 2. SpeechRecognition */
    const SR =
      (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    results.push({
      category: 'SpeechRecognition (dictée + Dis Apex)',
      ok: SR !== undefined,
      status: SR !== undefined ? '✅ API disponible' : '❌ API absente',
      detail:
        SR === undefined && isiOS && isStandalone
          ? '⚠️ Limitation Apple iOS PWA standalone : SpeechRecognition désactivé. Utilise Safari classique (URL Pages directe).'
          : 'OK',
    });

    /* 3. getUserMedia (microphone) */
    const hasMicrophoneApi =
      typeof navigator.mediaDevices !== 'undefined' &&
      typeof navigator.mediaDevices.getUserMedia === 'function';
    results.push({
      category: 'getUserMedia (accès micro)',
      ok: hasMicrophoneApi,
      status: hasMicrophoneApi ? '✅ API disponible' : '❌ API absente',
      detail: hasMicrophoneApi ? 'OK' : 'Navigateur trop ancien',
    });

    /* 4. État permission micro */
    let permState = 'unknown';
    try {
      if (typeof navigator.permissions !== 'undefined') {
        const perm = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        permState = perm.state;
      }
    } catch {
      /* permissions.query pas supporté pour microphone sur tous browsers */
    }
    results.push({
      category: 'Permission micro iOS/Android',
      ok: permState === 'granted' || permState === 'unknown',
      status:
        permState === 'granted'
          ? '✅ Autorisé'
          : permState === 'denied'
            ? '🚫 Refusé'
            : permState === 'prompt'
              ? '🟡 Pas encore demandé'
              : '⚪ État inconnu (API permissions limitée)',
      detail:
        permState === 'denied'
          ? 'Réglages iOS > Safari > Microphone → Autoriser'
          : 'OK',
    });

    /* 5. SpeechSynthesis voices */
    let voicesCount = 0;
    let voicesFR = 0;
    if (typeof speechSynthesis !== 'undefined') {
      const voices = speechSynthesis.getVoices();
      voicesCount = voices.length;
      voicesFR = voices.filter((v) => v.lang.startsWith('fr')).length;
    }
    results.push({
      category: 'SpeechSynthesis (lecture voix)',
      ok: voicesCount > 0,
      status: voicesCount > 0 ? `✅ ${voicesCount} voix (${voicesFR} FR)` : '❌ Aucune voix',
      detail: voicesCount === 0 ? 'Recharge la page si voix vides' : 'OK',
    });

    /* 6. AudioContext */
    const hasAudioCtx =
      typeof (window as unknown as { AudioContext?: unknown }).AudioContext !== 'undefined' ||
      typeof (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext !==
        'undefined';
    results.push({
      category: 'AudioContext (Web Audio)',
      ok: hasAudioCtx,
      status: hasAudioCtx ? '✅ API disponible' : '❌ API absente',
    });

    /* 7. MediaRecorder */
    const hasMediaRec = typeof MediaRecorder !== 'undefined';
    results.push({
      category: 'MediaRecorder (enregistrement)',
      ok: hasMediaRec,
      status: hasMediaRec ? '✅ API disponible' : '❌ API absente',
    });

    /* 8. Service Worker (background tasks) */
    const hasSW = 'serviceWorker' in navigator;
    let swActive = false;
    if (hasSW) {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        swActive = reg?.active !== null && reg?.active !== undefined;
      } catch {
        /* skip */
      }
    }
    results.push({
      category: 'Service Worker (cache + push)',
      ok: hasSW && swActive,
      status: hasSW && swActive ? '✅ Actif' : hasSW ? '🟡 Inactif' : '❌ Non supporté',
    });

    /* 9. Push API (background voice-trigger) */
    const hasPush = 'PushManager' in window;
    let pushSubscribed = false;
    if (hasPush) {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        pushSubscribed = sub !== null && sub !== undefined;
      } catch {
        /* skip */
      }
    }
    results.push({
      category: 'Push API (réveil background)',
      ok: hasPush,
      status: hasPush
        ? pushSubscribed
          ? '✅ Abonné (réveil possible)'
          : '🟡 Disponible mais pas abonné'
        : '❌ Non supporté',
      detail: isiOS
        ? "iOS 16.4+ requis. Le 'Wake background' iOS = Web Push notification cliquée → app foreground + auto-listen."
        : 'OK',
    });

    return results;
  }

  /** Test live micro : demande permission + capture 3s + retourne transcription. */
  async testMicrophoneLive(rootEl: HTMLElement): Promise<void> {
    const out = rootEl.querySelector<HTMLDivElement>('#voice-diag-test-out');
    if (!out) return;
    out.textContent = '⏳ Demande permission micro…';
    try {
      const SRClass =
        (window as unknown as { SpeechRecognition?: new () => unknown }).SpeechRecognition ??
        (window as unknown as { webkitSpeechRecognition?: new () => unknown })
          .webkitSpeechRecognition;
      if (!SRClass) {
        out.innerHTML =
          '<div class="ax-gs-13">❌ SpeechRecognition non supporté. Sur iOS PWA : ouvre dans Safari classique.</div>';
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      out.textContent = '🎤 Permission OK. Parle maintenant (3s)…';
      const rec = new (SRClass as new () => {
        lang: string;
        continuous: boolean;
        interimResults: boolean;
        onresult: ((e: Event) => void) | null;
        onerror: ((e: Event) => void) | null;
        onend: (() => void) | null;
        start: () => void;
        stop: () => void;
      })();
      rec.lang = 'fr-FR';
      rec.continuous = false;
      rec.interimResults = true;
      let transcript = '';
      rec.onresult = (e: Event): void => {
        const ev = e as Event & { results: Array<Array<{ transcript: string }>> };
        for (let i = 0; i < ev.results.length; i++) {
          transcript += ev.results[i]?.[0]?.transcript ?? '';
        }
        out.innerHTML = `<div class="ax-gs-14">📝 Transcription : <strong>${escapeHtml(transcript)}</strong></div>`;
      };
      rec.onerror = (e: Event): void => {
        const ev = e as Event & { error: string };
        const code = ev.error ?? 'inconnu';
        logger.warn('voice-diagnostic', 'SpeechRecognition error', { code });
        /* v13.4.246 — message clair + actionnable, code technique gardé en diagnostic. */
        const friendly =
          code === 'not-allowed' || code === 'service-not-allowed'
            ? 'Micro refusé — autorise le micro dans les réglages du navigateur.'
            : code === 'no-speech'
              ? 'Aucune voix détectée — parle plus près du micro.'
              : code === 'audio-capture'
                ? 'Aucun micro détecté sur cet appareil.'
                : code === 'network'
                  ? 'Réseau indisponible pour la reconnaissance vocale.'
                  : 'La reconnaissance vocale a échoué, réessaie.';
        out.innerHTML = `<div class="ax-gs-13">⚠️ ${escapeHtml(friendly)} <span style="opacity:.5">(${escapeHtml(code)})</span></div>`;
      };
      rec.onend = (): void => {
        if (!transcript) {
          out.innerHTML = '<div class="ax-gs-61">🔇 Aucune voix captée. Réessaie.</div>';
        }
      };
      rec.start();
      setTimeout(() => {
        try {
          rec.stop();
        } catch {
          /* déjà arrêté */
        }
      }, 3500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      out.innerHTML = `<div class="ax-gs-13">🚫 ${escapeHtml(msg)}</div>`;
    }
  }
}

const vd = new VoiceDiagnostic();

export async function render(rootEl: HTMLElement): Promise<void> {
  rootEl.innerHTML = `
    <div style="padding:16px;max-width:760px;margin:0 auto;color:#fff;font-family:-apple-system,system-ui,sans-serif">
      <h1 style="margin:0 0 4px;font-size:20px;color:#e8b830">🎙 Diagnostic vocal Apex</h1>
      <p style="color:rgba(255,255,255,0.6);font-size:12.5px;margin:0 0 16px;line-height:1.4">Test exhaustif du micro, dictée, "Dis Apex" et synthèse vocale. Identifie pourquoi ça marche ou non.</p>
      <div id="voice-diag-results" style="display:flex;flex-direction:column;gap:8px"></div>
      <section style="margin-top:18px;padding:14px;background:linear-gradient(135deg,rgba(20,20,35,0.7),rgba(14,14,28,0.5));border:1px solid rgba(232,184,48,0.25);border-radius:14px">
        <h3 class="ax-gs-310">🎤 Test live micro (3s)</h3>
        <button id="voice-diag-test-btn" style="padding:12px 20px;background:linear-gradient(135deg,#c9a227,#e8b830);color:#000;border:none;border-radius:10px;font-weight:700;cursor:pointer;font-size:14px;min-height:44px">Démarrer test</button>
        <div id="voice-diag-test-out" style="margin-top:10px;padding:10px;background:rgba(0,0,0,0.3);border-radius:8px;font-size:13px;min-height:24px;color:rgba(255,255,255,0.7)">Pas encore lancé</div>
      </section>
      <section style="margin-top:14px;padding:14px;background:rgba(255,255,255,0.03);border-radius:12px">
        <h3 class="ax-gs-310">🔧 Solutions rapides</h3>
        <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.6;color:rgba(255,255,255,0.78)">
          <li><strong>Permission refusée</strong> : iOS Réglages → Safari → Microphone → Autoriser, puis recharge.</li>
          <li><strong>SpeechRecognition KO en PWA</strong> : ouvre <a href="https://apex-ai.kd-mc.com/" style="color:#6a8aff">Apex dans Safari classique</a> (URL directe, pas l'icône). Limitation Apple iOS PWA.</li>
          <li><strong>Aucune voix synthèse</strong> : appuie sur 🔄 (recharge) — iOS charge les voix de façon asynchrone.</li>
          <li><strong>Wake word arrière-plan iOS</strong> : impossible nativement (suspendu par OS). Workaround : Web Push Notification → tap → app foreground → auto-listen.</li>
          <li><strong>Tout reset</strong> : icône 🔄 force-update bouton rouge en haut (apparaît si nouvelle version dispo).</li>
        </ul>
      </section>
    </div>
  `;
  const resultsEl = rootEl.querySelector<HTMLDivElement>('#voice-diag-results');
  if (resultsEl) {
    resultsEl.innerHTML = '<div style="padding:14px;color:rgba(255,255,255,0.6)">⏳ Diagnostic en cours…</div>';
    try {
      const results = await vd.runAll();
      resultsEl.innerHTML = results
        .map((r) => {
          const color = r.ok ? '#22cc77' : '#ffaa00';
          return `
            <div style="padding:10px 14px;background:rgba(255,255,255,0.03);border-left:3px solid ${color};border-radius:8px">
              <div style="font-weight:600;font-size:13.5px;color:${color}">${escapeHtml(r.status)}</div>
              <div class="ax-gs-119">${escapeHtml(r.category)}</div>
              ${r.detail ? `<div style="font-size:11.5px;color:rgba(255,255,255,0.45);margin-top:4px;font-family:ui-monospace,monospace">${escapeHtml(r.detail)}</div>` : ''}
            </div>
          `;
        })
        .join('');
    } catch (err: unknown) {
      logger.warn('voice-diagnostic', 'runAll failed', { err });
      /* v13.4.246 — message clair + cause exacte gardée en diagnostic (règle erreurs détaillées). */
      const cause = err instanceof Error ? err.message : String(err);
      resultsEl.innerHTML = `<div style="padding:14px;color:#ff5b5b">Le diagnostic vocal a échoué, réessaie. <span style="opacity:.6;font-size:11px;font-family:ui-monospace,monospace">(${escapeHtml(cause)})</span></div>`;
    }
  }
  const testBtn = rootEl.querySelector<HTMLButtonElement>('#voice-diag-test-btn');
  testBtn?.addEventListener('click', () => {
    void vd.testMicrophoneLive(rootEl).catch(() => {
      toast.warn('Test micro échoué');
    });
  });
}
