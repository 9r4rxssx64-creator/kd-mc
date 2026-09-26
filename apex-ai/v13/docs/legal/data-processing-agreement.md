# Data Processing Agreement (DPA) — Apex AI

**Version :** v13.0.82
**Date d'effet :** 2026-05-04
**Conformité :** RGPD Article 28 (Règlement (UE) 2016/679)

---

## Préambule

Le présent Data Processing Agreement (« DPA ») est conclu entre :

- **Le Responsable du traitement** : le Client professionnel souscrivant à un plan B2B Apex AI (Pro, Business, Enterprise), ci-après « le Client » ;
- **Le Sous-traitant** : Apex AI, édité par Kevin DESARZENS, Monaco, ci-après « Apex AI ».

Conformément à l'Article 28 du Règlement (UE) 2016/679 (RGPD), le présent DPA encadre le traitement de données personnelles effectué par Apex AI pour le compte du Client.

## Article 1 — Définitions

Les termes utilisés dans le présent DPA ont la signification qui leur est attribuée dans le RGPD. Notamment :
- **Données à caractère personnel** : toute information se rapportant à une personne physique identifiée ou identifiable.
- **Traitement** : toute opération effectuée sur des données.
- **Sous-traitance** : traitement effectué pour le compte du responsable du traitement.

## Article 2 — Objet et durée

### 2.1 Objet
Apex AI traite les données personnelles communiquées par le Client (utilisateurs finaux du Client : employés, clients du Client, etc.) aux seules fins d'exécution des prestations contractuelles.

### 2.2 Durée
Le présent DPA prend effet à la date de souscription au plan B2B et reste en vigueur tant que les prestations Apex AI sont fournies au Client. À l'issue, application de l'Article 11 (Restitution / suppression).

## Article 3 — Description des traitements

### 3.1 Nature et finalité
- Hébergement et stockage de données utilisateur final (chat IA, documents, profils).
- Fourniture de fonctionnalités IA (Claude, GPT, Gemini).
- Authentification et gestion des comptes.
- Analytics anonymisés (intérêt légitime du Client).
- Notifications push et email transactionnels.

### 3.2 Catégories de personnes concernées
- Employés du Client.
- Clients/prospects du Client.
- Contacts du Client.

### 3.3 Catégories de données
- Identification (nom, prénom, email professionnel).
- Coordonnées professionnelles.
- Contenu des conversations IA.
- Documents uploadés.
- Logs technique (IP, user-agent).
- Données de paiement (gérées par Stripe, pas stockées par Apex AI).

### 3.4 Catégories de données sensibles (Article 9 RGPD)
Par défaut, **aucune donnée sensible** n'est traitée. Si le Client souhaite traiter des données de santé, biométriques, ou autres catégories particulières, un avenant spécifique est requis.

## Article 4 — Obligations d'Apex AI

Apex AI s'engage à :

### 4.1 Traiter les données uniquement sur instruction documentée
Conformément aux finalités décrites ci-dessus et aux instructions écrites du Client.

### 4.2 Garantir la confidentialité
Toute personne accédant aux données est tenue à un engagement de confidentialité (NDA interne, formation RGPD).

### 4.3 Mesures de sécurité (Article 32 RGPD)
- Chiffrement des données au repos (AES-GCM 256) et en transit (TLS 1.3).
- Pseudonymisation quand applicable.
- Tests réguliers d'efficacité (audits sécurité, pen-testing annuel).
- Gestion des incidents (plan de réponse <72h).
- Authentification forte (WebAuthn, MFA).
- Sentinelles continues anti-intrusion.

### 4.4 Sous-traitance ultérieure (Article 28.2)
Apex AI utilise les sous-traitants suivants :

| Sous-traitant | Service | Localisation |
|---------------|---------|--------------|
| Anthropic Inc. | API Claude | États-Unis (CCT) |
| OpenAI LLC | API GPT (failover) | États-Unis (CCT) |
| Google LLC | Gemini, Firebase, Cloud | EU (europe-west1) + CCT |
| Stripe Inc. | Paiements | Irlande |
| Cloudflare Inc. | CDN, Workers | EU + global |

Le Client est informé en cas d'ajout/remplacement de sous-traitant avec préavis 30 jours et droit d'opposition.

### 4.5 Coopération aux droits des personnes
Apex AI assiste le Client dans le respect des droits des personnes concernées (accès, rectification, effacement, portabilité, opposition).

### 4.6 Notification des violations (Article 33-34)
- Notification au Client dans **48 heures** maximum après détection.
- Inclut : nature, catégories/nombre de personnes touchées, mesures prises.
- Apex AI notifie elle-même la CNIL si la violation concerne ses propres systèmes (sous 72h).

### 4.7 Analyse d'impact (AIPD, Article 35)
Apex AI fournit au Client toute information nécessaire à la réalisation d'une AIPD.

### 4.8 Audits du Client
Le Client peut demander à auditer Apex AI (sur place ou documentaire) une fois par an, avec préavis 30 jours, à ses frais.

### 4.9 Rapports de conformité
Apex AI fournit annuellement :
- Rapport de conformité RGPD.
- Liste des sous-traitants à jour.
- Rapport d'audit sécurité.
- Registre des activités de traitement (Article 30).

## Article 5 — Obligations du Client

Le Client garantit :
- Le respect du RGPD pour les données qu'il transmet à Apex AI.
- L'obtention des consentements nécessaires auprès des personnes concernées.
- La fourniture d'une politique de confidentialité aux utilisateurs finaux.
- L'absence de données illégales ou non autorisées.
- La désignation d'un point de contact RGPD interne.

## Article 6 — Transfert hors UE

### 6.1 Mécanismes garantissant un niveau de protection adéquat
Pour les sous-traitants américains (Anthropic, OpenAI, Stripe, GitHub) : Clauses Contractuelles Types (CCT) adoptées par la Décision (UE) 2021/914 de la Commission européenne.

### 6.2 Mesures complémentaires
- Chiffrement systématique en transit (TLS 1.3) et au repos (AES-256).
- Pseudonymisation des données envoyées aux providers IA.
- Audit annuel des sous-traitants.

### 6.3 Suspension transferts
En cas de décision européenne invalidant les CCT, le Client peut suspendre les transferts ou résilier sans pénalité.

## Article 7 — Hébergement EU (option Enterprise)

Pour les Clients Enterprise, Apex AI propose un hébergement strictement EU (Firebase europe-west1, Cloudflare EU, providers IA EU uniquement quand disponibles). Les données ne quittent pas l'UE.

## Article 8 — Responsabilité

### 8.1 Apex AI
Responsable conformément à l'Article 82 RGPD pour les dommages causés par un traitement non conforme au présent DPA.

### 8.2 Plafond
La responsabilité d'Apex AI est plafonnée aux montants prévus dans les CGV (12 mois sommes versées), hormis cas de violations graves (négligence, faute intentionnelle).

### 8.3 Garantie
Apex AI garantit le Client contre les recours de personnes concernées si la violation provient de manquements d'Apex AI au DPA.

## Article 9 — Assurance

Apex AI dispose d'une assurance responsabilité civile professionnelle couvrant les risques liés à la protection des données personnelles. Attestation fournie sur demande.

## Article 10 — Droits du Responsable de traitement

Le Client peut à tout moment :
- Auditer Apex AI (Article 4.8).
- Modifier les instructions de traitement.
- Demander une copie des données.
- Suspendre les traitements en cas de violation grave.
- Résilier le contrat avec préavis 30 jours.

## Article 11 — Restitution / suppression à la fin

À la fin du contrat, sur instruction du Client :
- **Option A** : Restitution complète des données (export JSON portable + documents).
- **Option B** : Suppression définitive (cascade localStorage + Firebase + IndexedDB).
- Confirmation écrite de l'opération choisie sous 30 jours.
- Audit log immutable conservé 5 ans (obligation légale).

## Article 12 — Droit applicable et juridiction

Le présent DPA est régi par le droit français. Tout litige sera soumis au Tribunal de Commerce de Nice (France), sauf application des règles de juridiction protectrices du Client B2C.

## Article 13 — Entrée en vigueur

Le présent DPA entre en vigueur dès la souscription du Client à un plan B2B Apex AI. Une copie signée peut être demandée à kevin.desarzens@gmail.com.

## Annexes

- **Annexe 1** : Mesures techniques et organisationnelles (TOMs)
- **Annexe 2** : Liste à jour des sous-traitants
- **Annexe 3** : Plan de réponse aux incidents

---

*DPA conforme RGPD Article 28 + Lignes directrices CEPD 07/2020 + CCT Décision (UE) 2021/914.*
