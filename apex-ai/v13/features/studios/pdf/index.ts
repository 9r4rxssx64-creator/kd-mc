/**
 * APEX v13.4.12 — Studio PDF (vue UI).
 *
 * Formulaire pour générer .pdf (facture, devis, etc.) via jsPDF.
 */

import { escapeHtml } from '../../../core/escape-html.js';
import { logger } from '../../../core/logger.js';
import { pdfGenerator, type PdfGenerateInput } from '../../../services/skills/pdf-generator.js';
import { toast } from '../../../ui/toast.js';

const TEMPLATES = [
  { id: 'invoice', label: 'Facture', emoji: '💰' },
  { id: 'quote', label: 'Devis', emoji: '📋' },
  { id: 'contract-signed', label: 'Contrat à signer', emoji: '✍️' },
  { id: 'report-standard', label: 'Rapport', emoji: '📊' },
  { id: 'certificate', label: 'Certificat', emoji: '🏆' },
  { id: 'receipt', label: 'Reçu', emoji: '🧾' },
  { id: 'custom', label: 'Texte libre', emoji: '📝' },
] as const;

export function render(rootEl: HTMLElement): void {
  rootEl.innerHTML = `
    <div class="ax-gs-169">
      <h1 class="ax-gs-289">📑 Studio PDF</h1>
      <p class="ax-gs-199">Génère un PDF pro téléchargeable.</p>

      <label class="ax-gs-403">
        <span class="ax-gs-15">Type de document</span>
        <select id="pdf-template" class="ax-gs-464">
          ${TEMPLATES.map((t) => `<option value="${t.id}">${t.emoji} ${escapeHtml(t.label)}</option>`).join('')}
        </select>
      </label>

      <div class="ax-gs-113">
        <label class="ax-gs-472">
          <span class="ax-gs-16">N° / Référence</span>
          <input id="pdf-number" type="text" placeholder="F-2026-001" class="ax-gs-463">
        </label>
        <label class="ax-gs-472">
          <span class="ax-gs-16">Client / Destinataire</span>
          <input id="pdf-client" type="text" class="ax-gs-463">
        </label>
        <label class="ax-gs-472">
          <span class="ax-gs-16">Adresse client</span>
          <input id="pdf-address" type="text" class="ax-gs-463">
        </label>
        <label class="ax-gs-472">
          <span class="ax-gs-16">Lignes (1 par ligne : "description | qty | prix HT")</span>
          <textarea id="pdf-items" rows="4" placeholder="Service A | 1 | 500&#10;Service B | 2 | 250" class="ax-gs-462"></textarea>
        </label>
        <label class="ax-gs-472">
          <span class="ax-gs-16">Watermark (optionnel)</span>
          <select id="pdf-watermark" class="ax-gs-463">
            <option value="">Aucun</option>
            <option value="BROUILLON">BROUILLON</option>
            <option value="CONFIDENTIEL">CONFIDENTIEL</option>
          </select>
        </label>
      </div>

      <button id="pdf-generate" class="ax-gs-465">
        ⬇️ Générer le PDF
      </button>

      <div id="pdf-result" class="ax-gs-256"></div>
    </div>
  `;

  rootEl.querySelector('#pdf-generate')?.addEventListener('click', async () => {
    const template = (rootEl.querySelector('#pdf-template') as HTMLSelectElement)?.value ?? 'invoice';
    const number = (rootEl.querySelector('#pdf-number') as HTMLInputElement)?.value ?? '';
    const clientName = (rootEl.querySelector('#pdf-client') as HTMLInputElement)?.value ?? '';
    const clientAddress = (rootEl.querySelector('#pdf-address') as HTMLInputElement)?.value ?? '';
    const itemsText = (rootEl.querySelector('#pdf-items') as HTMLTextAreaElement)?.value ?? '';
    const watermark = (rootEl.querySelector('#pdf-watermark') as HTMLSelectElement)?.value ?? '';

    const items = itemsText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split('|').map((p) => p.trim());
        return {
          description: parts[0] ?? '',
          quantity: parseFloat(parts[1] ?? '1') || 1,
          unit_price: parseFloat(parts[2] ?? '0') || 0,
        };
      });

    toast.info('Génération en cours...');
    try {
      const result = await pdfGenerator.generate({
        template: template as PdfGenerateInput['template'],
        data: {
          number,
          client_name: clientName,
          client_address: clientAddress,
          items,
          date: new Date().toLocaleDateString('fr-FR'),
        },
        ...(watermark
          ? { options: { watermark: watermark as 'BROUILLON' | 'CONFIDENTIEL' } }
          : {}),
      });

      const resEl = rootEl.querySelector('#pdf-result');
      if (!resEl) return;
      if (result.success) {
        resEl.innerHTML = `
          <div class="ax-gs-47">
            <p class="ax-gs-466">✅ ${escapeHtml(result.filename)} (${result.pageCount} page${result.pageCount > 1 ? 's' : ''}, ${(result.sizeBytes / 1024).toFixed(1)} Ko)</p>
            <a href="${result.blobUrl}" download="${escapeHtml(result.filename)}" class="ax-gs-467">⬇️ Télécharger</a>
          </div>`;
        toast.success(`✅ ${result.filename}`);
      } else {
        resEl.innerHTML = `<p class="ax-gs-257">❌ ${escapeHtml(result.error ?? 'Erreur')}</p>`;
        toast.error(`❌ ${result.error ?? 'Erreur'}`);
      }
    } catch (err) {
      logger.warn('studio-pdf', 'failed', { err });
      toast.error(`❌ ${err instanceof Error ? err.message : 'Erreur'}`);
    }
  });
}
