# DOSSIER REPRISE — CMCteams import planning SBM

> Document de reprise pour repartir propre dans une nouvelle conversation.
> Dernière mise à jour : v9.725 — 2026-05-21.

---

## 1. CONTEXTE PROJET

- **CMCteams** : app planning Casino de Monaco. SPA monofichier `index.html` (~2.9 MB, JS vanilla ES5 — `var` uniquement, pas de `const`/`let`/arrow), français.
- Repo : `9r4rxssx64-creator/cmcteams`. Branche dev : **`claude/fix-cms-teams-import-bgkHk`** (un auto-merge bot pousse vers main ; GitHub Pages déploie main).
- Version : **v9.725** — `APP_VER` ligne ~5326, `sw.js` const `CACHE='cmcteams-v9.725'`. **Toujours bumper `APP_VER` ET `sw.js` ensemble dans le même commit.**
- Kevin = admin (AID `U11804`), **non-codeur**, travaille sur **iPhone**, souvent frustré du temps perdu. Lui parler simple, sans jargon. Ne jamais prétendre "fait" sans avoir testé.

---

## 2. LE PROBLÈME

À l'import du PDF planning SBM (mois courant = mai 2026) :
- Équipes mal détectées, familles mélangées (ex : "BJ Éq.1" affichée sous "Jeux européen").
- Cadres (Pit Boss/Superviseur/Inspecteur) avec des horaires alors qu'aucun planning cadre n'a été importé.
- Chefs confondus avec des cadres / homonymes confondus (‹employé› ≠ ‹employé› = frères).
- "Ma section" (équipe de l'utilisateur + miroir) pas affichée en premier ; rien d'écrit dans les noms d'équipe.

Objectif validé par Kevin via AskUserQuestion — **"les trois d'affilée"** :
1. **Détection** : chaque colonne du PDF = 1 équipe distincte ; familles BJ/Roulettes/CMC jamais mélangées.
2. **Ma section** : équipe utilisateur + miroir en tête de vPlan/vDeparts ; familles fermées par défaut ; **par-user** (chacun centré sur sa propre équipe).
3. **Lisibilité**.

---

## 3. ARCHITECTURE TECHNIQUE UTILE

- **PDF SBM** : 2 moitiés.
  - 1ʳᵉ moitié = listes de noms sous en-têtes de rotation (`<count> <code> du au` répétés = N colonnes).
  - 2ᵉ moitié = grille : chaque ligne employé = `<codePoste> <NOM Initiale> <1> <31> <31 cellules jour>`.
  - Sections : "Roulettes", "Chefs black Jack/Responsable de Table", "Employés cartes CMC" (+ "aménagement"). V2 = import contenant les cadres.
- **Suffixes de code** : `c`=chef BJ, `"`=CMC, `'`=convention, `*`=marqueur CDP.
- **Stockage** : `A.overrides[YYYY-M][empId]={1:"20/5",...}`, `emp.teamHistory[YYYY-M]`, `emp.familyHistory[YYYY-M]`, `cmc_team_mirror_<key>`, `cmc_import_src_<key>`. `emp.team` = équipe statique DEF_EMP (NE PAS l'utiliser comme équipe courante — l'équipe change chaque mois).
- **Familles** : `bj`→"Jeux américains", `roulettes`→"Jeux européen", `cmc`→"Groupe ouvert", `cadres`→"Cadres (Pit Boss/Sup)".
- **Fonctions de détection** :
  - `_cmcDetectTeamsByPdfColumn` (~ligne 34509) — parse les en-têtes de rotation, remplit chaque colonne verticalement.
  - `_cmcDetectTeamsByRestPattern` (~ligne 34787) — groupe par jours de repos identiques (fallback).
  - Wirées dans `_postValidateImport` (~ligne 35022) en hybride.
- **Règle métier équipe (vérité terrain)** : équipe = mêmes jours RH + même code de travail de base ; miroir = mêmes jours RH + code de base différent (ex `20/5` ⇌ `22/6'`). Les absences (AF/CP/M/RRT/PRT) écrasent les cellules → **ne jamais grouper sur la string horaire brute**.

---

## 4. TRAVAIL DÉJÀ FAIT ET POUSSÉ (v9.721 → v9.725, tous 153/153 tests OK)

### v9.721 — `_cmcEnsureTeam`
~ligne 4833, après `gt()`. Cause racine de "Ma section invisible" : la détection écrivait `teamHistory` avec des IDs séquentiels ("7","11"…"r9") absents de `A.teams` → `gt()` retournait null → vPlan/vDeparts ne trouvaient rien.

```js
function _cmcEnsureTeam(tid){
  if(!tid)return null;
  var t=gt(tid);if(t)return t;
  var s=String(tid);
  var fam=/^r/i.test(s)?"roulettes":/^c/i.test(s)?"cmc":"bj";
  var num=s.replace(/[^0-9]/g,"")||"?";
  var nm=fam==="roulettes"?("Roul. Éq."+num):fam==="cmc"?("CMC Éq."+num):("BJ Éq."+num);
  var pal=["#c9a227","#4a72a8","#3a8a50","#a84868","#c07830","#2a9a9a","#8a5aa8","#b06840"];
  var nt={id:s,name:nm,color:pal[(parseInt(num,10)||0)%pal.length],family:fam,departureOrder:(parseInt(num,10)||1),_auto:true};
  A.teams.push(nt);
  return nt;
}
```

Wiré dans : vPlan (~23698 `var utid=_myTeamId||null;if(utid)_cmcEnsureTeam(utid);`), vDeparts (~24148), `_cmcMirrorTeam` (~4843 `if(mp[tid])return _cmcEnsureTeam(mp[tid]);`), et les 2 fonctions de détection (qui persistent `ls("cmc_t",A.teams)`).

### v9.722 — lisibilité grille
Cellule-coin sticky des grilles (vPlan `_renderTeamBlock` ~23932, vDeparts ~24370) passée de `background:rgba(6,14,7,.22)` (78% transparent) à `background:#0b1409` opaque + `z-index:6`. Avant, les dates glissaient SOUS le nom d'équipe au scroll horizontal → illisible.

### v9.723 — homonymes à l'import
Fonction de matching nom ~ligne 37711 :
- Fallback cadre (v9.126) : maintenant gardé `if(!_fe && importFamily==="cadres"){` ET match d'initiale obligatoire (`!_initP||!_initD||_initP===_initD`). Avant, il matchait "‹employé›" (chef du PDF V1) à "‹employé›" (cadre) **par nom de famille seul, sans vérifier l'initiale, même hors import cadres** → cadre avec horaire.
- Fallback bigram ≥0.85 (~37703) : rejette désormais si même nom de famille + initiales ≤2 chars différentes (`_diffHomonym`).

### v9.724 — purge historique
Bloc boot (~15099) flag `cmc_v724_purge_done`, admin only, appelle `cmcWipeAllPlanningMemory(true)` (efface tous mois `A.overrides`, teamHistory, familyHistory, snapshots `cmc_history_*`, shadow IndexedDB, nodes Firebase). Le flag n'est posé QUE si le wipe a réellement tourné.

### v9.725 — inversion famille
`_cmcDetectTeamsByPdfColumn` (~34778) : `emp.familyHistory[key]=fm;` (écrasement inconditionnel) → `if(!emp.familyHistory[key])emp.familyHistory[key]=fm;`. Il y a 2 écrivains de `familyHistory` : le parser de grille (~38404, FIABLE — utilise les en-têtes de section PDF) et pdf-column (curseur fragile de la 1ʳᵉ moitié, désaligné par les colonnes statut M/CP). pdf-column tournait APRÈS et écrasait la bonne valeur. Le write conditionnel garde le parser de grille comme source de vérité tout en restant testable en isolation.

---

## 5. CE QUI RESTE / EN ATTENTE — BLOQUANT

Kevin doit (1) **recharger l'app** (récupère v9.725, déclenche la purge auto) et (2) **ré-importer son PDF de mai**. Les fixes v9.723/v9.725 agissent **au moment de l'import** — les anciennes données importées avant restent fausses.

**NE PAS faire de nouvelles modifs de détection à l'aveugle.** Attendre un **export diagnostic pris APRÈS ré-import**. S'il reste des bugs : l'algo de **comptage/groupement** des équipes (`_cmcDetectTeamsByRestPattern` ~34787) n'a PAS été réécrit — c'est le candidat #1 (Kevin voyait "30 éq" anormales). Le diagnostiquer contre les vraies données + la vérité terrain.

---

## 6. VÉRITÉ TERRAIN (NOTES_USER.md)

- Lignes 181-185 : équipes Roulettes 1/2/3 + miroirs mai 2026 (référence pour valider la détection).
- Lignes 65-92 : liste des homonymes (frères : ‹employé›/J, ‹employé›/C, ‹employé›/J, etc.).
- Lignes 61-63, 114 : **cadres = AUCUNE équipe**, n'existent qu'après import V2.
- Lignes 176-177 : règle de détection équipe/miroir par jours de repos.
- Toujours **relire NOTES_USER.md avant de toucher au parser** — ne jamais inventer de codes/mots-clés.

---

## 7. LEÇONS APPRISES — CE QU'IL NE FAUT PAS REPRODUIRE

1. **Ne jamais grouper les équipes sur la string horaire brute** : les absences écrasent les cellules. Grouper sur jours de repos + code de base.
2. **`emp.team` ≠ équipe courante** : c'est la valeur statique DEF_EMP. L'équipe change chaque mois → toujours lire `teamHistory[YYYY-M]`.
3. **Quand une fonction écrit une donnée déjà écrite ailleurs**, vérifier l'ordre d'exécution et qui est la source fiable. Si une source fragile tourne après une source fiable et écrase → write conditionnel (`if(!x)x=...`). C'est exactement le bug v9.725.
4. **Tester en isolation ≠ tester en flux réel** : v9.725 a d'abord cassé `test:v719` car le test appelle `_cmcDetectTeamsByPdfColumn` seul, sans le parser de grille. Le write conditionnel marche dans les deux cas.
5. **Matching de noms : initiale OBLIGATOIRE** pour les homonymes. Jamais matcher par nom de famille seul. ‹employé› et ‹employé› sont deux personnes différentes (frères).
6. **Tout fallback de matching cadre doit être gardé par `importFamily==="cadres"`** — sinon un chef d'un import V1 atterrit sur une fiche cadre et hérite d'un horaire.
7. **Les fixes à l'import n'agissent pas rétroactivement** : toujours dire à Kevin de ré-importer après un fix parser. Sinon il voit l'ancien état et croit que rien n'a changé.
8. **Ne jamais corriger la détection "à l'aveugle"** : exiger un export diagnostic réel post-import avant de toucher l'algo. Erreur #25 CLAUDE.md : corrections génériques et vérifiées, pas hardcodées au cas signalé.
9. **Détection critique = multi-stratégie + tests** : un parser monolithique échoue silencieusement sur les variations PDF. Erreur #36 CLAUDE.md.
10. **Cellule-coin sticky doit être opaque** : un fond transparent laisse passer le contenu scrollé en dessous.
11. **Vérifier que la branche de dev est bien mergée** (erreurs #33/#45 CLAUDE.md) : checklist début de session — `git log --oneline main..HEAD | wc -l`, si > 3 commits non mergés → merger d'abord.
12. **Honnêteté** : jamais "fait" sans test réel. Mesurer, ne pas estimer. Si Kevin redemande le même fix → la cause racine n'a pas été comprise, livrer un outil de diagnostic plutôt que des patches aveugles (erreur #56).

---

## 8. TESTS

- `npm run test:all` (19 suites Playwright).
- `npm run test:check-syntax` (syntaxe JS — combine les blocs `<script>` SANS séparateur, méthode du pre-commit hook).
- `npm run test:kevin` (oracle vérité terrain).
- `npm run test:v719` (12 checks détection par colonne).
- Référence actuelle : **153/153 OK** sur v9.725.

---

## 9. RÈGLES DE TRAVAIL

- Brancher uniquement `claude/fix-cms-teams-import-bgkHk`. Jamais push direct main. Jamais force-push/reset --hard. Jamais `--no-verify`.
- `esc()` sur toute donnée utilisateur avant `innerHTML`. Guards admin `if(!A.user||A.user.id!==AID)return;` sur fonctions destructrices.
- Bumper `APP_VER` + `sw.js` CACHE ensemble. Mettre à jour la table d'historique dans CLAUDE.md.
- Mobile-first 375px. JS ES5 strict (var only).
