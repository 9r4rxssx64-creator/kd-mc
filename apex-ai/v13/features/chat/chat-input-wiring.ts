/**
 * APEX v13 — chat-input-wiring.ts
 * Moteur d'entrée du chat : soumission du formulaire (envoi message + queue),
 * textarea (auto-resize, Entrée=submit, slash-autocomplete), paste intelligent.
 *
 * Extrait de features/chat/index.ts render() (v13.4.304, refactor monolithe —
 * cœur couplé). L'état/fonctions partagés sont injectés via ChatInputCtx ;
 * conversation & queue sont des références const STABLES. Appelé par render().
 */
import { logger } from '../../core/logger.js';
import { detectToolIntent } from '../../services/ai/tool-intent.js';
import { toast } from '../../ui/toast.js';

import { detectPasteKind, pushPasteCard } from './chat-paste.js';
import { persistConversation } from './chat-persistence.js';
import { saveCodeSnippet } from './chat-snippets.js';

import type { DisplayMessage } from './index.js';

/** Dépendances injectées (état + fonctions du module chat). */
export interface ChatInputCtx {
  conversation: DisplayMessage[];
  queue: string[];
  processQueue: (rootEl: HTMLElement) => Promise<void>;
  renderMessages: (rootEl: HTMLElement) => void;
  handleSlashCommand: (rootEl: HTMLElement, text: string) => boolean;
  handleWakeWordTextTrigger: (rootEl: HTMLElement, text: string) => boolean;
  showSlashAutocomplete: (rootEl: HTMLElement, prefix: string) => void;
  hideSlashAutocomplete: (rootEl: HTMLElement) => void;
}

/** Câble le formulaire + la textarea du chat (cœur d'envoi de message). */
export function wireChatInput(rootEl: HTMLElement, ctx: ChatInputCtx): void {
  const { conversation, queue, processQueue, renderMessages, handleSlashCommand, handleWakeWordTextTrigger, showSlashAutocomplete, hideSlashAutocomplete } = ctx;
  const form = rootEl.querySelector<HTMLFormElement>('#ax-chat-form');
  const textarea = rootEl.querySelector<HTMLTextAreaElement>('#ax-chat-text');
  if (form && textarea) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const value = textarea.value.trim();
      if (!value) return;
      /* v13.3.79 (Kevin 2026-05-08) — Wake word texte trigger AVANT slash :
       * "dis apex" / "ok apex" / "hey apex" tapés → activate voice mode,
       * PAS d'appel IA et PAS de "Plan A/B/C". */
      if (handleWakeWordTextTrigger(rootEl, value)) {
        textarea.value = '';
        textarea.style.height = 'auto';
        hideSlashAutocomplete(rootEl);
        return;
      }
      /* v13.3.48 — Slash commands d'abord (gratuit, instantané, pas d'appel IA) */
      if (handleSlashCommand(rootEl, value)) {
        textarea.value = '';
        textarea.style.height = 'auto';
        hideSlashAutocomplete(rootEl);
        return;
      }
      /* v13.4.345 (Kevin « tous les outils utilisés auto suivant les questions ») :
       * détecte une intention outil EXPLICITE (audit/pentest/web/perf) et la lance
       * automatiquement. Conservateur (0 faux positif testé) + kill localStorage. */
      {
        const auto = detectToolIntent(value);
        if (auto && handleSlashCommand(rootEl, auto)) {
          textarea.value = '';
          textarea.style.height = 'auto';
          hideSlashAutocomplete(rootEl);
          return;
        }
      }
      /* v13.4.286 — Journal permanent : enregistre TOUT ce que Kevin dépose
       * (secrets masqués). Survit à « Effacer le chat » et aux MAJ. */
      void import('../../services/ai/chat-journal.js').then(({ chatJournal }) => {
        void chatJournal.append(value, 'user');
      });
      /* P0 SÉCU v13.0.78 Kevin "il s'affole pas reconnu" :
       * Bulk detect → store toutes clés trouvées (multi-line, .env, JSON OK) */
      void (async () => {
        const { detectAllCredentials } = await import('../../services/vault/credential-patterns.js');
        const detected = detectAllCredentials(value);
        if (detected.length > 0) {
          textarea.value = '';
          textarea.style.height = 'auto';
          const { vault } = await import('../../services/vault/vault.js');
          const result = await vault.autoStoreBulk(value);
          if (result.stored.length > 0) {
            /* v13.3.75 (Kevin screenshot): dedup les noms si Kevin colle plusieurs clés
             * du même provider (ex: 2× Anthropic) → "Anthropic ×2" au lieu de
             * "Anthropic, Anthropic". */
            const counts = new Map<string, number>();
            for (const s of result.stored) {
              counts.set(s.pattern.name, (counts.get(s.pattern.name) ?? 0) + 1);
            }
            const names = [...counts.entries()]
              .map(([name, count]) => count > 1 ? `${name} ×${count}` : name)
              .join(', ');
            toast.success(`🔑 ${result.stored.length} clé(s) chiffrée(s) AES-GCM-256 : ${names}`, { duration: 6000 });
            /* v13.4.102 — Vérification asynchrone push Firebase via vault-firebase-backup.
             * Pas attendre dans le toast principal (UX rapide), mais checker 4s après. */
            void (async () => {
              try {
                await new Promise((r) => setTimeout(r, 4000));
                const { vaultFirebaseBackup } = await import('../../services/vault/vault-firebase-backup.js');
                const fbList = await vaultFirebaseBackup.listAll();
                const fbKeys = new Set(fbList.map((e) => e.key));
                const storedKeys = result.stored.map((s) => `ax_${s.pattern.name.toLowerCase().replace(/\s+/g, '_')}_key`);
                const fbOk = storedKeys.filter((k) => fbKeys.has(k)).length;
                if (fbOk === storedKeys.length) {
                  toast.info(`💾 Firebase backup OK : ${fbOk}/${storedKeys.length} clés sauvegardées cross-device.`, { duration: 5000 });
                } else if (fbOk === 0) {
                  toast.warn(`🚨 Firebase backup KO : 0/${storedKeys.length} sauvegardées. Tes clés sont local-only — RISQUE perte au reinstall PWA.`, { duration: 10000 });
                } else {
                  toast.warn(`⚠️ Firebase backup partiel : ${fbOk}/${storedKeys.length}`, { duration: 7000 });
                }
              } catch { /* silent */ }
            })();
          }
          if (result.forbidden.length > 0) {
            const names = result.forbidden.map((f) => f.pattern.name).join(', ');
            toast.error(`🚫 ${names} JAMAIS stocké (sécu Kevin)`, { duration: 8000 });
          }
          if (result.failed > 0 && result.stored.length === 0) {
            toast.warn(`⚠️ ${result.failed} format inconnu — ouvre 🔐 Coffre pour coller manuellement`, { duration: 8000 });
          }
          return;
        }
        /* Pas de clé → message normal */
        textarea.value = '';
        textarea.style.height = 'auto';

        /* v13.4.199 (Kevin 2026-05-16 "il réfléchit, consomme, et se coupe.
         * S'arrête. N'a rien fait") : SHORT-CIRCUIT IA si planning SBM détecté.
         *
         * Cause racine : un planning collé (30-50KB) passé à l'IA consomme tout
         * le max_tokens 4096 output → stream tronqué silencieusement. Kevin voit
         * "rien". L'IA n'a aucune valeur ajoutée ici — Kevin veut juste pousser
         * le planning vers CMCteams (déjà l'objectif du bridge).
         *
         * Solution : si planning détecté + size ≥ 1000 chars → push direct,
         * bypass IA, message assistant court fixe (zéro risque crash). */
        try {
          const { detectSbmPlanning, pushPlanningToCmc, _internals } = await import('../../services/integrations/cmc-planning-bridge.js');
          const det = detectSbmPlanning(value);
          if (det.detected && det.size >= _internals.MIN_PUSH_LENGTH) {
            /* Ajout user msg dans conversation (visible) */
            const userMsg: DisplayMessage = { id: `u_${Date.now()}`, role: 'user', text: value, ts: Date.now() };
            conversation.push(userMsg);
            renderMessages(rootEl);
            /* Push CMC + reply court direct (pas d'IA) */
            const r = await pushPlanningToCmc(value, 'chat');
            const reply: DisplayMessage = {
              id: `a_${Date.now()}`,
              role: 'assistant',
              ts: Date.now(),
              text: r.ok
                ? `📋 **Planning SBM détecté** (${Math.round(det.size / 1024)} KB, ${det.matches.length} patterns).\n\n✅ Poussé vers **CMCteams** (id \`${r.id}\`). Ouvre l'app CMC → un toast admin te proposera l'import 1-clic.\n\n_J'ai bypass mon IA volontairement pour éviter de cramer tes tokens sur un planning entier — le bridge fait le boulot directement._`
                : `📋 Planning SBM détecté (${Math.round(det.size / 1024)} KB) mais **push CMC échoué** : ${r.error ?? 'erreur inconnue'}.\n\n${r.error === 'admin_only_cmc_push' ? '⚠️ Tu dois être connecté en admin Kevin pour pousser vers CMCteams.' : 'Réessaie dans quelques secondes ou colle directement dans l\'app CMC.'}`,
            };
            conversation.push(reply);
            renderMessages(rootEl);
            persistConversation(conversation);
            if (r.ok) toast.success(`📋 Planning → CMCteams (${r.id})`, { duration: 6000 });
            return;
          }
        } catch (e) {
          logger.warn('chat', 'planning short-circuit error, fallback to AI', { err: e instanceof Error ? e.message : String(e) });
        }

        queue.push(value);
        void processQueue(rootEl);
        /* v13.3.19 — Bridge Apex → CMCteams (règle Kevin 2026-05-07 §8) :
         * détecte planning SBM collé dans le chat → push Firebase pour
         * que CMCteams (admin Kevin) propose un import 1-clic. */
        void (async () => {
          try {
            const { detectAndPushIfPlanning } = await import('../../services/integrations/cmc-planning-bridge.js');
            const r = await detectAndPushIfPlanning(value, 'chat');
            if (r && r.push.ok && r.push.id) {
              toast.info(`📋 Planning détecté → envoyé à CMCteams (id: ${r.push.id})`, { duration: 5000 });
            }
          } catch { /* non-bloquant */ }
        })();
      })();
    });
    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
      /* v13.3.48 — Slash autocomplete */
      const v = textarea.value;
      if (v.startsWith('/') && !v.includes('\n')) {
        showSlashAutocomplete(rootEl, v.slice(1));
      } else {
        hideSlashAutocomplete(rootEl);
      }
    });
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit();
      }
    });
    /* Auto-detect paste v13.3.9 fix Kevin "rien ne colle" :
     * v13.0.78 utilisait e.preventDefault() dans async IIFE = trop tard,
     * cassait le paste normal. Maintenant : laisse le paste happen,
     * détecte en background, si credential trouvé → clear async + store.
     *
     * v13.4.103 (Kevin "messages dupliqués 10x dans chat") :
     * Guard dataset.pasteWired pour ne wirer qu'UNE FOIS par textarea.
     * Avant : chaque re-render du chat ajoutait un nouveau listener →
     * un paste déclenchait N callbacks → N paste cards identiques.
     * Maintenant : 1 listener max par textarea. */
    if (textarea.dataset['pasteWired'] !== '1') {
      textarea.dataset['pasteWired'] = '1';
    textarea.addEventListener('paste', (e) => {
      const pasted = e.clipboardData?.getData('text')?.trim() ?? '';
      if (!pasted) return;
      /* PAS de preventDefault — le paste passe normalement (texte normal OK). */

      /* v13.4.14 — Détection type de paste (Kevin "visuel intelligent").
       * Code/URL → carte visuelle dans le chat avec actions buttons. */
      const kind = detectPasteKind(pasted);
      if (kind === 'code') {
        /* Extract language hint from ```lang ... ``` si présent */
        const m = pasted.match(/^```(\w+)?\n([\s\S]+?)\n```$/);
        const codeContent = m ? (m[2] ?? pasted) : pasted;
        const lang = m && m[1] ? m[1] : undefined;
        pushPasteCard(rootEl, 'code', codeContent, [
          {
            label: '💾 Sauver dans Coffre (Codes)',
            primary: true,
            onClick: () => {
              void (async () => {
                const r = await saveCodeSnippet(codeContent, lang);
                if (r.ok) {
                  /* Efface du textarea (déjà collé) ET supprime card */
                  textarea.value = '';
                  toast.success(`💾 Code sauvé dans Coffre (${codeContent.split('\n').length} lignes)`, { duration: 4000 });
                } else {
                  toast.error('Sauvegarde échouée', { duration: 3000 });
                }
              })();
            },
          },
          {
            label: '💬 Garder dans le chat',
            onClick: () => { /* no-op : laisse dans textarea pour envoi normal */ },
          },
        ]);
      } else if (kind === 'url') {
        pushPasteCard(rootEl, 'url', pasted, [
          {
            label: '🌐 Envoyer à l\'IA',
            primary: true,
            onClick: () => { /* laisse dans textarea, Kevin soumet normalement */ },
          },
        ]);
      }

      /* v13.3.19 — Bridge Apex → CMCteams sur paste (règle Kevin 2026-05-07 §8) */
      void (async () => {
        try {
          const { detectAndPushIfPlanning } = await import('../../services/integrations/cmc-planning-bridge.js');
          const r = await detectAndPushIfPlanning(pasted, 'paste');
          if (r && r.push.ok && r.push.id) {
            toast.info(`📋 Planning détecté → envoyé à CMCteams (id: ${r.push.id})`, { duration: 5000 });
          }
        } catch { /* non-bloquant */ }
      })();
      /* v13.4.96 — Paste Extractor universel (Kevin "TP réseaux sites n'apparaissent pas").
       * Complète detectAllCredentials + multi-source-analyze :
       * extrait URLs+social_handle+email+IBAN+phone+SIRET+VAT+BTC+ETH. */
      void (async () => {
        try {
          const { apexPasteExtractor } = await import('../../services/admin/apex-paste-extractor.js');
          const r = apexPasteExtractor.extract(pasted);
          if (r.ok && r.total > 0) {
            /* Catégoriser pour affichage toast */
            const byType: Record<string, number> = {};
            for (const item of r.items) {
              byType[item.type] = (byType[item.type] ?? 0) + 1;
            }
            const summary = Object.entries(byType)
              .map(([t, n]) => `${n} ${t}`)
              .join(', ');
            if (r.stored) {
              toast.success(`🗂 ${r.total} éléments extraits : ${summary}`, { duration: 6000 });
            } else {
              toast.info(`🗂 ${r.total} éléments détectés (login admin pour stocker) : ${summary}`, { duration: 5000 });
            }
          }
        } catch { /* non-bloquant */ }
      })();
      void (async () => {
        const { detectAllCredentials } = await import('../../services/vault/credential-patterns.js');
        const detected = detectAllCredentials(pasted);
        if (detected.length === 0) {
          /* v13.3.53 — Texte sans credential MAIS peut contenir URLs/emails/IPs : multi-source */
          if (/(https?:\/\/|@|\d+\.\d+\.\d+\.\d+|[0-9A-F]{2}[:-][0-9A-F]{2})/i.test(pasted) && pasted.length > 20) {
            try {
              const { multiSourceAnalyze } = await import('../../services/ai/multi-source-analyze.js');
              const result = await multiSourceAnalyze.analyzeText(pasted);
              if (result.extracted_count > 0) {
                const r = await multiSourceAnalyze.installAll(result, { test: false });
                if (r.installed > 0) {
                  toast.info(`🔗 ${r.installed} élément(s) extrait(s) (URLs/emails/IPs)`, { duration: 5000 });
                }
              }
            } catch { /* non-bloquant */ }
          }
          return; /* Texte normal, on laisse */
        }
        /* Credential détecté : clear textarea (efface valeur visible) + chiffre */
        textarea.value = '';
        const { vault } = await import('../../services/vault/vault.js');
        const result = await vault.autoStoreBulk(pasted);
        if (result.stored.length > 0) {
          /* v13.3.75 dedup names (cf. fix toast 1703) */
          const counts = new Map<string, number>();
          for (const s of result.stored) {
            counts.set(s.pattern.name, (counts.get(s.pattern.name) ?? 0) + 1);
          }
          const names = [...counts.entries()]
            .map(([name, count]) => count > 1 ? `${name} ×${count}` : name)
            .join(', ');
          toast.success(`🔑 ${result.stored.length} clé(s) chiffrée(s) auto AES-GCM-256 : ${names}`, { duration: 6000 });
        }
        if (result.forbidden.length > 0) {
          const names = result.forbidden.map((f) => f.pattern.name).join(', ');
          toast.error(`🚫 ${names} JAMAIS stocké (règle sécu)`, { duration: 8000 });
        }
        if (result.failed > 0 && result.stored.length === 0) {
          toast.warn(`Format inconnu — ouvre 🔐 Coffre pour coller manuellement`, { duration: 6000 });
        }
        /* v13.3.53 — Multi-source pour extraire AUSSI URLs/sites/emails de la même paste */
        try {
          const { multiSourceAnalyze } = await import('../../services/ai/multi-source-analyze.js');
          const msResult = await multiSourceAnalyze.analyzeText(pasted);
          const sites = msResult.items.filter((it) => it.type === 'site');
          if (sites.length > 0) {
            await multiSourceAnalyze.installAll({ ...msResult, items: sites }, { test: false });
          }
        } catch { /* non-bloquant */ }
      })();
    });
    } /* v13.4.103 fermeture if (textarea.dataset['pasteWired'] !== '1') */
  }
}
