# 🎯 La Détente — Architecture & décisions (Kevin)

> Boutique POD (Printify) marque blanche. MAJ 2026-06.

## Rôles & accès
- **Boutique (clients)** : acheter uniquement. **PAS d'accès au Studio**, **pas de favoris**.
- **Studio (admin uniquement)** : créer les produits. Gardé par `ld_admin` (redirige les clients vers la boutique). FAB/liens Studio masqués aux clients.
- **Admin** : activer via `?ld_admin=‹code admin›` (boutique ⚙️). Catalogue Printif + publication.

## Prix & coûts
- **Coûts / marges = admin/studio uniquement** — jamais affichés au client (le client voit le prix de vente seul).
- **Marge par défaut ×2,5** (bouton ×3 sur pièces signature). Affichée à la publication.
- **Coût réel Printify** via worker `/cost` (produit-sonde créé/lu/supprimé) — bouton « 💰 Coût réel ». Sinon coût indicatif (label « estimatif »).
- **Prix avec logo / sans logo** : le print ajoute un coût (≈ +3 € indicatif). 2 prix affichés.
- ⚠️ L'API catalogue Printify n'expose pas les coûts → coût réel = via produit-sonde / dashboard.

## Catalogue
- **Tout le catalogue Printify (1408) est dans le STUDIO** (admin) pour créer.
- La **boutique n'affiche que ce que l'admin publie** (pas d'auto-remplissage).
- Onglet admin **🌱 Stanley/Stella (bio)** = 15 modèles S&S regroupés.
- **Catégorie auto-créée** à la publication si elle n'existe pas.

## Paiement & flux (PayPal/Revolut/virement pour l'instant)
1. Client paie Kevin (PayPal/Revolut/virement). 2. Commande → Printify (on-hold).
3. Kevin valide/paie Printify. 4. Printify fabrique + expédie (marque blanche). 5. Marge = prix − coût − port − frais.
- Config Printify : voir `PRINTIFY_CONFIG.md` (paiement, approbation manuelle, marque blanche, atelier UE).

## Fait
- Studio : catalogue complet, vraie photo produit (API), graffiti/all-over, photo réelle par défaut.
- Boutique : recherche par thèmes, AOP/Bio, marge ×2,5/×3, tel quel/avec logo, coût réel worker.
- Clients : studio bloqué, favoris retirés.

## À FAIRE (demandé Kevin)
- [ ] 2ᵉ emplacement (dos) = +coût impression dans le calcul.
- [ ] Publication = créer le **vrai produit Printify** (commande 100% propre).
- [ ] **Fiches clients (CRM)** : infos + historique commandes.
- [ ] **Réductions par client** (individuel).
- [ ] (Plus tard) 100% auto = Stripe + auto-charge Printify (pour l'instant on garde PayPal etc.).
