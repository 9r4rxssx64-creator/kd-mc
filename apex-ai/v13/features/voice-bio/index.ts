/**
 * APEX v13 — Vue Voice Bio (?view=voice-bio)
 *
 * Demande Kevin (2026-05-07) : "Pour 'Dis Apex', apprentissage s'améliore au fur et à
 * mesure pour reconnaître l'utilisateur final exclusif".
 *
 * Cette vue permet à chaque user :
 * - De voir l'état de son enrôlement vocal (samples_count, confidence_score)
 * - De ré-enrôler / améliorer son voiceprint avec 3 enregistrements
 * - De supprimer son empreinte (RGPD Art. 17)
 * - De toggler le mode exclusif (default ON — sécurité)
 * - Stats : reconnaissances réussies vs ignorées (entourage, bruit)
 *
 * Admin Kevin a accès supplémentaire :
 * - Liste tous les voiceprints enrôlés (cross-user)
 * - Tableau des tentatives non reconnues (anti-confusion entourage)
 * - Bouton "Forcer calibration" / "Reset toutes les empreintes"
 *
 * Sécurité :
 * - Voiceprint stocké FB_LOCAL strict (jamais sync Firebase — biométrique)
 * - User non-admin ne voit QUE sa propre empreinte
 * - Bouton suppression demande confirmation (RGPD)
 */

import { escapeHtml } from '../../core/escape-html.js';
import { createCleanupScope, type CleanupScope } from '../../core/listener-cleanup.js';
import { logger } from '../../core/logger.js';
import { store } from '../../core/store.js';
import { voicePrint } from '../../services/ai/voice-print.js';
import { guardFeatureEnabled } from '../../services/auth/feature-guard.js';
import { haptic } from '../../ui/haptic.js';
import { toast } from '../../ui/toast.js';

const ADMIN_ID = 'kdmc_admin';

let activeScope: CleanupScope | null = null;

export function dispose(): void {
  activeScope?.cleanup();
  activeScope = null;
}


function formatDate(ts: number): string {
  if (!ts || ts === 0) return '—';
  const d = new Date(ts);
  const pad = (n: number): string => n.toString().padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatPct(n: number): string {
  return Math.round(n * 100) + '%';
}

function getCurrentUser(): { id: string; name: string; isAdmin: boolean } | null {
  const u = store.get('user') as { id?: string; name?: string } | null;
  if (!u || !u.id) return null;
  return { id: u.id, name: u.name ?? '', isAdmin: u.id === ADMIN_ID };
}

/**
 * Helper bind safe avec null-check sur element.
 */
function bindIfPresent(
  scope: CleanupScope,
  el: HTMLElement | null | undefined,
  type: string,
  handler: () => void,
): void {
  if (!el) return;
  scope.bind(el, type, handler);
}

/**
 * Confidence bar visualization (0-100%).
 */
function renderConfidenceBar(conf: number): string {
  const pct = Math.max(0, Math.min(1, conf)) * 100;
  const color = pct >= 85 ? '#22c55e' : pct >= 50 ? '#ffa500' : '#ff6666';
  return `
    <div style="background:rgba(40,40,55,0.5);border-radius:8px;height:18px;overflow:hidden;border:1px solid rgba(201,162,39,0.2)">
      <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,${color},${color}cc);transition:width .3s"></div>
    </div>
    <div style="font-size:11px;color:#aaa;margin-top:4px">${formatPct(conf)} fiabilité (${Math.round(pct)}/100)</div>
  `;
}

function renderUserSection(user: { id: string; name?: string; isAdmin: boolean }): string {
  const print = voicePrint.getPrintFor(user.id);
  const calib = voicePrint.needsCalibration(user.id);
  const exclusive = voicePrint.isExclusiveMode();
  /* v13.3.44 (Kevin 2026-05-07) : phase courante + toggle exclusif anticipé */
  const phaseDetails = voicePrint.getPhaseDetails(user.id);
  const anticipated = voicePrint.isExclusiveAnticipated();

  if (!print) {
    return `
      <div class="ax-gs-81">
        <h3 class="ax-gs-480">🎙 Mon empreinte vocale</h3>
        <p style="color:#aaa;line-height:1.5">
          Apex apprend ta voix automatiquement au fur et à mesure des conversations.
          Au début il écoute tout le monde puis affine pour finir exclusif à toi.
        </p>
        <div style="background:rgba(201,162,39,0.08);border-left:3px solid #c9a227;padding:10px 14px;margin:14px 0;border-radius:6px;color:#ccc;font-size:13px;line-height:1.5">
          📚 <b>Phases d'apprentissage :</b><br/>
          🔓 <b>0–3 samples</b> — Ouvert : accepte toutes voix<br/>
          🟡 <b>4–9 samples</b> — Apprentissage : seuil 50%<br/>
          🟠 <b>10–19 samples</b> — Affinage : seuil 65%<br/>
          🟢 <b>≥ 20 samples</b> — Exclusif : seuil 85% (ignore les autres voix)
        </div>
        <p style="color:#aaa;font-size:13px">
          Tu peux aussi enrôler 3 échantillons rapides pour démarrer.
        </p>
        <button id="ax-vbio-enroll-start" style="margin-top:12px;padding:10px 18px;background:linear-gradient(135deg,#c9a227,#e8b830);color:#000;border:0;border-radius:8px;font-weight:600;cursor:pointer;min-height:44px">
          🎙 Enrôler ma voix maintenant
        </button>
      </div>
    `;
  }

  const conf = print.confidence_score ?? 0;
  const samples = print.samples_count;
  const calibBanner = calib.needs
    ? `<div style="background:rgba(255,165,0,0.1);border:1px solid rgba(255,165,0,0.3);border-radius:8px;padding:10px 14px;margin:10px 0;color:#ffa500;font-size:13px">
         ⚠ <b>Calibration recommandée</b> — ${calib.reason === 'low_confidence' ? 'fiabilité < 85%' : 'dernière calibration > 30 jours'}.
         <button id="ax-vbio-recalibrate-banner" style="margin-left:8px;padding:6px 12px;background:#ffa500;color:#000;border:0;border-radius:6px;font-weight:600;cursor:pointer">Re-calibrer</button>
       </div>`
    : '';

  /* v13.3.44 (Kevin 2026-05-07) : barre progression "Apprentissage voix : X/20 samples (Y%)" */
  const progressPct = Math.round(phaseDetails.progress * 100);
  const phaseColor =
    phaseDetails.phase === 'open' ? '#9ca3af'
      : phaseDetails.phase === 'learning' ? '#facc15'
        : phaseDetails.phase === 'refining' ? '#fb923c'
          : '#22c55e';
  const samplesToNextHint =
    phaseDetails.samples_to_next > 0
      ? `<span style="color:#888;font-size:12px;margin-left:6px">(${phaseDetails.samples_to_next} samples avant phase suivante)</span>`
      : `<span style="color:#22c55e;font-size:12px;margin-left:6px">(phase finale atteinte ✓)</span>`;
  const phaseBlock = `
    <div style="background:rgba(15,15,28,0.5);border:1px solid ${phaseColor}33;border-radius:10px;padding:14px;margin:14px 0">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:8px">
        <div class="ax-gs-155">Apprentissage voix : ${samples}/${20} samples (${progressPct}%)</div>
        <div style="background:${phaseColor}22;border:1px solid ${phaseColor}55;color:${phaseColor};font-size:12px;font-weight:700;padding:4px 10px;border-radius:14px">${escapeHtml(phaseDetails.label)}</div>
      </div>
      <div style="background:rgba(40,40,55,0.5);border-radius:8px;height:14px;overflow:hidden;border:1px solid rgba(255,255,255,0.05)">
        <div style="height:100%;width:${Math.min(100, progressPct)}%;background:linear-gradient(90deg,${phaseColor},${phaseColor}cc);transition:width .3s"></div>
      </div>
      <div style="font-size:12px;color:#aaa;margin-top:8px">
        Seuil actuel : <b>${Math.round(phaseDetails.threshold * 100)}%</b> de similarité requise${samplesToNextHint}
      </div>
      ${anticipated && phaseDetails.phase === 'exclusive' && samples < 20
        ? '<div style="font-size:12px;color:#22c55e;margin-top:6px">⚡ Mode exclusif anticipé activé — phase exclusive forcée dès 10 samples</div>'
        : ''}
    </div>
  `;

  return `
    <div class="ax-gs-81">
      <h3 style="color:#c9a227;margin-top:0;margin-bottom:14px">🎙 Mon empreinte vocale</h3>

      <div class="ax-gs-177">
        <div>
          <div class="ax-gs-49">Échantillons</div>
          <div class="ax-gs-50">${samples} <span style="font-size:13px;color:#888">/ 20</span></div>
        </div>
        <div>
          <div class="ax-gs-49">Score moyen</div>
          <div class="ax-gs-50">${formatPct(print.match_score_avg)}</div>
        </div>
        <div>
          <div class="ax-gs-49">Dernière reconnaissance</div>
          <div class="ax-gs-178">${formatDate(print.last_match)}</div>
        </div>
        <div>
          <div class="ax-gs-49">Enrôlée le</div>
          <div class="ax-gs-178">${formatDate(print.enrolled_at)}</div>
        </div>
      </div>

      <div style="margin-bottom:14px">
        <div style="color:#888;font-size:12px;margin-bottom:6px">Fiabilité ("confidence"):</div>
        ${renderConfidenceBar(conf)}
      </div>

      ${phaseBlock}

      ${calibBanner}

      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px">
        <button id="ax-vbio-recalibrate" style="padding:10px 16px;background:rgba(201,162,39,0.15);color:#c9a227;border:1px solid rgba(201,162,39,0.3);border-radius:8px;font-weight:600;cursor:pointer;min-height:44px">
          🔄 Ré-enrôler ma voix
        </button>
        <button id="ax-vbio-delete" style="padding:10px 16px;background:rgba(255,102,102,0.15);color:#ff6666;border:1px solid rgba(255,102,102,0.3);border-radius:8px;font-weight:600;cursor:pointer;min-height:44px">
          🗑 Supprimer empreinte (RGPD)
        </button>
      </div>
    </div>

    <div class="ax-gs-81">
      <h3 class="ax-gs-480">🔒 Mode exclusif</h3>
      <p class="ax-gs-481">
        Quand activé, Apex n'écoute QUE ta voix pour "Dis Apex". Ignore silencieusement
        les autres voix (entourage, bruit ambient) — anti-confusion.
      </p>
      <label style="display:flex;align-items:center;gap:10px;margin-top:10px;cursor:pointer">
        <input type="checkbox" id="ax-vbio-exclusive" aria-label="Activer mode reconnaissance vocale exclusive" ${exclusive ? 'checked' : ''} class="ax-gs-439" />
        <span class="ax-gs-179">Mode exclusif activé (recommandé)</span>
      </label>
      <label style="display:flex;align-items:center;gap:10px;margin-top:14px;cursor:pointer;padding:10px 12px;background:rgba(34,197,94,0.06);border:1px dashed rgba(34,197,94,0.25);border-radius:8px">
        <input type="checkbox" id="ax-vbio-exclusive-anticipated" aria-label="Mode exclusif anticipé après 10 samples" ${anticipated ? 'checked' : ''} class="ax-gs-439" />
        <span class="ax-gs-179">⚡ Mode exclusif anticipé</span>
      </label>
      <p style="color:#888;font-size:12px;line-height:1.4;margin:6px 0 0 32px">
        Si ON, Apex passe en phase exclusive (seuil 85%) dès 10 samples au lieu d'attendre 20.
        Plus rapide à devenir exclusif, mais moins de marge pour adapter.
      </p>
    </div>
  `;
}

function renderAdminSection(currentUser: { id: string; isAdmin: boolean }): string {
  if (!currentUser.isAdmin) return '';

  const allPrints = voicePrint.listPrints();
  const stats = voicePrint.getStats();
  const unknown = voicePrint.getUnknownAttempts();
  const recentUnknown = unknown.slice(-10).reverse();

  const printsList = allPrints
    .map((p) => {
      const conf = p.confidence_score ?? 0;
      return `
        <tr class="ax-gs-261">
          <td style="padding:8px 6px;color:#fff;font-weight:600">${escapeHtml(p.uid)}${p.uid === ADMIN_ID ? ' 👑' : ''}</td>
          <td style="padding:8px 6px;color:#aaa">${p.samples_count}</td>
          <td style="padding:8px 6px;color:${conf >= 0.85 ? '#22c55e' : conf >= 0.5 ? '#ffa500' : '#ff6666'}">${formatPct(conf)}</td>
          <td style="padding:8px 6px;color:#aaa;font-size:11px">${formatDate(p.last_match)}</td>
          <td class="ax-gs-276"><button data-uid="${escapeHtml(p.uid)}" class="ax-vbio-admin-del" style="padding:4px 10px;background:rgba(255,102,102,0.15);color:#ff6666;border:1px solid rgba(255,102,102,0.3);border-radius:5px;font-size:11px;cursor:pointer">🗑</button></td>
        </tr>
      `;
    })
    .join('');

  const unknownList = recentUnknown
    .map((u) => `
      <tr class="ax-gs-261">
        <td style="padding:6px;color:#aaa;font-size:11px">${formatDate(u.ts)}</td>
        <td style="padding:6px;color:#ff6666">${formatPct(u.score)}</td>
        <td class="ax-gs-482">${u.pitch} Hz</td>
        <td class="ax-gs-482">${u.energy.toFixed(2)}</td>
      </tr>
    `).join('') || '<tr><td colspan="4" class="ax-gs-483">Aucune tentative non reconnue récente</td></tr>';

  return `
    <div style="background:rgba(20,20,35,0.5);border:1px solid rgba(255,165,0,0.2);border-radius:12px;padding:18px;margin-bottom:14px">
      <h3 style="color:#ffa500;margin-top:0;margin-bottom:10px">👑 Vue admin Kevin</h3>

      <div class="ax-gs-177">
        <div>
          <div class="ax-gs-51">Voix enrôlées</div>
          <div style="color:#ffa500;font-size:22px;font-weight:700">${stats.enrolled_count}</div>
        </div>
        <div>
          <div class="ax-gs-51">Total samples</div>
          <div class="ax-gs-50">${stats.total_samples}</div>
        </div>
        <div>
          <div class="ax-gs-51">Score moyen global</div>
          <div class="ax-gs-50">${formatPct(stats.avg_match_score)}</div>
        </div>
        <div>
          <div class="ax-gs-51">Tentatives ignorées</div>
          <div style="color:#ff6666;font-size:22px;font-weight:700">${unknown.length}</div>
        </div>
      </div>

      <h4 style="color:#c9a227;margin:14px 0 8px">Voix enrôlées</h4>
      <div class="ax-gs-78">
        <table class="ax-gs-271">
          <thead>
            <tr class="ax-gs-262">
              <th class="ax-gs-484">User ID</th>
              <th class="ax-gs-484">Samples</th>
              <th class="ax-gs-484">Confidence</th>
              <th class="ax-gs-484">Dernière reco</th>
              <th class="ax-gs-484">Actions</th>
            </tr>
          </thead>
          <tbody>${printsList || '<tr><td colspan="5" class="ax-gs-483">Aucune voix enrôlée</td></tr>'}</tbody>
        </table>
      </div>

      <h4 style="color:#c9a227;margin:18px 0 8px">Tentatives non reconnues (10 dernières)</h4>
      <div class="ax-gs-78">
        <table class="ax-gs-271">
          <thead>
            <tr class="ax-gs-262">
              <th class="ax-gs-485">Date</th>
              <th class="ax-gs-485">Score similarity</th>
              <th class="ax-gs-485">Pitch</th>
              <th class="ax-gs-485">Energie</th>
            </tr>
          </thead>
          <tbody>${unknownList}</tbody>
        </table>
      </div>

      <div style="margin-top:14px;display:flex;flex-wrap:wrap;gap:8px">
        <button id="ax-vbio-clear-unknown" style="padding:8px 14px;background:rgba(201,162,39,0.15);color:#c9a227;border:1px solid rgba(201,162,39,0.3);border-radius:6px;font-size:12px;cursor:pointer">
          🧹 Vider tentatives ignorées
        </button>
      </div>
    </div>
  `;
}

/**
 * Modal d'enrôlement (3 enregistrements de 3s).
 */
function renderEnrollModal(): string {
  return `
    <div id="ax-vbio-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px">
      <div style="background:#161620;border:1px solid rgba(201,162,39,0.3);border-radius:14px;max-width:480px;width:100%;padding:22px">
        <h3 class="ax-gs-486">🎙 Enrôlement vocal</h3>
        <p class="ax-gs-481">
          Je vais enregistrer 3 échantillons de ta voix (3 secondes chacun).
          Lis cette phrase chaque fois :
        </p>
        <div style="background:rgba(201,162,39,0.1);border-left:3px solid #c9a227;padding:12px 14px;margin:12px 0;border-radius:6px;color:#fff;font-style:italic;font-size:14px">
          "Apex, tu reconnais ma voix maintenant"
        </div>
        <div id="ax-vbio-enroll-status" style="color:#888;font-size:13px;margin:12px 0">État : prêt à enregistrer</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:16px">
          <button id="ax-vbio-record" style="flex:1;padding:12px;background:linear-gradient(135deg,#22cc77,#1a9a5a);color:#fff;border:0;border-radius:8px;font-weight:600;cursor:pointer;min-height:48px">
            🔴 Enregistrer (1/3)
          </button>
          <button id="ax-vbio-cancel" style="padding:12px 16px;background:rgba(255,102,102,0.15);color:#ff6666;border:1px solid rgba(255,102,102,0.3);border-radius:8px;font-weight:600;cursor:pointer;min-height:48px">
            Annuler
          </button>
        </div>
      </div>
    </div>
  `;
}

/* === Audio recording (MediaRecorder + decode → AudioBuffer) === */

async function recordAudio(durationMs: number): Promise<AudioBuffer | null> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    toast.warn('Micro non disponible sur ce navigateur');
    return null;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.addEventListener('dataavailable', (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    });
    return await new Promise<AudioBuffer | null>((resolve) => {
      recorder.addEventListener('stop', () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: 'audio/webm' });
        void blob.arrayBuffer().then(async (buf) => {
          try {
            const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: new () => AudioContext }).webkitAudioContext;
            if (!Ctx) {
              resolve(null);
              return;
            }
            const ctx = new Ctx();
            const audioBuffer = await ctx.decodeAudioData(buf);
            resolve(audioBuffer);
          } catch {
            resolve(null);
          }
        });
      });
      recorder.start();
      setTimeout(() => recorder.stop(), durationMs);
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'erreur';
    toast.warn(`Micro refusé : ${msg}`);
    return null;
  }
}

async function startEnrollFlow(uid: string, rootEl: HTMLElement, scope: CleanupScope): Promise<void> {
  const modalDiv = document.createElement('div');
  modalDiv.innerHTML = renderEnrollModal();
  document.body.appendChild(modalDiv);

  const closeModal = (): void => {
    modalDiv.remove();
  };

  const samples: AudioBuffer[] = [];
  const recordBtn = modalDiv.querySelector<HTMLButtonElement>('#ax-vbio-record');
  const cancelBtn = modalDiv.querySelector<HTMLButtonElement>('#ax-vbio-cancel');
  const statusDiv = modalDiv.querySelector<HTMLDivElement>('#ax-vbio-enroll-status');

  bindIfPresent(scope, cancelBtn, 'click', () => {
    closeModal();
    toast.warn('Enrôlement annulé');
  });

  let count = 0;
  const handleRecord = async (): Promise<void> => {
    if (!recordBtn) return;
    recordBtn.disabled = true;
    recordBtn.textContent = '🎤 Enregistrement…';
    if (statusDiv) statusDiv.textContent = `Sample ${count + 1}/3 en cours… parle maintenant !`;
    const buf = await recordAudio(3000);
    if (!buf) {
      recordBtn.disabled = false;
      recordBtn.textContent = `🔴 Réessayer (${count + 1}/3)`;
      if (statusDiv) statusDiv.textContent = '⚠ Échec enregistrement';
      return;
    }
    samples.push(buf);
    count++;
    if (count >= 3) {
      if (statusDiv) statusDiv.textContent = '✓ 3 samples capturés. Calcul empreinte…';
      const result = await voicePrint.enroll(uid, samples);
      if (result.ok) {
        voicePrint.markCalibrated(uid);
        toast.success(`✅ Voix enrôlée — ${result.samples_count} samples, ${formatPct(result.confidence_score ?? 0)} fiabilité`);
        haptic.tap();
        closeModal();
        /* Refresh view */
        await render(rootEl);
      } else {
        if (statusDiv) statusDiv.textContent = `❌ Échec : ${result.reason ?? 'inconnu'}`;
        recordBtn.disabled = false;
        recordBtn.textContent = '🔴 Réessayer';
      }
    } else {
      recordBtn.disabled = false;
      recordBtn.textContent = `🔴 Enregistrer (${count + 1}/3)`;
      if (statusDiv) statusDiv.textContent = `✓ Sample ${count}/3 OK — clique pour le suivant`;
    }
  };
  bindIfPresent(scope, recordBtn, 'click', () => {
    void handleRecord();
  });
}

/* === Render principal === */

export async function render(rootEl: HTMLElement): Promise<void> {
  if (!rootEl) {
    logger.warn('voice-bio', 'render called without rootEl');
    return;
  }
  /* Cleanup previous scope */
  activeScope?.cleanup();
  activeScope = createCleanupScope('voice-bio');
  const scope = activeScope;
  /* Wire admin feature toggle (Kevin règle 2026-05-04 — ON/OFF tout). */
  const uid = (store.get('user') as { id?: string } | null)?.id ?? 'anon';
  if (!guardFeatureEnabled('voice.biometric', rootEl, uid)) return;

  const user = getCurrentUser();
  if (!user) {
    rootEl.innerHTML = `
      <div style="padding:40px;text-align:center;color:#888">
        <h2>🎙 Voice Bio</h2>
        <p>Connecte-toi pour gérer ton empreinte vocale.</p>
      </div>
    `;
    return;
  }

  const html = `
    <div style="max-width:780px;margin:0 auto;padding:18px;font-family:system-ui,-apple-system,sans-serif">
      <h2 class="ax-gs-486">🎙 Voice Bio — Reconnaissance vocale exclusive</h2>
      <p class="ax-gs-340">
        Apex apprend à reconnaître ta voix au fur et à mesure des messages vocaux que tu lui envoies.
        Plus tu parles, plus la fiabilité augmente (jusqu'à 20 samples pour 100%).
        Quand le mode exclusif est ON, Apex ignore silencieusement les voix qui ne sont pas la tienne.
      </p>

      ${renderUserSection(user)}
      ${renderAdminSection(user)}
    </div>
  `;
  rootEl.innerHTML = html;

  /* Wire enroll start */
  const enrollStartBtn = rootEl.querySelector<HTMLButtonElement>('#ax-vbio-enroll-start');
  bindIfPresent(scope, enrollStartBtn, 'click', () => {
    void startEnrollFlow(user.id, rootEl, scope);
  });

  const recalibrateBtn = rootEl.querySelector<HTMLButtonElement>('#ax-vbio-recalibrate');
  bindIfPresent(scope, recalibrateBtn, 'click', () => {
    void startEnrollFlow(user.id, rootEl, scope);
  });

  const deleteBtn = rootEl.querySelector<HTMLButtonElement>('#ax-vbio-delete');
  bindIfPresent(scope, deleteBtn, 'click', () => {
    if (!confirm('Supprimer ton empreinte vocale ? Cette action est irréversible (RGPD Art. 17).')) return;
    const ok = voicePrint.deletePrint(user.id);
    if (ok) {
      toast.success('🗑 Empreinte supprimée');
      void render(rootEl);
    } else {
      toast.warn('Échec suppression');
    }
  });

  const exclusiveCb = rootEl.querySelector<HTMLInputElement>('#ax-vbio-exclusive');
  bindIfPresent(scope, exclusiveCb, 'change', () => {
    if (!exclusiveCb) return;
    voicePrint.setExclusiveMode(exclusiveCb.checked);
    toast.success(`Mode exclusif : ${exclusiveCb.checked ? 'ON' : 'OFF'}`);
  });

  /* v13.3.44 (Kevin 2026-05-07) : toggle "Mode exclusif anticipé" */
  const anticipatedCb = rootEl.querySelector<HTMLInputElement>('#ax-vbio-exclusive-anticipated');
  bindIfPresent(scope, anticipatedCb, 'change', () => {
    if (!anticipatedCb) return;
    voicePrint.setExclusiveAnticipated(anticipatedCb.checked);
    toast.success(`Mode exclusif anticipé : ${anticipatedCb.checked ? 'ON' : 'OFF'}`);
    void render(rootEl);
  });

  /* Banner re-calibrate (différent du bouton principal) */
  const recalibrateBannerBtn = rootEl.querySelector<HTMLButtonElement>('#ax-vbio-recalibrate-banner');
  bindIfPresent(scope, recalibrateBannerBtn, 'click', () => {
    void startEnrollFlow(user.id, rootEl, scope);
  });

  /* Admin actions */
  if (user.isAdmin) {
    const clearBtn = rootEl.querySelector<HTMLButtonElement>('#ax-vbio-clear-unknown');
    bindIfPresent(scope, clearBtn, 'click', () => {
      voicePrint.clearUnknownAttempts();
      toast.success('Tentatives ignorées effacées');
      void render(rootEl);
    });
    rootEl.querySelectorAll<HTMLButtonElement>('.ax-vbio-admin-del').forEach((btn) => {
      bindIfPresent(scope, btn, 'click', () => {
        const uid = btn.dataset['uid'];
        if (!uid) return;
        if (!confirm(`Supprimer empreinte de ${uid} ?`)) return;
        voicePrint.deletePrint(uid);
        toast.success(`Empreinte ${uid} supprimée`);
        void render(rootEl);
      });
    });
  }

  logger.info('voice-bio', `rendered for ${user.id}${user.isAdmin ? ' (admin)' : ''}`);
}
