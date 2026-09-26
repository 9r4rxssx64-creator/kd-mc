# Moodboards CMCteams v10 — 3 directions visuelles

> Kevin a demandé "futuriste, professionnel, va plus loin". Trois directions
> concrètes. Choisir UNE en réponse à ce document, puis on dessine les
> wireframes finaux et on commence Sprint 0 (injection tokens).
>
> Chaque moodboard détaille : palette, typo, composants signature, motion,
> exemple ASCII de l'écran d'accueil et un aperçu textuel de vAdmin refondu.

---

# Moodboard A — "Linear / Vercel Pro"

**Ambiance** : Productivité dense, calme, premium SaaS. Les références ne sont
pas casino mais outils pros (Linear, Vercel, Notion, Raycast). On accepte de
rompre avec l'identité or-sur-noir actuelle pour gagner en lisibilité et
sobriété pro.

### Palette (12 tokens)

| Token              | Valeur       | Usage                                    |
|--------------------|--------------|------------------------------------------|
| `--bg-0`           | `#0a0a0c`    | Fond app                                 |
| `--bg-1`           | `#111114`    | Cards, modals                            |
| `--bg-2`           | `#1a1a1f`    | Hover, surfaces élevées                  |
| `--border`         | `#2a2a32`    | Bordures cohérentes                      |
| `--border-strong`  | `#3a3a44`    | Bordures actives, focus                  |
| `--text-1`         | `#fafafa`    | Texte primaire                            |
| `--text-2`         | `#a1a1aa`    | Texte secondaire                          |
| `--text-3`         | `#52525b`    | Texte tertiaire, disabled                |
| `--accent`         | `#d4a64a`    | Accent or sobre (clin d'œil casino)       |
| `--success`        | `#4ade80`    | Vert succès                              |
| `--danger`         | `#f87171`    | Rouge erreur, destructif                  |
| `--warning`        | `#fbbf24`    | Jaune attention                           |

### Typographie

```
Display    Inter Display       28/36/44px  (3 niveaux titres vue)
Body       Inter               13/14/15px  (texte courant)
Mono       JetBrains Mono      12/14px     (chiffres, codes, horloge, ID)
```

Pas de serif, pas de Garamond. Lecture optimisée pour densité d'information.

### Composants signature

- **Cards plates** : `bg-1` + bordure 1px `border`, radius 8px, padding 16/20px,
  pas d'ombre.
- **Buttons** : sans ombre, hover = `bg-2`, focus = ring 2px `accent`.
  Variants : primary (accent), secondary (border), ghost (transparent), danger.
- **Sidebar** : 240px fixe desktop, items 32px hauteur, icône 16px + label 13px.
- **Command palette `⌘K`** : modal centré, input + 8 résultats max, fuzzy search.
- **Bottom nav mobile** : 5 onglets, 56px hauteur, icône 20px + label 10px,
  underline 2px accent sur actif.
- **Badges** : pill 18px hauteur, font 11px, padding horizontal 6px.

### Motion

- Toutes transitions : 120ms `cubic-bezier(0.4, 0, 0.2, 1)`.
- Pas de shimmer, pas de glow, pas de particules.
- Skeleton loader pour les listes.
- Hover : changement de `bg` uniquement, pas de scale ni translate.

### Ambiance globale

Très calme. Dense, mais aéré. Tout est lisible sur écran 14" sans loupe.
Les chiffres et données sont mis en avant via mono JetBrains, plus
discriminants visuellement que le texte.

### Aperçu ASCII — vAccueil

```
┌──────────────────────────────────────────────────────────────────┐
│ ◆ CMC Teams  v9.7  Casino de Monaco              ADM ●  K        │
├──────┬───────────────────────────────────────────────────────────┤
│ ◆    │  Accueil                                       18 mai 2026 │
│ 📅   │                                                            │
│ 👥   │  ┌─Aujourd'hui──────┐ ┌─Présents──────┐ ┌─Conflits──────┐ │
│ 📊   │  │ 23 employés      │ │ 18 / 23       │ │ 2 alertes     │ │
│ 💬   │  │ shifts actifs    │ │ 78% présence  │ │ Voir détails ›│ │
│ 🤖   │  └──────────────────┘ └───────────────┘ └───────────────┘ │
│ ⚙    │                                                            │
│      │  Raccourcis                                                │
│      │  ┌────────┬────────┬────────┬────────┐                    │
│      │  │📥 Import│✅ Verif │📋 Pass.│🔄 Sync │                    │
│      │  └────────┴────────┴────────┴────────┘                    │
│      │                                                            │
│      │  Activité récente                              Voir tout › │
│      │  ─ 14:32  DUPONT J  signalé absence ce soir               │
│      │  ─ 13:50  Import PDF Mai 2026 — 23 modifs appliquées      │
│      │  ─ 12:15  MARTIN C demande échange 22/05 (BJ-3)           │
└──────┴───────────────────────────────────────────────────────────┘
```

### Aperçu ASCII — vAdmin refondu (Linear/Vercel)

```
┌─Admin────────────────────────────────────────────────────────────┐
│ 🔍  Rechercher dans Admin…                                  ⌘K  │
├──────────────┬───────────────────────────────────────────────────┤
│ 5 catégories │  Équipes & Employés                                │
│              │  ────────────────────                              │
│ ● Équipes    │                                                    │
│   Planning   │  ◆ Effectifs        258 actifs · 12 retraités     │
│   Sécurité   │  ◆ Chefs & ordres   33 chefs · 13 équipes BJ/Roul │
│   Système    │  ◆ Identités        212/258 fiches complètes      │
│   IA         │                                                    │
│              │  Actions rapides                                   │
│ Accès Apex › │  ┌─ Nouvel employé ─┐ ┌─ Détecter doublons ─┐    │
│              │  └──────────────────┘ └─────────────────────┘    │
└──────────────┴───────────────────────────────────────────────────┘
```

---

# Moodboard B — "Casino Premium Holographique"

**Ambiance** : Luxe Monaco, théâtre, premium spectaculaire. Glassmorphism
soigné, gradients dorés animés, accents holographiques rose/bleu pour les
highlights. On embrasse pleinement l'identité casino haut de gamme. Référence
visuelle : Stripe + Apple Vision OS + casinos de luxe.

### Palette (14 tokens)

| Token              | Valeur                        | Usage                       |
|--------------------|-------------------------------|-----------------------------|
| `--bg-velvet`      | `#0a0508`                     | Fond profond                |
| `--bg-glass`       | `rgba(20,12,18,.65)` + blur   | Surfaces glassmorphism       |
| `--bg-elevate`     | `rgba(30,22,28,.85)` + blur   | Modals, cards premium       |
| `--gold-1`         | `#d4af37`                     | Or sobre                    |
| `--gold-2`         | `#ffd700`                     | Or vif (highlight)          |
| `--gold-gradient`  | `linear-gradient(135deg,#d4af37,#ffd700,#f4d76e)` | Boutons signature |
| `--emerald`        | `#0f5132`                     | Vert table de jeu            |
| `--emerald-glow`   | `#1ea863`                     | Vert succès lumineux         |
| `--holo-pink`      | `#f472b6`                     | Highlight 1 (notifications)  |
| `--holo-blue`      | `#60a5fa`                     | Highlight 2 (focus, links)   |
| `--text-1`         | `#fdfaf3`                     | Texte primaire (chaud)       |
| `--text-2`         | `#c4b8a8`                     | Texte secondaire             |
| `--danger`         | `#fb7185`                     | Rouge premium                |
| `--border-glow`    | `rgba(212,175,55,.3)`         | Bordures lumineuses          |

### Typographie

```
Display    Playfair Display    32/44/56px  (titres vue, italic dispo)
Body       Inter               14/15/16px
Mono       JetBrains Mono      12/14px     (codes, ID, horloge)
```

Mélange serif (titres) + sans-serif (corps) pour évoquer le contraste
spectacle/fonction du casino.

### Composants signature

- **Cards glass** : `bg-glass` + `backdrop-filter: blur(20px)` +
  bordure 1px `border-glow`, radius 14px, padding 20/24px,
  shadow `0 8px 32px rgba(0,0,0,.4)`.
- **Buttons primary** : `gold-gradient` + texte noir, radius 10px,
  hover = shimmer animation 600ms.
- **Buttons secondary** : transparent + bordure or `--gold-1`,
  hover = `bg-elevate`.
- **Sidebar** : 260px desktop, items 40px hauteur, icône 18px ligne fine + label 14px.
  Item actif : `bg-glass` + bordure gauche `gold-2` 3px.
- **Bottom nav mobile** : 60px hauteur, item actif a un point doré + glow.
- **Badges** : pill 20px, fond `bg-glass`, bordure `border-glow`.
- **Modals** : centrés, `bg-elevate` + blur 30px, `border-glow` 1px,
  shadow `0 20px 60px rgba(0,0,0,.6)`.

### Motion

- Transitions : 200-300ms `ease-in-out`.
- Shimmer doré sur cards stats au mount (300ms).
- Pulse subtile (1.5s) sur les badges live (présence, sentinelles).
- Hover boutons : transition gradient + scale `1.02` + shadow plus large.
- Background app : particules dorées TRÈS discrètes (3 particules, opacity 0.05,
  drift lent 30s), seulement sur vAccueil. Désactivable accessibilité.

### Ambiance globale

Spectaculaire mais maîtrisée. Chaque card ressemble à une vitrine éclairée.
Les éléments live (présence, sync, notifs) "respirent" doucement. Vibe
soirée Monte-Carlo.

### Aperçu ASCII — vAccueil

```
╔════════════════════════════════════════════════════════════════════╗
║                                                                    ║
║          ╭─────────────────────────────────────────╮               ║
║          │ ◆ CMC Teams         v9.7  ·  K  ·  ⏵   │               ║
║          ╰─────────────────────────────────────────╯               ║
║                                                                    ║
║          ✦  Bonsoir, Kevin                                         ║
║              18 mai 2026 · 18:42 · Casino de Monaco                ║
║                                                                    ║
║         ╭─Aujourd'hui──╮ ╭─Présents──────╮ ╭─Conflits──────╮     ║
║         │              │ │               │ │               │     ║
║         │   23         │ │   18  / 23   │ │    2 ⚠        │     ║
║         │ shifts actifs│ │ 78% présence  │ │ Voir détails ›│     ║
║         │              │ │ ◉ ◉ ◉ ◉ ◉    │ │               │     ║
║         ╰──────────────╯ ╰───────────────╯ ╰───────────────╯     ║
║              ✨shimmer       ●live pulse                            ║
║                                                                    ║
║         Raccourcis           ────────                              ║
║         ╭━━━━━━━╮ ╭━━━━━━━╮ ╭━━━━━━━╮ ╭━━━━━━━╮                ║
║         │📥Imp. │ │✅Vérif│ │📋Pass.│ │🔄Sync │  (gold gradient) ║
║         ╰━━━━━━━╯ ╰━━━━━━━╯ ╰━━━━━━━╯ ╰━━━━━━━╯                ║
║                                                                    ║
╚════════════════════════════════════════════════════════════════════╝
```

### Aperçu ASCII — vAdmin refondu (Casino Premium)

```
╭───────────────────────────────────────────────────────────────────╮
│ ✦  Admin                                              🔍 ⌘K       │
├──────────────╮   ╭─────────────────────────────────────────────── │
│              │   │                                                │
│ ✦ Équipes    │   │  ━━━━━━ Équipes & Employés ━━━━━━              │
│ ✦ Planning   │   │                                                │
│ ✦ Sécurité   │   │  ╭━━━━━━━━━━━━━━━━━━━━━━━━━━━╮                │
│ ✦ Système    │   │  │  ◆ 258 actifs    12 retraités  │           │
│ ✦ IA  ⏸OFF   │   │  ╰━━━━━━━━━━━━━━━━━━━━━━━━━━━╯                │
│              │   │                                                │
│              │   │   ▸ Effectifs              ›                   │
│              │   │   ▸ Chefs & ordres          ›                  │
│              │   │   ▸ Identités (212/258)     ›                  │
│              │   │                                                │
╰──────────────╯   ╰─────────────────────────────────────────────── │
```

---

# Moodboard C — "Casino Raffiné — Évolution"

**Ambiance** : Continuité avec l'actuel. On garde or sur noir, on nettoie. Pas
de rupture brutale, mais professionnalisme renforcé : tokens design, scale
typo, espacement 4-pt strict, hiérarchie visuelle claire, moins d'emojis.
Risque de régression minimal. **Compromis pragmatique** si Kevin tient à
préserver la familiarité visuelle.

### Palette (10 tokens — réduction des 25+ couleurs actuelles)

| Token              | Valeur       | Usage                                    |
|--------------------|--------------|------------------------------------------|
| `--bg-0`           | `#0a1a0e`    | Fond app (vert très sombre actuel)        |
| `--bg-1`           | `#0e1f12`    | Cards                                     |
| `--bg-2`           | `#15291a`    | Hover                                     |
| `--border`         | `#1e3020`    | Bordures                                  |
| `--gold`           | `#c9a227`    | Accent or (préservé)                      |
| `--gold-soft`      | `rgba(201,162,39,.15)` | Fond doré subtil               |
| `--text-1`         | `#e8efe2`    | Texte primaire                            |
| `--text-2`         | `#a0cca0`    | Texte secondaire (préservé)               |
| `--success`        | `#7edc90`    | Vert succès                                |
| `--danger`         | `#e88080`    | Rouge erreur                              |

### Typographie

```
Display    Cormorant Garamond  28/36/44px  (titres vue, conservé pour Monaco vibe)
Body       Inter (system fallback)         14/15px
Mono       JetBrains Mono       12/13px    (codes, horloge)
```

### Composants signature

- **Cards** : `bg-1` + bordure 1px `border`, radius 10px, padding 14/16px.
- **Buttons** : variants comme actuels mais standardisés via tokens.
- **Sidebar** : pas de sidebar (garde nav bnav actuelle), juste menu admin
  refondu en accordéon.
- **Bottom nav** : nettoyé à 5 onglets, garde l'identité actuelle.
- **Emojis** : SEULEMENT sur les `{sep:...}` de catégorie. Les items
  individuels n'ont plus d'emoji devant chaque label.

### Motion

- Transitions : 150ms `ease`.
- Pas d'animation intrusive. Pulse gardée uniquement pour live (présence sync).

### Ambiance globale

Le code et l'UI ressemblent à v9.675 mais **propre**. Tout est aligné sur le
4-pt rhythm, les couleurs sont consistantes, les emojis sont des indicateurs
de catégorie (non plus de chaque ligne). C'est l'option du "même mais en
mieux".

### Aperçu ASCII — vAccueil

```
┌──────────────────────────────────────────────────────────────────┐
│ ◆ CMC Teams  v10  ·  Casino de Monaco            ADM ●  K   ✕   │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Accueil — 18 mai 2026                                          │
│                                                                  │
│   ┌─Aujourd'hui──┐ ┌─Présents──────┐ ┌─Conflits───────────┐    │
│   │  23 shifts   │ │ 18 / 23       │ │ 2 alertes          │    │
│   │              │ │ 78% présence  │ │ Voir détails ›     │    │
│   └──────────────┘ └───────────────┘ └────────────────────┘    │
│                                                                  │
│   Raccourcis                                                     │
│   ┌────────┬────────┬────────┬────────┐                         │
│   │ Import │ Vérif. │ Passat.│ Sync   │  (or sobre, pas emoji) │
│   └────────┴────────┴────────┴────────┘                         │
│                                                                  │
│   Activité récente                              Voir tout ›      │
│   · 14:32   DUPONT J — absence signalée                          │
│   · 13:50   Import PDF Mai 2026 — 23 modifs                      │
│   · 12:15   MARTIN C — échange 22/05 (BJ-3)                      │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
[ ◆ Accueil  📅 Plan  💬 Chat  🤖 IA  ☰ Plus ]
```

### Aperçu ASCII — vAdmin refondu (Évolution)

```
┌─Admin────────────────────────────────────────────── 🔍 Rech ────┐
│                                                                 │
│  ▾ 👥 Équipes & Employés              4 actions · 258 emp.      │
│      Effectifs                                              ›   │
│      Chefs & ordres de départ                               ›   │
│      Identités (212/258 complètes)                          ›   │
│      Retraités (12)                                         ›   │
│                                                                 │
│  ▾ 📅 Planning                       3 actions · Mai 2026       │
│  ▸ 🔒 Sécurité & Audit              5 actions                   │
│  ▸ ⚙ Système & Configuration        6 actions                   │
│  ▸ 🤖 IA & Outils                   3 actions  ⏸ OFF            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

# Synthèse comparative

| Critère                  | A — Linear/Vercel   | B — Holographique  | C — Évolution    |
|--------------------------|---------------------|--------------------|------------------|
| Risque régression        | Moyen               | Élevé              | Faible           |
| Rupture identité actuelle | Forte (vert→neutre) | Forte (luxe x10)   | Faible           |
| Densité info             | Élevée              | Moyenne            | Élevée           |
| Effet "wow"              | Sobriété pro        | Spectaculaire      | Propre           |
| Charge dev               | Élevée (refactor CSS complet) | Très élevée (anims, glass) | Modérée |
| Performance mobile       | Excellente           | Surveiller (blur)  | Bonne             |
| Accessibilité (contraste) | Excellente          | Bonne (avec attention) | Bonne          |
| Compatible iOS Safari    | Très bonne           | Glass à tester     | Très bonne        |

---

# Recommandation neutre

- **Si Kevin veut une refonte radicale, professionnelle, "futuriste sobre"** → **A**.
- **Si Kevin veut du spectacle, surprise, identité casino premium assumée** → **B**.
- **Si Kevin veut éviter le risque et juste rendre l'app propre** → **C**.

Hybride possible : adopter la **structure** de A (sidebar, command palette,
5 catégories vAdmin) et la **palette + typo** de B/C selon préférence. Mais
mieux vaut choisir une direction nette pour cohérence.

→ **Réponds par "Moodboard A", "B" ou "C"** (ou propose un hybride) et je
passe aux wireframes détaillés + design system.
