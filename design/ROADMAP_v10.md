# Roadmap CMCteams v10 — Sprints d'implémentation

> Découpage en 8 sprints courts. Validation Kevin entre chaque sprint.
> Chaque sprint = 1 branche feature, 1 PR (si demandé), 1 push.
> Pas de big-bang : l'app reste fonctionnelle 24/7 (258 employés en prod).

---

## Pré-requis

Avant Sprint 0 :

1. **Kevin valide** : un moodboard (A / B / C) dans `MOODBOARDS_v10.md`.
2. **Kevin valide** : la liste de doublons à éliminer dans `AUDIT_UX_v10.md`.
3. **Kevin valide** : la structure cible vAdmin (5 catégories) dans `WIREFRAMES_v10.md`.
4. **Kevin valide** : l'ordre des sprints ci-dessous (peut prioriser autrement).

---

## Sprint 0 — Tokens & helpers (jour 1)

**Objectif** : injecter le design system sans rupture visuelle.

- [ ] Ajouter le bloc `:root { --token: ... }` complet (palette moodboard choisi)
      dans `<style>` du `index.html`.
- [ ] Ajouter classes utilitaires `.btn`, `.card`, `.input`, `.modal`, `.toast`,
      `.badge`, `.empty`, `.tabs`, `.skel` (sans toucher au code existant).
- [ ] Ajouter helpers JS : `modalOpen(html, opts)`, `modalClose()`,
      `modalConfirm({...})`, refonte de `toast(msg, variant)` pour stack vertical.
- [ ] Test : ouvrir l'app, vérifier qu'aucune vue n'est cassée (zéro régression).
- [ ] Bump `APP_VER` v10.0.0.

**Livrable** : nouveaux tokens + composants disponibles, prêts à être utilisés.
**Risque** : très faible (additif).

---

## Sprint 1 — Refonte vAdmin (jours 2-3) ⭐ Priorité Kevin

**Objectif** : remplacer les 67 items en vrac par 5 catégories navigables.

- [ ] Réécrire `vAdmin()` avec structure sidebar (desktop) / accordéon (mobile).
- [ ] Implémenter les 5 catégories : Équipes & Employés / Planning / Sécurité /
      Système / IA.
- [ ] Ajouter recherche fuzzy interne (`Cmd+F` ou input dédié).
- [ ] Déplacer la section IA Kill-switch en tête (déjà v9.675).
- [ ] Migrer chaque ancien item vers sa nouvelle catégorie.
- [ ] Supprimer les doublons identifiés dans `AUDIT_UX_v10.md` partie A :
      - Stats du mois (garder vStats seul)
      - Audit log (vue unique avec filtre type)
      - Apprentissage parser doublon
      - Mode présentation (toggle dans vAccueil)
      - Lecture vocale (déplacé vMonProfil > Préférences)
- [ ] Test mobile 375px : tap targets ≥ 44px.
- [ ] Bump APP_VER v10.1.

**Risque** : modéré (touche le panneau le plus complexe). Mitigation : régression
guard via tests manuels checklist.

---

## Sprint 2 — Topbar + bnav (jour 4)

**Objectif** : densité de la topbar maîtrisée, bnav réduit à 5 onglets.

- [ ] Refondre `vTopbar()` : retirer horloge (info redondante), merger sync+agents
      en un seul indicateur, garder badge IA OFF (v9.675).
- [ ] Refondre `vNav()` : 5 onglets `◆ Accueil · 📅 Planning · 💬 Chat · 🤖 IA · ☰ Plus`.
- [ ] Créer le bottom sheet "Plus" avec : Profil · Convention · Échanges · Aide ·
      [Admin si AID] · Apex · Stats avancées · Déconnexion.
- [ ] Unifier l'accès aux vues planning sous un onglet parent avec tabs internes :
      Mon planning / Équipe / Départs.
- [ ] Test mobile 375px obligatoire.
- [ ] Bump v10.2.

**Risque** : modéré (changement de navigation = changement d'habitudes). Mitigation :
le bottom sheet expose tous les anciens onglets pour transition.

---

## Sprint 3 — vAccueil dashboard (jour 5)

**Objectif** : dashboard premier coup d'œil clair.

- [ ] Header simple (date + bonjour).
- [ ] Cards stats : Aujourd'hui · Présents · Conflits · Demandes en attente.
- [ ] Section "Mon shift" (employé) ou "Vue globale" (admin).
- [ ] Section "Activité récente" (audit log léger, 5 dernières lignes).
- [ ] Raccourcis 4-5 actions principales selon rôle.
- [ ] Supprimer les empilements de cards Apex / promos (max 1 promo discrète).
- [ ] Bump v10.3.

**Risque** : faible.

---

## Sprint 4 — vPlan + vDeparts (jours 6-7)

**Objectif** : grilles lisibles, scroll mobile fluide.

- [ ] Refondre la grille avec tokens (couleurs codes harmonisées).
- [ ] Colonne nom sticky 84px fixe + scroll horizontal inertiel.
- [ ] Cellule "aujourd'hui" surlignée discrètement.
- [ ] Swipe horizontal mobile = changement de semaine (alternative au scroll).
- [ ] Améliorer alignement des ordres dans vDeparts.
- [ ] Test 5 viewports : 375 · 390 · 412 · 768 · 1280.
- [ ] Bump v10.4.

**Risque** : modéré (les règles UX existantes #1-#21 du CLAUDE.md doivent être
respectées scrupuleusement — overflow, sticky, table-layout).

---

## Sprint 5 — vIA + chat (jour 8)

**Objectif** : interface conversationnelle pro, settings groupées.

- [ ] Refondre toolbar vIA : retirer les 5 boutons admin, remplacer par menu
      ⋮ Settings ouvrant un sheet avec : Clé API · Proxy · Web search · TTS · STT ·
      Kill-switch.
- [ ] Suggestions contextuelles selon vue précédente.
- [ ] Refondre vChat : bulles claires DM vs public, replies plus visibles.
- [ ] Bump v10.5.

**Risque** : faible.

---

## Sprint 6 — Vues admin secondaires (jours 9-10)

**Objectif** : harmoniser les vues admin internes.

- [ ] vEmps : intégrer onglets Sécurité (mots de passe) + Identité + Activité.
- [ ] vPasswords devient un tab de vEmps, supprimer l'entrée séparée.
- [ ] vAbsences, vRetrait, vTeams, vAuditLog, vImport : appliquer le design system.
- [ ] vImport : wizard 4 étapes (Upload → Aperçu → Conflits → Appliquer).
- [ ] Bump v10.6.

**Risque** : modéré (beaucoup de vues).

---

## Sprint 7 — Polish, motion, accessibilité (jour 11)

**Objectif** : finition.

- [ ] Audit contraste WCAG AA sur toutes les vues.
- [ ] Skeletons partout où il y a chargement async.
- [ ] Empty States sur toutes les listes vides.
- [ ] Respect `prefers-reduced-motion`.
- [ ] Suppression du CSS legacy (anciens styles inline ad-hoc).
- [ ] Diminution taille fichier (cible < 2.5 MB).
- [ ] Bump v10.7.

**Risque** : faible.

---

## Sprint 8 — Documentation & rétrospective (jour 12)

**Objectif** : capitaliser.

- [ ] Mettre à jour CLAUDE.md (nouvelles règles design, nouveau set de
      composants à utiliser pour toute future feature).
- [ ] Mettre à jour MEMO_USER.md avec les nouveaux flux.
- [ ] Capture screen avant/après pour chaque vue refondue.
- [ ] Rétrospective : qu'est-ce qui a marché, à éviter, à refaire.

---

## Planning indicatif

| Sprint | Jours    | Branche                                |
|--------|----------|----------------------------------------|
| 0      | J1       | `claude/v10-sprint0-tokens`            |
| 1      | J2-J3    | `claude/v10-sprint1-vadmin` ⭐         |
| 2      | J4       | `claude/v10-sprint2-nav`               |
| 3      | J5       | `claude/v10-sprint3-accueil`           |
| 4      | J6-J7    | `claude/v10-sprint4-grilles`           |
| 5      | J8       | `claude/v10-sprint5-ia-chat`           |
| 6      | J9-J10   | `claude/v10-sprint6-vues-admin`        |
| 7      | J11      | `claude/v10-sprint7-polish`            |
| 8      | J12      | `claude/v10-sprint8-doc`               |

Total estimatif : **~12 jours** de travail concentré. En réalité, étaler sur
3-4 semaines avec validation entre sprints.

---

## Garde-fous (à chaque sprint)

- [ ] Syntax check JS (commande dans CLAUDE.md).
- [ ] Test mobile 375px / 390px / 412px / 768px / 1280px.
- [ ] Pas de régression visuelle sur vues non encore migrées.
- [ ] `git diff` avant chaque commit (pas de fichier inattendu modifié).
- [ ] Audit doublons après Sprint 1 : `grep -c "Stats du mois\|Audit log"` ne doit
      pas avoir augmenté.
- [ ] Mise à jour CLAUDE.md à chaque sprint (versions, nouvelles règles).
- [ ] Push branche dédiée, jamais push direct sur `main`.

---

## Critères de succès v10

Mesurés en fin de Sprint 7 :

- [ ] vAdmin : ≤ 20 items niveau 1 (vs 67 aujourd'hui).
- [ ] Doublons : 0 (vs 16).
- [ ] Couleurs hex : ≤ 12 tokens (vs 25+ ad-hoc).
- [ ] Niveaux font-size : 6 (vs 10+).
- [ ] Bnav : 5 onglets stables.
- [ ] Touch targets : ≥ 44px partout sur mobile.
- [ ] Lighthouse mobile score ≥ 90 (perf + a11y).
- [ ] Aucune régression fonctionnelle vs v9.675.
- [ ] Kevin valide : "c'est plus pro, plus pratique, plus futuriste".

---

## En cas de problème

- **Régression majeure détectée** : revenir au sprint précédent via `git revert`,
  documenter dans CLAUDE.md "Erreurs connues", recommencer le sprint.
- **Kevin change d'avis sur le moodboard à mi-parcours** : c'est OK — seuls les
  tokens CSS changent, les composants sont identiques. ~30 minutes de migration.
- **Bug critique en prod pendant la refonte** : pause refonte, fix en priorité
  sur la branche concernée, reprise quand stable.
