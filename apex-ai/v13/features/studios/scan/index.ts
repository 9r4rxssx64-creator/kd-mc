/**
 * APEX v13 — Studio Scan (OCR + QR + barcode + cartes visite).
 *
 * Studio expert pour numériser un document, lire un QR/barcode, extraire texte.
 *
 * Features Kevin :
 *  - Upload image (file input, accept image/*)
 *  - OCR via service ocr-offline (lazy si dispo) sinon fallback message
 *  - QR / Barcode via BarcodeDetector API native (Chromium, Safari iOS 17+)
 *  - Extraction email/téléphone/URL/IBAN/code API depuis texte (regex)
 *  - Bouton copier résultat
 *  - Historique 20 derniers scans (localStorage)
 *
 * Anti-patterns évités : feature-detect BarcodeDetector, no fail si OCR indispo.
 */

import { escapeHtml } from '../../../core/escape-html.js';
export { escapeHtml }; /* re-export pour tests + parité historique */
import { createCleanupScope, type CleanupScope } from '../../../core/listener-cleanup.js';
import { logger } from '../../../core/logger.js';
import { store } from '../../../core/store.js';
import { guardFeatureEnabled } from '../../../services/auth/feature-guard.js';
import { haptic } from '../../../ui/haptic.js';
import { toast } from '../../../ui/toast.js';

let activeScope: CleanupScope | null = null;

export function dispose(): void {
  activeScope?.cleanup();
  activeScope = null;
}

const HISTORY_KEY = 'ax_scan_history';
const HISTORY_MAX = 20;

export type ScanType = 'ocr' | 'qr' | 'barcode' | 'unknown';

export interface ScanEntry {
  ts: number;
  type: ScanType;
  raw: string;
  detected: ScanDetection[];
}

export interface ScanDetection {
  kind: 'email' | 'phone' | 'url' | 'iban' | 'api_key' | 'btc_addr' | 'eth_addr' | 'plain';
  value: string;
}

/* ============================================================
   Detection regex (Kevin règle "extraction multi-tout") — same
   patterns que CLAUDE.md "Reconnaissance Auto Credentials".
   ============================================================ */

const RE = {
  email: /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i,
  phone: /^(\+?\d{1,3}[\s.-]?)?(\(?\d{1,4}\)?[\s.-]?){2,5}\d{2,4}$/,
  url: /^https?:\/\/[^\s]+$/i,
  iban: /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/,
  api_key_anthropic: /^sk-ant-api\d{2}-[A-Za-z0-9_-]{40,}$/,
  api_key_openai: /^sk-[A-Za-z0-9]{40,}$/,
  api_key_github_pat: /^ghp_[A-Za-z0-9]{36}$/,
  btc_addr: /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/,
  eth_addr: /^0x[a-fA-F0-9]{40}$/,
};

/**
 * Identifie la nature d'un token extrait.
 */
export function detectKind(token: string): ScanDetection['kind'] {
  if (RE.email.test(token)) return 'email';
  if (RE.api_key_anthropic.test(token) || RE.api_key_openai.test(token) || RE.api_key_github_pat.test(token)) return 'api_key';
  if (RE.iban.test(token.replace(/\s/g, ''))) return 'iban';
  if (RE.url.test(token)) return 'url';
  if (RE.btc_addr.test(token)) return 'btc_addr';
  if (RE.eth_addr.test(token)) return 'eth_addr';
  if (RE.phone.test(token) && token.replace(/\D/g, '').length >= 10) return 'phone';
  return 'plain';
}

/**
 * Tokenise le texte (lignes ou unités séparées par espaces) et identifie les tokens utiles.
 */
export function extractDetections(raw: string): ScanDetection[] {
  if (!raw) return [];
  const out: ScanDetection[] = [];
  /* Découpe par lignes, puis par espaces simples si nécessaire */
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const seen = new Set<string>();
  for (const line of lines) {
    /* Test ligne entière d'abord */
    const lineKind = detectKind(line);
    if (lineKind !== 'plain' && !seen.has(line)) {
      out.push({ kind: lineKind, value: line });
      seen.add(line);
      continue;
    }
    /* Sinon découper par tokens */
    const tokens = line.split(/[\s,;]+/).filter((t) => t.length >= 5);
    for (const t of tokens) {
      const k = detectKind(t);
      if (k !== 'plain' && !seen.has(t)) {
        out.push({ kind: k, value: t });
        seen.add(t);
      }
    }
  }
  return out;
}

/**
 * BarcodeDetector wrapper (lazy + feature detect).
 */
export async function scanBarcode(image: ImageBitmap | HTMLImageElement | Blob): Promise<{ value: string; format: string }[] | null> {
  const w = window as Window & { BarcodeDetector?: new (opts?: { formats?: string[] }) => { detect: (src: ImageBitmapSource) => Promise<Array<{ rawValue: string; format: string }>> } };
  if (!w.BarcodeDetector) {
    logger.warn('studios-scan', 'BarcodeDetector API not supported');
    return null;
  }
  try {
    const detector = new w.BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'data_matrix'] });
    const src = image instanceof Blob ? await createImageBitmap(image) : image;
    const results = await detector.detect(src);
    return results.map((r) => ({ value: r.rawValue, format: r.format }));
  } catch (err) {
    logger.warn('studios-scan', 'BarcodeDetector failed', { err });
    return null;
  }
}

/* ============================================================
   History persistence
   ============================================================ */

export function loadHistory(): readonly ScanEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ScanEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function appendHistory(entry: ScanEntry): void {
  try {
    const list = [...loadHistory(), entry];
    const trimmed = list.length > HISTORY_MAX ? list.slice(list.length - HISTORY_MAX) : list;
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  } catch (err) {
    logger.warn('studios-scan', 'history save failed', { err });
  }
}

export function clearHistory(): void {
  localStorage.removeItem(HISTORY_KEY);
}

/* ============================================================
   UI
   ============================================================ */

export function render(rootEl: HTMLElement): void {
  activeScope?.cleanup();
  activeScope = createCleanupScope('studios-scan');
  /* Wire admin feature toggle (Kevin règle 2026-05-04 — ON/OFF tout). */
  const uid = (store.get('user') as { id?: string } | null)?.id ?? 'anon';
  if (!guardFeatureEnabled('studio.scan', rootEl, uid)) return;

  const w = window as Window & { BarcodeDetector?: unknown };
  const supportsBarcode = typeof w.BarcodeDetector !== 'undefined';

  rootEl.innerHTML = `
    <div class="ax-page ax-gs-451">
      <header class="ax-gs-210">
        <h1 class="ax-gs-333">📷 Studio Scan</h1>
        <span class="ax-gs-3">OCR · QR · Barcode</span>
      </header>

      <div class="ax-gs-1">
        <h2 class="ax-gs-452">Scanner une image</h2>
        <input type="file" id="ax-scan-file" aria-label="Sélectionner ou prendre une photo à scanner" accept="image/*" capture="environment" class="ax-gs-359">
        <button class="ax-btn ax-btn-primary ax-gs-352" id="ax-scan-pick">📷 Choisir / prendre photo</button>
        <div id="ax-scan-preview" class="ax-gs-248"></div>
        <div id="ax-scan-status" style="margin-top:8px;color:var(--ax-text-dim);font-size:13px"></div>
      </div>

      <div class="ax-gs-1">
        <h2 class="ax-gs-452">Coller du texte</h2>
        <textarea id="ax-scan-text" placeholder="Colle un texte (email, code, IBAN, URL…)" rows="4" style="width:100%;padding:10px;background:#0a0a14;border:1px solid #333;color:#fff;border-radius:6px"></textarea>
        <button class="ax-btn ax-btn-primary ax-gs-454" id="ax-scan-text-btn">🔍 Analyser</button>
      </div>

      <div id="ax-scan-results" style="background:rgba(201,162,39,0.05);border:1px solid rgba(201,162,39,0.3);border-radius:12px;padding:14px;margin-bottom:16px;display:none">
        <h2 class="ax-gs-452">Détections</h2>
        <div id="ax-scan-detections"></div>
      </div>

      <div class="ax-gs-1">
        <h2 class="ax-gs-452">Historique (${loadHistory().length}/${HISTORY_MAX})</h2>
        <div id="ax-scan-history"></div>
        <button class="ax-btn ax-gs-454" id="ax-scan-clear-history">🗑 Vider</button>
      </div>

      <p class="ax-gs-469">${supportsBarcode ? 'BarcodeDetector natif disponible.' : 'BarcodeDetector non supporté ce navigateur — texte uniquement.'}</p>
      <p class="ax-gs-212"><a href="#studios" class="ax-gs-198">← Retour studios</a></p>
    </div>
  `;
  renderHistory(rootEl);
  attach(rootEl);
}

function renderHistory(rootEl: HTMLElement): void {
  const div = rootEl.querySelector<HTMLDivElement>('#ax-scan-history');
  if (!div) return;
  const list = loadHistory();
  if (list.length === 0) {
    div.innerHTML = '<div class="ax-gs-3">Aucun scan pour l\'instant.</div>';
    return;
  }
  div.innerHTML = list.slice().reverse().map((e) => {
    const dt = new Date(e.ts).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
    return `
      <div style="background:rgba(255,255,255,0.03);border:1px solid #333;border-radius:6px;padding:8px;margin-bottom:6px">
        <div class="ax-gs-2">${escapeHtml(dt)} · ${escapeHtml(e.type)}</div>
        <div style="font-size:13px;color:#c9a227;margin-top:4px;word-break:break-all">${escapeHtml(e.raw.slice(0, 200))}${e.raw.length > 200 ? '…' : ''}</div>
      </div>
    `;
  }).join('');
}

function renderDetections(rootEl: HTMLElement, raw: string, type: ScanType): void {
  const detections = extractDetections(raw);
  const wrapper = rootEl.querySelector<HTMLDivElement>('#ax-scan-results');
  const list = rootEl.querySelector<HTMLDivElement>('#ax-scan-detections');
  if (!wrapper || !list) return;
  wrapper.style.display = 'block';
  if (detections.length === 0) {
    list.innerHTML = `
      <div style="color:var(--ax-text-dim);font-size:13px;margin-bottom:8px">Texte brut :</div>
      <pre style="background:#0a0a14;padding:10px;border-radius:6px;color:#ddd;white-space:pre-wrap;word-break:break-all;font-size:13px">${escapeHtml(raw)}</pre>
      <button class="ax-btn ax-scan-copy ax-gs-454" data-copy="${escapeHtml(raw)}">📋 Copier</button>
    `;
  } else {
    list.innerHTML = detections.map((d) => `
      <div style="background:rgba(255,255,255,0.03);border:1px solid #333;border-radius:6px;padding:10px;margin-bottom:6px">
        <span style="background:rgba(201,162,39,0.2);color:#c9a227;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">${escapeHtml(d.kind.toUpperCase())}</span>
        <div style="margin-top:6px;color:#ddd;word-break:break-all;font-family:monospace;font-size:13px">${escapeHtml(d.value)}</div>
        <button class="ax-btn ax-scan-copy" data-copy="${escapeHtml(d.value)}" style="margin-top:6px;min-height:44px">📋 Copier</button>
      </div>
    `).join('');
  }

  /* Save history */
  const entry: ScanEntry = { ts: Date.now(), type, raw, detected: detections };
  appendHistory(entry);
  renderHistory(rootEl);

  /* Wire copy buttons */
  rootEl.querySelectorAll<HTMLButtonElement>('.ax-scan-copy').forEach((btn) => {
    activeScope?.bind(btn, 'click', () => {
      const txt = btn.dataset['copy'] ?? '';
      navigator.clipboard?.writeText(txt).then(() => {
        haptic.success();
        toast.success('Copié');
      }).catch(() => toast.warn('Copie KO'));
    });
  });
}

function attach(rootEl: HTMLElement): void {
  const fileInput = rootEl.querySelector<HTMLInputElement>('#ax-scan-file');
  const pickBtn = rootEl.querySelector<HTMLButtonElement>('#ax-scan-pick');
  const status = rootEl.querySelector<HTMLDivElement>('#ax-scan-status');
  const preview = rootEl.querySelector<HTMLDivElement>('#ax-scan-preview');

  if (pickBtn && fileInput && activeScope) {
    activeScope.bind(pickBtn, 'click', () => {
      haptic.tap();
      fileInput.click();
    });
    activeScope.bind(fileInput, 'change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        toast.warn('Choisis une image');
        return;
      }
      if (preview) {
        const url = URL.createObjectURL(file);
        /* v13.4.133 audit-grade : DOM API (URL.createObjectURL est safe blob: mais audit strict). */
        preview.textContent = '';
        const img = document.createElement('img');
        img.src = url;
        img.alt = 'aperçu';
        img.style.cssText = 'max-width:100%;border-radius:8px;border:1px solid #333';
        preview.append(img);
      }
      if (status) status.textContent = '⏳ Analyse en cours…';
      void scanBarcode(file).then((codes) => {
        if (codes && codes.length > 0) {
          const first = codes[0];
          if (!first) return;
          if (status) status.textContent = `✅ ${codes.length} code(s) détecté(s) (${first.format})`;
          haptic.success();
          renderDetections(rootEl, codes.map((c) => c.value).join('\n'), 'qr');
        } else {
          if (status) status.textContent = 'Aucun QR/barcode détecté. OCR offline non encore embarqué — colle texte ci-dessous.';
        }
      }).catch((err) => {
        logger.warn('studios-scan', 'scan failed', { err });
        if (status) status.textContent = 'Échec scan. Réessaie.';
      });
    });
  }

  const textBtn = rootEl.querySelector<HTMLButtonElement>('#ax-scan-text-btn');
  if (textBtn && activeScope) {
    activeScope.bind(textBtn, 'click', () => {
      haptic.tap();
      const t = (rootEl.querySelector<HTMLTextAreaElement>('#ax-scan-text')?.value ?? '').trim();
      if (!t) {
        toast.warn('Colle du texte');
        return;
      }
      renderDetections(rootEl, t, 'ocr');
    });
  }

  const clearBtn = rootEl.querySelector<HTMLButtonElement>('#ax-scan-clear-history');
  if (clearBtn && activeScope) {
    activeScope.bind(clearBtn, 'click', () => {
      clearHistory();
      renderHistory(rootEl);
      toast.success('Historique vidé');
    });
  }

  logger.info('studios-scan', 'rendered');
}
