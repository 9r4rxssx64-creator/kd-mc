# e-KDMC — Plateforme e-Commerce Automatisée KDMC

Projet de Kevin DESARZENS (U11804 · kevind@monaco.mc).
Créé le 2026-04-13. **EN PRODUCTION v1.10** depuis le 2026-05-18.

---

## 🎯 État du projet

**5 boutiques en ligne + dashboard admin + agent automation 24/7.**

| Boutique | Thème | Produits | Status |
|----------|-------|----------|--------|
| **CHEZ LOLO** | Cosmétiques Provence (olive/crème) | 100 | ✅ Live |
| **Tech Hub** | Gadgets & accessoires tech | 100 | ✅ Live |
| **EcoCraft** | Éco-responsable, zéro déchet | 100 | ✅ Live |
| **Digital Vault** | Produits numériques (formations, templates) | 100 | ✅ Live |
| **Pawsome** | Animaux (chiens, chats) | 100 | ✅ Live |

**Total : 500 produits, descriptions uniques, photos Unsplash réelles.**

---

## 👤 Identité admin

- **Nom** : Kevin DESARZENS
- **Matricule SBM** : U11804
- **Email** : kevind@monaco.mc
- **Localisation** : Monaco / Monte-Carlo
- **Préfix projets** : KDMC

---

## 🏗 Architecture technique

### Stack
- **Frontend** : SPA HTML/CSS/JS vanilla (monofichier par boutique, 0 dépendance)
- **Hébergement** : GitHub Pages (gratuit) + Vercel (à configurer pour URLs courtes)
- **Paiement** : PayPal (`paypal.me/kdmc`) + Revolut (`@kdmc`) + Virement IBAN
- **Emails** : Brevo (à connecter) — 6 templates prêts
- **Factures** : Générateur PDF serverless
- **Agent** : Node.js Vercel cron — inventory, orders, health, notifications
- **Dashboard** : SPA admin 6 vues (orders, products, customers, analytics, finance, settings)

### Structure fichiers
```
shops/
├── index.html              # Portail (liste les 5 boutiques)
├── vercel.json             # Rewrites URLs courtes (/lolo, /tech, etc.)
├── chez-lolo/index.html    # CHEZ LOLO (ex glow-wellness)
├── tech-hub/index.html     # Tech Hub
├── ecocraft/index.html     # EcoCraft
├── digital-vault/index.html # Digital Vault
├── pawsome/index.html      # Pawsome
├── dashboard/index.html    # Dashboard admin
├── legal/
│   ├── cgv.html            # Conditions Générales de Vente
│   ├── mentions.html       # Mentions Légales
│   └── confidentialite.html # Politique Confidentialité

_PROJECTS_KDMC/e-KDMC/
├── CLAUDE.md               # Ce fichier
├── NOTES_USER.md           # Infos métier e-commerce
├── TODO_KEVIN.md           # Actions Kevin priorisées
├── functions/
│   ├── stripe-webhook.js   # Webhook Stripe (signature vérifiée)
│   ├── email-trigger.js    # 6 templates email transactionnel
│   └── invoice-generate.js # Générateur factures PDF
├── automation/agent/index.js # Agent 24/7 (7 fonctions)
├── _shared/
│   ├── css/kdmc-components.css
│   └── js/kdmc-core.js
└── tools/scripts/
    ├── generate-store.js
    └── generate-products.js
```

### URLs

| Boutique | GitHub Pages | Vercel (à configurer) |
|----------|-------------|----------------------|
| Portail | `.../shops/` | `kdmc-shops.vercel.app/` |
| CHEZ LOLO | `.../shops/chez-lolo/` | `.../lolo/` |
| Tech Hub | `.../shops/tech-hub/` | `.../tech/` |
| EcoCraft | `.../shops/ecocraft/` | `.../eco/` |
| Digital Vault | `.../shops/digital-vault/` | `.../digital/` |
| Pawsome | `.../shops/pawsome/` | `.../pets/` |
| Dashboard | `.../shops/dashboard/` | `.../admin/` |

---

## 🛒 CHEZ LOLO — Détails

**Rebrand de Glow Wellness** (Kevin 2026-05-18).

- **Nom** : CHEZ LOLO
- **Thème** : Provençal — cosmétiques naturels, soins bio
- **Palette** : olive (#7c8c3c), crème (#faf8f0), terre cuite
- **Typo** : Playfair Display (serif élégant) pour titres + logos
- **Images** : Olivier, lavande, amande douce, flacons cosmétiques
- **Catégories** : Soins Visage 🫒, Soins Corps 🌿, Huiles & Aromathérapie 🪻, Bien-être Provence ☀️, Soins Cheveux 🌾, Cosmétiques Naturels 🌸, Coffrets Provence 🎁, Accessoires & Spa 🛁
- **Produits** : Exemples réalistes — Kevin choisira les vrais produits (donne un nom ou photo → recherche fournisseur auto)

---

## 💳 Paiement

### Moyens intégrés
1. **PayPal** — lien `paypal.me/kdmc` + montant pré-rempli
2. **Revolut** — lien `revolut.me/kdmc` (@kdmc)
3. **Virement IBAN** — MC98••• affiché + bouton copier
4. **Stripe** — webhook prêt (`functions/stripe-webhook.js`), pas encore connecté

### Modal checkout
Clic "Commander" → modal avec les 3 options de paiement. Style luxe, glassmorphism.

---

## 📱 Notifications

- **WhatsApp perso** prioritaire (Kevin préfère WhatsApp à Telegram)
- Notification OBLIGATOIRE à chaque paiement validé (tous projets)
- Setup CallMeBot : voir TODO_KEVIN.md Action 4

---

## 🎨 UX / Design

- **Luxe** : Playfair Display serif, animations fadeUp staggered, ombres profondes
- **Mobile-first** : 375px minimum (iPhone SE)
- **Glassmorphism** : toast + cart overlay avec backdrop-filter blur
- **Cards** : transition cubic-bezier, box-shadow profonde au hover
- **Boutons** : uppercase + letter-spacing premium
- **Photos** : Unsplash réelles spécifiques par produit (pas de stock générique)
- **JAMAIS d'emojis** comme images produit

---

## 🔒 Sécurité

- `esc()` sur TOUTE donnée utilisateur avant innerHTML
- Stripe webhook : vérification signature `stripe-signature` header
- IBAN masqué par défaut (MC98•••)
- Cookies banner RGPD
- Pages légales complètes (CGV, Mentions, Confidentialité)
- Pas de clés API dans le code — env vars / vault uniquement
- Prix jamais calculés côté client

---

## 🚨 Règles NON-NÉGOCIABLES e-KDMC

1. **Notification paiement WhatsApp** obligatoire tous projets
2. **Vraies photos** uniquement, jamais d'emojis
3. **Rendu luxe** partout (Playfair Display, animations, ombres)
4. **Kevin choisit les produits** → donne nom ou photo → recherche fournisseur auto
5. **URLs courtes** prioritaires (Vercel rewrites)
6. **1 clic max** pour toute action Kevin
7. **Import lossless** : chaque donnée produit doit être exacte
8. **Paiement multi** : PayPal + Revolut + IBAN minimum

---

## ❌ Erreurs à NE PAS reproduire

1. Emojis comme images produit (Kevin : "c'est nul") ❌
2. Descriptions identiques sur tous les produits ❌
3. Photos stock génériques (paysages au lieu de vrais produits) ❌
4. Specs copier-coller ("193g" pour tout) ❌
5. Paiement juste "Redirection vers Stripe" sans alternative ❌
6. URL trop longue sans raccourci ❌
7. Nom "Glow Wellness" au lieu de "CHEZ LOLO" ❌

---

## 📋 Journal des décisions

| Date | Décision | Kevin |
|------|----------|-------|
| 2026-05-18 | Création 5 boutiques e-KDMC | ✅ |
| 2026-05-18 | Rebrand Glow Wellness → CHEZ LOLO provençal | Kevin |
| 2026-05-18 | Paiement PayPal + Revolut @kdmc + IBAN | Kevin |
| 2026-05-18 | WhatsApp perso pour notifications (pas Telegram) | Kevin |
| 2026-05-18 | Vraies photos + rendu luxe expert | Kevin |
| 2026-05-18 | URLs courtes via Vercel rewrites | Kevin |

---

*Dernière mise à jour : 2026-05-18 (v1.10 — 5 boutiques live, CHEZ LOLO provençal, UX luxe)*
