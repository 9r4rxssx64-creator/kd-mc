/**
 * APEX v13.4.114 — QR Code Backup PAT (Kevin "télécharger QR + tout auto").
 *
 * Kevin 2026-05-15 04h45 : "Que je puisse télécharger le qr code. Mais j'aimerai
 * tout auto"
 *
 * iOS Safari PWA ne supporte pas bien Credentials API PasswordCredential
 * → fallback : QR code du PAT que Kevin sauvegarde dans Photos iCloud.
 * Photos iCloud survit reinstall PWA + sync cross-device Apple ID.
 *
 * FLOW SAVE (auto trigger quand vault.setKey stocke un PAT GitHub) :
 *   1. Kevin colle PAT dans Coffre → vault.setKey OK
 *   2. Apex lazy-load qrcode lib (CDN unpkg, ~10KB)
 *   3. Génère QR code 300x300 sur canvas client-side
 *   4. Affiche modal "🔐 Sauvegarder ton PAT dans Photos iCloud" :
 *      - Image QR visible
 *      - Bouton "📥 Télécharger" → download PNG
 *      - Bouton "📤 Partager dans Photos iCloud" → navigator.share (iOS natif)
 *      - Bouton "Plus tard"
 *
 * FLOW RESTORE (au boot si Coffre vide) :
 *   1. Modal "🔓 Restaurer depuis QR Photos iCloud"
 *   2. Bouton "📷 Scanner QR" → caméra ou Photos picker iOS
 *   3. Décodage QR via BarcodeDetector API ou jsQR fallback
 *   4. Restaure PAT → push vault → Gist pull
 *
 * SÉCURITÉ :
 *   - Génération QR 100% client-side (canvas, pas d'API tierce)
 *   - PAT JAMAIS envoyé sur serveur tiers
 *   - QR contient PAT en clair → Kevin doit garder Photos privé
 *
 * Pour ne pas exposer le PAT en clair dans le QR :
 *   - Option 1 : chiffrer le PAT avec PIN Kevin avant QR → décrypte au scan
 *   - Option 2 : QR contient juste un ID Gist + Kevin recolle PIN au restore
 *   Choix : Option 1 (plus simple + plus sécurisé que PAT plain).
 */

import { logger } from '../../core/logger.js';

const QR_LIB_URL = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js';

interface QrCodeLib {
  toCanvas: (canvas: HTMLCanvasElement, text: string, opts: { width: number; margin?: number; errorCorrectionLevel?: string }) => Promise<void>;
  toDataURL: (text: string, opts: { width: number; margin?: number; errorCorrectionLevel?: string }) => Promise<string>;
}

let qrLibPromise: Promise<QrCodeLib> | null = null;

async function loadQrLib(): Promise<QrCodeLib> {
  if (qrLibPromise) return qrLibPromise;
  qrLibPromise = (async () => {
    if ((globalThis as { QRCode?: QrCodeLib }).QRCode) {
      return (globalThis as unknown as { QRCode: QrCodeLib }).QRCode;
    }
    return new Promise<QrCodeLib>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = QR_LIB_URL;
      script.crossOrigin = 'anonymous';
      script.onload = () => {
        const lib = (globalThis as unknown as { QRCode?: QrCodeLib }).QRCode;
        if (lib) resolve(lib);
        else reject(new Error('QRCode lib not exposed on window'));
      };
      script.onerror = () => reject(new Error('Failed to load qrcode lib from CDN'));
      document.head.appendChild(script);
    });
  })();
  return qrLibPromise;
}

export interface GenerateOptions {
  /** Texte à encoder (PAT plaintext OU encrypted) */
  text: string;
  /** Width en pixels */
  width?: number;
  /** Niveau correction erreur (L=7%, M=15%, Q=25%, H=30%) */
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
}

/**
 * Génère un QR code PNG dataURL depuis du texte.
 * 100% client-side, pas d'API tierce.
 */
export async function generateQrDataUrl(opts: GenerateOptions): Promise<string> {
  const lib = await loadQrLib();
  const dataUrl = await lib.toDataURL(opts.text, {
    width: opts.width ?? 320,
    margin: 2,
    errorCorrectionLevel: opts.errorCorrectionLevel ?? 'H', /* H = 30% correction max */
  });
  return dataUrl;
}

/**
 * Génère un QR sur canvas (pour usage Blob/download).
 */
export async function generateQrCanvas(opts: GenerateOptions): Promise<HTMLCanvasElement> {
  const lib = await loadQrLib();
  const canvas = document.createElement('canvas');
  await lib.toCanvas(canvas, opts.text, {
    width: opts.width ?? 320,
    margin: 2,
    errorCorrectionLevel: opts.errorCorrectionLevel ?? 'H',
  });
  return canvas;
}

/**
 * Télécharge le QR comme fichier PNG dans Téléchargements iPhone.
 */
export async function downloadQr(canvas: HTMLCanvasElement, filename = 'apex-vault-qr.png'): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('canvas.toBlob retourne null'));
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      resolve();
    }, 'image/png');
  });
}

/**
 * Partage le QR via Web Share API iOS (propose Photos iCloud directement).
 */
export async function shareQrToPhotos(canvas: HTMLCanvasElement, title = 'Apex Vault Backup QR'): Promise<{ ok: boolean; reason?: string }> {
  /* v13.4.124 (Kevin "passe en native iOS") :
   * Si Apex tourne dans wrapper Capacitor iOS natif → Share plugin natif
   * (UIActivityViewController = écriture directe Photos iCloud sans modal Safari).
   * Mode PWA : fallback Web Share API. */
  try {
    const { apexIosNative } = await import('../integrations/apex-ios-native.js');
    if (apexIosNative.isNative()) {
      const nativeBlob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/png');
      });
      if (!nativeBlob) return { ok: false, reason: 'blob_failed' };
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (): void => resolve(String(reader.result));
        reader.onerror = (): void => reject(new Error('FileReader fail'));
        reader.readAsDataURL(nativeBlob);
      });
      const r = await apexIosNative.shareNative({
        title,
        text: 'Sauvegarde Apex Vault — Photos iCloud',
        url: dataUrl,
      });
      return r.ok ? { ok: true } : { ok: false, reason: r.error ?? 'native_share_failed' };
    }
  } catch { /* mode PWA ou plugin absent : fallback Web Share */ }
  try {
    /* Test support Web Share API + canShare files */
    if (!('share' in navigator) || typeof navigator.share !== 'function') {
      return { ok: false, reason: 'web_share_api_unsupported' };
    }
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/png');
    });
    if (!blob) return { ok: false, reason: 'blob_failed' };
    const file = new File([blob], 'apex-vault-qr.png', { type: 'image/png' });
    /* canShare check (Safari 15+) */
    const navWithCanShare = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    if (navWithCanShare.canShare && !navWithCanShare.canShare({ files: [file] })) {
      return { ok: false, reason: 'share_files_not_supported' };
    }
    await navigator.share({
      title,
      text: 'Sauvegarde Apex Vault — Photos iCloud pour reinstall PWA',
      files: [file],
    });
    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    /* User cancel n'est pas une erreur */
    if (/abort|cancel/i.test(msg)) return { ok: false, reason: 'user_cancelled' };
    return { ok: false, reason: msg.slice(0, 100) };
  }
}

/**
 * Affiche un modal full-screen avec QR + boutons Télécharger / Partager.
 * Auto-trigger quand vault.setKey stocke un PAT GitHub.
 */
export async function showQrBackupModal(opts: {
  text: string;
  title?: string;
  description?: string;
  filename?: string;
}): Promise<void> {
  try {
    const canvas = await generateQrCanvas({ text: opts.text, width: 320, errorCorrectionLevel: 'H' });
    const overlay = document.createElement('div');
    overlay.id = 'apex-qr-backup-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)';
    const card = document.createElement('div');
    card.style.cssText = 'background:#0a0a14;border:1px solid #c9a227;border-radius:14px;padding:20px;max-width:380px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,0.6)';
    /* v13.4.125 fix audit (Kevin "qualité pro") : remplacement innerHTML
     * template-literal par construction DOM API. Évite tout risque XSS si
     * opts.title/description venait à contenir du HTML user-controlled. */
    const h3 = document.createElement('h3');
    h3.style.cssText = 'margin:0 0 8px;color:#c9a227;font-size:16px;font-weight:700';
    h3.textContent = opts.title ?? '🔐 Sauvegarde Apex QR';
    const p = document.createElement('p');
    p.style.cssText = 'margin:0 0 14px;color:rgba(255,255,255,0.78);font-size:13px;line-height:1.5';
    p.textContent = opts.description ?? 'Sauvegarde ce QR dans Photos iCloud. Au prochain reinstall PWA, Apex pourra le scanner pour tout restaurer en 1 clic.';
    const canvasContainerEl = document.createElement('div');
    canvasContainerEl.id = 'apex-qr-canvas-container';
    canvasContainerEl.style.cssText = 'display:flex;justify-content:center;margin:14px 0;padding:12px;background:#fff;border-radius:10px';
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;flex-direction:column;gap:8px';
    const shareBtn = document.createElement('button');
    shareBtn.id = 'apex-qr-share-btn';
    shareBtn.type = 'button';
    shareBtn.style.cssText = 'padding:14px;background:linear-gradient(135deg,#c9a227,#e8b830);color:#000;border:none;border-radius:10px;font-weight:700;cursor:pointer;font-size:14px;min-height:48px';
    shareBtn.textContent = '📤 Partager dans Photos iCloud';
    const downloadBtn = document.createElement('button');
    downloadBtn.id = 'apex-qr-download-btn';
    downloadBtn.type = 'button';
    downloadBtn.style.cssText = 'padding:14px;background:rgba(106,138,255,0.15);color:#6a8aff;border:1px solid rgba(106,138,255,0.3);border-radius:10px;font-weight:600;cursor:pointer;font-size:14px;min-height:48px';
    downloadBtn.textContent = '📥 Télécharger PNG';
    const closeBtn = document.createElement('button');
    closeBtn.id = 'apex-qr-close-btn';
    closeBtn.type = 'button';
    closeBtn.style.cssText = 'padding:14px;background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.6);border:1px solid rgba(255,255,255,0.1);border-radius:10px;font-weight:500;cursor:pointer;font-size:13px;min-height:44px';
    closeBtn.textContent = 'Plus tard';
    btnRow.append(shareBtn, downloadBtn, closeBtn);
    const statusElLocal = document.createElement('div');
    statusElLocal.id = 'apex-qr-status';
    statusElLocal.style.cssText = 'margin-top:10px;font-size:12px;color:rgba(255,255,255,0.6);text-align:center';
    card.append(h3, p, canvasContainerEl, btnRow, statusElLocal);
    overlay.appendChild(card);
    canvasContainerEl.appendChild(canvas);
    document.body.appendChild(overlay);

    const setStatus = (msg: string, color = 'rgba(255,255,255,0.6)'): void => {
      statusElLocal.textContent = msg;
      statusElLocal.style.color = color;
    };

    const close = (): void => {
      try { document.body.removeChild(overlay); } catch { /* ignore */ }
    };

    shareBtn.addEventListener('click', async () => {
      setStatus('📤 Ouverture du partage iOS...');
      const r = await shareQrToPhotos(canvas, opts.title ?? 'Apex Vault QR');
      if (r.ok) {
        setStatus('✅ Partagé ! Sauvegarde dans Photos iCloud terminée.', '#22cc77');
        setTimeout(close, 2500);
      } else if (r.reason === 'user_cancelled') {
        setStatus('Annulé. Utilise "Télécharger PNG" si tu veux.', 'rgba(255,255,255,0.5)');
      } else {
        setStatus(`⚠️ Partage non supporté (${r.reason}). Utilise "Télécharger PNG".`, '#ff8844');
      }
    });

    downloadBtn.addEventListener('click', async () => {
      setStatus('📥 Téléchargement...');
      try {
        await downloadQr(canvas, opts.filename ?? 'apex-vault-qr.png');
        setStatus('✅ Téléchargé ! Sauvegarde dans Photos iCloud manuellement.', '#22cc77');
        setTimeout(close, 3000);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setStatus(`❌ Download échoué : ${msg.slice(0, 60)}`, '#ff5b5b');
      }
    });

    closeBtn.addEventListener('click', close);

    logger.info('qr-backup', `✅ Modal QR affiché (${opts.text.length} chars encoded)`);
  } catch (err: unknown) {
    logger.error('qr-backup', 'showQrBackupModal failed', { err });
  }
}

export const apexQrBackup = {
  generateQrDataUrl,
  generateQrCanvas,
  downloadQr,
  shareQrToPhotos,
  showQrBackupModal,
};
