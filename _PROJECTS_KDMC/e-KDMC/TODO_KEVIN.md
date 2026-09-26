# TODO KEVIN — Actions utilisateur requises

> Mémo mis à jour automatiquement. Actions que TOI (Kevin) dois faire.
> Dernière mise à jour : 2026-05-18

---

## État actuel e-KDMC v1.10

### 5 Boutiques EN LIGNE ✅

| Boutique | URL GitHub Pages | URL courte Vercel (à configurer) |
|----------|-----------------|----------------------------------|
| **Portail** | `9r4rxssx64-creator.github.io/CMCteams/shops/` | `kdmc-shops.vercel.app/` |
| **CHEZ LOLO** | `.../shops/chez-lolo/` | `.../lolo/` |
| **Tech Hub** | `.../shops/tech-hub/` | `.../tech/` |
| **EcoCraft** | `.../shops/ecocraft/` | `.../eco/` |
| **Digital Vault** | `.../shops/digital-vault/` | `.../digital/` |
| **Pawsome** | `.../shops/pawsome/` | `.../pets/` |
| **Dashboard** | `.../shops/dashboard/` | `.../admin/` |

### Ce qui est fait ✅
- 500 produits (100/boutique) avec descriptions uniques
- Photos Unsplash réelles par produit
- Paiement : PayPal + Revolut @kdmc + Virement IBAN
- CHEZ LOLO : thème provençal (olive, crème, Playfair Display)
- UX luxe : typo serif, animations fadeUp, glassmorphism, ombres profondes
- Pages légales : CGV, Mentions légales, Politique confidentialité
- Dashboard admin : 6 vues (orders, products, customers, analytics, finance, settings)
- Agent automation : inventory, carts, orders, health, daily, weekly, notify
- Fonctions serverless : Stripe webhook, email triggers, factures PDF

### Ce qui manque ❌
- Notification WhatsApp paiement (Kevin préfère WhatsApp à Telegram)
- Vrais fournisseurs (produits actuels = exemples réalistes, pas connectés)
- Stripe connecté (webhook prêt mais pas relié au compte Kevin)
- Newsletter backend (formulaire OK mais pas de service d'envoi)
- SEO : Open Graph + JSON-LD structured data

---

## 🏪 ACTION 1 — Déployer les boutiques sur Vercel (URLs courtes)

**Temps : 2 minutes | Priorité : HAUTE**

1. Ouvre `https://vercel.com/new`
2. **Import** → choisis le repo `CMCteams`
3. **Root Directory** → tape `shops`
4. **Framework Preset** → `Other`
5. **Deploy**

Résultat : URLs courtes type `cmcteams-shops.vercel.app/lolo/`

---

## 🌐 ACTION 2 — Acheter un nom de domaine (URLs ultra-courtes)

**Temps : 5 minutes | Budget : ~12€/an | Priorité : RECOMMANDÉE**

Options recommandées :
- **`kdmc.shop`** → `kdmc.shop/lolo`, `kdmc.shop/tech`, etc.
- **`kdmc.store`** → `kdmc.store/lolo`, etc.
- **`lolo.shop`** → dédié CHEZ LOLO uniquement

Où acheter :
- Cloudflare Registrar (le moins cher) : `https://dash.cloudflare.com/domains`
- Namecheap : `https://www.namecheap.com`
- OVH : `https://www.ovh.com/fr/domaines/`

Après achat → je le connecte automatiquement à Vercel (0 action de ta part).

---

## 💳 ACTION 3 — Connecter les paiements réels

### PayPal (déjà en place dans les boutiques)
- [ ] Vérifier que ton lien `paypal.me/kdmc` est actif
- [ ] Tester un achat de 1€ depuis la boutique

### Revolut @kdmc (déjà en place)
- [ ] Vérifier que `revolut.me/kdmc` fonctionne
- [ ] Tester un envoi

### Stripe (pour paiement CB intégré)
- [ ] Créer un compte Stripe : `https://dashboard.stripe.com/register`
- [ ] Clés `pk_test_xxx` et `sk_test_xxx` → je les intègre
- [ ] Activer webhooks → URL : `https://kdmc-agent-monaco.vercel.app/api/stripe-webhook`

### IBAN (déjà en place — masqué MC98•••)
- [ ] Confirmer ton IBAN complet pour l'afficher aux clients
- [ ] Ou le garder masqué avec demande par email

---

## 📱 ACTION 4 — Notifications paiement WhatsApp

**Kevin préfère WhatsApp (perso) à Telegram.**

Option gratuite : CallMeBot
1. Envoie ce message depuis ton WhatsApp à `+34 644 71 89 23` :
   `I allow callmebot to send me messages`
2. Tu recevras une API key
3. Donne-moi la key → je configure les notifs automatiques

Chaque paiement → message WhatsApp :
> "💰 Nouveau paiement CHEZ LOLO : 45,00€ — Client: Jean D. — Produit: Sérum Vitamine C"

---

## 🛒 ACTION 5 — Choisir le business model (quand prêt)

| Modèle | Avantage | Inconvénient |
|--------|----------|-------------|
| **Dropshipping** (AliExpress/CJ) | 0 stock, 0 investissement | Délais 7-15j, qualité variable |
| **Print-on-demand** (Printful) | Personnalisé, 0 stock | Marges faibles (~20%) |
| **Affiliation** (Amazon) | 0 gestion, 0 SAV | Commissions faibles (3-8%) |
| **Produits locaux** (Provence) | Qualité, marges fortes | Stock + logistique |
| **Digital** (formations, templates) | 0 stock, marges 90%+ | Création initiale longue |

Pour **CHEZ LOLO** spécifiquement :
- Produits provençaux locaux (savons, huiles) = idéal pour la marque
- Kevin donne les noms/photos → je cherche fournisseurs + organise auto

---

## 📧 ACTION 6 — Emails transactionnels

- [ ] Créer un compte Brevo : `https://www.brevo.com/` (gratuit 300 emails/jour)
- [ ] Clé API → je connecte les 6 templates email (confirmation, expédition, livraison, abandon panier, bienvenue, facture)

---

## 🔧 CONFIGURATION VERCEL EXISTANTE

| Service | URL | Status |
|---------|-----|--------|
| Agent 24/7 | `kdmc-agent-monaco.vercel.app` | ✅ Actif |
| Health check | `kdmc-agent-monaco.vercel.app/api/health` | ✅ |
| Agent secret | `‹secret agent — COMPROMIS, à régénérer sur Vercel›` | ✅ |
| Shops (à déployer) | `kdmc-shops.vercel.app` | ⏳ Action 1 |

---

## 💰 Budget estimé (démarrage)

| Poste | Coût | Fréquence |
|-------|------|-----------|
| Domaine `kdmc.shop` | ~12€ | /an |
| Hébergement Vercel/GitHub Pages | 0€ | gratuit |
| PayPal/Revolut | 0€ fixe | % par transaction |
| Stripe | 1.4% + 0.25€ | /transaction (EU) |
| Brevo email | 0€ | gratuit (300/jour) |
| **TOTAL démarrage** | **~12€** | |

---

## 📋 Préférences Kevin notées

- **WhatsApp perso** prioritaire sur Telegram pour toutes notifications
- **Notification obligatoire** à chaque paiement validé (tous projets)
- **CHEZ LOLO** = cosmétiques Provence (pas "Glow Wellness")
- **Vraies photos** produits, jamais d'emojis
- **Rendu luxe** partout (Playfair Display, animations, ombres)
- **Kevin choisit les produits** → donne un nom ou photo → je cherche fournisseur auto
- **URLs courtes** prioritaires
- **1 clic max** pour toute action Kevin

---

*Ce fichier est mis à jour automatiquement. Dernière MAJ : 2026-05-18 session e-commerce.*
