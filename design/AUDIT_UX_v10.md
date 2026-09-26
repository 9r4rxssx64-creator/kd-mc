# Audit UX/UI CMCteams v9.675 — Vers v10

> Cartographie des frictions et doublons actuels. Sert de base aux moodboards
> et à la roadmap de refonte.

## A. Doublons fonctionnels identifiés

Actions accessibles à plusieurs endroits → confusion, charge cognitive, code dupliqué.

| Action                            | Emplacements actuels                                                  | Emplacement cible v10                                          |
|-----------------------------------|-----------------------------------------------------------------------|----------------------------------------------------------------|
| **Statistiques mois**             | vAdmin > Stats du mois · Onglet bnav · vAccueil card                  | Onglet bnav unique, supprimer entrée vAdmin                    |
| **Stats globales**                | vAdmin > Stats globales · Stats annuelles · vStats                    | Sous-onglets de vStats (Mois / Année / Globales)               |
| **Gestion employés**              | vAdmin > Employés · vPasswords (édition partielle)                    | vEmps unique, vPasswords devient onglet "Sécurité" de vEmps    |
| **Mots de passe**                 | vAdmin > Réinit. tous mots de passe · vPasswords actions              | Tout dans vEmps (tab "Sécurité"), bouton "Reset all" en haut   |
| **Audit log**                     | vAdmin > Journal modifications · vAdmin > Audit & historique imports  | vue unique `vAudit` avec filtre type (planning/admin/import)   |
| **Apprentissage parser**          | vAdmin > Apprentissage parser → redirige vers vue existante           | Supprimer doublon, garder vue cible                            |
| **Mode présentation**             | vAdmin > Mode présentation · vAdmin > liste features                  | Toggle unique dans vAccueil (icône plein écran)                |
| **Lecture vocale (TTS)**          | vAdmin > Choisir voix · vAdmin > Lecture vocale (toggle features)     | Setting unique dans vMonProfil > Préférences                   |
| **Configurer clé IA**             | vIA toolbar 🔑 · vAdmin > Configurer clé API Claude                   | vAdmin uniquement (config = admin), retirer de toolbar         |
| **Configurer proxy IA**           | vIA toolbar 🔗 · vAdmin > Configurer proxy sécurisé                   | vAdmin uniquement                                              |
| **Activer/Désactiver IA**         | vIA toolbar ⏸ · vAdmin > Kill-switch tokens (ajouté v9.675)           | vAdmin + badge topbar (suffisant). Retirer du toolbar vIA      |
| **Web search IA**                 | vIA toolbar 🔍 · pas ailleurs                                          | OK, garder dans vIA (contexte conversation)                    |
| **Recherche globale**             | Topbar 🔍 · vAdmin > Recherche globale (toggle feature)               | Topbar uniquement, supprimer entrée vAdmin                     |
| **Effacer planning du mois**      | vAdmin > Effacer planning · vImport > bouton clear                    | vImport uniquement (contextuel)                                |
| **Sauvegardes JSON**              | vAdmin > Sauvegarde complète · vAdmin > Restaurer · Auto-backup       | Sous-page `vAdmin > Sauvegardes` regroupée                     |
| **Pub Apex**                      | vAdmin > Pub Apex (banner) · vAdmin > Popup Apex · cards Apex partout | Settings unique > Apex avec 3 toggles, code partage l'état     |

**Total doublons identifiés : 16 actions accessibles à 2-3 endroits.**

---

## B. Inventaire vAdmin actuel (67 items en 7 sections)

État v9.675 (après ajout kill-switch en tête) :

```
🤖 IA — Kill-switch tokens          (3 items)
📝 PASSATION & COMMUNICATION        (4 items)
👥 DONNÉES & EFFECTIFS              (5 items + 2 sous-groupes : Export 4 + Documents 2)
📅 PLANNING & HORAIRES              (10 items + Statistiques 3)
🔒 SÉCURITÉ & AUDIT                 (12 items)
⚙️ CONFIGURATION & OUTILS          (4 items + Apex 3 + Maintenance 4)
[features list]                     (~15 toggles individuels)
```

**Problèmes :**
- 67 items à scroller, pas de recherche dans le panneau.
- Mélange "actions" (Effacer planning), "navigation" (vEmps), "configuration" (toggle TTS).
- Hiérarchie visuelle plate : toutes les lignes ont le même poids.
- Sur mobile, scroll vertical interminable.
- Les "features toggles" en bas de liste sont noyés (15 toggles à la suite).

---

## C. Inventaire des vues utilisateur (~30 fonctions `v*`)

| Vue            | Rôle                          | Accès      | Friction actuelle                                          |
|----------------|-------------------------------|------------|-----------------------------------------------------------|
| vAccueil       | Dashboard accueil             | Tous       | Trop d'éléments, raccourcis empilés, MOTD + cards mélangés |
| vMonPlanning   | Planning perso mois           | Tous       | Codes loin du nom (scroll horizontal mobile)               |
| vMonProfil     | Fiche identité self-service   | Tous       | Champs en ligne, manque hiérarchie sections                |
| vPlan          | Grille équipe                 | Tous       | Densité forte, sticky parfois cassé sur iOS                |
| vDeparts       | Ordres de départ              | Tous       | Idem vPlan, scroll horizontal nécessaire                   |
| vChat          | Chat (DM, reply, filtres)     | Tous       | Bulles peu différenciées DM/public                         |
| vIA            | Chatbot IA                    | Tous       | Toolbar surchargée (5 boutons admin)                       |
| vEchanges      | Demandes d'échange shifts     | Tous       | OK                                                          |
| vConvention    | Convention collective         | Tous       | 4 tabs, OK                                                  |
| vStats         | Stats mensuelles              | Admin      | Bonne info, présentation dense                             |
| vAdmin         | Panneau admin                 | Admin      | **Priorité #1 refonte — 67 items en vrac**                 |
| vOnline        | Présence temps réel           | Admin      | OK                                                          |
| vAdminSecurity | Journal connexions admin      | Admin      | OK                                                          |
| vTeams         | Config équipes                | Admin      | Densité, manque tri visuel                                  |
| vEmps          | Gestion employés              | Admin      | Liste plate 258 lignes, recherche existante mais peu visible |
| vRetrait       | Retraités                     | Admin      | OK                                                          |
| vImport        | Import PDF                    | Admin      | Workflow multi-étape pas évident                            |
| vPasswords     | Gestion mots de passe         | Admin      | Doublon avec vEmps                                          |
| vAbsences     | Suivi absences                | Admin      | OK                                                          |
| vAuditLog      | Journal modifications         | Admin      | Doublon possible avec autres audit                          |

---

## D. Friction mobile (375px / iPhone SE)

- **Bnav** : 7 onglets aujourd'hui (Accueil, MonPlan, Profil, Équipe, Départs, Chat, IA + Admin),
  labels cachés < 420px. Sur 375px, certains onglets sont à <40px de large (sous le minimum touch 44px).
- **vPlan / vDeparts** : scroll horizontal interne, codes coupés derrière la colonne sticky des noms.
- **Topbar** : densité d'icônes (🔍 horloge sync agentBadge syncBadge messagesPit avatar logout),
  ~10 éléments côte à côte sur mobile, certains <30px.
- **Modals** : pleine largeur mais padding parfois insuffisant (≤8px), boutons collés aux bords.
- **vAdmin** : tap-target ~36-40px sur les items courts, juste sous le seuil 44px Apple HIG.

---

## E. Friction visuelle / cohérence

- **Couleurs ad-hoc** : grep révèle 25+ valeurs hex différentes pour les boutons/cards
  (`#c9a227`, `#50c864`, `#7edc90`, `#a0cca0`, `#c0d8c0`, `#5aaa70`, etc.). Pas de système de tokens.
- **Emojis omniprésents** : chaque label de bouton commence par un emoji. Sur 67 items vAdmin,
  bruit visuel important, hiérarchie écrasée.
- **Typographies mélangées** : Garamond sur titres, Inter implicite, monospace pour codes/horloge
  — pas de scale formalisée (font-size 10/11/12/13/14/15/16/18/22/24px observés).
- **Espacements** : padding 2/4/6/8/9/10/12/14/16/18/20/24px ad-hoc. Pas de scale 4-pt.
- **Bordures** : rgba(255,255,255,0.04 / 0.05 / 0.08 / 0.1 / 0.15) sans système.

---

## F. Friction modal / popup / toast

- **Toasts** : système existant, mais pas de stack (les toasts récents écrasent les précédents).
- **Modals** : créés ad-hoc avec `document.createElement("div")` + innerHTML, pas de composant
  unifié (cmcOcrModal, cmcBadgeModal, cmcCamStudio, cmcApexPopup, etc.).
- **Popups Apex** : peuvent apparaître 1x/jour pour admin (popup) + banner permanent + cards
  inline — empilement de promotions.
- **Confirms natifs** : encore quelques `confirm("...")` malgré la règle UX du CLAUDE.md
  (devrait être un modal stylé).

---

## G. Priorités de refonte (validées avec Kevin)

1. **vAdmin — priorité #1** : sidebar à 5 catégories, recherche intégrée, plus de scroll géant.
2. **Doublons** : éliminer les 16 doublons listés, source unique de vérité par action.
3. **Design system** : tokens CSS variables, composants documentés, 4-pt spacing scale.
4. **Mobile** : bnav 5 onglets max, topbar nettoyée, vPlan/vDeparts plus lisibles.
5. **Modals/toasts** : système unifié, stack des toasts, plus de confirm natif.

---

## H. Métriques cibles v10

| Métrique                                | v9.675       | Cible v10   |
|-----------------------------------------|--------------|-------------|
| Items vAdmin top niveau                 | 67           | ≤ 20        |
| Doublons d'action identifiés            | 16           | 0           |
| Couleurs hex dans CSS                   | ~25+         | ≤ 12 tokens |
| Niveaux font-size                       | 10 niveaux+  | 6 (xs→2xl)  |
| Onglets bnav                            | 7-8          | 5           |
| Touch-target minimum                    | parfois <44px| 44px partout|
| Lignes CSS embedded                     | ~3200        | ~2500       |
| Composants HTML inline créés ad-hoc     | ~12          | 0 (lib)     |
| File size index.html                    | 3.20 Mo (6.09.2026) | < 2.5 Mo |

---

## I. Ce qu'on NE refait PAS (à préserver)

- ✅ Logique métier planning, codes, rotations, congés (Convention SBM)
- ✅ Firebase realtime sync (`fbWrite`, `fbApplyData`, SSE)
- ✅ Sécurité (hashPwStrong, guards AID, audit log, session TTL)
- ✅ Import PDF parser (logique métier critique)
- ✅ Données : `cmc_*` localStorage keys, `A` state object
- ✅ Toutes les fonctions de calcul (calcDepPos, gpl, isWork, etc.)

La refonte est **uniquement** visuelle, navigationnelle et organisationnelle.
Aucune modification de la logique métier ou des données.
