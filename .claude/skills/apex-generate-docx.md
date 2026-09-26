---
name: apex-generate-docx
description: Genere un document Microsoft Word (.docx) telechargeable depuis chat Apex. Lettres, contrats, CV, comptes-rendus, rapports — avec entete/pied/styles pro.
when_to_use: User demande "lettre", "contrat", "CV", "compte-rendu", "rapport", "document Word", ".docx", ou tout livrable redactionnel formel.
model: sonnet
allowed_tools: [generate_docx]
---

# Skill : apex-generate-docx

## Mission

Apex doit produire un fichier .docx **telechargeable directement** dans le chat, JAMAIS un texte markdown brut quand l'utilisateur demande un document formel. Production via `docxtemplater` + `pizzip` (lazy CDN).

## Quand l'invoquer (auto)

Apex DOIT appeler `generate_docx` automatiquement sans demander si user dit :

- "fais-moi une lettre", "ecris-moi un courrier"
- "redige un contrat", "NDA", "CDI", "CDD"
- "genere mon CV", "curriculum vitae"
- "compte-rendu reunion", "PV", "CR"
- "rapport mensuel", "synthese"
- Toute mention `.docx` ou "format Word"

## Templates fournis (pre-rempli)

- `letter-formal.docx` — lettre administrative francaise (en-tete + corps + formule de politesse)
- `contract-cdi.docx` — CDI conforme Code du travail FR
- `contract-nda.docx` — NDA bilingue FR/EN
- `cv-modern.docx` — CV moderne 1-2 pages
- `meeting-minutes.docx` — CR reunion structuree
- `report-monthly.docx` — rapport mensuel avec sections

## Format input attendu

```json
{
  "template": "letter-formal | contract-cdi | contract-nda | cv-modern | meeting-minutes | report-monthly | custom",
  "data": {
    "recipient_name": "...",
    "subject": "...",
    "body": "...",
    "...": "champs specifiques au template"
  },
  "custom_html": "Si template=custom, HTML simple converti en docx"
}
```

## Format output

```json
{
  "success": true,
  "filename": "lettre_resiliation_2026-05-14.docx",
  "blob_url": "blob:https://apex.../uuid",
  "size_bytes": 12500,
  "template_used": "letter-formal"
}
```

Le `blob_url` est valable session, Apex affiche **bouton telecharger** dans le chat.

## Securite + RGPD

- Aucune donnee envoyee au serveur — generation 100% client-side
- Templates sans macros (anti malware)
- Donnees PII non loggees (juste filename + size)
- User peut effacer le blob via `URL.revokeObjectURL`

## Anti-patterns interdits

1. **Repondre en markdown brut** quand un docx est demande → JAMAIS, toujours produire le fichier
2. **Demander si l'utilisateur veut un docx** quand le contexte est clair → JAMAIS, agir directement
3. **Generer .doc legacy** au lieu de .docx → INTERDIT (incompatible Office 2007+)
4. **Inclure macros VBA** → INTERDIT (risque securite)
5. **Stocker les data PII en local** au-dela de la session → INTERDIT (RGPD)

## Validation

```javascript
// Test rapide depuis console Apex
await axTools.execute('generate_docx', {
  template: 'letter-formal',
  data: { recipient_name: 'Test', subject: 'Test', body: 'Bonjour' }
});
```

Attendu : `{success:true, blob_url:"blob:...", size_bytes>1000}`.

## References

- Lib : `docxtemplater` v3.x (CDN jsdelivr lazy)
- Spec : Office Open XML (.docx)
- Pattern Apex : `apex-ai/v13/services/skills/docx-generator.ts`
