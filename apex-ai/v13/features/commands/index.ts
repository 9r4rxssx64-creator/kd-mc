/**
 * APEX v13 — Feature Commandes (mémo dédié des commandes slash du chat)
 *
 * Demande Kevin : mémo dédié de TOUTES les commandes `/` + ses commandes PERSO.
 * Source unique de vérité : SLASH_COMMANDS (intégrées) + custom-commands (perso).
 * TOUT est cliquable → route = navigation ; action/perso = prefill du chat
 * (Kevin complète la cible/args puis envoie lui-même, pas d'auto-submit).
 */

import { escapeHtml } from '../../core/escape-html.js';
import { router } from '../../core/router.js';
import {
  addCustomCommand,
  customCommandPrompt,
  listCustomCommands,
  removeCustomCommand,
  restoreCustomCommandsFromCloud,
  type CustomCommand,
} from '../../services/admin/custom-commands.js';
import { SLASH_COMMANDS, type SlashCommand } from '../../services/admin/slash-commands.js';

/** Catégorie d'affichage dérivée (pas de champ data → 0 duplication). */
function categoryOf(c: SlashCommand): string {
  if (c.route && c.route.startsWith('studio-')) return '🎨 Studios créatifs';
  if (c.route) return '🧭 Navigation';
  if (['ultrareview', 'diag', 'test'].includes(c.name)) return '🔍 Audit & diagnostic';
  if (['plan', 'ooda', 'loop', 'autonomous', 'resume'].includes(c.name)) return '🤖 Autonomie & planification';
  return '💬 Chat & conversation';
}

const CAT_ORDER = [
  '💬 Chat & conversation',
  '🔍 Audit & diagnostic',
  '🤖 Autonomie & planification',
  '🧭 Navigation',
  '🎨 Studios créatifs',
];

const INPUT_STYLE =
  'width:100%;box-sizing:border-box;padding:10px 12px;margin:0 0 8px;font-size:16px;' +
  'background:rgba(0,0,0,0.35);color:#fff;border:1px solid rgba(255,255,255,0.12);border-radius:8px';

/** Section « ⭐ Mes commandes » (perso) + formulaire d'ajout. */
function customSectionHtml(): string {
  const list = listCustomCommands();
  let h = `<h2 style="font-size:15px;margin:6px 0 8px">⭐ Mes commandes `
    + `<span style="color:var(--ax-text-dim);font-weight:400">(${list.length})</span></h2>`;

  if (list.length === 0) {
    h += `<p style="color:var(--ax-text-dim);font-size:12px;margin:0 0 8px">`
      + `Crée tes propres commandes ci-dessous (une action + sur qui/quoi/où l'appliquer).</p>`;
  }
  for (const c of list) {
    const tgt = c.target ? ` <span style="color:var(--ax-text-dim)">→ ${escapeHtml(c.target)}</span>` : '';
    h += `<div data-cc-run="${escapeHtml(c.id)}" role="button" tabindex="0" `
      + `style="display:flex;gap:8px;align-items:center;padding:8px 10px;margin-bottom:4px;`
      + `background:rgba(232,184,48,0.06);border:1px solid rgba(232,184,48,0.18);`
      + `border-radius:8px;min-height:44px;cursor:pointer">`
      + `<span style="font-size:15px">${escapeHtml(c.emoji)}</span>`
      + `<div style="flex:1;min-width:0">`
      + `<strong style="color:var(--ax-gold);font-size:13px">${escapeHtml(c.name)}</strong>${tgt}`
      + `<div style="color:var(--ax-text-dim);font-size:12px;margin-top:2px">${escapeHtml(c.action)}</div>`
      + `</div>`
      + `<button data-cc-del="${escapeHtml(c.id)}" type="button" aria-label="Supprimer la commande" `
      + `title="Supprimer" style="background:none;border:none;color:var(--ax-text-dim);`
      + `font-size:16px;cursor:pointer;min-width:36px;min-height:36px">🗑</button>`
      + `</div>`;
  }

  /* Formulaire d'ajout (collapsible). */
  h += `<details style="margin:6px 0 4px;background:rgba(255,255,255,0.03);border-radius:10px;`
    + `border:1px solid rgba(255,255,255,0.08)">`
    + `<summary style="padding:12px 14px;cursor:pointer;font-weight:600;list-style:none;min-height:44px;`
    + `display:flex;align-items:center">➕ Ajouter ma commande</summary>`
    + `<div style="padding:0 14px 14px">`
    + `<input id="cc-name" placeholder="Nom (ex : Rapport employé)" maxlength="40" style="${INPUT_STYLE}">`
    + `<input id="cc-emoji" placeholder="Emoji (optionnel, ex : 📋)" maxlength="4" style="${INPUT_STYLE}">`
    + `<textarea id="cc-action" placeholder="Ce qu'Apex doit faire (ex : Fais-moi un rapport complet)" `
    + `rows="2" style="${INPUT_STYLE};resize:vertical"></textarea>`
    + `<input id="cc-target" placeholder="Cible — sur qui / quoi / où (ex : Laurence, le Coffre, CMCteams)" `
    + `maxlength="200" style="${INPUT_STYLE}">`
    + `<button id="cc-save" type="button" style="width:100%;padding:12px;font-size:15px;font-weight:700;`
    + `background:linear-gradient(135deg,var(--ax-gold-deep),var(--ax-gold));color:#000;border:none;`
    + `border-radius:8px;cursor:pointer;min-height:44px">💾 Enregistrer ma commande</button>`
    + `<div id="cc-msg" style="margin-top:8px;font-size:12px;color:var(--ax-orange)"></div>`
    + `</div></details>`;
  return h;
}

export function render(rootEl: HTMLElement): void {
  const groups = new Map<string, SlashCommand[]>();
  for (const c of SLASH_COMMANDS) {
    const cat = categoryOf(c);
    const arr = groups.get(cat) ?? [];
    arr.push(c);
    groups.set(cat, arr);
  }

  let html = '<div style="max-width:720px;margin:0 auto;padding:16px">'
    + '<h1 style="color:var(--ax-gold);font-size:22px;margin:0 0 4px">📒 Commandes Apex</h1>'
    + `<p style="color:var(--ax-text-dim);font-size:13px;margin:0 0 16px">`
    + `<strong>Tape directement sur une commande pour la lancer.</strong> `
    + `(Ou tape <code>/</code> dans le chat.)</p>`;

  html += customSectionHtml();

  for (const cat of CAT_ORDER) {
    const cmds = groups.get(cat);
    if (!cmds || cmds.length === 0) continue;
    html += `<h2 style="font-size:15px;margin:18px 0 8px">${escapeHtml(cat)} `
      + `<span style="color:var(--ax-text-dim);font-weight:400">(${cmds.length})</span></h2>`;
    for (const c of cmds) {
      const usage = c.argsHint ? ` <span style="color:var(--ax-text-dim)">${escapeHtml(c.argsHint)}</span>` : '';
      const clickable = c.route
        ? ` data-cmd-route="${escapeHtml(c.route)}" role="button" tabindex="0"`
        : ` data-cmd-run="${escapeHtml(c.name)}" role="button" tabindex="0"`;
      html += `<div${clickable} style="display:flex;gap:8px;align-items:baseline;`
        + `padding:8px 10px;margin-bottom:4px;background:rgba(255,255,255,0.03);`
        + `border-radius:8px;min-height:40px;cursor:pointer">`
        + `<span style="font-size:15px">${c.emoji}</span>`
        + `<div style="flex:1;min-width:0">`
        + `<code style="color:var(--ax-gold);font-size:13px">/${escapeHtml(c.name)}</code>${usage}`
        + `<div style="color:var(--ax-text-dim);font-size:12px;margin-top:2px">${escapeHtml(c.description)}</div>`
        + '</div></div>';
    }
  }
  html += '</div>';
  rootEl.innerHTML = html;

  /* Restaure les commandes perso depuis Firebase si le local est vide (nouvel
   * appareil) — 1× par montage. Re-render si la liste a changé. */
  if (!rootEl.dataset['ccCloudTried']) {
    rootEl.dataset['ccCloudTried'] = '1';
    void restoreCustomCommandsFromCloud().then((changed) => { if (changed) render(rootEl); });
  }

  /* Listener délégué unique (idempotent — survit aux re-render innerHTML). */
  if (!rootEl.dataset['cmdMemoBound']) {
    rootEl.dataset['cmdMemoBound'] = '1';
    rootEl.addEventListener('click', (e) => {
      const el = e.target as HTMLElement | null;
      if (!el) return;

      /* 1. Supprimer une commande perso (avant le run du row). */
      const delId = el.closest('[data-cc-del]')?.getAttribute('data-cc-del');
      if (delId) { e.stopPropagation(); removeCustomCommand(delId); render(rootEl); return; }

      /* 2. Enregistrer une nouvelle commande perso. */
      if (el.closest('#cc-save')) {
        const val = (id: string): string =>
          (rootEl.querySelector<HTMLInputElement | HTMLTextAreaElement>(id)?.value ?? '');
        const res = addCustomCommand({
          name: val('#cc-name'),
          emoji: val('#cc-emoji'),
          action: val('#cc-action'),
          target: val('#cc-target'),
        });
        if (res.ok) {
          render(rootEl);
        } else {
          const msg = rootEl.querySelector('#cc-msg');
          if (msg) msg.textContent = '⚠️ ' + res.error;
        }
        return;
      }

      /* 3. Lancer une commande perso → prefill chat avec action + cible. */
      const ccId = el.closest('[data-cc-run]')?.getAttribute('data-cc-run');
      if (ccId) {
        const c = listCustomCommands().find((x: CustomCommand) => x.id === ccId);
        if (c) {
          try { localStorage.setItem('apex_v13_chat_prefill', customCommandPrompt(c) + ' '); } catch { /* ignore */ }
          router.navigate('chat');
        }
        return;
      }

      /* 4. Commande intégrée à route → navigation. */
      const route = el.closest('[data-cmd-route]')?.getAttribute('data-cmd-route');
      if (route) { router.navigate(route); return; }

      /* 5. Commande intégrée d'action → prefill. Une commande « de réflexion »
       *    (ghost/roast/matrix…) a une instruction `prefill` dédiée ; sinon on
       *    préremplit « /cmd » (Kevin complète les args puis envoie lui-même). */
      const name = el.closest('[data-cmd-run]')?.getAttribute('data-cmd-run');
      if (name) {
        const cmd = SLASH_COMMANDS.find((c) => c.name === name);
        const text = cmd?.prefill ? cmd.prefill : '/' + name + ' ';
        try { localStorage.setItem('apex_v13_chat_prefill', text); } catch { /* ignore */ }
        router.navigate('chat');
      }
    });
  }
}
