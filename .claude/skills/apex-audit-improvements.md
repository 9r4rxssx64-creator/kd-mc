---
name: apex-audit-improvements
description: Passe « full améliorations » de l'audit (axe 9) — chercher non pas ce qui est CASSÉ mais ce qui MARCHE et peut être MEILLEUR, chiffré. Code mort/non-câblé, doublons, dette mesurée, fuites de minuteries, couverture des vues, dépendances en retard, veille « existe-t-il mieux aujourd'hui ». Parité Claude Code (`npm run audit:improvements`).
when_to_use: Auto, à CHAQUE fois que Kevin dit « fais l'audit », « audit », « audite X » — en plus des axes sécurité/perf/UX/tests/archi. Aussi quand il demande « améliore », « va plus loin », « qu'est-ce qu'on peut faire de mieux ».
model: sonnet
allowed_tools: [read_repo_file, search_repo_code, run_auto_test, audit_health]
---

# Passe AMÉLIORATIONS TOTALES (axe 9 de « fais ton audit »)

Les autres axes cherchent ce qui est **cassé**. Celui-ci cherche ce qui **marche mais peut être
meilleur** — et le **chiffre**. Un audit qui ne sort que des bugs laisse l'app **stagner**, ce qui
contredit « TOUT AU MAX ». Sans cette passe, l'audit est **incomplet**.

Côté Claude Code l'outil est `npm run audit:improvements`
(`tools/audit/improvements-audit.cjs`). Côté Apex : produire le **même backlog chiffré** lors de
`/audit`, en lisant le dépôt (`read_repo_file` / `search_repo_code`).

## Ce qu'on mesure (jamais « à l'œil »)

| Quoi | Pourquoi ça compte |
|---|---|
| **Code déclaré jamais appelé** | erreur #28 « Declaration ≠ Deployment » — une vue orpheline = feature invisible |
| **Fonction définie 2×** | la 2ᵉ écrase la 1ʳᵉ en silence → un correctif posé sur la 1ʳᵉ ne sert à rien |
| **Dette chiffrée** | poids du fichier, `style=` en dur, `innerHTML` sans `esc()`, TODO, `console.log` |
| **Fuites** | `setInterval` sans `clearInterval`, écouteurs jamais retirés (batterie iPhone) |
| **Couverture des vues** | une vue non listée par un test est une vue non testée |
| **Dépendances** | paquets en retard / vulnérables (réseau requis → sinon 🔴 non mesuré) |
| **Veille** | « existe-t-il mieux aujourd'hui ? » (modèle IA, lib, API Web) — mesuré ou 🔴 non mesuré |

## Règles de la passe

- **RATCHET, jamais de faux rouge** : la dette existante est figée (`improvements-baseline.json`).
  On échoue **seulement si un compteur AUGMENTE** → le nouveau code est bloqué, l'ancien n'allume
  pas un rouge permanent.
- **TRIAGE avant d'agir** : un compteur n'est pas un bug. *Vécu le 2026-08-09* : « 85/102 vues non
  testées » était **faux** (le smoke liste les routes `'accueil'`, pas les fonctions `vAccueil`) →
  vrai chiffre **41**. Une mesure fausse est pire que pas de mesure.
- **Backlog CLASSÉ + CHIFFRÉ** : `[P0-P3] titre · mesure réelle · action`. Jamais « il faudrait
  améliorer X » sans le nombre.
- **🔴 non mesuré** si ça n'a pas pu être mesuré. Jamais deviné (règle JAMAIS ESTIMER).
- P0/P1 corrigés dans la foulée, P2/P3 consignés.

## Test mental

> *« Est-ce que je sors de cet audit avec une liste CHIFFRÉE de ce qui peut devenir meilleur, ou
> seulement avec des bugs corrigés ? Si l'app ne progresse pas après mon audit, je n'ai fait qu'un
> contrôle technique. »*

Version longue : `CLAUDE.md` → « PASSE AMÉLIORATIONS TOTALES ». Garde CI : `test:improvements-guard`.
