# Conditions Générales d'Utilisation (CGU) — Apex AI

> ⚠️ **TEMPLATE OBSOLÈTE — NE PAS CITER, NE PAS PUBLIER.** La version **en vigueur** est
> `apex-ai/v13/docs/legal/cgu.md` (remplie, v13.0.82 du 2026-05-04). Ce fichier est un brouillon
> laissé avec ses `[DATE]` / `[ADRESSE LÉGALE]` non renseignés : le citer par erreur ferait
> passer un document juridique à trous pour le document officiel. *(Signalé le 6.09.2026.)*



> **TEMPLATE LEGAL — À COMPLÉTER AVEC AVOCAT KEVIN AVANT MISE EN PRODUCTION**
> Dernière mise à jour : [DATE À RENSEIGNER]
> Version : 1.0 (template)

## Préambule

Les présentes Conditions Générales d'Utilisation (ci-après "CGU") régissent l'utilisation de l'application **Apex AI** (ci-après "l'Application"), éditée par :

- **Éditeur** : [NOM ENTREPRISE / KEVIN DESARZENS]
- **Adresse** : [ADRESSE LÉGALE — Casino Monaco / siège social]
- **Email contact** : kevin.desarzens@gmail.com
- **Représentant légal** : Kevin DESARZENS

L'Application est accessible via PWA à l'adresse : https://9r4rxssx64-creator.github.io/CMCteams/apex-ai/

## Article 1 — Objet

L'Application Apex AI est un assistant intelligent personnel et professionnel offrant :
- Chat IA multi-modèle (Anthropic Claude, Groq, Google Gemini, OpenAI)
- Studios pro (musique, vidéo, photo, architecture, finance, juridique, médical, etc.)
- Outils de productivité (notes, calendrier, tâches, contacts, finance)
- Service client via WhatsApp
- Mémoire personnalisée et apprentissage cross-session

## Article 2 — Acceptation des CGU

L'utilisation de l'Application implique l'acceptation pleine et entière des présentes CGU. L'Utilisateur reconnaît avoir lu et compris les CGU avant toute utilisation.

## Article 3 — Description du service

### 3.1 Accès gratuit

[À DÉFINIR avec Kevin/avocat]

### 3.2 Forfaits payants

[À DÉFINIR — niveaux d'abonnement, prix mensuels, services inclus]

### 3.3 Période d'essai

[À DÉFINIR — durée, conditions]

## Article 4 — Inscription et compte utilisateur

### 4.1 Création de compte

L'Utilisateur fournit lors de l'inscription :
- Prénom, nom
- Adresse email
- Numéro de téléphone (validation OTP via WhatsApp)
- Mot de passe / PIN sécurisé

### 4.2 Validation par OTP WhatsApp

Conformément au système de validation par code à usage unique (OTP) envoyé via WhatsApp :
- Code à 6 chiffres valide 10 minutes
- Maximum 5 tentatives avant blocage
- Stocké chiffré, supprimé après validation

### 4.3 Sécurité du compte

L'Utilisateur est responsable de la confidentialité de ses identifiants. Tout usage non autorisé du compte doit être signalé immédiatement à kevin.desarzens@gmail.com.

## Article 5 — Données personnelles et RGPD

### 5.1 Conformité RGPD (Règlement UE 2016/679)

L'Application respecte le Règlement Général sur la Protection des Données :
- **Article 17 (Droit à l'oubli)** : suppression complète sur demande via fonction `axDeleteAccountTotal`
- **Article 20 (Portabilité)** : export des données en JSON via fonction `axExportData`
- **Article 7 (Consentement)** : opt-in explicite pour chaque traitement (via `_cguAsk` helper)

### 5.2 Données collectées

| Type | Finalité | Base légale | Durée |
|------|----------|-------------|-------|
| Identité (nom, prénom, email, téléphone) | Compte utilisateur | Contrat | Tant que compte actif + 3 ans |
| Conversations IA | Mémoire personnalisée | Consentement | Suppression immédiate sur demande |
| Voiceprint (si enrôlement) | Reconnaissance vocale "Dis Apex" | Consentement | Local uniquement, jamais cloud |
| Logs d'usage | Sécurité + amélioration service | Intérêt légitime | 30 jours puis purge |

### 5.3 Hébergement données

- **localStorage navigateur** : données locales chiffrées AES-GCM 256
- **Firebase Realtime Database** (Google) : données partagées admin
  - Hébergement : Europe (europe-west1)
  - Conformité : RGPD via Google Cloud DPA
- **GitHub Pages** : code source statique (pas de données utilisateur)

### 5.4 Sous-traitants

| Sous-traitant | Service | Pays |
|---------------|---------|------|
| Google (Firebase) | Stockage données | UE (europe-west1) |
| Anthropic | API IA Claude | États-Unis (clauses contractuelles types) |
| Cloudflare | CDN + Worker | International |
| GitHub | Hébergement code | International |

### 5.5 Droits de l'Utilisateur

L'Utilisateur dispose des droits :
- **Accès** : consulter ses données (vue `vRGPD`)
- **Rectification** : modifier son profil
- **Effacement** : supprimer compte + toutes données
- **Limitation** : suspendre traitement
- **Portabilité** : export JSON
- **Opposition** : refuser traitement automatisé
- **Retrait consentement** : à tout moment

Pour exercer ces droits : kevin.desarzens@gmail.com.

### 5.6 Délai de réponse

L'Éditeur s'engage à répondre sous **30 jours** maximum aux demandes RGPD (réduit à 72h pour suppression compte critique).

## Article 6 — Propriété intellectuelle

### 6.1 Propriété de l'Éditeur

L'Application Apex AI, son code, son design, sa marque, ses studios, ses prompts système, sont la propriété exclusive de Kevin DESARZENS.

### 6.2 Contenu généré par l'Utilisateur

L'Utilisateur reste propriétaire des contenus qu'il crée (notes, conversations, fichiers uploadés).

### 6.3 Licence d'utilisation

L'Utilisateur dispose d'une licence personnelle, non-exclusive, non-cessible, pour utiliser l'Application dans le cadre des présentes CGU.

## Article 7 — Obligations de l'Utilisateur

L'Utilisateur s'engage à :
- Ne pas utiliser l'Application à des fins illégales
- Ne pas tenter de contourner les mécanismes de sécurité
- Ne pas surcharger l'infrastructure (rate limit respecté)
- Ne pas usurper l'identité d'un tiers
- Respecter les autres utilisateurs (chat, service client)

## Article 8 — Limitations de responsabilité

### 8.1 Conseils non-professionnels

Apex AI fournit des informations à titre indicatif. Pour des décisions importantes (médical, juridique, fiscal), l'Utilisateur DOIT consulter un professionnel qualifié.

### 8.2 Disponibilité du service

L'Éditeur s'engage à une disponibilité raisonnable mais ne garantit pas un service 100/100 (maintenance, mises à jour, indisponibilité fournisseurs tiers).

### 8.3 Limitation contractuelle

[À DÉFINIR avec avocat — montant maximum responsabilité]

## Article 9 — Service client

### 9.1 Canal officiel

Service client via WhatsApp Kevin (numéro : [À AJOUTER]) ou email : kevin.desarzens@gmail.com.

### 9.2 Délai de réponse

- Questions standard : **24h ouvrées**
- Urgences sécurité (données compromises) : **2h**
- Demandes RGPD : **30 jours**

### 9.3 Automatisation IA

Une partie des réponses est générée par Apex IA puis validée par Kevin (système de validation manuelle 1-tap).

## Article 10 — Tarifs et paiement

### 10.1 Forfaits

[À DÉFINIR avec Kevin/avocat]

### 10.2 Modes de paiement

- Stripe (cartes bancaires)
- PayPal
- Crypto (BTC/ETH si activé)
- IBAN virement (clients pro)

### 10.3 Facturation

Factures émises automatiquement via Apex (Studio Facture). Paiement immédiat ou 30 jours selon contrat.

### 10.4 Remboursement

[À DÉFINIR]

## Article 11 — Résiliation

### 11.1 Par l'Utilisateur

À tout moment via fonction `axDeleteAccountTotal` (suppression complète sous 72h).

### 11.2 Par l'Éditeur

L'Éditeur peut suspendre/résilier un compte en cas de violation des CGU, après notification email avec 7 jours de préavis (sauf urgence sécurité).

## Article 12 — Modification des CGU

L'Éditeur se réserve le droit de modifier les CGU. Notification par email + modal acceptation 30 jours avant prise d'effet. Refus → résiliation amiable.

## Article 13 — Litiges

### 13.1 Loi applicable

Les présentes CGU sont régies par la loi monégasque (Kevin résidant Monaco, casino SBM) ou française [à préciser avec avocat].

### 13.2 Résolution amiable

Tout litige sera d'abord soumis à une tentative de résolution amiable.

### 13.3 Tribunal compétent

À défaut, [Tribunal de Monaco / France à préciser avec avocat].

## Article 14 — Contact

- **Email** : kevin.desarzens@gmail.com
- **WhatsApp** : [À AJOUTER]
- **Adresse postale** : [À AJOUTER avec avocat]

---

**Document à valider par avocat Kevin avant mise en production.**

**À ne PAS publier en l'état — placeholder uniquement.**
