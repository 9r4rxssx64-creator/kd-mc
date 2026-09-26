# 🔒 Règles Firebase pour KDMC Shops Dashboard + Sourcing

> **Déploiement 100% automatisé — ZÉRO action manuelle Kevin sur la console Firebase.**
> Source unique de vérité : `firebase-rules-apex.json` (objet `rules`).
> Déployé par le workflow GitHub **`deploy-cmcteams-rules.yml`** (Service Account, REST).

Les boutiques (`shops/*`) + le hub Sourcing (`shops/sourcing/`) + le dashboard (`shops/dashboard/`) lisent/écrivent en temps réel dans des chemins **isolés** :

```
cmcteams-c16ab-default-rtdb / shops_admin_v1   / orders|products|logos / <boutique> / <id>
cmcteams-c16ab-default-rtdb / shops_sourcing_v1 / selection / <id>
```

**Aucune donnée client (email, adresse, CB) n'est envoyée** — uniquement les méta-données métier (ID commande, total, articles résumés, produits sélectionnés, logos générés, timestamp).

---

## Déploiement (automatique, 1 clic Kevin si voulu)

Le bloc shops/sourcing fait partie du ruleset **consolidé** `firebase-rules-apex.json` (qui contient aussi `cmcteams`, `apex`, `coffre_vault`, + deny racine). Pour (re)publier :

1. GitHub → **Actions → `deploy-cmcteams-rules.yml` → Run workflow**
2. Input `rules_state` :
   - **`hardened`** (défaut) → `/cmcteams` exige `auth != null` ; **shops/sourcing restent fonctionnels** (écriture anonyme + validation, voir plus bas).
   - **`open`** (rollback) → `/cmcteams` rouvert (`.read/.write = true`).
3. Le script (`tools/firebase/deploy-rules.cjs`) publie **exactement** le fichier, vérifie l'état live, et **abort fort** si le deny racine ou `/apex` a bougé.

> ⚠️ **`hardened` n'affecte QUE `/cmcteams`.** Les chemins `shops_admin_v1` et `shops_sourcing_v1` gardent leur écriture anonyme + validation stricte décrite ci-dessous, dans les deux états.

---

## Chemins couverts (bloc complet)

| Chemin | Lecture | Écriture | Validation |
|--------|---------|----------|------------|
| `shops_admin_v1/orders/<shop>/<orderId>` | publique | anonyme, **création seule** (`!data.exists()`) | shop ∈ whitelist 6 boutiques · `orderId` ≤ 40 · `total` ∈ [0, 100 000] · `shop` string ≤ 40 · `items_summary` ≤ 400 |
| `shops_admin_v1/products/<shop>/<id>` | publique | anonyme (création/maj) | shop ∈ whitelist · `id` string ≤ 80 · `title` ≤ 200 · `image` ≤ 600 |
| `shops_admin_v1/logos/<shop>/<id>` | publique | anonyme | shop ∈ whitelist · `id` ≤ 80 · `url` ≤ 600 |
| `shops_sourcing_v1/selection/<id>` | publique | anonyme (création/maj/suppr) | `id` ≤ 120 · `supplier` requis ≤ 60 · `title` ≤ 200 · `image`/`url` ≤ 600 |

Whitelist boutiques : `tech-hub`, `chez-lolo`, `ecocraft`, `digital-vault`, `pawsome`, `la-detente`.

---

## Ce que ces règles garantissent

- ✅ **Anonyme peut écrire** (commande, produit, logo, sélection sourcing) — les boutiques + le hub sourcing sont publics côté écriture métier.
- ❌ **Une commande existante ne peut JAMAIS être modifiée/supprimée** (`!data.exists()` sur `orders`).
- ❌ **Aucune écriture dans un shop inconnu** (regex whitelist des 6 boutiques).
- ✅ **Schéma + caps stricts** sur chaque chemin (longueurs bornées, `total` plafonné) → anti-spam / anti-injection de gros payloads.
- ✅ **Lecture publique** pour que dashboard + sourcing affichent les données (acceptable : zéro PII).
- ✅ **Isolation totale** : n'affecte QUE `shops_admin_v1` + `shops_sourcing_v1` — `cmcteams`, `apex`, `coffre_vault`, `cmc_*`, `ax_*` ne sont jamais touchés ; deny racine préservé.

---

## ⚠️ Limite honnête (sécurité maximale réelle)

Ces règles **ferment la base ouverte** (plus de read/write zéro-contrainte) et **bornent/valident** chaque écriture, MAIS l'écriture reste **anonyme** : toute personne qui connaît l'URL de la DB peut écrire une donnée **valide** dans `shops_*` (une fausse commande conforme au schéma, p.ex.). C'est le compromis nécessaire tant que les boutiques publiques poussent sans authentification.

**Durcissement fort possible (action future)** : migrer les boutiques vers une écriture **authentifiée** (token `?auth=` / custom-tokens par rôle), puis passer `shops_*` en `auth != null`. À ne faire QUE lorsque **toutes** les boutiques envoient le token — sinon écritures cassées (même précaution que `/cmcteams`). Rollback : `deploy-cmcteams-rules.yml` input `open`.

---

## Sécurité du dashboard

L'écran admin lui-même est protégé par **PIN PBKDF2 200k itérations**, session 8 h, rate-limit progressif (5 fails → 30 s, 6 → 2 min, 7 → 10 min, 8 → 1 h, 9 → 24 h).

PIN par défaut au premier lancement : **`‹code admin›`**. À changer dans `Paramètres → Changer le PIN admin` dès la première connexion.

Hash + sel stockés en localStorage isolé sous le préfixe `shops_admin_*` (zéro collision avec d'autres projets).

---

## 🔐 Lockdown fort — custom-tokens par rôle (livré, à activer en 2 clics)

Le durcissement maximal : **seuls Kevin/Lolo peuvent écrire** produits/logos/sélection-sourcing, via un **id_token Firebase `role:admin`** minté côté serveur. Les commandes clients (`orders`) et toutes les lectures restent **inchangées** (jamais authentifiées → checkout client jamais cassé).

### Comment ça marche
1. `kdmc-router` expose `/__admin/fbtoken` (derrière le **GRANT admin** déjà existant — preuve du PIN via `/__admin/login`, lesson #99). Il signe un custom token Firebase (`uid=kdmc_admin`, claim `role:'admin'`) avec le Service Account et l'échange en `id_token`. Code : `services/kdmc-router/fb-token.js` (réutilise la signature RS256 éprouvée d'apex-auth-worker). Secrets posés auto par `deploy-kdmc-router.yml` (`FIREBASE_PRIVATE_KEY` / `_CLIENT_EMAIL` / `_WEB_API_KEY`, déjà dans GitHub).
2. Client `tools/shared/kdmc-fb-auth.js` (chargé sur sourcing + studios) : bouton **« 🔒 Admin »** → prouve le PIN une fois → token en cache (auto-refresh). Un **intercepteur `fetch` chirurgical** ajoute `?auth=` **uniquement** sur les écritures `shops_admin_v1/(products|logos)` + `shops_sourcing_v1/selection`. **FAIL-OPEN total** : sans token, l'écriture part comme avant → zéro blocage pendant le rollout.
3. Règles : bloc stagé `_phase_shops_rolelock` dans `firebase-rules-apex.json`. Activé par le déployeur (`SHOPS_LOCK=on`) → ces 3 `.write` deviennent `auth.token.role === 'admin'`.

### Activation (Kevin, quand prêt)
1. **Laisser le router se redéployer** (push sur `services/kdmc-router/**` ou lancer `deploy-kdmc-router.yml`) → pose les secrets FB + le endpoint `/__admin/fbtoken`.
2. Sur **sourcing** (ou un studio) : taper **« 🔒 Admin »** → entrer le PIN admin → vérifier qu'un **ajout à la sélection** fonctionne (le token est actif).
3. **Activer le lock** : Actions → `deploy-cmcteams-rules.yml` → Run workflow → `shops_lock` = **`on`** (rollback = `off`). (`rules_state` reste `hardened`.)

### Limite honnête
- Anti-lockout : si le token échoue, l'écriture admin est **bloquée par les règles** (pas les clients) → re-cliquer « 🔒 Admin ». Rollback immédiat : `shops_lock=off`.
- `role:admin` est partagé Kevin **et** Lolo (même PIN admin, ils partagent l'espace privé). Pour des identités séparées par personne → évolution future (claim par uid).
