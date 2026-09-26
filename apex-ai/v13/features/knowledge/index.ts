/**
 * APEX v13 — Vue Knowledge (mémoire long-terme + cross-user, admin only)
 *
 * Kevin 2026-05-07 (règle ABSOLUE) :
 * "Apex doit reprendre tous ses documents, savoir exactement toute l'histoire
 *  pour chaque personne. Apex admin a le savoir de tous. Mémoire à long terme."
 *
 * Sections :
 * 1. Mes facts persistants (per-user) — table avec category/text/importance/ts
 * 2. Cross-user knowledge (admin Kevin only) — résumé per-user + total
 * 3. Lessons cross-app (ax_lessons_learned_struct) — timeline 30 dernières
 * 4. Docs sync status (CLAUDE.md, NOTES_USER, etc.) — last fetch + size
 * 5. Boutons : "Force re-sync docs" / "Compress memory" / "Export JSON"
 *
 * Route : ?view=knowledge
 */

import { escapeHtml } from '../../core/escape-html.js';
import { logger } from '../../core/logger.js';
import { memory } from '../../core/memory.js';
import { guardFeatureEnabled } from '../../services/auth/feature-guard.js';
import { toast } from '../../ui/toast.js';

const ADMIN_ID = 'kdmc_admin';

interface UserCtx {
  id: string;
  name: string;
}

function getCurrentUser(): UserCtx | null {
  try {
    const raw = localStorage.getItem('apex_v13_user');
    if (!raw) return null;
    return JSON.parse(raw) as UserCtx;
  } catch {
    return null;
  }
}

function fmtDate(ts: number): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

function fmtAge(ts: number): string {
  if (!ts) return 'jamais';
  const ageMs = Date.now() - ts;
  const ageH = ageMs / 3_600_000;
  if (ageH < 1) return `${Math.floor(ageMs / 60_000)}min`;
  if (ageH < 24) return `${Math.floor(ageH)}h`;
  return `${Math.floor(ageH / 24)}j`;
}

export function render(rootEl: HTMLElement): void {
  const user = getCurrentUser();
  const isAdmin = user?.id === ADMIN_ID;
  const userName = user?.name ?? 'Anonyme';
  /* Wire admin feature toggle (Kevin règle 2026-05-04 — ON/OFF tout). */
  if (!guardFeatureEnabled('admin.kb', rootEl, user?.id)) return;

  rootEl.innerHTML = `
    <div class="ax-page ax-knowledge">
      <header class="ax-page-header">
        <h1>🧠 Mémoire long-terme</h1>
        <p class="ax-subtitle">Facts, lessons, docs synchronisés ${isAdmin ? '· 👑 Admin (cross-user)' : `· user ${escapeHtml(userName)}`}</p>
      </header>

      <div class="ax-actions" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
        <button id="btn-resync-docs" class="ax-btn ax-btn-primary">🔄 Force re-sync docs</button>
        <button id="btn-compress-mem" class="ax-btn ax-btn-warning">🗜️ Compress memory</button>
        <button id="btn-export-json" class="ax-btn ax-btn-outline">💾 Export JSON</button>
        <button id="btn-extract-test" class="ax-btn ax-btn-outline">🧪 Tester extraction</button>
      </div>

      <section class="ax-card" id="sec-my-facts">
        <h2>📚 Mes facts persistants</h2>
        <div id="my-facts-content"><em>Chargement…</em></div>
      </section>

      ${isAdmin ? `
      <section class="ax-card" id="sec-cross-user">
        <h2>👑 Cross-user knowledge (admin)</h2>
        <div id="cross-user-content"><em>Chargement…</em></div>
      </section>
      ` : ''}

      <section class="ax-card" id="sec-lessons">
        <h2>📖 Lessons cross-app</h2>
        <div id="lessons-content"><em>Chargement…</em></div>
      </section>

      <section class="ax-card" id="sec-docs">
        <h2>📂 Docs sync status</h2>
        <div id="docs-content"><em>Chargement…</em></div>
      </section>

      <section class="ax-card" id="sec-audit">
        <h2>🔍 Memory audit log (sentinelle memory-watch)</h2>
        <div id="audit-content"><em>Chargement…</em></div>
      </section>
    </div>
  `;

  void loadAll(rootEl, user, isAdmin);
  attachHandlers(rootEl, user, isAdmin);
}

async function loadAll(rootEl: HTMLElement, user: UserCtx | null, isAdmin: boolean): Promise<void> {
  await Promise.all([
    loadMyFacts(rootEl, user),
    isAdmin ? loadCrossUser(rootEl) : Promise.resolve(),
    loadLessons(rootEl),
    loadDocs(rootEl),
    loadAudit(rootEl),
  ]);
}

async function loadMyFacts(rootEl: HTMLElement, user: UserCtx | null): Promise<void> {
  const container = rootEl.querySelector<HTMLDivElement>('#my-facts-content');
  if (!container) return;
  if (!user) {
    container.innerHTML = '<em>Pas de user connecté.</em>';
    return;
  }
  try {
    const { persistentMemory: persistentMemoryStore } = await import('../../services/storage/persistent-memory-store.js');
    const all = await persistentMemoryStore.list();
    const mine = all.filter((e) => e.scope === user.id).sort((a, b) => b.importance - a.importance);
    if (mine.length === 0) {
      container.innerHTML = '<em>Aucun fact mémorisé pour ton compte. Les facts seront extraits automatiquement de tes messages chat.</em>';
      return;
    }
    const rows = mine.slice(0, 100).map((f, idx) => `
      <tr data-fact-idx="${idx}" style="cursor:pointer">
        <td><span class="ax-tag">${escapeHtml(f.category)}</span></td>
        <td>${escapeHtml(f.text)}</td>
        <td><span class="ax-importance" style="color:${f.importance >= 80 ? '#ff6b6b' : f.importance >= 60 ? '#ffa94d' : '#888'};">${f.importance}</span></td>
        <td><time>${fmtAge(f.ts)}</time></td>
      </tr>
    `).join('');
    container.innerHTML = `
      <p>${mine.length} fact(s) mémorisé(s) (top 100 affichés) — clic ligne pour drilldown</p>
      <table class="ax-table ax-gs-394">
        <thead><tr><th>Catégorie</th><th>Fact</th><th>Importance</th><th>Âge</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
    /* v13.3.57 PUSH-100 : drilldown fact details */
    container.querySelectorAll<HTMLTableRowElement>('tr[data-fact-idx]').forEach((row) => {
      row.addEventListener('click', () => {
        const idx = Number(row.dataset['factIdx'] ?? '-1');
        const f = mine[idx];
        if (!f) return;
        void (async () => {
          const { drillDown } = await import('../../ui/drilldown.js');
          const mountId = 'ax-drilldown-mount-knowledge';
          let mount = document.getElementById(mountId);
          if (!mount) {
            mount = document.createElement('div');
            mount.id = mountId;
            document.body.appendChild(mount);
          }
          drillDown.open({
            id: `fact-${idx}`,
            title: `🧠 Fact ${escapeHtml(f.category)}`,
            content: () => `
              <div class="ax-gs-27">
                <table class="ax-gs-291">
                  <tr><td class="ax-gs-367">Catégorie</td><td>${escapeHtml(f.category)}</td></tr>
                  <tr><td class="ax-gs-367">Texte</td><td>${escapeHtml(f.text)}</td></tr>
                  <tr><td class="ax-gs-367">Importance</td><td>${f.importance}/100</td></tr>
                  <tr><td class="ax-gs-367">Scope (user)</td><td><code>${escapeHtml(f.scope ?? 'global')}</code></td></tr>
                  <tr><td class="ax-gs-367">Source</td><td>${escapeHtml(f.source ?? '—')}</td></tr>
                  <tr><td class="ax-gs-367">Créé</td><td>${fmtDate(f.ts)} (${fmtAge(f.ts)})</td></tr>
                </table>
              </div>
            `,
            data: { factIdx: idx },
          }, mount);
        })();
      });
    });
  } catch (err: unknown) {
    container.innerHTML = `<em class="ax-gs-233">Erreur chargement : ${escapeHtml(String(err))}</em>`;
  }
}

async function loadCrossUser(rootEl: HTMLElement): Promise<void> {
  const container = rootEl.querySelector<HTMLDivElement>('#cross-user-content');
  if (!container) return;
  try {
    const { persistentMemory: persistentMemoryStore } = await import('../../services/storage/persistent-memory-store.js');
    const all = await persistentMemoryStore.list();
    const byUser = new Map<string, typeof all>();
    for (const e of all) {
      const arr = byUser.get(e.scope) ?? [];
      arr.push(e);
      byUser.set(e.scope, arr);
    }
    if (byUser.size === 0) {
      container.innerHTML = '<em>Aucun user n\'a encore de facts mémorisés.</em>';
      return;
    }
    const rows: string[] = [];
    for (const [uid, entries] of byUser) {
      const top3 = entries.sort((a, b) => b.importance - a.importance).slice(0, 3);
      rows.push(`
        <details class="ax-user-block" style="margin-bottom:8px;border:1px solid #333;padding:8px;border-radius:4px;">
          <summary><strong>${escapeHtml(uid)}</strong> · ${entries.length} fact(s)</summary>
          <ul style="margin-top:8px;font-size:0.9em;">
            ${top3.map((f) => `<li>[${escapeHtml(f.category)}/${f.importance}] ${escapeHtml(f.text)}</li>`).join('')}
          </ul>
        </details>
      `);
    }
    /* v13.4.133 audit-grade : DOM API. rows déjà escapés via escapeHtml inline. */
    container.textContent = '';
    const summary = document.createElement('p');
    summary.textContent = `${byUser.size} user(s), ${all.length} fact(s) total`;
    container.append(summary);
    const rowsWrap = document.createElement('div');
    rowsWrap.innerHTML = rows.join(''); /* rows escape déjà via escapeHtml */
    container.append(rowsWrap);
  } catch (err: unknown) {
    container.innerHTML = `<em class="ax-gs-233">Erreur : ${escapeHtml(String(err))}</em>`;
  }
}

async function loadLessons(rootEl: HTMLElement): Promise<void> {
  const container = rootEl.querySelector<HTMLDivElement>('#lessons-content');
  if (!container) return;
  try {
    const raw = localStorage.getItem('ax_lessons_learned_struct');
    if (!raw) {
      container.innerHTML = '<em>Aucune lesson cross-app encore.</em>';
      return;
    }
    const arr = JSON.parse(raw) as Array<{ category: string; title: string; text: string; severity: string; resolved: boolean; ts: number; src?: string }>;
    if (arr.length === 0) {
      container.innerHTML = '<em>Liste vide.</em>';
      return;
    }
    const sorted = [...arr].sort((a, b) => b.ts - a.ts).slice(0, 30);
    const rows = sorted.map((l) => {
      const sevColor = l.severity === 'critical' ? '#ff4444' : l.severity === 'warn' ? '#ffa94d' : '#888';
      const status = l.resolved ? '✅' : '⏳';
      return `
        <li style="margin-bottom:8px;border-left:3px solid ${sevColor};padding-left:8px;">
          ${status} <strong>${escapeHtml(l.title)}</strong>
          <small style="color:#888;"> · ${escapeHtml(l.category)} · ${escapeHtml(l.src ?? 'apex')} · ${fmtAge(l.ts)}</small>
          <div style="font-size:0.85em;color:#bbb;margin-top:4px;">${escapeHtml(l.text)}</div>
        </li>
      `;
    });
    /* v13.4.133 audit-grade : DOM API. rows déjà escapés via escapeHtml inline. */
    container.textContent = '';
    const summaryL = document.createElement('p');
    summaryL.textContent = `${arr.length} lesson(s) (30 plus récentes affichées)`;
    container.append(summaryL);
    const ulL = document.createElement('ul');
    ulL.style.cssText = 'list-style:none;padding:0;';
    ulL.innerHTML = rows.join('');
    container.append(ulL);
  } catch (err: unknown) {
    container.innerHTML = `<em class="ax-gs-233">Erreur : ${escapeHtml(String(err))}</em>`;
  }
}

async function loadDocs(rootEl: HTMLElement): Promise<void> {
  const container = rootEl.querySelector<HTMLDivElement>('#docs-content');
  if (!container) return;
  const docs = memory.getDocsContext();
  const keys = Object.keys(docs);
  if (keys.length === 0) {
    container.innerHTML = '<em>Aucun doc synchronisé. Clique "Force re-sync docs" pour fetcher depuis GitHub.</em>';
    return;
  }
  const rows = keys.map((name) => {
    const d = docs[name];
    if (!d) return '';
    return `
      <tr>
        <td><strong>${escapeHtml(name)}</strong></td>
        <td>${(d.size / 1024).toFixed(1)} KB</td>
        <td>${fmtAge(d.ts)}</td>
        <td><time title="${fmtDate(d.ts)}">${fmtDate(d.ts)}</time></td>
      </tr>
    `;
  }).join('');
  container.innerHTML = `
    <table class="ax-table ax-gs-394">
      <thead><tr><th>Doc</th><th>Taille</th><th>Âge</th><th>Last fetch</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

async function loadAudit(rootEl: HTMLElement): Promise<void> {
  const container = rootEl.querySelector<HTMLDivElement>('#audit-content');
  if (!container) return;
  try {
    const raw = localStorage.getItem('ax_memory_audit_log');
    if (!raw) {
      container.innerHTML = '<em>Sentinelle memory-watch n\'a pas encore tourné (1×/jour).</em>';
      return;
    }
    const arr = JSON.parse(raw) as Array<{ ts: number; total_facts: number; users_count: number; lessons_count: number; oversized_users: string[] }>;
    if (arr.length === 0) {
      container.innerHTML = '<em>Log vide.</em>';
      return;
    }
    const last = arr[arr.length - 1];
    if (!last) {
      container.innerHTML = '<em>Log vide.</em>';
      return;
    }
    container.innerHTML = `
      <p><strong>Dernier audit :</strong> ${fmtDate(last.ts)} (${fmtAge(last.ts)})</p>
      <ul>
        <li>Total facts : <strong>${last.total_facts}</strong></li>
        <li>Users : <strong>${last.users_count}</strong></li>
        <li>Lessons : <strong>${last.lessons_count}</strong></li>
        ${last.oversized_users.length > 0 ? `<li style="color:#ffa94d;">Oversized : ${last.oversized_users.join(', ')}</li>` : '<li style="color:#5cb85c;">Aucun user oversized</li>'}
      </ul>
      <details><summary>Voir ${arr.length} audits</summary>
        <ul style="font-size:0.85em;">
          ${arr.slice(-10).reverse().map((a) => `<li>${fmtDate(a.ts)} : ${a.total_facts} facts, ${a.users_count} users, ${a.lessons_count} lessons</li>`).join('')}
        </ul>
      </details>
    `;
  } catch (err: unknown) {
    container.innerHTML = `<em class="ax-gs-233">Erreur : ${escapeHtml(String(err))}</em>`;
  }
}

function attachHandlers(rootEl: HTMLElement, user: UserCtx | null, isAdmin: boolean): void {
  const btnResync = rootEl.querySelector<HTMLButtonElement>('#btn-resync-docs');
  btnResync?.addEventListener('click', async () => {
    btnResync.disabled = true;
    btnResync.textContent = '⏳ Sync en cours…';
    try {
      const res = await memory.syncDocsAtBoot({ forceRefresh: true });
      toast.show(`✅ Docs sync : ${res.synced} OK · ${res.failed} fails`, 'success');
      await loadDocs(rootEl);
    } catch (err: unknown) {
      console.error('[knowledge] resync docs', err);
      toast.show('Synchronisation des docs impossible — réessaie dans un instant', 'error');
    } finally {
      btnResync.disabled = false;
      btnResync.textContent = '🔄 Force re-sync docs';
    }
  });

  const btnCompress = rootEl.querySelector<HTMLButtonElement>('#btn-compress-mem');
  btnCompress?.addEventListener('click', async () => {
    if (!confirm('Compresser la mémoire ? Garde top 100 facts par importance par user, supprime le reste. Action irréversible.')) return;
    btnCompress.disabled = true;
    try {
      const { sentinels } = await import('../../services/sentinels/sentinels.js');
      const result = await sentinels.runOne('memory-watch');
      toast.show(`✅ ${result?.msg ?? 'Done'}`, 'success');
      await loadAll(rootEl, user, isAdmin);
    } catch (err: unknown) {
      console.error('[knowledge] compress memory', err);
      toast.show('Compression de la mémoire impossible — réessaie plus tard', 'error');
    } finally {
      btnCompress.disabled = false;
    }
  });

  const btnExport = rootEl.querySelector<HTMLButtonElement>('#btn-export-json');
  btnExport?.addEventListener('click', async () => {
    try {
      const { persistentMemory: persistentMemoryStore } = await import('../../services/storage/persistent-memory-store.js');
      const all = await persistentMemoryStore.list();
      const exportData = {
        ts: Date.now(),
        user_id: user?.id ?? 'anonymous',
        is_admin: isAdmin,
        facts: isAdmin ? all : all.filter((e) => e.scope === user?.id),
        lessons: JSON.parse(localStorage.getItem('ax_lessons_learned_struct') ?? '[]') as unknown,
        docs_meta: Object.fromEntries(
          Object.entries(memory.getDocsContext()).map(([k, v]) => [k, { ts: v.ts, size: v.size }]),
        ),
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `apex-memory-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.show('💾 Export téléchargé', 'success');
    } catch (err: unknown) {
      toast.show(`❌ Export fail : ${String(err)}`, 'error');
    }
  });

  const btnExtract = rootEl.querySelector<HTMLButtonElement>('#btn-extract-test');
  btnExtract?.addEventListener('click', async () => {
    const sample = prompt('Tape une phrase (ex: "j\'habite Monaco et j\'ai 35 ans, je suis allergique aux fruits de mer") :', '');
    if (!sample || !user) return;
    try {
      const result = await memory.extractFactsFromMessage(sample, user.id);
      toast.show(`✅ ${result.extracted} fact(s) extrait(s)`, 'success');
      await loadMyFacts(rootEl, user);
    } catch (err: unknown) {
      toast.show(`❌ Extract fail : ${String(err)}`, 'error');
    }
  });

  logger.info('knowledge', 'render + handlers wired', { isAdmin, user: user?.id });
}
