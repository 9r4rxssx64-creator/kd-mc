# Tests CMCteams — Runtime audit Playwright

Tests d'intégration qui exécutent `index.html` dans Chromium (UA iPhone Safari) pour valider le comportement réel — pas juste audit grep statique.

## Installation

```bash
npm install                  # installe playwright 1.56.0 (épinglé)
npm run playwright:install   # télécharge Chromium si absent
npm run playwright:check     # vérifie que Chromium se lance bien
```

### Chromium / Playwright — environnement

- `playwright` est **épinglé à `1.56.0`** (`package.json`) — sa révision
  Chromium intégrée (**chromium-1194 / Chromium 141**) correspond au navigateur
  pré-installé dans l'environnement Claude Code web (`/opt/pw-browsers`).
  ⚠ Ne PAS repasser en `^1.x` : un Playwright plus récent réclame une révision
  Chromium non pré-installée → erreur `Executable doesn't exist`.
- La variable `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` (fournie par
  l'environnement) permet à Playwright de trouver ce Chromium sans
  téléchargement réseau.
- Un hook `SessionStart` (`.claude/settings.json`) vérifie au démarrage de
  chaque session que `playwright@1.56` est présent, sinon lance `npm install`.
- Apex (`apex-ai/v13/`) : `@playwright/test` est aussi épinglé à `1.56.0`.

## Commandes

| Commande | Description |
|---|---|
| `npm test` | Lance `runtime-audit.mjs` (suite principale, tests de régression — **le nombre exact est celui qu'affiche l'exécution** (`runtime-audit.mjs` imprime lui-même son total ; les valeurs « 147 » et « 34+ » qui traînaient dans ce fichier se contredisaient) + E2E V1↔V2 + perf) |
| `npm run test:runtime` | Idem |
| `npm run test:encadres` | Test spécifique encadrés statuts SBM (‹employé› → CP) |
| `npm run test:all` | Lance les **21** suites enchaînées (mesuré 6.09.2026) |
| `npm run test:check-syntax` | `node --check` JS combiné (méthode CLAUDE.md erreur #32) |
| `npm run test:ci` | check-syntax + **~115 scripts** enchaînés (mesuré 6.09.2026) (utilisé en CI) |
| `npm run playwright:install` | (Re)installe les browsers Playwright |

## Fixtures

- `tests/fixtures/mai-2026-v1-encadres.txt` — texte PDF source SBM mai 2026 V1 (extrait par Kevin sur iPhone via bouton "📋 Exporter PDF source diag")

## Suites de tests

### `runtime-audit.mjs` (suite principale)

Charge `index.html` dans Chromium et exécute :

1. **tests de régression (voir la note ci-dessus : ne pas figer le nombre)** via `_cmcRunParserTests()` (registry `CMC_PARSER_TESTS`)
   - SW01-SW05 : scoped wipe V1↔V2
   - VS01-VS31 : meta cells, FF, étoiles, decisionMode, cache, sentinelle...
2. **E2E V1→V2 cohabitation** : injecte employé V1 + cadre V2, vérifie scoped-wipe préserve correctement
3. **Perf cache empById** : 1000 appels, vérifie memoization stable
4. **Sentinelle meta-completeness-watch** : exécution sans throw
5. **Erreurs console APP** (réseau filtré via `isNetworkNoise()`)

Filtre les erreurs CDN externes (Firebase, Google Fonts) qui ne se chargent pas en `file://` mais ne sont pas des bugs app.

### `runtime-audit-encadres.mjs` (suite spécialisée)

Injecte un texte PDF source réel (fixture) + appelle `_parseEncadresStatuts` + vérifie que les employés des sections "N CP du au" / "N M du au" / "N FORMATION du au" sont correctement classés.

Sortie attendue : ‹employé› → CP × 31 cells, ‹employé› → CP × 31 cells.

## CI workflow

`.github/workflows/cmc-runtime-audit.yml` lance les tests à chaque push sur `claude/fix-cms-teams-import-*` ou `main` + PR. Bloque le merge si tests fail.

## Ajout d'un nouveau test régression

Édite `CMC_PARSER_TESTS` dans `index.html` :

```js
{id:"VS32",label:"description claire", input:"contexte",
  customCheck:function(){
    // setup, action, assert
    return true; // ou {skipped:true, reason:"..."}
  }}
```

Tous les helpers `_cmc*` et `cmc*` sont disponibles dans le contexte (chargés dans `index.html`).

## Débugger un test qui fail

```bash
# Lancer en mode headed (voir le browser)
HEADLESS=false node tests/runtime-audit.mjs

# Ouvrir DevTools auto
DEVTOOLS=1 node tests/runtime-audit.mjs
```

Note : les modes `HEADLESS=false` et `DEVTOOLS=1` ne sont pas wirés dans le script actuel — à ajouter si besoin.
