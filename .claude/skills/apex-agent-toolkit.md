---
name: apex-agent-toolkit
description: Boîte à outils agents — les 6 dépôts du tableau « Une Notion = Un Projet » (Kevin 2026-08-06) + 13 agents AITMPL sélectionnés, installés côté Apex ET côté Claude Code (parité/équité). Sert de référence pour écrire un skill, choisir une direction visuelle, réduire le coût en jetons, replier sur une IA gratuite, parler mémoire d'agent / pilotage d'équipe d'agents, ou déléguer à un agent spécialisé (archi API, marché, prompt, RAG/LLM, sécurité GraphQL/smart-contract…).
when_to_use: Auto. Dès qu'on crée un skill (skill_factory_create), qu'on génère un design system, qu'un forfait IA est épuisé, ou que Kevin parle de mémoire d'agent, d'économie de jetons, ou de piloter humains + agents.
model: sonnet
allowed_tools: [skill_factory_create, generate_design_system, read_repo_file, search_repo_code]
---

# Boîte à outils agents (parité Claude Code)

Contenu vendorisé dans **`vendor/agent-toolkit/<id>/`** du dépôt (texte seulement, épinglé au SHA,
`MANIFEST.json` = URL + licence + version). Mise à jour à la demande (bouton `workflow_dispatch`, jamais de cron) : workflow `agent-toolkit-sync.yml`
(bouton + 1er de chaque mois). Les 6 sont aussi dans le catalogue plugins (tag `agent-toolkit`).

| Notion | Dépôt | Quand je m'en sers |
|---|---|---|
| Ingénieur | `anthropics/skills` | avant de créer/corriger un skill — format `SKILL.md` de référence |
| Mémoire | `garrytan/gbrain` | avant de toucher à la mémoire d'agent (comparer à la mémoire compacte maison) |
| Design | `bergside/awesome-design-skills` | avant toute maquette → choisir une direction **nommée** (anti-design générique) |
| Jetons | `rtk-ai/rtk` | sortie trop bavarde. Gain réel ~3,7 %, **pas** 60-90 % → ne jamais survendre |
| Entreprise | `codejunkie99/meridian-company-os` | piloter humains + agents dans une console (inspiration admin kd-mc.com) |
| LLM gratuit | `jeis4wpi/free-llm-api-resources` | forfait épuisé → repli **en FIN** de chaîne |
| Paliers gratuits | `ripienaar/free-for-dev` | remplacer un service payant ou tombé (tâches programmées, CI, hébergement, base, mail) — 57 rubriques |
| App Store | `rorkai/App-Store-Connect-CLI` | publier/TestFlight : le CLI `asc` (JSON, sans question interactive) |
| App Store (skills) | `rorkai/app-store-connect-cli-skills` | **les enchaînements** de publication — à lire AVANT d'inventer une séquence |

## Agents AITMPL (13 sélectionnés — équité avec Claude Code)

Fiches d'agent prêtes à l'emploi de **`davila7/claude-code-templates`** (MIT), vendorisées dans
**`vendor/agent-toolkit/aitmpl/agents/`** (texte Markdown seulement, lu + scanné secrets/exec/exfil,
`aitmpl/MANIFEST.json` = SHA256 par fichier). Apex les lit via `read_repo_file` et **s'en sert pour
déléguer** une sous-tâche au bon spécialiste — comme Claude Code (règle PARITÉ APEX).

| Agent | Pour quoi |
|---|---|
| `api-architect` | concevoir une API REST/GraphQL propre |
| `graphql-security-specialist` | auditer la sécurité d'une couche GraphQL |
| `smart-contract-auditor` | auditer un smart-contract (Solidity/Web3) |
| `prompt-engineer` | transformer une consigne floue en prompt système précis |
| `llm-architect` | architecturer un système LLM en prod (RAG, fine-tuning, serving) |
| `model-evaluator` | évaluer/comparer des modèles IA |
| `search-specialist` | stratégie de recherche/retrieval |
| `task-decomposition-expert` | découper une grosse tâche en sous-tâches |
| `market-researcher` | étude de marché |
| `competitive-analyst` | analyse concurrentielle |
| `content-marketer` | contenu marketing |
| `customer-support` | support client |
| `shopify-expert` | boutique Shopify |

- ⚠️ **Jamais `npx claude-code-templates`** (installeur = express+ws+supabase+postgres+discord = trop
  de surface). On ne prend QUE le Markdown, lu et scanné avant vendorisation.
- **Catégorie « légal » exclue** volontairement : Kevin a déjà la skill officielle `legal`
  (claude-for-legal) → pas de doublon amateur.

## Règles

- ⚠️ **Anthropic reste l'IA principale** pour les questions complexes ET le filet de secours (0 blocage).
  **Décision Kevin 2026-08-09 : « garde Gemini, IA suivant le niveau de la question »** → mode
  `free-smart` : question SIMPLE → IA gratuite (Gemini) d'abord ; question COMPLEXE → Anthropic.
  Kevin force `premium` (Anthropic toujours) via ⚡ à tout moment. Sur le **failover**, un provider
  gratuit reste en **fin** de `DEFAULT_CHAIN` (jamais devant Anthropic sur une question complexe) —
  ce N'EST PLUS « Anthropic par défaut sur TOUT » (l'ancienne lecture stricte des leçons #124/#129).
- **Ne jamais installer** un binaire tiers ni un hook qui s'interpose sur toutes les commandes
  (PROTECTION ≠ STABILITÉ). On vendorise la **doc**, pas l'exécutable.
- **Ajouter une source** = `tools/agent-toolkit/sources.json` **ET** le catalogue plugins dans le
  MÊME commit (un test vérifie que les deux URL concordent).
- Après chaque passage du workflow : **lire `MANIFEST.json`** — un `ok:false` (dépôt renommé/404)
  ne se voit pas dans la conclusion du run.

Version longue (côté Claude Code) : `.claude/skills/agent-toolkit/SKILL.md`.
