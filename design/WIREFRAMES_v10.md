# Wireframes CMCteams v10

> Wireframes ASCII des écrans clés. Style générique (compatible Moodboard A/B/C).
> Une fois le moodboard validé, ces wireframes seront raffinés avec la palette
> et la typo choisies. Pour l'instant, **structure** et **flux** prioritaires.

## Cartographie navigation v10

```
[bnav 5 onglets uniquement]
 ◆ Accueil     →  vAccueil (dashboard)
 📅 Planning   →  vMonPlanning (perso) + tabs Équipe/Départs en haut
 💬 Chat       →  vChat
 🤖 IA         →  vIA (employés et admin)
 ☰ Plus        →  bottom sheet : Profil · Convention · Échanges · Aide · [Admin si AID]
```

L'admin DESARZENS K voit "Plus" qui ouvre une feuille avec accès direct à `vAdmin`.
La nav passe de 7-8 onglets à 5 onglets stables.

## Topbar v10 (nettoyée)

```
[ ← ] ◆ CMC Teams · Casino de Monaco         [⏸IA] 🟢  K  ✕
       ───────────── titre + sous-titre ────────────  ───── droite
```

- Retrait : horloge (info redondante avec OS), agentBadge (déplacé vers vAdmin > Système),
  syncBadge (mergé avec 🟢 dot via tooltip), messagePit (intégré dans badge global notifs).
- Garde : retour contextuel, titre, indicateur sync, badge IA si OFF, avatar, logout.

---

## vAdmin v10 — Priorité #1

### Desktop (≥ 1024px)

```
┌────────────────────────────────────────────────────────────────────────┐
│ ← Admin                                              🔍 Rechercher ⌘K  │
├────────────────────┬───────────────────────────────────────────────────┤
│                    │                                                   │
│ 🔍 Filtre actions… │   👥 Équipes & Employés                          │
│                    │   ──────────────────────                          │
│ 👥 Équipes (8)     │                                                   │
│ 📅 Planning (12)   │   ┌───────────────────────────────────────────┐  │
│ 🔒 Sécurité (7)    │   │ ▼ Effectifs                  258 actifs   │  │
│ ⚙ Système (9)      │   │   Gérer · Identités · Retraités · Doublons│  │
│ 🤖 IA (4) ⏸OFF     │   └───────────────────────────────────────────┘  │
│                    │                                                   │
│ ─────────          │   ┌───────────────────────────────────────────┐  │
│ Raccourcis admin   │   │ ▼ Chefs & ordres de départ   33 chefs     │  │
│ ⚡ Apex AI →       │   │   Affecter chef · Ordre départ · CI manuel│  │
│ 📋 Passation       │   └───────────────────────────────────────────┘  │
│ 📥 Plannings Apex  │                                                   │
│ 📊 Crossteam stats │   ┌───────────────────────────────────────────┐  │
│                    │   │ ▼ Identités                  212/258 OK   │  │
│                    │   │   Compléter · Reset compte · Export RGPD  │  │
│                    │   └───────────────────────────────────────────┘  │
│                    │                                                   │
│                    │   Actions urgentes  (⚠ 2 conflits, 3 retard.)    │
│                    │   ┌──Voir conflits──┐ ┌──Voir retardataires──┐  │
│                    │   └─────────────────┘ └──────────────────────┘  │
└────────────────────┴───────────────────────────────────────────────────┘
```

### Structure des 5 catégories vAdmin v10

1. **👥 Équipes & Employés**
   - Effectifs (gestion, identités, retraités, doublons)
   - Chefs & ordres de départ
   - Activité par utilisateur
2. **📅 Planning & Horaires**
   - Import PDF (workflow guidé)
   - Vérifier l'import
   - Alertes & conflits
   - Qui est libre ?
   - Templates & duplications
   - Statistiques (mois / globales / annuelles — sous-onglets)
3. **🔒 Sécurité & Audit**
   - Journal sécurité admin
   - Journal modifications
   - Statistiques de connexion
   - Vie privée & RGPD
   - PIN admin & sessions
4. **⚙ Système & Configuration**
   - Toggles features (groupés visuellement)
   - Thèmes & langue
   - Sauvegardes (export, restore, auto)
   - Documents (banque, modération)
   - Maintenance (diagnostic, tests)
5. **🤖 IA & Outils**
   - Kill-switch IA (toggle géant en haut)
   - Clé API & proxy
   - Mémoire pro IA
   - Niveau IA par employé
   - Web search toggle

Chaque catégorie ouvre une vue détaillée avec breadcrumb `Admin > Catégorie`.

### Mobile (375px) — vAdmin

```
┌────────────────────────────────┐
│ ← Admin               🔍 Rech. │
├────────────────────────────────┤
│                                │
│  ⏸ IA OFF — économie tokens   │
│   [Réactiver IA]               │
│                                │
│  Catégories                    │
│  ┌──────────────────────────┐ │
│  │ 👥 Équipes & Employés  ›│ │
│  │ 258 emp. · 8 actions     │ │
│  ├──────────────────────────┤ │
│  │ 📅 Planning            ›│ │
│  │ Mai 2026 · 12 actions    │ │
│  ├──────────────────────────┤ │
│  │ 🔒 Sécurité           ›│ │
│  │ 7 actions                │ │
│  ├──────────────────────────┤ │
│  │ ⚙ Système             ›│ │
│  │ 9 actions                │ │
│  ├──────────────────────────┤ │
│  │ 🤖 IA & Outils  ⏸OFF  ›│ │
│  └──────────────────────────┘ │
│                                │
│  Raccourcis                    │
│  [⚡ Apex] [📋 Passation]      │
│  [📥 Apex pending: 2]          │
│                                │
└────────────────────────────────┘
[ ◆  📅  💬  🤖  ☰ ]
```

Chaque catégorie est un grand bouton 80px de haut avec icône XL, titre, compteur.
Tap → page détail de la catégorie. Pas de scroll de 67 items.

---

## vAccueil v10

### Desktop

```
┌─────────────────────────────────────────────────────────────────┐
│ Topbar                                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Accueil — Lundi 18 mai 2026 · 18:42                          │
│                                                                 │
│   📢 MOTD (si défini par admin)                                 │
│   ─────────────────────────────                                 │
│                                                                 │
│   ┌─Aujourd'hui──┐ ┌─Présents──┐ ┌─Conflits──┐ ┌─Pendings──┐  │
│   │ 23 shifts    │ │ 18/23     │ │ 2 ⚠       │ │ 5 reqs    │  │
│   │ actifs       │ │ 78%       │ │ Voir ›    │ │ Voir ›    │  │
│   └──────────────┘ └───────────┘ └───────────┘ └───────────┘  │
│                                                                 │
│   Raccourcis                                                    │
│   [📥 Import] [✅ Vérif] [📋 Passat.] [🔄 Sync] [⚡ Apex]      │
│                                                                 │
│   ─── Mon shift ───────────────────────────────────────────     │
│   Aujourd'hui : 14h30 → 22h30 · BJ-3 · Table 12                │
│   Prochaine rotation : 19h15 (40/20)                            │
│                                                                 │
│   ─── Activité récente ────────────────────────────             │
│   · 14:32  DUPONT J  signalé absence ce soir                   │
│   · 13:50  Import PDF Mai 2026 — 23 modifs                      │
│   · 12:15  MARTIN C demande échange 22/05                       │
│                                          [Voir tout l'audit ›] │
└─────────────────────────────────────────────────────────────────┘
```

### Mobile

```
┌────────────────────────────────┐
│ ◆ CMC v10           ADM ●  K   │
├────────────────────────────────┤
│ Bonsoir, Kevin                 │
│ Lundi 18 mai · 18:42            │
│                                │
│ 📢 Si MOTD défini               │
│                                │
│ ┌──────────┐  ┌──────────┐    │
│ │23 shifts │  │18/23 prés│    │
│ └──────────┘  └──────────┘    │
│ ┌──────────┐  ┌──────────┐    │
│ │ 2 ⚠      │  │5 demandes│    │
│ └──────────┘  └──────────┘    │
│                                │
│ Mon shift                       │
│ ┌────────────────────────────┐ │
│ │ 14h30 → 22h30 · BJ-3 · T12 │ │
│ │ ⏱ 19h15 prochaine rotation │ │
│ └────────────────────────────┘ │
│                                │
│ Raccourcis                      │
│ [📥] [✅] [📋] [⚡]            │
│                                │
│ Activité                Voir › │
│ · 14:32  DUPONT J abs.         │
│ · 13:50  Import Mai            │
│                                │
└────────────────────────────────┘
[ ◆  📅  💬  🤖  ☰ ]
```

---

## vPlanning unifié v10

Trois sous-vues groupées dans un seul onglet avec tabs en haut :

```
┌────────────────────────────────────────────────────────────────┐
│ ← Planning Mai 2026                          [Mois ‹ › Mois]   │
├────────────────────────────────────────────────────────────────┤
│ [📆 Mon planning] [👥 Équipe] [🎯 Départs]                     │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  (vue sélectionnée — selon tab actif)                          │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

→ supprime un onglet bnav, regroupe les 3 vues planning sous un parent.

### vPlan mobile (Équipe)

```
┌────────────────────────────────┐
│ ← Plan Mai 2026 · BJ-3   ‹ ›  │
│ [Mon] [👥Équipe] [🎯Départs]   │
├────────────────────────────────┤
│ Mer 19 · 78% présence          │
│                                │
│ ┌─NOM─────┬─19─20─21─22─23─┐ │
│ │ MOI ★   │ T  T  R  T  T  │ │  ← row sticky
│ │ DUPONT  │ T  T  R  R  T  │ │
│ │ MARTIN  │ R  T  T  T  R  │ │
│ │ DUBOIS  │ T  T  T  R  T  │ │
│ └─────────┴────────────────┘ │
│  ↔ scroll horizontal inertiel │
│                                │
│ Légende : T=Travail R=Repos    │
└────────────────────────────────┘
```

Améliorations :
- Colonne NOM sticky de 84px (au lieu de 70-90px variable).
- Codes en mono JetBrains 14px pour lisibilité.
- Cellule "aujourd'hui" surlignée discrètement.
- Scroll horizontal inertiel via `overflow-x: auto; -webkit-overflow-scrolling: touch`.
- Swipe horizontal global = changer de semaine (alternative au scroll).

---

## vIA v10 — toolbar nettoyée

### Avant (v9.675)

```
[Assistant CMC (IA)] [🔍Web OFF] [⏸Désactiver IA] [🔑] [🔗] [TTS] [STT]
                     ─── 5 boutons admin dans toolbar (surchargé) ───
```

### Après v10

```
┌────────────────────────────────────────────────────┐
│ ← IA  ·  Assistant CMC                ⋮ Settings   │
├────────────────────────────────────────────────────┤
│                                                    │
│  Suggestions contextuelles :                       │
│  [Combien d'heures…] [Mes congés] [Tester règle…] │
│                                                    │
│  ┌────────────────────────────────────────────┐   │
│  │ User: Combien d'heures DUPONT J en mai ?  │   │
│  │ ────────                                   │   │
│  │ IA: D'après le planning, DUPONT J a 18    │   │
│  │     shifts × 7h = 126h ce mois. (citation)│   │
│  └────────────────────────────────────────────┘   │
│                                                    │
│  ───────────────────────────────────────────────  │
│  [🎙] Pose ta question…              [Envoyer →] │
│  ───────────────────────────────────────────────  │
└────────────────────────────────────────────────────┘
```

- **Settings ⋮** ouvre un sheet avec : Clé API, Proxy, Web search, TTS, STT,
  Kill-switch — tout dans une seule modal organisée.
- Toolbar visible : juste le bouton retour + titre + 1 bouton settings.
- Suggestions contextuelles selon la vue précédente (planning ouvert →
  suggestions planning).

---

## Bottom Sheet "Plus" (5e onglet bnav)

```
┌────────────────────────────────┐
│  ─── pull handle ───           │
│                                │
│  Plus                          │
│                                │
│  👤 Mon profil              ›  │
│  📖 Convention SBM          ›  │
│  🔄 Échanges (2)            ›  │
│  💬 Aide & contact          ›  │
│  ─────────────────             │
│  ⚙ Admin (DESARZENS K)     ›  │  (visible AID seulement)
│  📊 Stats avancées          ›  │  (admin)
│  ⚡ Apex AI                  ›  │
│  ─────────────────             │
│  Version v10.0                 │
│  Déconnexion                   │
└────────────────────────────────┘
```

→ permet 5 onglets bnav stables sans cacher les vues moins fréquentes.

---

## Command Palette `⌘K` / Long press topbar

Ouvre une modal centrée avec fuzzy search global :

```
┌────────────────────────────────────────────┐
│ 🔍  >> _                                   │
├────────────────────────────────────────────┤
│ Suggéré                                    │
│  Aller à · vPlan (Mai 2026)                │
│  Action · Nouvelle passation               │
│  Action · Importer PDF                     │
│                                            │
│ Employés (258)                             │
│  DUPONT J — BJ-3 ★                         │
│  DURAND M — Roul-5                          │
│  …                                         │
│                                            │
│ Codes                                       │
│  T · Travail                                │
│  RH · Repos hebdomadaire                    │
│                                            │
│ Convention                                  │
│  Article 17.4 — Congés (2 mois/an)         │
│                                            │
└────────────────────────────────────────────┘
   ↑↓ naviguer    ↵ ouvrir    Esc fermer
```

→ remplace les multiples points d'entrée. Source de vérité unique pour
"comment j'accède à X".

---

## Composants UI clés à standardiser

- `Button` : 5 variants (primary, secondary, ghost, danger, icon-only).
- `Card` : 4 variants (default, elevated, glass-A/B/C, danger).
- `Input` / `Textarea` / `Select` : un style cohérent, focus ring.
- `Modal` : header + body + footer, fermeture par croix + Esc + clic dehors.
- `Toast` : stack vertical en haut-droite, max 3 visibles, auto-dismiss 4s.
- `Badge` : 3 tailles, 5 couleurs sémantiques.
- `Avatar` : photo / initiales / placeholder.
- `EmptyState` : icône + titre + sous-titre + CTA.
- `Tabs` : sous-navigation contextuelle (utilisée dans vPlanning, vStats).
- `Tooltip` : hover desktop / long-press mobile.
- `BottomSheet` : pour mobile (action sheets, "Plus", filtres).
- `Skeleton` : loader pendant chargement (au lieu de spinners).

Détails dans `DESIGN_SYSTEM_v10.md`.

---

## Flux clés à dessiner avant Sprint 1

1. **Workflow Import PDF refondu** : wizard 4 étapes (Upload → Aperçu → Conflits → Appliquer).
2. **Flux Passation digitale** : checklist guidée, peut être interrompue/reprise.
3. **Flux échange shift** : demande → notif admin → décision → notif employé.
4. **Onboarding employé** : première connexion → fiche profil → fini.

Ces flux seront détaillés une fois le moodboard validé.
