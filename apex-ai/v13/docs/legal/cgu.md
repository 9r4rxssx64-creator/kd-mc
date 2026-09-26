# Conditions Générales d'Utilisation (CGU) — Apex AI

**Version :** v13.0.82
**Dernière mise à jour :** 2026-05-04
**Éditeur :** Kevin DESARZENS
**Contact :** kevin.desarzens@gmail.com

---

## Article 1 — Objet

Les présentes Conditions Générales d'Utilisation (CGU) ont pour objet de définir les modalités et les conditions d'utilisation du service Apex AI (ci-après "le Service"), accessible à l'adresse https://9r4rxssx64-creator.github.io/CMCteams/apex-ai/.

Apex AI est une application web progressive (PWA) d'assistance personnelle propulsée par intelligence artificielle, offrant des fonctionnalités de chat IA, de gestion de coffre-fort numérique, de studios créatifs et de modules pro.

## Article 2 — Acceptation des CGU

L'utilisation du Service implique l'acceptation pleine et entière des présentes CGU. L'Utilisateur reconnaît avoir pris connaissance des CGU et les avoir acceptées en cochant la case prévue à cet effet lors de la création de son compte.

## Article 3 — Définitions

- **Service** : la plateforme Apex AI dans son ensemble.
- **Utilisateur** : toute personne physique ayant créé un compte sur le Service.
- **Contenu** : toute donnée, information, message, document, image, fichier audio ou vidéo créé, téléchargé ou stocké via le Service.
- **Compte** : espace personnel et sécurisé attribué à chaque Utilisateur.

## Article 4 — Inscription et compte

### 4.1 Conditions d'inscription
L'inscription est ouverte aux personnes physiques majeures (18 ans+) ou mineures avec autorisation parentale (16-17 ans). Les données fournies doivent être exactes, complètes et tenues à jour.

### 4.2 Sécurité du compte
L'Utilisateur s'engage à conserver confidentiels son identifiant et son code PIN (chiffré PBKDF2 200k itérations + AES-GCM 256). Toute utilisation du Service avec les identifiants de l'Utilisateur est réputée faite par lui.

### 4.3 Authentification
- PIN (code à 4-6 chiffres minimum) avec rate-limit progressif anti-brute force.
- WebAuthn (FaceID, TouchID, YubiKey) en option.
- Reconnaissance vocale (voiceprint) en option, stocké strictement local (FB_LOCAL).

## Article 5 — Description du Service

### 5.1 Fonctionnalités principales
- Chat IA multi-modèles (Claude, GPT-4, Gemini, Groq) avec failover automatique.
- Coffre-fort numérique chiffré (AES-GCM 256, PBKDF2 200k).
- 10 Studios créatifs (Musique, Vidéo, CV, Facture, Contrat, Présentation, Logo, Architecture, Préfecture, Photo).
- 8 Modules pro (Légal, Finance, Médical, Cuisine, Traduction, Architecture, Business, Education).
- Synchronisation cross-device via Firebase Realtime Database (chiffrement E2E pour secrets).
- Reconnaissance OCR, scan QR codes, dictée vocale.
- Notifications push (PWA).

### 5.2 Disponibilité
Le Service est accessible 24h/24 et 7j/7, sauf interruption pour maintenance programmée ou cas de force majeure. Apex AI n'offre aucune garantie de disponibilité absolue.

## Article 6 — Obligations de l'Utilisateur

L'Utilisateur s'engage à :
- Utiliser le Service conformément à sa finalité (assistance personnelle/professionnelle).
- Ne pas utiliser le Service à des fins illégales, frauduleuses ou portant atteinte aux droits de tiers.
- Ne pas tenter d'accéder de manière non autorisée aux systèmes du Service.
- Ne pas diffuser de contenus illicites, diffamatoires, violents, pornographiques, racistes ou contraires à l'ordre public.
- Ne pas utiliser le Service pour de la prospection commerciale non sollicitée (spam).
- Respecter les droits de propriété intellectuelle.

## Article 7 — Propriété intellectuelle

### 7.1 Service
Le Service, sa structure, son design, ses textes, sa marque et ses logos sont protégés par le droit d'auteur et le droit des marques. Toute reproduction non autorisée est interdite.

### 7.2 Contenus Utilisateur
L'Utilisateur reste propriétaire des contenus qu'il publie. Il accorde toutefois à Apex AI une licence non-exclusive d'utilisation desdits contenus aux seules fins d'exploitation du Service (stockage, affichage, traitement IA).

### 7.3 Contenus IA
Les réponses générées par l'IA sont fournies à titre informatif. L'Utilisateur reste responsable de leur utilisation et de leur vérification.

## Article 8 — Données personnelles

Le traitement des données personnelles est régi par notre [Politique de Confidentialité](privacy-policy.md), conforme au RGPD (Règlement (UE) 2016/679) et à la Loi Informatique et Libertés.

## Article 9 — Limitation de responsabilité

### 9.1 IA — Avertissement
Les réponses générées par l'IA ne constituent pas des conseils professionnels (juridiques, médicaux, financiers, fiscaux). L'Utilisateur reconnaît que l'IA peut produire des erreurs (hallucinations) et s'engage à vérifier les informations critiques.

### 9.2 Limitations
Apex AI ne saurait être tenu responsable :
- Des dommages indirects (perte de données, manque à gagner).
- Des indisponibilités du Service liées aux fournisseurs tiers (Anthropic, OpenAI, Firebase, etc.).
- De l'utilisation des contenus IA par l'Utilisateur.
- Des actes de tiers (hacking, phishing) malgré les mesures de sécurité.

### 9.3 Plafond
La responsabilité maximale d'Apex AI est limitée au montant des sommes versées par l'Utilisateur au cours des 12 derniers mois.

## Article 10 — Modification des CGU

Apex AI se réserve le droit de modifier les CGU à tout moment. Les Utilisateurs seront notifiés par email et bandeau dans l'application au moins 30 jours avant l'entrée en vigueur des modifications.

## Article 11 — Suspension et résiliation

### 11.1 Par l'Utilisateur
L'Utilisateur peut résilier son compte à tout moment via Réglages → Mes données RGPD → Supprimer mon compte. Suppression cascade (localStorage + Firebase + IndexedDB) sous 72h.

### 11.2 Par Apex AI
Apex AI peut suspendre ou résilier le compte d'un Utilisateur en cas de :
- Violation des CGU.
- Utilisation frauduleuse.
- Non-paiement (offre payante).
- Inactivité prolongée (>24 mois).

## Article 12 — Droit applicable et juridiction

Les présentes CGU sont régies par le droit français. Tout litige relatif à l'interprétation ou l'exécution des CGU sera soumis aux tribunaux compétents de Monaco/Nice (France) ou du lieu de domicile du consommateur.

## Article 13 — Médiation

Conformément aux articles L611-1 et suivants du Code de la consommation, l'Utilisateur peut recourir gratuitement au service de médiation MEDICYS (https://www.medicys.fr) en cas de litige non résolu amiablement.

## Article 14 — Contact

Pour toute question relative aux CGU :
- Email : kevin.desarzens@gmail.com
- Adresse : Monaco

---

*Document généré automatiquement — révision continue selon évolution réglementaire EU.*
