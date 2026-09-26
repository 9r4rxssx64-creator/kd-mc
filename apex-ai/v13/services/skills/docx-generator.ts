/**
 * APEX v13.4.43 — Skill : Docx Generator (vrai .docx valide Word/LibreOffice).
 *
 * Construit un fichier .docx COMPLET (ZIP Office Open XML) via JSZip CDN.
 * Avant v13.4.43 : produisait du XML brut → Word refusait d'ouvrir.
 * Maintenant : structure ZIP minimale valide :
 *   - [Content_Types].xml
 *   - _rels/.rels
 *   - word/document.xml
 *   - word/_rels/document.xml.rels
 *   - word/styles.xml
 */

import { logger } from '../../core/logger.js';
import { auditLog } from '../observability/audit-log.js';

const JSZIP_CDN = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';

type DocxTemplate =
  | 'letter-formal'
  | 'contract-cdi'
  | 'contract-nda'
  | 'cv-modern'
  | 'meeting-minutes'
  | 'report-monthly'
  | 'custom';

export interface DocxGenerateInput {
  template: DocxTemplate;
  data: Record<string, unknown>;
  customHtml?: string | undefined;
  filename?: string | undefined;
}

export interface DocxGenerateOutput {
  success: boolean;
  filename: string;
  blobUrl: string;
  sizeBytes: number;
  templateUsed: DocxTemplate;
  error?: string | undefined;
}

let jsZipLoaded = false;

async function loadJSZip(): Promise<unknown> {
  const g = globalThis as Record<string, unknown>;
  if (jsZipLoaded && g['JSZip']) return g['JSZip'];
  return new Promise((resolve) => {
    if (document.querySelector(`script[src="${JSZIP_CDN}"]`)) {
      jsZipLoaded = true;
      resolve(g['JSZip']);
      return;
    }
    const script = document.createElement('script');
    script.src = JSZIP_CDN;
    script.async = true;
    script.onload = () => {
      jsZipLoaded = true;
      resolve(g['JSZip']);
    };
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function s(d: Record<string, unknown>, key: string, fallback = ''): string {
  const v = d[key];
  return typeof v === 'string' || typeof v === 'number' ? String(v) : fallback;
}

const TEMPLATES: Record<DocxTemplate, (data: Record<string, unknown>) => string> = {
  'letter-formal': (d) => `${s(d, 'sender_name')}\n${s(d, 'sender_address')}\n\n${s(d, 'recipient_name')}\n${s(d, 'recipient_address')}\n\n${s(d, 'city', 'Monaco')}, le ${new Date().toLocaleDateString('fr-FR')}\n\nObjet : ${s(d, 'subject')}\n\n${s(d, 'body')}\n\nVeuillez agréer, ${s(d, 'recipient_title', 'Madame, Monsieur')}, l'expression de mes salutations distinguées.\n\n${s(d, 'sender_name')}`,
  'contract-cdi': (d) => `CONTRAT DE TRAVAIL À DURÉE INDÉTERMINÉE\n\nEntre :\n${s(d, 'employer_name')}\n${s(d, 'employer_address')}\n\nEt :\n${s(d, 'employee_name')}\n${s(d, 'employee_address')}\n\nARTICLE 1 — ENGAGEMENT\n${s(d, 'employee_name')} est engagé(e) en qualité de ${s(d, 'job_title')} à compter du ${s(d, 'start_date')}.\n\nARTICLE 2 — RÉMUNÉRATION\nRémunération mensuelle brute : ${s(d, 'salary')} €\n\nARTICLE 3 — DURÉE DU TRAVAIL\n${s(d, 'hours_per_week', '35')} heures hebdomadaires.\n\nFait à ${s(d, 'city', 'Monaco')}, le ${new Date().toLocaleDateString('fr-FR')}\n\nL'employeur       Le salarié`,
  'contract-nda': (d) => `ACCORD DE CONFIDENTIALITÉ (NDA)\n\nEntre : ${s(d, 'party_a')}\nEt : ${s(d, 'party_b')}\n\n${s(d, 'scope', 'Le présent accord couvre toutes les informations confidentielles échangées.')}\n\nDurée : ${s(d, 'duration_years', '3')} ans à compter de la signature.\n\nFait à ${s(d, 'city', 'Monaco')}, le ${new Date().toLocaleDateString('fr-FR')}`,
  'cv-modern': (d) => `${s(d, 'full_name')}\n${s(d, 'title')}\n\nEmail : ${s(d, 'email')}\nTel : ${s(d, 'phone')}\n${s(d, 'address')}\n\nPROFIL\n${s(d, 'summary')}\n\nEXPÉRIENCE\n${s(d, 'experience')}\n\nFORMATION\n${s(d, 'education')}\n\nCOMPÉTENCES\n${s(d, 'skills')}\n\nLANGUES\n${s(d, 'languages')}`,
  'meeting-minutes': (d) => `COMPTE RENDU DE RÉUNION\n\nDate : ${s(d, 'date', new Date().toLocaleDateString('fr-FR'))}\nHeure : ${s(d, 'time')}\nLieu : ${s(d, 'location')}\n\nParticipants : ${s(d, 'participants')}\nAbsents : ${s(d, 'absent', '—')}\n\nORDRE DU JOUR\n${s(d, 'agenda')}\n\nDÉCISIONS\n${s(d, 'decisions')}\n\nACTIONS\n${s(d, 'actions')}\n\nPROCHAINE RÉUNION : ${s(d, 'next_meeting', 'À définir')}`,
  'report-monthly': (d) => `RAPPORT MENSUEL — ${s(d, 'period')}\n\n${s(d, 'author')}\n\n1. POINTS CLÉS\n${s(d, 'highlights')}\n\n2. INDICATEURS\n${s(d, 'kpis')}\n\n3. CHALLENGES\n${s(d, 'challenges')}\n\n4. ROADMAP À VENIR\n${s(d, 'roadmap')}\n\n5. RECOMMANDATIONS\n${s(d, 'recommendations')}`,
  custom: (d) => s(d, 'custom_text'),
};

/* Office Open XML — squelettes fichiers ZIP du .docx */
const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOCUMENT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
        <w:sz w:val="22"/>
        <w:szCs w:val="22"/>
        <w:lang w:val="fr-FR"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
  </w:style>
</w:styles>`;

function buildDocumentXml(content: string): string {
  /* Découpe le contenu en paragraphes (1 par ligne). Lignes vides → <w:p/> vide pour conserver layout. */
  const lines = content.split('\n');
  const paragraphs = lines
    .map((line) => {
      if (line.trim().length === 0) return '<w:p/>';
      /* Run : si ligne commence par un titre type "OBJET" / "ARTICLE" → bold */
      const isTitle = /^[A-ZÉÈÀÂÊÎÔÛ\d][A-ZÉÈÀÂÊÎÔÛ\s\d.()—-]{4,}$/.test(line.trim()) && line.length < 80;
      const runProps = isTitle ? '<w:rPr><w:b/></w:rPr>' : '';
      return `<w:p><w:r>${runProps}<w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

export const docxGenerator = {
  async generate(input: DocxGenerateInput): Promise<DocxGenerateOutput> {
    try {
      /* `custom` est toujours une clé de TEMPLATES → `!templateFn` n'est vrai que
       * pour un template inconnu (jamais 'custom'). Le `&& !== 'custom'` était donc
       * une branche morte ; on garde un seul guard qui narrow templateFn → defined,
       * ce qui élimine aussi le `?.`/`?? ''` défensif jamais atteint. */
      const templateFn = TEMPLATES[input.template];
      if (!templateFn) {
        return {
          success: false,
          filename: '',
          blobUrl: '',
          sizeBytes: 0,
          templateUsed: input.template,
          error: `Unknown template: ${input.template}`,
        };
      }

      const content =
        input.template === 'custom' && input.customHtml
          ? input.customHtml
          : templateFn(input.data);

      const JSZipCtor = (await loadJSZip()) as (new () => Record<string, unknown>) | null;
      if (!JSZipCtor) {
        return {
          success: false,
          filename: '',
          blobUrl: '',
          sizeBytes: 0,
          templateUsed: input.template,
          error: 'JSZip CDN load failed',
        };
      }

      const zip = new JSZipCtor() as Record<string, unknown>;
      const file = zip['file'] as (path: string, data: string) => void;
      const folder = zip['folder'] as (name: string) => Record<string, unknown>;

      file('[Content_Types].xml', CONTENT_TYPES_XML);
      const relsFolder = folder('_rels');
      (relsFolder['file'] as (path: string, data: string) => void)('.rels', RELS_XML);

      const wordFolder = folder('word');
      const wordFile = wordFolder['file'] as (path: string, data: string) => void;
      wordFile('document.xml', buildDocumentXml(content));
      wordFile('styles.xml', STYLES_XML);
      const wordRels = wordFolder['folder'] as (name: string) => Record<string, unknown>;
      const wordRelsFolder = wordRels('_rels');
      (wordRelsFolder['file'] as (path: string, data: string) => void)('document.xml.rels', DOCUMENT_RELS_XML);

      const generateAsync = zip['generateAsync'] as (opts: Record<string, unknown>) => Promise<Blob>;
      const blob = await generateAsync({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        compression: 'DEFLATE',
      });
      const blobUrl = URL.createObjectURL(blob);

      const filename =
        input.filename ??
        `${input.template}_${new Date().toISOString().slice(0, 10)}.docx`;

      await auditLog.record('skill.docx.generated', {
        details: { template: input.template, size: blob.size, filename },
      });

      logger.info('skill.docx', `Generated ${filename} (${blob.size} bytes, valid .docx ZIP)`);

      return {
        success: true,
        filename,
        blobUrl,
        sizeBytes: blob.size,
        templateUsed: input.template,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn('skill.docx', 'generate failed', { err: errMsg });
      return {
        success: false,
        filename: '',
        blobUrl: '',
        sizeBytes: 0,
        templateUsed: input.template,
        error: errMsg,
      };
    }
  },

  listTemplates(): readonly DocxTemplate[] {
    return Object.keys(TEMPLATES) as DocxTemplate[];
  },
};
