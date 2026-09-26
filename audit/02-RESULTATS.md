# audit/02 — RÉSULTATS (matrice de test réelle)

> Loi 1 : PREUVE. Ci-dessous = sorties réelles exécutées cette passe (2026-07-14, branche `claude/audit-passe-1`).

## Santé globale ✅ VÉRIFIÉ

| Test | Commande | Résultat |
|---|---|---|
| Build / syntaxe mono-fichier | `npm run test:check-syntax` | **exit 0** (JS combiné sans séparateur valide) |
| **Gate complet (45 scripts)** | `npm run test:ci` | **TESTCI_EXIT=0** — 0 FAIL sur toutes les suites |
| Secrets en dur (P0) | `grep sk-ant-api[0-9]` hors tests | **0 occurrence** |

### Détail des suites du gate (toutes FAIL:0) — extraits de sortie réelle
```
test:validated-teams   PASS: 16 · FAIL: 0
test:v808 dailyCodes   PASS: 1 · FAIL: 0
test:v810b géométrie   PASS: 4 · FAIL: 0
test:garro-cp encadré  PASS: 8 · FAIL: 0
test:vplan             PASS: 9 · FAIL: 0
test:verify            PASS: 18 · FAIL: 0
test:pw-noclear        8 OK / 0 KO
TESTCI_EXIT=0
```
Le gate couvre le **cœur métier critique** : import PDF SBM (fidélité, couverture, homonymes, everyone-has-planning, v2-codes, space-format, géométrie), détection équipes/miroirs (team-rule, teams-compare, validated-teams), ordres de départ (algo/render/compare/sync), auth (pin, faceid, guards), couleurs convention, seed, école roulettes, baccara-chef, RGPD-adjacent (pw-noclear, guards), inbox Kevin, fiche perso.

## Matrice fonctionnelle (référence `01-FONCTIONS.md`)

| Domaine | Vues | Statut test |
|---|---|---|
| Import/parsing PDF | F21–F29, F85, F101 | ✅ prouvé (11+ scripts) |
| Départs (ordres) | F15 | ✅ prouvé (5 scripts, app==page cellule par cellule) |
| Équipes/miroirs | F14, F16 | ✅ prouvé (règle repos+codes, 0 écart) |
| Auth / PIN / Face ID / guards | F01–F06, F17, F69, F70–F73 | ✅ prouvé |
| Planning perso / affichage | F12, F14 | ✅ prouvé |
| Comm (chat, inbox Kevin) | F30, F31, F68 | ✅ prouvé |
| Studios / Live / Geo / Stats secondaires | ~F32–F102 (≈60 vues) | ☐ **non couvert par test dédié** (angle mort — cf. `05-JOURNAL.md` auto-critique) |

## Cas métier du brief (Phase 5) — état réel
| Cas | Statut | Note |
|---|---|---|
| Import lossless / tout le monde a un planning | ✅ VÉRIFIÉ | `test:everyone-has-planning`, `test:coverage`, `test:fidelity` |
| Homonymes (‹employé›≠J…) non fusionnés | ✅ VÉRIFIÉ | `test:homonyms` 3/3 |
| Reproduction fidèle (couleurs/codes/suffixes) | ✅ VÉRIFIÉ | `test:fidelity`, `test:conv-colors` |
| Planning vide → empty state | 🟡 DÉDUIT | vMonPlanning gère « aucun planning » |
| 2 croupiers même table/horaire | 🔴 NON PROUVÉ | pas de test d'affectation live dédié |
| Croupier CMC+CDP simultané | 🔴 NON PROUVÉ | idem |
| Galerie ~75 img : lazy/alt | ✅ VÉRIFIÉ | `vGalerie` a `loading="lazy"` + `alt` |
| Appel IA : clé/timeout/échec | ✅ VÉRIFIÉ (lecture) | AbortController 12 s, `catch`, proxy possible ; clé en clair localStorage = F-C1 |

**Conclusion résultats :** le **cœur métier est prouvé vert** (gate exit 0). L'angle mort mesuré = les ~60 vues périphériques sans test dédié + 2 cas de conflit d'affectation live. Aucune régression introduite (seuls des fichiers `audit/*.md` ajoutés — 0 changement de code applicatif).
