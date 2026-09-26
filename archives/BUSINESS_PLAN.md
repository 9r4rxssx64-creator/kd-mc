# BUSINESS_PLAN.md — Modèle économique Apex AI + scaling + limites

> Réponse aux questions Kevin 2026-04-21 : limites du gratuit, abonnements, remboursements,
> coordonnées bancaires, scaling 100 clients × 20 projets.

---

## 💰 Réponse courte

- **Pour 100 clients × 20 projets** : tu DOIS passer Firebase Blaze (pay-as-you-go, quasi-gratuit avant 10 000 users actifs) et prévoir ~30-80 €/mois de coûts Anthropic API selon usage. **Revenus potentiels : 1 400-3 000 €/mois** (cf. projection).
- **Tu peux augmenter les tarifs** : Pro 14.99€ → 19.99€ acceptable (= ChatGPT Plus) vu features différentiantes (domotique, multi-devices, offline).
- **Coordonnées bancaires** → Stripe Dashboard (étape à faire par toi, 10 min).
- **Remboursements** : Stripe refund natif + politique à documenter (je propose ci-dessous).

---

## 📊 Limites du "gratuit" actuel

| Service | Plan actuel | Limite | Après ? |
|---------|-------------|--------|---------|
| **GitHub Pages** | Free | 100 GB bandwidth/mois, 1 GB stockage, 10 builds/h | Largement OK pour 1000+ users |
| **Firebase RTDB Spark (free)** | Free | **1 GB stockage, 10 GB downloads/mois, 100 connexions simultanées, 20k writes/jour** | ⚠️ Saturé rapidement avec 100+ users actifs |
| **Cloudflare Workers** | Free | 100k requests/jour, 10ms CPU/request | OK pour proxy Anthropic jusqu'à ~5000 users/jour |
| **Anthropic API** | **Pay-as-you-go obligatoire** | Aucun free tier. Prix : Haiku 4.5 = 1$/1M tokens input, 5$/1M output. Sonnet = 3$/15$ | ⚠️ Seul coût inévitable |
| **Sentry (monitoring)** | Free | 5k errors/mois, 10k performance events | OK |
| **Stripe** | Free (commission 1.4% + 0.25€/transaction EU) | Aucune limite | Prélève sur chaque paiement |
| **EmailJS** | Free | 200 emails/mois | Upgrade 5$/mois = 1000 emails |

### ⚠️ Goulot d'étranglement principal : **Firebase RTDB free tier**

- 100 connexions simultanées = **limite CRITIQUE** à 100 users
- 20k writes/jour = plan planning casino peut saturer vite
- **Solution** : Firebase Blaze (pay-as-you-go). **Quasi-gratuit** tant que sous la limite Spark + facturation uniquement du dépassement (environ 5€/mois pour 500 users actifs)

---

## 🚀 Scaling "100 clients × 20 projets"

### Estimation trafic
- **100 clients** × **20 projets actifs** = 2000 "app instances"
- ~50 connexions simultanées en pointe (hypothèse 2.5% du parc connecté à la fois)
- ~40k writes Firebase/jour (200 actions/client/jour × 100 × conservatif)
- ~500 appels Anthropic/jour (5 conversations/client moyenne)

### Coûts estimés mensuels (à 100 clients)
| Poste | Mensuel |
|-------|---------|
| Firebase Blaze (bandwidth + storage dépassement) | **10-25 €** |
| Anthropic API (Haiku 4.5, ~5M tokens/mois) | **30-50 €** |
| Cloudflare Workers | Gratuit (sous limite) |
| Stripe commissions | ~1.4% × revenus |
| GitHub Pages / Sentry / EmailJS | Gratuit / 5 € |
| **Total charges** | **~50-85 €/mois** |

### Revenus potentiels (100 clients)
- Scénario Starter : 80 clients × 4.99€ + 20 Pro × 14.99€ = **700 €/mois**
- Scénario Pro dominant : 60 × Pro 14.99 + 30 × Business 29.99 + 10 × Enterprise 79.99 = **2 700 €/mois**
- Scénario optimiste (tarifs revus +30%) : = **3 500-4 500 €/mois**

**Marge nette estimée : 85-95%** après charges. Rentable.

---

## 💳 Coordonnées bancaires / Recevoir les paiements

### Étapes à faire par toi (10 minutes)

1. Va sur https://dashboard.stripe.com (lien dans vAdminLinks)
2. Connecte-toi ou crée ton compte Stripe (gratuit, pas de frais d'ouverture)
3. **Dashboard → Settings → Bank accounts and scheduling** → ajoute ton IBAN/RIB
4. Vérification bancaire (micro-versement de Stripe sous 1-2 jours)
5. Configure **Payout schedule** : automatique (default 7 jours rolling) ou manuel
6. Active les produits : **Products → Add product** → crée 4 produits
   - APEX AI Starter 4.99€/mois
   - APEX AI Pro 14.99€/mois
   - APEX AI Business 29.99€/mois
   - APEX AI Enterprise 79.99€/mois
   - APEX AI Lifetime 299€ one-time
7. Copie les **Price IDs** dans l'app : Réglages admin → Paiement → colle chaque `price_xxxx`
8. **Webhook Stripe** : ajoute l'URL de ton proxy Cloudflare Worker (à créer pour handler) → event `customer.subscription.*`

### Où va l'argent ?
**Sur TON compte bancaire** que tu ajoutes à Stripe. Stripe prélève 1.4% + 0.25€ par transaction EU, reverse le reste tous les 7 jours (ou à la demande).

---

## 🔄 Remboursements / Garanties

### Politique proposée (à publier dans Conditions)
- **14 jours satisfait ou remboursé** (loi consommation UE, obligatoire)
- **Proratisation** si bug majeur > 24h : remboursement auto du mois en cours proratisé
- **Annulation à tout moment** : abonnement continue jusqu'à fin de période payée, pas de re-débit

### Mécanisme technique (à implémenter)
1. **Stripe Refund API** : bouton dans Admin → "Rembourser user X" → appel API Stripe
2. **Auto-detection bug critique** : si `_snAutoAudit` détecte downtime > 24h dans `ax_audit_log`, flag refund automatique pour tous les users actifs
3. **Notification user** : email via EmailJS "Nous avons détecté un problème, votre abonnement du mois est remboursé auto"
4. **Journal** : chaque refund loggé dans `ax_refund_log` (nouvelle clé FB_FIX)

**Statut actuel** : **NON IMPLÉMENTÉ**. À ajouter (prochaine session).

---

## 📈 Tarifs — vaut le coup d'augmenter ?

### Audit externe v12.18 → 8.5/10
Verdict expert : "Positionnement agressif, -25% vs ChatGPT avec plus de features. Rapport Q/P très bon. Note 8.5/10."

### Recommandation (mes compétences expert)
- **Pro 14.99€ → 19.99€** (= ChatGPT Plus). Features supérieures (domotique, multi-devices, offline, Claude Haiku rapide) justifient. Gain +33% revenu.
- **Business 29.99€ → 39.99€** (segment équipes/PME peu sensibles prix). Gain +33%.
- **Enterprise 79.99€ → 149€** (ajouter SLA 99.9% + support dédié + webhook custom). Cible : 5-10 clients premium.
- **Lifetime 299€** : garder, bon acquisition.
- **Créer plan Mid 9.99€** pour lisser Starter→Pro (réduit cannibalisation).

### Impact projeté à 100 clients
| Version tarifs | Revenu mensuel (scénario mixte) |
|----------------|--------------------------------|
| Actuel | ~1 400 € |
| Revu +33% | ~2 000 € |
| Avec Enterprise premium + 10 clients | ~3 200 € |

---

## 📎 Upload documents/photos dans Apex (fonctionne déjà)

**Déjà implémenté** v12.x :
- `axUploadImage(file)` — upload image, envoie à Claude Vision pour analyse
- `axParsePdf(file)` — extraction texte PDF via pdf.js, résumé auto
- `axCameraCapture()` — prise photo directe
- **Drag & drop** sur `#content` : any fichier → upload auto
- Formats acceptés : `.pdf`, `.csv`, `.txt`, `.json`, `.md`, images

**Claude Vision en action** : si tu envoies une photo (ex: écran, document scanné), Claude Haiku 4.5 l'analyse, extrait texte/infos, propose des actions (`analyze_and_act` tool) → ex: "J'ai détecté une facture, veux-tu l'ajouter aux dépenses ?".

**Auto-intégration future** : si tu dis "retiens que X" après upload, `kbAdd` mémorise. Si tu dis "ajoute ça à mes tâches", `app_action: add_task` s'exécute.

---

## 🎯 Checklist "site pro complet" — ce qui reste à faire

| Item | Statut |
|------|--------|
| Upload docs/photos + analyse IA | ✅ Fait (v12.x) |
| Claude Vision + `analyze_and_act` | ✅ Fait |
| Coffre crédentials sécurisé | ✅ Fait (vVault 12 catégories) |
| 60 liens admin cliquables | ✅ Fait (v12.20) |
| Grille tarifaire + audit 8.5/10 | ✅ Fait |
| Stripe configuré (produits + price IDs) | ⚠️ À faire par Kevin (10 min) |
| IBAN / coordonnées bancaires Stripe | ⚠️ À faire par Kevin |
| Webhook Stripe → activation abonnements | ⚠️ À coder |
| Politique remboursement + mécanisme | ⚠️ À coder |
| CGU / Mentions légales / RGPD | ⚠️ À rédiger |
| Firebase Blaze (pay-as-you-go) | ⚠️ À activer par Kevin quand > 50 users |
| Page d'accueil marketing (landing) | ⚠️ Présente mais perfectible |
| SEO + Google Search Console | ⚠️ À faire |
| Analytics (PostHog ou équivalent) | ⚠️ À ajouter |
| Support client (chat live, email auto) | ✅ Partiel (EmailJS OK, chat à ajouter) |

---

**Dernière MAJ : 2026-04-21 — v12.24 / v9.454**
