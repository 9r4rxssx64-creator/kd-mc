/**
 * APEX v13 — Vue admin "Pinecone Status".
 *
 * Demande Kevin 2026-05-08 :
 * "Crée vue admin pinecone-status : status configuré/absent, stats vectors, last sync,
 *  bouton Tester connexion + Recharger clé + Resync depuis localStorage facts."
 *
 * UI :
 *  - Header : status (configuré ✅ / absent ⚠ / fallback actif 🟡)
 *  - Stats : index_name, vector_count, last_sync, cache_size
 *  - Boutons : 🧪 Tester connexion / 🔄 Recharger clé / 📤 Resync facts
 *  - Notes : si fallback actif → indicateur jaune + explication localStorage
 */

import { escapeHtml } from '../../../core/escape-html.js';
import { createCleanupScope, type CleanupScope } from '../../../core/listener-cleanup.js';
import { logger } from '../../../core/logger.js';
import { pineconeStore, type PineconeStatus } from '../../../services/storage/pinecone-store.js';
import { haptic } from '../../../ui/haptic.js';
import { toast } from '../../../ui/toast.js';

let activeScope: CleanupScope | null = null;

export function dispose(): void {
  activeScope?.cleanup();
  activeScope = null;
}

function fmtAge(ts: number): string {
  if (!ts) return 'Jamais';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'À l\'instant';
  if (diff < 3_600_000) return `Il y a ${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `Il y a ${Math.floor(diff / 3_600_000)} h`;
  return `Il y a ${Math.floor(diff / 86_400_000)} j`;
}

function statusBadge(s: PineconeStatus): string {
  if (!s.configured) {
    return `<span style="padding:4px 10px;border-radius:6px;background:#666;color:#fff;font-size:12px">⚪ Non configuré</span>`;
  }
  if (s.fallback_active) {
    return `<span style="padding:4px 10px;border-radius:6px;background:#c9a227;color:#000;font-size:12px">🟡 Fallback localStorage</span>`;
  }
  if (s.reachable) {
    return `<span style="padding:4px 10px;border-radius:6px;background:#0d8a3e;color:#fff;font-size:12px">✅ Opérationnel</span>`;
  }
  return `<span style="padding:4px 10px;border-radius:6px;background:#a02d2d;color:#fff;font-size:12px">🔴 Erreur</span>`;
}

function renderStatusCard(s: PineconeStatus): string {
  return `
    <div class="ax-card ax-gs-195">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 style="margin:0;font-size:1.1em">🌲 Pinecone Vector Store</h3>
        ${statusBadge(s)}
      </div>
      <table class="ax-gs-291">
        <tr><td style="padding:4px 8px;color:var(--ax-text-dim);width:40%">Index</td><td><code>${escapeHtml(s.index_name)}</code></td></tr>
        <tr><td class="ax-gs-292">Vectors</td><td>${s.vector_count.toLocaleString('fr-FR')}</td></tr>
        <tr><td class="ax-gs-292">Last sync</td><td>${escapeHtml(fmtAge(s.last_sync_ts))}</td></tr>
        <tr><td class="ax-gs-292">Cache (5 min)</td><td>${s.cache_size} entrées</td></tr>
        ${s.error ? `<tr><td class="ax-gs-292">Dernière erreur</td><td><span class="ax-gs-18">${escapeHtml(s.error)}</span></td></tr>` : ''}
      </table>
      ${
        !s.configured
          ? `<div class="ax-gs-111">
               <strong>Pinecone non configuré.</strong><br>
               Pour activer le RAG vectoriel, configure <code>ax_pinecone_key</code> dans le Coffre.<br>
               Mode actuel : fallback localStorage (ranking par importance) — fonctionne sans dégrader l'app.
             </div>`
          : ''
      }
      ${
        s.fallback_active && s.configured
          ? `<div class="ax-gs-111">
               <strong>Fallback actif :</strong> Pinecone configuré mais inaccessible.
               Apex utilise localStorage facts ranking. Vérifie la clé et la connexion réseau.
             </div>`
          : ''
      }
    </div>`;
}

function renderActionsCard(): string {
  return `
    <div class="ax-card ax-gs-195">
      <h3 class="ax-gs-293">Actions</h3>
      <div class="ax-gs-7">
        <button class="ax-btn" id="btn-test" type="button">🧪 Tester connexion</button>
        <button class="ax-btn" id="btn-reload" type="button">🔄 Recharger clé</button>
        <button class="ax-btn" id="btn-resync" type="button">📤 Resync depuis facts</button>
      </div>
      <div id="action-result" class="ax-gs-196"></div>
    </div>`;
}

function renderInfoCard(): string {
  return `
    <div class="ax-card ax-gs-197">
      <h3 class="ax-gs-293">À propos</h3>
      <ul style="margin:0;padding-left:20px;font-size:13px;line-height:1.6">
        <li>Pinecone est <strong>optionnel</strong>. Sans clé, Apex utilise localStorage avec ranking par importance.</li>
        <li>Embedding via <strong>NVIDIA llama-text-embed-v2</strong> (hosted Pinecone, pas besoin OpenAI).</li>
        <li>Cache 5 min côté client pour réduire latence et coûts.</li>
        <li>Index <code>apex-memory</code> auto-créé au 1er upsert si absent.</li>
        <li>Resync : pousse tous les facts <code>persistent_memory</code> vers Pinecone (par batches de 100).</li>
      </ul>
    </div>`;
}

export async function render(rootEl: HTMLElement): Promise<void> {
  activeScope?.cleanup();
  activeScope = createCleanupScope('pinecone-status');

  const status = await pineconeStore.getStatus();

  rootEl.innerHTML = `
    <div class="ax-section" style="max-width:720px;padding:16px">
      <h2 style="margin:0 0 16px">Pinecone Status</h2>
      ${renderStatusCard(status)}
      ${renderActionsCard()}
      ${renderInfoCard()}
    </div>
  `;

  const resultEl = rootEl.querySelector<HTMLDivElement>('#action-result');
  const setResult = (html: string): void => {
    if (resultEl) resultEl.innerHTML = html;
  };

  const btnTest = rootEl.querySelector<HTMLButtonElement>('#btn-test');
  if (btnTest) {
    const handler = async (): Promise<void> => {
      haptic.tap();
      setResult('<em>Test en cours…</em>');
      try {
        const r = await pineconeStore.testConnection();
        if (r.ok) {
          setResult(`<span class="ax-gs-60">✅ Connexion OK (${r.latencyMs} ms)</span>`);
          toast.show('Pinecone OK', 'success');
        } else {
          setResult(`<span class="ax-gs-18">❌ ${escapeHtml(r.error ?? 'inconnu')}</span>`);
          toast.show('Pinecone KO : ' + (r.error ?? ''), 'warn');
        }
      } catch (err: unknown) {
        setResult(`<span class="ax-gs-18">Erreur: ${escapeHtml(String(err))}</span>`);
      }
    };
    btnTest.addEventListener('click', handler);
    activeScope.onCleanup(() => btnTest.removeEventListener('click', handler));
  }

  const btnReload = rootEl.querySelector<HTMLButtonElement>('#btn-reload');
  if (btnReload) {
    const handler = async (): Promise<void> => {
      haptic.tap();
      setResult('<em>Reload en cours…</em>');
      try {
        const ok = await pineconeStore.reload();
        const newStatus = await pineconeStore.getStatus();
        setResult(
          ok
            ? `<span class="ax-gs-60">✅ Clé rechargée (${newStatus.vector_count} vectors)</span>`
            : `<span class="ax-gs-198">⚠ Reload partiel : ${escapeHtml(newStatus.error ?? 'fallback actif')}</span>`,
        );
        await render(rootEl); /* re-render avec nouveau status */
      } catch (err: unknown) {
        setResult(`<span class="ax-gs-18">Erreur: ${escapeHtml(String(err))}</span>`);
      }
    };
    btnReload.addEventListener('click', handler);
    activeScope.onCleanup(() => btnReload.removeEventListener('click', handler));
  }

  const btnResync = rootEl.querySelector<HTMLButtonElement>('#btn-resync');
  if (btnResync) {
    const handler = async (): Promise<void> => {
      haptic.tap();
      const confirmMsg = 'Resync : pousse tous les facts persistent_memory vers Pinecone. Cela peut générer des coûts (embedding). Continuer ?';
      if (!confirm(confirmMsg)) return;
      setResult('<em>Resync en cours… (peut prendre plusieurs minutes)</em>');
      try {
        const r = await pineconeStore.resyncFromLocalFacts();
        if (r.ok) {
          setResult(`<span class="ax-gs-60">✅ ${r.synced} facts synchronisés</span>`);
          toast.show(`${r.synced} facts → Pinecone`, 'success');
        } else {
          setResult(`<span class="ax-gs-18">❌ ${escapeHtml(r.error ?? '')} (${r.synced} synced avant erreur)</span>`);
        }
      } catch (err: unknown) {
        setResult(`<span class="ax-gs-18">Erreur: ${escapeHtml(String(err))}</span>`);
        logger.error('pinecone-status', 'resync error', { err });
      }
    };
    btnResync.addEventListener('click', handler);
    activeScope.onCleanup(() => btnResync.removeEventListener('click', handler));
  }
}
