# 🧾 Déploiements ratés — la cause exacte, écrite ici

> Ce fichier est rempli **automatiquement** par `.github/workflows/journal-deploiements.yml`
> **uniquement quand une mise en ligne échoue**. Il existe parce que l'assistant ne peut pas
> lire les journaux de la CI : le connecteur GitHub Actions a été refusé par GitHub
> (2026-09-06). Le workflow lit le journal à sa place et dépose l'essentiel ici.
>
> Rien ici quand tout va bien — c'est normal, et c'est bon signe.

## ❌ KDMC — Publie le site sur Cloudflare Pages (pour que le dépôt puisse être PRIVÉ) — 02/10/2026 23:04 UTC

- **Branche** : `main` · **Commit** : `ce48fd7d` · **Run** : `37075654528`
- **Ce qui a lâché** : publier › Publier sur Cloudflare Pages
- **Journal complet** : https://github.com/9r4rxssx64-creator/kd-mc/actions/runs/37075654528
- **Ce que la machine a dit** :

```
^[[36;1m[ -n "$URL" ] || { echo "::error::wrangler n'a pas rendu d'adresse — publication non confirmée"; exit 1; }^[[0m
^[[31m✘ ^[[41;31m[^[[41;97mERROR^[[41;31m]^[[0m ^[[1mfetch failed^[[0m
Note that there is a newer version of Wrangler available (4.147.0). Consider checking whether upgrading resolves this error.
? Would you like to report this error to Cloudflare? Wrangler's output and the error details will be shared with the Wrangler team to help us diagnose and fix the issue.
##[error]Process completed with exit code 1.
```

## ❌ Auto-merge Claude branches into main — 26/09/2026 17:12 UTC

- **Branche** : `claude/persona-personnage-javis-hqd55e` · **Commit** : `efe3fc82` · **Run** : `36258082757`
- **Ce qui a lâché** : auto-merge › Create & merge PR into main
- **Journal complet** : https://github.com/9r4rxssx64-creator/CMCteams/actions/runs/36258082757
- **Ce que la machine a dit** :

```
^[[36;1m  echo "::notice::Branche $BRANCH introuvable sur origin — rien à merger."^[[0m
^[[36;1m# AVANT sa vraie revue → merge trop tôt → CodeRabbit : « Review failed — PR^[[0m
^[[36;1m# buffer pour les commentaires ligne par ligne. Cap ~6 min, fail-open (on merge^[[0m
^[[36;1m# v2026-09-06 (leçon #214 « un échec invisible n'existe pas ») : les deux^[[0m
^[[36;1m# tentatives étaient suivies de `2>/dev/null` — la VRAIE cause du refus^[[0m
^[[36;1m  echo "::warning::PR #$PR — merge auto refusé. Cause exacte ci-dessous."^[[0m
^[[36;1m    echo "Ce fichier existe parce que le merge automatique a été REFUSÉ."^[[0m
^[[36;1m      commit -m "diag: pourquoi l'auto-merge de $BRANCH est refusé [skip ci]" || true^[[0m
##[warning]PR #4024 — merge auto refusé. Cause exacte ci-dessous.
[claude/persona-personnage-javis-hqd55e df453450c] diag: pourquoi l'auto-merge de claude/persona-personnage-javis-hqd55e est refusé [skip ci]
##[error]Process completed with exit code 1.
```

## ❌ KDMC — Publie le site sur Cloudflare Pages (pour que le dépôt puisse être PRIVÉ) — 26/09/2026 17:08 UTC

- **Branche** : `main` · **Commit** : `6c6add4f` · **Run** : `36257871891`
- **Ce qui a lâché** : publier › Sonder les 26 adresses sur le site publié
- **Journal complet** : https://github.com/9r4rxssx64-creator/CMCteams/actions/runs/36257871891
- **Ce que la machine a dit** :

```
^[[36;1m# depuis l'agent (proxy) : les lignes `::error::` deviennent des ANNOTATIONS,^[[0m
^[[36;1m  echo "::error::sonde sortie $st sur $U (2 = rien n'a pu être mesuré : le site n'a pas répondu du tout)"^[[0m
^[[36;1m  { head -12 sonde.log; echo "…"; tail -30 sonde.log; } | while IFS= read -r l; do echo "::error::$l"; done^[[0m
^[[36;1m    echo "::error::Le site est publié sur $A mais le routeur lit $ATTENDU — le domaine sert donc un AUTRE paquet (souvent un vieux). Corrige UPSTREAM_BASE dans services/kdmc-router/wrangler.toml, puis redéploie le routeur."^[[0m
^[[36;1m    echo "::error::alias de production $A NON conforme (sortie $sa) — le routeur ne doit PAS basculer dessus"^[[0m
^[[36;1m    { head -12 sonde-alias.log; echo "…"; tail -30 sonde-alias.log; } | while IFS= read -r l; do echo "::error::$l"; done^[[0m
=== 32 servies / 0 en échec ===
##[error]Le site est publié sur https://kdmc-site-bj5.pages.dev.pages.dev mais le routeur lit https://kdmc-site-bj5.pages.dev — le domaine sert donc un AUTRE paquet (souvent un vieux). Corrige UPSTREAM_BASE dans services/kdmc-router/wrangler.toml, puis redéploie le routeur.
##[error]Process completed with exit code 1.
```

## ❌ KDMC — Publie le site sur Cloudflare Pages (pour que le dépôt puisse être PRIVÉ) — 23/09/2026 21:15 UTC

- **Branche** : `main` · **Commit** : `d8418d80` · **Run** : `35921169097`
- **Ce qui a lâché** : publier › Sonder les 26 adresses sur le site publié
- **Journal complet** : https://github.com/9r4rxssx64-creator/CMCteams/actions/runs/35921169097
- **Ce que la machine a dit** :

```
^[[36;1m    echo "::error::alias de production $A NON conforme (sortie $sa) — le routeur ne doit PAS basculer dessus"^[[0m
^[[36;1m    head -25 sonde-alias.log | while IFS= read -r l; do echo "::error::$l"; done^[[0m
=== 32 servies / 0 en échec ===
=== 32 servies / 0 en échec ===
##[error]alias de production https://kdmc-site.pages.dev NON conforme (sortie 1) — le routeur ne doit PAS basculer dessus
##[error]Sonde de 32 adresses sur https://kdmc-site.pages.dev (servi à la racine)
##[error]adresse                        HTTP   contenu
##[error]────────────────────────────────────────────────
##[error]✅ kd-mc.com                    200    22557 car.
##[error]✅ www.kd-mc.com                200    22557 car.
##[error]✅ cmcteams.kd-mc.com           200  3310036 car.
##[error]✅ apex-ai.kd-mc.com            200    23667 car.
##[error]✅ apex-chat.kd-mc.com          200   824608 car.
##[error]✅ la-detente.kd-mc.com         200     5786 car.
##[error]✅ chez-lolo.kd-mc.com          200   109851 car.
##[error]✅ dashboard.kd-mc.com          200    41865 car.
##[error]✅ sourcing.kd-mc.com           200    12559 car.
##[error]✅ coffre.kd-mc.com             200    53666 car.
##[error]✅ departs.kd-mc.com            200   165279 car.
##[error]✅ cmcteams-light.kd-mc.com     200   165279 car.
##[error]✅ bot.kd-mc.com                200    26912 car.
##[error]✅ beatbot.kd-mc.com            200   156883 car.
##[error]✅ autorisations.kd-mc.com      200    40283 car.
##[error]✅ arbre.kd-mc.com              200   286264 car.
##[error]✅ lingua.kd-mc.com             200    69597 car.
##[error]✅ studio.kd-mc.com             200   418751 car.
##[error]✅ cuisine.kd-mc.com            200   301655 car.
##[error]✅ cocina.kd-mc.com             200   301655 car.
##[error]✅ cujina.kd-mc.com             200   301655 car.
##[error]Process completed with exit code 1.
```

## ❌ Auto-merge Claude branches into main — 23/09/2026 20:23 UTC

- **Branche** : `claude/quota-inscriptions` · **Commit** : `85f30159` · **Run** : `35914671592`
- **Ce qui a lâché** : auto-merge › Create & merge PR into main
- **Journal complet** : https://github.com/9r4rxssx64-creator/CMCteams/actions/runs/35914671592
- **Ce que la machine a dit** :

```
^[[36;1m  echo "::notice::Branche $BRANCH introuvable sur origin — rien à merger."^[[0m
^[[36;1m# AVANT sa vraie revue → merge trop tôt → CodeRabbit : « Review failed — PR^[[0m
^[[36;1m# buffer pour les commentaires ligne par ligne. Cap ~6 min, fail-open (on merge^[[0m
^[[36;1m# v2026-09-06 (leçon #214 « un échec invisible n'existe pas ») : les deux^[[0m
^[[36;1m# tentatives étaient suivies de `2>/dev/null` — la VRAIE cause du refus^[[0m
^[[36;1m  echo "::warning::PR #$PR — merge auto refusé. Cause exacte ci-dessous."^[[0m
^[[36;1m    echo "Ce fichier existe parce que le merge automatique a été REFUSÉ."^[[0m
^[[36;1m      commit -m "diag: pourquoi l'auto-merge de $BRANCH est refusé [skip ci]" || true^[[0m
##[warning]PR #3986 — merge auto refusé. Cause exacte ci-dessous.
[claude/quota-inscriptions 98ff6a825] diag: pourquoi l'auto-merge de claude/quota-inscriptions est refusé [skip ci]
##[error]Process completed with exit code 1.
```

## ❌ Auto-merge Claude branches into main — 23/09/2026 19:58 UTC

- **Branche** : `claude/video-review-wqnqdw` · **Commit** : `c24184e4` · **Run** : `35912569193`
- **Ce qui a lâché** : auto-merge › Create & merge PR into main
- **Journal complet** : https://github.com/9r4rxssx64-creator/CMCteams/actions/runs/35912569193
- **Ce que la machine a dit** :

```
^[[36;1m  echo "::notice::Branche $BRANCH introuvable sur origin — rien à merger."^[[0m
^[[36;1m# AVANT sa vraie revue → merge trop tôt → CodeRabbit : « Review failed — PR^[[0m
^[[36;1m# buffer pour les commentaires ligne par ligne. Cap ~6 min, fail-open (on merge^[[0m
^[[36;1m# v2026-09-06 (leçon #214 « un échec invisible n'existe pas ») : les deux^[[0m
^[[36;1m# tentatives étaient suivies de `2>/dev/null` — la VRAIE cause du refus^[[0m
^[[36;1m  echo "::warning::PR #$PR — merge auto refusé. Cause exacte ci-dessous."^[[0m
^[[36;1m    echo "Ce fichier existe parce que le merge automatique a été REFUSÉ."^[[0m
^[[36;1m      commit -m "diag: pourquoi l'auto-merge de $BRANCH est refusé [skip ci]" || true^[[0m
##[warning]PR #3984 — merge auto refusé. Cause exacte ci-dessous.
[claude/video-review-wqnqdw 4203d3b6d] diag: pourquoi l'auto-merge de claude/video-review-wqnqdw est refusé [skip ci]
##[error]Process completed with exit code 1.
```

## ❌ Deploy KDMC RAG (mémoire Apex) — 22/09/2026 23:00 UTC

- **Branche** : `claude/verify-cmcteams-light-data-rzlvau` · **Commit** : `042fcd99` · **Run** : `35795135771`
- **Ce qui a lâché** : deploy › Créer l'index Vectorize (idempotent) — et DIRE s'il n'existe pas
- **Journal complet** : https://github.com/9r4rxssx64-creator/CMCteams/actions/runs/35795135771
- **Ce que la machine a dit** :

```
^[[36;1m# not found [code 10159] » parce que cette création échouait EN SILENCE (|| true, journal^[[0m
^[[36;1m  { grep -iE 'error|✘|failed|code|permission|authoriz|plan' /tmp/vec.log || true; } | tail -10 | while IFS= read -r L; do echo "::error::vectorize create ▸ $L"; done^[[0m
^[[36;1m  tail -8 /tmp/vecget.log | while IFS= read -r L; do echo "::error::vectorize get ▸ $L"; done^[[0m
^[[36;1m  echo "::error::L'index Vectorize apex-memory N'EXISTE PAS sur le compte et n'a pas pu être créé (voir lignes ci-dessus : droit manquant du jeton CLOUDFLARE_API_TOKEN sur Vectorize, ou plan). Le worker kdmc-rag a un binding VEC dessus → wrangler deploy refusera (code 10159). Rien n'est déployé."^[[0m
^[[31m✘ ^[[41;31m[^[[41;97mERROR^[[41;31m]^[[0m ^[[1mA request to the Cloudflare API (/accounts/<id>/vectorize/v2/indexes) failed.^[[0m
  Authentication error [code: 10000]
  To learn more about this error, visit: ^[[4mhttps://developers.cloudflare.com/api/resources/vectorize/subresources/indexes/methods/create^[[0m
##[error]vectorize create ▸ ^[[31m✘ ^[[41;31m[^[[41;97mERROR^[[41;31m]^[[0m ^[[1mA request to the Cloudflare API (/accounts/<id>/vectorize/v2/indexes) failed.^[[0m
##[error]vectorize create ▸   Authentication error [code: 10000]
##[error]vectorize create ▸   To learn more about this error, visit: ^[[4mhttps://developers.cloudflare.com/api/resources/vectorize/subresources/indexes/methods/create^[[0m
##[error]vectorize create ▸ Please ensure it has the correct permissions for this operation.
##[error]vectorize create ▸ 🔓 To see token permissions visit https://dash.cloudflare.com/profile/api-tokens
##[error]vectorize create ▸ 🎢 Membership roles in "9r4rxssx64@privaterelay.appleid.com's Account": Contact account super admin to change your permissions.
##[error]vectorize get ▸ │ Account Name                                  │ Account ID                       │
##[error]vectorize get ▸ ├───────────────────────────────────────────────┼──────────────────────────────────┤
##[error]vectorize get ▸ │ 9r4rxssx64@privaterelay.appleid.com's Account │ *** │
##[error]vectorize get ▸ └───────────────────────────────────────────────┴──────────────────────────────────┘
##[error]vectorize get ▸ 🔓 To see token permissions visit https://dash.cloudflare.com/profile/api-tokens
##[error]vectorize get ▸ 🎢 Membership roles in "9r4rxssx64@privaterelay.appleid.com's Account": Contact account super admin to change your permissions.
##[error]vectorize get ▸ - Super Administrator - All Privileges
##[error]vectorize get ▸ 🪵  Logs were written to "/home/runner/.config/.wrangler/logs/wrangler-2026-09-22_22-59-52_244.log"
##[error]L'index Vectorize apex-memory N'EXISTE PAS sur le compte et n'a pas pu être créé (voir lignes ci-dessus : droit manquant du jeton CLOUDFLARE_API_TOKEN sur Vectorize, ou plan). Le worker kdmc-rag a un binding VEC dessus → wrangler deploy refusera (code 10159). Rien n'est déployé.
##[error]Process completed with exit code 1.
```

## ❌ Deploy KDMC RAG (mémoire Apex) — 22/09/2026 22:59 UTC

- **Branche** : `claude/verify-cmcteams-light-data-rzlvau` · **Commit** : `042fcd99` · **Run** : `35795134645`
- **Ce qui a lâché** : deploy › Créer l'index Vectorize (idempotent) — et DIRE s'il n'existe pas
- **Journal complet** : https://github.com/9r4rxssx64-creator/CMCteams/actions/runs/35795134645
- **Ce que la machine a dit** :

```
^[[36;1m# not found [code 10159] » parce que cette création échouait EN SILENCE (|| true, journal^[[0m
^[[36;1m  { grep -iE 'error|✘|failed|code|permission|authoriz|plan' /tmp/vec.log || true; } | tail -10 | while IFS= read -r L; do echo "::error::vectorize create ▸ $L"; done^[[0m
^[[36;1m  tail -8 /tmp/vecget.log | while IFS= read -r L; do echo "::error::vectorize get ▸ $L"; done^[[0m
^[[36;1m  echo "::error::L'index Vectorize apex-memory N'EXISTE PAS sur le compte et n'a pas pu être créé (voir lignes ci-dessus : droit manquant du jeton CLOUDFLARE_API_TOKEN sur Vectorize, ou plan). Le worker kdmc-rag a un binding VEC dessus → wrangler deploy refusera (code 10159). Rien n'est déployé."^[[0m
^[[31m✘ ^[[41;31m[^[[41;97mERROR^[[41;31m]^[[0m ^[[1mA request to the Cloudflare API (/accounts/<id>/vectorize/v2/indexes) failed.^[[0m
  Authentication error [code: 10000]
  To learn more about this error, visit: ^[[4mhttps://developers.cloudflare.com/api/resources/vectorize/subresources/indexes/methods/create^[[0m
##[error]vectorize create ▸ ^[[31m✘ ^[[41;31m[^[[41;97mERROR^[[41;31m]^[[0m ^[[1mA request to the Cloudflare API (/accounts/<id>/vectorize/v2/indexes) failed.^[[0m
##[error]vectorize create ▸   Authentication error [code: 10000]
##[error]vectorize create ▸   To learn more about this error, visit: ^[[4mhttps://developers.cloudflare.com/api/resources/vectorize/subresources/indexes/methods/create^[[0m
##[error]vectorize create ▸ Please ensure it has the correct permissions for this operation.
##[error]vectorize create ▸ 🔓 To see token permissions visit https://dash.cloudflare.com/profile/api-tokens
##[error]vectorize create ▸ 🎢 Membership roles in "9r4rxssx64@privaterelay.appleid.com's Account": Contact account super admin to change your permissions.
##[error]vectorize get ▸ │ Account Name                                  │ Account ID                       │
##[error]vectorize get ▸ ├───────────────────────────────────────────────┼──────────────────────────────────┤
##[error]vectorize get ▸ │ 9r4rxssx64@privaterelay.appleid.com's Account │ *** │
##[error]vectorize get ▸ └───────────────────────────────────────────────┴──────────────────────────────────┘
##[error]vectorize get ▸ 🔓 To see token permissions visit https://dash.cloudflare.com/profile/api-tokens
##[error]vectorize get ▸ 🎢 Membership roles in "9r4rxssx64@privaterelay.appleid.com's Account": Contact account super admin to change your permissions.
##[error]vectorize get ▸ - Super Administrator - All Privileges
##[error]vectorize get ▸ 🪵  Logs were written to "/home/runner/.config/.wrangler/logs/wrangler-2026-09-22_22-59-13_367.log"
##[error]L'index Vectorize apex-memory N'EXISTE PAS sur le compte et n'a pas pu être créé (voir lignes ci-dessus : droit manquant du jeton CLOUDFLARE_API_TOKEN sur Vectorize, ou plan). Le worker kdmc-rag a un binding VEC dessus → wrangler deploy refusera (code 10159). Rien n'est déployé.
##[error]Process completed with exit code 1.
```

## ❌ Deploy KDMC RAG (mémoire Apex) — 22/09/2026 22:57 UTC

- **Branche** : `main` · **Commit** : `6f2227d7` · **Run** : `35794978550`
- **Ce qui a lâché** : deploy › Créer l'index Vectorize (idempotent) — et DIRE s'il n'existe pas
- **Journal complet** : https://github.com/9r4rxssx64-creator/CMCteams/actions/runs/35794978550
- **Ce que la machine a dit** :

```
^[[36;1m# not found [code 10159] » parce que cette création échouait EN SILENCE (|| true, journal^[[0m
^[[36;1m  { grep -iE 'error|✘|failed|code|permission|authoriz|plan' /tmp/vec.log || true; } | tail -10 | while IFS= read -r L; do echo "::error::vectorize create ▸ $L"; done^[[0m
^[[36;1m  tail -8 /tmp/vecget.log | while IFS= read -r L; do echo "::error::vectorize get ▸ $L"; done^[[0m
^[[36;1m  echo "::error::L'index Vectorize apex-memory N'EXISTE PAS sur le compte et n'a pas pu être créé (voir lignes ci-dessus : droit manquant du jeton CLOUDFLARE_API_TOKEN sur Vectorize, ou plan). Le worker kdmc-rag a un binding VEC dessus → wrangler deploy refusera (code 10159). Rien n'est déployé."^[[0m
^[[31m✘ ^[[41;31m[^[[41;97mERROR^[[41;31m]^[[0m ^[[1mA request to the Cloudflare API (/accounts/<id>/vectorize/v2/indexes) failed.^[[0m
  Authentication error [code: 10000]
  To learn more about this error, visit: ^[[4mhttps://developers.cloudflare.com/api/resources/vectorize/subresources/indexes/methods/create^[[0m
##[error]vectorize create ▸ ^[[31m✘ ^[[41;31m[^[[41;97mERROR^[[41;31m]^[[0m ^[[1mA request to the Cloudflare API (/accounts/<id>/vectorize/v2/indexes) failed.^[[0m
##[error]vectorize create ▸   Authentication error [code: 10000]
##[error]vectorize create ▸   To learn more about this error, visit: ^[[4mhttps://developers.cloudflare.com/api/resources/vectorize/subresources/indexes/methods/create^[[0m
##[error]vectorize create ▸ Please ensure it has the correct permissions for this operation.
##[error]vectorize create ▸ 🔓 To see token permissions visit https://dash.cloudflare.com/profile/api-tokens
##[error]vectorize create ▸ 🎢 Membership roles in "9r4rxssx64@privaterelay.appleid.com's Account": Contact account super admin to change your permissions.
##[error]vectorize get ▸ │ Account Name                                  │ Account ID                       │
##[error]vectorize get ▸ ├───────────────────────────────────────────────┼──────────────────────────────────┤
##[error]vectorize get ▸ │ 9r4rxssx64@privaterelay.appleid.com's Account │ *** │
##[error]vectorize get ▸ └───────────────────────────────────────────────┴──────────────────────────────────┘
##[error]vectorize get ▸ 🔓 To see token permissions visit https://dash.cloudflare.com/profile/api-tokens
##[error]vectorize get ▸ 🎢 Membership roles in "9r4rxssx64@privaterelay.appleid.com's Account": Contact account super admin to change your permissions.
##[error]vectorize get ▸ - Super Administrator - All Privileges
##[error]vectorize get ▸ 🪵  Logs were written to "/home/runner/.config/.wrangler/logs/wrangler-2026-09-22_22-57-20_461.log"
##[error]L'index Vectorize apex-memory N'EXISTE PAS sur le compte et n'a pas pu être créé (voir lignes ci-dessus : droit manquant du jeton CLOUDFLARE_API_TOKEN sur Vectorize, ou plan). Le worker kdmc-rag a un binding VEC dessus → wrangler deploy refusera (code 10159). Rien n'est déployé.
##[error]Process completed with exit code 1.
```

## ❌ Deploy KDMC RAG (mémoire Apex) — 22/09/2026 21:46 UTC

- **Branche** : `claude/verify-cmcteams-light-data-rzlvau` · **Commit** : `06f8ca9c` · **Run** : `35788489811`
- **Ce qui a lâché** : deploy › Créer l'index Vectorize (idempotent) — et DIRE s'il n'existe pas
- **Journal complet** : https://github.com/9r4rxssx64-creator/CMCteams/actions/runs/35788489811
- **Ce que la machine a dit** :

```
^[[36;1m# not found [code 10159] » parce que cette création échouait EN SILENCE (|| true, journal^[[0m
^[[36;1m  { grep -iE 'error|✘|failed|code|permission|authoriz|plan' /tmp/vec.log || true; } | tail -10 | while IFS= read -r L; do echo "::error::vectorize create ▸ $L"; done^[[0m
^[[36;1m  tail -8 /tmp/vecget.log | while IFS= read -r L; do echo "::error::vectorize get ▸ $L"; done^[[0m
^[[36;1m  echo "::error::L'index Vectorize apex-memory N'EXISTE PAS sur le compte et n'a pas pu être créé (voir lignes ci-dessus : droit manquant du jeton CLOUDFLARE_API_TOKEN sur Vectorize, ou plan). Le worker kdmc-rag a un binding VEC dessus → wrangler deploy refusera (code 10159). Rien n'est déployé."^[[0m
^[[31m✘ ^[[41;31m[^[[41;97mERROR^[[41;31m]^[[0m ^[[1mA request to the Cloudflare API (/accounts/<id>/vectorize/v2/indexes) failed.^[[0m
  Authentication error [code: 10000]
  To learn more about this error, visit: ^[[4mhttps://developers.cloudflare.com/api/resources/vectorize/subresources/indexes/methods/create^[[0m
##[error]vectorize create ▸ ^[[31m✘ ^[[41;31m[^[[41;97mERROR^[[41;31m]^[[0m ^[[1mA request to the Cloudflare API (/accounts/<id>/vectorize/v2/indexes) failed.^[[0m
##[error]vectorize create ▸   Authentication error [code: 10000]
##[error]vectorize create ▸   To learn more about this error, visit: ^[[4mhttps://developers.cloudflare.com/api/resources/vectorize/subresources/indexes/methods/create^[[0m
##[error]vectorize create ▸ Please ensure it has the correct permissions for this operation.
##[error]vectorize create ▸ 🔓 To see token permissions visit https://dash.cloudflare.com/profile/api-tokens
##[error]vectorize create ▸ 🎢 Membership roles in "9r4rxssx64@privaterelay.appleid.com's Account": Contact account super admin to change your permissions.
##[error]vectorize get ▸ │ Account Name                                  │ Account ID                       │
##[error]vectorize get ▸ ├───────────────────────────────────────────────┼──────────────────────────────────┤
##[error]vectorize get ▸ │ 9r4rxssx64@privaterelay.appleid.com's Account │ *** │
##[error]vectorize get ▸ └───────────────────────────────────────────────┴──────────────────────────────────┘
##[error]vectorize get ▸ 🔓 To see token permissions visit https://dash.cloudflare.com/profile/api-tokens
##[error]vectorize get ▸ 🎢 Membership roles in "9r4rxssx64@privaterelay.appleid.com's Account": Contact account super admin to change your permissions.
##[error]vectorize get ▸ - Super Administrator - All Privileges
##[error]vectorize get ▸ 🪵  Logs were written to "/home/runner/.config/.wrangler/logs/wrangler-2026-09-22_21-45-40_300.log"
##[error]L'index Vectorize apex-memory N'EXISTE PAS sur le compte et n'a pas pu être créé (voir lignes ci-dessus : droit manquant du jeton CLOUDFLARE_API_TOKEN sur Vectorize, ou plan). Le worker kdmc-rag a un binding VEC dessus → wrangler deploy refusera (code 10159). Rien n'est déployé.
##[error]Process completed with exit code 1.
```

## ❌ Deploy KDMC RAG (mémoire Apex) — 22/09/2026 21:34 UTC

- **Branche** : `main` · **Commit** : `1d8bb453` · **Run** : `35787346798`
- **Ce qui a lâché** : deploy › Créer l'index Vectorize (idempotent) — et DIRE s'il n'existe pas
- **Journal complet** : https://github.com/9r4rxssx64-creator/CMCteams/actions/runs/35787346798
- **Ce que la machine a dit** :

```
^[[36;1m# not found [code 10159] » parce que cette création échouait EN SILENCE (|| true, journal^[[0m
^[[36;1m  { grep -iE 'error|✘|failed|code|permission|authoriz|plan' /tmp/vec.log || true; } | tail -10 | while IFS= read -r L; do echo "::error::vectorize create ▸ $L"; done^[[0m
^[[36;1m  tail -8 /tmp/vecget.log | while IFS= read -r L; do echo "::error::vectorize get ▸ $L"; done^[[0m
^[[36;1m  echo "::error::L'index Vectorize apex-memory N'EXISTE PAS sur le compte et n'a pas pu être créé (voir lignes ci-dessus : droit manquant du jeton CLOUDFLARE_API_TOKEN sur Vectorize, ou plan). Le worker kdmc-rag a un binding VEC dessus → wrangler deploy refusera (code 10159). Rien n'est déployé."^[[0m
^[[31m✘ ^[[41;31m[^[[41;97mERROR^[[41;31m]^[[0m ^[[1mA request to the Cloudflare API (/accounts/<id>/vectorize/v2/indexes) failed.^[[0m
  Authentication error [code: 10000]
  To learn more about this error, visit: ^[[4mhttps://developers.cloudflare.com/api/resources/vectorize/subresources/indexes/methods/create^[[0m
##[error]vectorize create ▸ ^[[31m✘ ^[[41;31m[^[[41;97mERROR^[[41;31m]^[[0m ^[[1mA request to the Cloudflare API (/accounts/<id>/vectorize/v2/indexes) failed.^[[0m
##[error]vectorize create ▸   Authentication error [code: 10000]
##[error]vectorize create ▸   To learn more about this error, visit: ^[[4mhttps://developers.cloudflare.com/api/resources/vectorize/subresources/indexes/methods/create^[[0m
##[error]vectorize create ▸ Please ensure it has the correct permissions for this operation.
##[error]vectorize create ▸ 🔓 To see token permissions visit https://dash.cloudflare.com/profile/api-tokens
##[error]vectorize create ▸ 🎢 Membership roles in "9r4rxssx64@privaterelay.appleid.com's Account": Contact account super admin to change your permissions.
##[error]vectorize get ▸ │ Account Name                                  │ Account ID                       │
##[error]vectorize get ▸ ├───────────────────────────────────────────────┼──────────────────────────────────┤
##[error]vectorize get ▸ │ 9r4rxssx64@privaterelay.appleid.com's Account │ *** │
##[error]vectorize get ▸ └───────────────────────────────────────────────┴──────────────────────────────────┘
##[error]vectorize get ▸ 🔓 To see token permissions visit https://dash.cloudflare.com/profile/api-tokens
##[error]vectorize get ▸ 🎢 Membership roles in "9r4rxssx64@privaterelay.appleid.com's Account": Contact account super admin to change your permissions.
##[error]vectorize get ▸ - Super Administrator - All Privileges
##[error]vectorize get ▸ 🪵  Logs were written to "/home/runner/.config/.wrangler/logs/wrangler-2026-09-22_21-33-51_084.log"
##[error]L'index Vectorize apex-memory N'EXISTE PAS sur le compte et n'a pas pu être créé (voir lignes ci-dessus : droit manquant du jeton CLOUDFLARE_API_TOKEN sur Vectorize, ou plan). Le worker kdmc-rag a un binding VEC dessus → wrangler deploy refusera (code 10159). Rien n'est déployé.
##[error]Process completed with exit code 1.
```

## ❌ Auto-merge Claude branches into main — 19/09/2026 18:47 UTC

- **Branche** : `claude/verify-cmcteams-light-data-rzlvau` · **Commit** : `c21cc0a9` · **Run** : `35461784637`
- **Ce qui a lâché** : auto-merge › Create & merge PR into main
- **Journal complet** : https://github.com/9r4rxssx64-creator/CMCteams/actions/runs/35461784637
- **Ce que la machine a dit** :

```
^[[36;1m  echo "::notice::Branche $BRANCH introuvable sur origin — rien à merger."^[[0m
^[[36;1m# AVANT sa vraie revue → merge trop tôt → CodeRabbit : « Review failed — PR^[[0m
^[[36;1m# buffer pour les commentaires ligne par ligne. Cap ~6 min, fail-open (on merge^[[0m
^[[36;1m# v2026-09-06 (leçon #214 « un échec invisible n'existe pas ») : les deux^[[0m
^[[36;1m# tentatives étaient suivies de `2>/dev/null` — la VRAIE cause du refus^[[0m
^[[36;1m  echo "::warning::PR #$PR — merge auto refusé. Cause exacte ci-dessous."^[[0m
^[[36;1m    echo "Ce fichier existe parce que le merge automatique a été REFUSÉ."^[[0m
^[[36;1m      commit -m "diag: pourquoi l'auto-merge de $BRANCH est refusé [skip ci]" || true^[[0m
##[warning]PR #3950 — merge auto refusé. Cause exacte ci-dessous.
[claude/verify-cmcteams-light-data-rzlvau b134f1851] diag: pourquoi l'auto-merge de claude/verify-cmcteams-light-data-rzlvau est refusé [skip ci]
##[error]Process completed with exit code 1.
```

## ❌ Auto-merge Claude branches into main — 19/09/2026 18:22 UTC

- **Branche** : `claude/verify-cmcteams-light-data-rzlvau` · **Commit** : `42a61a4e` · **Run** : `35460885124`
- **Ce qui a lâché** : auto-merge › Rattraper main avant la PR (journaux fusionnés en union, jamais bloqués)
- **Journal complet** : https://github.com/9r4rxssx64-creator/CMCteams/actions/runs/35460885124
- **Ce que la machine a dit** :

```
^[[36;1m    echo "::warning::main rattrapé localement mais push refusé (la session a poussé entre-temps ?) — la PR tentera quand même."^[[0m
^[[36;1m      || echo "::warning::rattrapage fait localement mais push refusé (la session a poussé entre-temps ?) — la PR tentera quand même."^[[0m
##[error]Process completed with exit code 128.
```

## ❌ KDMC — Déploie le routeur de domaine kd-mc.com (autonome) — 19/09/2026 18:22 UTC

- **Branche** : `claude/verify-cmcteams-light-data-rzlvau` · **Commit** : `42a61a4e` · **Run** : `35460885133`
- **Ce qui a lâché** : deploy › L'app reçoit-elle vraiment ses plannings ? (bloquant)
- **Journal complet** : https://github.com/9r4rxssx64-creator/CMCteams/actions/runs/35460885133
- **Ce que la machine a dit** :

```
départs de la page légère       0        0   ❌ HTTP 0 — fetch failed
##[error]Process completed with exit code 1.
```

## ❌ Auto-merge Claude branches into main — 19/09/2026 18:09 UTC

- **Branche** : `claude/verify-cmcteams-light-data-rzlvau` · **Commit** : `89685980` · **Run** : `35460214936`
- **Ce qui a lâché** : auto-merge › Rattraper main avant la PR (journaux fusionnés en union, jamais bloqués)
- **Journal complet** : https://github.com/9r4rxssx64-creator/CMCteams/actions/runs/35460214936
- **Ce que la machine a dit** :

```
^[[36;1m    echo "::warning::main rattrapé localement mais push refusé (la session a poussé entre-temps ?) — la PR tentera quand même."^[[0m
^[[36;1m      || echo "::warning::rattrapage fait localement mais push refusé (la session a poussé entre-temps ?) — la PR tentera quand même."^[[0m
##[error]Process completed with exit code 128.
```

## ❌ Auto-merge Claude branches into main — 19/09/2026 18:08 UTC

- **Branche** : `claude/verify-cmcteams-light-data-rzlvau` · **Commit** : `4ea537e2` · **Run** : `35460007305`
- **Ce qui a lâché** : auto-merge › Rattraper main avant la PR (journaux fusionnés en union, jamais bloqués)
- **Journal complet** : https://github.com/9r4rxssx64-creator/CMCteams/actions/runs/35460007305
- **Ce que la machine a dit** :

```
^[[36;1m    echo "::warning::main rattrapé localement mais push refusé (la session a poussé entre-temps ?) — la PR tentera quand même."^[[0m
^[[36;1m      || echo "::warning::rattrapage fait localement mais push refusé (la session a poussé entre-temps ?) — la PR tentera quand même."^[[0m
##[error]Process completed with exit code 128.
```

## ❌ Auto-merge Claude branches into main — 19/09/2026 17:53 UTC

- **Branche** : `claude/verify-cmcteams-light-data-rzlvau` · **Commit** : `44a7b0bb` · **Run** : `35459374639`
- **Ce qui a lâché** : auto-merge › Rattraper main avant la PR (journaux fusionnés en union, jamais bloqués)
- **Journal complet** : https://github.com/9r4rxssx64-creator/CMCteams/actions/runs/35459374639
- **Ce que la machine a dit** :

```
^[[36;1m    echo "::warning::main rattrapé localement mais push refusé (la session a poussé entre-temps ?) — la PR tentera quand même."^[[0m
^[[36;1m      || echo "::warning::rattrapage fait localement mais push refusé (la session a poussé entre-temps ?) — la PR tentera quand même."^[[0m
##[error]Process completed with exit code 128.
```

## ❌ Auto-merge Claude branches into main — 19/09/2026 17:22 UTC

- **Branche** : `claude/verify-cmcteams-light-data-rzlvau` · **Commit** : `96dc9a98` · **Run** : `35457528777`
- **Ce qui a lâché** : auto-merge › Rattraper main avant la PR (journaux fusionnés en union, jamais bloqués)
- **Journal complet** : https://github.com/9r4rxssx64-creator/CMCteams/actions/runs/35457528777
- **Ce que la machine a dit** :

```
^[[36;1m    echo "::warning::main rattrapé localement mais push refusé (la session a poussé entre-temps ?) — la PR tentera quand même."^[[0m
^[[36;1m      || echo "::warning::rattrapage fait localement mais push refusé (la session a poussé entre-temps ?) — la PR tentera quand même."^[[0m
##[error]Process completed with exit code 128.
```

## ❌ Auto-merge Claude branches into main — 19/09/2026 17:04 UTC

- **Branche** : `claude/verify-cmcteams-light-data-rzlvau` · **Commit** : `6479c04a` · **Run** : `35456720597`
- **Ce qui a lâché** : auto-merge › Rattraper main avant la PR (journaux fusionnés en union, jamais bloqués)
- **Journal complet** : https://github.com/9r4rxssx64-creator/CMCteams/actions/runs/35456720597
- **Ce que la machine a dit** :

```
^[[36;1m    echo "::warning::main rattrapé localement mais push refusé (la session a poussé entre-temps ?) — la PR tentera quand même."^[[0m
^[[36;1m      || echo "::warning::rattrapage fait localement mais push refusé (la session a poussé entre-temps ?) — la PR tentera quand même."^[[0m
##[error]Process completed with exit code 128.
```

## ❌ Auto-merge Claude branches into main — 19/09/2026 16:54 UTC

- **Branche** : `claude/verify-cmcteams-light-data-rzlvau` · **Commit** : `b44da246` · **Run** : `35456269901`
- **Ce qui a lâché** : auto-merge › Create & merge PR into main
- **Journal complet** : https://github.com/9r4rxssx64-creator/CMCteams/actions/runs/35456269901
- **Ce que la machine a dit** :

```
^[[36;1m  echo "::notice::Branche $BRANCH introuvable sur origin — rien à merger."^[[0m
^[[36;1m# AVANT sa vraie revue → merge trop tôt → CodeRabbit : « Review failed — PR^[[0m
^[[36;1m# buffer pour les commentaires ligne par ligne. Cap ~6 min, fail-open (on merge^[[0m
^[[36;1m# v2026-09-06 (leçon #214 « un échec invisible n'existe pas ») : les deux^[[0m
^[[36;1m# tentatives étaient suivies de `2>/dev/null` — la VRAIE cause du refus^[[0m
^[[36;1m  echo "::warning::PR #$PR — merge auto refusé. Cause exacte ci-dessous."^[[0m
^[[36;1m    echo "Ce fichier existe parce que le merge automatique a été REFUSÉ."^[[0m
^[[36;1m      commit -m "diag: pourquoi l'auto-merge de $BRANCH est refusé [skip ci]" || true^[[0m
pull request create failed: GraphQL: Head sha can't be blank, Base sha can't be blank, No commits between main and claude/verify-cmcteams-light-data-rzlvau, Head ref must be a branch (createPullRequest)
##[error]Process completed with exit code 1.
```

## ❌ Auto-merge Claude branches into main — 19/09/2026 16:25 UTC

- **Branche** : `claude/verify-cmcteams-light-data-rzlvau` · **Commit** : `c2fbdab1` · **Run** : `35454721961`
- **Ce qui a lâché** : auto-merge › Create & merge PR into main
- **Journal complet** : https://github.com/9r4rxssx64-creator/CMCteams/actions/runs/35454721961
- **Ce que la machine a dit** :

```
^[[36;1m  echo "::notice::Branche $BRANCH introuvable sur origin — rien à merger."^[[0m
^[[36;1m# AVANT sa vraie revue → merge trop tôt → CodeRabbit : « Review failed — PR^[[0m
^[[36;1m# buffer pour les commentaires ligne par ligne. Cap ~6 min, fail-open (on merge^[[0m
^[[36;1m# v2026-09-06 (leçon #214 « un échec invisible n'existe pas ») : les deux^[[0m
^[[36;1m# tentatives étaient suivies de `2>/dev/null` — la VRAIE cause du refus^[[0m
^[[36;1m  echo "::warning::PR #$PR — merge auto refusé. Cause exacte ci-dessous."^[[0m
^[[36;1m    echo "Ce fichier existe parce que le merge automatique a été REFUSÉ."^[[0m
^[[36;1m      commit -m "diag: pourquoi l'auto-merge de $BRANCH est refusé [skip ci]" || true^[[0m
pull request create failed: GraphQL: Head sha can't be blank, Base sha can't be blank, No commits between main and claude/verify-cmcteams-light-data-rzlvau, Head ref must be a branch (createPullRequest)
##[error]Process completed with exit code 1.
```

## ❌ Auto-merge Claude branches into main — 19/09/2026 16:10 UTC

- **Branche** : `claude/verify-cmcteams-light-data-rzlvau` · **Commit** : `f2982971` · **Run** : `35453945593`
- **Ce qui a lâché** : auto-merge › Create & merge PR into main
- **Journal complet** : https://github.com/9r4rxssx64-creator/CMCteams/actions/runs/35453945593
- **Ce que la machine a dit** :

```
^[[36;1m  echo "::notice::Branche $BRANCH introuvable sur origin — rien à merger."^[[0m
^[[36;1m# AVANT sa vraie revue → merge trop tôt → CodeRabbit : « Review failed — PR^[[0m
^[[36;1m# buffer pour les commentaires ligne par ligne. Cap ~6 min, fail-open (on merge^[[0m
^[[36;1m# v2026-09-06 (leçon #214 « un échec invisible n'existe pas ») : les deux^[[0m
^[[36;1m# tentatives étaient suivies de `2>/dev/null` — la VRAIE cause du refus^[[0m
^[[36;1m  echo "::warning::PR #$PR — merge auto refusé. Cause exacte ci-dessous."^[[0m
^[[36;1m    echo "Ce fichier existe parce que le merge automatique a été REFUSÉ."^[[0m
^[[36;1m      commit -m "diag: pourquoi l'auto-merge de $BRANCH est refusé [skip ci]" || true^[[0m
pull request create failed: GraphQL: Head sha can't be blank, Base sha can't be blank, No commits between main and claude/verify-cmcteams-light-data-rzlvau, Head ref must be a branch (createPullRequest)
##[error]Process completed with exit code 1.
```

## ❌ KDMC — Déploie le routeur de domaine kd-mc.com (autonome) — 19/09/2026 14:24 UTC

- **Branche** : `claude/verify-cmcteams-light-data-rzlvau` · **Commit** : `f0a8d662` · **Run** : `35448582758`
- **Ce qui a lâché** : deploy › Le domaine sert-il vraiment les 31 adresses ? (bloquant)
- **Journal complet** : https://github.com/9r4rxssx64-creator/CMCteams/actions/runs/35448582758
- **Ce que la machine a dit** :

```
=== 32 servies / 0 en échec ===
##[error]Process completed with exit code 1.
```

## ❌ KDMC — Publie le site sur Cloudflare Pages (pour que le dépôt puisse être PRIVÉ) — 19/09/2026 14:24 UTC

- **Branche** : `claude/verify-cmcteams-light-data-rzlvau` · **Commit** : `f0a8d662` · **Run** : `35448582768`
- **Ce qui a lâché** : publier › Vérifier l'adresse STABLE (celle qu'attend le routeur)
- **Journal complet** : https://github.com/9r4rxssx64-creator/CMCteams/actions/runs/35448582768
- **Ce que la machine a dit** :

```
^[[36;1m  echo "::error::l'adresse STABLE $STABLE ne répond pas (HTTP $code) — NE PAS basculer le routeur dessus"^[[0m
^[[36;1m  echo "::error::l'adresse stable $STABLE ne sert pas toutes les adresses — bascule interdite"^[[0m
^[[36;1m  head -25 sonde-stable.log | while IFS= read -r l; do echo "::error::$l"; done^[[0m
=== 32 servies / 0 en échec ===
##[error]l'adresse stable https://kdmc-site-bj5.pages.dev ne sert pas toutes les adresses — bascule interdite
##[error]Sonde de 32 adresses sur https://kdmc-site-bj5.pages.dev (servi à la racine)
##[error]adresse                        HTTP   contenu
##[error]────────────────────────────────────────────────
##[error]✅ kd-mc.com                    200    23432 car.
##[error]✅ www.kd-mc.com                200    23432 car.
##[error]✅ cmcteams.kd-mc.com           200  3382632 car.
##[error]✅ apex-ai.kd-mc.com            200    23571 car.
##[error]✅ apex-chat.kd-mc.com          200   855110 car.
##[error]✅ la-detente.kd-mc.com         200     5786 car.
##[error]✅ chez-lolo.kd-mc.com          200   109823 car.
##[error]✅ dashboard.kd-mc.com          200    41865 car.
##[error]✅ sourcing.kd-mc.com           200    12559 car.
##[error]✅ coffre.kd-mc.com             200    53666 car.
##[error]✅ departs.kd-mc.com            200   174389 car.
##[error]✅ cmcteams-light.kd-mc.com     200   174389 car.
##[error]✅ bot.kd-mc.com                200    32155 car.
##[error]✅ beatbot.kd-mc.com            200   156883 car.
##[error]✅ autorisations.kd-mc.com      200    40283 car.
##[error]✅ arbre.kd-mc.com              200   315106 car.
##[error]✅ lingua.kd-mc.com             200    70275 car.
##[error]✅ studio.kd-mc.com             200   419944 car.
##[error]✅ cuisine.kd-mc.com            200   310280 car.
##[error]✅ cocina.kd-mc.com             200   310280 car.
##[error]✅ cujina.kd-mc.com             200   310280 car.
##[error]Process completed with exit code 1.
```

## ❌ Auto-merge Claude branches into main — 19/09/2026 02:15 UTC

- **Branche** : `claude/verify-cmcteams-light-data-rzlvau` · **Commit** : `95d153ca` · **Run** : `35414890314`
- **Ce qui a lâché** : auto-merge › Rattraper main avant la PR (journaux fusionnés en union, jamais bloqués)
- **Journal complet** : https://github.com/9r4rxssx64-creator/CMCteams/actions/runs/35414890314
- **Ce que la machine a dit** :

```
^[[36;1m    echo "::warning::main rattrapé localement mais push refusé (la session a poussé entre-temps ?) — la PR tentera quand même."^[[0m
^[[36;1m      || echo "::warning::rattrapage fait localement mais push refusé (la session a poussé entre-temps ?) — la PR tentera quand même."^[[0m
##[error]Process completed with exit code 128.
```
