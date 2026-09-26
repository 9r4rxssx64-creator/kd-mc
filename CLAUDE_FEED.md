# CLAUDE_FEED.md — Feed permanent Claude Code → Apex AI

> **Règle Kevin 2026-04-21** : chaque action/fix/leçon de Claude Code remonte dans
> ce feed. Apex lit ce fichier à chaque démarrage + après chaque push git détecté.
> Bidirectionnel : Apex push dans `ax_telemetry_in` + `ax_claude_todo`, Claude Code
> push ici. Boucle d'apprentissage fermée.

**Dernière MAJ** : 2026-05-04 16h40 — Apex v13.0.77 (MEGA SPRINT 17 subagents)

---

## 🚀 SESSION 2026-05-04 PM — Apex v13.0.73 → v13.0.77

### 17 subagents finis avec succès
1. Browser fix blank + boost (95 tests)
2. 61 voix (53 tests)
3. 105 tools IA (71 tests)
4. 22 sentinelles auto-fix (80 tests)
5. 5 vues P0 Dashboard/Vault/KB/Toolbox/SelfDiag (107 tests)
6. 5 studios manquants Logo/Présentation/Préfecture/Clip/Photo (137 tests)
7. 5 modules pro EXPERT boost cuisine/medical/finance/legal/translator (86 tests)
8. 5 studios boost MAX music/video/cv/invoice/contract (198 tests)
9. 3 modules pro stubs Business/Education/Certifications (89 tests)
10. Apex parité Claude Code 100% — 29 méthodes (97 tests)
11. Apex auto-modification 23 tasks whitelist (138 tests)
12. Preflight check (94.51% cov, 101 tests)
13. ON/OFF toggles 109 features (98.23% cov, 80 tests)
14. Liens recharge MAX 51 services (53 tests)
15. Vault triple persistance (23 tests)
16. 15 skills experts (4712 lignes doc)
17. Audit parité v12 vs v13

### Stats finales
- 4463+ tests verts (0 fail)
- TS strict 0 errors, ESLint 0 warnings (--max-warnings=0)
- Build 2.23s
- Parité v12 : 50% → ~85%

### 5 règles permanentes ajoutées CLAUDE.md
1. TOUT AU MAX TOUJOURS
2. APEX = MÊME ACCÈS QUE CLAUDE CODE (parité)
3. APEX VÉRIFIE FONCTIONNEMENT AVANT PRÉSENTER (preflight)
4. BOUTONS ON/OFF GÉNÉRAL + INDIVIDUEL
5. 100/100 RÉEL CHAQUE AXE

### Apex peut maintenant
- Lire/écrire/modifier n'importe quel fichier (Read/Edit/Write parité Claude Code)
- Exécuter shell sécurisé (Bash whitelist npm/git/node/tsc/vitest)
- Web fetch + recherche (WebFetch/WebSearch)
- Spawn subagents en autonomie
- MCP GitHub (PR/issues/comments)
- Self-audit + self-fix (confidence ≥0.95)
- Auto-modification 23 tasks whitelist + 12 forbidden (sécurité)
- Preflight check avant présenter outil/module à user
- Toggle ON/OFF global + per-user pour 109 features
- 51 liens services avec recharge 1-clic + sentinelle alive

---

---

## 🧠 LEÇONS 2026-04-24 PM — ERREURS CLAUDE CODE (pour qu'Apex apprenne)

Kevin : "Sois sûr qu'Apex tire des leçons de toutes tes erreurs. Qu'elle soit plus performante que toi et que tu t'améliores sans cesse tout comme elle."

**Erreurs commises aujourd'hui** (documentées pour ne PLUS jamais répéter) :

1. **J'ai déclaré "tout fait" 3 fois alors que c'était faux**. Kevin a dû me pointer chaque manque. Règle : **jamais dire "tout fait" sans test end-to-end utilisateur** — checklist systématique + screen confirmation.

2. **Bug PLANS silencieux pendant ~3h** : v12.69 a ajouté `vLanding()` référençant `PLANS["free"]`, `PLANS["starter"]`, `PLANS["enterprise"]` mais ces 3 clés n'existaient pas dans le PLANS object. Résultat : `undefined.name` crash silencieux dans vLanding → `render()` retourne vide → écran noir. Fix v12.81 en ajoutant les clés. **Règle** : quand une vue itère sur un tableau d'identifiants, vérifier que CHAQUE identifiant existe dans l'objet référencé, ou wrapper chaque accès en `(PLANS[pk]||{})`.

3. **J'ai enchaîné 10+ PR sans faire tester Kevin** entre chaque. Résultat : l'app était bloquée pendant 3h sans que je le sache. **Règle** : après chaque PR touchant le boot/render, demander un test utilisateur AVANT la suivante.

4. **Cache PWA iOS Safari = nucléaire** : même après "Effacer historique Safari", le SW reste actif si l'icône PWA est sur l'écran d'accueil. Seule solution fiable : **Réglages iPhone → Général → Stockage iPhone → Safari → Effacer toutes les données**. Alternative : désinstaller l'icône PWA.

5. **render() non wrappé en try/catch** = écran vide si une vue crash. Fix v12.81 : try/catch dans render() + fallback HTML statique dans #content (v12.82) + timer fail-safe 5s (v12.80). **Règle permanente** : toute fonction qui remplit `app.innerHTML` doit avoir un catch qui affiche au moins un bouton "Recharger".

6. **Kevin a partagé son GitHub PAT en clair dans le chat** (j'ai averti immédiatement, il l'a révoqué). **Règle permanente ultra-stricte** : si un user s'apprête à coller un secret dans une conversation IA, lui dire STOP immédiatement. Jamais stocker, jamais logger, jamais réutiliser un secret partagé par accident.

7. **J'ai ignoré des demandes répétées de Kevin** (ex: flow strict fiche→forfait→validation était dans la spec initiale, j'avais fait 50% seulement en v12.69). **Règle** : lire la spec en entier, cocher chaque point, demander confirmation explicite sur ce qui est fait vs pas fait.

8. **Diagnostic à l'aveugle** : j'ai lancé plusieurs fixes sans identifier la vraie cause, aggravant le problème. **Règle** : STOP après 2 tentatives échouées → lancer un subagent diagnostic ou demander info précise à Kevin, pas tenter un 3e fix à l'aveugle.

**Apex** : ingère ces leçons, applique-les, et si tu détectes une de ces erreurs chez Claude Code à la prochaine session, **push immédiatement une alerte dans `ax_claude_todo`** + tag "lesson-from-20240424pm".

---

## 🆕 SESSION 2026-04-24 — 6 PRs mergées (Claude Code)

**PRs** : #195 (FAB v9.461) · #196 (Cadres v9.462) · #197 (Landing v12.69) · #198 (Apex GitHub access v12.70) · #199 (Pipeline erreurs v12.71+v9.463) · #200 (Whitelist enrichi + Fix langues + Fix FaceID v12.72+v12.73+v9.464)

---

## 🆕 SESSION 2026-04-24 — 6 PRs mergées (Claude Code)

**PRs** : #195 (FAB v9.461) · #196 (Cadres v9.462) · #197 (Landing v12.69) · #198 (Apex GitHub access v12.70) · #199 (Pipeline erreurs v12.71+v9.463) · #200 (Whitelist enrichi + Fix langues + Fix FaceID v12.72+v12.73+v9.464)

### Bugs fixés + diagnostics

1. **CMCteams FAB gros bouton+** : toutes actions mortes. Root cause = `onclick="try{...}catch(e){toast(\"Erreur\",\"err\")}"` utilisait `\"` backslash-quotes INVALIDES en attributs HTML, parser cassait le JS. Fix = event delegation `data-fab-idx` + addEventListener. **Leçon permanente : JAMAIS de `\"` dans un onclick inline** — toujours addEventListener.

2. **Inspecteurs SANS horaires** (‹employé›, ‹employé›, ‹employé›, ‹employé›, ‹employé›, ‹employé›) : PDF.js fragmente "ETTORI" et "M." sur 2 lignes visuelles. Regex `\bETTORI M\b` ne matchait JAMAIS. Fix v9.462 = 5 stratégies cumulatives : (1) pre-traitement join lignes cassées, (2) nom complet, (3) ordre inversé "M ETTORI", (4) surname seul + aggrégation ligne N+N+1, (5) normalisation codes étendue. **Leçon** : PDF.js peut fragmenter les cellules — toujours prévoir surname-only fallback + multi-ligne.

3. **Apex bug langues** : `K.settings.lang` changé mais aucune fonction `_applyI18n` n'existait. Fix v12.73 = dictionnaire I18N 6 langues + `tr(key)` + `_applyI18n()` hookée dans `_applyTheme` et onchange Réglages. **Leçon** : toute app multi-langue doit AVOIR une fonction d'application, pas juste un stockage.

4. **Apex bug FaceID** : `_cguAsk` bloquait `axBiometricAuth` après 1 refus CGU. Aucun bouton login pour déclencher. Fix v12.73 = skip CGU si déjà enregistré + `axBiometricLoginTry()` + bouton "👤 Face ID / Touch ID" sur vLogin. **Leçon** : CGU une seule fois à l'enregistrement, jamais bloquant sur auth ensuite.

### Pipeline autonomie renforcé

- **v9.463 + v12.71** : `window.onerror` et `unhandledrejection` des 2 apps pushent maintenant vers `_pushTelemetryToApex` / `_apexPushTelemetry` AUTO (avant seules les sentinelles).
- `_apexPushTelemetry` écrit aussi Firebase (cross-device).
- Nouveau `_digestTelemetryPeriodic` (45s) + `_agentErrorDigest` (3min, aggrège par signature, escalade si ≥3 récurrences, critical si ≥10x).
- Vue admin **🚨 Erreurs Live** dans Apex : compteurs + liste telemetry + Claude Code todo.

### Whitelist auto-fix enrichi (Kevin: "elle corrige")

- CMCteams `_cmcAiWhitelist` : 3 → 10 actions (+7)
- Apex `_aiHandleWhitelist` : 6 → 13 actions (+7)
- **Total 23 actions auto-réparatrices** : purge logs, clear processed, fb resync, retry stale todos, escalate direct, etc.

### Nouvelles capacités Apex

- **Landing obligatoire first-time** (v12.69) : `ax_landing_seen` flag + `axOpenSubscribeForm` + validation admin `axApproveSubscription` avec WhatsApp auto via `wa.me`.
- **Apex a accès à son propre code** (v12.70) : 3 tools `github_read_file` / `github_list_files` / `github_write_file`. Write admin-only + `ax_github_pat` Vault + crée TOUJOURS branche + PR.

---

## 🔔 MESSAGE KEVIN → APEX (2026-04-21 v12.57)

Kevin demande à Apex de continuer le travail de Claude Code en autonomie avec les mêmes règles et rigueur.

**Mission permanente Apex** :
1. Appliquer les 18+ règles permanentes de `CLAUDE.md`
2. Multi-angles obligatoire (direct + alternatives + aller plus loin)
3. Reproduire cross-app (si modif Apex, pense CMCteams)
4. Sources multiples (mémoire + KB + web + docs + historique)
5. Autonomie max, jamais attendre validation
6. Sécurité : jamais stocker seeds crypto / passwords banques
7. Langage simple sans jargon pour clients
8. Auto-escalation via `_escalateToClaudeCode` si bloqué

**Ce qu'Apex PEUT faire en autonomie** : modifier son propre code via `modify_css`/`inject_function`/`add_tab`, répondre à tous les clients avec pertinence, gérer plans, envoyer messages CMCteams, contrôler devices, logger lessons partagées.

**Ce qui reste Claude Code** : modifier code source Git (PRs, commits), créer docs, déployer GitHub Actions.

---

## 🆕 v12.57 : Login nom/prénom flexible partout (2026-04-21)

**Règle ajoutée (permanente)** : tous les logins/recherches/authentifications doivent accepter le nom/prénom dans **tous les ordres possibles**, avec ou sans tirets, espaces, accents, casse.

**Exemples qui matchent tous `user_laurence`** :
- "Laurence SAINT-POLIT" / "SAINT-POLIT Laurence"
- "saint-polit laurence" / "laurence saint polit"
- "SAINTPOLITLAURENCE" / "laurencesaintpolit"
- "Laurence Saint Polit" (sans tiret)

**Algorithme (`_checkPreconfiguredUser` Apex)** :
1. Match exact
2. Normalize (lowercase, NFD accents, tirets→espaces, espaces multiples)
3. Tokens triés alphabétiquement (ordre indépendant)
4. Squash collé (espaces retirés)
5. Substring token + tolérance 1 char

S'applique à **TOUS les users préconfigurés + futurs** dans les 2 apps.

**Anticipation** : ce même pattern doit être utilisé pour toute recherche de nom (employés CMCteams `findEmpByName`, clients Apex, futurs projets).

---

**Leçon permanente** : JAMAIS coder un match strict de nom. Toujours tolérer ordre, casse, tirets, espaces.

---

## 📡 Comment Apex consulte ce feed

```js
// Apex via son outil cmcRead (ou axGetAppSource sur le HTML voisin)
// Peut lire CLAUDE_FEED.md via GitHub raw :
// https://raw.githubusercontent.com/9r4rxssx64-creator/CMCteams/main/CLAUDE_FEED.md
// À chaque démarrage session admin : fetch ce feed + diff avec dernière lecture
// Nouveautés → axJournalEntry + ax_lessons_learned si pertinent
```

---

## 🎬 Session 2026-04-20 nuit → 21 matin (18 PRs mergées)

### PR #123 → #139 (résumé chronologique)

| PR | Versions | Action Claude Code | Leçon déduite |
|----|----------|---------------------|----------------|
| #123 | v9.445 + v12.8 | Pipeline autonomie cross-app + 12+7 sentinelles + hub modules | Toujours merger feature branch avant la fin de session |
| #125 | v9.446 | Regex cadres permissive bullets/arrows/CADRES | Accepter variations préfixes dans headers PDF |
| #127 | v9.447 | Fix Firebase indicator stuck jaune + fallback name-first | Indicateur état mis à jour sur CHAQUE event |
| #128 | v9.448 + v12.9 | CGU universel FaceID/Micro/Géoloc | Consentement une fois, persistant, révocable |
| #129 | v9.449 + v12.10 | Fix extraTabs scope global + fallback match anywhere | Variables utilisées globalement DOIVENT être globales |
| #130 | v9.450 + v12.11 | 12 agents spécialisés (8 CMC + 4 Apex) | Un agent dédié par type de bug récurrent |
| #131 | v9.451 | Fallback apostrophes + skip metadata cols | Normaliser codes avec quotes avant matching CODES |
| #132 | docs | NOTES_USER format PDF cadres Kevin | Sauvegarder infos métier IMMÉDIATEMENT |
| #133 | v9.452 | IA FAB flottant + auto-résolution clé API | Aucune config manuelle, chaîne fallback |
| #134 | v9.453 + v12.12 | Télémetrie bidirectionnelle Apex↔CMCteams | FB_FIX partagée pour inter-apps |
| #135 | v12.13 | HANDOFF Apex AI (clone parfait) | Injecter contexte critique dans system prompt |
| #136 | v12.14 | Audit autonome Apex + journal permanent | Apex audite elle-même via axRunAudit |
| #137 | v12.15 | Assignation 2 tâches sécu à Apex | Apex reçoit tâches via HANDOFF |
| #138 | v12.16 | Fix crash K.kb.instructions undefined | Guard `.length` sur TOUT objet chargé storage |
| #139 | v12.17 | Messages user-friendly + règle docs | JAMAIS afficher erreur technique brute à l'user |

---

## 🧠 Leçons permanentes (CLAUDE.md #1-#35 + règles session)

### Règles permanentes ajoutées cette session (après #35)

- **#36** : `CLAUDE_FEED.md` obligatoire. Après chaque commit Claude Code, ajouter entry ici. Apex le lit, Kevin suit.
- **#37** : **Règle UX errors** : convertir tout message technique en user-friendly (table conversion dans docs). Applicable dans chaque catch/toast/push/alert. Vérifier à chaque audit.
- **#38** : Tester scénario réel utilisateur avant valider un fix. Les subagents "valident en théorie" mais ratent l'edge case évident comme K.kb.instructions undefined après load storage.
- **#39** : Toujours noter dans `CLAUDE_FEED.md` + déclencher Apex reload via entry `ax_handoff_journal`. Bidirectionnel obligatoire.

---


### [2026-04-21] — PR #140-#144 — Follow-ups + feed bidirectionnel

- #140 v12.18: CLAUDE_FEED.md (ce fichier) + axFetchClaudeFeed + _snFeedPoll 2h
- #141/142 v12.19: axAutoSeedKB (10 faits critiques au demarrage si K.kb vide)
- #143 v12.20: +29 liens cliquables (reseaux sociaux, Google Cloud, domotique, email)
- #144 v12.21: _getApiKeyAsync fetch direct Firebase apres force-refresh PWA
- #145 v12.22: EXPERT_CODING_STANDARDS.md — 10 standards + 12 erreurs debutant a bannir

**Lecons ajoutees** :
- #40 JAMAIS assume champ  existe dans K.kb apres load
- #41 JAMAIS force-refresh PWA sans vérifier que les secrets critiques sont restaurables async depuis Firebase
- #42 Apres 22 PRs cette session, principe: bump APP_VER + sw cache + PR + merge MAIN immediat, ne pas accumuler feature branches

## 🎯 Ce que Apex doit faire avec ce feed

1. **À chaque démarrage** : lire ce fichier (via fetch GitHub raw ou cmcRead)
2. **Diff** avec dernière version connue (`ax_last_feed_hash`)
3. **Pour chaque nouvelle entrée** :
   - `axJournalEntry("claude-code", title, context, action, result, lesson)`
   - Si leçon nouvelle → push dans `ax_lessons_learned`
   - Si nouvelle règle permanente → `kbAdd(...)` dans `K.kb.instructions`
4. **Report admin** via `vAdminReport` : "Claude Code a fait X actions depuis ta dernière visite, Y leçons apprises"

---

## 📋 Format entry standard (pour futurs updates)

```markdown
### [YYYY-MM-DD HH:MM] — [PR #N / commit hash] — [titre court]

**Contexte** : pourquoi j'ai fait ça (demande Kevin, bug signalé, etc.)
**Action** : ce que j'ai modifié (fichiers, fonctions, lignes)
**Résultat** : impact utilisateur (ce qui marche désormais)
**Leçon** : règle générale tirée de ce cas, si applicable

Apex fais : axJournalEntry("claude-code", "titre", "contexte", "action", "resultat", "lecon")
```

---

## ⚡ Action automatique pour Claude Code futur

**Procédure obligatoire à chaque commit significatif** :

1. Faire le commit technique (code + test + validation)
2. Append une entry dans `CLAUDE_FEED.md` selon le format standard
3. Inclure cette MAJ dans le commit (même PR)
4. Push + merge

**Ne jamais pousser un fix sans mettre à jour ce feed**. C'est la communication
continue avec Apex que Kevin a demandée.

---

**Ce fichier est la voix de Claude Code vers Apex AI. Chaque nouvelle session, il
continue. Aucune action importante n'est cachée.**
