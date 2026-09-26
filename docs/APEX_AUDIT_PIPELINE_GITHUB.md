# Pipeline Apex audit — GitHub Actions (gratuit, remplace n8n)

> **Pourquoi** : n8n SaaS demande un abonnement payant. GitHub Actions est **gratuit illimite**
> sur les repos publics et largement suffisant pour le pipeline d'escalade Apex.
>
> **Demande Kevin (2026-05-04)** : "n8n me demande de payer trouve gratuit".

## Vue d'ensemble

```
┌────────────────┐  audit P0/P1  ┌──────────────────┐  POST repo dispatch  ┌────────────────────┐
│ Apex v13       │ ────────────▶ │ vault.readKey()  │ ───────────────────▶ │ GitHub Actions     │
│ self-audit     │   (fail)      │ ax_github_token  │  api.github.com      │ apex-audit-escalate│
└────────────────┘               └──────────────────┘                      └─────────┬──────────┘
                                                                                     │
                                                                                     ▼
                                                                            ┌────────────────────┐
                                                                            │ Python escalate.py │
                                                                            │ + Anthropic SDK    │
                                                                            └─────────┬──────────┘
                                                                                      │
                                                                ┌─────────────────────┼─────────────────────┐
                                                                ▼                     ▼                     ▼
                                                       ┌─────────────────┐  ┌──────────────────┐  ┌──────────────────┐
                                                       │ docs/apex-      │  │ commit + push    │  │ Issue GitHub     │
                                                       │ escalades/*.md  │  │ vers main        │  │ assignee Kevin   │
                                                       └─────────────────┘  └──────────────────┘  └──────────────────┘
```

## Setup en 1 fois (par Kevin)

### Etape 1 — Ajouter le secret `ANTHROPIC_API_KEY`

1. Aller sur le repo : `https://github.com/9r4rxssx64-creator/CMCteams`
2. **Settings** → **Secrets and variables** → **Actions** → bouton **New repository secret**
3. Champ **Name** : `ANTHROPIC_API_KEY`
4. Champ **Value** : coller la cle Claude (commence par `sk-ant-api03-...`)
5. Cliquer **Add secret**

> 1 fois suffit. Apres ca, le workflow fonctionne automatiquement.

### Etape 2 — Coller le token GitHub dans le Coffre Apex (deja fait si reconnu)

- Apex v13 detecte automatiquement les tokens `ghp_` ou `github_pat_` (regex
  `credential-patterns.ts`)
- Coller dans le Coffre → store dans `ax_github_token` (chiffre via `vault`)
- Apex utilise ensuite ce token pour appeler l'API GitHub `repository_dispatch`

Permissions minimales requises pour le PAT GitHub :
- `repo` (push commits + open issues)
- `workflow` (declenche d'autres workflows si besoin)

## Fichiers du pipeline

| Fichier | Role |
|---|---|
| `.github/workflows/apex-audit-escalate.yml` | Workflow declenche par event `apex-audit` |
| `.github/workflows/scripts/escalate.py` | Script Python : appelle Claude + commit plan + Issue |
| `docs/apex-escalades/` | Plans correctifs auto-generes (commit dans le repo) |
| `apex-ai/v13/services/admin/apex-self-audit.ts` | Cote Apex : `escalateToClaudeCode()` envoie le dispatch |

## Test manuel rapide

Depuis l'onglet **Actions** GitHub :

1. Ouvrir **Apex Audit Escalate (Claude Code autonome — gratuit)**
2. Cliquer **Run workflow**
3. Champ `finding_json` : coller un finding test, par exemple :
   ```json
   {"id":"test_1","severity":"p1_high","axis":"security","title":"Test escalation","description":"Validation manuelle du pipeline"}
   ```
4. Champ `audit_summary` : `Test manuel pipeline gratuit`
5. **Run workflow** → un Issue GitHub s'ouvre + un fichier markdown est commit dans
   `docs/apex-escalades/`.

## Test depuis Apex (auto)

Quand le self-audit Apex (`runFullAudit(true)`) detecte un finding P0/P1 et que
`tryAutoFix` echoue, `escalateToClaudeCode()` :
1. Lit `ax_github_token` via `vault.readKey()`
2. POST `https://api.github.com/repos/{owner}/{repo}/dispatches`
3. Body : `{"event_type":"apex-audit","client_payload":{...finding...}}`
4. GitHub Actions reagit dans la minute → Issue + plan markdown dispo.

## Cout

| Item | Cout |
|---|---|
| GitHub Actions (repo public) | **0 €** illimite |
| Anthropic API (1 escalade ~ 4k tokens out) | ~ 0,02 € par escalade |
| n8n SaaS (l'ancien systeme) | ~ 20 €/mois |

**Economie : ~ 20 €/mois** sans perte fonctionnelle.

## Securite

- `ANTHROPIC_API_KEY` reste dans GitHub Secrets (chiffre AES-256 cote GitHub).
- `ax_github_token` reste dans `vault` Apex (chiffre AES-GCM 256 PBKDF2 100k).
- Les Issues n'exposent pas la cle (seulement les findings + plan).
- Les plans markdown ne contiennent jamais de secrets (escalation script filtre).

## Failover

Si GitHub API est en panne (extremement rare), `escalateToClaudeCode()` continue
de pousser dans `ax_claude_todo` localStorage → `claude-todo-watcher.yml` (cron 2h)
finit par detecter et escalade en backup.

## Voir aussi

- `apex-ai/v13/services/apex-self-audit.ts` — moteur self-audit (6 axes parallel)
- `apex-ai/v13/services/vault/vault.ts` — `readKey('ax_github_token')`
- `.github/workflows/claude-todo-watcher.yml` — failover cron 2h
