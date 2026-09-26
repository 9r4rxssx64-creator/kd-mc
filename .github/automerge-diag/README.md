# Diagnostics d'auto-fusion — un fichier par branche

Quand `auto-merge-claude.yml` n'arrive **pas** à fusionner une branche `claude/*`,
il écrit ici **la cause exacte renvoyée par GitHub** puis committe le fichier
**sur la branche concernée**.

C'est le seul canal lisible depuis une session d'agent qui n'a pas accès à
l'API GitHub (elle reçoit `403 « GitHub access is not enabled for this session »`).
Sans ce fichier, une PR reste ouverte des heures sans que personne — ni Kevin,
ni moi — puisse savoir pourquoi (leçon #214, « un échec invisible n'existe pas »).

## Pourquoi un fichier PAR BRANCHE

Jusqu'au 7.09.2026, toutes les branches écrivaient dans **un seul** fichier,
`.github/AUTOMERGE-DIAGNOSTIC.md`, avec à chaque fois un contenu différent
(numéro de PR, nom de branche, heure). Mesuré le 6.09 : **8 écritures en une
journée, sur 4 branches**.

Dès que deux de ces branches croisaient `main`, le conflit était **certain** :
même chemin, contenus incompatibles, aucun des deux « n'a tort ». C'est
exactement ce qui a bloqué la PR #3679 — et une autre session avait déjà essayé
de supprimer le fichier, qui revenait à l'exécution suivante.

Le nom du fichier porte désormais celui de la branche
(`claude/ma-branche` → `claude-ma-branche.md`) : **deux branches ne se disputent
plus jamais un chemin.**

Tenu par la **règle 5** de `tests/verify-actions-conformes.mjs` (dans `test:ci`,
prouvée discriminante par sabotage) : un fichier qu'un robot committe depuis une
branche doit porter le nom de cette branche.

## Ces fichiers sont jetables

Un diagnostic ne décrit qu'**une tentative de fusion à un instant donné**. Dès
que la branche a fusionné, il ne sert plus à rien : on peut le supprimer sans
rien perdre. S'il en traîne un ici dont la PR est déjà fusionnée, c'est du
résidu, pas une information.
