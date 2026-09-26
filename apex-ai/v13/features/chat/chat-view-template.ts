/**
 * APEX v13 — chat-view-template.ts
 * Template HTML+CSS pur du shell de la vue chat (header, scroll, greeting,
 * suggestions, barre d'input, tabbar). Aucune logique ni wiring.
 *
 * Extrait de features/chat/index.ts render() (v13.4.296, refactor monolithe
 * sans régression). Le wiring (events) reste dans render().
 */
import { APP_VER } from '../../core/bootstrap.js';

import { escapeHtml } from './chat-markdown.js';

export interface ChatShellOpts {
  greeting: string;
  conversationEmpty: boolean;
  hasKey: boolean;
  isAdmin: boolean;
}

/** Construit le HTML du shell chat (à passer à cspStyleHelper.withNonce). */
export function buildChatShellHtml(opts: ChatShellOpts): string {
  const { greeting, conversationEmpty, hasKey, isAdmin } = opts;
  return `
    <style>
      /* v13.3.80 Kevin 2026-05-08 19:55: bandeau ULTRA-MIN — max visibilité chat */
      .ax-chat-header {
        background: linear-gradient(180deg,rgba(20,20,35,0.95),rgba(14,14,28,0.85));
        backdrop-filter: blur(20px) saturate(140%);
        -webkit-backdrop-filter: blur(20px) saturate(140%);
        border-bottom: 1px solid rgba(255,255,255,0.06);
        padding: 2px 8px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 4px;
        position: sticky;
        top: 0;
        z-index: 50;
        padding-top: max(2px, env(safe-area-inset-top, 0px));
        min-height: 26px;
      }
      .ax-chat-header h1 {
        margin: 0;
        font-size: 12px;
        font-weight: 700;
        background: linear-gradient(135deg,var(--ax-gold-deep) 0%,var(--ax-gold) 50%,var(--ax-gold-bright) 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        font-family: Georgia, serif;
        letter-spacing: 0.8px;
        line-height: 1;
      }
      .ax-chat-header .ax-btn-icon {
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.08);
        color: rgba(255,255,255,0.85);
        width: 24px;
        height: 24px;
        min-width: 24px;
        border-radius: 7px;
        font-size: 11px;
        cursor: pointer;
        transition: background 160ms;
        -webkit-tap-highlight-color: transparent;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .ax-chat-header .ax-btn-icon:hover {
        background: rgba(232,184,48,0.12);
        border-color: rgba(232,184,48,0.3);
      }
      .ax-chat-greeting {
        text-align: center;
        padding: 28px 20px 14px;
        font-size: clamp(22px, 6vw, 30px);
        font-weight: 700;
        background: linear-gradient(135deg, var(--ax-gold-deep) 0%, var(--ax-gold) 45%, var(--ax-gold-bright) 100%);
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        font-family: Georgia, serif;
        letter-spacing: -0.02em;
        line-height: 1.25;
        animation: ax-fade-up 420ms cubic-bezier(0.34,1.56,0.64,1) backwards;
      }
      .ax-chat-greeting::after {
        content: '';
        display: block;
        width: 48px;
        height: 3px;
        border-radius: 2px;
        background: linear-gradient(90deg,transparent,var(--ax-gold),transparent);
        margin: 14px auto 0;
        opacity: 0.9;
        box-shadow: 0 0 16px rgba(232,184,48,0.5);
      }
      .ax-chat-suggest {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: center;
        padding: 4px 16px 16px;
        animation: ax-fade-up 480ms cubic-bezier(0.34,1.56,0.64,1) 80ms backwards;
      }
      .ax-chat-suggest button {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 10px 14px;
        min-height: 44px;
        background: rgba(20,20,35,0.7);
        backdrop-filter: blur(12px) saturate(140%);
        -webkit-backdrop-filter: blur(12px) saturate(140%);
        border: 1px solid rgba(232,184,48,0.3);
        border-radius: 9999px;
        color: rgba(255,255,255,0.92);
        font-size: 13px;
        cursor: pointer;
        transition: transform 180ms cubic-bezier(0.34,1.56,0.64,1), background 180ms ease, box-shadow 180ms ease;
        -webkit-tap-highlight-color: transparent;
      }
      .ax-chat-suggest button:hover {
        transform: translateY(-2px);
        background: rgba(232,184,48,0.18);
        box-shadow: 0 6px 18px rgba(201,162,39,0.25);
      }
      .ax-chat-suggest button:active { transform: scale(0.96); }
      /* v13.4.237 — Tab bar premium iOS-style (Kevin "UX futuriste épuré") */
      .ax-tabbar {
        display: flex;
        gap: 2px;
        padding: 6px 6px calc(6px + env(safe-area-inset-bottom,0px));
        border-top: 1px solid rgba(232,184,48,0.12);
        background: linear-gradient(180deg, rgba(14,14,24,0.92), rgba(8,8,15,0.98));
        backdrop-filter: blur(24px) saturate(180%);
        -webkit-backdrop-filter: blur(24px) saturate(180%);
        min-width: 0;
        max-width: 100%;
      }
      .ax-tabbar__item {
        flex: 1 1 0;
        min-width: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 3px;
        min-height: 52px;
        padding: 6px 2px;
        border: none;
        border-radius: 14px;
        background: transparent;
        color: var(--ax-text-muted);
        cursor: pointer;
        transition: background 200ms var(--ax-ease-out), color 200ms var(--ax-ease-out), transform 160ms var(--ax-ease-spring);
        -webkit-tap-highlight-color: transparent;
      }
      .ax-tabbar__item:active { transform: scale(0.90); }
      .ax-tabbar__ico {
        font-size: 19px;
        line-height: 1;
        transition: transform 200ms var(--ax-ease-spring);
      }
      .ax-tabbar__lbl {
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.01em;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
      }
      .ax-tabbar__item--accent {
        color: var(--ax-gold);
      }
      .ax-tabbar__item--accent .ax-tabbar__ico {
        filter: drop-shadow(0 0 8px rgba(232,184,48,0.55));
      }
      .ax-tabbar__item--accent.is-on,
      .ax-tabbar__item.is-on {
        background: linear-gradient(135deg, rgba(232,184,48,0.20), rgba(201,162,39,0.10));
        color: var(--ax-gold-bright);
      }
      .ax-tabbar__item.is-on .ax-tabbar__ico { transform: translateY(-1px) scale(1.08); }
      .ax-tabbar__item--danger { color: var(--ax-red); }
      @media (prefers-reduced-motion: reduce) {
        .ax-tabbar__item, .ax-tabbar__ico { transition: none !important; }
      }
      .ax-info-card {
        background: linear-gradient(135deg,rgba(20,20,35,0.7),rgba(14,14,28,0.5));
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(232,184,48,0.18);
        border-radius: 12px;
        padding: 12px 14px;
        animation: ax-fade-up 320ms cubic-bezier(0.16,1,0.3,1) backwards;
      }
      .ax-info-card h3 {
        margin: 0 0 6px;
        font-size: 14px;
        font-weight: 700;
        color: var(--ax-gold);
        letter-spacing: -0.01em;
      }
      .ax-info-card p {
        margin: 0 0 10px;
        color: rgba(255,255,255,0.65);
        font-size: 12.5px;
        line-height: 1.45;
      }
      /* Bouton scroll-to-bottom flottant style Claude Code (v13.3.72) */
      .ax-scroll-bottom-fab {
        position: absolute;
        right: 14px;
        bottom: 96px;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: rgba(20,20,35,0.85);
        border: 1px solid rgba(232,184,48,0.35);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        color: var(--ax-gold);
        font-size: 16px;
        cursor: pointer;
        opacity: 0;
        transform: translateY(8px) scale(0.92);
        pointer-events: none;
        transition: all 180ms cubic-bezier(0.16,1,0.3,1);
        z-index: 40;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      }
      .ax-scroll-bottom-fab.visible {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: auto;
      }
      .ax-scroll-bottom-fab:hover { background: rgba(232,184,48,0.15); }
      @keyframes ax-fade-up {
        0% { opacity: 0; transform: translateY(10px); }
        100% { opacity: 1; transform: translateY(0); }
      }
      .ax-msg.ax-modernized-msg {
        animation: ax-fade-up 240ms cubic-bezier(0.16,1,0.3,1);
      }
      @media (prefers-reduced-motion: reduce) {
        .ax-chat-greeting, .ax-info-card, .ax-modernized-msg { animation: none !important; }
      }
    </style>
    <div class="ax-chat ax-modernized-card">
      <header class="ax-chat-header">
        <h1 id="ax-chat-logo" title="Long-press 3s pour Diagnostic admin" style="cursor:pointer;-webkit-tap-highlight-color:transparent">APEX</h1>
        <div style="display:flex;gap:4px;align-items:center;margin-right:84px">
          <button class="ax-btn ax-btn-icon" id="ax-chat-mode-toggle" aria-label="Mode routing IA" title="Mode routing IA (clic pour basculer auto/eco/premium)" style="font-size:14px;min-width:36px;padding:4px 6px">⚡</button>
          <button class="ax-btn ax-btn-icon" id="ax-chat-memory" aria-label="Mémoire & historique" title="📜 Mémoire : conversations archivées + journal permanent de tout ce que tu déposes">📜</button>
          <button class="ax-btn ax-btn-icon" id="ax-chat-clear" aria-label="Effacer chat" title="Effacer le chat (conversation courante)">🗑</button>
          <button class="ax-btn ax-btn-icon" id="ax-chat-menu" aria-label="Menu" title="Menu">☰</button>
        </div>
      </header>
      <div style="position:relative;flex:1;display:flex;flex-direction:column;min-height:0">
      <div class="ax-chat-scroll" role="log" aria-live="polite" aria-atomic="false">
        ${
          conversationEmpty
            ? `<div class="ax-chat-greeting">${escapeHtml(greeting)}</div>
               <div class="ax-chat-suggest" role="group" aria-label="Suggestions de démarrage">
                 <button type="button" data-suggest="Résume ma journée et propose les 3 tâches prioritaires">📋 Mes priorités du jour</button>
                 <button type="button" data-suggest="Aide-moi à rédiger un message professionnel">✍️ Rédiger un message</button>
                 <button type="button" data-suggest="Analyse cette photo">📷 Analyser une photo</button>
               </div>`
            : ''
        }
        ${!hasKey ? `
          <div class="ax-info-card ax-modernized-card" style="margin:4px 8px;padding:8px 10px">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span style="font-size:12px;color:var(--ax-gold);font-weight:600">🔑 Pas de clé API</span>
              <button class="ax-btn ax-btn-primary" id="ax-paste-key" style="background:linear-gradient(135deg,var(--ax-gold-deep),var(--ax-gold));color:#000;border:none;padding:5px 12px;border-radius:8px;font-weight:700;cursor:pointer;font-size:12px;min-height:32px;-webkit-tap-highlight-color:transparent">📋 Coller</button>
              <span class="ax-gs-23">Anthropic / OpenAI / Groq / Gemini</span>
            </div>
          </div>
        ` : ''}
        ${conversationEmpty && hasKey ? `
          <div class="ax-chat-chips" role="group" aria-label="Suggestions rapides">
            <button type="button" class="ax-chat-chip" data-chip-text="Aide-moi à mixer une musique">🎚 Mixe une musique</button>
            <button type="button" class="ax-chat-chip" data-chip-text="Plan ma semaine">📅 Plan ma semaine</button>
            <button type="button" class="ax-chat-chip" data-chip-text="/web ">🔍 Cherche sur le web</button>
            <button type="button" class="ax-chat-chip" data-chip-text="Lance un audit complet">💼 Audit pro</button>
          </div>
        ` : ''}
      </div>
      <button type="button" class="ax-scroll-bottom-fab" id="ax-scroll-bottom" aria-label="Aller en bas" title="Aller en bas">↓</button>
      </div>
      <!-- v13.4.187 fix Kevin "boutons coupés portrait iPhone" : flex-wrap +
           min-width:0 INLINE pour garantir override CSS, gap réduit, padding 6px,
           icon-compact min-width réduit à 32px. -->
      <form class="ax-chat-input" id="ax-chat-form" style="flex-wrap:wrap;gap:4px;min-width:0">
        <textarea
          id="ax-chat-text"
          rows="1"
          placeholder="Demande, dicte ou colle…"
          aria-label="Message"
          autocomplete="off"
          style="flex:1 1 100%;min-width:0;max-width:100%"
        ></textarea>
        <button type="button" class="ax-btn ax-btn-icon ax-icon-compact ax-gs-358" id="ax-chat-mic" aria-label="Dictée vocale" title="Dictée vocale (Web Speech)">🎙</button>
        <button type="button" class="ax-btn ax-btn-icon ax-icon-compact ax-gs-358" id="ax-chat-wake" aria-label="Activer Dis Apex" title="Wake word 'Dis Apex' actif/inactif">👂</button>
        <button type="button" class="ax-btn ax-btn-icon ax-icon-compact ax-gs-358" id="ax-chat-attach" aria-label="Joindre fichier" title="Photo, vidéo, document, archive">📎</button>
        <button type="button" class="ax-btn ax-btn-icon ax-icon-compact" id="ax-chat-camera" aria-label="Ouvrir caméra" title="Caméra (photo, scan, QR, vidéo)" style="display:none;min-width:36px;width:36px;flex:0 0 36px">📷</button>
        <button type="submit" class="ax-btn ax-btn-primary ax-chat-send" aria-label="Envoyer" style="flex:0 0 56px;width:56px;min-width:56px;height:44px;padding:0;margin-left:auto">↑</button>
        <input type="file" id="ax-chat-file-input" aria-label="Joindre fichiers au message" multiple
          accept="image/*,video/*,audio/*,.pdf,.txt,.md,.json,.csv,.zip,.rar,.7z,.docx,.xlsx,.pptx"
          class="ax-gs-359">
      </form>
      <div id="ax-chat-attachments" style="display:none;padding:8px;border-top:1px solid var(--ax-border);background:rgba(201,162,39,0.05);overflow-x:auto;white-space:nowrap"></div>
      <!-- v13.4.237 — Tab bar premium iOS-style : icône + label, glassmorphism,
           touch 52px Apple HIG, active state gold (Kevin "UX futuriste épuré"). -->
      <nav class="ax-tabbar ax-chat-nav" aria-label="Navigation principale">
        <button class="ax-tabbar__item is-on" data-nav-route="chat" aria-label="Chat" aria-current="page">
          <span class="ax-tabbar__ico">💬</span><span class="ax-tabbar__lbl">Chat</span>
        </button>
        <button class="ax-tabbar__item" data-nav-route="dashboard" aria-label="Tableau de bord">
          <span class="ax-tabbar__ico">📊</span><span class="ax-tabbar__lbl">Dash</span>
        </button>
        ${isAdmin ? `<button class="ax-tabbar__item" data-nav-route="admin" aria-label="Centre admin">
          <span class="ax-tabbar__ico">⚙️</span><span class="ax-tabbar__lbl">Admin</span>
        </button>` : ''}
        <button class="ax-tabbar__item ax-tabbar__item--accent" data-nav-route="vault" aria-label="Coffre clés API">
          <span class="ax-tabbar__ico">🔐</span><span class="ax-tabbar__lbl">Coffre</span>
        </button>
        <button class="ax-tabbar__item" data-nav-route="settings" aria-label="Réglages">
          <span class="ax-tabbar__ico">🔧</span><span class="ax-tabbar__lbl">Régl.</span>
        </button>
        <button class="ax-tabbar__item" id="ax-paste-key-nav" aria-label="Coller une clé API">
          <span class="ax-tabbar__ico">🔑</span><span class="ax-tabbar__lbl">Clé</span>
        </button>
        <button class="ax-tabbar__item ax-tabbar__item--danger" id="ax-logout-nav" aria-label="Déconnexion">
          <span class="ax-tabbar__ico">🚪</span><span class="ax-tabbar__lbl">Déco</span>
        </button>
      </nav>
      <footer style="text-align:center;padding:0 6px calc(env(safe-area-inset-bottom,0px));font-size:8px;color:var(--ax-text-muted);background:var(--ax-bg);flex-shrink:0;letter-spacing:0.2px;opacity:0.25;line-height:1;height:auto" title="${APP_VER} · DK">
        <span style="display:inline-block;width:4px;height:4px;border-radius:50%;background:var(--ax-green);vertical-align:middle"></span>
      </footer>
    </div>
`;
}
