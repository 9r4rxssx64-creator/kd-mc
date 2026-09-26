# Boîte à outils agents — contenu récupéré des 6 dépôts du tableau

Ce dossier est **rempli automatiquement**. Ne rien écrire ici à la main : tout serait écrasé
au prochain passage.

- **D'où ça vient** : le tableau « Une Notion = Un Projet » filmé par Kevin (2026-08-06).
- **Qui le remplit** : le workflow [`agent-toolkit-sync.yml`](../../.github/workflows/agent-toolkit-sync.yml)
  (bouton « Run workflow » + passage automatique le 1er de chaque mois), qui exécute
  [`tools/agent-toolkit/sync.mjs`](../../tools/agent-toolkit/sync.mjs).
- **Ce qui est copié** : uniquement du **texte** (`.md`, `.json`, `.txt`, `LICENSE`), avec un
  plafond par fichier et par dépôt. Jamais de binaire, jamais de `node_modules`, jamais de script
  exécutable venant d'un tiers.
- **Traçabilité** : `MANIFEST.json` donne pour chaque dépôt son URL, le **SHA exact** du commit
  récupéré, la licence et la date.

| Dossier | Notion | Dépôt d'origine |
|---|---|---|
| `skills/` | Ingénieur | https://github.com/anthropics/skills |
| `gbrain/` | Mémoire | https://github.com/garrytan/gbrain |
| `awesome-design-skills/` | Design | https://github.com/bergside/awesome-design-skills |
| `rtk/` | Économie de jetons | https://github.com/rtk-ai/rtk |
| `meridian-company-os/` | Entreprise | https://github.com/codejunkie99/meridian-company-os |
| `free-llm-api-resources/` | LLM gratuit | https://github.com/jeis4wpi/free-llm-api-resources |

Mode d'emploi côté agent : [`.claude/skills/agent-toolkit/SKILL.md`](../../.claude/skills/agent-toolkit/SKILL.md).
Côté Apex : catalogue `apex-ai/v13/data/apex-plugins-catalog.ts` (tag `agent-toolkit`).

Chaque dépôt reste sous **sa propre licence** (rappelée dans `MANIFEST.json` et dans le `LICENSE`
copié quand il existe). On ne redistribue que de la documentation.
