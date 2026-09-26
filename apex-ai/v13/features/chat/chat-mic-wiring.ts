/**
 * APEX v13 — chat-mic-wiring.ts
 * Wiring du bouton micro (dictée STT one-shot) : SpeechRecognition,
 * permission micro, transcript live dans la textarea, auto-submit.
 *
 * Extrait de features/chat/index.ts render() (v13.4.297, refactor monolithe
 * sans régression). Aucune dépendance d'état module : DOM via rootEl + lazy
 * imports voice. Appelé par render().
 */
import { haptic } from '../../ui/haptic.js';
import { toast } from '../../ui/toast.js';

/** Câble le bouton micro (#ax-chat-mic) du chat. */
export function wireMicButton(rootEl: HTMLElement): void {
  const micBtn = rootEl.querySelector<HTMLButtonElement>('#ax-chat-mic');
  let recognition: {
    start: () => void;
    stop: () => void;
    onresult: ((e: Event) => void) | null;
    onend: (() => void) | null;
    onerror: ((e: Event) => void) | null;
    onstart: ((e: Event) => void) | null;
    continuous: boolean;
    interimResults: boolean;
    lang: string;
  } | null = null;
  let recognitionActive = false;
  let dictationNoSpeechRetries = 0;
  const DICTATION_MAX_NO_SPEECH = 20;
  micBtn?.addEventListener('click', () => {
    haptic.tap();
    /* v13.3.81 Kevin 20:10 "le micro et dis apex ne fonctionnent plus" :
     * feedback IMMÉDIAT pour confirmer que le click est reçu (avant même les
     * checks async). Sans ce toast, Kevin ne sait pas si le bouton réagit. */
    toast.info('🎙 Activation dictée…', { duration: 1500 });
    const SR = (window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown }).SpeechRecognition
            ?? (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;
    if (!SR) {
      toast.warn('Dictée vocale non supportée par ce navigateur (Safari iOS PWA limité). Utilise Chrome ou Safari classique.', { duration: 7000 });
      return;
    }
    if (recognitionActive && recognition) {
      recognition.stop();
      recognitionActive = false;
      micBtn.style.background = '';
      toast.info('Dictée arrêtée');
      return;
    }

    /* Pre-check permission micro (anti-blocage silencieux) */
    void (async () => {
      try {
        const { checkMicrophonePermission } = await import('../../services/ai/voice-print.js');
        const perm = await checkMicrophonePermission();
        if (perm === 'denied') {
          toast.warn('🚫 Micro refusé après mise à jour. Réglages iOS > Safari (ou Apex) > Microphone → Autoriser, puis recharge.', {
            duration: 9000,
          });
          return;
        }
        if (perm === 'prompt') {
          toast.info('🎙 iOS va te demander la permission micro…', { duration: 3000 });
        }
        startDictation();
      } catch (err: unknown) {
        /* fallback : tente quand même + log raison */
        const reason = err instanceof Error ? err.message : 'unknown';
        toast.info(`🎙 Tentative directe (perm check : ${reason.slice(0, 30)})`);
        startDictation();
      }
    })();

    function pushDictationLog(evt: string, detail?: string): void {
      try {
        const KEY = 'ax_voice_log';
        const raw = localStorage.getItem(KEY);
        const arr: Array<{ ts: number; evt: string; src: string; detail?: string }> = raw
          ? (JSON.parse(raw) as Array<{ ts: number; evt: string; src: string; detail?: string }>)
          : [];
        const entry: { ts: number; evt: string; src: string; detail?: string } = { ts: Date.now(), evt, src: 'dictation' };
        if (detail !== undefined) entry.detail = detail;
        arr.push(entry);
        while (arr.length > 100) arr.shift();
        localStorage.setItem(KEY, JSON.stringify(arr));
      } catch {
        /* ignore */
      }
    }

    function isiOSSafari(): boolean {
      const ua = navigator.userAgent || '';
      if (/iPhone|iPad|iPod/.test(ua)) return true;
      return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1;
    }

    function startDictation(): void {
      try {
        recognition = new (SR as new () => typeof recognition)() as typeof recognition;
        if (!recognition) return;
        const isiOS = isiOSSafari();
        /* iOS Safari : continuous=true instable → false + restart via onend
         * Desktop Chrome/Firefox : continuous=false suffit pour 1 phrase dictée */
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'fr-FR';
        let lastFinalTranscript = '';
        let silenceTimer: ReturnType<typeof setTimeout> | null = null;
        const SILENCE_MS = 1500; /* 1.5s de silence après dernier mot → auto-submit */
        dictationNoSpeechRetries = 0;

        recognition.onstart = () => {
          pushDictationLog('start', isiOS ? 'iOS' : 'desktop');
          /* v13.4.193 Kevin "overlay transparent style Claude Code" :
           * Affiche overlay fullscreen avec transcript en grand. Tap outside
           * ou Stop = arrête + close. Envoyer = submit + close. */
          void import('../../services/ai/voice-overlay.js').then(({ voiceOverlay }) => {
            voiceOverlay.show({
              onStop: () => {
                try { recognition?.stop(); } catch { /* ignore */ }
                recognitionActive = false;
                if (micBtn) micBtn.style.background = '';
              },
              onSubmit: (transcript: string) => {
                const ta = rootEl.querySelector<HTMLTextAreaElement>('#ax-chat-text');
                if (ta && transcript) ta.value = transcript;
                try { recognition?.stop(); } catch { /* ignore */ }
                const form = rootEl.querySelector<HTMLFormElement>('#ax-chat-form');
                form?.requestSubmit();
              },
            });
          }).catch(() => { /* skip si module absent */ });
        };

        recognition.onresult = (e: Event) => {
          const evt = e as Event & {
            results: { [key: number]: { [key: number]: { transcript: string }; isFinal: boolean } };
            resultIndex: number;
          };
          let transcript = '';
          let hasFinal = false;
          for (let i = evt.resultIndex; i < (evt.results as unknown as { length: number }).length; i++) {
            const result = evt.results[i];
            if (result?.[0]) {
              transcript += result[0].transcript;
              if (result.isFinal) hasFinal = true;
            }
          }
          const ta = rootEl.querySelector<HTMLTextAreaElement>('#ax-chat-text');
          if (ta) ta.value = transcript;
          /* v13.4.193 Kevin "overlay transparent comme Claude Code" :
           * Affiche le transcript en grand dans overlay fullscreen (style Claude voice). */
          void import('../../services/ai/voice-overlay.js').then(({ voiceOverlay }) => {
            if (voiceOverlay.isVisible()) {
              voiceOverlay.updateTranscript(transcript, hasFinal);
            }
          }).catch(() => { /* skip si module absent */ });
          /* Reset compteur dès qu'on capte du son */
          dictationNoSpeechRetries = 0;
          pushDictationLog(hasFinal ? 'result' : 'interim', transcript.slice(0, 80));
          if (hasFinal) {
            lastFinalTranscript = transcript;
            /* Reset silence timer à chaque mot final */
            if (silenceTimer) clearTimeout(silenceTimer);
            silenceTimer = setTimeout(() => {
              /* Auto-submit après silence Kevin règle "envoie la question automatiquement" */
              if (lastFinalTranscript.trim().length > 0 && recognitionActive) {
                try { recognition?.stop(); } catch { /* ignore */ }
                /* v13.4.193 close overlay before submit */
                void import('../../services/ai/voice-overlay.js').then(({ voiceOverlay }) => {
                  voiceOverlay.hide();
                }).catch(() => { /* skip */ });
                const form = rootEl.querySelector<HTMLFormElement>('#ax-chat-form');
                form?.requestSubmit();
              }
            }, SILENCE_MS);
          }
        };
        recognition.onend = () => {
          pushDictationLog('end');
          recognitionActive = false;
          if (micBtn) micBtn.style.background = '';
          if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
          /* Si dictée stoppée et texte final non-envoyé, auto-submit */
          const ta = rootEl.querySelector<HTMLTextAreaElement>('#ax-chat-text');
          if (lastFinalTranscript.trim().length > 0 && ta && ta.value.trim() === lastFinalTranscript.trim()) {
            const form = rootEl.querySelector<HTMLFormElement>('#ax-chat-form');
            form?.requestSubmit();
          }
        };
        recognition.onerror = (e: Event) => {
          const errEvt = e as Event & { error?: string };
          const err = errEvt.error ?? 'inconnu';
          pushDictationLog('error', err);
          /* Erreurs lifecycle normal iOS Safari → silencieuses (PAS de toast) */
          if (err === 'aborted') {
            /* Aborted : auto-stop iOS après silence ou re-tap user → silencieux */
            return;
          }
          if (err === 'no-speech') {
            dictationNoSpeechRetries++;
            if (dictationNoSpeechRetries < DICTATION_MAX_NO_SPEECH) {
              /* Pas affiché — onend va relancer ou stop normal */
              return;
            }
            /* Trop de no-speech : message gentil */
            toast.warn('🤫 Pas entendu — réessaye en parlant plus fort', { duration: 4000 });
            recognitionActive = false;
            if (micBtn) micBtn.style.background = '';
            return;
          }
          /* Permission denied : guide settings iOS */
          if (err === 'not-allowed' || err === 'service-not-allowed') {
            toast.warn('🚫 Micro refusé — Réglages iOS > Safari > Microphone', { duration: 7000 });
            recognitionActive = false;
            if (micBtn) micBtn.style.background = '';
            return;
          }
          /* Autres erreurs (audio-capture, network, language-not-supported) : afficher */
          toast.warn(`Dictée erreur : ${err}`);
          recognitionActive = false;
          if (micBtn) micBtn.style.background = '';
        };
        recognition.start();
        recognitionActive = true;
        if (micBtn) micBtn.style.background = 'linear-gradient(135deg,var(--ax-error),var(--ax-error))';
        haptic.medium();
        toast.success('🎙 Parle maintenant — re-tap 🎙 pour arrêter');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'erreur';
        pushDictationLog('error', `start: ${msg}`);
        toast.warn(`Dictée fail : ${msg}`);
      }
    }
  });
}


/** Câble le bouton wake word "Dis Apex" (#ax-chat-wake). */
export function wireWakeButton(rootEl: HTMLElement): void {
  /* Wake word "Dis Apex" : SpeechRecognition continuous (fix v13.3.23 Kevin bug 19:10)
   * - Vérifie permission micro avant start (modal settings si denied)
   * - Affiche transcript live dans textarea (preview avant détection wake)
   * - Erreurs 'aborted'/'no-speech' silencieuses (lifecycle iOS) */
  const wakeBtn = rootEl.querySelector<HTMLButtonElement>('#ax-chat-wake');
  wakeBtn?.addEventListener('click', () => {
    haptic.tap();
    void (async () => {
      try {
        const { voicePrint, checkMicrophonePermission } = await import('../../services/ai/voice-print.js');
        if (!voicePrint.isSupported()) {
          toast.warn('Wake word non supporté par ton navigateur');
          return;
        }
        if (voicePrint.isListening()) {
          voicePrint.stopWakeWord();
          if (wakeBtn) {
            wakeBtn.style.background = '';
            wakeBtn.style.animation = '';
          }
          toast.success('Wake word arrêté');
          return;
        }
        /* Pre-check permission micro */
        const perm = await checkMicrophonePermission();
        if (perm === 'denied') {
          toast.warn('🚫 Micro refusé — autorise dans Réglages iOS > Apex > Microphone', {
            duration: 7000,
          });
          return;
        }
        /* v13.4.192 fix Kevin "le micro fonctionne mais en permanence, pas comme Siri" :
         * AVANT : onWakeInterim écrivait le transcript en temps réel dans placeholder
         *         → Kevin voyait "écrire en permanence" avant le wake word.
         * APRÈS : aucune écriture jusqu'à détection effective de "Dis Apex".
         * Indicateur visuel discret : ondulation icon 👂 mais aucun texte affiché. */
        const r = voicePrint.startWakeWord((transcript: string) => {
          /* Wake word DÉTECTÉ → maintenant on capture + soumet */
          const ta = rootEl.querySelector<HTMLTextAreaElement>('#ax-chat-text');
          if (ta) {
            ta.value = transcript;
            ta.placeholder = 'Demande, dicte ou colle…';
            const form = rootEl.querySelector<HTMLFormElement>('#ax-chat-form');
            form?.requestSubmit();
            toast.info('🎙 Dis Apex détecté → envoi…', { duration: 2000 });
          }
        });
        if (r.ok && wakeBtn) {
          /* Indicateur visuel : icon 👂 verte pulsante. Pas de texte placeholder. */
          wakeBtn.style.background = 'linear-gradient(135deg,var(--ax-green),var(--ax-green))';
          wakeBtn.style.animation = 'ax-wake-pulse 1.8s ease-in-out infinite';
          toast.success('👂 Écoute passive activée — dis "Dis Apex" pour parler', { duration: 4000 });
        } else {
          toast.warn(`Wake word fail : ${r.reason ?? 'inconnu'}`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'erreur';
        toast.warn(`Wake word erreur : ${msg}`);
      }
    })();
  });
}
