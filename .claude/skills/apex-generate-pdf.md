---
name: apex-generate-pdf
description: Genere un fichier PDF telechargeable depuis chat Apex. Factures, devis, contrats signes, rapports formates.
when_to_use: User demande "PDF", "facture", "devis", "contrat a signer", "rapport PDF", "export PDF", "document final".
model: sonnet
allowed_tools: [generate_pdf]
---

# Skill : apex-generate-pdf

## Mission

Produire un PDF **professionnel** avec mise en page riche, polices, images, tableaux, signatures electroniques. Stack : `jsPDF` (text-heavy) + `pdf-lib` (manipulation existant).

## Quand l'invoquer (auto)

- "fais-moi une facture", "devis", "bon de commande"
- "contrat a signer" (avec champ signature)
- "rapport PDF", "export PDF"
- "ticket de caisse", "recu", "attestation"
- "convention", "ordre de mission"
- User a demande Docx mais precise "version finale a envoyer" → propose PDF

## Templates fournis

- `invoice` — facture FR (TVA, mentions legales, RIB)
- `quote` — devis FR (validite, conditions)
- `contract-signed` — contrat avec zone signature DocuSign-like
- `report-standard` — rapport mise en page A4 (couverture + sommaire + corps)
- `certificate` — attestation (encadre dore, sceau)
- `receipt` — ticket caisse
- `bofip-extract` — extrait BOFiP fiscal (auto avec MCP BOFiP)
- `legal-doc` — doc juridique (citation jurisprudence)

## Capacites

- **Multi-pages** avec headers/footers automatiques + pagination
- **Tableaux** avec autoTable plugin
- **Images base64** integrables
- **Polices** custom (Garamond, Helvetica, Roboto)
- **Watermark** ("BROUILLON", "CONFIDENTIEL")
- **Signature electronique** : champ + hash SHA-256 + timestamp
- **Hyperliens** cliquables
- **QR code** integre (RIB, lien tracking)

## Input

```json
{
  "template": "invoice | quote | contract-signed | report-standard | certificate | receipt | bofip-extract | legal-doc | custom",
  "data": { "...champs specifiques..." },
  "options": {
    "watermark": "BROUILLON | CONFIDENTIEL | null",
    "qr_data": "URL ou texte a encoder",
    "logo_base64": "image logo optionnel",
    "footer_text": "Mentions legales bas page"
  }
}
```

## Output

```json
{
  "success": true,
  "filename": "facture_F-2026-042.pdf",
  "blob_url": "blob:...",
  "page_count": 2,
  "size_bytes": 85000
}
```

## Anti-patterns

1. **Markdown brut** quand PDF demande → INTERDIT
2. **Generation server-side** → INTERDIT, tout client-side
3. **Donnees CB completes** dans PDF → masquer (`XXXX XXXX XXXX 1234`)
4. **Polices non embarquees** → toujours embed (rendu identique tous OS)

## References

- Libs : `jspdf` v2.x + `pdf-lib` v1.17+ + `jspdf-autotable`
- Pattern : `apex-ai/v13/services/skills/pdf-generator.ts`
