# Methodologie de Travail

## TDD Obligatoire
1. Analyser la codebase (Read, Grep, Explore)
2. Planifier (TodoWrite, Plan agent)
3. Tests d'abord (ecrire les tests avant le code)
4. Implementer (Edit, Write)
5. Valider (syntax check, audit, subagent)

## Avant chaque commit
- node --check sur le JS
- wc -c pour verifier la taille
- grep innerHTML | grep -v esc pour XSS
- grep conflits git
- git diff pour regressions

## Apres chaque session
- Mettre a jour la feuille de route
- Mettre a jour MEMO_KEVIN_ACTIONS.md
- Commit + push tout le travail
- Bilan a la reconnexion
