# Regles Frontend

- Mobile-first (375px minimum — iPhone SE)
- Pas de table-layout:fixed dans conteneur scrollable
- Pas d'overflow:hidden sur parent d'enfant scrollable
- Touch targets minimum 44px
- Safe area insets pour iOS (env(safe-area-inset-bottom))
- Tester sur 5 viewports : 375px, 390px, 412px, 768px, 1200px
- Animations GPU-accelerated (transform, opacity)
- Font-size minimum 14px sur mobile
- Dark theme par defaut, light theme optionnel
- Emojis en surrogate pairs (pas de \u{XXXX}) pour Safari iOS
