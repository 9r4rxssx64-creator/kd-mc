# Guide 60 secondes : générer un GitHub PAT pour Apex

> **Objectif** : permettre à Apex AI de modifier son propre code et créer des Pull Requests automatiquement via `github_write_file` tool.

## Étape 1 — Créer le token (30 sec)

1. Va sur : https://github.com/settings/personal-access-tokens/new
2. Remplis :
   - **Token name** : `APEX_AUTO_PATCH`
   - **Expiration** : 90 days (ou "No expiration" si tu préfères)
   - **Repository access** : Only select repositories → cocher uniquement `9r4rxssx64-creator/CMCteams`
   - **Repository permissions** (scroll bas) :
     - **Contents** : Read and write
     - **Pull requests** : Read and write
     - **Metadata** : Read-only (auto)
3. Clique **Generate token**
4. **COPIE LE TOKEN** (commence par `github_pat_11...`) — ne ferme pas la page avant de le coller ailleurs

## Étape 2 — Coller dans Apex Vault (30 sec)

1. Ouvre Apex AI sur ton iPhone
2. Menu **Plus** → **🔐 Coffre** (vVault)
3. Section **🔐 GitHub** → champ `ax_github_pat` → coller le token
4. Bouton **Sauvegarder**

## Étape 3 — Tester (optionnel)

Dans le chat Apex, demande-lui : `Lis le fichier README.md du repo`.

L'IA doit utiliser `github_read_file` et afficher le contenu. Si tu vois "Erreur GitHub 401" → le token est invalide ou n'a pas les bonnes permissions. Si tu vois le contenu → c'est bon, Apex peut maintenant s'auto-patcher.

## Sécurité

- Le token n'est JAMAIS commité dans le code
- Il reste stocké dans ton localStorage Apex uniquement (ou Firebase chiffré si tu synchronises entre appareils)
- Apex ne PEUT PAS commiter directement sur `main` — `github_write_file` crée toujours une branche `claude/apex-auto-<timestamp>` + une Pull Request que tu reviewes en 1 clic
- Audit trail : chaque écriture est loggée dans `ax_github_writes` (admin only)
- Tu peux révoquer le token n'importe quand : https://github.com/settings/tokens (bouton Delete)

## Si erreur "ax_github_pat manquant dans Vault"

Le Vault n'affiche peut-être pas la catégorie GitHub. Ouvre la console navigateur (F12) puis :

```js
ls("ax_github_pat","github_pat_11ABCDE..."); location.reload();
```

(remplace par ton vrai token)
