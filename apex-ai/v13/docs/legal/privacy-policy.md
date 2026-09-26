# Politique de Confidentialité — Apex AI

**Version :** v13.0.82
**Dernière mise à jour :** 2026-05-04
**Conformité :** RGPD (Règlement (UE) 2016/679), Loi Informatique et Libertés (modifiée), Directive ePrivacy 2002/58/CE

---

## 1. Identité du responsable du traitement

**Responsable du traitement :**
- Nom : Kevin DESARZENS
- Statut : Éditeur Apex AI
- Adresse : Monaco
- Email : kevin.desarzens@gmail.com
- Téléphone : sur demande via email

**Délégué à la Protection des Données (DPO) :**
- Email : kevin.desarzens@gmail.com (assure les fonctions de DPO interne)

## 2. Données collectées

### 2.1 Catégories de données

| Catégorie | Exemples | Source |
|-----------|----------|--------|
| **Identification** | Nom, prénom, email, photo de profil | Inscription |
| **Authentification** | PIN haché (PBKDF2 200k), tokens WebAuthn, voiceprint | Inscription, login |
| **Profil** | Préférences langue, thème, fuseau horaire | Réglages |
| **Contenu** | Messages chat, documents uploadés, notes, rappels | Utilisation |
| **Technique** | Logs connexion, IP, user-agent, session ID | Automatique |
| **Paiement** | Email facturation, IBAN, historique factures (montants) | Souscription |
| **Biométrique** | Voiceprint MFCC features (option) | Enrôlement vocal |
| **Localisation** | GPS approximatif (option, pour météo/services locaux) | Permission user |

### 2.2 Données NON collectées
- Numéros de carte bancaire complets (gérés par Stripe)
- Mots de passe en clair
- Fichiers vault (chiffrés AES-GCM 256 client-side, Apex ne possède pas la clé)
- Conversations chat IA privées (chiffrées E2E si Plan Pro+)

## 3. Finalités du traitement

| Finalité | Base légale (Art. 6 RGPD) | Données concernées |
|----------|--------------------------|--------------------|
| Authentification utilisateur | Exécution contrat (6.1.b) | Identification, auth |
| Fourniture du service IA | Consentement (6.1.a) | Messages, contexte |
| Facturation et comptabilité | Obligation légale (6.1.c) | Paiement, identité |
| Sécurité (anti-fraude, audit) | Intérêt légitime (6.1.f) | Logs technique, IP |
| Notifications service | Exécution contrat (6.1.b) | Email, push tokens |
| Amélioration du service | Intérêt légitime (6.1.f) | Logs anonymisés |
| Marketing / newsletter | Consentement (6.1.a) | Email (opt-in) |

## 4. Sous-traitants et destinataires

### 4.1 Sous-traitants techniques (Article 28 RGPD)

| Sous-traitant | Finalité | Localisation | Garanties |
|---------------|----------|--------------|-----------|
| **Anthropic Inc.** | API IA Claude | États-Unis | Clauses contractuelles types EU 2021/914 |
| **OpenAI LLC** | API IA GPT (failover) | États-Unis | DPA + CCT |
| **Google LLC (Gemini)** | API IA Gemini (failover) | États-Unis/EU | DPA Google Cloud |
| **Google LLC (Firebase)** | Realtime Database, Auth | EU (europe-west1) | DPA Google + CCT |
| **Stripe Inc.** | Paiements | Irlande (Europe) | PCI-DSS + DPA |
| **Cloudflare Inc.** | CDN, Workers proxy | EU principalement | DPA + CCT |
| **GitHub Inc.** | Hébergement code source | États-Unis | DPA Microsoft |
| **Sentry / Bugsnag** | Suivi erreurs | EU (selfhosted) | RGPD natif |

### 4.2 Transfert hors EU
Pour les sous-traitants US (Anthropic, OpenAI, Stripe, GitHub) : transfert encadré par les **Clauses Contractuelles Types** adoptées par la Commission européenne (Décision 2021/914), complétées par mesures techniques (chiffrement, pseudonymisation).

L'Utilisateur peut consulter le détail des sous-traitants dans Réglages → RGPD → Sous-traitants.

### 4.3 Pas de cession à des tiers
Apex AI ne vend, loue, ni partage les données utilisateur à des tiers à des fins commerciales/marketing.

## 5. Durée de conservation

| Catégorie | Durée | Justification |
|-----------|-------|---------------|
| Compte actif | Tant que compte ouvert | Contrat |
| Données après clôture | 30 jours (corbeille) puis suppression | Sécurité + délai recovery |
| Audit log immutable | 5 ans | Obligation légale (Art. 30 RGPD) |
| Factures | 10 ans | Obligation comptable (Art. L123-22 Code commerce) |
| Logs technique | 12 mois | Sécurité (intérêt légitime) |
| Conversations IA | 90 jours par défaut, configurable | Performance + opt-out possible |
| Backups Firebase | 7 jours rolling | Récupération données |

## 6. Droits des utilisateurs (RGPD Art. 15-22)

L'Utilisateur dispose des droits suivants, exerçables via Réglages → Mes données RGPD ou par email à kevin.desarzens@gmail.com :

### 6.1 Droit d'accès (Art. 15)
Obtenir copie complète des données traitées au format JSON portable (export 1-clic dans l'app).

### 6.2 Droit de rectification (Art. 16)
Corriger des données inexactes ou incomplètes via Réglages → Profil.

### 6.3 Droit à l'effacement / "droit à l'oubli" (Art. 17)
Suppression cascade complète : localStorage + Firebase + IndexedDB + audit log final immutable. Délai 72h.

### 6.4 Droit à la limitation (Art. 18)
Geler le traitement (mode lecture seule) pendant contestation/litige.

### 6.5 Droit à la portabilité (Art. 20)
Export structuré JSON conforme JSON Schema standard pour réutilisation chez autre prestataire.

### 6.6 Droit d'opposition (Art. 21)
Refus traitement basé sur intérêt légitime (statistiques, marketing). Cf. Réglages → RGPD.

### 6.7 Droit de ne pas faire l'objet d'une décision automatisée (Art. 22)
Apex AI utilise des décisions automatisées uniquement pour : suggestions IA (transparentes), suggestions de complétion (non-engageantes). L'Utilisateur peut s'y opposer.

### 6.8 Droit de retirer son consentement (Art. 7.3)
À tout moment, sans affecter la licéité du traitement antérieur.

### 6.9 Délai de réponse
Apex AI s'engage à répondre dans **30 jours maximum** (extensible 60 jours si demande complexe, avec notification).

### 6.10 Recours CNIL
En cas de désaccord, l'Utilisateur peut introduire une réclamation auprès de la CNIL :
- Site : https://www.cnil.fr/fr/plaintes
- Adresse : 3 Place de Fontenoy, 75007 Paris
- Téléphone : 01 53 73 22 22

## 7. Sécurité des données

### 7.1 Mesures techniques
- Chiffrement AES-GCM 256 bits pour le coffre.
- PBKDF2 200 000 itérations pour PIN.
- TLS 1.3 pour transports.
- Rate-limiting auth progressif (5/30s → 24h).
- WebAuthn (FaceID/TouchID/YubiKey).
- Audit log immutable (hash chain).
- Sentinelles continues anti-intrusion.
- Bug bounty programme (sur demande).

### 7.2 Mesures organisationnelles
- Accès aux données restreint (admin Kevin uniquement).
- Formation sécurité continue.
- Plan de réponse incident (notif CNIL <72h en cas de fuite).
- Sauvegardes quotidiennes chiffrées.

### 7.3 Notification incident
Conformément à l'Art. 33 RGPD, Apex AI notifiera la CNIL dans les 72h en cas de violation, et informera les utilisateurs concernés sans délai si risque élevé pour leurs droits/libertés.

## 8. Cookies et traceurs

Cf. [Politique cookies](cookie-policy.md) pour le détail.

Catégories utilisées :
- **Essentiels** (sans consentement) : session, sécurité, panier abonnement
- **Préférences** (consentement) : thème, langue
- **Analytics** (consentement) : statistiques anonymisées
- **Marketing** (consentement) : non utilisés actuellement

## 9. Mineurs

Le Service est ouvert aux mineurs 16-17 ans avec autorisation parentale. Pour les <16 ans : interdiction explicite (consentement parental requis selon RGPD Art. 8).

Si Apex AI prend connaissance qu'un mineur <16 ans s'est inscrit sans autorisation, le compte est suspendu et les données effacées.

## 10. Décisions automatisées et profilage

### 10.1 IA assistante
Les suggestions IA (chat, complétion, recommandations) sont des décisions automatisées non-engageantes. L'Utilisateur garde le contrôle final.

### 10.2 Aucun scoring individuel
Apex AI n'effectue **aucun profilage** à des fins de scoring crédit, assurance, emploi ou discrimination.

### 10.3 Opt-out
L'Utilisateur peut s'opposer au profilage IA via Réglages → RGPD → Opposition profilage automatisé.

## 11. Modifications de la politique

Apex AI se réserve le droit de modifier la présente politique. Les modifications substantielles seront notifiées par email + bandeau application 30 jours avant entrée en vigueur.

## 12. Contact

- **DPO Apex AI** : kevin.desarzens@gmail.com
- **Adresse postale** : Monaco (sur demande)
- **CNIL** : https://www.cnil.fr

---

*Politique conforme RGPD 2018 + Loi Informatique et Libertés modifiée 2018 + LIL 2024 + Directive ePrivacy 2002/58/CE.*
