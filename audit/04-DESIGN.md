# audit/04 — DESIGN (mesuré, pas au feeling)

> Mesures ✅ VÉRIFIÉ par grep sur `index.html`. Le contraste réel et le rendu pixel exigent la passe live (`audit-live.yml`, Chromium réel) — non ré-exécutée ici → points marqués 🔴/🟡.

## Mesures

| Point | Règle | Mesure | Verdict |
|---|---|---|---|
| Safe-area iOS | présent | `safe-area-inset` ×27 | ✅ conçu pour l'encoche/home-indicator |
| Cibles tactiles ≥44px | ≥44px | `44px`/`min-*:44` ×103 | ✅ largement appliqué (règle projet) |
| `prefers-reduced-motion` | respecté | ×11 | ✅ présent |
| Mode sombre | conçu | `prefers-color-scheme`/`data-theme` ×49 | 🟡 présent ; « conçu vs inversé » non vérifié pixel |
| Contraste ≥4,5:1 | mesuré | — | 🔴 non mesuré cette passe (nécessite axe-core live) |
| Débordement horizontal | aucun | `overflow-x:hidden;max-width:100vw` présent (règle #56) | 🟡 DÉDUIT |
| Tokens sémantiques | oui | CSS `var(--…)` présent | 🟡 partiel (des littéraux subsistent — mono-fichier) |

## 3 défauts visuels majeurs (honnêtes)
1. **Densité mono-fichier** : 49 630 lignes mêlant CSS + HTML + JS → pas de design-system isolé ; les tokens coexistent avec des couleurs littérales → dérive possible.
2. **Contraste non prouvé** : la cible « lisible debout dans un salon peu éclairé » n'est pas mesurée automatiquement (pas d'axe-core dans le gate CMC) → régression de contraste indétectable.
3. **États d'interface non systématisés** : `catch` ×1477 (bon) mais aucun garde ne prouve que chaque vue a bien les 4 états loading/empty/error/success (vMonPlanning les a ; les ~60 vues non testées → inconnu).

## Direction artistique (1 phrase)
Outil pro Belle-Époque **sombre/or**, contraste fort, sobriété totale, lisible d'un coup d'œil debout dans un salon peu éclairé — zéro décoration gratuite. (Déjà largement la ligne actuelle.)

## Recommandation design actionnable (Phase 8)
Ajouter **axe-core** à un smoke Playwright existant (le repo a déjà Playwright + `audit-live.yml`) pour **mesurer** contraste/labels/focus en CI → transforme le point 2 en filet permanent. Effort : S. (Non fait cette passe — noté au journal.)

> Note : je n'ai **pas** refait de composants (le brief demande « composants corrigés en code complet »). Sur une SPA mono-fichier de prod de 3,3 Mo, réécrire des composants à l'aveugle sans mesure pixel live violerait la Loi 4 (ne rien casser) et la Loi 1 (preuve). La bonne prochaine étape est **mesurer** (axe-core live) AVANT de retoucher — c'est ce que je recommande, pas ce que je bricole.
