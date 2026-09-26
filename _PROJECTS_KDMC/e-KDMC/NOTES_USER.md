# NOTES_USER.md — e-KDMC Mémoire persistante

> Infos métier Kevin DESARZENS. Lu au début de CHAQUE session.
> Dernière mise à jour : 2026-05-18

---

## Règles de travail ABSOLUES (Kevin)

1. **JAMAIS de timeout** — découper les gros fichiers en morceaux, scripts générateurs Node.js
2. **Continuer même quand Kevin se déconnecte** — tant que pas terminé, continuer
3. **100 produits MINIMUM par boutique** — professionnel, pas de prototype
4. **Tout automatisé** — factures, onboarding, paiements, remboursements, emails, suivi, rapports
5. **Avant chaque action** : Analyser → Planifier → Tests → Implémenter → Valider
6. **Agents en autonomie** — ne pas attendre, ne pas couper, continuer des deux côtés
7. **Anti-timeout** : découper en chunks, scripts générateurs, jamais de Write >50KB
8. **Notification WhatsApp perso** à chaque paiement validé (pas Telegram)
9. **Vraies photos produits** uniquement — JAMAIS d'emojis ni de stock générique
10. **Rendu luxe** expert partout (Playfair Display, animations, ombres)
11. **Kevin choisit les produits** → donne nom ou photo → recherche fournisseur auto
12. **URLs courtes** prioritaires (Vercel rewrites)
13. **Mettre à jour TOUS les docs .md** à chaque changement (CLAUDE.md, NOTES_USER, TODO_KEVIN)

---

## Boutiques — État actuel v1.10 (2026-05-18)

| Store | Nom | Thème | Produits | Status |
|-------|-----|-------|----------|--------|
| **chez-lolo** | CHEZ LOLO | Provence olive #7c8c3c / crème | 100 | ✅ Live |
| **tech-hub** | Tech Hub | Bleu #3b82f6 / noir #0f172a | 100 | ✅ Live |
| **ecocraft** | EcoCraft | Vert #22c55e / beige | 100 | ✅ Live |
| **digital-vault** | Digital Vault | Violet #8b5cf6 / noir | 100 | ✅ Live |
| **pawsome** | Pawsome | Orange #f59e0b / bleu ciel | 100 | ✅ Live |

### CHEZ LOLO — Détails (Kevin 2026-05-18)
- **Ancien nom** : Glow Wellness → rebrandé CHEZ LOLO
- **Thème** : Provençal — cosmétiques naturels, soins bio
- **Palette** : olive (#7c8c3c), crème (#faf8f0), terre cuite
- **Typo** : Playfair Display serif
- **Inspiration** : Provence, huile d'olive, lavande, amande douce
- **Catégories** : Soins Visage 🫒, Corps 🌿, Huiles 🪻, Bien-être ☀️, Cheveux 🌾, Cosmétiques 🌸, Coffrets 🎁, Spa 🛁
- **Produits** : Exemples réalistes — Kevin donnera les vrais produits plus tard

---

## Paiement

- **PayPal** : `paypal.me/kdmc`
- **Revolut** : `revolut.me/kdmc` (@kdmc)
- **IBAN** : MC98••• (masqué, titulaire Kevin DESARZENS)
- **Stripe** : webhook prêt, pas encore connecté au compte Kevin

---

## URLs

### Actuelles (GitHub Pages)
- Portail : `https://9r4rxssx64-creator.github.io/CMCteams/shops/`
- CHEZ LOLO : `.../shops/chez-lolo/`
- Tech Hub : `.../shops/tech-hub/`
- EcoCraft : `.../shops/ecocraft/`
- Digital Vault : `.../shops/digital-vault/`
- Pawsome : `.../shops/pawsome/`

### Futures (Vercel — à configurer)
- `/lolo/` → CHEZ LOLO
- `/tech/` → Tech Hub
- `/eco/` → EcoCraft
- `/digital/` → Digital Vault
- `/pets/` → Pawsome
- `/admin/` → Dashboard

### Domaine à acheter
- `kdmc.shop` ou `kdmc.store` (~12€/an)
- Après achat → URLs type `kdmc.shop/lolo`

---

## Architecture APEX — Hub central

**APEX** = Super-application centrale qui intègre et pilote TOUS les projets Kevin :

| App | Fonction | Standalone | Intégré APEX |
|-----|----------|-----------|-------------|
| **CMCteams** | Planning casino SBM | ✅ | ✅ |
| **e-KDMC** | Boutiques e-commerce (5 stores) | ✅ | ✅ |
| **Télécommande Uni** | Contrôle universel | ✅ | ✅ |
| **CrackPass** | Gestionnaire mots de passe | ✅ | ✅ |
| **IA-KDMC** | Assistant IA personnel | ✅ | ✅ |

---

## Services existants

| Service | URL | Status |
|---------|-----|--------|
| Agent 24/7 | `kdmc-agent-monaco.vercel.app` | ✅ Actif |
| Health check | `kdmc-agent-monaco.vercel.app/api/health` | ✅ |
| Agent secret | `‹secret agent — COMPROMIS, à régénérer sur Vercel›` | ✅ |

---

## Préférences Kevin

- **WhatsApp perso** prioritaire sur Telegram pour TOUTES notifications
- **Notification OBLIGATOIRE** chaque paiement validé (tous projets)
- **1 clic max** pour toute action Kevin
- **Rendu luxe** partout
- **Photos réelles** uniquement
- **Autonomie totale** — ne jamais demander à Kevin ce qu'on peut faire seul

---

## Budget

- €12/an pour domaine (kdmc.shop)
- 0€ hébergement (GitHub Pages + Vercel gratuit)
- PayPal/Revolut : 0€ fixe (% par transaction)
- Stripe : 1.4% + 0.25€/transaction (EU)
- Brevo email : 0€ (gratuit 300/jour)
- **TOTAL démarrage : ~12€**
