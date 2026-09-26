# Stripe Products Setup — Apex AI

> Script reproductible pour creer les 2 produits Apex AI dans Stripe.
> Kevin : il suffit d'ouvrir Stripe CLI OU de faire depuis le Dashboard Web (guide etape par etape).

## Option A — Via Dashboard Web (le plus simple)

1. https://dashboard.stripe.com/products → **+ Add product**

### Produit 1 : Apex AI Pro
- **Name** : Apex AI Pro
- **Description** : Chat IA illimite + Domotique + Web Search + Vision + Finance + 10 agents autonomes + 5 devices + Voix + Offline + CGU/RGPD
- **Statement descriptor** : APEX AI PRO
- **Unit label** : utilisateur
- **Tax behavior** : Inclusive (TVA incluse)
- **Pricing** :
  - Model : Standard pricing
  - Price : **39,99 EUR**
  - Billing period : **Monthly** (recurring)
  - **Free trial** : 7 days (optionnel, coche la case)
- **Metadata** :
  - `apex_plan` = `pro`
  - `created_by` = `kevin`
- **Save** → copier le `price_id` (format `price_1XXX...`) → dans `stripe-webhook-worker.js` ligne 78 remplacer `"price_pro_39_99"` par le vrai ID

### Produit 2 : Apex AI Business
- **Name** : Apex AI Business
- **Description** : Tout Pro + Multi-LLM (Claude + GPT + Gemini) + Backup temps reel + Support 24/7 + Agents illimites + 20 devices + Priority support
- **Statement descriptor** : APEX AI BIZ
- **Pricing** :
  - Price : **69,99 EUR**
  - Monthly recurring
- **Metadata** :
  - `apex_plan` = `business`
- **Save** → copier `price_id` → remplacer dans worker

## Option B — Via Stripe CLI (plus rapide si tu l'as)

```bash
# Installation CLI (une fois)
brew install stripe/stripe-cli/stripe  # Mac
# ou: curl -sL https://github.com/stripe/stripe-cli/releases/latest/download/stripe-linux-x86_64 -o stripe
stripe login  # OAuth browser

# Create Pro product
stripe products create \
  --name="Apex AI Pro" \
  --description="Chat IA illimite + Domotique + Finance + 10 agents + 5 devices" \
  --metadata="apex_plan=pro"
# Note l'ID produit retourne (prod_XXX)

stripe prices create \
  --currency=eur \
  --unit-amount=3999 \
  --recurring="interval=month" \
  --product=prod_XXX \
  --metadata="apex_plan=pro"
# Note l'ID prix (price_XXX)

# Create Business product
stripe products create \
  --name="Apex AI Business" \
  --description="Tout Pro + Multi-LLM + Backup + Support 24/7 + Agents illimites" \
  --metadata="apex_plan=business"

stripe prices create \
  --currency=eur \
  --unit-amount=6999 \
  --recurring="interval=month" \
  --product=prod_YYY \
  --metadata="apex_plan=business"
```

## Apres creation

1. Dashboard Stripe > **Developers > Webhooks > + Add endpoint**
   - URL : `https://apex-stripe-webhook.<ton-sous-domaine>.workers.dev`
   - Events : selectionner **customer.subscription.***, **invoice.payment_succeeded**, **invoice.payment_failed**
   - Copier le **Signing secret** (whsec_...)
2. Coller dans Cloudflare Worker `STRIPE_WEBHOOK_SECRET` env var
3. Verifier les `price_id` dans le worker ligne 78

## Test end-to-end

```bash
# Trigger un test webhook localement
stripe listen --forward-to https://apex-stripe-webhook.xxx.workers.dev

# Simuler un paiement reussi
stripe trigger invoice.payment_succeeded
```

Verifier dans Firebase RTDB console que `/apex/clients/<uid>/plan` = "pro" ou "business".

## TVA (important Monaco/France)

Dashboard Stripe > **Tax** :
- Activer Stripe Tax (auto-calcul TVA UE)
- Monaco applique TVA francaise 20%
- Origine : ta juridiction fiscale (Monaco si residence)

## Coordonnees bancaires

Dashboard Stripe > **Settings > Payouts** :
- IBAN Monaco (MC27) OK accepte
- Frequence : **Weekly** recommandee (sinon 7 jours d'attente par defaut)

---

**A faire par Kevin (1h max)** :
1. Creer 2 produits Dashboard (Option A) → recuperer 2 `price_id`
2. Remplacer dans `tools/stripe-webhook-worker.js` ligne 78
3. Deployer Worker (2 min sur Cloudflare)
4. Creer webhook endpoint (2 min dans Stripe)
5. Test avec `stripe trigger`

Claude Code a fait tout le reste (template worker, mapping, handlers).
