# Pourquoi `vercel.json` est écrit comme ça (et pas commenté dedans)

**Ce fichier existe parce que `vercel.json` ne supporte AUCUN commentaire.** Toute clé
inconnue — même un `"_note"` explicatif — fait échouer la validation du schéma **avant le
build**, donc un mail « Preview deployment failed » à chaque push, sur toutes les branches.
Mesuré le 05/09/2026, deux fois. Leçon #218.

## Le projet

- Projet Vercel : **kdmc-agent-monaco** · Root Directory : `tools/agent`
- Ce qu'il fait réellement : **3 tâches planifiées de production** (`crons`), rien d'autre.
  Il n'y a pas de site à prévisualiser.

## Le filtre `ignoreCommand`

```
bash -c '[ "$VERCEL_GIT_COMMIT_REF" = main ] || exit 0; git rev-parse -q --verify HEAD^ >/dev/null || exit 1; git diff --quiet HEAD^ HEAD -- . && exit 0; exit 1'
```

Convention Vercel : **sortie 0 = on ne déploie pas**, **1 = on déploie**.

| Situation | Résultat | Pourquoi |
|---|---|---|
| Branche ≠ `main` | 0 → rien | l'agent est un cron de production ; une prévisualisation par branche ne sert à rien (40 déploiements le 05/09, tous annulés ou en erreur, un mail à chaque fois) |
| `main`, historique indisponible | 1 → déploie | prudence : sur un clone superficiel `HEAD^` n'existe pas. L'ancienne version faisait `git diff HEAD^` sans vérifier → la commande sortait en erreur et Vercel comptait ça comme **build error** |
| `main`, `tools/agent` inchangé | 0 → rien | inutile de redéployer les crons pour un commit qui ne les touche pas |
| `main`, `tools/agent` modifié | 1 → déploie | c'est le seul cas qui compte |

## Deux limites du schéma à ne jamais oublier

1. **Aucune clé hors schéma** (`_note`, `_comment`, …) — l'explication va ici ou dans le commit.
2. **`ignoreCommand` ≤ 256 caractères** — d'où une commande sans message en clair.

La garde `npm run test:vercel-config` (câblée dans `test:ci`) vérifie les deux, plus le
garde-fou `HEAD^` et le filtre de branche. Elle a été prouvée discriminante par sabotage.
