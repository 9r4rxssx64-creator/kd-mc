---
name: apex-generate-xlsx
description: Genere un tableau Microsoft Excel (.xlsx) telechargeable depuis chat Apex. Tableaux, planning, factures multi-lignes, comptabilite.
when_to_use: User demande "tableau Excel", ".xlsx", "feuille de calcul", "comptabilite", "planning export", "facture multi-lignes", "budget", "stats CSV".
model: sonnet
allowed_tools: [generate_xlsx]
---

# Skill : apex-generate-xlsx

## Mission

Produire un fichier .xlsx **avec formules, formats, et multi-feuilles** quand user demande un tableur. Generation via `SheetJS` (`xlsx` lib, CDN lazy).

## Quand l'invoquer (auto)

- "tableau Excel", ".xlsx", "feuille de calcul"
- "budget mensuel/annuel", "comptabilite"
- "factures multi-lignes" (vs facture simple = generate_pdf)
- "export planning CMCteams", "export stats"
- "tableau croise dynamique" (cree pivot)
- "stats CSV" → propose conversion .xlsx avec mise en forme

## Capacites avancees

- **Multi-feuilles** : `[{name:"Janvier", data:[...]}, {name:"Fevrier", data:[...]}]`
- **Formules** : `{f:"SUM(A1:A10)"}` syntaxe Excel native
- **Formats** : devise EUR/USD, %, dates DD/MM/YYYY, decimaux N(2)
- **Conditional formatting** : couleurs cellules selon valeur (rouge si <0, vert si >0)
- **Charts** : embed graphique (bar, line, pie) lie a une plage
- **Tableau croise dynamique** (pivot table) basique
- **Validations donnees** : dropdown listes, plage min/max

## Format input

```json
{
  "filename": "budget_2026.xlsx",
  "sheets": [
    {
      "name": "Janvier",
      "data": [
        ["Categorie", "Recettes", "Depenses", "Solde"],
        ["Salaire", 4500, null, {"f":"B2-C2"}],
        ["Loyer", null, 1200, {"f":"B3-C3"}]
      ],
      "formats": {
        "B:B": "currency_eur",
        "C:C": "currency_eur",
        "D:D": "currency_eur"
      },
      "freeze_header": true
    }
  ]
}
```

## Output

```json
{
  "success": true,
  "filename": "budget_2026.xlsx",
  "blob_url": "blob:...",
  "size_bytes": 18500,
  "sheet_count": 12
}
```

## Anti-patterns

1. **Repondre en markdown table** quand .xlsx demande → INTERDIT
2. **Formules invalides** (`SUMM` au lieu de `SUM`) → valider syntaxe
3. **Donnees PII non chiffrees** dans cells (CB, IBAN long) → masquer
4. **Plus de 1M cells par feuille** (limite Excel)

## References

- Lib : `xlsx` (SheetJS) v0.20+
- Pattern : `apex-ai/v13/services/skills/xlsx-generator.ts`
