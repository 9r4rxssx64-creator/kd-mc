---
name: apex-superpowers
description: 14 méthodologies de développement (brainstorming, plans, TDD, debug, sous-agents, parallélisme...). Inspiré de obra/superpowers.
when_to_use: Tâche complexe (>5 étapes), feature nouvelle, refactor cross-file, débogage difficile, audit.
model: sonnet
allowed_tools: [brainstorm, execute_plan, code_review, run_test]
---

# Skill : apex-superpowers

## Mission

Appliquer une méthodologie de développement structurée et répétable pour les tâches complexes, inspirée de **Superpowers** (obra/superpowers).

## Les 14 méthodologies

1. **Brainstorming socratique** — Avant de coder : quel est le problème réel ? cas limites ? dépendances ? Test mental "si user fait X, attend Y ?".
2. **Écriture de plan** — Décomposer en étapes atomiques écrites AVANT le code. Un plan = des lots vérifiables.
3. **Exécution de plan par lots** — Avancer lot par lot, valider chaque lot avant le suivant. Pas de big-bang.
4. **Test-Driven Development** — Rouge (test échoue) → Vert (implémentation minimale) → Refactor. Tests d'abord pour le critique.
5. **Débogage systématique (4 phases)** — Reproduire (test isolant) → Localiser la cause racine (pas le symptôme) → Analyser hypothèses → Vérifier avec un test de non-régression.
6. **Développement piloté par sous-agents** — Déléguer recherche/audit à des sous-agents pour garder le contexte principal propre.
7. **Parallélisme d'agents** — Lancer 3-5 sous-agents en parallèle sur des angles indépendants (sécu/perf/UX/archi). Un seul message, plusieurs appels.
8. **Traçage de cause racine** — Remonter la chaîne complète (UI → handler → API → données). Ne jamais patcher un symptôme.
9. **Vérification avant complétion** — Ne jamais dire "fait" sans preuve : compile, tests verts, comportement réel observé. Jamais "ça devrait marcher".
10. **Attente par condition** — Attendre un état (`until <check>`), jamais un `sleep` arbitraire.
11. **Défense en profondeur** — Valider aux frontières (entrée user, API externe), faire confiance au code interne. Pas de validation redondante partout.
12. **Revue de code reçue** — Traiter chaque retour : corriger, ou expliquer pourquoi non. Jamais ignorer en silence.
13. **Demande de revue** — Sur toute feature non triviale, lancer ≥ 1 sous-agent reviewer (qualité / sécu OWASP / perf / UX mobile 375px) avant de livrer.
14. **Audit post-fix** — Après un lot de corrections, re-mesurer l'écart réel (jamais estimé). Si écart estimé vs réel > 5 points → stop features, intégration only.

## Quand l'invoquer

- Tâche estimée > 30 min · feature non-triviale · bug reproduit 3+ fois · refactor cross-file · audit.

## Anti-patterns

1. Sauter le brainstorming "je sais ce que je fais" → bugs.
2. Coder avant le test sur du critique → TDD obligatoire.
3. Corriger le symptôme au lieu de la cause → 4 phases obligatoires.
4. Sauter la revue sous-agent sur une feature complexe.
5. Déclarer "fait" sans vérification end-to-end.
6. Estimer un score au lieu de le mesurer.

## Références

- obra/superpowers : https://github.com/obra/superpowers
- Pattern Apex : `apex-ai/v13/services/ai/superpowers-methodology.ts`
