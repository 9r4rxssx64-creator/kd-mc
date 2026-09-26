/**
 * APEX v13.4.12 — Studio XLSX (vue UI).
 *
 * Tableur simple : import CSV ou saisie manuelle → export .xlsx.
 */

import { escapeHtml } from '../../../core/escape-html.js';
import { logger } from '../../../core/logger.js';
import { xlsxGenerator, type XlsxCellValue } from '../../../services/skills/xlsx-generator.js';
import { toast } from '../../../ui/toast.js';

export function render(rootEl: HTMLElement): void {
  rootEl.innerHTML = `
    <div class="ax-gs-115">
      <h1 class="ax-gs-289">📈 Studio Excel — Tableau .xlsx</h1>
      <p class="ax-gs-199">Génère un tableau Excel multi-feuilles. Colle données CSV ou saisis manuellement.</p>

      <label class="ax-gs-473">
        <span class="ax-gs-15">Nom fichier</span>
        <input id="xlsx-filename" type="text" value="tableau.xlsx" class="ax-gs-463">
      </label>

      <label class="ax-gs-473">
        <span class="ax-gs-15">Nom de la feuille</span>
        <input id="xlsx-sheetname" type="text" value="Sheet1" class="ax-gs-463">
      </label>

      <label class="ax-gs-473">
        <span class="ax-gs-15">Données (CSV, 1ère ligne = headers)</span>
        <textarea id="xlsx-data" rows="10" placeholder="Catégorie,Recettes,Dépenses&#10;Salaire,4500,0&#10;Loyer,0,1200&#10;Courses,0,400" style="width:100%;padding:10px;background:#1e293b;border:1px solid #334155;border-radius:6px;color:#f1f5f9;font-size:16px;font-family:monospace;resize:vertical">Catégorie,Recettes,Dépenses
Salaire,4500,0
Loyer,0,1200
Courses,0,400</textarea>
      </label>

      <label class="ax-gs-403">
        <input type="checkbox" id="xlsx-freeze" checked> <span class="ax-gs-260">Figer la 1ère ligne (headers)</span>
      </label>

      <button id="xlsx-generate" class="ax-gs-465">
        ⬇️ Générer le .xlsx
      </button>

      <div id="xlsx-result" class="ax-gs-256"></div>
    </div>
  `;

  rootEl.querySelector('#xlsx-generate')?.addEventListener('click', async () => {
    const filename = (rootEl.querySelector('#xlsx-filename') as HTMLInputElement)?.value || 'tableau.xlsx';
    const sheetName = (rootEl.querySelector('#xlsx-sheetname') as HTMLInputElement)?.value || 'Sheet1';
    const csvText = (rootEl.querySelector('#xlsx-data') as HTMLTextAreaElement)?.value ?? '';
    const freeze = (rootEl.querySelector('#xlsx-freeze') as HTMLInputElement)?.checked ?? true;

    /* Parse CSV (split sur virgule simple — pas guillemets pour cette version) */
    const rows: XlsxCellValue[][] = csvText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) =>
        line.split(',').map((cell) => {
          const trimmed = cell.trim();
          const num = Number(trimmed);
          return !isNaN(num) && trimmed !== '' ? num : trimmed;
        }),
      );

    if (rows.length === 0) {
      toast.error('Aucune donnée à exporter');
      return;
    }

    toast.info('Génération en cours...');
    try {
      const result = await xlsxGenerator.generate({
        filename,
        sheets: [
          {
            name: sheetName,
            data: rows,
            freezeHeader: freeze,
          },
        ],
      });

      const resEl = rootEl.querySelector('#xlsx-result');
      if (!resEl) return;
      if (result.success) {
        resEl.innerHTML = `
          <div class="ax-gs-47">
            <p class="ax-gs-466">✅ ${escapeHtml(result.filename)} (${result.sheetCount} feuille, ${(result.sizeBytes / 1024).toFixed(1)} Ko)</p>
            <a href="${result.blobUrl}" download="${escapeHtml(result.filename)}" class="ax-gs-467">⬇️ Télécharger</a>
          </div>`;
        toast.success(`✅ ${result.filename}`);
      } else {
        resEl.innerHTML = `<p class="ax-gs-257">❌ ${escapeHtml(result.error ?? 'Erreur')}</p>`;
        toast.error(`❌ ${result.error ?? 'Erreur'}`);
      }
    } catch (err) {
      logger.warn('studio-xlsx', 'failed', { err });
      toast.error(`❌ ${err instanceof Error ? err.message : 'Erreur'}`);
    }
  });
}
